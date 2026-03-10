// app/api/health/route.js
import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';
import { getProviderStatus } from '@/app/lib/providers';

async function checkRedis() {
  try {
    const start = Date.now();
    await redis.set('_health_ping', '1', { ex: 10 });
    const val = await redis.get('_health_ping');
    const ms = Date.now() - start;
    return { ok: val === '1', latencyMs: ms };
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
