// src/workers/detectors/duplicateLogic.ts
import { TSESTree } from '@typescript-eslint/typescript-estree';
import { Issue, ParsedFile, walk, lineOf, endLineOf, parseFile } from '../analysis.worker';

interface FuncInfo {
  name: string;
  line: number;
  endLine: number;
  filePath: string;
  fileName: string;
  signature: string[];
  code: string;
}

export function detectDuplicateLogic(pf: ParsedFile, files: Map<string, string>): Issue[] {
  const issues: Issue[] = [];
  const currentFuncs: FuncInfo[] = [];

  // 1. Gather all functions in the current file
  gatherFunctions(pf, currentFuncs);

  if (currentFuncs.length === 0) return issues;

  // 2. Parse functions in all other files (only if filePath comes after in lexicographical order to prevent duplicates)
  const otherFuncs: FuncInfo[] = [];
  for (const [otherPath, otherContent] of files.entries()) {
    if (otherPath === pf.filePath) continue;
    // Lexicographical ordering constraint to deduplicate cross-file findings
    if (pf.filePath >= otherPath) continue;

    const otherParsed = parseFile(otherPath, otherContent);
    if (!otherParsed) continue;

    gatherFunctions(otherParsed, otherFuncs);
  }

  // 3. Compare current file functions with other file functions
  for (const f1 of currentFuncs) {
    // Skip small or trivial functions
    if (f1.signature.length < 3 || (f1.endLine - f1.line) < 4) continue;

    for (const f2 of otherFuncs) {
      if (f2.signature.length < 3 || (f2.endLine - f2.line) < 4) continue;

      const sim = getSimilarity(f1.signature, f2.signature);
      if (sim >= 0.8) {
        const lineText = pf.lines.slice(f1.line - 1, f1.endLine).join('\n');
        const suggestText = `// Lógica duplicada detetada com ${f2.fileName}. Move para src/utils/shared.ts\n` +
          `// export function ${f1.name || 'sharedHelper'}() { ... }`;

        issues.push({
          id: `duplicate-logic-${pf.filePath}-${f1.line}-${f2.fileName}-${f2.line}`,
          file: pf.fileName,
          filePath: pf.filePath,
          category: 'duplicate-logic',
          problem: `Lógica duplicada detetada: a função \`${f1.name || 'anónima'}\` é 80%+ similar à função \`${f2.name || 'anónima'}\` em \`${f2.fileName}\`. Move para um utilitário partilhado`,
          impact: 'Medium',
          lineStart: f1.line,
          lineEnd: f1.endLine,
          lines: { before: lineText.split('\n'), after: [suggestText] },
          patch: { before: lineText, after: suggestText },
        });
      }
    }
  }

  return issues;
}

function gatherFunctions(parsed: ParsedFile, list: FuncInfo[]) {
  walk(parsed.ast, {
    FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
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
    VariableDeclarator(node: TSESTree.VariableDeclarator) {
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

function buildSignature(funcNode: TSESTree.Node): string[] {
  const features: string[] = [];

  // Number of parameters
  const params = (funcNode as any).params || [];
  features.push(`params:${params.length}`);

  // Collect operations inside
  walk(funcNode, {
    CallExpression(node: TSESTree.CallExpression) {
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
    BinaryExpression(node: TSESTree.BinaryExpression) {
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
