import crypto from 'node:crypto'
import { getAdminSupabaseClient } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WebhookEventType = 'push' | 'pull_request' | 'installation' | 'installation_repositories'
export type EventStatus = 'pending' | 'processing' | 'completed' | 'failed'

// ─── Signature verification ───────────────────────────────────────────────────

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
  } catch {
    return false
  }
}

// ─── Match repo to projects ───────────────────────────────────────────────────

async function findProjectsByRepo(repoUrl: string): Promise<Array<{ id: string; user_id: string }>> {
  const supabase = getAdminSupabaseClient()
  const { data } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('repo', repoUrl)
  return data ?? []
}

// ─── Insert webhook event into queue ──────────────────────────────────────────

export async function insertWebhookEvent(params: {
  projectId?: string | null
  installationId: number
  eventType: WebhookEventType
  action?: string
  repoFullName: string
  repoUrl: string
  branch?: string
  commitSha?: string
  prNumber?: number
  payload: any
}): Promise<string | null> {
  const supabase = getAdminSupabaseClient()
  const { data, error } = await supabase
    .from('webhook_events')
    .insert({
      project_id: params.projectId ?? null,
      installation_id: params.installationId,
      event_type: params.eventType,
      action: params.action ?? null,
      repo_full_name: params.repoFullName,
      repo_url: params.repoUrl,
      branch: params.branch ?? null,
      commit_sha: params.commitSha ?? null,
      pr_number: params.prNumber ?? null,
      payload: params.payload,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`[webhooks] Failed to insert event: ${error.message ?? String(error)}`)
  }
  return data.id
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handlePush(payload: any): Promise<void> {
  const repoUrl = payload.repository?.html_url
  const fullName = payload.repository?.full_name
  const installationId = payload.installation?.id
  const branch = payload.ref?.replace('refs/heads/', '')
  const commitSha = payload.head_commit?.id ?? payload.after

  if (!repoUrl || !installationId || !branch) {
    console.warn('[webhooks] Push event missing required fields', { repoUrl, installationId, branch })
    return
  }

  const projects = await findProjectsByRepo(repoUrl)
  if (projects.length === 0) {
    console.log('[webhooks] No project found for repo', repoUrl)
    // Still insert event for unmatched repos (can link later)
    await insertWebhookEvent({
      installationId,
      eventType: 'push',
      repoFullName: fullName,
      repoUrl,
      branch,
      commitSha,
      payload,
    })
    return
  }

  for (const project of projects) {
    await insertWebhookEvent({
      projectId: project.id,
      installationId,
      eventType: 'push',
      repoFullName: fullName,
      repoUrl,
      branch,
      commitSha,
      payload,
    })
  }
}

async function handlePullRequest(payload: any): Promise<void> {
  const repoUrl = payload.repository?.html_url
  const fullName = payload.repository?.full_name
  const installationId = payload.installation?.id
  const action = payload.action // 'opened', 'synchronize', 'closed', etc.
  const prNumber = payload.pull_request?.number
  const branch = payload.pull_request?.head?.ref
  const commitSha = payload.pull_request?.head?.sha

  if (!repoUrl || !installationId || !prNumber) {
    console.warn('[webhooks] pull_request event missing required fields')
    return
  }

  // Only process actionable PR events
  if (!action || !['opened', 'synchronize', 'reopened'].includes(action)) return

  const projects = await findProjectsByRepo(repoUrl)
  if (projects.length === 0) return

  for (const project of projects) {
    await insertWebhookEvent({
      projectId: project.id,
      installationId,
      eventType: 'pull_request',
      action,
      repoFullName: fullName,
      repoUrl,
      branch,
      commitSha,
      prNumber,
      payload,
    })
  }
}

async function handleInstallation(payload: any): Promise<void> {
  const installationId = payload.installation?.id
  const action = payload.action // 'created', 'deleted', 'new_permissions_accepted'
  const account = payload.installation?.account

  if (!installationId) return

  const supabase = getAdminSupabaseClient()

  if (action === 'deleted') {
    // Remove installation_id from all users that had it
    await supabase
      .from('users')
      .update({ github_installation_id: null })
      .eq('github_installation_id', installationId)
    return
  }

  if (action === 'created') {
    // If the payload has a sender with a user id, we might link it
    // But usually the OAuth callback handles this.
    // The webhook is just informational here.
    console.log('[webhooks] Installation created:', installationId, 'by', account?.login)
  }
}

async function handleInstallationRepositories(payload: any): Promise<void> {
  const installationId = payload.installation?.id
  const action = payload.action // 'added', 'removed'

  if (!installationId || !action) return

  const reposAdded = payload.repositories_added ?? []
  const reposRemoved = payload.repositories_removed ?? []

  console.log('[webhooks] Installation repositories', action, {
    installationId,
    added: reposAdded.map((r: any) => r.full_name),
    removed: reposRemoved.map((r: any) => r.full_name),
  })

  // Could trigger re-analysis of affected projects here
}

// ─── Event router ─────────────────────────────────────────────────────────────

const HANDLERS: Record<string, (payload: any) => Promise<void>> = {
  push: handlePush,
  pull_request: handlePullRequest,
  installation: handleInstallation,
  installation_repositories: handleInstallationRepositories,
}

export async function routeWebhookEvent(eventType: string, payload: any): Promise<void> {
  const handler = HANDLERS[eventType]
  if (!handler) {
    console.log('[webhooks] Unhandled event type:', eventType)
    return
  }
  await handler(payload)
}
