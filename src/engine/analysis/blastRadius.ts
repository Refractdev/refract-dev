import { AST_NODE_TYPES, simpleTraverse } from '@typescript-eslint/typescript-estree'
import { isTsLikeFile, parseSource } from '../ast'
import { resolveVirtualImport } from '../path'
import type { BlastRadius } from '../types'

export function calculateBlastRadius(filePath: string, fileMap: Map<string, string>): BlastRadius {
  const dependencies = new Map<string, Set<string>>()
  const reverseDependencies = new Map<string, Set<string>>()
  const sourceFiles = [...fileMap.keys()].filter(isTsLikeFile)

  for (const path of sourceFiles) {
    const source = fileMap.get(path)
    if (!source) continue

    try {
      const ast = parseSource(source, path)
      const imports = new Set<string>()

      simpleTraverse(ast, {
        enter(node) {
          if (node.type !== AST_NODE_TYPES.ImportDeclaration) return
          const resolved = resolveVirtualImport(fileMap, path, node.source.value)
          if (!resolved || resolved === node.source.value) return
          imports.add(resolved)
        },
      })

      dependencies.set(path, imports)
      for (const imported of imports) {
        if (!reverseDependencies.has(imported)) reverseDependencies.set(imported, new Set())
        reverseDependencies.get(imported)?.add(path)
      }
    } catch {
      dependencies.set(path, new Set())
    }
  }

  const firstLevel = [...(reverseDependencies.get(filePath) ?? new Set())]
  const secondLevel = new Set<string>()
  firstLevel.forEach((importer) => {
    ;[...(reverseDependencies.get(importer) ?? new Set())].forEach((consumer) => secondLevel.add(consumer))
  })

  const affectedFiles = [...new Set([filePath, ...firstLevel, ...secondLevel])].sort()
  const dependentComponents = affectedFiles.filter((candidate) => /\.(tsx|jsx)$/.test(candidate) && candidate !== filePath)
  const testFiles = affectedFiles.filter((candidate) => /\.((test|spec)\.(ts|tsx|js|jsx))$/.test(candidate))
  const breakageSurface = sourceFiles.length === 0 ? 0 : Math.min(100, Math.round((affectedFiles.length / sourceFiles.length) * 100))

  return {
    affectedFiles,
    dependentComponents,
    testRisk: testFiles.length > 0 ? 'high' : breakageSurface > 35 ? 'medium' : 'low',
    breakageSurface,
  }
}
