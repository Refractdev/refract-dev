// src/workers/detectors/anyTypes.ts
import { Issue, ParsedFile, walk, lineOf } from '../../lib/analyze';

export function detectAnyTypes(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<number>();

  // Helper to get the nearest meaningful context by walking up the parent chain
  function findNearestContext(node: any): { type: string; suggestion: string } | null {
    let current = node.parent;
    let grandparent = current?.parent;
    
    // Walk up until we find a meaningful context or reach the root
    while (current && current.type) {
      grandparent = current.parent;
      
      // Case 1: parent is TSTypeAnnotation and grandparent is VariableDeclarator with init
      if (current.type === 'TSTypeAnnotation' && 
          grandparent && 
          grandparent.type === 'VariableDeclarator' && 
          grandparent.init) {
        
        const init = grandparent.init;
        // Infer from init value type
        if (init.type === 'Literal') {
          switch (typeof init.value) {
            case 'string': return { type: 'TSTypeAnnotation', suggestion: 'string' };
            case 'number': return { type: 'TSTypeAnnotation', suggestion: 'number' };
            case 'boolean': return { type: 'TSTypeAnnotation', suggestion: 'boolean' };
            default: return { type: 'TSTypeAnnotation', suggestion: 'unknown' };
          }
        } else if (init.type === 'ArrayExpression') {
          return { type: 'TSTypeAnnotation', suggestion: 'unknown[]' };
        } else if (init.type === 'ObjectExpression') {
          return { type: 'TSTypeAnnotation', suggestion: 'Record<string, unknown>' };
        } else if (init.type === 'CallExpression' && init.callee.type === 'Identifier') {
          // Suggest ReturnType<typeof X> for call expressions
          return { type: 'TSTypeAnnotation', suggestion: `ReturnType<typeof ${init.callee.name}>` };
        }
      }
      
      // Case 2: parent is TSTypeAnnotation and grandparent is Identifier whose name starts with is or has
      if (current.type === 'TSTypeAnnotation' && 
          grandparent && 
          grandparent.type === 'Identifier') {
        const name = grandparent.name;
        if (name.startsWith('is') || name.startsWith('has')) {
          return { type: 'TSTypeAnnotation', suggestion: 'boolean' };
        }
      }
      
      // Case 3: parent is TSPropertySignature
      if (current.type === 'TSPropertySignature') {
        return { type: 'TSPropertySignature', suggestion: 'unknown' };
      }
      
      // Continue walking up
      current = current.parent;
    }
    
    // Fallback
    return { type: 'Fallback', suggestion: 'unknown' };
  }

  walk(pf.ast, {
    TSAnyKeyword(node: any) {
      const line = lineOf(node);
      if (seen.has(line)) return;
      seen.add(line);
      const lineText = pf.lines[line - 1] ?? '';

      let inferred = null as string | null;
      const context = findNearestContext(node);
      if (context) {
        inferred = context.suggestion;
      }

      // For TSAnyKeyword, never suggest any as the fix
      const suggestion = inferred ?? 'unknown';
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
    TSAsExpression(node: any) {
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