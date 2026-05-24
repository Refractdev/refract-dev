import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const hasUpstashEnv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

const redis = hasUpstashEnv
  ? new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  : null

export const rateLimits = {
  free: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '1 h'),
        prefix: 'refract:free',
      })
    : null,
  pro: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(200, '1 h'),
        prefix: 'refract:pro',
      })
    : null,
  team: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(1000, '1 h'),
        prefix: 'refract:team',
      })
    : null,
  enterprise: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10000, '1 h'),
        prefix: 'refract:enterprise',
      })
    : null,
}

export async function checkRateLimit(userId: string, plan: string) {
  const limiter = rateLimits[plan as keyof typeof rateLimits] ?? rateLimits.free
  if (!limiter) {
    return {
      success: true,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      reset: Date.now() + 60 * 60 * 1000,
    }
  }

  return limiter.limit(userId)
}

export function applyRateLimitHeaders(
  res: { setHeader: (name: string, value: number | string) => void },
  limitResult: { limit: number; remaining: number; reset: number }
) {
  res.setHeader('X-RateLimit-Limit', limitResult.limit)
  res.setHeader('X-RateLimit-Remaining', limitResult.remaining)
  res.setHeader('X-RateLimit-Reset', limitResult.reset)
}
