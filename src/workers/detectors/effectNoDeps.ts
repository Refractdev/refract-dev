// src/workers/detectors/effectNoDeps.ts
import { TSESTree } from '@typescript-eslint/typescript-estree';
import { Issue, ParsedFile, walk, findAll, lineOf, endLineOf } from '../analysis.worker';

export function detectEffectNoDeps(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];

  walk(pf.ast, {
    FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
      analyzeComponent(node);
    },
    VariableDeclarator(node: TSESTree.VariableDeclarator) {
      if (
        node.init &&
        (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression') &&
        node.id.type === 'Identifier' &&
        /^[A-Z]/.test(node.id.name)
      ) {
        analyzeComponent(node.init);
      }
    },
  });

  function analyzeComponent(compNode: TSESTree.Node) {
    // 1. Gather all component-scope identifiers (props, useState states, variables)
    const compVariables = new Set<string>();

    // If there are props parameters, add them or their destructured variables
    const params = (compNode as any).params || [];
    for (const param of params) {
      if (param.type === 'Identifier') {
        compVariables.add(param.name);
      } else if (param.type === 'ObjectPattern') {
        for (const prop of param.properties) {
          if (prop.type === 'Property' && prop.value.type === 'Identifier') {
            compVariables.add(prop.value.name);
          } else if (prop.type === 'RestElement' && prop.argument.type === 'Identifier') {
            compVariables.add(prop.argument.name);
          }
        }
      }
    }

    // Gather states and variable declarations inside the component
    walk(compNode, {
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.id.type === 'Identifier') {
          compVariables.add(node.id.name);
        } else if (node.id.type === 'ArrayPattern') {
          for (const el of node.id.elements) {
            if (el && el.type === 'Identifier') {
              compVariables.add(el.name);
            }
          }
        } else if (node.id.type === 'ObjectPattern') {
          for (const prop of node.id.properties) {
            if (prop.type === 'Property' && prop.value.type === 'Identifier') {
              compVariables.add(prop.value.name);
            }
          }
        }
      },
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        if (node.id) {
          compVariables.add(node.id.name);
        }
      },
      // Do not enter nested components
      FunctionExpression(node) { (node as any)._skip = true; },
      ArrowFunctionExpression(node) { (node as any)._skip = true; },
    });

    // 2. Find all useEffect calls
    walk(compNode, {
      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'useEffect' &&
          node.arguments.length >= 1
        ) {
          const callback = node.arguments[0];
          const depsArg = node.arguments[1];
          const line = lineOf(node);
          const endLine = endLineOf(node);
          const lineText = pf.lines.slice(line - 1, endLine).join('\n');

          // Case A: useEffect without dependency array at all
          if (!depsArg) {
            const fixedText = lineText.trim() + ',\n  []\n)';
            issues.push({
              id: `effect-no-deps-missing-${pf.filePath}-${line}`,
              file: pf.fileName,
              filePath: pf.filePath,
              category: 'effect-no-deps',
              problem: 'useEffect sem dependency array — executa em cada render e pode causar loops infinitos',
              impact: 'High',
              lineStart: line,
              lineEnd: endLine,
              lines: { before: lineText.split('\n'), after: [fixedText] },
              patch: { before: lineText, after: fixedText },
            });
            return;
          }

          // Gather variables used inside useEffect callback
          const referencedInCallback = new Set<string>();
          const declaredInCallback = new Set<string>();

          walk(callback, {
            VariableDeclarator(vDec: TSESTree.VariableDeclarator) {
              if (vDec.id.type === 'Identifier') {
                declaredInCallback.add(vDec.id.name);
              }
            },
            Identifier(id: TSESTree.Identifier) {
              // Ensure we are referencing a variable, not a property access object/property or function name
              const parent = (id as any).parent;
              if (parent && parent.type === 'MemberExpression' && parent.property === id && !parent.computed) {
                return;
              }
              if (parent && parent.type === 'Property' && parent.key === id && !parent.shorthand) {
                return;
              }
              referencedInCallback.add(id.name);
            },
          });

          // Filter out variables declared inside the callback itself
          const outerRefsUsed = [...referencedInCallback].filter(
            name => compVariables.has(name) && !declaredInCallback.has(name)
          );

          // Get names in deps array
          const depsNames: string[] = [];
          if (depsArg.type === 'ArrayExpression') {
            for (const el of depsArg.elements) {
              if (el && el.type === 'Identifier') {
                depsNames.push(el.name);
              }
            }
          }

          // Case B: useEffect has empty dependency array `[]` but references component state/props (stale closure)
          if (depsArg.type === 'ArrayExpression' && depsArg.elements.length === 0 && outerRefsUsed.length > 0) {
            // Suggest correct dependencies
            const newDeps = outerRefsUsed.filter(n => !['useEffect', 'useState', 'useRef', 'useCallback', 'useMemo'].includes(n));
            if (newDeps.length > 0) {
              const fixedText = lineText.replace(/\[\s*\]/, `[${newDeps.join(', ')}]`);
              issues.push({
                id: `effect-stale-closure-${pf.filePath}-${line}`,
                file: pf.fileName,
                filePath: pf.filePath,
                category: 'effect-no-deps',
                problem: `useEffect com dependências vazias mas que usa variáveis do scope: ${newDeps.join(', ')} (stale closure)`,
                impact: 'High',
                lineStart: line,
                lineEnd: endLine,
                lines: { before: lineText.split('\n'), after: [fixedText] },
                patch: { before: lineText, after: fixedText },
              });
            }
          }

          // Case C: fetch/async call but no cleanup returned
          let hasAsyncOrFetch = false;
          walk(callback, {
            CallExpression(call: TSESTree.CallExpression) {
              if (call.callee.type === 'Identifier' && (call.callee.name === 'fetch' || call.callee.name === 'axios')) {
                hasAsyncOrFetch = true;
              }
              if (call.callee.type === 'MemberExpression' && call.callee.object.type === 'Identifier' && call.callee.object.name === 'axios') {
                hasAsyncOrFetch = true;
              }
            },
          });

          let hasCleanup = false;
          walk(callback, {
            ReturnStatement(ret: TSESTree.ReturnStatement) {
              if (
                ret.argument &&
                (ret.argument.type === 'ArrowFunctionExpression' ||
                  ret.argument.type === 'FunctionExpression' ||
                  ret.argument.type === 'Identifier')
              ) {
                hasCleanup = true;
              }
            },
          });

          if (hasAsyncOrFetch && !hasCleanup) {
            const fixedText = lineText.replace(
              /}\s*,\s*\[([\s\S]*?)\]\s*\)/,
              `  let active = true;\n    // executa chamada async...\n    return () => { active = false; };\n  }, [$1])`
            );
            issues.push({
              id: `effect-no-cleanup-${pf.filePath}-${line}`,
              file: pf.fileName,
              filePath: pf.filePath,
              category: 'effect-no-deps',
              problem: 'useEffect faz chamada fetch/async sem função de cleanup (potencial memory leak)',
              impact: 'High',
              lineStart: line,
              lineEnd: endLine,
              lines: { before: lineText.split('\n'), after: [fixedText] },
              patch: { before: lineText, after: fixedText },
            });
          }

          // Case D: Infinite loop potential (updates a state variable that is also listed in dependencies)
          // Find if we call a setter for any variable listed in depsNames
          for (const depName of depsNames) {
            // Find setter name by looking at useState names
            // E.g., if dep is `count`, standard setter is `setCount`
            const setterName = `set${depName.charAt(0).toUpperCase() + depName.slice(1)}`;
            let callsSetter = false;
            walk(callback, {
              CallExpression(call: TSESTree.CallExpression) {
                if (call.callee.type === 'Identifier' && call.callee.name === setterName) {
                  // If it's a functional update (e.g. setCount(c => c + 1)), it's safe!
                  const arg = call.arguments[0];
                  if (arg && (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression')) {
                    // Safe
                  } else {
                    callsSetter = true;
                  }
                }
              },
            });

            if (callsSetter) {
              const fixedText = lineText.replace(
                new RegExp(`${setterName}\\(([^)]+)\\)`),
                `${setterName}(prev => prev + 1)` // safe functional update representation
              );
              issues.push({
                id: `effect-infinite-loop-${pf.filePath}-${line}`,
                file: pf.fileName,
                filePath: pf.filePath,
                category: 'effect-no-deps',
                problem: `useEffect atualiza o estado \`${depName}\` que está nas suas próprias dependências (potencial loop infinito)`,
                impact: 'High',
                lineStart: line,
                lineEnd: endLine,
                lines: { before: lineText.split('\n'), after: [fixedText] },
                patch: { before: lineText, after: fixedText },
              });
            }
          }
        }
      },
      // Do not enter nested components
      FunctionDeclaration(node) { (node as any)._skip = true; },
      FunctionExpression(node) { (node as any)._skip = true; },
      ArrowFunctionExpression(node) { (node as any)._skip = true; },
    });
  }

  return issues;
}
