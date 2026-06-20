import { generateArchitecturePlan } from '../../lib/api'
import { isTsLikeFile, normalizePath } from '../path'
import type { ArchitectureBlueprint, ArchitecturePlan, ArchitectureProfile, PlannedMove } from '../types'
import { parseArchitecturePlan } from './schema'
import { buildDeterministicPlan } from './placement'

export { buildDeterministicPlan } from './placement'

const MAX_TREE_FILES = 400

/** Builds a compact newline-separated tree of code file paths for the planner prompt. */
function buildTree(fileMap: Map<string, string>): string {
  const paths = [...fileMap.keys()].filter((p) => isTsLikeFile(p)).sort()
  return paths.slice(0, MAX_TREE_FILES).join('\n')
}

/** Drops moves that reference non-existent files or that are no-ops. */
function normalizePlan(plan: ArchitecturePlan, fileMap: Map<string, string>): ArchitecturePlan {
  const existing = new Set([...fileMap.keys()].map(normalizePath))
  const seenTargets = new Set<string>()
  const moves: PlannedMove[] = []

  for (const move of plan.moves) {
    const from = normalizePath(move.from)
    const to = normalizePath(move.to)
    if (!existing.has(from)) continue
    if (from === to) continue
    if (seenTargets.has(to)) continue
    seenTargets.add(to)
    moves.push({ ...move, from, to })
  }

  return {
    ...plan,
    moves,
    newFiles: plan.newFiles.map((f) => ({ ...f, path: normalizePath(f.path) })),
  }
}

/**
 * Produces an ArchitecturePlan for the project. Tries the LLM planner first and
 * falls back to deterministic placement on any failure.
 */
export async function planArchitecture(
  fileMap: Map<string, string>,
  profile: ArchitectureProfile,
  blueprint: ArchitectureBlueprint,
  options?: { signals?: string },
): Promise<ArchitecturePlan> {
  const tree = buildTree(fileMap)

  try {
    const raw = await generateArchitecturePlan({
      profile,
      blueprint,
      tree,
      signals: options?.signals,
    })
    const parsed = parseArchitecturePlan(raw, blueprint.id)
    const normalized = normalizePlan(parsed, fileMap)
    // If the LLM returned nothing actionable, fall back.
    if (normalized.moves.length === 0) {
      return buildDeterministicPlan(fileMap, blueprint)
    }
    return normalized
  } catch (err) {
    console.error('[planArchitecture] LLM planner failed, using deterministic fallback:', err)
    return buildDeterministicPlan(fileMap, blueprint)
  }
}
