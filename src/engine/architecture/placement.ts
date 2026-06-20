import { isTsLikeFile } from '../ast'
import { basename, dirname, joinPath, normalizePath } from '../path'
import type { ArchitectureBlueprint, ArchitecturePlan, PlannedMove } from '../types'

/** Returns the top-level folder/role under src for hint matching. */
export function roleOf(filePath: string): string {
  const normalized = normalizePath(filePath)
  const segments = normalized.split('/').filter(Boolean)
  const srcIdx = segments.indexOf('src')
  const base = srcIdx === -1 ? segments : segments.slice(srcIdx + 1)
  return base.length >= 2 ? base[0].toLowerCase() : ''
}

/** True for config/entrypoint files that must not move. */
function isEntrypoint(path: string): boolean {
  const name = basename(path).toLowerCase()
  return (
    name === 'main.tsx' ||
    name === 'main.ts' ||
    name === 'index.html' ||
    name.endsWith('.config.ts') ||
    name.endsWith('.config.js') ||
    name === 'vite-env.d.ts'
  )
}

/**
 * Deterministic placement used as a fallback when the LLM is unavailable or
 * returns an invalid plan. Maps each file to a blueprint layer via placement hints.
 * Pure: no IO, no LLM, safe to unit test in isolation.
 */
export function buildDeterministicPlan(
  fileMap: Map<string, string>,
  blueprint: ArchitectureBlueprint,
): ArchitecturePlan {
  const moves: PlannedMove[] = []
  const unchanged: string[] = []
  const hintMap = new Map(blueprint.placementHints.map((h) => [h.match.toLowerCase(), h.layer]))
  const defaultLayer = blueprint.layers[blueprint.layers.length - 1]?.id ?? 'shared'

  for (const path of fileMap.keys()) {
    if (!isTsLikeFile(path) || isEntrypoint(path)) {
      unchanged.push(path)
      continue
    }

    const role = roleOf(path)
    const layer = hintMap.get(role) ?? defaultLayer
    const targetDir = joinPath(blueprint.root, layer, dirname(path).replace(/^src\/?/, '') || '')
    const to = joinPath(targetDir, basename(path))

    if (normalizePath(to) === normalizePath(path)) {
      unchanged.push(path)
      continue
    }

    moves.push({
      from: normalizePath(path),
      to: normalizePath(to),
      layer,
      needsRewrite: true,
      reason: `Placement by role "${role || 'root'}" -> layer "${layer}"`,
    })
  }

  return {
    blueprintId: blueprint.id,
    summary: `Plano determinístico: ${moves.length} ficheiro(s) reorganizados para ${blueprint.name}.`,
    moves,
    newFiles: blueprint.layers.map((l) => ({
      path: joinPath(blueprint.root, l.id, 'index.ts'),
      kind: 'barrel' as const,
      description: `Barrel da camada ${l.id}`,
    })),
    unchanged,
    warnings: ['Plano gerado deterministicamente (LLM indisponível ou inválido).'],
  }
}
