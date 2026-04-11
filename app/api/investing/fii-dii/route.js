// FII/DII data is fetched by the VPS worker (fii-dii-fetcher.js, Indian IP)
// and stored in Redis. This route only reads from Redis — never hits NSE directly.
// VPS cron: Mon-Fri 6:30 PM IST via pm2.

import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';

const NS = process.env.REDIS_NAMESPACE || 'tradingverse';

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function GET() {
  const today = todayIST();

  // Try today's key first, then last-known fallback
  const raw = await redis.get(`${NS}:fii-dii:${today}`)
           ?? await redis.get(`${NS}:fii-dii:last-known`);

  if (!raw) {
    return NextResponse.json({
      nseBlocked: false,
      data: [],
      date: today,
      cached: false,
      message: 'No data yet — VPS worker runs Mon-Fri at 6:30 PM IST',
    });
  }

  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const isToday = parsed.date === today;
  return NextResponse.json({ ...parsed, cached: true, stale: !isToday });
}
