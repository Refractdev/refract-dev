import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabaseClient } from './_lib/supabase'
import { getAuthenticatedUser } from './_lib/auth'
import { analyzeDrift, type SnapshotData } from './_lib/drift'
import { runAnalysis } from '../src/lib/analyze'
import { throwIfDbError } from './_lib/db'
import { trackEvent } from '../src/lib/analytics'
import { cloneRepo } from './_lib/clone'

async function handleGet(req: VercelRequest, res: VercelResponse) {
  try {
    // Authenticate
    try {
      await getAuthenticatedUser(req.headers.authorization)
    } catch {
      return res.status(401).json({ error: 'Autenticação necessária' })
    }

    const projectId = req.query.projectId as string
    if (!projectId) {
      return res.status(400).json({ error: 'Missing projectId query param' })
    }

    const supabase = getAdminSupabaseClient()

    // Load recent analysis results (max 20)
    const { data: results, error } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const snapshots = (results ?? []) as SnapshotData[]
    const report = analyzeDrift(snapshots, projectId)

    return res.status(200).json(report)
  } catch (error: any) {
    console.error('[analysis/drift] Error:', error)
    return res.status(500).json({ error: error.message ?? 'Drift analysis failed' })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    // ── Authenticate ────────────────────────────────────────────────────────
    let githubToken: string | null = null
    try {
      const auth = await getAuthenticatedUser(req.headers.authorization)
      githubToken = auth.githubToken
    } catch {
      return res.status(401).json({ error: 'Autenticação necessária' })
    }

    const { projectId, repoUrl, branch, files: preFetchedFiles } = req.body ?? {}

    if (!projectId) {
      return res.status(400).json({ error: 'Missing projectId' })
    }

    // Verify user owns this project
    const supabase = getAdminSupabaseClient()
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single()
    throwIfDbError(projectError, '[analysis/run] Failed to load project')

    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    // ── Get or clone files ──────────────────────────────────────────────────
    let files: Record<string, string>

    if (preFetchedFiles) {
      files = preFetchedFiles
    } else if (repoUrl) {
      const branchName = branch ?? 'main'
      files = await cloneRepo(repoUrl, githubToken, branchName)
      console.log(`[analysis/run] Cloned ${Object.keys(files).length} files from ${repoUrl} ${branchName}`)
    } else {
      return res.status(400).json({ error: 'Provide files, repoUrl, or both' })
    }

    void trackEvent('analysis_started', {
      project_id: projectId,
      repo_url: repoUrl ?? undefined,
      branch: branch ?? 'main',
      trigger: 'api_analysis_run',
    })

    // ── Run analysis ────────────────────────────────────────────────────────
    const fileMap = new Map(Object.entries(files))
    const result = await runAnalysis(fileMap)

    // ── Compute category breakdown ──────────────────────────────────────────
    const categoryCounts: Record<string, number> = {}
    const fileCounts: Record<string, number> = {}
    for (const issue of result.issues) {
      categoryCounts[issue.category] = (categoryCounts[issue.category] ?? 0) + 1
      fileCounts[issue.filePath] = (fileCounts[issue.filePath] ?? 0) + 1
    }

    // ── Save to database ────────────────────────────────────────────────────
    // Save health snapshot
    const score = Math.max(0, Math.min(100,
      100 - (result.summary.high * 10) - (result.summary.medium * 4) - (result.summary.low * 1)
    ))

    const { data: snapshot, error: snapshotError } = await supabase
      .from('health_snapshots')
      .insert({
        project_id: projectId,
        score,
        issue_count: result.summary.total,
        high: result.summary.high,
        medium: result.summary.medium,
        low: result.summary.low,
        timestamp: new Date().toISOString(),
      })
      .select('id')
      .single()
    throwIfDbError(snapshotError, '[analysis/run] Failed to save health_snapshot')

    // Save analysis result
    const { error: analysisError } = await supabase
      .from('analysis_results')
      .insert({
        project_id: projectId,
        snapshot_id: snapshot?.id ?? null,
        score,
        issue_count: result.summary.total,
        high: result.summary.high,
        medium: result.summary.medium,
        low: result.summary.low,
        issue_counts_by_category: categoryCounts,
        file_issue_counts: fileCounts,
        trigger: 'manual',
        duration_ms: 0,
      })
    throwIfDbError(analysisError, '[analysis/run] Failed to save analysis_result')

    // Update project
    const { error: projectUpdateError } = await supabase
      .from('projects')
      .update({
        last_run: new Date().toISOString(),
        status: 'Refracted',
      })
      .eq('id', projectId)
    throwIfDbError(projectUpdateError, '[analysis/run] Failed to update project status')

    void trackEvent('analysis_completed', {
      project_id: projectId,
      score,
      issues_count: result.summary.total,
    })

    // ── Run drift detection and save alerts ─────────────────────────────────
    try {
      const { data: recentResults } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(20)

      const snapshots = (recentResults ?? []) as SnapshotData[]
      if (snapshots.length >= 2) {
        const driftReport = analyzeDrift(snapshots, projectId)
        const { data: existingAlerts, error: existingAlertsError } = await supabase
          .from('drift_alerts')
          .select('alert_type, message')
          .eq('project_id', projectId)
          .is('acknowledged_at', null)
        throwIfDbError(existingAlertsError, '[analysis/run] Failed to read drift alerts')

        const existingMessages = new Set(
          (existingAlerts ?? []).map((a: any) => `${a.alert_type}:${a.message}`),
        )

        for (const alert of driftReport.alerts) {
          const key = `${alert.alert_type}:${alert.message}`
          if (existingMessages.has(key)) continue
          const { error: alertError } = await supabase
            .from('drift_alerts')
            .insert({
              project_id: projectId,
              analysis_result_id: snapshots[0].id,
              alert_type: alert.alert_type,
              severity: alert.severity,
              message: alert.message,
              metadata: alert.metadata,
            })
          throwIfDbError(alertError, '[analysis/run] Failed to save drift alert')
          existingMessages.add(key)
        }
      }
    } catch (driftErr) {
      console.error('[analysis/run] Drift detection failed:', driftErr)
    }

    return res.status(200).json({
      ...result,
      projectId,
      score,
      snapshotId: snapshot?.id ?? null,
    })
  } catch (error: any) {
    console.error('[analysis/run] Error:', error)
    return res.status(500).json({ error: error.message ?? 'Analysis failed' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return handleGet(req, res)
  } else if (req.method === 'POST') {
    return handlePost(req, res)
  } else {
    return res.status(405).json({ error: 'Method not allowed' })
  }
}
