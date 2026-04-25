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
import { sql }                                              from '@/app/lib/db';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

// Instrument token per underlying (spot)
const UNDERLYING_TOKEN = { NIFTY: 256265, SENSEX: 265 };
// Spot quote symbol per underlying
const UNDERLYING_QUOTE = { NIFTY: 'NSE:NIFTY 50', SENSEX: 'BSE:SENSEX' };
// Futures name for volume overlay (resolves near-month token from Redis)
const FUTURES_NAME     = { NIFTY: 'NIFTY',  SENSEX: 'SENSEX' };
const FUTURES_EXCHANGE = { NIFTY: 'NFO',    SENSEX: 'BFO'    };
const FUT_TOKEN_KEY    = (name) => `${NS}:fut-token-${name}`;
const FUT_CANDLE_KEY   = (name, tf, days) => `${NS}:chart-${name}FUT-${tf}-${days}`;;

// Redis keys
const ENGINE_KEY   = (underlying, tf) => `${NS}:te:engine:${underlying}:${tf}`;
const SETTINGS_KEY = `${NS}:te:settings`;
const CANDLE_KEY   = (underlying, interval, days) => `${NS}:chart-${underlying}-${interval}-${days}`;

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
async function fetchCandles(dp, underlying, interval, days) {
  const cacheKey = CANDLE_KEY(underlying, interval, days);
  const cached   = await redisGet(cacheKey);
  if (cached?.candles?.length) return cached.candles;

  // Cache miss — fetch from Kite
  const token = UNDERLYING_TOKEN[underlying] ?? UNDERLYING_TOKEN.NIFTY;
  const now = new Date(Date.now() + 5.5 * 3600 * 1000); // IST
  const from = new Date(now);
  from.setDate(from.getDate() - days);

  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;

  const data = await dp.getHistoricalData(token, interval, fmt(from), fmt(now));
  if (!data?.length) return null;

  const candles = data.map(c => ({
    time:   Math.floor(new Date(c.date).getTime() / 1000),
    open:   c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  }));

  // TTL: 90s for 5min (matches nifty-chart route), 3min for 15min, 10min for 60min/day.
  // Longer TTL = fewer Kite API calls, more resilience to brief API hiccups.
  // Candles are 5-min wide so 90s-old data is always within the current candle.
  const ttl = interval === '5minute' ? 90 : interval === '15minute' ? 180 : 600;
  await redisSet(cacheKey, { candles, timestamp: new Date().toISOString() }, ttl);
  return candles;
}

