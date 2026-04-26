import { NextResponse }                 from 'next/server';
import { requireSession, unauthorized } from '@/app/lib/session';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const STALE_SEC   = 30;

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

// GET /api/dom/snapshot?underlying=NIFTY
// Returns raw bid/ask ladder + delta history for the DOM ladder UI.
// Delta history is written by /api/dom/pressure (polled every 15s).
export async function GET(req) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  if (process.env.DOM_ENABLED !== 'true') return NextResponse.json({ available: false });

  const url        = new URL(req.url);
  const underlying = (url.searchParams.get('underlying') ?? 'NIFTY').toUpperCase();

  // Parallel: token lookup + delta history (both known from underlying alone)
  const [futToken, deltaHistory] = await Promise.all([
    redisGet(`${NS}:fut-token-${underlying}`),
    redisGet(`${NS}:dom:delta-history-${underlying}`),
  ]);
  if (!futToken) return NextResponse.json({ available: false });

  const snap = await redisGet(`${NS}:dom:snapshot:${futToken}`);
  if (!snap)    return NextResponse.json({ available: false });

  const ageSeconds = snap.updatedAt
    ? Math.floor(Date.now() / 1000) - snap.updatedAt
    : 999;
  if (ageSeconds > STALE_SEC) return NextResponse.json({ available: false, stale: true });

  return NextResponse.json({
    available:      true,
    ltp:            snap.ltp,
    bids:           (snap.bids  ?? []).slice(0, 5),
    asks:           (snap.asks  ?? []).slice(0, 5),
    spread:         snap.spread,
    imbalance:      snap.imbalance,
    delta5m:        snap.delta5m,
    delta30m:       snap.delta30m,
    deltaDirection: snap.deltaDirection,
    icebergAsk:     snap.icebergAsk,
    icebergBid:     snap.icebergBid,
    bidStacking:    snap.bidStacking,
    askStacking:    snap.askStacking,
    bidWallPrice:   snap.bidWallPrice,
    bidWallQty:     snap.bidWallQty,
    askWallPrice:   snap.askWallPrice,
    askWallQty:     snap.askWallQty,
    ageSeconds,
    deltaHistory:   (deltaHistory ?? []).slice(-20),
  });
}
