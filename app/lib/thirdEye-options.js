// ─── Third Eye — Options Context Reader ───────────────────────────────────────
// Reads Nifty options data from existing Redis caches (option-chain route).
// This is read-only — no new Kite calls. Cache TTL is 60s (set by option-chain route).
// Returns a normalised optionsCtx object consumed by the scoring and commentary layers.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

// ── Expiry logic ──────────────────────────────────────────────────────────────
// Nifty weekly expiry = every Tuesday. Monthly = last Tuesday of month.
function isExpiryDay() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return ist.getUTCDay() === 2; // Tuesday
}

// ── PCR interpretation ────────────────────────────────────────────────────────
function interpretPCR(pcr) {
  if (pcr == null) return { label: 'N/A', bias: 'neutral', scoreAdjust: 0 };
  if (pcr >= 1.5)  return { label: `${pcr.toFixed(2)} — extreme fear / oversold`, bias: 'bullish', scoreAdjust: 8 };
  if (pcr >= 1.2)  return { label: `${pcr.toFixed(2)} — bullish tilt`,             bias: 'bullish', scoreAdjust: 5 };
  if (pcr <= 0.6)  return { label: `${pcr.toFixed(2)} — extreme greed / overbought`, bias: 'bearish', scoreAdjust: 8 };
  if (pcr <= 0.8)  return { label: `${pcr.toFixed(2)} — bearish tilt`,             bias: 'bearish', scoreAdjust: 5 };
  return { label: `${pcr.toFixed(2)} — neutral`,                                   bias: 'neutral', scoreAdjust: 0 };
}

// ── OI wall proximity ─────────────────────────────────────────────────────────
// Returns alert string if price is within `thresholdPct`% of a wall
function wallProximity(spot, wallStrike, wallType, atr, thresholdPct = 0.5) {
  if (!spot || !wallStrike) return null;
  const pct = Math.abs(spot - wallStrike) / spot * 100;
  if (pct > thresholdPct) return null;
  const dist  = Math.round(Math.abs(spot - wallStrike));
  const side  = wallType === 'call' ? 'resistance' : 'support';
  return `${wallType === 'call' ? 'Call' : 'Put'} wall at ${wallStrike} — ${side} (${dist} pts away)`;
}

// ── Max pain proximity ────────────────────────────────────────────────────────
function maxPainNote(spot, maxPain) {
  if (!spot || !maxPain) return null;
  const dist = Math.abs(spot - maxPain);
  if (dist > 150) return null; // Only relevant within 150 pts
  const dir  = spot > maxPain ? 'above' : 'below';
  return `${Math.round(dist)} pts ${dir} max pain (${maxPain}) — pin risk${isExpiryDay() ? ' (expiry today)' : ''}`;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function getOptionsContext(spot, atr) {
  // Cache key matches option-chain route: ${NS}:option-chain-NIFTY-weekly
  const cacheKey = `${NS}:option-chain-NIFTY-weekly`;
  const data = await redisGet(cacheKey);

  if (!data) {
    return {
      available:    false,
      pcrInfo:      interpretPCR(null),
      callWall:     null,
      putWall:      null,
      maxPain:      null,
      activity:     null,
      wallAlerts:   [],
      maxPainNote:  null,
      isExpiryDay:  isExpiryDay(),
      longScoreAdj: 0,
      shortScoreAdj: 0,
    };
  }

  const pcr        = data.pcr  ?? null;
  const callWall   = data.resistance ?? null;  // highest call OI strike (resistance level)
  const putWall    = data.support    ?? null;  // highest put OI strike (support level)
  const maxPainVal = data.maxPain    ?? null;
  const activity   = data.marketActivity ?? null; // { activity, strength, description }

  const pcrInfo    = interpretPCR(pcr);
  const expiry     = isExpiryDay();

  // Score adjustments from PCR
  const longScoreAdj  = pcrInfo.bias === 'bullish' ? pcrInfo.scoreAdjust : (pcrInfo.bias === 'bearish' ? -pcrInfo.scoreAdjust : 0);
  const shortScoreAdj = pcrInfo.bias === 'bearish' ? pcrInfo.scoreAdjust : (pcrInfo.bias === 'bullish' ? -pcrInfo.scoreAdjust : 0);

  // Expiry multiplier: weight OI walls more on expiry day
  const expiryMult = expiry ? 1.5 : 1.0;

  // Wall proximity alerts
  const wallAlerts = [
    wallProximity(spot, callWall, 'call', atr),
    wallProximity(spot, putWall,  'put',  atr),
  ].filter(Boolean);

  // Max pain note
  const mpNote = maxPainNote(spot, maxPainVal);

  // Activity label
  let activityLabel = null;
  if (activity?.activity && activity.activity !== 'Consolidation' && activity.activity !== 'Initializing') {
    activityLabel = `OI: ${activity.activity}${activity.strength ? ` (str ${activity.strength}/10)` : ''}`;
  }

  return {
    available:     true,
    pcr,
    pcrInfo,
    callWall,
    putWall,
    maxPain:       maxPainVal,
    activity,
    activityLabel,
    wallAlerts,
    maxPainNote:   mpNote,
    isExpiryDay:   expiry,
    expiryMult,
    longScoreAdj:  Math.round(longScoreAdj  * expiryMult),
    shortScoreAdj: Math.round(shortScoreAdj * expiryMult),
  };
}