// ── Futures candle fetcher (for volume overlay) ───────────────────────────────
// Tries the chart cache first (free if NIFTYFUT/SENSEXFUT chart was recently viewed).
// Falls back to resolving the futures token from Redis (cached 6h by nifty-chart route)
// and fetching directly from Kite.
async function fetchFuturesCandles(dp, underlying, interval, days) {
  const name = FUTURES_NAME[underlying] ?? 'NIFTY';
  // 1. Try candle cache (populated by nifty-chart route)
  const candleCache = await redisGet(FUT_CANDLE_KEY(name, interval, days));
  if (candleCache?.candles?.length) return candleCache.candles;

  // 2. Try token cache (populated by nifty-chart route's resolveFuturesToken)
  let token = await redisGet(FUT_TOKEN_KEY(name));
  if (!token) {
    // 3. Last resort: parse instruments CSV (same logic as nifty-chart)
    try {
      const exchange = FUTURES_EXCHANGE[underlying] ?? 'NFO';
      const csvText  = await dp.getInstrumentsCSV(exchange);
      const lines    = csvText.trim().split('\n');
      const headers  = lines[0].split(',');
      const tokenIdx  = headers.indexOf('instrument_token');
      const nameIdx   = headers.indexOf('name');
      const typeIdx   = headers.indexOf('instrument_type');
      const expiryIdx = headers.indexOf('expiry');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let best = null;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols[nameIdx]?.replace(/"/g,'').trim() !== name) continue;
        if (cols[typeIdx]?.replace(/"/g,'').trim() !== 'FUT') continue;
        const exp = cols[expiryIdx]?.replace(/"/g,'').trim();
        if (!exp) continue;
        const expiryDate = new Date(exp);
        if (expiryDate < today) continue;
        if (!best || expiryDate < new Date(best.expiry)) best = { token: parseInt(cols[tokenIdx]), expiry: exp };
      }
      if (best) {
        token = best.token;
        await redisSet(FUT_TOKEN_KEY(name), token, 6 * 3600);
      }
    } catch { /* non-fatal — volume overlay will be skipped */ }
  }
  if (!token) return null;

  try {
    const now  = new Date(Date.now() + 5.5 * 3600 * 1000);
    const from = new Date(now); from.setDate(from.getDate() - days);
    const pad  = (n) => String(n).padStart(2, '0');
    const fmt  = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
    const data = await dp.getHistoricalData(token, interval, fmt(from), fmt(now));
    if (!data?.length) return null;
    const candles = data.map(c => ({
      time: Math.floor(new Date(c.date).getTime() / 1000),
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    }));
    const ttl = interval === '5minute' ? 30 : 90;
    await redisSet(FUT_CANDLE_KEY(name, interval, days), { candles }, ttl);
    return candles;
  } catch { return null; }
}

// ── Expiry day check ──────────────────────────────────────────────────────────
// Nifty (NSE) expires Tuesday (day=2); Sensex (BSE) expires Thursday (day=4).
// For ATR_EXPANSION, Sensex only fires on its expiry day.
function isExpiryDayForUnderlying(underlying) {
  if (underlying !== 'SENSEX') return true; // Nifty: any day
  const istDay = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCDay();
  return istDay === 4; // Thursday
}

// ── Dev-mode synthetic response (non-production only) ────────────────────────
// Rotates through all 5 setup types every 60s, alternates direction, no Kite needed.
function devModeResponse(execTf, underlying) {
  const nowSec  = Math.floor(Date.now() / 1000);
  const tick    = Math.floor(nowSec / 60); // increments every minute
  const types   = ['VWAP_CROSS', 'PULLBACK_RESUME', 'POWER_CANDLE', 'ATR_EXPANSION', 'ORB'];
  const type    = types[tick % types.length];
  const dir     = tick % 2 === 0 ? 'bull' : 'bear';
  const spot    = 24050 + (tick % 10) * 5;
  const optType = dir === 'bull' ? 'CE' : 'PE';
  const step    = underlying === 'SENSEX' ? 100 : 50;
  const strike  = Math.round(spot / step) * step;
  const orHigh  = spot - 20;
  const orLow   = spot - 90;

  return NextResponse.json({
    state:          dir === 'bull' ? 'CONFIRMED_LONG' : 'CONFIRMED_SHORT',
    side:           dir,
    qualifier:      'strengthening',
    longScore:      dir === 'bull' ? 72 : 28,
    shortScore:     dir === 'bull' ? 28 : 72,
    candlesInState: 4,
    biasAlignment:  { aligned: true, label: 'aligned ↑', counter: false },
    biasTfLabel:    '15m',
    keyLevels:      { vwap: spot - 15, support: spot - 80, resistance: spot + 60 },
    features: {
      close:          spot,
      vwap:           spot - 15,
      vwapAbove:      dir === 'bull',
      rsi:            dir === 'bull' ? 58 : 42,
      adx:            28,
      adxRising:      true,
      atr:            35,
      candleStrength: 1.1,
      direction:      dir,
      sessionPhase:   'primary',
      atrExpansionHigh: spot + 40,
      atrExpansionLow:  spot - 10,
      volumeSpike:    tick % 4 === 0,
    },
    commentary: {
      headline: `[DEV] ${type.replace(/_/g,' ')} — ${dir === 'bull' ? 'Bullish' : 'Bearish'}`,
      context:  'Synthetic dev-mode data — Kite not called. Setup type rotates every minute.',
      watch:    'Test place / skip / history. New setup fires on the next minute boundary.',
      risk:     'Dev mode only — not connected to live market data.',
    },
    optionsCtx: {
      pcr:           0.92,
      pcrInfo:       { label: '0.92', bias: 'neutral' },
      callWall:      strike + 100,
      putWall:       strike - 100,
      maxPain:       strike,
      activityLabel: 'Moderate options activity (dev)',
      isExpiryDay:   false,
    },
    scalpSetup: {
      type,
      label:          type.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()),
      direction:      dir,
      optType,
      strike,
      confidence:     tick % 3 === 0 ? 'high' : 'medium',
      niftyPrice:     spot,
      niftyTarget:    parseFloat((spot + (dir === 'bull' ? 30 : -30)).toFixed(1)),
      niftySl:        parseFloat((spot + (dir === 'bull' ? -30 :  30)).toFixed(1)),
      slPts:          30,
      targetPts:      30,
      candleStrength: 1.1,
      rsi:            dir === 'bull' ? 58 : 42,
      vwap:           spot - 15,
      sessionPhase:   'primary',
      candleTime:     Math.floor(nowSec / 60) * 60, // changes every minute
      volumeSpike:    tick % 4 === 0,
      ...(type === 'ORB'           ? { orHigh, orLow }                                  : {}),
      ...(type === 'ATR_EXPANSION' ? { atrExpansionHigh: spot + 40, atrExpansionLow: spot - 10 } : {}),
    },
    orHigh,
    orLow,
    marketHours: true,
    tf:          execTf,
    underlying,
    timestamp:   new Date().toISOString(),
  });
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
  const execTf     = TF_PAIRS[body.tf] ? body.tf : '5minute';
  const tfConfig   = TF_PAIRS[execTf];
  const underlying = (body.underlying === 'SENSEX') ? 'SENSEX' : 'NIFTY';

  // DEV MODE: return synthetic data without touching Kite (non-production only)
  if (body.devMode && process.env.NODE_ENV !== 'production') {
    return devModeResponse(execTf, underlying);
  }

  // Load user settings (merged with defaults)
  const userSettings = await redisGet(SETTINGS_KEY) ?? {};
  const config       = { ...DEFAULT_CONFIG, ...userSettings };

  // Load persisted engine state (reset if new trading day)
  const engineKey = ENGINE_KEY(underlying, execTf);
  let prevState   = await redisGet(engineKey);
  if (prevState?.tradingDay && prevState.tradingDay !== todayIST()) {
    prevState = null; // new day → fresh state
  }

  // Fetch candles
  const dp = await getDataProvider();
  if (!dp.isConnected()) {
    return NextResponse.json({ error: 'Kite not connected — reconnect via Settings' }, { status: 401 });
  }

  let execCandles, biasCandles, futuresCandles;
  try {
    [execCandles, biasCandles, futuresCandles] = await Promise.all([
      fetchCandles(dp, underlying, execTf, tfConfig.execDays),
      fetchCandles(dp, underlying, tfConfig.biasTf, tfConfig.biasDays),
      fetchFuturesCandles(dp, underlying, execTf, tfConfig.execDays),
    ]);
  } catch (e) {
    // Kite auth errors: token invalidated by mobile app login, expired session, etc.
    const msg = (e?.message ?? '');
    const isAuth = /token|invalid|unauthori[sz]ed|forbidden|403|access_token/i.test(msg);
    if (isAuth) {
      return NextResponse.json({ error: 'Kite token expired — reconnect via Settings' }, { status: 401 });
    }
    return NextResponse.json({ error: `Data fetch failed: ${msg || 'unknown error'}` }, { status: 502 });
  }

  if (!execCandles?.length) {
    return NextResponse.json({ error: 'No candle data returned from Kite' }, { status: 502 });
  }

  // Filter to today's candles only for execution (intraday)
  const today   = todayIST();
  const IST_S   = 5.5 * 3600;
  const todayExecCandles = execCandles.filter(c =>
    new Date((c.time + IST_S) * 1000).toISOString().slice(0, 10) === today
  );

  // Build candle set for the engine (requires ≥ 30 candles):
  //  ≥ 30 today  → today-only (correct intraday VWAP)
  //  1–29 today  → prepend prior-day candles for indicator warm-up; VWAP is slightly mixed
  //               but the engine stays live throughout the early session
  //  0 today     → pre-market or holiday; use last 100 from full series
  let candlesForEngine;
  if (todayExecCandles.length >= 30) {
    candlesForEngine = todayExecCandles;
  } else if (todayExecCandles.length >= 1) {
    const priorCandles = execCandles
      .slice(0, execCandles.length - todayExecCandles.length)
      .slice(-50);
    candlesForEngine = [...priorCandles, ...todayExecCandles];
  } else {
    candlesForEngine = execCandles.slice(-100);
  }

  // Overlay futures volume onto spot candles (index volume is meaningless;
  // futures volume reflects real participant activity)
  if (futuresCandles?.length) {
    const futVolMap = Object.fromEntries(futuresCandles.map(c => [c.time, c.volume]));
    candlesForEngine = candlesForEngine.map(c => ({
      ...c,
      volume: futVolMap[c.time] ?? c.volume,
    }));
  }

  // Get options context (reads from existing Redis cache)
  const lastCandle  = candlesForEngine[candlesForEngine.length - 1];
  const spot        = lastCandle?.close;
  const atrApprox   = spot ? spot * 0.0008 : 20; // fallback ATR estimate
  const optionsCtx  = await getOptionsContext(spot, atrApprox, underlying);

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

  // Track when the trend side was first established today (for CONTINUING commentary context).
  // Set on first candle where side changes, preserved across scans, cleared on reversal.
  const currentSide = engineResult.side ?? null;
  const prevSide    = prevState?.trendSide ?? null;
  const trendEstablishedAt = currentSide
    ? (currentSide !== prevSide
        ? (engineResult.features?.time ?? null)   // fresh direction — record this candle
        : (prevState?.trendEstablishedAt ?? null)) // same direction — keep existing timestamp
    : null;

  // Build commentary
  const commentary = buildCommentary(engineResult, tfConfig.biasTfLabel, trendEstablishedAt);

  // Compute Opening Range (9:15–9:44 IST = first 30 min, before 'primary' phase)
  // Need at least 3 candles (15 min) for a valid range.
  const istMinOfDay = (c) => Math.floor(((c.time + 19800) % 86400) / 60);
  const orCandles   = todayExecCandles.filter(c => {
    const m = istMinOfDay(c);
    return m >= 555 && m < 585; // 9:15–9:44 IST (full 30-min opening range)
  });
  const orHigh = orCandles.length >= 3 ? Math.max(...orCandles.map(c => c.high)) : null;
  const orLow  = orCandles.length >= 3 ? Math.min(...orCandles.map(c => c.low))  : null;

  // Scalp setup detection
  const strikeStep  = underlying === 'SENSEX' ? 100 : 50;
  const expiryDay   = isExpiryDayForUnderlying(underlying);
  const scalpSetup  = detectScalpSetup(
    engineResult.features,
    engineResult.state,
    prevState?.features ?? null,
    prevState?.lastSignal ?? null,
    strikeStep,
    underlying,
    expiryDay,
    execTf,
    orHigh,
    orLow,
  );

  // Log scalp setup to signal_logs when a new one fires
  if (scalpSetup) {
    const isNewSignal = !prevState?.lastSignal ||
      prevState.lastSignal.candleTime !== scalpSetup.candleTime ||
      prevState.lastSignal.direction  !== scalpSetup.direction;
    if (isNewSignal) {
      sql`INSERT INTO signal_logs (type, ts, symbol, data)
          VALUES ('THIRD_EYE', ${new Date().toISOString()}, ${underlying},
                  ${JSON.stringify({
                    setupName:  scalpSetup.label,
                    direction:  scalpSetup.direction,
                    score:      scalpSetup.confidence === 'high' ? 8 : 6,
                    interval:   execTf,
                    time:       new Date((scalpSetup.candleTime + 19800) * 1000)
                                  .toISOString().slice(11, 16),
                    trigger:    scalpSetup.type,
                    ltp:        scalpSetup.niftyPrice  ?? null,
                    sl:         scalpSetup.niftySl     ?? null,
                    target:     scalpSetup.niftyTarget ?? null,
                    strike:     scalpSetup.strike ?? null,
                    optType:    scalpSetup.optType ?? null,
                    allSetups:  [],
                  })})`.catch(() => {/* non-fatal */});
    }
  }

  // Persist engine state (24h TTL — auto-expires overnight)
  const stateToSave = {
    ...engineResult,
    tradingDay: today,
    config,
    // Track last signal for dedup (only update if new signal fired)
    lastSignal: scalpSetup
      ? { direction: scalpSetup.direction, candleTime: scalpSetup.candleTime }
      : (prevState?.lastSignal ?? null),
    trendEstablishedAt,
    trendSide: currentSide,
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
      close:            engineResult.features?.close,
      vwap:             engineResult.features?.vwap,
      vwapAbove:        engineResult.features?.vwapAbove,
      rsi:              engineResult.features?.rsi,
      adx:              engineResult.features?.adx,
      adxRising:        engineResult.features?.adxRising,
      atr:              engineResult.features?.atr,
      atrExpanding:     engineResult.features?.atrExpanding,
      candleStrength:   engineResult.features?.candleStrength,
      direction:        engineResult.features?.direction,
      sessionPhase:     engineResult.features?.sessionPhase,
      dayOpen:          engineResult.features?.dayOpen,
      atrExpansionHigh: engineResult.features?.atrExpansionHigh,
      atrExpansionLow:  engineResult.features?.atrExpansionLow,
      aboveExpansion:   engineResult.features?.aboveExpansion,
      belowExpansion:   engineResult.features?.belowExpansion,
      volumeSpike:      engineResult.features?.volumeSpike,
      ema9:             engineResult.features?.ema9,
      ema21:            engineResult.features?.ema21,
      aboveEma9:        engineResult.features?.aboveEma9,
      aboveEma21:       engineResult.features?.aboveEma21,
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
    orHigh,
    orLow,
    marketHours: isMarketHours(),
    tf:          execTf,
    underlying,
    timestamp:   new Date().toISOString(),
  });
}
