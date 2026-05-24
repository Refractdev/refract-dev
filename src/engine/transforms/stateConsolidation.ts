import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/typescript-estree'
import { applyReplacements, getNodeText, isTsxFile, isUseStateCall, parseSource, returnsJsx } from '../ast'
import { dirname, extname, joinPath, toRelativeImport } from '../path'
import { suggestSemanticHookName } from '../naming'
import type { NewFile, TransformProposal } from '../types'

type ComponentNode = TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression

interface ComponentCandidate {
  name: string
  node: ComponentNode
}

interface StateEntry {
  stateName: string
  setterName: string
  typeName: string
  initialSource: string
  declaration: TSESTree.VariableDeclaration
}

export async function runStateConsolidation(fileMap: Map<string, string>): Promise<TransformProposal[]> {
  const proposals: TransformProposal[] = []

  for (const [filePath, source] of fileMap.entries()) {
    if (!isTsxFile(filePath)) continue

    try {
      const ast = parseSource(source, filePath)
      for (const component of getComponents(ast.body)) {
        const states = collectUseStates(component, source)
        if (states.length < 4) continue

        const groups = buildGroups(states, component.node, source)
        for (const group of groups.filter((candidate) => candidate.length >= 3)) {
          const hookName = await suggestSemanticHookName({
            filePath,
            ownerName: component.name,
            currentName: `${component.name}State`,
            symbols: group.map((entry) => entry.stateName),
          })
          const hookPath = createHookPath(filePath, hookName)
          const hookImport = `import { ${hookName} } from '${toRelativeImport(filePath, hookPath)}'`
          const importEnd = ast.body.filter((node) => node.type === AST_NODE_TYPES.ImportDeclaration).at(-1)?.range[1] ?? 0
          const replacements = group.map((entry, index) => ({
            start: entry.declaration.range[0],
            end: entry.declaration.range[1],
            text: index === 0 ? buildHookDestructuring(hookName, group) : '',
          }))

          replacements.push({
            start: importEnd,
            end: importEnd,
            text: `${importEnd > 0 ? '\n' : ''}${hookImport}\n`,
          })

          const after = applyReplacements(source, replacements)
          if (after === source) continue

          const newFiles: NewFile[] = [{ path: hookPath, content: buildHookFile(hookName, group) }]
          proposals.push({
            id: `state-consolidation:${filePath}:${hookName}`,
            type: 'state-consolidation',
            filePath,
            title: `Consolidate local state in ${component.name}`,
            description: `Move ${group.length} related useState calls into ${hookName} backed by a reducer.`,
            before: source,
            after,
            newFiles,
            blastRadius: {
              affectedFiles: [filePath],
              dependentComponents: [],
              testRisk: 'low',
              breakageSurface: 0,
            },
          })
        }
      }
    } catch {
      continue
    }
  }

  return proposals
}

function getComponents(nodes: TSESTree.ProgramStatement[]): ComponentCandidate[] {
  const components: ComponentCandidate[] = []

  for (const node of nodes) {
    if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id && /^[A-Z]/.test(node.id.name) && returnsJsx(node.body)) {
      components.push({ name: node.id.name, node })
      continue
    }

    if (node.type !== AST_NODE_TYPES.VariableDeclaration) continue
    for (const declaration of node.declarations) {
      if (
        declaration.id.type === AST_NODE_TYPES.Identifier &&
        declaration.init &&
        (declaration.init.type === AST_NODE_TYPES.ArrowFunctionExpression || declaration.init.type === AST_NODE_TYPES.FunctionExpression) &&
        /^[A-Z]/.test(declaration.id.name) &&
        returnsJsx(declaration.init.body)
      ) {
        components.push({ name: declaration.id.name, node: declaration.init })
      }
    }
  }

  return components
}

function collectUseStates(
  component: ComponentCandidate,
  source: string,
): StateEntry[] {
  if (component.node.body.type !== AST_NODE_TYPES.BlockStatement) return []
  const statements = component.node.body.body
  const states: StateEntry[] = []

  for (const statement of statements) {
    if (statement.type !== AST_NODE_TYPES.VariableDeclaration) continue
    const declaration = statement.declarations[0]
    if (!declaration || declaration.id.type !== AST_NODE_TYPES.ArrayPattern || !isUseStateCall(declaration.init)) continue

    const [stateSlot, setterSlot] = declaration.id.elements
    if (!stateSlot || !setterSlot || stateSlot.type !== AST_NODE_TYPES.Identifier || setterSlot.type !== AST_NODE_TYPES.Identifier) continue

    const initializer = declaration.init.arguments[0]
    states.push({
      stateName: stateSlot.name,
      setterName: setterSlot.name,
      typeName: inferStateType(declaration.init, source),
      initialSource: initializer ? getNodeText(source, initializer) : 'undefined',
      declaration: statement,
    })
  }

  return states
}

