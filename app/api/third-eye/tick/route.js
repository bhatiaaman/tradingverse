// ── GET /api/third-eye/tick ───────────────────────────────────────────────────
// Lightweight live-price tick endpoint — called every 10 seconds by the live card.
// Does NOT run the full scan — just fetches spot LTP and computes live VWAP distance.
//
// Uses /api/quotes (which has its own Redis cache) — no direct Kite calls.
// Returns: { ltp, change, changePct, vwapDist, vwapPct, bias, updatedAt }

import { NextResponse } from 'next/server';
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

const LIVE_KEY  = (sym) => `${NS}:third-eye:live:${sym}`;
const BIAS_KEY  = (sym) => `${NS}:third-eye:bias:${sym}`;

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

export async function GET(req) {
  const { session, error } = await requireSession();
  if (error) return serviceUnavailable(error);
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'NIFTY').toUpperCase();

  if (!/^[A-Z0-9]{1,20}$/.test(symbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  try {
    // ── Fetch LTP via /api/quotes (already rate-limited + cached) ─────────────
    const baseUrl  = `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('host')}`;
    const quotesRes = await fetch(`${baseUrl}/api/quotes?symbols=${symbol}`, {
      headers: { Cookie: req.headers.get('cookie') || '' },
      cache: 'no-store',
    });
    const quotesData = await quotesRes.json();
    const quote = quotesData.quotes?.[0];

    const ltp       = quote?.ltp ?? null;
    const prevClose = quote?.prevClose ?? null;
    const change    = ltp && prevClose ? parseFloat((ltp - prevClose).toFixed(2)) : null;
    const changePct = ltp && prevClose ? parseFloat(((ltp - prevClose) / prevClose * 100).toFixed(2)) : null;

    // ── Fetch current bias + live entry from Redis ─────────────────────────────
    const [biasState, liveEntry] = await Promise.all([
      redisGet(BIAS_KEY(symbol)),
      redisGet(LIVE_KEY(symbol)),
    ]);

    // Compute VWAP distance from live entry's context (already computed by scan)
    const vwapPrice = liveEntry?.context?.vwap?.price ?? null;
    const vwapDist  = ltp && vwapPrice ? parseFloat((ltp - vwapPrice).toFixed(2)) : null;
    const vwapPct   = ltp && vwapPrice ? parseFloat(((ltp - vwapPrice) / vwapPrice * 100).toFixed(2)) : null;
    const aboveVwap = ltp && vwapPrice ? ltp >= vwapPrice : null;

    const now = new Date(Date.now() + 19800 * 1000);
    const updatedAt = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;

    return NextResponse.json({
      ltp,
      change,
      changePct,
      vwapDist,
      vwapPct,
      aboveVwap,
      bias:       biasState?.bias ?? 'NEUTRAL',
      biasSince:  biasState?.since ?? null,
      updatedAt,
      symbol,
    });

  } catch (err) {
    console.error('[third-eye/tick]', err.message);
    return NextResponse.json({ error: 'Tick failed' }, { status: 500 });
  }
}
