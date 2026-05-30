export type TransformType =
  | 'component-decomposition'
  | 'state-consolidation'
  | 'import-cleanup'
  | 'api-centralization'
  | 'module-restructuring'

export interface TransformProposal {
  id: string
  type: TransformType
  filePath: string
  title: string
  description: string
  before: string
  after: string
  newFiles?: NewFile[]
  deletedImports?: string[]
  movedTo?: string
  blastRadius: BlastRadius
  safetyResult?: SafetyResult
}

export interface NewFile {
  path: string
  content: string
}

export interface BlastRadius {
  affectedFiles: string[]
  dependentComponents: string[]
  testRisk: 'low' | 'medium' | 'high'
  breakageSurface: number
}

export interface SafetyResult {
  passed: boolean
  syntaxOk: boolean
  typecheck: boolean
  buildOk?: boolean
  testsOk?: boolean
  errors: string[]
  warnings: string[]
  details?: {
    typecheckLogs?: string[]
    buildLogs?: string[]
    testLogs?: string[]
  }
}
