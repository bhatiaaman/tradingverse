// app/api/health/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';
import { getProviderStatus } from '@/app/lib/providers';

async function checkRedis() {
  try {
    const start = Date.now();
    // ping is the lightest operation; if it returns 'PONG' Redis is up
    const pong = await redis.ping();
    const ms = Date.now() - start;
    return { ok: pong === 'PONG', latencyMs: ms };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function GET() {
  const [redisCheck, providerStatus] = await Promise.allSettled([
    checkRedis(),
    getProviderStatus(),
  ]);

  const redis_  = redisCheck.status === 'fulfilled' ? redisCheck.value  : { ok: false, error: redisCheck.reason?.message };
  const broker  = providerStatus.status === 'fulfilled' ? providerStatus.value : { connected: false };

  const allOk = redis_.ok;
  const status = allOk ? 'operational' : 'degraded';

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    checks: {
      redis:  redis_,
      broker: {
        ok:        broker.connected,
        label:     broker.brokerLabel || 'Zerodha Kite',
        connected: broker.connected,
      },
    },
  }, {
    status: allOk ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
