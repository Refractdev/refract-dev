import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/typescript-estree'
import { applyReplacements, collectUsedIdentifiers, getNodeText, isTsxFile, parseSource, returnsJsx } from '../ast'
import { toRelativeImport } from '../path'
import type { NewFile, TransformProposal } from '../types'

const GLOBAL_CALL_IDENTIFIERS = new Set(['axios', 'fetch', 'JSON', 'Promise', 'console', 'window', 'document'])

type ComponentNode = TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression

interface ComponentCandidate {
  name: string
  node: ComponentNode
}

interface ApiCallCandidate {
  call: TSESTree.CallExpression
  callSource: string
  dependencies: string[]
  functionName: string
  kind: 'fetch' | 'axios'
}

export async function runApiCentralization(fileMap: Map<string, string>, guidelines?: string): Promise<TransformProposal[]> {
  const proposals: TransformProposal[] = []
  const servicePath = 'src/services/api.ts'
  const existingService = fileMap.get(servicePath) ?? ''

  for (const [filePath, source] of fileMap.entries()) {
    if (!isTsxFile(filePath)) continue

    try {
      const ast = parseSource(source, filePath)
      const apiCalls = getComponents(ast.body).flatMap((component) => collectApiCalls(component.node, source, component.name))
      console.log(`[apiCentralization] file: ${filePath}, apiCalls.length: ${apiCalls.length}`)
      if (apiCalls.length === 0) continue

      const generatedCalls = apiCalls.map((apiCall, index) => ({
        ...apiCall,
        generatedName: `${apiCall.functionName}${index > 0 ? index + 1 : ''}`,
      }))

      const nextFunctions: string[] = []
      const replacements: Array<{ start: number; end: number; text: string }> = []
      const importEnd = ast.body.filter((node) => node.type === AST_NODE_TYPES.ImportDeclaration).at(-1)?.range[1] ?? 0
      const importStatement = `import { ${generatedCalls.map((entry) => entry.generatedName).join(', ')} } from '${toRelativeImport(filePath, servicePath)}'`

      for (const apiCall of generatedCalls) {
        const args = apiCall.dependencies.map((name) => `${name}: any`).join(', ')
        nextFunctions.push(`export function ${apiCall.generatedName}(${args}) {\n  return ${apiCall.callSource}\n}`)
        replacements.push({
          start: apiCall.call.range[0],
          end: apiCall.call.range[1],
          text: `${apiCall.generatedName}(${apiCall.dependencies.join(', ')})`,
        })
      }

      replacements.push({
        start: importEnd,
        end: importEnd,
        text: `${importEnd > 0 ? '\n' : ''}${importStatement}\n`,
      })

      const after = applyReplacements(source, replacements)
      if (after === source) continue

      const newFiles: NewFile[] = [{
        path: servicePath,
        content: buildServiceFile(existingService, nextFunctions, apiCalls.some((entry) => entry.kind === 'axios')),
      }]

      proposals.push({
        id: `api-centralization:${filePath}`,
        type: 'api-centralization',
        filePath,
        title: `Centralize API calls in ${filePath.split('/').pop() ?? filePath}`,
        description: `Move inline network calls into ${servicePath} and replace them with typed service helpers.`,
        before: source,
        after,
        newFiles,
        blastRadius: {
          affectedFiles: [filePath, servicePath],
          dependentComponents: [],
          testRisk: 'low',
          breakageSurface: 0,
        },
      })
    } catch (err) {
      console.error(`[runApiCentralization] error:`, err)
      continue
    }
  }

  return proposals
}

function getComponents(nodes: TSESTree.ProgramStatement[]): ComponentCandidate[] {
  const components: ComponentCandidate[] = []

  for (let node of nodes) {
    if (node.type === AST_NODE_TYPES.ExportDefaultDeclaration || node.type === AST_NODE_TYPES.ExportNamedDeclaration) {
      if (node.declaration) {
        node = node.declaration as any
      }
    }

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

function collectApiCalls(
  component: ComponentNode,
  source: string,
  componentName: string,
): ApiCallCandidate[] {
  const matches: ApiCallCandidate[] = []

  const visit = (node: TSESTree.Node) => {
    if (node.type === AST_NODE_TYPES.CallExpression) {
      const kind = getApiKind(node)
      if (kind) {
        const dependencies = [...collectUsedIdentifiers(node)]
          .filter((name) => !GLOBAL_CALL_IDENTIFIERS.has(name))
          .sort((left, right) => left.localeCompare(right))
        matches.push({
          call: node,
          callSource: getNodeText(source, node),
          dependencies,
          functionName: inferFunctionName(componentName, node, source),
          kind,
        })
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || !value || typeof value !== 'object') continue
      if (Array.isArray(value)) value.forEach((child) => child && typeof child === 'object' && 'type' in child && visit(child as TSESTree.Node))
      else if ('type' in value) visit(value as TSESTree.Node)
    }
  }

  visit(component.body.type === AST_NODE_TYPES.BlockStatement ? component.body : component)
  return matches
}

function getApiKind(node: TSESTree.CallExpression): 'fetch' | 'axios' | null {
  if (node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'fetch') return 'fetch'
  if (node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'axios') return 'axios'
  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === 'axios'
  ) {
    return 'axios'
  }
  return null
}

function inferFunctionName(componentName: string, node: TSESTree.CallExpression, source: string): string {
  const firstArg = node.arguments[0]
  const raw = firstArg ? getNodeText(source, firstArg).replace(/[`'"]/g, '') : ''
  const match = raw.match(/[a-z0-9]+/gi)
  const suffix = match?.slice(-2).map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join('') || 'Request'
  return `${componentName}${suffix}`
}

function buildServiceFile(existingService: string, functions: string[], needsAxios: boolean): string {
  const axiosImport = needsAxios && !existingService.includes("from 'axios'") ? "import axios from 'axios'\n\n" : ''
  const separator = existingService.trim() ? '\n\n' : ''
  return `${axiosImport}${existingService.trim()}${separator}${functions.join('\n\n')}\n`.trimStart()
}
