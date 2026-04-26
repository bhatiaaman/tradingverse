import { NextResponse }                 from 'next/server';
import { requireSession, unauthorized } from '@/app/lib/session';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const SUBS_KEY    = `${NS}:dom:subscriptions`;
const MAX_SUBS    = 10;

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

async function redisSet(key, value) {
  try {
    const enc = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${enc}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch { /* non-fatal */ }
}

// Resolve live/stale status for a stock symbol.
// Bridge writes to dom:snapshot:{token}; token is cached at dom:stock-token:{symbol}.
async function symbolStatus(sym) {
  const token = await redisGet(`${NS}:dom:stock-token:${sym}`);
  if (!token) return { symbol: sym, alive: false, ageSeconds: null, ltp: null };
  const snap = await redisGet(`${NS}:dom:snapshot:${token}`);
  const age  = snap?.updatedAt ? Math.floor(Date.now() / 1000) - snap.updatedAt : null;
  return {
    symbol:     sym,
    alive:      age != null && age <= 30,
    ageSeconds: age,
    ltp:        snap?.ltp ?? null,
  };
}

// GET /api/dom/subscriptions
// Returns current subscription list with live/stale status per symbol.
export async function GET(req) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  const subs = await redisGet(SUBS_KEY) ?? [];
  const withStatus = await Promise.all(subs.map(symbolStatus));
  return NextResponse.json({ subscriptions: withStatus });
}

// POST /api/dom/subscriptions  { symbol: 'HDFCBANK' }
// Adds a symbol to the watch list (bridge picks up the change within its next poll cycle).
export async function POST(req) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const sym  = (body.symbol ?? '').toUpperCase().replace(/[^A-Z0-9&]/g, '').trim();
  if (!sym) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const subs = await redisGet(SUBS_KEY) ?? [];
  if (subs.includes(sym)) return NextResponse.json({ subscriptions: subs });
  if (subs.length >= MAX_SUBS)
    return NextResponse.json({ error: `Max ${MAX_SUBS} symbols` }, { status: 400 });

  const updated = [...subs, sym];
  await redisSet(SUBS_KEY, updated);
  return NextResponse.json({ subscriptions: updated });
}

// DELETE /api/dom/subscriptions?symbol=HDFCBANK
export async function DELETE(req) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  const url = new URL(req.url);
  const sym = (url.searchParams.get('symbol') ?? '').toUpperCase().trim();
  if (!sym) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const subs    = await redisGet(SUBS_KEY) ?? [];
  const updated = subs.filter(s => s !== sym);
  await redisSet(SUBS_KEY, updated);
  return NextResponse.json({ subscriptions: updated });
}
