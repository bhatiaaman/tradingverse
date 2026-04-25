// ── DOM Context — Pre-trade verdict engine ────────────────────────────────────
// Reads dom:snapshot:{token} written by the VPS bridge every 5s.
// Returns a structured verdict (go / wait / caution / avoid / no-data)
// with a plain-English message the trader can act on in under 2 seconds.
//
// Snapshot schema (written by kite-ws-bridge.js):
// {
//   token, symbol, ltp, updatedAt,
//   bids: [{ price, qty, orders }, ...],   // top 5
//   asks: [{ price, qty, orders }, ...],   // top 5
//   imbalance,        // totalBidQty(top3) / totalAskQty(top3)
//   bidWallPrice,     // price of largest single bid level
//   bidWallQty,
//   askWallPrice,     // price of largest single ask level
//   askWallQty,
//   bidStacking,      // 'up' | 'down' | 'neutral' (tick-over-tick change)
//   askStacking,
//   delta5m,          // net approx delta last 5 min (positive = net buy)
//   delta30m,
//   deltaDirection,   // 'bull' | 'bear' | 'neutral'
//   spread,           // ask[0].price - bid[0].price
//   icebergAsk,       // price level if detected, null otherwise
//   icebergBid,
// }
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

export const SNAPSHOT_KEY = (token) => `${NS}:dom:snapshot:${token}`;
const STALE_SECONDS = 30;

// ── Redis ─────────────────────────────────────────────────────────────────────
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