function buildGroups(
  states: StateEntry[],
  component: ComponentNode,
  source: string,
): StateEntry[][] {
  const relations = new Map<string, Set<string>>()
  states.forEach((entry) => relations.set(entry.stateName, new Set([entry.stateName])))

  for (let index = 0; index < states.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < states.length; compareIndex += 1) {
      if (areRelated(states[index], states[compareIndex], component, source)) {
        relations.get(states[index].stateName)?.add(states[compareIndex].stateName)
        relations.get(states[compareIndex].stateName)?.add(states[index].stateName)
      }
    }
  }

  const seen = new Set<string>()
  const groups: StateEntry[][] = []

  for (const entry of states) {
    if (seen.has(entry.stateName)) continue
    const queue = [entry.stateName]
    const bucket = new Set<string>()
    while (queue.length > 0) {
      const current = queue.shift()!
      if (bucket.has(current)) continue
      bucket.add(current)
      relations.get(current)?.forEach((next) => queue.push(next))
    }
    bucket.forEach((name) => seen.add(name))
    groups.push(
      [...bucket]
        .map((name) => states.find((state) => state.stateName === name))
        .filter((state): state is StateEntry => Boolean(state)),
    )
  }

  return groups
}

function areRelated(
  left: StateEntry,
  right: StateEntry,
  component: ComponentNode,
  source: string,
): boolean {
  const leftBase = normalizeName(left.stateName)
  const rightBase = normalizeName(right.stateName)
  if (leftBase && rightBase && (leftBase === rightBase || leftBase.startsWith(rightBase) || rightBase.startsWith(leftBase))) return true

  const text = getNodeText(source, component.body)
  const togetherPattern = new RegExp(`${left.setterName}[\\s\\S]{0,160}${right.setterName}|${right.setterName}[\\s\\S]{0,160}${left.setterName}`)
  return togetherPattern.test(text)
}

function buildHookDestructuring(hookName: string, group: StateEntry[]): string {
  const identifiers = group.flatMap((entry) => [entry.stateName, entry.setterName]).join(', ')
  const initialState = group.map((entry) => `${entry.stateName}: ${entry.initialSource}`).join(', ')
  return `const { ${identifiers} } = ${hookName}({ ${initialState} })`
}

function buildHookFile(hookName: string, group: StateEntry[]): string {
  const stateShape = group.map((entry) => `  ${entry.stateName}: ${entry.typeName}`).join('\n')
  const actionShape = group
    .map((entry) => `  | { type: '${entry.setterName}'; value: State['${entry.stateName}'] | ((current: State['${entry.stateName}']) => State['${entry.stateName}']) }`)
    .join('\n')
  const reducerCases = group
    .map((entry) => `    case '${entry.setterName}':\n      return { ...state, ${entry.stateName}: typeof action.value === 'function' ? action.value(state.${entry.stateName}) : action.value }`)
    .join('\n')
  const setters = group
    .map((entry) => `    ${entry.setterName}: (value: Action['value']) => dispatch({ type: '${entry.setterName}', value }),`)
    .join('\n')
  const defaultState = group.map((entry) => `    ${entry.stateName}: seed.${entry.stateName} ?? undefined as State['${entry.stateName}']`).join(',\n')

  return `import { useReducer } from 'react'\n\ntype State = {\n${stateShape}\n}\n\ntype Action =\n${actionShape}\n\nfunction reducer(state: State, action: Action): State {\n  switch (action.type) {\n${reducerCases}\n    default:\n      return state\n  }\n}\n\nexport function ${hookName}(seed: Partial<State> = {}) {\n  const [state, dispatch] = useReducer(reducer, {\n${defaultState}\n  })\n\n  return {\n    ...state,\n${setters}\n  }\n}\n`
}

function normalizeName(name: string): string {
  return name.replace(/^(is|has|set)/, '').replace(/(State|Value|Data)$/i, '').toLowerCase()
}

function inferStateType(call: TSESTree.CallExpression, source: string): string {
  const typeArg = call.typeArguments?.params[0]
  if (typeArg) return getNodeText(source, typeArg)
  const init = call.arguments[0]
  if (!init) return 'any'
  if (init.type === AST_NODE_TYPES.Literal) {
    if (typeof init.value === 'string') return 'string'
    if (typeof init.value === 'number') return 'number'
    if (typeof init.value === 'boolean') return 'boolean'
  }
  if (init.type === AST_NODE_TYPES.ArrayExpression) return 'any[]'
  if (init.type === AST_NODE_TYPES.ObjectExpression) return 'Record<string, any>'
  return 'any'
}

function createHookPath(filePath: string, hookName: string): string {
  return joinPath(dirname(filePath), `${hookName}${extname(filePath) === '.jsx' ? '.js' : '.ts'}`)
}
