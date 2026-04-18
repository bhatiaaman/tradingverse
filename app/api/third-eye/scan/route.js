// ── POST /api/third-eye/scan ──────────────────────────────────────────────────
// Third Eye scan engine — called every 30s by ThirdEyePanel.
//
// Flow:
//   1. Validate session + rate limit
//   2. Fetch execution TF candles + bias TF candles (both Redis-cached)
//   3. Read persisted engine state from Redis
//   4. Read options context from existing option-chain Redis cache (no new Kite call)
//   5. Run ThirdEye engine (state machine + scoring)
//   6. Build commentary from engine result
//   7. Persist new engine state to Redis (24h TTL, auto-resets overnight)
//   8. Return full result to client

import { NextResponse }         from 'next/server';
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session';
import { intelligenceLimiter, checkLimit }                  from '@/app/lib/rate-limit';
import { runThirdEye, DEFAULT_CONFIG }                      from '@/app/lib/thirdEye';
import { buildCommentary }                                  from '@/app/lib/thirdEye-commentary';
import { getOptionsContext }                                from '@/app/lib/thirdEye-options';
import { detectScalpSetup }                                 from '@/app/lib/thirdEye-scalp';
import { getDataProvider }                                  from '@/app/lib/providers';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

// Redis keys
const ENGINE_KEY   = (tf) => `${NS}:te:engine:${tf}`;
const SETTINGS_KEY = `${NS}:te:settings`;
const CANDLE_KEY   = (interval, days) => `${NS}:chart-NIFTY-${interval}-${days}`;

// TF pairing
const TF_PAIRS = {
  '5minute':  { biasTf: '15minute', biasDays: 5,  biasTfLabel: '15m', execDays: 5  },
  '15minute': { biasTf: '60minute', biasDays: 10, biasTfLabel: '1hr', execDays: 10 },
};

