import { AST_NODE_TYPES, simpleTraverse, type TSESTree } from '@typescript-eslint/typescript-estree'
import { applyReplacements, collectDeclaredNames, collectUsedIdentifiers, getNodeText, isTsxFile, lineSpan, parseSource, returnsJsx } from '../ast'
import { dirname, extname, joinPath, toRelativeImport } from '../path'
import { suggestSemanticComponentName } from '../naming'
import type { NewFile, TransformProposal } from '../types'

const GLOBAL_IDENTIFIERS = new Set([
  'Array', 'Boolean', 'Date', 'JSON', 'Math', 'Number', 'Object', 'Promise', 'React',
  'String', 'URL', 'clearTimeout', 'console', 'document', 'fetch', 'setTimeout', 'window',
])

type ComponentNode = TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression

interface ComponentCandidate {
  name: string
  node: ComponentNode
}

interface RendererCandidate {
  name: string
  statementNode: TSESTree.FunctionDeclaration | TSESTree.VariableDeclaration
  params: TSESTree.Parameter[]
  body: TSESTree.BlockStatement | TSESTree.Expression
}

export async function runComponentDecomposition(fileMap: Map<string, string>, guidelines?: string): Promise<TransformProposal[]> {
  const proposals: TransformProposal[] = []

  for (const [filePath, source] of fileMap.entries()) {
    if (!isTsxFile(filePath)) continue

    try {
      const ast = parseSource(source, filePath)
      const imports = ast.body.filter((node): node is TSESTree.ImportDeclaration => node.type === AST_NODE_TYPES.ImportDeclaration)
      const importLocals = buildImportMap(imports)
      const components = getComponentCandidates(ast.body)

      for (const component of components) {
        const renderers = getSubRenderers(component.node)
        if (renderers.length === 0) continue

        const hasSubRenderers = renderers.length >= 2
        if (lineSpan(component.node) <= 80 && !hasSubRenderers) continue

        const occupiedPaths = new Set([...fileMap.keys()])
        const replacements: Array<{ start: number; end: number; text: string }> = []
        const importStatements: string[] = []
        const newFiles: NewFile[] = []

        for (const renderer of renderers) {
          const callSites = findRendererCallSites(component.node, renderer.name)
          if (callSites.length === 0) continue

          const params = renderer.params.map((param) => (param.type === AST_NODE_TYPES.Identifier ? param.name : '')).filter(Boolean)
          if (params.length !== renderer.params.length) continue

          const localNames = collectDeclaredNames(renderer.statementNode)
          localNames.add(renderer.name)
          const usedNames = [...collectUsedIdentifiers(renderer.statementNode)].filter((name) => !localNames.has(name))
          const usedImports = usedNames.filter((name) => importLocals.has(name))
          const externalProps = [...new Set(usedNames.filter((name) => !GLOBAL_IDENTIFIERS.has(name) && !importLocals.has(name) && !params.includes(name)))]

          const componentName = await suggestSemanticComponentName({
            filePath,
            ownerName: component.name,
            currentName: renderer.name,
            symbols: [...params, ...externalProps],
            guidelines,
          })

          const nextPath = createComponentPath(filePath, componentName, occupiedPaths)
          occupiedPaths.add(nextPath)
          importStatements.push(`import { ${componentName} } from '${toRelativeImport(filePath, nextPath)}'`)
          newFiles.push({
            path: nextPath,
            content: buildComponentFile(source, ast.body, component.node, renderer, componentName, params, externalProps, usedImports, importLocals),
          })

          replacements.push({ start: renderer.statementNode.range[0], end: renderer.statementNode.range[1], text: '' })
          for (const call of callSites) {
            replacements.push({
              start: call.range[0],
              end: call.range[1],
              text: buildComponentInvocation(source, call, componentName, params, externalProps),
            })
          }
        }

        if (newFiles.length === 0) continue

        const insertionPoint = imports.length > 0 ? imports[imports.length - 1].range[1] : 0
        replacements.push({
          start: insertionPoint,
          end: insertionPoint,
          text: `${imports.length > 0 ? '\n' : ''}${[...new Set(importStatements)].join('\n')}\n`,
        })

        const after = applyReplacements(source, replacements)
        if (after === source) continue

        proposals.push({
          id: `component-decomposition:${filePath}`,
          type: 'component-decomposition',
          filePath,
          title: `Extract sub-renderers from ${component.name}`,
          description: `Split render helpers inside ${component.name} into standalone components with typed props.`,
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
    } catch (err) {
      console.error(`[runComponentDecomposition] error:`, err)
      continue
    }
  }

  return proposals
}

function getComponentCandidates(nodes: TSESTree.ProgramStatement[]): ComponentCandidate[] {
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

function getSubRenderers(component: ComponentNode): RendererCandidate[] {
  const body = component.body.type === AST_NODE_TYPES.BlockStatement ? component.body.body : []
  const renderers: RendererCandidate[] = []

  for (const statement of body) {
    if (statement.type === AST_NODE_TYPES.FunctionDeclaration && statement.id && /^render[A-Z]/.test(statement.id.name) && returnsJsx(statement.body)) {
      renderers.push({ name: statement.id.name, statementNode: statement, params: statement.params, body: statement.body })
      continue
    }

    if (statement.type !== AST_NODE_TYPES.VariableDeclaration) continue
    for (const declaration of statement.declarations) {
      if (
        declaration.id.type === AST_NODE_TYPES.Identifier &&
        declaration.init &&
        (declaration.init.type === AST_NODE_TYPES.ArrowFunctionExpression || declaration.init.type === AST_NODE_TYPES.FunctionExpression) &&
        /^render[A-Z]/.test(declaration.id.name) &&
        returnsJsx(declaration.init.body)
      ) {
        renderers.push({
          name: declaration.id.name,
          statementNode: statement,
          params: declaration.init.params,
          body: declaration.init.body,
        })
      }
    }
  }

  return renderers
}

function findRendererCallSites(
  component: ComponentNode,
  rendererName: string,
): TSESTree.CallExpression[] {
  const matches: TSESTree.CallExpression[] = []
  const root = component.body.type === AST_NODE_TYPES.BlockStatement ? component.body : component

  const visit = (node: TSESTree.Node) => {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === rendererName
    ) {
      matches.push(node)
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || !value || typeof value !== 'object') continue
      if (Array.isArray(value)) value.forEach((child) => child && typeof child === 'object' && 'type' in child && visit(child as TSESTree.Node))
      else if ('type' in value) visit(value as TSESTree.Node)
    }
  }

  visit(root)
  return matches
}

function resolveTypeFromScope(
  typeName: string,
  propertyName: string,
  programBody: TSESTree.ProgramStatement[],
  source: string
): string | null {
  for (const node of programBody) {
    if (node.type === AST_NODE_TYPES.TSInterfaceDeclaration && node.id.name === typeName) {
      for (const member of node.body.body) {
        if (member.type === AST_NODE_TYPES.TSPropertySignature && member.key.type === AST_NODE_TYPES.Identifier && member.key.name === propertyName && member.typeAnnotation) {
          return source.slice(member.typeAnnotation.typeAnnotation.range[0], member.typeAnnotation.typeAnnotation.range[1])
        }
      }
    }
    if (node.type === AST_NODE_TYPES.TSTypeAliasDeclaration && node.id.name === typeName && node.typeAnnotation.type === AST_NODE_TYPES.TSTypeLiteral) {
      for (const member of node.typeAnnotation.members) {
        if (member.type === AST_NODE_TYPES.TSPropertySignature && member.key.type === AST_NODE_TYPES.Identifier && member.key.name === propertyName && member.typeAnnotation) {
          return source.slice(member.typeAnnotation.typeAnnotation.range[0], member.typeAnnotation.typeAnnotation.range[1])
        }
      }
    }
  }
  return null
}

function inferVariableType(
  name: string,
  componentNode: TSESTree.Node,
  programBody: TSESTree.ProgramStatement[],
  source: string
): string {
  if (
    componentNode.type === AST_NODE_TYPES.FunctionDeclaration ||
    componentNode.type === AST_NODE_TYPES.FunctionExpression ||
    componentNode.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    for (const param of componentNode.params) {
      if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation) {
        const typeName = source.slice(param.typeAnnotation.typeAnnotation.range[0], param.typeAnnotation.typeAnnotation.range[1])
        const resolved = resolveTypeFromScope(typeName, name, programBody, source)
        if (resolved) return resolved
      }
      if (param.type === AST_NODE_TYPES.ObjectPattern && param.typeAnnotation) {
        const typeName = source.slice(param.typeAnnotation.typeAnnotation.range[0], param.typeAnnotation.typeAnnotation.range[1])
        const resolved = resolveTypeFromScope(typeName, name, programBody, source)
        if (resolved) return resolved
      }
    }
  }

  let resolvedType = 'unknown'
  simpleTraverse(componentNode, {
    enter(node: TSESTree.Node) {
      if (
        node.type === AST_NODE_TYPES.VariableDeclarator &&
        node.id.type === AST_NODE_TYPES.Identifier &&
        node.id.name === name
      ) {
        if (node.id.typeAnnotation) {
          resolvedType = source.slice(node.id.typeAnnotation.typeAnnotation.range[0], node.id.typeAnnotation.typeAnnotation.range[1])
        } else if (node.init) {
          if (node.init.type === AST_NODE_TYPES.Literal) {
            if (typeof node.init.value === 'string') resolvedType = 'string'
            else if (typeof node.init.value === 'number') resolvedType = 'number'
            else if (typeof node.init.value === 'boolean') resolvedType = 'boolean'
          } else if (node.init.type === AST_NODE_TYPES.ArrayExpression) {
            resolvedType = 'unknown[]'
          } else if (node.init.type === AST_NODE_TYPES.ObjectExpression) {
            resolvedType = 'Record<string, unknown>'
          }
        }
      }
    },
  }, true)

  return resolvedType
}

function buildComponentFile(
  source: string,
  programBody: TSESTree.ProgramStatement[],
  componentNode: TSESTree.Node,
  renderer: RendererCandidate,
  componentName: string,
  params: string[],
  externalProps: string[],
  usedImports: string[],
  importLocals: Map<string, TSESTree.ImportDeclaration>,
): string {
  const props = [...new Set([...params, ...externalProps])]
  
  const propTypes = props.map((name) => {
    const inferred = inferVariableType(name, componentNode, programBody, source)
    const typeWords = inferred.match(/[a-zA-Z0-9_]+/g) || []
    for (const word of typeWords) {
      if (importLocals.has(word)) {
        usedImports.push(word)
      }
    }
    return `  ${name}: ${inferred}`
  })

  const propsType = props.length === 0
    ? `type ${componentName}Props = Record<string, never>\n`
    : `interface ${componentName}Props {\n${propTypes.join('\n')}\n}\n`

  const importLines = [...new Set(usedImports)]
    .map((name) => importLocals.get(name))
    .filter((node): node is TSESTree.ImportDeclaration => Boolean(node))
    .map((node) => getNodeText(source, node))

  const bodyText = renderer.body.type === AST_NODE_TYPES.BlockStatement
    ? getNodeText(source, renderer.body)
    : `{\n  return ${getNodeText(source, renderer.body)}\n}`

  const propsArg = props.length === 0 ? '_props' : `{ ${props.join(', ')} }`
  return `${importLines.join('\n')}${importLines.length > 0 ? '\n\n' : ''}${propsType}\nexport function ${componentName}(${propsArg}: ${componentName}Props) ${bodyText}\n`
}

function buildComponentInvocation(
  source: string,
  call: TSESTree.CallExpression,
  componentName: string,
  params: string[],
  externalProps: string[],
): string {
  const propEntries = params.map((name, index) => `${name}={${call.arguments[index] ? getNodeText(source, call.arguments[index] as TSESTree.Node) : name}}`)
  const outerProps = externalProps.filter((name) => !params.includes(name)).map((name) => `${name}={${name}}`)
  const props = [...propEntries, ...outerProps].join(' ')
  return props ? `<${componentName} ${props} />` : `<${componentName} />`
}

function buildImportMap(imports: TSESTree.ImportDeclaration[]): Map<string, TSESTree.ImportDeclaration> {
  const map = new Map<string, TSESTree.ImportDeclaration>()
  imports.forEach((node) => node.specifiers.forEach((specifier) => map.set(specifier.local.name, node)))
  return map
}

function createComponentPath(filePath: string, componentName: string, occupiedPaths: Set<string>): string {
  const extension = extname(filePath) || '.tsx'
  const directory = dirname(filePath)
  let nextPath = joinPath(directory, `${componentName}${extension}`)
  let suffix = 1

  while (occupiedPaths.has(nextPath)) {
    nextPath = joinPath(directory, `${componentName}${suffix}${extension}`)
    suffix += 1
  }

  return nextPath
}
