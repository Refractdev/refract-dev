import { z } from 'zod'
import type { ArchitecturePlan, BlueprintId } from '../types'

const BLUEPRINT_IDS = ['feature-based', 'clean-layered', 'modular-monolith'] as const

export const PlannedMoveSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  layer: z.string().min(1),
  needsRewrite: z.boolean().default(false),
  reason: z.string().default(''),
})

export const PlannedNewFileSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['barrel', 'module']).default('module'),
  description: z.string().default(''),
})

export const ArchitecturePlanSchema = z.object({
  blueprintId: z.enum(BLUEPRINT_IDS),
  summary: z.string().default(''),
  moves: z.array(PlannedMoveSchema).default([]),
  newFiles: z.array(PlannedNewFileSchema).default([]),
  unchanged: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
})

/**
 * Parses raw LLM output (possibly wrapped in markdown fences) into a validated
 * ArchitecturePlan. Throws if the JSON cannot be recovered or fails the schema.
 */
export function parseArchitecturePlan(raw: string, fallbackBlueprint: BlueprintId): ArchitecturePlan {
  const json = extractJson(raw)
  const parsed = ArchitecturePlanSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(`Invalid architecture plan: ${parsed.error.issues.map((i) => i.message).join(', ')}`)
  }
  const plan = parsed.data
  return {
    ...plan,
    blueprintId: (plan.blueprintId as BlueprintId) ?? fallbackBlueprint,
  }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim()
  // Strip ```json ... ``` fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1].trim() : trimmed

  try {
    return JSON.parse(candidate)
  } catch {
    // Best-effort: grab the outermost { ... } block.
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1))
    }
    throw new Error('Could not parse JSON from planner output')
  }
}
