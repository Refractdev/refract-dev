// src/workers/detectors/propDrilling.ts
import { TSESTree } from '@typescript-eslint/typescript-estree';
import { Issue, ParsedFile, walk, findAll, lineOf, endLineOf } from '../analysis.worker';

export function detectPropDrilling(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];

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
    const params = (compNode as any).params || [];
    const propsParam = params[0];
    if (!propsParam) return;

    const compStart = lineOf(compNode);
    const compEnd = endLineOf(compNode);
    const lineText = pf.lines.slice(compStart - 1, compStart + 4).join('\n');

    // 1. Check for {...props} spread anti-pattern in JSX children
    let spreadPropsName = '';
    if (propsParam.type === 'Identifier') {
      spreadPropsName = propsParam.name;
    } else if (propsParam.type === 'ObjectPattern') {
      for (const prop of propsParam.properties) {
        if (prop.type === 'RestElement' && prop.argument.type === 'Identifier') {
          spreadPropsName = prop.argument.name;
        }
      }
    }

    if (spreadPropsName) {
      let containsSpreadForwards = false;
      let spreadLine = compStart;

      walk(compNode, {
        JSXSpreadAttribute(sa: TSESTree.JSXSpreadAttribute) {
          if (sa.argument.type === 'Identifier' && sa.argument.name === spreadPropsName) {
            containsSpreadForwards = true;
            spreadLine = lineOf(sa);
          }
        },
        // Skip nested component walks to ensure it belongs to this component
        FunctionDeclaration(n) { (n as any)._skip = true; },
        FunctionExpression(n) { (n as any)._skip = true; },
        ArrowFunctionExpression(n) { (n as any)._skip = true; },
      });

      if (containsSpreadForwards) {
        const targetLineText = pf.lines[spreadLine - 1] ?? '';
        const fixedText = `// Evita o spread total de props\n` + targetLineText.replace(`{...${spreadPropsName}}`, `/* passa as props necessárias explicitamente */`);
        issues.push({
          id: `prop-drilling-spread-${pf.filePath}-${spreadLine}`,
          file: pf.fileName,
          filePath: pf.filePath,
          category: 'prop-drilling',
          problem: `Anti-pattern de transparência total: spread de todas as props em \`${compName}\` com \`{...${spreadPropsName}}\`. Dificulta a legibilidade e otimização`,
          impact: 'Medium',
          lineStart: spreadLine,
          lineEnd: spreadLine,
          lines: { before: [targetLineText], after: [fixedText] },
          patch: { before: targetLineText, after: fixedText },
        });
      }
    }

    // 2. Identify props received but never used directly (only forwarded)
    const propsInfo: Array<{ name: string; node: TSESTree.Node }> = [];
    if (propsParam.type === 'ObjectPattern') {
      for (const prop of propsParam.properties) {
        if (prop.type === 'Property' && prop.value.type === 'Identifier') {
          propsInfo.push({ name: prop.value.name, node: prop });
        }
      }
    }

    if (propsInfo.length > 0) {
      // For each destructured prop, count occurrences in the function body
      const allIdentifiers = findAll(compNode, 'Identifier') as TSESTree.Identifier[];
      const idCounts = new Map<string, number>();
      for (const id of allIdentifiers) {
        idCounts.set(id.name, (idCounts.get(id.name) ?? 0) + 1);
      }

      for (const prop of propsInfo) {
        const count = idCounts.get(prop.name) ?? 0;
        // Count in parameters is 1 or 2 (destructuring). If count <= 2 or 3, it's barely referenced.
        // Let's verify if the ONLY place it is referenced is inside a JSX Attribute forwarding to a child
        let isOnlyForwarded = true;
        let jsxAttrCount = 0;

        walk(compNode, {
          JSXAttribute(attr: TSESTree.JSXAttribute) {
            if (attr.value && attr.value.type === 'JSXExpressionContainer') {
              const expr = attr.value.expression;
              if (expr.type === 'Identifier' && expr.name === prop.name) {
                jsxAttrCount++;
              }
            }
          },
          // Do not count nested functions
          FunctionDeclaration(n) { (n as any)._skip = true; },
          FunctionExpression(n) { (n as any)._skip = true; },
          ArrowFunctionExpression(n) { (n as any)._skip = true; },
        });

        // If it is used exactly as many times as it's forwarded in JSX (plus the parameter binding),
        // and is not used in any local logic.
        if (jsxAttrCount > 0 && count === jsxAttrCount + 1) {
          const lineNum = lineOf(prop.node);
          const beforeLine = pf.lines[lineNum - 1] ?? '';
          const fixedLine = `// Prop drill detetado: \`${prop.name}\` pode ser extraído para um Context ou Custom Hook\n` + beforeLine;
          issues.push({
            id: `prop-drilling-forwarded-${pf.filePath}-${lineNum}-${prop.name}`,
            file: pf.fileName,
            filePath: pf.filePath,
            category: 'prop-drilling',
            problem: `Prop Drilling em \`${compName}\`: a prop \`${prop.name}\` é recebida e repassada a um componente filho sem ser usada no componente`,
            impact: 'Medium',
            lineStart: lineNum,
            lineEnd: lineNum,
            lines: { before: [beforeLine], after: [fixedLine] },
            patch: { before: beforeLine, after: fixedLine },
          });
        }
      }
    }
  }

  return issues;
}
