import { NextResponse } from 'next/server';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return null;
    try { return JSON.parse(data.result); } catch { return data.result; }
  } catch { return null; }
}

// GET /api/dom/status
// Returns bridge online/offline state by checking NIFTY snapshot freshness.
// No auth required — just a heartbeat check.
export async function GET() {
  if (process.env.DOM_ENABLED !== 'true') {
    return NextResponse.json({ online: false, reason: 'disabled' });
  }

  const futToken = await redisGet(`${NS}:fut-token-NIFTY`);
  if (!futToken) return NextResponse.json({ online: false, reason: 'no-token' });

  const snap = await redisGet(`${NS}:dom:snapshot:${futToken}`);
  if (!snap)   return NextResponse.json({ online: false, reason: 'no-snapshot' });

  const ageSeconds = snap.updatedAt
    ? Math.floor(Date.now() / 1000) - snap.updatedAt
    : 999;

  return NextResponse.json({
    online:   ageSeconds <= 30,
    lastSeen: ageSeconds,
    ltp:      snap.ltp ?? null,
  });
}
