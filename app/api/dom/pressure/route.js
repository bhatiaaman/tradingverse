import { NextResponse }                      from 'next/server';
import { requireSession, unauthorized }      from '@/app/lib/session';

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

// Score 0–10: imbalance (0–3) + delta (0–3) + stacking (0–1.5) + iceberg (0–1) + wall bonus (0–1.5)
function computeScore(snap, direction) {
  const isBull   = direction === 'bull';
  const imb      = snap.imbalance ?? 1.0;
  const delta5m  = snap.delta5m   ?? 0;
  const effImb   = isBull ? imb : 1 / Math.max(imb, 0.01);
  const effDelta = isBull ? delta5m : -delta5m;

  const imbScore   = effImb >= 2.5 ? 3 : effImb >= 2.0 ? 2.5 : effImb >= 1.6 ? 2 : effImb >= 1.2 ? 1 : 0.5;
  const deltaScore = effDelta > 5000 ? 3 : effDelta > 2000 ? 2 : effDelta > 500 ? 1 : 0;
  const stackScore = (isBull ? snap.bidStacking === 'up' : snap.askStacking === 'up') ? 1.5 : 0;
  const iceScore   = (isBull ? snap.icebergAsk : snap.icebergBid) ? 1 : 0;
  const wallBonus  = (isBull && snap.icebergAsk) || (!isBull && snap.icebergBid) ? 0.5 : 0;

  return Math.min(10, Math.max(0, parseFloat((imbScore + deltaScore + stackScore + iceScore + wallBonus).toFixed(1))));
}

// Derives actionable market state from a raw DOM snapshot — no setup context needed.
function buildPressure(snap) {
  const imbalance = snap.imbalance ?? 1.0;
  const delta5m   = snap.delta5m   ?? 0;
  const ltp       = snap.ltp       ?? 0;

  const bullPressure = imbalance >= 1.6 && delta5m > 0;
  const bearPressure = imbalance <= 0.63 && delta5m < 0;
  const direction    = bullPressure ? 'bull' : bearPressure ? 'bear' : 'neutral';

  const strong     = (direction === 'bull' && imbalance >= 2.0 && delta5m > 2000)
                  || (direction === 'bear' && imbalance <= 0.5  && delta5m < -2000);
  const strongDelta = Math.abs(delta5m) > 2000;
  const bullDelta   = delta5m > 0;
  const absorption  = strongDelta && ((bullDelta && imbalance < 1.2) || (!bullDelta && imbalance > 0.83));
  const bidStack    = snap.bidStacking === 'up';
  const askStack    = snap.askStacking === 'up';

  const score = direction === 'neutral' ? 0 : computeScore(snap, direction);

  // Build signal list for "Based on:" line
  const signals = [];
  if (direction !== 'neutral' && !absorption) {
    const isBull = direction === 'bull';
    if (isBull  && bidStack)   signals.push('Bid stacking');
    if (!isBull && askStack)   signals.push('Ask stacking');
    if (isBull  && imbalance >= 1.6) signals.push(`Buy side ${imbalance.toFixed(1)}× heavier`);
    if (!isBull && imbalance <= 0.63) signals.push(`Sell side ${(1 / Math.max(imbalance, 0.01)).toFixed(1)}× heavier`);
    if (isBull  && delta5m > 0)  signals.push(`Positive delta ${(delta5m / 1000).toFixed(1)}k`);
    if (!isBull && delta5m < 0)  signals.push(`Negative delta ${(Math.abs(delta5m) / 1000).toFixed(1)}k`);
    if (isBull  && snap.icebergAsk) signals.push('Sell wall absorbing');
    if (!isBull && snap.icebergBid) signals.push('Buy wall absorbing');
  } else if (absorption) {
    signals.push(bullDelta ? 'Heavy buying' : 'Heavy selling');
    signals.push('Price not confirming');
    if (bullDelta && imbalance < 1.2) signals.push('Bids not stacking');
    if (!bullDelta && imbalance > 0.83) signals.push('Asks not stacking');
  }

  // Bias label
  let biasLabel;
  if (absorption) {
    biasLabel = `Possible ${bullDelta ? 'Bull' : 'Bear'} Trap`;
  } else if (direction === 'bull' && strong) {
    biasLabel = 'Strong Bullish';
  } else if (direction === 'bull') {
    biasLabel = bidStack ? 'Bullish' : 'Mild Bullish';
  } else if (direction === 'bear' && strong) {
    biasLabel = 'Strong Bearish';
  } else if (direction === 'bear') {
    biasLabel = askStack ? 'Bearish' : 'Mild Bearish';
  } else {
    biasLabel = 'Neutral';
  }

  // Invalidation
  let invalidation;
  if (absorption) {
    invalidation = `If price ${bullDelta ? 'drops sharply' : 'rises sharply'}, trapped ${bullDelta ? 'longs' : 'shorts'} will accelerate the move`;
  } else if (direction === 'bull') {
    invalidation = strong
      ? 'Bias fades if delta turns negative or imbalance drops below 1.6'
      : 'Watch for imbalance to flip below 1.0 or delta to turn negative';
  } else if (direction === 'bear') {
    invalidation = strong
      ? 'Bias fades if delta turns positive or imbalance rises above 0.63'
      : 'Watch for imbalance to flip above 1.0 or delta to turn positive';
  } else {
    invalidation = 'Avoid entries until one side clearly dominates';
  }

  // Wall note
  let wallNote = null;
  if (snap.icebergAsk) {
    wallNote = `Sell wall at ₹${snap.icebergAsk} being absorbed — watch for breakout; if wall holds, longs likely stall`;
  } else if (snap.askWallPrice && snap.askWallQty > 15000) {
    wallNote = `Sell wall at ₹${snap.askWallPrice} — likely to cap upward moves unless absorbed`;
  } else if (snap.icebergBid) {
    wallNote = `Buy wall at ₹${snap.icebergBid} being absorbed — watch for breakdown; if wall holds, shorts likely stall`;
  } else if (snap.bidWallPrice && snap.bidWallQty > 15000) {
    wallNote = `Buy wall at ₹${snap.bidWallPrice} — likely to support price unless pulled`;
  }

  return { direction, biasLabel, score, signals, invalidation, wallNote, ltp, fresh: true };
}

