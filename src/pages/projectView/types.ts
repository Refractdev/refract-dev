// UI-only types — analysis types come from shared/ipc.ts
export type DiffType = 'normal' | 'removed' | 'added'

export interface DiffLine {
  num: number
  content: string
  type: DiffType
}

export interface FileIssue {
  id: number
  file: string
  problem: string
}

export interface SnippetPair {
  id: number
  label: string
  before: DiffLine[]
  after: DiffLine[]
}

export type Phase = 'idle' | 'analysing' | 'briefing' | 'reviewing' | 'refactoring' | 'applying' | 'complete'

export type Decision = 'accepted' | 'rejected'

export type CompletionSource = 'review' | 'architecture'

export interface ArchApplyStats {
  filesMoved: number
  filesValidated: number
  filesManualReview: number
}
