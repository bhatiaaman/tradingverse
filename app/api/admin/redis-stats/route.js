// GET /api/admin/redis-stats  — returns in-process Redis command stats
// POST /api/admin/redis-stats — body { action: 'reset' } clears counters

import { NextResponse } from 'next/server';
import { getRedisStats, resetRedisStats } from '@/app/lib/redis-tracker';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'tradingverse';
const OWNER_EMAIL = process.env.OWNER_EMAIL?.toLowerCase().trim();

// Verify request is from the owner (session cookie check)
async function isOwner(req) {
  const token = req.cookies.get('tv_session')?.value;
  if (!token) return false;
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(`${NS}:session:${token}`)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    });
    const data = await res.json();
    const email = data.result ? (typeof data.result === 'string' ? data.result : JSON.parse(data.result)) : null;
    return OWNER_EMAIL && String(email).toLowerCase() === OWNER_EMAIL;
  } catch { return false; }
}

// Fetch Upstash DB-level stats via their REST API (returns monthly command count etc.)
async function fetchUpstashDbStats() {
  try {
    // Upstash exposes an /info endpoint that returns DB metadata including command count
    const res = await fetch(`${REDIS_URL}/info`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const raw = await res.text();
    // Parse the Redis INFO response (newline-delimited key:value)
    const info = {};
    for (const line of raw.split('\n')) {
      const clean = line.trim();
      if (!clean || clean.startsWith('#')) continue;
      const idx = clean.indexOf(':');
      if (idx > -1) info[clean.slice(0, idx).trim()] = clean.slice(idx + 1).trim();
    }
    return {
      totalCommandsProcessed: info.total_commands_processed || null,
      totalConnectionsReceived: info.total_connections_received || null,
      usedMemoryHuman: info.used_memory_human || null,
      uptimeInDays: info.uptime_in_days || null,
      redisVersion: info.redis_version || null,
    };
  } catch { return null; }
}

export async function GET(req) {
  if (!await isOwner(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [inProcess, dbStats] = await Promise.all([
    Promise.resolve(getRedisStats()),
    fetchUpstashDbStats(),
  ]);

  return NextResponse.json({
    // In-process stats (this serverless worker instance)
    inProcess,
    // DB-level stats from Upstash INFO
    db: dbStats,
    // Free tier limit for context
    freeTierLimit: 500_000,
    note: 'inProcess stats accumulate within one warm serverless worker. They reset when the worker cold-starts. Use db.totalCommandsProcessed for the true lifetime total.',
  });
}

export async function POST(req) {
  if (!await isOwner(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { action } = await req.json().catch(() => ({}));
  if (action === 'reset') {
    resetRedisStats();
    return NextResponse.json({ ok: true, message: 'In-process stats reset' });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