// GET /api/dom/pressure?underlying=NIFTY
export async function GET(req) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  const url        = new URL(req.url);
  const underlying = url.searchParams.get('underlying') ?? 'NIFTY';
  const isDevReq   = url.searchParams.get('dev') === 'true' && process.env.NODE_ENV !== 'production';

  if (isDevReq) {
    return NextResponse.json({
      available:  true,
      direction:  'bull',
      biasLabel:  'Strong Bullish',
      score:      7.5,
      signals:    ['Bid stacking', 'Buy side 2.1× heavier', 'Positive delta 8.4k'],
      invalidation: 'Bias fades if delta turns negative or imbalance drops below 1.6',
      wallNote:   'Sell wall at ₹24,090 — likely to cap upward moves unless absorbed',
      ltp:        24050,
      fresh:      true,
    });
  }

  if (process.env.DOM_ENABLED !== 'true') {
    return NextResponse.json({ available: false });
  }

  const futToken = await redisGet(`${NS}:fut-token-${underlying}`);
  if (!futToken)  return NextResponse.json({ available: false });

  const snap = await redisGet(`${NS}:dom:snapshot:${futToken}`);
  if (!snap)      return NextResponse.json({ available: false });

  const ageSeconds = snap.updatedAt
    ? Math.floor(Date.now() / 1000) - snap.updatedAt
    : 999;
  if (ageSeconds > STALE_SEC) return NextResponse.json({ available: false });

  // Append delta5m sample to rolling history (used by DOM Ladder sparkline).
  // Fire-and-forget — don't await so the response isn't delayed.
  if (snap.delta5m != null) {
    const histKey = `${NS}:dom:delta-history-${underlying}`;
    (async () => {
      try {
        const raw  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(histKey)}`, {
          headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
        });
        const rj   = await raw.json();
        const hist = rj.result ? JSON.parse(rj.result) : [];
        const now  = Math.floor(Date.now() / 1000);
        if (now - (hist[hist.length - 1]?.t ?? 0) > 10) {
          const next = [...hist, { t: now, d: Math.round(snap.delta5m) }].slice(-40);
          const enc  = encodeURIComponent(JSON.stringify(next));
          await fetch(`${REDIS_URL}/set/${encodeURIComponent(histKey)}/${enc}?ex=${8 * 3600}`, {
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
          });
        }
      } catch { /* non-fatal */ }
    })();
  }

  return NextResponse.json({ available: true, ...buildPressure(snap) });
}
