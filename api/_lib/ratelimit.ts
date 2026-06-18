import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Limits per plan per minute
const LIMITS: Record<string, { ai: number; github: number; safety: number }> = {
  free: { ai: 10, github: 30, safety: 5 },
  pro: { ai: 60, github: 120, safety: 20 },
  team: { ai: 200, github: 300, safety: 60 },
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token) return null
  return new Redis({ url, token })
}

function makeRatelimiter(redis: Redis, requestsPerMinute: number): Ratelimit {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requestsPerMinute, '1 m'),
    analytics: false,
  })
}

export async function checkRateLimit(
  userId: string,
  plan: string,
  endpoint: 'ai' | 'github' | 'safety',
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const redis = getRedis()
  if (!redis) {
    // Upstash not configured — allow through (fail open with a warning in logs)
    console.warn('[ratelimit] Upstash not configured, rate limiting is disabled')
    return {
      success: true,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      reset: Date.now() + 60_000,
    }
  }

  const resolvedPlan = LIMITS[plan] ? plan : 'free'
  const requestsPerMinute = LIMITS[resolvedPlan][endpoint]
  const limiter = makeRatelimiter(redis, requestsPerMinute)
  const key = `${userId}:${endpoint}`

  const result = await limiter.limit(key)
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  }
}

export function applyRateLimitHeaders(
  res: { setHeader: (name: string, value: number | string) => void },
  limitResult: { limit: number; remaining: number; reset: number },
) {
  res.setHeader('X-RateLimit-Limit', limitResult.limit)
  res.setHeader('X-RateLimit-Remaining', limitResult.remaining)
  res.setHeader('X-RateLimit-Reset', limitResult.reset)
}
