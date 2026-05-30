import { AST_NODE_TYPES, simpleTraverse, type TSESTree } from '@typescript-eslint/typescript-estree'
import { applyReplacements, collectUsedIdentifiers, isTsLikeFile, parseSource } from '../ast'
import { resolveVirtualImport } from '../path'
import type { TransformProposal } from '../types'

export async function runImportCleanup(fileMap: Map<string, string>): Promise<TransformProposal[]> {
  const files = [...fileMap.keys()].filter(isTsLikeFile)
  const dependencyMap = new Map<string, Set<string>>()

  for (const filePath of files) {
    const source = fileMap.get(filePath)
    if (!source) continue

    try {
      const ast = parseSource(source, filePath)
      const imports = new Set<string>()

      simpleTraverse(ast, {
        enter(node) {
          if (node.type !== AST_NODE_TYPES.ImportDeclaration) return
          const resolved = resolveVirtualImport(fileMap, filePath, node.source.value)
          if (resolved && resolved !== node.source.value) imports.add(resolved)
        },
      })

      dependencyMap.set(filePath, imports)
    } catch {
      dependencyMap.set(filePath, new Set())
    }
  }

  const proposals: TransformProposal[] = []

  for (const filePath of files) {
    const source = fileMap.get(filePath)
    if (!source) continue

    try {
      const ast = parseSource(source, filePath)
      const used = collectUsedIdentifiers(ast)
      const importNodes = ast.body.filter((node): node is TSESTree.ImportDeclaration => node.type === AST_NODE_TYPES.ImportDeclaration)
      if (importNodes.length === 0) continue

      const deletedImports: string[] = []
      const nextImports = importNodes
        .map((node) => {
          if (node.specifiers.length === 0) return source.slice(node.range[0], node.range[1]).trim()

          const kept = node.specifiers.filter((specifier) => used.has(specifier.local.name))
          const removed = node.specifiers.filter((specifier) => !used.has(specifier.local.name))
          removed.forEach((specifier) => deletedImports.push(specifier.local.name))

          if (kept.length === 0) return null
          return serializeImport(node, kept)
        })
        .filter((value): value is string => Boolean(value))
        .sort(compareImports)

      const importStart = importNodes[0].range[0]
      const importEnd = importNodes[importNodes.length - 1].range[1]
      const nextImportBlock = nextImports.join('\n')
      const after = applyReplacements(source, [{ start: importStart, end: importEnd, text: nextImportBlock }])
      const directCycles = [...(dependencyMap.get(filePath) ?? new Set())].filter((candidate) => dependencyMap.get(candidate)?.has(filePath))

      console.log(`[importCleanup] file: ${filePath}, deletedImports:`, deletedImports, `after === source: ${after === source}`)
      if (after === source && directCycles.length === 0) continue

      proposals.push({
        id: `import-cleanup:${filePath}`,
        type: 'import-cleanup',
        filePath,
        title: `Clean imports in ${filePath.split('/').pop() ?? filePath}`,
        description:
          directCycles.length > 0
            ? `Remove unused imports, normalize ordering, and flag direct circular imports with ${directCycles.join(', ')}.`
            : 'Remove unused imports and normalize import ordering deterministically.',
        before: source,
        after,
        deletedImports,
        blastRadius: {
          affectedFiles: [filePath],
          dependentComponents: [],
          testRisk: 'low',
          breakageSurface: 0,
        },
      })
    } catch {
      continue
    }
  }

  return proposals
}

function serializeImport(node: TSESTree.ImportDeclaration, specifiers: TSESTree.ImportDeclaration['specifiers']): string {
  const defaultSpecifier = specifiers.find((specifier) => specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier)
  const namespaceSpecifier = specifiers.find((specifier) => specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier)
  const namedSpecifiers = specifiers.filter((specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier)
  const clauses: string[] = []

  if (defaultSpecifier) clauses.push(defaultSpecifier.local.name)
  if (namespaceSpecifier) clauses.push(`* as ${namespaceSpecifier.local.name}`)
  if (namedSpecifiers.length > 0) {
    const named = namedSpecifiers
      .map((specifier) =>
        specifier.imported.type === AST_NODE_TYPES.Identifier && specifier.imported.name !== specifier.local.name
          ? `${specifier.imported.name} as ${specifier.local.name}`
          : specifier.local.name,
      )
      .sort((left, right) => left.localeCompare(right))
      .join(', ')
    clauses.push(`{ ${named} }`)
  }

  const prefix = node.importKind === 'type' ? 'import type' : 'import'
  return clauses.length === 0 ? `${prefix} '${node.source.value}'` : `${prefix} ${clauses.join(', ')} from '${node.source.value}'`
}

function compareImports(left: string, right: string): number {
  const group = (statement: string) => {
    const match = statement.match(/from '([^']+)'|import '([^']+)'/)
    const source = match?.[1] ?? match?.[2] ?? ''
    if (!source.startsWith('.') && !source.startsWith('@/')) return 0
    if (source.startsWith('@/')) return 1
    return 2
  }

  const groupDiff = group(left) - group(right)
  return groupDiff !== 0 ? groupDiff : left.localeCompare(right)
}
