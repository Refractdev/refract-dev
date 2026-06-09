import { supabase } from './supabase'
import type { AnalysisIssue } from '../shared/types'
import type { SafetyResult } from '../engine/types'

export class RateLimitError extends Error {
  reset: number

  constructor(message: string, reset: number) {
    super(message)
    this.name = 'RateLimitError'
    this.reset = reset
  }
}

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  language: string | null
  default_branch: string
  updated_at: string
  html_url: string
}

export interface GitHubBranch {
  name: string
  isDefault: boolean
}

export interface GitHubCloneResult {
  files: Record<string, string>
  branch: string
}

export interface GitHubPullRequestInput {
  repoUrl: string
  baseBranch: string
  headBranch: string
  title: string
  body: string
  projectId?: string
  changes: Array<{
    filePath: string
    newContent: string
  }>
}

export interface RefactorNameRequest {
  kind: 'component' | 'hook'
  filePath: string
  currentName: string
  ownerName: string
  symbols: string[]
  guidelines?: string
}

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return session.access_token
}

async function readResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (response.status === 429) {
    const data = await response.json().catch(() => ({ message: fallbackMessage, reset: Date.now() }))
    throw new RateLimitError(data.message ?? fallbackMessage, data.reset ?? Date.now())
  }

  if (!response.ok) {
    let data: any = {}
    try {
      data = await response.json()
    } catch {
      // response body não é JSON
    }
    // Monta uma mensagem clara com status HTTP + detalhe do servidor
    const serverMsg = data.error ?? data.message ?? null
    const detail = data.detail ? ` — ${String(data.detail).split('\n')[0]}` : ''
    const label = serverMsg ? `${serverMsg}${detail}` : fallbackMessage
    throw new Error(`[${response.status}] ${label}`)
  }

  return response.json() as Promise<T>
}

// ─── AI API Proxy ─────────────────────────────────────────────────────────────

export async function explainIssue(issue: AnalysisIssue, fileSource: string, guidelines?: string): Promise<string> {
  const accessToken = await getAccessToken()

  const response = await fetch('/api/ai?action=explain', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ issue, fileSource, guidelines }),
  })

  const data = await readResponse<{ explanation: string }>(response, 'Failed to explain issue')
  return data.explanation
}

export async function generateCommitMessage(
  issue: AnalysisIssue,
  fileSource: string,
  guidelines?: string
): Promise<string> {
  const accessToken = await getAccessToken()

  const response = await fetch('/api/ai?action=refactor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ issue, fileSource, guidelines }),
  })

  const data = await readResponse<{ commitMessage: string }>(response, 'Failed to generate commit message')
  return data.commitMessage
}

export async function generateBriefing(
  projectPath: string,
  issues: AnalysisIssue[],
  scannedFiles: string[],
  guidelines?: string,
  language?: string
): Promise<string> {
  const accessToken = await getAccessToken()

  const response = await fetch('/api/ai?action=briefing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ projectPath, issues, scannedFiles, guidelines, language }),
  })

  const data = await readResponse<{ briefing: string }>(response, 'Failed to generate briefing')
  return data.briefing
}

export async function explainCode(filePath: string, code: string, context?: { dependencies?: string[]; issues?: number; category?: string }): Promise<string> {
  const accessToken = await getAccessToken()

  const response = await fetch('/api/ai?action=explain-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ filePath, code, context }),
  })

  const data = await readResponse<{ explanation: string }>(response, 'Failed to explain code')
  return data.explanation
}

export async function suggestRefactorName(input: RefactorNameRequest): Promise<string> {
  const accessToken = await getAccessToken()

  const response = await fetch('/api/ai?action=name', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  })

  const data = await readResponse<{ name: string }>(response, 'Failed to suggest refactor name')
  return data.name
}

// ─── Drift Monitor API ─────────────────────────────────────────────────────────

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

