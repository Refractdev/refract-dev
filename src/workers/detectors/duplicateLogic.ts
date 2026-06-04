import { Issue, ParsedFile, walk, lineOf, endLineOf } from '../../lib/analyze';

interface FuncInfo {
  name: string;
  line: number;
  endLine: number;
  filePath: string;
  fileName: string;
  signature: string[];
  code: string;
}

const MAX_FUNC_COMPARE = 50_000; // bail if we'd exceed this many comparisons

export function detectDuplicateLogic(parsedCache: Map<string, ParsedFile>): Issue[] {
  const issues: Issue[] = [];
  const allFuncs: FuncInfo[] = [];

  // 1. Gather all functions across all files
  for (const pf of parsedCache.values()) {
    gatherFunctions(pf, allFuncs);
  }

  console.log('[duplicateLogic] Collected', allFuncs.length, 'functions across', parsedCache.size, 'files');

  const candidates = allFuncs.filter(f => f.signature.length >= 3 && (f.endLine - f.line) >= 4);
  const n = candidates.length;
  const totalComparisons = (n * (n - 1)) / 2;

  if (totalComparisons > MAX_FUNC_COMPARE) {
    console.warn(`[duplicateLogic] Skipping: ${totalComparisons} comparisons would exceed limit of ${MAX_FUNC_COMPARE}`);
    return issues;
  }

  let comparisons = 0;

  // 2. Compare every pair of functions once
  for (let i = 0; i < n; i++) {
    const f1 = candidates[i];

    for (let j = i + 1; j < n; j++) {
      comparisons++;
      const f2 = candidates[j];

      const sim = getSimilarity(f1.signature, f2.signature);
      const threshold = f1.filePath === f2.filePath ? 0.75 : 0.8;
      if (sim >= threshold) {
        const isSameFile = f1.filePath === f2.filePath;

        const suggestText = isSameFile
          ? `// Lógica duplicada detetada no mesmo ficheiro.\n` +
            `// As funções \`${f1.name || 'anónima'}\` e \`${f2.name || 'anónima'}\` têm estrutura idêntica.\n` +
            `// Extrai para uma função partilhada no mesmo ficheiro ou em src/utils/shared.ts\n` +
            `// function ${f1.name || 'sharedHelper'}(...args) { ... }`
          : `// Lógica duplicada detetada com ${f2.fileName}.\n` +
            `// Move para src/utils/shared.ts\n` +
            `// export function ${f1.name || 'sharedHelper'}() { ... }`;

        issues.push({
          id: `duplicate-logic-${f1.filePath}-${f1.line}-${isSameFile ? 'same' : f2.fileName}-${f2.line}`,
          file: f1.fileName,
          filePath: f1.filePath,
          category: 'duplicate-logic',
          problem: isSameFile
            ? `Lógica duplicada no mesmo ficheiro: \`${f1.name || 'anónima'}\` e \`${f2.name || 'anónima'}\` são ${Math.round(sim * 100)}% similares. Extrai para uma função partilhada`
            : `Lógica duplicada com \`${f2.fileName}\`: \`${f1.name || 'anónima'}\` é ${Math.round(sim * 100)}% similar a \`${f2.name || 'anónima'}\`. Move para um utilitário partilhado`,
          impact: 'Medium',
          lineStart: f1.line,
          lineEnd: f1.endLine,
          lines: { before: f1.code.split('\n'), after: [suggestText] },
          patch: { before: f1.code, after: suggestText },
        });
      }
    }
  }

  console.log('[duplicateLogic] Performed', comparisons, 'comparisons, found', issues.length, 'issues');
  return issues;
}

function gatherFunctions(parsed: ParsedFile, list: FuncInfo[]) {
  walk(parsed.ast, {
    FunctionDeclaration(node: any) {
      const start = lineOf(node);
      const end = endLineOf(node);
      list.push({
        name: node.id?.name ?? '',
        line: start,
        endLine: end,
        filePath: parsed.filePath,
        fileName: parsed.fileName,
        signature: buildSignature(node),
        code: parsed.lines.slice(start - 1, end).join('\n'),
      });
    },
    VariableDeclarator(node: any) {
      if (
        node.id.type === 'Identifier' &&
        node.init &&
        (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
      ) {
        const start = lineOf(node);
        const end = endLineOf(node);
        list.push({
          name: node.id.name,
          line: start,
          endLine: end,
          filePath: parsed.filePath,
          fileName: parsed.fileName,
          signature: buildSignature(node.init),
          code: parsed.lines.slice(start - 1, end).join('\n'),
        });
      }
    },
  });
}

function buildSignature(funcNode: any): string[] {
  const features: string[] = [];

  // Number of parameters
  const params = (funcNode as any).params || [];
  features.push(`params:${params.length}`);

  // Collect operations inside
  walk(funcNode, {
    CallExpression(node: any) {
      if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
        const prop = node.callee.property.name;
        if (['map', 'filter', 'reduce', 'forEach', 'find', 'push', 'slice', 'some', 'every'].includes(prop)) {
          features.push(`array:${prop}`);
        }
        if (['replace', 'split', 'trim', 'toLowerCase', 'toUpperCase', 'substring', 'includes', 'indexOf'].includes(prop)) {
          features.push(`string:${prop}`);
        }
      }
    },
    BinaryExpression(node: any) {
      if (['+', '-', '*', '/'].includes(node.operator)) {
        features.push(`arithmetic:${node.operator}`);
      }
    },
  });

  return features.sort();
}

function getSimilarity(sig1: string[], sig2: string[]): number {
  if (sig1.length === 0 && sig2.length === 0) return 0;
  const set1 = new Set(sig1);
  const set2 = new Set(sig2);
  let intersect = 0;
  for (const item of set1) {
    if (set2.has(item)) intersect++;
  }
  const union = new Set([...sig1, ...sig2]).size;
  return intersect / union;
}
