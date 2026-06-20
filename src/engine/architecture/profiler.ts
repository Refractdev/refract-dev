import { dirname, isTsLikeFile, normalizePath } from '../path'
import type { ArchitectureProfile, DetectedFramework, DetectedStructure } from '../types'

const FRAMEWORK_SIGNATURES: Array<{ dep: string; framework: DetectedFramework }> = [
  { dep: 'next', framework: 'next' },
  { dep: 'react-native', framework: 'react-native' },
  { dep: '@remix-run/react', framework: 'remix' },
  { dep: 'vue', framework: 'vue' },
  { dep: 'svelte', framework: 'svelte' },
  { dep: '@angular/core', framework: 'angular' },
  { dep: 'react', framework: 'react' },
]

// Folder names that signal an existing layered/feature architecture.
const LAYER_FOLDERS = ['domain', 'application', 'infrastructure', 'presentation', 'usecases', 'use-cases']
const FEATURE_FOLDERS = ['features', 'modules', 'feature']
const TECHNICAL_FOLDERS = ['components', 'hooks', 'utils', 'services', 'pages', 'lib', 'context', 'store', 'api']

interface PackageInfo {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  hasTypeScript: boolean
}

function readPackageJson(fileMap: Map<string, string>): PackageInfo {
  const empty: PackageInfo = { dependencies: {}, devDependencies: {}, hasTypeScript: false }
  let raw: string | undefined
  for (const [path, content] of fileMap.entries()) {
    if (normalizePath(path).endsWith('package.json')) {
      raw = content
      break
    }
  }
  if (!raw) {
    // Fall back to extension heuristics if no package.json is present.
    const hasTs = [...fileMap.keys()].some((p) => /\.tsx?$/.test(p))
    return { ...empty, hasTypeScript: hasTs }
  }

  try {
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const dependencies = parsed.dependencies ?? {}
    const devDependencies = parsed.devDependencies ?? {}
    const hasTypeScript =
      'typescript' in dependencies ||
      'typescript' in devDependencies ||
      [...fileMap.keys()].some((p) => /\.tsx?$/.test(p))
    return { dependencies, devDependencies, hasTypeScript }
  } catch {
    return { ...empty, hasTypeScript: [...fileMap.keys()].some((p) => /\.tsx?$/.test(p)) }
  }
}

function detectFramework(pkg: PackageInfo): DetectedFramework {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const { dep, framework } of FRAMEWORK_SIGNATURES) {
    if (dep in allDeps) return framework
  }
  return 'unknown'
}

function detectBuildTool(pkg: PackageInfo): string | null {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  if ('vite' in allDeps) return 'vite'
  if ('next' in allDeps) return 'next'
  if ('webpack' in allDeps) return 'webpack'
  if ('@remix-run/dev' in allDeps) return 'remix'
  return null
}

/** Returns the top-level folder under `src/` (or repo root) for a given file. */
function topLevelSegment(filePath: string): string | null {
  const normalized = normalizePath(filePath)
  const segments = normalized.split('/').filter(Boolean)
  const srcIdx = segments.indexOf('src')
  const base = srcIdx === -1 ? segments : segments.slice(srcIdx + 1)
  if (base.length < 2) return null // file sits directly in root/src, not in a folder
  return base[0]
}

function detectStructure(fileMap: Map<string, string>): DetectedStructure {
  const folderHits = new Map<string, number>()
  let codeFileCount = 0
  let filesInFolders = 0

  for (const path of fileMap.keys()) {
    if (!isTsLikeFile(path)) continue
    codeFileCount += 1
    const segment = topLevelSegment(path)
    if (!segment) continue
    filesInFolders += 1
    folderHits.set(segment, (folderHits.get(segment) ?? 0) + 1)
  }

  const folders = [...folderHits.keys()]
  const hasLayerFolders = folders.some((f) => LAYER_FOLDERS.includes(f.toLowerCase()))
  const hasFeatureFolders = folders.some((f) => FEATURE_FOLDERS.includes(f.toLowerCase()))
  const technicalFolderCount = folders.filter((f) => TECHNICAL_FOLDERS.includes(f.toLowerCase())).length

  // If most code files sit directly in root/src with no nesting -> flat.
  const folderRatio = codeFileCount === 0 ? 0 : filesInFolders / codeFileCount

  let kind: DetectedStructure['kind']
  if (hasLayerFolders) kind = 'layered'
  else if (hasFeatureFolders) kind = 'feature'
  else if (folderRatio < 0.4) kind = 'flat'
  else if (technicalFolderCount >= 2) kind = 'technical'
  else kind = 'mixed'

  return {
    kind,
    topLevelFolders: folders.sort(),
    codeFileCount,
    folderRatio: Number(folderRatio.toFixed(2)),
  }
}

/**
 * Deterministically profiles a project from its in-memory file map.
 * No LLM, no IO — pure analysis used to seed the architecture planner.
 */
export function profileArchitecture(fileMap: Map<string, string>): ArchitectureProfile {
  const pkg = readPackageJson(fileMap)
  const framework = detectFramework(pkg)
  const buildTool = detectBuildTool(pkg)
  const structure = detectStructure(fileMap)

  const directories = new Set<string>()
  for (const path of fileMap.keys()) {
    if (!isTsLikeFile(path)) continue
    const dir = dirname(path)
    if (dir) directories.add(dir)
  }

  return {
    framework,
    buildTool,
    language: pkg.hasTypeScript ? 'typescript' : 'javascript',
    structure,
    directoryCount: directories.size,
    keyDependencies: Object.keys({ ...pkg.dependencies }).slice(0, 30),
  }
}
