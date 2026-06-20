import { repairFile, rewriteFileToArchitecture } from '../../lib/api'
import { isTsLikeFile, normalizePath, resolveVirtualImport, toRelativeImport } from '../path'
import type {
  ArchitectureBlueprint,
  ArchitectureFileResult,
  ArchitecturePlan,
  ArchitectureTransformResult,
} from '../types'
import { validateVirtualMap } from './validate'

const REWRITE_BATCH_SIZE = 4
const MAX_REPAIR_ROUNDS = 2

export interface ExecuteOptions {
  guidelines?: string
  projectPath?: string
  onProgress?: (event: { phase: 'move' | 'rewrite' | 'validate' | 'repair'; file?: string; done: number; total: number }) => void
}

// Matches relative/alias module specifiers inside import/export/require/dynamic-import.
const IMPORT_SPECIFIER_RE = /((?:import|export)\b[^'"\n]*?\bfrom\s*|import\s*|require\(\s*|import\(\s*)(['"])(\.[^'"]+|@\/[^'"]+)\2/g

/** Rewrites relative/alias import specifiers in `source` for a file moving oldPath -> newPath. */
function rewriteRelativeImports(
  source: string,
  oldPath: string,
  newPath: string,
  oldFileMap: Map<string, string>,
  moveMap: Map<string, string>,
): string {
  return source.replace(IMPORT_SPECIFIER_RE, (full, prefix: string, quote: string, specifier: string) => {
    const resolvedOld = resolveVirtualImport(oldFileMap, oldPath, specifier)
    if (!resolvedOld) return full // external dependency or unresolved — leave as-is
    const resolvedNew = moveMap.get(normalizePath(resolvedOld)) ?? normalizePath(resolvedOld)
    const nextSpecifier = toRelativeImport(newPath, resolvedNew)
    return `${prefix}${quote}${nextSpecifier}${quote}`
  })
}

/** Computes the human-facing list of import changes for a moved file (for the LLM rewrite prompt). */
function computeImportRewrites(
  source: string,
  oldPath: string,
  newPath: string,
  oldFileMap: Map<string, string>,
  moveMap: Map<string, string>,
): Array<{ from: string; to: string }> {
  const changes: Array<{ from: string; to: string }> = []
  let match: RegExpExecArray | null
  const re = new RegExp(IMPORT_SPECIFIER_RE)
  while ((match = re.exec(source)) !== null) {
    const specifier = match[3]
    const resolvedOld = resolveVirtualImport(oldFileMap, oldPath, specifier)
    if (!resolvedOld) continue
    const resolvedNew = moveMap.get(normalizePath(resolvedOld)) ?? normalizePath(resolvedOld)
    const next = toRelativeImport(newPath, resolvedNew)
    if (next !== specifier) changes.push({ from: specifier, to: next })
  }
  return changes
}

async function runInBatches<T>(items: T[], size: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size)
    await Promise.all(slice.map((item, idx) => worker(item, i + idx)))
  }
}

/**
 * Applies an ArchitecturePlan to a copy of the file map and validates the result
 * with the in-memory typechecker, repairing broken files via the LLM. Never
 * mutates the input map; the caller decides whether to commit based on `passed`.
 */
