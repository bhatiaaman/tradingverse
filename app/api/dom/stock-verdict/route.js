import { NextResponse }                 from 'next/server';
import { requireSession, unauthorized } from '@/app/lib/session';
import { getDomContext }                from '@/app/lib/dom-context';

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

// GET /api/dom/stock-verdict?symbol=HDFCBANK&direction=bull&entry=820&target=840&vwap=818
// Returns a structured DOM verdict for any stock subscribed by the bridge.
// Requires DOM_ENABLED=true and an active bridge session for the symbol.
export async function GET(req) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  if (process.env.DOM_ENABLED !== 'true') {
    return NextResponse.json({ available: false, reason: 'disabled' });
  }

  const url       = new URL(req.url);
  const symbol    = (url.searchParams.get('symbol') ?? '').toUpperCase().trim();
  const direction = url.searchParams.get('direction');
  const entry     = parseFloat(url.searchParams.get('entry'))  || null;
  const target    = parseFloat(url.searchParams.get('target')) || null;
  const vwap      = parseFloat(url.searchParams.get('vwap'))   || null;

  if (!symbol || !direction) {
    return NextResponse.json({ error: 'symbol and direction are required' }, { status: 400 });
  }
  if (direction !== 'bull' && direction !== 'bear') {
    return NextResponse.json({ error: 'direction must be bull or bear' }, { status: 400 });
  }

  const token = await redisGet(`${NS}:dom:stock-token:${symbol}`);
  if (!token) {
    return NextResponse.json({ available: false, reason: `${symbol} not subscribed by bridge` });
  }

  const verdict = await getDomContext(token, direction, entry, target, vwap);
  if (!verdict || verdict.level === 'no-data') {
    return NextResponse.json({ available: false, reason: verdict?.message ?? 'no snapshot' });
  }

  return NextResponse.json({ available: true, symbol, token, ...verdict });
}
