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

// ── Signal label helpers ──────────────────────────────────────────────────────
const SIG = {
  bidHeavy:   'Bid heavy',
  askHeavy:   'Ask heavy',
  bidStack:   'Bid stacking',
  askStack:   'Ask stacking',
  posDelta:   'Positive delta',
  negDelta:   'Negative delta',
  vwapSupp:   'VWAP support',
  vwapRes:    'VWAP resistance',
  wallAbsorb: (isBull) => isBull ? 'Resistance absorbed' : 'Support absorbed',
};

function confidence(n) {
  return n >= 3 ? 'high' : n >= 2 ? 'medium' : 'low';
}

function biasLabel(isBull, n) {
  const dir = isBull ? 'bullish' : 'bearish';
  return n >= 3 ? `Strong ${dir} bias` : n >= 2 ? `${dir.charAt(0).toUpperCase() + dir.slice(1)} bias` : `Mild ${dir} bias`;
}

// ── Verdict builder ───────────────────────────────────────────────────────────
// vwap — current VWAP level (enables context conditioning: at-VWAP vs in-trend)
function buildVerdict(snap, direction, entryPrice, targetPrice, vwap = null) {
  const isBull = direction === 'bull';
  const ltp    = snap.ltp ?? entryPrice ?? 0;

  const imbalance = snap.imbalance ?? 1.0;
  const delta5m   = snap.delta5m   ?? 0;

  // ── Pressure & delta alignment ────────────────────────────────────────────
  const pressureAligned = isBull ? imbalance >= 1.6  : imbalance <= 0.63;
  const pressureOpposed = isBull ? imbalance <= 0.63 : imbalance >= 1.6;
  const deltaAligned    = isBull ? delta5m >  500    : delta5m <  -500;
  const deltaOpposed    = isBull ? delta5m < -2000   : delta5m >  2000;

  // ── Context conditioning — where is price relative to VWAP? ──────────────
  const nearVwap      = vwap != null && Math.abs(ltp - vwap) <= 15;
  const atVwapSupport = nearVwap && isBull  && ltp >= vwap;
  const atVwapResist  = nearVwap && !isBull && ltp <= vwap;

  // ── Wall analysis ─────────────────────────────────────────────────────────
  const wallPrice     = isBull ? snap.askWallPrice : snap.bidWallPrice;
  const wallQty       = isBull ? snap.askWallQty   : snap.bidWallQty;
  const wallInRange   = wallPrice != null && entryPrice != null && targetPrice != null
    && (isBull
      ? wallPrice > entryPrice && wallPrice <= targetPrice
      : wallPrice < entryPrice && wallPrice >= targetPrice);
  const wallNearEntry = wallPrice != null && entryPrice != null
    && Math.abs(wallPrice - entryPrice) <= 15
    && wallQty != null && wallQty > 20000;
  const wallAbsorbing = isBull ? snap.icebergAsk != null : snap.icebergBid != null;

  // ── Delta divergence — trapped traders signal ─────────────────────────────
  const strongDelta = Math.abs(delta5m) > 2000;
  const absorption  = strongDelta && deltaAligned && !pressureAligned;

  // ── Spread & stacking ─────────────────────────────────────────────────────
  const spreadPct       = ltp > 0 ? (snap.spread ?? 0) / ltp * 100 : 0;
  const spreadWide      = spreadPct > 0.15;
  const stackingAligned = isBull ? snap.bidStacking === 'up' : snap.askStacking === 'up';

  // ── Template builder: every verdict uses the same 6-field structure ─────────
  // { level, icon, confidence, message (signal combo), bias, context,
  //   meaning, implication, action, invalidation }

  // ══ Rules in priority order ═══════════════════════════════════════════════

  // 1. AVOID — opposing signals both active
  if (pressureOpposed && deltaOpposed) {
    const ratio = (isBull ? 1 / Math.max(imbalance, 0.01) : imbalance).toFixed(1);
    const sigs  = [isBull ? SIG.askHeavy : SIG.bidHeavy, isBull ? SIG.negDelta : SIG.posDelta];
    return {
      level:        'avoid',
      icon:         '🚫',
      confidence:   'high',
      message:      `${sigs.join(' + ')} → ${isBull ? 'Bearish' : 'Bullish'} flow dominates`,
      bias:         `${isBull ? 'Bearish' : 'Bullish'} (High)`,
      context:      'Counter-trend pressure',
      meaning:      `${ratio}× more ${isBull ? 'sellers' : 'buyers'} than ${isBull ? 'buyers' : 'sellers'} — flow strongly against this trade`,
      implication:  `${isBull ? 'Downside' : 'Upside'} momentum likely to continue`,
      action:       'Avoid this setup — do not fight the current flow',
      invalidation: `Imbalance normalises and delta flips ${isBull ? 'positive' : 'negative'}`,
    };
  }

  // 2. WAIT — wall in path, not being absorbed
  if ((wallInRange || wallNearEntry) && !wallAbsorbing) {
    const dist   = wallPrice != null && entryPrice != null ? Math.round(Math.abs(wallPrice - entryPrice)) : null;
    const qtyStr = wallQty ? wallQty.toLocaleString('en-IN') : '—';
    return {
      level:        'wait',
      icon:         '⏳',
      confidence:   'medium',
      message:      `${isBull ? 'Resistance' : 'Support'} wall at ₹${wallPrice}${dist ? ` (${dist}pts away)` : ''}`,
      bias:         `${isBull ? 'Bullish' : 'Bearish'} — blocked`,
      context:      `${isBull ? 'Resistance' : 'Support'} wall`,
      meaning:      `${qtyStr} contracts defending ₹${wallPrice} — price likely to stall or reject`,
      implication:  `${isBull ? 'Upside' : 'Downside'} capped until wall clears`,
      action:       `Watch ₹${wallPrice} — enter only after wall clears with ${isBull ? 'buy' : 'sell'} volume`,
      invalidation: `Wall absorbs with volume → elevated ${isBull ? 'breakout' : 'breakdown'} probability`,
    };
  }

  // 3. WAIT — absorption / possible trapped traders
  if (absorption) {
    const sigs = [isBull ? SIG.posDelta : SIG.negDelta, isBull ? SIG.askHeavy : SIG.bidHeavy];
    return {
      level:        'wait',
      icon:         '⏳',
      confidence:   'medium',
      message:      `${sigs.join(' + ')} → Possible ${isBull ? 'bull' : 'bear'} trap`,
      bias:         'Neutral — wait',
      context:      'Absorption / divergence',
      meaning:      `Heavy ${isBull ? 'buying' : 'selling'} flow but order book not confirming — ${isBull ? 'longs' : 'shorts'} may be getting trapped`,
      implication:  `If price ${isBull ? 'fails to rise' : 'fails to fall'}, trapped ${isBull ? 'longs' : 'shorts'} will panic-exit and accelerate the ${isBull ? 'drop' : 'rally'}`,
      action:       'Wait for price to confirm direction before entering',
      invalidation: `Price ${isBull ? 'rises' : 'falls'} with imbalance flipping ${isBull ? 'bullish' : 'bearish'} → trap resolved`,
    };
  }

  // 4. CAUTION — mixed or deteriorating
  if ((!pressureAligned && !pressureOpposed) || (pressureAligned && deltaOpposed) || spreadWide) {
    if (pressureAligned && deltaOpposed) {
      return {
        level:        'caution',
        icon:         '⚠️',
        confidence:   'low',
        message:      `${isBull ? SIG.bidHeavy : SIG.askHeavy} + ${isBull ? SIG.negDelta : SIG.posDelta} → Momentum fading`,
        bias:         `${isBull ? 'Mild bullish' : 'Mild bearish'} (Low)`,
        context:      'Fading momentum',
        meaning:      `${isBull ? 'Buy' : 'Sell'} side heavier but flow is slowing — ${isBull ? 'sellers' : 'buyers'} stepping in`,
        implication:  'Move may stall or reverse — reduced follow-through',
        action:       `Consider smaller size or wait for fresh ${isBull ? 'buying' : 'selling'} signal`,
        invalidation: `Delta turns sharply ${isBull ? 'negative' : 'positive'} → bias flips`,
      };
    }
    if (spreadWide) {
      return {
        level:        'caution',
        icon:         '⚠️',
        confidence:   'low',
        message:      `Wide spread ₹${(snap.spread ?? 0).toFixed(1)} → Execution risk elevated`,
        bias:         'Neutral — execution risk',
        context:      'Poor liquidity',
        meaning:      `Spread of ₹${(snap.spread ?? 0).toFixed(1)} means immediate loss on entry`,
        implication:  'Slippage will eat into P&L regardless of direction',
        action:       'Use limit orders only — reduce size until spread tightens',
        invalidation: 'Spread narrows to ₹1.5 or below',
      };
    }
    return {
      level:        'caution',
      icon:         '⚠️',
      confidence:   'low',
      message:      'Balanced order book → No clear edge',
      bias:         'Neutral (Low)',
      context:      'Range / indecision',
      meaning:      'Neither side dominating — buyers and sellers are balanced',
      implication:  'No directional edge in the order book right now',
      action:       'Wait for VWAP retest or strong momentum candle',
      invalidation: 'One side clearly dominates imbalance and delta',
    };
  }

  // ══ GO — build signal combination + 6-field template ═════════════════════

  const sigs = [];
  if (stackingAligned)               sigs.push(isBull ? SIG.bidStack  : SIG.askStack);
  if (pressureAligned)               sigs.push(isBull ? SIG.bidHeavy  : SIG.askHeavy);
  if (deltaAligned)                  sigs.push(isBull ? SIG.posDelta  : SIG.negDelta);
  if (atVwapSupport || atVwapResist) sigs.push(isBull ? SIG.vwapSupp  : SIG.vwapRes);
  if (wallAbsorbing)                 sigs.push(SIG.wallAbsorb(isBull));

  const conf    = confidence(sigs.length);
  const biasStr = biasLabel(isBull, sigs.length);
  const sigLine = sigs.length > 0 ? `${sigs.join(' + ')} → ${biasStr}` : biasStr;

  // Context-specific 6-field content
  let context, meaning, implication, action, invalidation;

  if (wallAbsorbing && (wallInRange || wallNearEntry)) {
    context      = `${isBull ? 'Resistance' : 'Support'} being absorbed`;
    meaning      = `${isBull ? 'Sellers' : 'Buyers'} at ₹${wallPrice} are being repeatedly hit and refilled — iceberg absorption`;
    implication  = `${isBull ? 'Upside' : 'Downside'} breakout probability elevated once wall clears`;
    action       = `Look for break ${isBull ? 'above' : 'below'} ₹${wallPrice} with volume confirmation`;
    invalidation = `Wall holds and price reverses — ${isBull ? 'sellers' : 'buyers'} still in control`;
  } else if ((atVwapSupport || atVwapResist) && stackingAligned) {
    context      = 'VWAP support';
    meaning      = `${isBull ? 'Buyers' : 'Sellers'} actively defending VWAP with increasing demand`;
    implication  = `Above-average probability of ${isBull ? 'bounce' : 'rejection'} if structure holds`;
    action       = `Favor ${isBull ? 'longs' : 'shorts'} near VWAP — wait for higher ${isBull ? 'low' : 'high'} confirmation`;
    invalidation = `VWAP breaks with ${isBull ? 'negative' : 'positive'} delta — bias flips`;
  } else if (stackingAligned && deltaAligned) {
    context      = 'Momentum phase';
    meaning      = `${isBull ? 'Buyers' : 'Sellers'} aggressively adding orders with net ${isBull ? 'buying' : 'selling'} ${Math.abs(delta5m / 1000).toFixed(1)}k contracts`;
    implication  = `${isBull ? 'Upside' : 'Downside'} pressure building — momentum likely to continue`;
    action       = `Scale in on confirmation ${isBull ? 'above' : 'below'} recent ${isBull ? 'high' : 'low'}`;
    invalidation = `Delta turns ${isBull ? 'negative' : 'positive'} or price stalls for 2+ candles`;
  } else {
    context      = isBull ? 'Bullish pressure' : 'Bearish pressure';
    meaning      = `${isBull ? 'Buy' : 'Sell'} side ${imbalance.toFixed(1)}× heavier${targetPrice ? ` — path to ₹${targetPrice} appears clear` : ''}`;
    implication  = `Conditions lean ${isBull ? 'bullish' : 'bearish'} — above-average probability if structure holds`;
    action       = `Seek confirmation before sizing — scale in, don't go full at once`;
    invalidation = `Imbalance normalises below ${isBull ? '1.2' : '0.83'}`;
  }

  return { level: 'go', icon: '✅', confidence: conf, message: sigLine, bias: `${biasStr.replace(' bias', '')} (${conf.charAt(0).toUpperCase() + conf.slice(1)})`, context, meaning, implication, action, invalidation };
}

