// src/workers/detectors/memoryLeaks.ts
import { Issue, ParsedFile, walk, findAll, lineOf, endLineOf } from '../../lib/analyze';

export function detectMemoryLeaks(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];

  walk(pf.ast, {
    CallExpression(node: any) {
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'useEffect' &&
        node.arguments.length >= 1
      ) {
        const callback = node.arguments[0];
        const line = lineOf(node);
        const endLine = endLineOf(node);
        const lineText = pf.lines.slice(line - 1, endLine).join('\n');

        // Analyze callback body
        let timerVarName = '';
        let timerType: 'Timeout' | 'Interval' | null = null;
        let timerCallLine = line;

        let hasAddEventListener = false;
        let eventTarget = 'window';
        let eventType = '';
        let listenerLine = line;

        // 1. Traverse callback to find setInterval/setTimeout and addEventListener
        walk(callback, {
          CallExpression(call: any) {
            if (call.callee.type === 'Identifier') {
              const name = call.callee.name;
              if (name === 'setTimeout' || name === 'setInterval') {
                timerType = name === 'setTimeout' ? 'Timeout' : 'Interval';
                timerCallLine = lineOf(call);
                // check if assigned to variable
                const parent = (call as any).parent;
                if (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
                  timerVarName = parent.id.name;
                }
              }
            } else if (call.callee.type === 'MemberExpression') {
              const obj = call.callee.object;
              const prop = call.callee.property;
              if (prop.type === 'Identifier' && prop.name === 'addEventListener') {
                hasAddEventListener = true;
                listenerLine = lineOf(call);
                if (obj.type === 'Identifier') {
                  eventTarget = obj.name;
                }
                const firstArg = call.arguments[0];
                if (firstArg && firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
                  eventType = firstArg.value;
                }
              }
            }
          },
          // Do not enter nested cleanup function definitions to avoid mixing scopes
          ReturnStatement(_ret, skip) {
            skip?.();
          },
        });

        // 2. Find cleanup function and inspect it
        let cleanupNode: any = null;
        walk(callback, {
          ReturnStatement(ret: any) {
            if (
              ret.argument &&
              (ret.argument.type === 'ArrowFunctionExpression' ||
                ret.argument.type === 'FunctionExpression' ||
                ret.argument.type === 'Identifier')
            ) {
              cleanupNode = ret.argument as any;
            }
          },
        });

        // 3. Perform specific audits
        // Audit A: Timers without clear
        if (timerType) {
          let hasClear = false;
          if (cleanupNode) {
            walk(cleanupNode, {
              CallExpression(call: any) {
                if (call.callee.type === 'Identifier') {
                  const name = call.callee.name;
                  const expectedClear = timerType === 'Timeout' ? 'clearTimeout' : 'clearInterval';
                  if (name === expectedClear) {
                    hasClear = true;
                  }
                }
              },
            });
          }

          if (!hasClear) {
            const clearFunc = timerType === 'Timeout' ? 'clearTimeout' : 'clearInterval';
            const fixedText = lineText.replace(
              /}\s*,\s*\[([\s\S]*?)\]\s*\)/,
              `  const timer = ${timerType === 'Timeout' ? 'setTimeout' : 'setInterval'}(...);\n    return () => ${clearFunc}(timer);\n  }, [$1])`
            );

            issues.push({
              id: `memory-leak-timer-${pf.filePath}-${timerCallLine}`,
              file: pf.fileName,
              filePath: pf.filePath,
              category: 'memory-leak',
              problem: `useEffect define um \`set${timerType}\` mas não chama \`${clearFunc}\` no cleanup (potencial memory leak)`,
              impact: 'High',
              lineStart: timerCallLine,
              lineEnd: endLine,
              lines: { before: lineText.split('\n'), after: [fixedText] },
              patch: { before: lineText, after: fixedText },
            });
          }
        }

        // Audit B: Event Listeners without remove
        if (hasAddEventListener) {
          let hasRemove = false;
          if (cleanupNode) {
            walk(cleanupNode, {
              CallExpression(call: any) {
                if (call.callee.type === 'MemberExpression') {
                  const prop = call.callee.property;
                  if (prop.type === 'Identifier' && prop.name === 'removeEventListener') {
                    const firstArg = call.arguments[0];
                    if (firstArg && firstArg.type === 'Literal' && typeof firstArg.value === 'string' && firstArg.value === eventType) {
                      hasRemove = true;
                    }
                  }
                }
              },
            });
          }

          if (!hasRemove) {
            const eventStr = eventType ? `'${eventType}'` : 'event';
            const fixedText = lineText.replace(
              /}\s*,\s*\[([\s\S]*?)\]\s*\)/,
              `  const handler = () => {};\n    ${eventTarget}.addEventListener(${eventStr}, handler);\n    return () => ${eventTarget}.removeEventListener(${eventStr}, handler);\n  }, [$1])`
            );

            issues.push({
              id: `memory-leak-listener-${pf.filePath}-${listenerLine}`,
              file: pf.fileName,
              filePath: pf.filePath,
              category: 'memory-leak',
              problem: `useEffect adiciona um event listener para \`${eventType}\` em \`${eventTarget}\` mas não o remove no cleanup (potencial memory leak)`,
              impact: 'High',
              lineStart: listenerLine,
              lineEnd: endLine,
              lines: { before: lineText.split('\n'), after: [fixedText] },
              patch: { before: lineText, after: fixedText },
            });
          }
        }
      }
    },
  });

  return issues;
}
