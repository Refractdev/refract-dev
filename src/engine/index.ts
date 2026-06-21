import { calculateBlastRadius } from './analysis/blastRadius'
import { evaluateImpactRadar } from './analysis/impactRadar'
import { applyFormatting } from './formatting'
import { runSafetyGate } from './safety/gate'
import { runApiCentralization } from './transforms/apiCentralization'
import { runComponentDecomposition } from './transforms/componentDecomposition'
import { runImportCleanup } from './transforms/importCleanup'
import { runModuleRestructuring } from './transforms/moduleRestructuring'
import { runStateConsolidation } from './transforms/stateConsolidation'
import type { AnalysisRigor, FormattingPrefs } from '../lib/engineSettings'
import { passesRigorGate } from '../lib/engineSettings'
import type { TransformProposal } from './types'

const TYPE_ORDER: Record<TransformProposal['type'], number> = {
  'api-centralization': 0,
  'component-decomposition': 1,
  'import-cleanup': 2,
  'module-restructuring': 3,
  'state-consolidation': 4,
}

export async function analyzeForRefactoring(
  fileMap: Map<string, string>,
  options?: {
    maxProposals?: number
    guidelines?: string
    rigor?: AnalysisRigor
    formatting?: FormattingPrefs
  },
): Promise<TransformProposal[]> {
  const rigor = options?.rigor ?? 'balanced'
  const formatting = options?.formatting

  const proposalGroups = await Promise.all([
    runComponentDecomposition(fileMap, options?.guidelines),
    runStateConsolidation(fileMap, options?.guidelines),
    runImportCleanup(fileMap),
    runApiCentralization(fileMap, options?.guidelines),
    runModuleRestructuring(fileMap),
  ])

  const proposals = proposalGroups.flat()
  const enriched = proposals.map((proposal) => {
    const blastRadius = calculateBlastRadius(proposal.filePath, fileMap)
    const impactRadar = evaluateImpactRadar(blastRadius)

    return {
      ...proposal,
      blastRadius,
      description: impactRadar.notes.length > 0
        ? `${proposal.description} ${impactRadar.notes.join(' ')}`
        : proposal.description,
    }
  })

  const safeProposals = enriched
    .map((proposal) => {
      const formatted = formatting
        ? {
            ...proposal,
            after: applyFormatting(proposal.after, formatting),
            newFiles: proposal.newFiles?.map(file => ({
              ...file,
              content: applyFormatting(file.content, formatting),
            })),
          }
        : proposal
      return runSafetyGate(formatted, fileMap)
    })
    .filter((proposal) => proposal.safetyResult?.passed)
    .filter((proposal) =>
      passesRigorGate(
        rigor,
        proposal.blastRadius.breakageSurface,
        proposal.safetyResult?.warnings ?? [],
      )
    )
    .filter((proposal) => proposal.after !== proposal.before || proposal.movedTo || (proposal.newFiles?.length ?? 0) > 0)
    .sort((left, right) => {
      const blastDiff = left.blastRadius.breakageSurface - right.blastRadius.breakageSurface
      if (blastDiff !== 0) return blastDiff
      return TYPE_ORDER[left.type] - TYPE_ORDER[right.type]
    })

  return typeof options?.maxProposals === 'number'
    ? safeProposals.slice(0, options.maxProposals)
    : safeProposals
}

export type { TransformProposal, TransformType } from './types'