export async function fetchDriftReport(projectId: string): Promise<DriftReport> {
  const accessToken = await getAccessToken()
  const response = await fetch(`/api/analysis?projectId=${encodeURIComponent(projectId)}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  })
  return readResponse<DriftReport>(response, 'Failed to fetch drift report')
}

// ─── Codemap API ─────────────────────────────────────────────────────────────

export interface GitHubCommit {
  sha: string
  message: string
  author: string
  date: string
  url: string
}

export async function fetchProjectCommits(repoUrl: string | null | undefined): Promise<GitHubCommit[]> {
  if (!repoUrl) return []
  const accessToken = await getAccessToken()
  const response = await fetch(`/api/github?action=commits&repoUrl=${encodeURIComponent(repoUrl)}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!response.ok) return []
  return response.json()
}

export async function getProjectDependencies(projectPath: string): Promise<{ dependencies: any[]; allFiles: string[] }> {
  // This will be handled by the worker, no backend needed
  // Placeholder for now
  return { dependencies: [], allFiles: [] }
}

// ─── GitHub API ─────────────────────────────────────────────────────────────

export async function getGitHubRepos(): Promise<GitHubRepo[]> {
  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (err: any) {
    throw new Error(`getGitHubRepos — failed to get session token: ${err?.message}`)
  }

  let response: Response
  try {
    response = await fetch('/api/github?action=repos', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
  } catch (err: any) {
    // Erro de rede — fetch nem chegou ao servidor
    throw new Error(`getGitHubRepos — network error (fetch threw): ${err?.message}`)
  }

  // Sempre loga status + URL para facilitar debug no console do browser
  console.log(`[api/getGitHubRepos] HTTP ${response.status} ${response.url}`)

  if (!response.ok) {
    let body = '<empty>'
    try { body = await response.text() } catch { /* ignore */ }
    console.error(`[api/getGitHubRepos] Error body:`, body)
    let parsed: any = {}
    try { parsed = JSON.parse(body) } catch { /* ignore */ }
    const serverMsg = parsed.error ?? parsed.message ?? body
    throw new Error(`[${response.status}] ${serverMsg}`)
  }

  let data: any
  try {
    data = await response.json()
  } catch (err: any) {
    throw new Error(`getGitHubRepos — response was 2xx but body is not valid JSON: ${err?.message}`)
  }

  // A API retorna um array direto ou { repositories: [...] }
  const list: GitHubRepo[] = Array.isArray(data) ? data : (data.repositories ?? [])
  console.log(`[api/getGitHubRepos] Parsed ${list.length} repos`)
  return list
}

export async function getGitHubBranches(repoUrl: string): Promise<{ branches: GitHubBranch[] }> {
  const accessToken = await getAccessToken()

  const response = await fetch(`/api/github?action=branches&repoUrl=${encodeURIComponent(repoUrl)}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  })

  return readResponse<{ branches: GitHubBranch[] }>(response, 'Failed to get GitHub branches')
}

export async function cloneGitHubRepo(repoUrl: string, branch?: string): Promise<GitHubCloneResult> {
  const accessToken = await getAccessToken()

  const response = await fetch('/api/github?action=clone', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ repoUrl, branch }),
  })

  return readResponse<GitHubCloneResult>(response, 'Failed to clone repo')
}

export async function createGitHubPullRequest(input: GitHubPullRequestInput): Promise<{ url: string }> {
  const accessToken = await getAccessToken()

  const response = await fetch('/api/github?action=pr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  })

  return readResponse<{ url: string }>(response, 'Failed to create PR')
}

export interface ValidateProposalInput {
  projectPath?: string
  filePath: string
  before: string
  after: string
  newFiles?: Array<{ path: string; content: string }>
  fileMap?: Record<string, string>
  engineResult?: SafetyResult
}

export async function validateProposalSafety(input: ValidateProposalInput): Promise<SafetyResult> {
  const accessToken = await getAccessToken()

  const response = await fetch('/api/safety', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  })

  return readResponse<any>(response, 'Safety validation failed')
}
