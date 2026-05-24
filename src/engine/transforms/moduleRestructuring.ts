import { isTsLikeFile } from '../ast'
import { basename, dirname, joinPath, normalizePath, toRelativeImport } from '../path'
import type { NewFile, TransformProposal } from '../types'

export async function runModuleRestructuring(fileMap: Map<string, string>): Promise<TransformProposal[]> {
  const proposals: TransformProposal[] = []

  for (const [filePath, source] of fileMap.entries()) {
    const targetPath = suggestTargetPath(filePath)
    if (!targetPath || targetPath === filePath) continue

    const dependentRewrites = rewriteDependentImports(filePath, targetPath, fileMap)
    if (dependentRewrites.length === 0) continue

    proposals.push({
      id: `module-restructuring:${filePath}`,
      type: 'module-restructuring',
      filePath,
      title: `Move ${basename(filePath)} into a feature module`,
      description: `Restructure ${filePath} into ${targetPath} and rewrite direct imports to match the new module layout.`,
      before: source,
      after: source,
      movedTo: targetPath,
      newFiles: dependentRewrites,
      blastRadius: {
        affectedFiles: [filePath, ...dependentRewrites.map((entry) => entry.path)],
        dependentComponents: [],
        testRisk: 'medium',
        breakageSurface: 0,
      },
    })
  }

  return proposals
}

function suggestTargetPath(filePath: string): string | null {
  const normalized = normalizePath(filePath)
  const parts = normalized.split('/')
  if (parts.length < 4 || parts[0] !== 'src' || parts[1] !== 'pages') return null

  const featureName = parts[2]
  const name = basename(filePath)
  if (name === 'ProjectView.tsx') return null

  if (/types\.(ts|tsx)$/.test(name)) {
    return joinPath('src', 'features', featureName, name)
  }

  if (/\.(tsx|jsx)$/.test(name)) {
    return joinPath('src', 'features', featureName, 'components', name)
  }

  return null
}

function rewriteDependentImports(filePath: string, targetPath: string, fileMap: Map<string, string>): NewFile[] {
  const updates: NewFile[] = []
  for (const [candidatePath, source] of fileMap.entries()) {
    if (!isTsLikeFile(candidatePath) || candidatePath === filePath) continue
    const nextSource = source.replace(
      new RegExp(`(['"])${escapeForRegex(toRelativeImport(candidatePath, filePath))}\\1`, 'g'),
      (_match, quote: string) => `${quote}${toRelativeImport(candidatePath, targetPath)}${quote}`,
    )
    if (nextSource !== source) updates.push({ path: candidatePath, content: nextSource })
  }
  return updates
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