// ── Verdict builder ───────────────────────────────────────────────────────────
function buildVerdict(snap, direction, entryPrice, targetPrice) {
  const isBull = direction === 'bull';

  const imbalance = snap.imbalance ?? 1.0;
  const delta5m   = snap.delta5m   ?? 0;

  // Pressure alignment
  const pressureAligned = isBull ? imbalance >= 1.6  : imbalance <= 0.63;
  const pressureOpposed = isBull ? imbalance <= 0.63 : imbalance >= 1.6;

  // Delta alignment
  const deltaAligned = isBull ? delta5m > 500   : delta5m < -500;
  const deltaOpposed = isBull ? delta5m < -2000 : delta5m > 2000;

  // Wall in trade range
  const wallPrice   = isBull ? snap.askWallPrice : snap.bidWallPrice;
  const wallQty     = isBull ? snap.askWallQty   : snap.bidWallQty;
  const wallInRange = wallPrice != null && entryPrice != null && targetPrice != null
    && (isBull
      ? wallPrice > entryPrice && wallPrice <= targetPrice
      : wallPrice < entryPrice && wallPrice >= targetPrice);
  const wallNearEntry = wallPrice != null && entryPrice != null
    && Math.abs(wallPrice - entryPrice) <= 15
    && wallQty != null && wallQty > 20000;

  // Spread quality
  const spreadPct  = snap.ltp > 0 ? (snap.spread ?? 0) / snap.ltp * 100 : 0;
  const spreadWide = spreadPct > 0.15;

  // Stacking
  const stackingAligned = isBull ? snap.bidStacking === 'up' : snap.askStacking === 'up';

  // ── Rules evaluated in priority order ────────────────────────────────────

  // AVOID — DOM actively contradicts trade direction
  if (pressureOpposed && deltaOpposed) {
    const ratio = isBull
      ? (1 / Math.max(imbalance, 0.01)).toFixed(1)
      : imbalance.toFixed(1);
    return {
      level:   'avoid',
      icon:    '🚫',
      message: `Avoid right now — ${isBull ? 'sellers' : 'buyers'} overwhelming`,
      detail:  `${isBull ? 'Ask' : 'Bid'} ${ratio}× heavier · Delta ${isBull ? 'negative' : 'positive'} · Wait for reversal`,
    };
  }

  // WAIT — significant wall directly in path to target or near entry
  if (wallInRange || wallNearEntry) {
    const dist = wallPrice != null && entryPrice != null
      ? Math.round(Math.abs(wallPrice - entryPrice))
      : null;
    const qtyStr = wallQty ? wallQty.toLocaleString('en-IN') : '—';
    return {
      level:   'wait',
      icon:    '⏳',
      message: `Wait — ${isBull ? 'ask' : 'bid'} wall at ₹${wallPrice}${dist ? ` (${dist}pts away)` : ''}`,
      detail:  `${qtyStr} qty defending. Let it clear, then entry looks strong.`,
    };
  }

  // CAUTION — mixed signals or poor fill conditions
  if ((!pressureAligned && !pressureOpposed) || (pressureAligned && deltaOpposed) || spreadWide) {
    const reasons = [];
    if (!pressureAligned && !pressureOpposed) reasons.push('mixed bid/ask pressure');
    if (pressureAligned && deltaOpposed)       reasons.push(`delta ${isBull ? 'fading' : 'turning positive'}`);
    if (spreadWide)                            reasons.push(`spread wide ₹${(snap.spread ?? 0).toFixed(1)}`);
    return {
      level:   'caution',
      icon:    '⚠️',
      message: `Proceed carefully — ${reasons[0]}`,
      detail:  `Size down or wait for ${isBull ? 'delta to turn positive' : 'delta to turn negative'}.`,
    };
  }

  // GO — conditions support the trade
  const extras = [];
  if (stackingAligned) extras.push(`${isBull ? 'bid' : 'ask'} stacking`);
  if (deltaAligned)    extras.push(`delta ${isBull ? '+' : ''}${(delta5m / 1000).toFixed(1)}k`);
  if (snap.spread)     extras.push(`spread ₹${snap.spread.toFixed(1)}`);

  const targetStr = targetPrice ? `, path clear to ${targetPrice}` : '';
  return {
    level:   'go',
    icon:    '✅',
    message: `Good entry — ${isBull ? 'buyers' : 'sellers'} in control${targetStr}`,
    detail:  extras.join(' · ') || `Imbalance ${imbalance.toFixed(1)}× ${isBull ? 'bid' : 'ask'} heavy`,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────
// token       — Kite instrument token (Nifty Fut, stock, etc.)
// direction   — 'bull' | 'bear'
// entryPrice  — expected entry price (used for wall-in-range check)
// targetPrice — expected target (used for wall-in-range check)
export async function getDomContext(token, direction, entryPrice = null, targetPrice = null) {
  if (!token || !direction) return null;

  const snap = await redisGet(SNAPSHOT_KEY(token));
  if (!snap) return { level: 'no-data', icon: '📊', message: 'No DOM data yet', detail: 'Bridge not connected or instrument not subscribed', fresh: false };

  const ageSeconds = snap.updatedAt
    ? Math.floor(Date.now() / 1000) - snap.updatedAt
    : 999;

  if (ageSeconds > STALE_SECONDS) {
    return { level: 'no-data', icon: '📊', message: 'DOM data stale', detail: `Last update ${ageSeconds}s ago — bridge may have dropped`, fresh: false };
  }

  const verdict = buildVerdict(snap, direction, entryPrice, targetPrice);

  return {
    ...verdict,
    fresh: true,
    ltp:   snap.ltp    ?? null,
    numbers: {
      imbalance:    snap.imbalance    ?? null,
      delta5m:      snap.delta5m      ?? null,
      spread:       snap.spread       ?? null,
      bidWallPrice: snap.bidWallPrice ?? null,
      bidWallQty:   snap.bidWallQty   ?? null,
      askWallPrice: snap.askWallPrice ?? null,
      askWallQty:   snap.askWallQty   ?? null,
      bidStacking:  snap.bidStacking  ?? null,
      askStacking:  snap.askStacking  ?? null,
    },
  };
}

// ── Dev mock — used when bridge is not running ────────────────────────────────
export function getMockDomContext(direction) {
  const isBull = direction === 'bull';
  return {
    level:   'go',
    icon:    '✅',
    message: `[DEV] Good entry — ${isBull ? 'buyers' : 'sellers'} in control`,
    detail:  `${isBull ? 'Bid' : 'Ask'} stacking · Delta ${isBull ? '+' : '-'}8.4k · Spread ₹1.2`,
    fresh:   true,
    ltp:     24050,
    numbers: {
      imbalance:    isBull ? 2.1 : 0.46,
      delta5m:      isBull ? 8400 : -8400,
      spread:       1.2,
      bidWallPrice: isBull ? null  : 24020,
      bidWallQty:   isBull ? null  : 38000,
      askWallPrice: isBull ? 24090 : null,
      askWallQty:   isBull ? 12000 : null,
      bidStacking:  isBull ? 'up'  : 'down',
      askStacking:  isBull ? 'down': 'up',
    },
  };
}
