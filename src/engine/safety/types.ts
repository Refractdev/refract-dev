import type { SafetyResult, TransformProposal } from '../types'

export interface SafetyGateInput {
  proposal: TransformProposal
  fileMap: Map<string, string>
}

export interface SafetyGateOutcome {
  proposal: TransformProposal
  result: SafetyResult
  reduced: boolean
}

export type { SafetyResult }
