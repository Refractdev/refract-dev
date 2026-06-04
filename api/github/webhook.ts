import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyWebhookSignature, routeWebhookEvent } from '../_lib/webhooks'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify webhook secret signature
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (secret) {
    // Re-stringify body since Vercel auto-parses JSON.
    // GitHub JSON is deterministic, so JSON.stringify matches the original bytes.
    const rawBody = JSON.stringify(req.body)
    const signature = req.headers['x-hub-signature-256'] as string | undefined

    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      console.warn('[webhook] Invalid signature received')
      return res.status(401).json({ error: 'Invalid signature' })
    }
  } else {
    console.warn('[webhook] GITHUB_WEBHOOK_SECRET not set — skipping signature verification')
  }

  // Get event type from header
  const eventType = req.headers['x-github-event'] as string
  if (!eventType) {
    return res.status(400).json({ error: 'Missing x-github-event header' })
  }

  try {
    await routeWebhookEvent(eventType, req.body)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[webhook] Error processing event:', eventType, err)
    return res.status(500).json({ error: 'Failed to process webhook event' })
  }
}
