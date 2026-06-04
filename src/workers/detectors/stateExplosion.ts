import { Issue, ParsedFile, walk, lineOf, endLineOf } from '../../lib/analyze';

interface StateVar {
  name: string;
  line: number;
  endLine: number;
  code: string;
  initValue: string;
  initType: string;
}

function inferType(initNode: any, source: string): string {
  if (!initNode) return 'any';
  switch (initNode.type) {
    case 'StringLiteral': return 'string';
    case 'NumericLiteral': return 'number';
    case 'BooleanLiteral': return 'boolean';
    case 'NullLiteral': return 'null';
    case 'ArrayExpression': return 'any[]';
    case 'ObjectExpression': return 'Record<string, any>';
    case 'Identifier': {
      if (initNode.name === 'undefined') return 'any';
      return 'any';
    }
    case 'CallExpression': return 'any';
    case 'MemberExpression': return 'any';
    case 'TemplateLiteral': return 'string';
    default: return 'any';
  }
}

function getInitValue(initNode: any, source: string): string {
  if (!initNode) return 'null';
  if (initNode.start != null && initNode.end != null) {
    return source.slice(initNode.start, initNode.end);
  }
  switch (initNode.type) {
    case 'StringLiteral': return `'${initNode.value}'`;
    case 'NumericLiteral': return String(initNode.value);
    case 'BooleanLiteral': return String(initNode.value);
    case 'NullLiteral': return 'null';
    case 'Identifier': return initNode.name === 'undefined' ? 'undefined' : initNode.name;
    default: return 'null';
  }
}

export function detectStateExplosion(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];
  const source = pf.lines.join('\n');

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
              const initNode = node.init.arguments[0];
              states.push({
                name: first.name,
                line: start,
                endLine: end,
                code: pf.lines.slice(start - 1, end).join('\n'),
                initValue: getInitValue(initNode, source),
                initType: inferType(initNode, source),
              });
            }
          }
        }
      },
      FunctionDeclaration(_node, skip) { skip?.() },
      FunctionExpression(_node, skip) { skip?.() },
      ArrowFunctionExpression(_node, skip) { skip?.() },
    });

    if (states.length < 5) return;

    const groups = new Map<string, StateVar[]>();

    function getGroupKey(name: string): string {
      const lower = name.toLowerCase();
      if (lower.includes('load') || lower.includes('fetch') || lower.includes('error') || lower.includes('status')) {
        return 'loading';
      }
      if (lower.includes('filter') || lower.includes('sort') || lower.includes('search')) {
        return 'filters';
      }
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

    let isUseReducer = false;
    let reducerGroupsCount = 0;
    for (const [, list] of groups.entries()) {
      if (list.length >= 2 && getGroupKey(list[0].name) !== 'other') {
        reducerGroupsCount++;
      }
    }
    if (reducerGroupsCount >= 3) {
      isUseReducer = true;
    }

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
      const stateProps = states.map(s => `  ${s.name}: ${s.initValue},`).join('\n');
      const stateTypedProps = states.map(s => `  ${s.name}: ${s.initType};`).join('\n');
      const actionTypes = [...groups.keys()].filter(k => k !== 'other')
        .map(k => `  | { type: 'set${k.charAt(0).toUpperCase() + k.slice(1)}'; payload: Partial<Pick<State, ${groups.get(k)!.map(s => `'${s.name}'`).join(' | ')}>> }`)
        .join('\n');
      const reducerCases = [...groups.keys()].filter(k => k !== 'other')
        .map(k => {
          const groupVars = groups.get(k)!;
          return `    case 'set${k.charAt(0).toUpperCase() + k.slice(1)}': {
      return { ...state, ...action.payload };
    }`;
        }).join('\n');

      const afterText = `interface State {\n${stateTypedProps}\n}\n\n` +
        `type Action =\n${actionTypes || '  | { type: \'reset\' }'};\n\n` +
        `function reducer(state: State, action: Action): State {\n  switch (action.type) {\n${reducerCases || '    default: return state;'}\n    default: return state;\n  }\n}\n\n` +
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
      const domBefore = dominantGroupStates.map(s => s.code).join('\n');
      const hookName = `use${dominantGroupKey.charAt(0).toUpperCase() + dominantGroupKey.slice(1)}`;
      const stateLines = dominantGroupStates.map(s =>
        `  const [${s.name}, set${s.name.charAt(0).toUpperCase() + s.name.slice(1)}] = useState<${s.initType}>(${s.initValue});`
      ).join('\n');
      const returnProps = dominantGroupStates.map(s =>
        `    ${s.name}, set${s.name.charAt(0).toUpperCase() + s.name.slice(1)},`
      ).join('\n');
      const afterText = `const ${hookName} = () => {\n${stateLines}\n  return {\n${returnProps}\n  };\n};`;

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
      const stateProps = states.map(s => `  ${s.name}: ${s.initValue},`).join('\n');
      const afterText = `const [state, setState] = useState({\n${stateProps}\n});`;

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
