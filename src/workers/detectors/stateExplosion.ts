// src/workers/detectors/stateExplosion.ts
import { Issue, ParsedFile, walk, lineOf, endLineOf } from '../../lib/analyze';

interface StateVar {
  name: string;
  line: number;
  endLine: number;
  code: string;
}

export function detectStateExplosion(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];

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
    const states: StateVar[] = [];

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
            if (first && first.type === 'Identifier') {
              const start = lineOf(node);
              const end = endLineOf(node);
              states.push({
                name: first.name,
                line: start,
                endLine: end,
                code: pf.lines.slice(start - 1, end).join('\n'),
              });
            }
          }
        }
      },
      // Do not enter nested component checks
      FunctionDeclaration(_node, skip) { skip?.() },
      FunctionExpression(_node, skip) { skip?.() },
      ArrowFunctionExpression(_node, skip) { skip?.() },
    });

    if (states.length < 5) return;

    // Semantic grouping
    const groups = new Map<string, StateVar[]>();

    function getGroupKey(name: string): string {
      const lower = name.toLowerCase();
      if (lower.includes('load') || lower.includes('fetch') || lower.includes('error') || lower.includes('status')) {
        return 'loading';
      }
      if (lower.includes('filter') || lower.includes('sort') || lower.includes('search')) {
        return 'filters';
      }
      // Split camelCase to get prefix
      const match = name.match(/^[a-z]+/);
      if (match) {
        const prefix = match[0];
        if (prefix.length > 2) return prefix;
      }
      return 'other';
    }

    for (const state of states) {
      const key = getGroupKey(state.name);
      const list = groups.get(key) ?? [];
      list.push(state);
      groups.set(key, list);
    }

    // Determine suggestion
    let isUseReducer = false;
    let reducerGroupsCount = 0;
    for (const [key, list] of groups.entries()) {
      if (list.length >= 2 && key !== 'other') {
        reducerGroupsCount++;
      }
    }
    if (reducerGroupsCount >= 3) {
      isUseReducer = true;
    }

    // Dominant group with 3+ states
    let dominantGroupKey = '';
    let dominantGroupStates: StateVar[] = [];
    for (const [key, list] of groups.entries()) {
      if (list.length >= 3 && key !== 'other') {
        if (list.length > dominantGroupStates.length) {
          dominantGroupKey = key;
          dominantGroupStates = list;
        }
      }
    }

    const firstState = states[0];
    const lastState = states[states.length - 1];
    const allBeforeLines = states.map(s => s.code);
    const beforeText = allBeforeLines.join('\n');

    if (isUseReducer) {
      // Suggest useReducer
      const stateProps = states.map(s => `  ${s.name}: ...,`).join('\n');
      const actionTypes = [...groups.keys()].filter(k => k !== 'other').map(k => `  | { type: 'SET_${k.toUpperCase()}', payload: any }`).join('\n');
      const afterText = `// Estado explodido: sugere useReducer\n` +
        `interface State {\n${states.map(s => `  ${s.name}: any;`).join('\n')}\n}\n\n` +
        `type Action =\n${actionTypes || "  | { type: 'RESET' }"};\n\n` +
        `function reducer(state: State, action: Action): State {\n  switch (action.type) {\n    default: return state;\n  }\n}\n\n` +
        `const [state, dispatch] = useReducer(reducer, {\n${stateProps}\n});`;

      issues.push({
        id: `state-explosion-reducer-${pf.filePath}-${firstState.line}`,
        file: pf.fileName,
        filePath: pf.filePath,
        category: 'state-explosion',
        problem: `Explosão de estado em \`${compName}\` (${states.length} useStates). Sugere usar useReducer para gerir a complexidade`,
        impact: 'High',
        lineStart: firstState.line,
        lineEnd: lastState.endLine,
        lines: { before: allBeforeLines, after: afterText.split('\n') },
        patch: { before: beforeText, after: afterText },
      });
    } else if (dominantGroupKey && dominantGroupStates.length >= 3) {
      // Suggest custom hook
      const domBefore = dominantGroupStates.map(s => s.code).join('\n');
      const hookName = `use${dominantGroupKey.charAt(0).toUpperCase() + dominantGroupKey.slice(1)}`;
      const afterText = `// Grupo dominante "${dominantGroupKey}": sugere extrair para um Custom Hook\n` +
        `const ${hookName} = () => {\n` +
        dominantGroupStates.map(s => `  const [${s.name}, set${s.name.charAt(0).toUpperCase() + s.name.slice(1)}] = useState(null);`).join('\n') +
        `\n  return {\n${dominantGroupStates.map(s => `    ${s.name}, set${s.name.charAt(0).toUpperCase() + s.name.slice(1)},`).join('\n')}\n  };\n};`;

      issues.push({
        id: `state-explosion-hook-${pf.filePath}-${dominantGroupStates[0].line}`,
        file: pf.fileName,
        filePath: pf.filePath,
        category: 'state-explosion',
        problem: `Explosão de estado em \`${compName}\` com grupo dominante de states: \`${dominantGroupKey}\` (${dominantGroupStates.length} useStates). Sugere extrair para um custom hook \`${hookName}\``,
        impact: 'High',
        lineStart: dominantGroupStates[0].line,
        lineEnd: dominantGroupStates[dominantGroupStates.length - 1].endLine,
        lines: { before: dominantGroupStates.map(s => s.code), after: afterText.split('\n') },
        patch: { before: domBefore, after: afterText },
      });
    } else {
      // Generic state explosion
      const stateProps = states.map(s => `  ${s.name}: ...,`).join('\n');
      const afterText = `// Consolida múltiplos states num único state object\n` +
        `const [state, setState] = useState({\n${stateProps}\n});`;

      issues.push({
        id: `state-explosion-generic-${pf.filePath}-${firstState.line}`,
        file: pf.fileName,
        filePath: pf.filePath,
        category: 'state-explosion',
        problem: `Explosão de estado em \`${compName}\` (${states.length} useStates independentes). Sugere consolidar num único objeto de estado`,
        impact: 'High',
        lineStart: firstState.line,
        lineEnd: lastState.endLine,
        lines: { before: allBeforeLines, after: afterText.split('\n') },
        patch: { before: beforeText, after: afterText },
      });
    }
  }

  return issues;
}
