// src/workers/detectors/missingErrorBoundary.ts
import { Issue, ParsedFile, walk, findAll, lineOf, endLineOf } from '../../lib/analyze';

export function detectMissingErrorBoundary(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];
  if (!pf.isTsx) return issues;

  walk(pf.ast, {
    FunctionDeclaration(node: any) {
      if (node.id && /^[A-Z]/.test(node.id.name)) {
        analyzeComponent(node, node.id.name);
      }
    },
    VariableDeclarator(node: any) {
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

  function analyzeComponent(compNode: any, compName: string) {
    let hasAsync = false;

    // Check if there is any fetch/axios call or async function / promise handling
    walk(compNode, {
      CallExpression(node: any) {
        if (node.callee.type === 'Identifier' && (node.callee.name === 'fetch' || node.callee.name === 'axios')) {
          hasAsync = true;
        }
        if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' && node.callee.object.name === 'axios') {
          hasAsync = true;
        }
        // check .then or .catch
        if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier' && ['then', 'catch'].includes(node.callee.property.name)) {
          hasAsync = true;
        }
      },
      AwaitExpression() {
        hasAsync = true;
      },
      // Do not enter nested components
      FunctionDeclaration(_node, skip) { skip?.() },
      FunctionExpression(_node, skip) { skip?.() },
      ArrowFunctionExpression(_node, skip) { skip?.() },
    });

    if (!hasAsync) return;

    // Check if component has an error state variable (e.g. error, hasError, apiError)
    let hasErrorState = false;
    let errorVarName = '';

    walk(compNode, {
      VariableDeclarator(node: any) {
        if (
          node.init &&
          node.init.type === 'CallExpression' &&
          node.init.callee.type === 'Identifier' &&
          node.init.callee.name === 'useState'
        ) {
          if (node.id.type === 'ArrayPattern') {
            const first = node.id.elements[0];
            if (first && first.type === 'Identifier' && first.name.toLowerCase().includes('error')) {
              hasErrorState = true;
              errorVarName = first.name;
            }
          }
        }
      },
      // Do not enter nested components
      FunctionDeclaration(_node, skip) { skip?.() },
      FunctionExpression(_node, skip) { skip?.() },
      ArrowFunctionExpression(_node, skip) { skip?.() },
    });

    // Check if errorVarName is rendered in JSX return statements
    let isErrorRendered = false;
    if (hasErrorState && errorVarName) {
      walk(compNode, {
        ReturnStatement(node: any) {
          if (node.argument) {
            const identifiers = findAll(node.argument, 'Identifier') as any[];
            if (identifiers.some(id => id.name === errorVarName)) {
              isErrorRendered = true;
            }
          }
        },
      });
    }

    if (!hasErrorState || !isErrorRendered) {
      const compStart = lineOf(compNode);
      const compEnd = endLineOf(compNode);
      const beforeLines = pf.lines.slice(compStart - 1, compEnd);
      const afterLines = [...beforeLines];
      let insertedLines = 0;

      if (!hasErrorState) {
        const stateLine = `  const [error, setError] = useState<Error | null>(null);`;
        const insertAt = afterLines.length > 1 ? 1 : afterLines.length;
        afterLines.splice(insertAt, 0, stateLine);
        insertedLines += 1;
      }

      if (!isErrorRendered) {
        let firstJsxReturnLine: number | null = null;
        walk(compNode, {
          ReturnStatement(node: any) {
            if (firstJsxReturnLine !== null) return;
            const arg = node.argument;
            if (!arg) return;
            if (arg.type === 'JSXElement' || arg.type === 'JSXFragment') {
              firstJsxReturnLine = lineOf(node);
            }
          },
          FunctionDeclaration(_node, skip) { skip?.() },
          FunctionExpression(_node, skip) { skip?.() },
          ArrowFunctionExpression(_node, skip) { skip?.() },
        });

        const guardLine = `  if (error) return <div role=\"alert\">Ocorreu um erro: {error.message}</div>;`;
        if (firstJsxReturnLine !== null) {
          const guardIndex = Math.max(0, firstJsxReturnLine - compStart + insertedLines);
          afterLines.splice(guardIndex, 0, guardLine);
        } else {
          afterLines.push(guardLine);
        }
      }

      const afterText = afterLines.join('\n');
      const beforeText = beforeLines.join('\n');

      issues.push({
        id: `missing-error-boundary-${pf.filePath}-${compStart}`,
        file: pf.fileName,
        filePath: pf.filePath,
        category: 'missing-error-boundary',
        problem: `Componente \`${compName}\` realiza operações assíncronas mas não tem tratamento de erros visível para o utilizador (estado de erro ou JSX condicional)`,
        impact: 'Medium',
        lineStart: compStart,
        lineEnd: compEnd,
        lines: { before: beforeLines, after: afterLines },
        patch: { before: beforeText, after: afterText },
      });
    }
  }

  return issues;
}
