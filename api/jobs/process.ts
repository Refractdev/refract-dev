// api/jobs/process.ts
// Background job processor — called by Vercel Cron every 5min
// Picks up pending webhook events and processes them

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabaseClient } from '../_lib/supabase'
import { getInstallationToken } from '../_lib/auth'
import { githubRequest } from '../_lib/github'
import { throwIfDbError } from '../_lib/db'
import { runAnalysis } from '../../src/lib/analyze'
import { analyzeDrift, type SnapshotData } from '../_lib/drift'
import { cloneRepo } from '../_lib/clone'
import { trackEvent } from '../../src/lib/analytics'

// ─── Sync helpers ─────────────────────────────────────────────────────────────

function computeScore(summary: { total: number; high: number; medium: number; low: number }): number {
  return Math.max(0, Math.min(100, 100 - summary.high * 10 - summary.medium * 4 - summary.low * 1))
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const supabase = getAdminSupabaseClient()
  const processed: string[] = []
  const errors: string[] = []

  try {
    // Atomically claim up to five pending events so overlapping cron runs do not
    // process the same event twice.
    const { data: events, error: claimError } = await supabase
      .from('webhook_events')
      .update({ status: 'processing' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5)
      .select('*')

    throwIfDbError(claimError, '[jobs/process] Failed to claim pending events')

    if (!events || events.length === 0) {
      return res.status(200).json({ ok: true, processed: [], message: 'No pending events' })
    }

    for (const event of events) {
      try {
        const installationId = event.installation_id
        const repoUrl = event.repo_url

        const token = await getInstallationToken(installationId)

        const files = await cloneRepo(repoUrl, token, event.branch ?? undefined)
        console.log(`[jobs/process] Cloned ${Object.keys(files).length} files from ${repoUrl}`)

        void trackEvent('analysis_started', {
          project_id: event.project_id,
          repo_url: repoUrl,
          branch: event.branch ?? 'main',
          trigger: 'jobs_process',
        })

        const fileMap = new Map(Object.entries(files))
        const result = await runAnalysis(fileMap)

        const categoryCounts: Record<string, number> = {}
        const fileCounts: Record<string, number> = {}
        for (const issue of result.issues) {
          categoryCounts[issue.category] = (categoryCounts[issue.category] ?? 0) + 1
          fileCounts[issue.filePath] = (fileCounts[issue.filePath] ?? 0) + 1
        }

        const score = computeScore(result.summary)
        const { data: snapshot, error: snapshotError } = await supabase
          .from('health_snapshots')
          .insert({
            project_id: event.project_id,
            score,
            issue_count: result.summary.total,
            high: result.summary.high,
            medium: result.summary.medium,
            low: result.summary.low,
            timestamp: new Date().toISOString(),
          })
          .select('id')
          .single()
        throwIfDbError(snapshotError, '[jobs/process] Failed to save health snapshot')

        const { error: analysisError } = await supabase
          .from('analysis_results')
          .insert({
            project_id: event.project_id,
            snapshot_id: snapshot?.id ?? null,
            event_id: event.id,
            commit_sha: event.commit_sha,
            branch: event.branch,
            score,
            issue_count: result.summary.total,
            high: result.summary.high,
            medium: result.summary.medium,
            low: result.summary.low,
            issue_counts_by_category: categoryCounts,
            file_issue_counts: fileCounts,
            trigger: event.event_type === 'pull_request' ? 'pull_request' : 'push',
            duration_ms: 0,
          })
        throwIfDbError(analysisError, '[jobs/process] Failed to save analysis result')

        const { error: projectUpdateError } = await supabase
          .from('projects')
          .update({
            last_run: new Date().toISOString(),
            status: 'Refracted',
          })
          .eq('id', event.project_id)
        throwIfDbError(projectUpdateError, '[jobs/process] Failed to update project status')

        void trackEvent('analysis_completed', {
          project_id: event.project_id,
          score,
          issues_count: result.summary.total,
        })

        if (event.event_type === 'pull_request' && event.pr_number && event.project_id) {
          const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('repo')
            .eq('id', event.project_id)
            .single()
          throwIfDbError(projectError, '[jobs/process] Failed to load project repo')

          if (project?.repo) {
            const repoPath = project.repo.replace('https://github.com/', '')
            const summary = result.summary
            const scoreChange = '—'

            const body = [
              `## 🔍 Refract Analysis — PR #${event.pr_number}`,
              '',
              `**Health Score:** ${score}/100`,
              `**Issues found:** ${summary.total} (${summary.high} high, ${summary.medium} med, ${summary.low} low)`,
              `**Score change:** ${scoreChange}`,
              '',
              '### Issue breakdown',
              ...Object.entries(categoryCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => `- **${cat}**: ${count}`),
              '',
              '> Generated automatically by Refract Drift Monitor',
            ].join('\n')

            try {
              await githubRequest(token, `/repos/${repoPath}/issues/${event.pr_number}/comments`, {
                method: 'POST',
                body: JSON.stringify({ body }),
              })
              console.log(`[jobs/process] PR comment posted on #${event.pr_number}`)
            } catch (commentErr) {
              console.error('[jobs/process] Failed to post PR comment:', commentErr)
            }
          }
        }

        if (event.project_id) {
          try {
            const { data: recentResults, error: recentResultsError } = await supabase
              .from('analysis_results')
              .select('*')
              .eq('project_id', event.project_id)
              .order('created_at', { ascending: false })
              .limit(20)
            throwIfDbError(recentResultsError, '[jobs/process] Failed to load recent analysis results')

            const snapshots = (recentResults ?? []) as SnapshotData[]
            if (snapshots.length >= 2) {
              const driftReport = analyzeDrift(snapshots, event.project_id)
              const { data: existingAlerts, error: existingAlertsError } = await supabase
                .from('drift_alerts')
                .select('alert_type, message')
                .eq('project_id', event.project_id)
                .is('acknowledged_at', null)
              throwIfDbError(existingAlertsError, '[jobs/process] Failed to load existing drift alerts')

              const existingMessages = new Set(
                (existingAlerts ?? []).map((a: any) => `${a.alert_type}:${a.message}`),
              )

              for (const alert of driftReport.alerts) {
                const key = `${alert.alert_type}:${alert.message}`
                if (existingMessages.has(key)) continue

                const { error: alertError } = await supabase
                  .from('drift_alerts')
                  .insert({
                    project_id: event.project_id,
                    analysis_result_id: snapshots[0].id,
                    alert_type: alert.alert_type,
                    severity: alert.severity,
                    message: alert.message,
                    metadata: alert.metadata,
                  })
                throwIfDbError(alertError, '[jobs/process] Failed to save drift alert')
                existingMessages.add(key)
              }

              console.log(`[jobs/process] Drift alerts saved for project ${event.project_id}`)
            }
          } catch (driftErr) {
            console.error('[jobs/process] Drift detection failed:', driftErr)
          }
        }

        const { error: completeError } = await supabase
          .from('webhook_events')
          .update({ status: 'completed', processed_at: new Date().toISOString() })
          .eq('id', event.id)
        throwIfDbError(completeError, '[jobs/process] Failed to mark webhook event completed')

        processed.push(event.id)
        console.log(`[jobs/process] Event ${event.id} completed`)
      } catch (eventErr: any) {
        console.error(`[jobs/process] Event ${event.id} failed:`, eventErr)
        errors.push(`${event.id}: ${eventErr.message ?? eventErr}`)

        const { error: failError } = await supabase
          .from('webhook_events')
          .update({
            status: 'failed',
            error: eventErr.message ?? String(eventErr),
            processed_at: new Date().toISOString(),
          })
          .eq('id', event.id)
        if (failError) {
          console.error('[jobs/process] Failed to mark webhook event as failed:', failError)
        }
      }
    }

    return res.status(200).json({
      ok: true,
      processed,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[jobs/process] Fatal error:', error)
    return res.status(500).json({ error: error.message ?? 'Job processor failed' })
  }
}
