// src/workers/detectors/deadState.ts
import { TSESTree } from '@typescript-eslint/typescript-estree';
import { Issue, ParsedFile, walk, findAll, lineOf, endLineOf } from '../analysis.worker';

interface StateDecl {
  varName: string;
  setterName: string;
  line: number;
  endLine: number;
  node: TSESTree.VariableDeclarator;
  initNode: TSESTree.Node | null;
}

export function detectDeadState(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];

  // Helper to find React component nodes
  walk(pf.ast, {
    FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
      analyzeComponent(node, node.id?.name ?? 'Component');
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
    const states: StateDecl[] = [];

    // Find all useStates declared directly inside this component function body
    walk(compNode, {
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        // Prevent traversing nested components or helper functions defined inside
        if (
          node.init &&
          node.init.type === 'CallExpression' &&
          node.init.callee.type === 'Identifier' &&
          node.init.callee.name === 'useState'
        ) {
          if (node.id.type === 'ArrayPattern') {
            const first = node.id.elements[0];
            const second = node.id.elements[1];
            if (first && first.type === 'Identifier' && second && second.type === 'Identifier') {
              states.push({
                varName: first.name,
                setterName: second.name,
                line: lineOf(node),
                endLine: endLineOf(node),
                node,
                initNode: node.init.arguments[0] || null,
              });
            }
          }
        }
      },
      // Do not enter nested functions to avoid wrong scope mapping
      FunctionDeclaration(node) {
        // Skip traversing inside nested functions during useState gathering
        (node as any)._skip = true;
      },
      FunctionExpression(node) {
        (node as any)._skip = true;
      },
      ArrowFunctionExpression(node) {
        (node as any)._skip = true;
      },
    });

    if (states.length === 0) return;

    // Find all identifiers inside this component body
    const allIdentifiers = findAll(compNode, 'Identifier') as TSESTree.Identifier[];

    // Count occurrences of each state var and setter
    const counts = new Map<string, number>();
    for (const id of allIdentifiers) {
      counts.set(id.name, (counts.get(id.name) ?? 0) + 1);
    }

    // 1. Dead State: state variable and setter are only referenced in the declaration itself (count === 1)
    for (const state of states) {
      const varCount = counts.get(state.varName) ?? 0;
      const setterCount = counts.get(state.setterName) ?? 0;

      if (varCount <= 1 && setterCount <= 1) {
        const lineText = pf.lines[state.line - 1] ?? '';
        issues.push({
          id: `dead-state-${pf.filePath}-${state.line}`,
          file: pf.fileName,
          filePath: pf.filePath,
          category: 'dead-state',
          problem: `Estado morto: \`${state.varName}\` e o seu setter nunca são usados em \`${compName}\``,
          impact: 'Medium',
          lineStart: state.line,
          lineEnd: state.endLine,
          lines: { before: [lineText], after: [] },
          patch: { before: lineText, after: '' },
        });
        continue;
      }

      // 2. Unused setter (setter never called after mount)
      if (setterCount <= 1 && varCount > 1) {
        const lineText = pf.lines[state.line - 1] ?? '';
        const initValText = state.initNode ? pf.lines[state.line - 1].substring(state.initNode.loc!.start.column, state.initNode.loc!.end.column) : 'undefined';
        const fixedText = `const ${state.varName} = ${initValText};`;
        issues.push({
          id: `unused-setter-${pf.filePath}-${state.line}`,
          file: pf.fileName,
          filePath: pf.filePath,
          category: 'dead-state',
          problem: `O setter \`${state.setterName}\` nunca é chamado. Substitui o estado por uma constante simples`,
          impact: 'Medium',
          lineStart: state.line,
          lineEnd: state.endLine,
          lines: { before: [lineText], after: [fixedText] },
          patch: { before: lineText, after: fixedText },
        });
        continue;
      }

      // 3. Derived State: initialized with props/other state and setter is never called
      if (state.initNode && setterCount <= 1) {
        let isComplex = false;
        walk(state.initNode, {
          BinaryExpression() { isComplex = true; },
          TemplateLiteral() { isComplex = true; },
          CallExpression() { isComplex = true; },
        });
        if (isComplex) {
          const lineText = pf.lines[state.line - 1] ?? '';
          const initValText = pf.lines[state.line - 1].substring(state.initNode.loc!.start.column, state.initNode.loc!.end.column);
          const fixedText = `const ${state.varName} = useMemo(() => ${initValText}, []);`;
          issues.push({
            id: `derived-state-${pf.filePath}-${state.line}`,
            file: pf.fileName,
            filePath: pf.filePath,
            category: 'dead-state',
            problem: `Estado derivado detetado: \`${state.varName}\` pode ser computado com useMemo em vez de useState`,
            impact: 'Medium',
            lineStart: state.line,
            lineEnd: state.endLine,
            lines: { before: [lineText], after: [fixedText] },
            patch: { before: lineText, after: fixedText },
          });
          continue;
        }
      }
    }

    // 4. Redundant states: two states updated together 80%+ of times
    // Let's find all function bodies/blocks within this component and see what setters are called.
    const setterCallBlocks: string[][] = [];
    walk(compNode, {
      BlockStatement(blockNode: TSESTree.BlockStatement) {
        const callsInBlock: string[] = [];
        walk(blockNode, {
          CallExpression(call: TSESTree.CallExpression) {
            if (call.callee.type === 'Identifier') {
              const name = call.callee.name;
              if (states.some(s => s.setterName === name)) {
                callsInBlock.push(name);
              }
            }
          },
          // Do not enter nested block statements to avoid double-counting
          BlockStatement(nested) {
            (nested as any)._skip = true;
          },
        });
        if (callsInBlock.length > 0) {
          setterCallBlocks.push(callsInBlock);
        }
      },
    });

    // Check pairs of states
    for (let i = 0; i < states.length; i++) {
      for (let j = i + 1; j < states.length; j++) {
        const s1 = states[i];
        const s2 = states[j];

        let s1Total = 0;
        let s2Total = 0;
        let coOccur = 0;

        for (const block of setterCallBlocks) {
          const hasS1 = block.includes(s1.setterName);
          const hasS2 = block.includes(s2.setterName);
          if (hasS1) s1Total++;
          if (hasS2) s2Total++;
          if (hasS1 && hasS2) coOccur++;
        }

        if (s1Total >= 2 && s2Total >= 2) {
          const ratio1 = coOccur / s1Total;
          const ratio2 = coOccur / s2Total;

          if (ratio1 >= 0.8 && ratio2 >= 0.8) {
            // Suggest consolidating
            const lineText = pf.lines[s1.line - 1] + '\n' + pf.lines[s2.line - 1];
            const consolidatedName = s1.varName.replace(/List|Data|Obj/i, '') + s2.varName.charAt(0).toUpperCase() + s2.varName.slice(1);
            const fixedText = `const [${consolidatedName}, set${consolidatedName.charAt(0).toUpperCase() + consolidatedName.slice(1)}] = useState({ ${s1.varName}: ..., ${s2.varName}: ... });`;

            issues.push({
              id: `redundant-state-${pf.filePath}-${s1.line}-${s2.line}`,
              file: pf.fileName,
              filePath: pf.filePath,
              category: 'dead-state',
              problem: `Estados redundantes: \`${s1.varName}\` e \`${s2.varName}\` são atualizados juntos em ${Math.round(ratio1 * 100)}% das vezes. Consolida num objeto`,
              impact: 'Medium',
              lineStart: Math.min(s1.line, s2.line),
              lineEnd: Math.max(s1.endLine, s2.endLine),
              lines: { before: lineText.split('\n'), after: [fixedText] },
              patch: { before: lineText, after: fixedText },
            });
          }
        }
      }
    }
  }

  return issues;
}
