import { z } from 'zod';

export const ProjectSchema = z.object({
  id:         z.string(),
  name:       z.string(),
  path:       z.string(),
  repo:       z.string().nullable().optional(),
  branch:     z.string().default('main'),
  status:     z.enum(['Refracted', 'Pending', 'Not analysed']).default('Not analysed'),
  created_at: z.string().optional(),
  last_run:   z.string().nullable().optional(),
});

export const ActivitySchema = z.object({
  id:           z.string(),
  project_id:   z.string(),
  project_name: z.string(),
  type:         z.string(),
  description:  z.string(),
  created_at:   z.string(),
});

export type Project  = z.infer<typeof ProjectSchema>;
export type Activity = z.infer<typeof ActivitySchema>;

// ─── Analysis types ───────────────────────────────────────────────────────────

export type IssueCategory =
  | 'oversized-component'
  | 'any-type'
  | 'dead-state'
  | 'missing-docs'
  | 'console-log'
  | 'effect-no-deps'
  | 'prop-drilling'
  | 'generic-naming'
  | 'circular-dep'
  | 'state-explosion'
  | 'api-in-component'
  | 'missing-error-boundary'
  | 'memory-leak'
  | 'duplicate-logic'
  | 'unsafe-cast'

export type Impact = 'High' | 'Medium' | 'Low'

export interface AnalysisIssue {
  id: string
  file: string
  filePath: string
  category: IssueCategory
  problem: string
  impact: Impact
  lineStart: number
  lineEnd: number
  lines: {
    before: string[]
    after: string[]
  }
  patch?: {
    before: string
    after: string
  }
  suggestion?: string
  effort?: 'low' | 'medium' | 'high'
  blastRadius?: number
  priority?: number
}

export interface AnalysisResult {
  projectPath: string
  scannedFiles: string[]
  issues: AnalysisIssue[]
  truncated?: boolean
  dependencies: Record<string, string[]>
  summary: {
    total: number
    high: number
    medium: number
    low: number
  }
}

export interface ApplyResult {
  success: boolean
  branch?: string
  filesChanged: string[]
  commitHash?: string
  noGit?: boolean
  applied: number
  failed: number
  error?: string
  errors?: { issueId: string; reason: string }[]
}