// ── Main export ───────────────────────────────────────────────────────────────
// token       — Kite instrument token (Nifty Fut, stock, etc.)
// direction   — 'bull' | 'bear'
// entryPrice  — expected entry price (used for wall-in-range check)
// targetPrice — expected target (used for wall-in-range check)
// vwap        — current VWAP level (enables at-VWAP context conditioning)
export async function getDomContext(token, direction, entryPrice = null, targetPrice = null, vwap = null) {
  if (!token || !direction) return null;

  const snap = await redisGet(SNAPSHOT_KEY(token));
  if (!snap) return { level: 'no-data', icon: '📊', message: 'No DOM data yet', detail: 'Bridge not connected or instrument not subscribed', fresh: false };

  const ageSeconds = snap.updatedAt
    ? Math.floor(Date.now() / 1000) - snap.updatedAt
    : 999;

  if (ageSeconds > STALE_SECONDS) {
    return { level: 'no-data', icon: '📊', message: 'DOM data stale', detail: `Last update ${ageSeconds}s ago — bridge may have dropped`, fresh: false };
  }

  const verdict = buildVerdict(snap, direction, entryPrice, targetPrice, vwap);

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
    level:      'go',
    icon:       '✅',
    confidence: 'high',
    message:    `[DEV] ${isBull ? 'Bid stacking + Positive delta + VWAP support' : 'Ask stacking + Negative delta + VWAP resistance'} → Strong ${isBull ? 'bullish' : 'bearish'} bias`,
    detail:     `Above-average probability if structure holds · Scale in on confirmation · ❗ Bias flips if VWAP breaks with ${isBull ? 'negative' : 'positive'} delta`,
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
