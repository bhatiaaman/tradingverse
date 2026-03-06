import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 60 req/min for intelligence (expensive: 5 Kite calls + Anthropic)
export const intelligenceLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix:  'rl:intelligence',
});

// 20 req/min for order placement (safety)
export const orderLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix:  'rl:order',
});

/**
 * Check rate limit for a request.
 * @returns { limited: boolean, retryAfter?: number }
 */
export async function checkLimit(limiter, request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { success, reset } = await limiter.limit(ip);
  if (!success) {
    return { limited: true, retryAfter: Math.ceil((reset - Date.now()) / 1000) };
  }
  return { limited: false };
}
