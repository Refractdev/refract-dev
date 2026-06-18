import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// Inline the signature verification logic to test it independently
function verifySignature(body: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const { timingSafeEqual } = require('crypto')
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('hex')
  const received = signatureHeader.replace('sha256=', '')
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
  } catch {
    return false
  }
}

function buildSignature(body: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(body, 'utf8').digest('hex')
  return `sha256=${mac}`
}

describe('GitHub webhook HMAC signature verification', () => {
  const SECRET = 'test-webhook-secret-32-bytes-long'
  const BODY = JSON.stringify({ repository: { full_name: 'user/repo' }, ref: 'refs/heads/main' })

  it('accepts a correctly signed payload', () => {
    const sig = buildSignature(BODY, SECRET)
    expect(verifySignature(BODY, sig, SECRET)).toBe(true)
  })

  it('rejects a payload with wrong secret', () => {
    const sig = buildSignature(BODY, 'wrong-secret')
    expect(verifySignature(BODY, sig, SECRET)).toBe(false)
  })

  it('rejects a payload with missing signature header', () => {
    expect(verifySignature(BODY, undefined, SECRET)).toBe(false)
  })

  it('rejects a payload with malformed signature header', () => {
    expect(verifySignature(BODY, 'sha1=abc123', SECRET)).toBe(false)
  })

  it('rejects a tampered payload', () => {
    const sig = buildSignature(BODY, SECRET)
    const tampered = BODY.replace('user/repo', 'attacker/evil')
    expect(verifySignature(tampered, sig, SECRET)).toBe(false)
  })

  it('rejects a replay with a different body', () => {
    const otherBody = JSON.stringify({ ref: 'refs/heads/other' })
    const sig = buildSignature(BODY, SECRET)
    expect(verifySignature(otherBody, sig, SECRET)).toBe(false)
  })
})
