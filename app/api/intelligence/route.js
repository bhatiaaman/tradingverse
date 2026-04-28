// ─── GET /api/intelligence ────────────────────────────────────────────────────
// Central intelligence endpoint. Runs all 5 agents for a symbol, caches result
// in Redis for 3 min. Chart pill, OrderModal, and terminal all read from here.
//
// Query params:
//   symbol   — e.g. NIFTY, HCLTECH (default: NIFTY)
//   interval — e.g. 15minute, 5minute (default: 15minute)

import { NextResponse }     from 'next/server';
import { getIntelligence }  from '@/app/lib/intelligence/manager.js';
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session';
import { intelligenceLimiter, checkLimit } from '@/app/lib/rate-limit';
import { cachedRedisGet as redisGet, cachedRedisSet as redisSet } from '@/app/lib/cached-redis';

const NS          = process.env.REDIS_NAMESPACE || 'default';
const CACHE_TTL   = 180; // 3 minutes

function baseUrl(req) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();

  const rl = await checkLimit(intelligenceLimiter, req);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const { searchParams } = new URL(req.url);
  const symbol   = (searchParams.get('symbol')   || 'NIFTY').toUpperCase();
  const interval = searchParams.get('interval')  || '15minute';

  const cacheKey = `${NS}:intelligence:${symbol}:${interval}`;
  const cached   = await redisGet(cacheKey);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    const cookie = req.headers.get('cookie');
    const result = await getIntelligence(symbol, { base: baseUrl(req), cookie, interval });
    await redisSet(cacheKey, result, CACHE_TTL);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[intelligence]', symbol, err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
