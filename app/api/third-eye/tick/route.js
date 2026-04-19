// ── GET /api/third-eye/tick ───────────────────────────────────────────────────
// Lightweight tick update — called every 10s by ThirdEyePanel.
// Returns ONLY live price data and elapsed time — does NOT re-run the engine.
// State transitions happen only on candle closes (in /scan).

import { NextResponse }  from 'next/server';
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session';
import { getDataProvider } from '@/app/lib/providers';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

const TICK_TTL  = 12; // 12s — slightly longer than poll interval

// Per-underlying quote config
const UNDERLYING_QUOTE = {
  NIFTY:  'NSE:NIFTY 50',
  SENSEX: 'BSE:SENSEX',
};
const tickKey = (underlying) => `${NS}:${underlying.toLowerCase()}-ltp`;

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
    await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}?ex=${ttl}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch { /* silent */ }
}

export async function GET(req) {
  const { session, error } = await requireSession();
  if (error)    return serviceUnavailable(error);
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const underlying = (searchParams.get('underlying') === 'SENSEX') ? 'SENSEX' : 'NIFTY';
  const quoteKey   = UNDERLYING_QUOTE[underlying];
  const cacheKey   = tickKey(underlying);

  // Try Redis cache first (avoids hitting Kite on every tick)
  const cached = await redisGet(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite disconnected' }, { status: 503 });
    }

    const quote = await dp.getQuote([quoteKey]);
    const ltp   = quote?.[quoteKey]?.last_price ?? null;

    const result = {
      ltp,
      underlying,
      change:    quote?.[quoteKey]?.net_change ?? null,
      changePct: quote?.[quoteKey]?.net_change_percentage ?? null,
      timestamp: new Date().toISOString(),
    };

    if (ltp) await redisSet(cacheKey, result, TICK_TTL);
    return NextResponse.json(result);

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
