export type Impact = 'High' | 'Medium' | 'Low'

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

export interface DemoIssue {
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
  effort?: 'low' | 'medium' | 'high'
  blastRadius?: number
  priority?: number
  explanation: string
}

export type Decision = 'accepted' | 'rejected'

export interface DemoProject {
  id: string
  name: string
  path: string
  repo: string
  branch: string
  last_run: string
}

export interface HealthSnapshot {
  score: number
  timestamp: string
  issueCount: number
  high: number
  medium: number
  low: number
}

export interface DriftReport {
  projectId: string
  totalSnapshots: number
  currentScore: number
  previousScore: number | null
  scoreDelta: number | null
  trends: Array<{
    category: string
    slope: number
    direction: 'improving' | 'stable' | 'worsening'
    currentCount: number
    averageCount: number
  }>
  anomalies: Array<{
    category: string
    type: 'spike' | 'drop'
    currentCount: number
    expectedCount: number
    deviationPercent: number
    severity: 'info' | 'warning' | 'critical'
  }>
  decayHotspots: Array<{
    filePath: string
    fileName: string
    appearances: number
    latestCount: number
    growthRate: number
    severity: 'warning' | 'critical'
  }>
  alerts: Array<{
    alert_type: 'score_drop' | 'category_spike' | 'anomaly' | 'decay_hotspot' | 'architectural_drift'
    severity: 'info' | 'warning' | 'critical'
    message: string
    metadata: Record<string, unknown>
  }>
}

export interface GitHubCommit {
  sha: string
  message: string
  author: string
  date: string
  url: string
}
