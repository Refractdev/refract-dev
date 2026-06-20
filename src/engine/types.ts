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

// ─── Enterprise architecture refactor types ────────────────────────────────

export type DetectedFramework =
  | 'react'
  | 'next'
  | 'react-native'
  | 'remix'
  | 'vue'
  | 'svelte'
  | 'angular'
  | 'unknown'

export interface DetectedStructure {
  /** flat: code sits in root/src; technical: components/hooks/utils; feature: features/modules; layered: domain/app/infra */
  kind: 'flat' | 'technical' | 'feature' | 'layered' | 'mixed'
  topLevelFolders: string[]
  codeFileCount: number
  /** Fraction of code files that live inside a sub-folder (0 = fully flat). */
  folderRatio: number
}

export interface ArchitectureProfile {
  framework: DetectedFramework
  buildTool: string | null
  language: 'typescript' | 'javascript'
  structure: DetectedStructure
  directoryCount: number
  keyDependencies: string[]
}

export type BlueprintId = 'feature-based' | 'clean-layered' | 'modular-monolith'

export interface BlueprintLayer {
  /** Folder name under the blueprint root, e.g. "domain". */
  id: string
  /** Human description shown in the UI. */
  description: string
  /** Layer ids this layer is allowed to import from (dependency rule). */
  canImportFrom: string[]
}

export interface ArchitectureBlueprint {
  id: BlueprintId
  name: string
  summary: string
  /** Root folder the blueprint organizes under (usually "src"). */
  root: string
  layers: BlueprintLayer[]
  /** Glob-ish hints mapping current file roles to a target layer. */
  placementHints: Array<{ match: string; layer: string }>
  /** Best-fit signals: structures this blueprint is recommended for. */
  recommendedFor: DetectedStructure['kind'][]
}

export interface PlannedMove {
  from: string
  to: string
  /** Target blueprint layer id this file belongs to. */
  layer: string
  /** Whether the file content must be rewritten (vs. pure move + import fixups). */
  needsRewrite: boolean
  reason: string
}

export interface PlannedNewFile {
  path: string
  /** "barrel" for index re-exports, "module" for new scaffolding. */
  kind: 'barrel' | 'module'
  description: string
}

export interface ArchitecturePlan {
  blueprintId: BlueprintId
  summary: string
  moves: PlannedMove[]
  newFiles: PlannedNewFile[]
  /** Files the planner intentionally leaves in place. */
  unchanged: string[]
  warnings: string[]
}

export type ArchitectureFileStatus = 'moved' | 'rewritten' | 'validated' | 'manual-review' | 'unchanged'

export interface ArchitectureFileResult {
  path: string
  previousPath?: string
  status: ArchitectureFileStatus
  errors?: string[]
}

export interface ArchitectureTransformResult {
  blueprintId: BlueprintId
  /** Final virtual file map after validated transforms (only committed if passed). */
  fileMap: Record<string, string>
  results: ArchitectureFileResult[]
  passed: boolean
  manualReview: ArchitectureFileResult[]
  stats: {
    filesMoved: number
    filesRewritten: number
    filesValidated: number
    filesManualReview: number
  }
}
