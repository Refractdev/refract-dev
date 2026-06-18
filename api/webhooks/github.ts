import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import { getAdminSupabaseClient } from '../_lib/supabase'

function getWebhookSecret(): string {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim()
  if (!secret) throw new Error('GITHUB_WEBHOOK_SECRET is not configured')
  return secret
}

/**
 * Verify the GitHub webhook HMAC signature.
 * GitHub signs the payload with SHA-256 using the shared webhook secret.
 */
function verifySignature(body: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const secret = getWebhookSecret()
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('hex')
  const received = signatureHeader.replace('sha256=', '')
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Collect the raw body for HMAC verification
  const rawBody: string = typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body)

  const signature = req.headers['x-hub-signature-256'] as string | undefined
  const event = req.headers['x-github-event'] as string | undefined
  const deliveryId = req.headers['x-github-delivery'] as string | undefined

  // Validate secret is configured before attempting verification
  let secretConfigured = true
  try { getWebhookSecret() } catch { secretConfigured = false }

  if (!secretConfigured) {
    console.error('[webhook/github] GITHUB_WEBHOOK_SECRET not set — rejecting all webhooks')
    return res.status(500).json({ error: 'Webhook receiver not configured' })
  }

  if (!verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  if (!event) {
    return res.status(400).json({ error: 'Missing x-github-event header' })
  }

  // Only process events we care about for drift monitoring
  const HANDLED_EVENTS = new Set(['push', 'pull_request'])
  if (!HANDLED_EVENTS.has(event)) {
    return res.status(200).json({ received: true, skipped: true, reason: `event '${event}' not handled` })
  }

  let payload: any
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' })
  }

  const repoFullName: string | null = payload?.repository?.full_name ?? null
  const installationId: number | null = payload?.installation?.id ?? null
  const branch: string | null = payload?.ref?.replace('refs/heads/', '') ?? null

  try {
    const supabase = getAdminSupabaseClient()

    const { error } = await supabase.from('webhook_events').insert({
      event_type: event,
      delivery_id: deliveryId ?? null,
      repo_full_name: repoFullName,
      installation_id: installationId,
      branch: branch,
      payload: payload,
      status: 'pending',
      received_at: new Date().toISOString(),
    })

    if (error) {
      console.error('[webhook/github] Failed to store event:', error.message)
      return res.status(500).json({ error: 'Failed to queue webhook event' })
    }

    return res.status(200).json({ received: true })
  } catch (err: any) {
    console.error('[webhook/github] Unexpected error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
