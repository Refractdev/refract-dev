// src/workers/detectors/oversized.ts
import { TSESTree } from '@typescript-eslint/typescript-estree';
import { Issue, ParsedFile, walk, findAll, lineOf, endLineOf } from '../analysis.worker';

export function detectOversized(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];
  if (!pf.isTsx) return issues;

  walk(pf.ast, {
    FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
      if (node.id && /^[A-Z]/.test(node.id.name)) {
        analyzeComponent(node, node.id.name);
      }
    },
    VariableDeclarator(node: TSESTree.VariableDeclarator) {
      if (
        node.init &&
        (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression') &&
        node.id.type === 'Identifier' &&
        /^[A-Z]/.test(node.id.name)
      ) {
        analyzeComponent(node.init, node.id.name);
      }
    },
  });

  function analyzeComponent(compNode: TSESTree.Node, compName: string) {
    const compStart = lineOf(compNode);
    const compEnd = endLineOf(compNode);
    const totalLines = compEnd - compStart + 1;

    // 1. Calculate JSX lines vs logic lines
    let jsxLinesCount = 0;
    const jsxElements = findAll(compNode, 'JSXElement').concat(findAll(compNode, 'JSXFragment'));
    const jsxLinesSet = new Set<number>();
    for (const el of jsxElements) {
      const start = lineOf(el);
      const end = endLineOf(el);
      for (let l = start; l <= end; l++) {
        jsxLinesSet.add(l);
      }
    }
    jsxLinesCount = jsxLinesSet.size;
    const logicLinesCount = totalLines - jsxLinesCount;

    // Report Mixed Responsibility
    if (logicLinesCount > 120 && jsxLinesCount > 120) {
      const lines = pf.lines.slice(compStart - 1, compStart + 15);
      issues.push({
        id: `oversized-mixed-${pf.filePath}-${compStart}`,
        file: pf.fileName,
        filePath: pf.filePath,
        category: 'oversized-component',
        problem: `Responsabilidade Mista em \`${compName}\`: tem muita lógica (${logicLinesCount} linhas) e muito JSX (${jsxLinesCount} linhas). Separa em Container e Presentational`,
        impact: 'High',
        lineStart: compStart,
        lineEnd: compEnd,
        lines: { before: lines, after: [] },
      });
    }

    // 2. Detect sub-renderers (functions starting with render* returning JSX)
    walk(compNode, {
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        if (node.id && /^render[A-Z]/.test(node.id.name)) {
          checkSubRenderer(node, node.id.name);
        }
      },
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (
          node.id.type === 'Identifier' &&
          /^render[A-Z]/.test(node.id.name) &&
          node.init &&
          (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
        ) {
          checkSubRenderer(node.init, node.id.name);
        }
      },
      // Do not enter nested component checks here
      ArrowFunctionExpression(node) {
        if ((node as any) !== compNode) (node as any)._skip = true;
      },
      FunctionExpression(node) {
        if ((node as any) !== compNode) (node as any)._skip = true;
      },
    });

    function checkSubRenderer(subNode: TSESTree.Node, name: string) {
      const subJsx = findAll(subNode, 'JSXElement').concat(findAll(subNode, 'JSXFragment'));
      if (subJsx.length > 0) {
        const start = lineOf(subNode);
        const end = endLineOf(subNode);
        const codeLines = pf.lines.slice(start - 1, end);
        const beforeText = codeLines.join('\n');

        // Infer props by finding all Identifier variables used in the sub-renderer that aren't defined in it
        const subVars = new Set<string>();
        walk(subNode, {
          Identifier(id: TSESTree.Identifier) {
            // Very simple check: if it is used, collect it
            const p = (id as any).parent;
            if (p && p.type === 'MemberExpression' && p.property === id && !p.computed) return;
            if (p && p.type === 'Property' && p.key === id && !p.shorthand) return;
            subVars.add(id.name);
          },
        });
        const localVars = new Set<string>();
        walk(subNode, {
          VariableDeclarator(vDec: TSESTree.VariableDeclarator) {
            if (vDec.id.type === 'Identifier') localVars.add(vDec.id.name);
          },
        });
        const propsUsed = [...subVars].filter(v => !localVars.has(v) && !['React', 'useState', 'useEffect'].includes(v) && /^[a-z]/.test(v));

        const compPropsName = name.replace(/^render/, '') + 'Props';
        const newCompName = name.replace(/^render/, '');
        const propsInterface = propsUsed.length > 0
          ? `interface ${compPropsName} {\n${propsUsed.map(p => `  ${p}: any;`).join('\n')}\n}\n\n`
          : '';
        const afterText = `${propsInterface}const ${newCompName} = ({ ${propsUsed.join(', ')} }: ${propsUsed.length > 0 ? compPropsName : '{}'}) => {\n  return (\n    // Extraído do sub-renderer\n  );\n};`;

        issues.push({
          id: `oversized-subrenderer-${pf.filePath}-${start}`,
          file: pf.fileName,
          filePath: pf.filePath,
          category: 'oversized-component',
          problem: `Sub-renderer candidato a extração: \`${name}\`. Considera criar um novo componente React autónomo`,
          impact: 'Medium',
          lineStart: start,
          lineEnd: end,
          lines: { before: codeLines, after: [afterText] },
          patch: { before: beforeText, after: afterText },
        });
      }
    }

    // 3. Detect inline components (nested components capitalized definition)
    walk(compNode, {
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        if ((node as any) !== compNode && node.id && /^[A-Z]/.test(node.id.name)) {
          checkInlineComponent(node, node.id.name);
        }
      },
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (
          node.id.type === 'Identifier' &&
          /^[A-Z]/.test(node.id.name) &&
          node.init &&
          (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
        ) {
          checkInlineComponent(node.init, node.id.name);
        }
      },
      // Skip deep nested traversal
      ArrowFunctionExpression(node) {
        if ((node as any) !== compNode) (node as any)._skip = true;
      },
      FunctionExpression(node) {
        if ((node as any) !== compNode) (node as any)._skip = true;
      },
    });

    function checkInlineComponent(subNode: TSESTree.Node, name: string) {
      const subJsx = findAll(subNode, 'JSXElement').concat(findAll(subNode, 'JSXFragment'));
      if (subJsx.length > 0) {
        const start = lineOf(subNode);
        const end = endLineOf(subNode);
        const codeLines = pf.lines.slice(start - 1, end);
        const beforeText = codeLines.join('\n');
        const afterText = `// Move o componente \`${name}\` para fora de \`${compName}\` para evitar que seja recriado a cada render\n` + beforeText;

        issues.push({
          id: `oversized-inline-${pf.filePath}-${start}`,
          file: pf.fileName,
          filePath: pf.filePath,
          category: 'oversized-component',
          problem: `Componente inline detetado: \`${name}\` foi definido dentro de \`${compName}\`. Isto causa perda de performance`,
          impact: 'High',
          lineStart: start,
          lineEnd: end,
          lines: { before: codeLines, after: [afterText] },
          patch: { before: beforeText, after: afterText },
        });
      }
    }
  }

  return issues;
}