// ── Redis helpers ─────────────────────────────────────────────────────────────
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
    const url = `${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}${ttl ? `?ex=${ttl}` : ''}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch { /* silent */ }
}

// ── IST helpers ───────────────────────────────────────────────────────────────
function todayIST() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function isMarketHours() {
  const ist  = new Date(Date.now() + 5.5 * 3600 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const day  = ist.getUTCDay();
  return day !== 0 && day !== 6 && mins >= 555 && mins <= 960;
}

// ── Candle fetcher (uses existing Redis cache or fetches fresh) ───────────────
async function fetchCandles(dp, interval, days) {
  const cacheKey = CANDLE_KEY(interval, days);
  const cached   = await redisGet(cacheKey);
  if (cached?.candles?.length) return cached.candles;

  // Cache miss — fetch from Kite
  const NIFTY_TOKEN = 256265;
  const now = new Date(Date.now() + 5.5 * 3600 * 1000); // IST
  const from = new Date(now);
  from.setDate(from.getDate() - days);

  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;

  const data = await dp.getHistoricalData(NIFTY_TOKEN, interval, fmt(from), fmt(now));
  if (!data?.length) return null;

  const candles = data.map(c => ({
    time:   Math.floor(new Date(c.date).getTime() / 1000),
    open:   c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  }));

  // Cache with TTL based on interval
  const ttl = interval === '5minute' ? 30 : interval === '15minute' ? 90 : 300;
  await redisSet(cacheKey, { candles, timestamp: new Date().toISOString() }, ttl);
  return candles;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req) {
  const { session, error } = await requireSession();
  if (error)   return serviceUnavailable(error);
  if (!session) return unauthorized();

  const rl = await checkLimit(intelligenceLimiter, req);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfter: rl.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  // Parse request body
  let body = {};
  try { body = await req.json(); } catch { /* default */ }
  const execTf   = TF_PAIRS[body.tf] ? body.tf : '5minute';
  const tfConfig = TF_PAIRS[execTf];

  // Load user settings (merged with defaults)
  const userSettings = await redisGet(SETTINGS_KEY) ?? {};
  const config       = { ...DEFAULT_CONFIG, ...userSettings };

  // Load persisted engine state (reset if new trading day)
  const engineKey = ENGINE_KEY(execTf);
  let prevState   = await redisGet(engineKey);
  if (prevState?.tradingDay && prevState.tradingDay !== todayIST()) {
    prevState = null; // new day → fresh state
  }

  // Fetch candles
  const dp = await getDataProvider();
  if (!dp.isConnected()) {
    return NextResponse.json({ error: 'Kite disconnected', state: 'NEUTRAL' }, { status: 503 });
  }

  const [execCandles, biasCandles] = await Promise.all([
    fetchCandles(dp, execTf, tfConfig.execDays),
    fetchCandles(dp, tfConfig.biasTf, tfConfig.biasDays),
  ]);

  if (!execCandles?.length) {
    return NextResponse.json({ error: 'No candle data', state: 'NEUTRAL' });
  }

  // Filter to today's candles only for execution (intraday)
  const today   = todayIST();
  const IST_S   = 5.5 * 3600;
  const todayExecCandles = execCandles.filter(c =>
    new Date((c.time + IST_S) * 1000).toISOString().slice(0, 10) === today
  );

  // Use today's candles if available (at least 10), otherwise last N from full series
  const candlesForEngine = todayExecCandles.length >= 10
    ? todayExecCandles
    : execCandles.slice(-100);

  // Get options context (reads from existing Redis cache)
  const lastCandle  = candlesForEngine[candlesForEngine.length - 1];
  const spot        = lastCandle?.close;
  const atrApprox   = spot ? spot * 0.0008 : 20; // fallback ATR estimate
  const optionsCtx  = await getOptionsContext(spot, atrApprox);

  // Run engine
  const engineResult = runThirdEye(
    candlesForEngine,
    biasCandles ?? [],
    prevState,
    optionsCtx,
    config
  );

  if (engineResult.error) {
    return NextResponse.json({ error: engineResult.error, state: 'NEUTRAL' });
  }

  // Build commentary
  const commentary = buildCommentary(engineResult, tfConfig.biasTfLabel);

  // Scalp setup detection
  const scalpSetup = detectScalpSetup(
    engineResult.features,
    engineResult.state,
    prevState?.features ?? null,
    prevState?.lastSignal ?? null,
  );

  // Persist engine state (24h TTL — auto-expires overnight)
  const stateToSave = {
    ...engineResult,
    tradingDay: today,
    config,
    // Track last signal for dedup (only update if new signal fired)
    lastSignal: scalpSetup
      ? { direction: scalpSetup.direction, candleTime: scalpSetup.candleTime }
      : (prevState?.lastSignal ?? null),
  };
  await redisSet(engineKey, stateToSave, 86400);

  // Response (trimmed — don't send full candle arrays)
  return NextResponse.json({
    state:          engineResult.state,
    side:           engineResult.side,
    qualifier:      engineResult.qualifier,
    longScore:      engineResult.smoothedLong,
    shortScore:     engineResult.smoothedShort,
    rawLong:        engineResult.rawLong,
    rawShort:       engineResult.rawShort,
    candlesInState: engineResult.candlesInState,
    stateStartTime: engineResult.stateStartTime,
    biasAlignment:  engineResult.biasAlignment,
    biasSummary:    engineResult.biasSummary,
    biasTfLabel:    tfConfig.biasTfLabel,
    keyLevels:      engineResult.keyLevels,
    features: {
      close:          engineResult.features?.close,
      vwap:           engineResult.features?.vwap,
      vwapAbove:      engineResult.features?.vwapAbove,
      rsi:            engineResult.features?.rsi,
      adx:            engineResult.features?.adx,
      adxRising:      engineResult.features?.adxRising,
      atrExpanding:   engineResult.features?.atrExpanding,
      candleStrength: engineResult.features?.candleStrength,
      direction:      engineResult.features?.direction,
      sessionPhase:   engineResult.features?.sessionPhase,
    },
    commentary,
    optionsCtx: optionsCtx?.available ? {
      pcr:          optionsCtx.pcr,
      pcrInfo:      optionsCtx.pcrInfo,
      callWall:     optionsCtx.callWall,
      putWall:      optionsCtx.putWall,
      maxPain:      optionsCtx.maxPain,
      activityLabel: optionsCtx.activityLabel,
      wallAlerts:   optionsCtx.wallAlerts,
      isExpiryDay:  optionsCtx.isExpiryDay,
    } : { available: false },
    scalpSetup,
    marketHours: isMarketHours(),
    tf:          execTf,
    timestamp:   new Date().toISOString(),
  });
}
