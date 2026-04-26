import { NextResponse }                       from 'next/server';
import { requireSession, unauthorized }        from '@/app/lib/session';
import { sql }                                 from '@/app/lib/db';

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

async function redisSet(key, value, ttl) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url     = `${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}${ttl ? `?ex=${ttl}` : ''}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch {}
}

// Push active alerts snapshot to Redis so the bridge can read it
async function syncActiveToRedis() {
  const rows = await sql`SELECT id, symbol, instrument_token, threshold::float AS threshold, direction FROM alerts WHERE status = 'active'`;
  await redisSet(`${NS}:alerts:active`, rows, 300); // 5 min TTL — bridge also polls every 60s
}

// GET /api/alerts — list all alerts (active + recent triggered)
export async function GET(req) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  const rows = await sql`
    SELECT id, symbol, instrument_token, threshold::float AS threshold, direction, note, status, created_at, triggered_at
    FROM alerts
    WHERE status != 'cancelled'
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return NextResponse.json({ alerts: rows });
}

// POST /api/alerts — create a new price alert
// Body: { symbol, threshold, direction: 'above'|'below', note? }
export async function POST(req) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json();
  const { symbol, threshold, direction, note = null } = body;

  if (!symbol || threshold == null || !direction) {
    return NextResponse.json({ error: 'symbol, threshold, and direction are required' }, { status: 400 });
  }
  if (direction !== 'above' && direction !== 'below') {
    return NextResponse.json({ error: 'direction must be above or below' }, { status: 400 });
  }

  // Resolve instrument_token from dom:stock-token or fut-token Redis keys
  const sym = symbol.toUpperCase().trim();
  let token = await redisGet(`${NS}:dom:stock-token:${sym}`);
  if (!token) token = await redisGet(`${NS}:fut-token-${sym}`);
  if (!token) {
    return NextResponse.json({
      error: `${sym} is not currently tracked by the bridge. It must be in today's intraday watchlist or a futures index.`,
    }, { status: 422 });
  }

  const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await sql`
    INSERT INTO alerts (id, symbol, instrument_token, threshold, direction, note)
    VALUES (${id}, ${sym}, ${Number(token)}, ${Number(threshold)}, ${direction}, ${note})
  `;

  await syncActiveToRedis();
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
