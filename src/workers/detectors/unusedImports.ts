import { Issue, ParsedFile, walk, lineOf } from '../../lib/analyze';

export function detectUnusedImports(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];

  const importNames = new Map<string, { name: string; line: number; code: string }[]>();

  const nonImportStatements: any[] = [];

  for (const node of pf.ast.body) {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers) {
        const localName = specifier.local?.name;
        if (!localName) continue;
        const list = importNames.get(localName) ?? [];
        list.push({
          name: localName,
          line: lineOf(specifier),
          code: pf.lines[lineOf(specifier) - 1] ?? localName,
        });
        importNames.set(localName, list);
      }
    } else {
      nonImportStatements.push(node);
    }
  }

  if (importNames.size === 0) return issues;

  const usedNames = new Set<string>();

  for (const stmt of nonImportStatements) {
    walk(stmt, {
      Identifier(node: any) {
        if (node.name) usedNames.add(node.name);
      },
    });
  }

  for (const [, specs] of importNames) {
    for (const spec of specs) {
      if (usedNames.has(spec.name)) continue;

      issues.push({
        id: `unused-import-${pf.filePath}-${spec.name}-${spec.line}`,
        file: pf.fileName,
        filePath: pf.filePath,
        category: 'unused-import',
        problem: `Import \`${spec.name}\` is never used in the file.`,
        impact: 'Low',
        lineStart: spec.line,
        lineEnd: spec.line,
        lines: { before: [spec.code], after: [] },
        patch: { before: spec.code, after: '' },
      });
    }
  }

  return issues;
}
