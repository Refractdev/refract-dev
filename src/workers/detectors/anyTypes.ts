// src/workers/detectors/anyTypes.ts
import { TSESTree } from '@typescript-eslint/typescript-estree';
import { Issue, ParsedFile, walk, lineOf } from '../analysis.worker';

export function detectAnyTypes(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<number>();

  function inferType(node: TSESTree.Node, name: string): string | null {
    const parent = (node as any).parent;
    if (!parent) return null;
    if (parent.type === 'MemberExpression' && parent.property.type === 'Identifier') {
      const prop = parent.property.name;
      if (prop === 'length') return 'string | any[]';
      if (prop === 'map') return 'Array<unknown>';
      if (['id', 'name', 'email'].includes(prop)) {
        return `${name.charAt(0).toUpperCase() + name.slice(1)}Interface`;
      }
    }
    if (parent.type === 'CallExpression' && parent.callee.type === 'Identifier' && parent.callee.name === 'JSON.parse') {
      return 'string';
    }
    if (parent.type === 'ReturnStatement') {
      return 'Promise<unknown>';
    }
    return null;
  }

  walk(pf.ast, {
    TSAnyKeyword(node: TSESTree.TSAnyKeyword) {
      const line = lineOf(node);
      if (seen.has(line)) return;
      seen.add(line);
      const lineText = pf.lines[line - 1] ?? '';

      let inferred = null as string | null;
      const parent = (node as any).parent;
      if (parent && parent.type === 'TSTypeAnnotation' && parent.parent) {
        if (parent.parent.type === 'Identifier') {
          inferred = inferType(parent.parent, parent.parent.name);
        }
      }

      const suggestion = inferred ? inferred : 'unknown';
      const fixed = lineText.replace(/:\s*any\b/, `: ${suggestion}`);
      const unsafeCast = /as\s+any\b/.test(lineText);

      issues.push({
        id: `any-${pf.filePath}-${line}`,
        file: pf.fileName,
        filePath: pf.filePath,
        category: unsafeCast ? 'unsafe-cast' : 'any-type',
        problem: unsafeCast ? 'Cast inseguro para `any`' : 'Uso de `any` — tenta inferir tipo',
        impact: 'High',
        lineStart: line,
        lineEnd: line,
        lines: { before: [lineText], after: [fixed] },
        patch: { before: lineText, after: fixed },
      });
    },
    TSAsExpression(node: TSESTree.TSAsExpression) {
      if (node.typeAnnotation.type === 'TSAnyKeyword') {
        const line = lineOf(node);
        const lineText = pf.lines[line - 1] ?? '';
        const fixed = lineText.replace(/as\s+any\b/, 'as unknown');
        issues.push({
          id: `as-any-${pf.filePath}-${line}`,
          file: pf.fileName,
          filePath: pf.filePath,
          category: 'unsafe-cast',
          problem: 'Cast inseguro para `any`',
          impact: 'High',
          lineStart: line,
          lineEnd: line,
          lines: { before: [lineText], after: [fixed] },
          patch: { before: lineText, after: fixed },
        });
      }
    },
  });

  return issues;
}