export async function executeArchitecturePlan(
  fileMap: Map<string, string>,
  plan: ArchitecturePlan,
  _blueprint: ArchitectureBlueprint,
  options: ExecuteOptions = {},
): Promise<ArchitectureTransformResult> {
  const { onProgress } = options
  const virtual = new Map<string, string>()
  for (const [path, content] of fileMap.entries()) virtual.set(normalizePath(path), content)

  // Build full move map (old -> new), defaulting unchanged files to themselves.
  const moveMap = new Map<string, string>()
  for (const path of fileMap.keys()) moveMap.set(normalizePath(path), normalizePath(path))
  for (const move of plan.moves) moveMap.set(normalizePath(move.from), normalizePath(move.to))

  const results: ArchitectureFileResult[] = []
  const total = plan.moves.length
  let moveDone = 0

  // ── 1. Deterministic moves (non-rewrite): move + fix imports mechanically ──
  const deterministicMoves = plan.moves.filter((m) => !m.needsRewrite)
  const rewriteMoves = plan.moves.filter((m) => m.needsRewrite)

  for (const move of deterministicMoves) {
    const from = normalizePath(move.from)
    const to = normalizePath(move.to)
    const source = virtual.get(from)
    if (source === undefined) continue
    const updated = isTsLikeFile(from) ? rewriteRelativeImports(source, from, to, fileMap, moveMap) : source
    virtual.delete(from)
    virtual.set(to, updated)
    results.push({ path: to, previousPath: from, status: 'moved' })
    onProgress?.({ phase: 'move', file: to, done: ++moveDone, total })
  }

  // ── 2. LLM rewrites for files flagged needsRewrite, in bounded batches ──
  await runInBatches(rewriteMoves, REWRITE_BATCH_SIZE, async (move) => {
    const from = normalizePath(move.from)
    const to = normalizePath(move.to)
    const source = virtual.get(from)
    if (source === undefined) return

    const importRewrites = computeImportRewrites(source, from, to, fileMap, moveMap)
    let content: string
    try {
      content = await rewriteFileToArchitecture({
        filePath: from,
        targetPath: to,
        source,
        layer: move.layer,
        importRewrites,
        guidelines: options.guidelines,
      })
      if (!content.trim()) throw new Error('empty rewrite')
    } catch (err) {
      // Fall back to deterministic import fixup so the move still happens safely.
      console.error(`[executeArchitecturePlan] rewrite failed for ${from}, using deterministic fixup:`, err)
      content = rewriteRelativeImports(source, from, to, fileMap, moveMap)
    }
    virtual.delete(from)
    virtual.set(to, content)
    results.push({ path: to, previousPath: from, status: 'rewritten' })
    onProgress?.({ phase: 'rewrite', file: to, done: ++moveDone, total })
  })

  // ── 3. Barrels (new files) — best effort; rolled back if they break ──
  for (const newFile of plan.newFiles) {
    const path = normalizePath(newFile.path)
    if (virtual.has(path)) continue
    if (newFile.kind === 'barrel') {
      const layerDir = path.replace(/\/index\.ts$/, '')
      const members = [...virtual.keys()].filter(
        (p) => p !== path && p.startsWith(`${layerDir}/`) && isTsLikeFile(p),
      )
      if (members.length === 0) continue
      const body = members
        .map((m) => `export * from '${toRelativeImport(path, m)}'`)
        .join('\n')
      virtual.set(path, `${body}\n`)
      results.push({ path, status: 'moved' })
    }
  }

  // ── 4. Validate whole virtual map + repair loop ──
  onProgress?.({ phase: 'validate', done: 0, total: 1 })
  let validation = await validateVirtualMap(virtual, options.projectPath)

  for (let round = 0; round < MAX_REPAIR_ROUNDS && !validation.passed; round++) {
    const broken = [...validation.errorsByFile.entries()]
    if (broken.length === 0) break

    await runInBatches(broken, REWRITE_BATCH_SIZE, async ([path, errors]) => {
      const source = virtual.get(path)
      if (source === undefined) return
      onProgress?.({ phase: 'repair', file: path, done: round + 1, total: MAX_REPAIR_ROUNDS })
      try {
        const fixed = await repairFile({ filePath: path, source, errors })
        if (fixed.trim()) virtual.set(path, fixed)
      } catch (err) {
        console.error(`[executeArchitecturePlan] repair failed for ${path}:`, err)
      }
    })

    validation = await validateVirtualMap(virtual, options.projectPath)
  }

  // ── 5. Finalize statuses ──
  const manualReview: ArchitectureFileResult[] = []
  const finalResults = results.map((r): ArchitectureFileResult => {
    const errors = validation.errorsByFile.get(r.path)
    if (errors && errors.length > 0) {
      const flagged: ArchitectureFileResult = { ...r, status: 'manual-review', errors }
      manualReview.push(flagged)
      return flagged
    }
    return { ...r, status: 'validated' }
  })

  for (const path of plan.unchanged) {
    finalResults.push({ path: normalizePath(path), status: 'unchanged' })
  }

  const fileObj: Record<string, string> = {}
  for (const [path, content] of virtual.entries()) fileObj[path] = content

  const stats = {
    filesMoved: deterministicMoves.length,
    filesRewritten: rewriteMoves.length,
    filesValidated: finalResults.filter((r) => r.status === 'validated').length,
    filesManualReview: manualReview.length,
  }

  return {
    blueprintId: plan.blueprintId,
    fileMap: fileObj,
    results: finalResults,
    passed: validation.passed,
    manualReview,
    stats,
  }
}
