// Rate limiting removido — sempre permite passagem
export async function checkRateLimit(_userId: string, _plan: string) {
  return {
    success: true,
    limit: Number.POSITIVE_INFINITY,
    remaining: Number.POSITIVE_INFINITY,
    reset: Date.now() + 60 * 60 * 1000,
  }
}

export function applyRateLimitHeaders(
  _res: { setHeader: (name: string, value: number | string) => void },
  _limitResult: { limit: number; remaining: number; reset: number }
) {
  // no-op
}
