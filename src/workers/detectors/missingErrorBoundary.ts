// src/workers/detectors/missingErrorBoundary.ts
import { TSESTree } from '@typescript-eslint/typescript-estree';
import { Issue, ParsedFile, walk, findAll, lineOf, endLineOf } from '../analysis.worker';

export function detectMissingErrorBoundary(pf: ParsedFile): Issue[] {
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
    let hasAsync = false;

    // Check if there is any fetch/axios call or async function / promise handling
    walk(compNode, {
      CallExpression(node: TSESTree.CallExpression) {
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
      FunctionDeclaration(n) { (n as any)._skip = true; },
      FunctionExpression(n) { (n as any)._skip = true; },
      ArrowFunctionExpression(n) { (n as any)._skip = true; },
    });

    if (!hasAsync) return;

    // Check if component has an error state variable (e.g. error, hasError, apiError)
    let hasErrorState = false;
    let errorVarName = '';

    walk(compNode, {
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
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
      FunctionDeclaration(n) { (n as any)._skip = true; },
      FunctionExpression(n) { (n as any)._skip = true; },
      ArrowFunctionExpression(n) { (n as any)._skip = true; },
    });

    // Check if errorVarName is rendered in JSX return statements
    let isErrorRendered = false;
    if (hasErrorState && errorVarName) {
      walk(compNode, {
        ReturnStatement(node: TSESTree.ReturnStatement) {
          if (node.argument) {
            const identifiers = findAll(node.argument, 'Identifier') as TSESTree.Identifier[];
            if (identifiers.some(id => id.name === errorVarName)) {
              isErrorRendered = true;
            }
          }
        },
      });
    }

    if (!hasErrorState || !isErrorRendered) {
      const compStart = lineOf(compNode);
      const firstLineText = pf.lines[compStart - 1] ?? '';
      const fixedText = `// Adiciona o estado de erro e tratamento visual condicional no JSX\n` +
        `const [error, setError] = useState<Error | null>(null);\n` +
        `// ...\n` +
        `if (error) return <div>Ocorreu um erro: {error.message}</div>;\n` +
        `// ...\n` +
        firstLineText;

      issues.push({
        id: `missing-error-boundary-${pf.filePath}-${compStart}`,
        file: pf.fileName,
        filePath: pf.filePath,
        category: 'missing-error-boundary',
        problem: `Componente \`${compName}\` realiza operações assíncronas mas não tem tratamento de erros visível para o utilizador (estado de erro ou JSX condicional)`,
        impact: 'Medium',
        lineStart: compStart,
        lineEnd: compStart,
        lines: { before: [firstLineText], after: [fixedText] },
        patch: { before: firstLineText, after: fixedText },
      });
    }
  }

  return issues;
}
