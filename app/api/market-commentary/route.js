// ═══════════════════════════════════════════════════════════════════════
// MARKET COMMENTARY - 3-Layer Architecture
// Layer 1: Data Collection (price + options + intraday candles + time)
// Layer 2: Analysis Engine (structure, OI, levels, time, conflicts)
// Layer 3: Commentary Generator (reversal-aware, trader-friendly output)
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';
import { detectReversalZone } from './lib/reversal-detector.js';
import { detectIntradayRegime } from '@/app/api/market-regime/intraday.js';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

const NIFTY_TOKEN = 256265;

// ─────────────────────────────────────────────────────────────────────
// Redis helpers
// ─────────────────────────────────────────────────────────────────────
async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, exSeconds) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url = exSeconds
      ? `${REDIS_URL}/set/${key}/${encoded}?ex=${exSeconds}`
      : `${REDIS_URL}/set/${key}/${encoded}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch (e) { console.error('Redis set error:', e); }
}

// ─────────────────────────────────────────────────────────────────────
// Market hours helpers
// ─────────────────────────────────────────────────────────────────────
function getISTTime() {
  const now = new Date();
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
}

function isMarketOpen() {
  const ist = getISTTime();
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return total >= 555 && total <= 930; // 9:15–15:30
}

// ─────────────────────────────────────────────────────────────────────
// Time bucket
// ─────────────────────────────────────────────────────────────────────
function getTimeBucket() {
  const ist = getISTTime();
  const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const minutesSinceOpen = total - 555; // 555 = 9:15 AM

  if (total < 555) return { bucket: 'pre_market', minutesSinceOpen: 0 };
  if (total <= 615) return { bucket: 'opening_hour', minutesSinceOpen };  // 9:15–10:15
  if (total <= 870) return { bucket: 'mid_day', minutesSinceOpen };        // 10:15–14:30
  return           { bucket: 'closing_hour', minutesSinceOpen };           // 14:30–15:30
}

// ─────────────────────────────────────────────────────────────────────
// Indicator calculators
// ─────────────────────────────────────────────────────────────────────
function calcEMA(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  const recent = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcRSIHistory(closes, period = 14, count = 5) {
  const result = [];
  const minLen = period + 1;
  for (let i = 0; i < count; i++) {
    const idx = closes.length - count + i;
    if (idx < minLen) { result.push(null); continue; }
    result.push(calcRSI(closes.slice(0, idx + 1), period));
  }
  return result;
}

function calcVWAP(candles) {
  if (!candles || candles.length === 0) return null;
  let cumTP = 0, cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTP  += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol > 0 ? cumTP / cumVol : null;
}

function calcMACD(closes) {
  if (!closes || closes.length < 35) return null;
  const k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;

  let ema12 = closes.slice(0, 12).reduce((s, c) => s + c, 0) / 12;
  let ema26 = closes.slice(0, 26).reduce((s, c) => s + c, 0) / 26;

  const macdLine = [];
  for (let i = 12; i < closes.length; i++) {
    ema12 = closes[i] * k12 + ema12 * (1 - k12);
    if (i >= 25) {
      ema26 = closes[i] * k26 + ema26 * (1 - k26);
      macdLine.push(ema12 - ema26);
    }
  }

  if (macdLine.length < 9) return null;

  let signalEMA = macdLine.slice(0, 9).reduce((s, c) => s + c, 0) / 9;
  let prevHistogram = macdLine[8] - signalEMA;
  let histogram = prevHistogram;

  for (let i = 9; i < macdLine.length; i++) {
    signalEMA = macdLine[i] * k9 + signalEMA * (1 - k9);
    prevHistogram = histogram;
    histogram = macdLine[i] - signalEMA;
  }

  let lastCross = null;
  if (prevHistogram < 0 && histogram >= 0)      lastCross = 'BULLISH';
  else if (prevHistogram >= 0 && histogram < 0)  lastCross = 'BEARISH';
  else if (histogram > 0 && prevHistogram > 0 && histogram < prevHistogram * 0.3) lastCross = 'BEARISH_PENDING';
  else if (histogram < 0 && prevHistogram < 0 && histogram > prevHistogram * 0.3) lastCross = 'BULLISH_PENDING';

  return { histogram, prevHistogram, lastCross };
}

// ─────────────────────────────────────────────────────────────────────
// Kite 5-minute intraday candles (today only)
// ─────────────────────────────────────────────────────────────────────
async function fetchIntradayCandles(dp) {
  try {
    const toDate   = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 2);

    const fmt = (d) => {
      const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
      return ist.toISOString().slice(0, 19).replace('T', ' ');
    };

    const fromStr = encodeURIComponent(fmt(fromDate));
    const toStr = encodeURIComponent(fmt(toDate));

    const data = await dp.getHistoricalRaw(NIFTY_TOKEN, '5minute', fromStr, toStr);
    if (!data?.data?.candles?.length) return null;

    const allCandles = data.data.candles.map(([time, open, high, low, close, volume]) => ({
      time:   new Date(time).getTime() / 1000,
      open, high, low, close, volume: volume || 0,
    }));

    // Filter to today's market session only (9:15 AM IST onward)
    const ist = getISTTime();
    const todayIST = new Date(ist);
    todayIST.setUTCHours(3, 45, 0, 0); // 9:15 AM IST = 03:45 UTC
    const todayStart = todayIST.getTime() / 1000;

    const todayCandles = allCandles.filter(c => c.time >= todayStart);
    const prevCandles  = allCandles.filter(c => c.time < todayStart);
    const prevClose    = prevCandles.length > 0 ? prevCandles[prevCandles.length - 1].close : null;
    const closes       = todayCandles.map(c => c.close);
    const lastCandle   = todayCandles[todayCandles.length - 1] || null;

    const volAvg = todayCandles.length > 0
      ? todayCandles.reduce((s, c) => s + c.volume, 0) / todayCandles.length
      : 0;
    const volCurrent = lastCandle?.volume || 0;
    const volumeSpike = volAvg > 0 && volCurrent > volAvg * 2;

    // 5-min price change %
    const prev5candle   = todayCandles.length >= 2 ? todayCandles[todayCandles.length - 2] : null;
    const change5min    = (lastCandle && prev5candle)
      ? ((lastCandle.close - prev5candle.close) / prev5candle.close) * 100
      : null;

    // Trend direction from last 3 closes
    let trendDirection = 'NEUTRAL';
    if (closes.length >= 3) {
      const last3 = closes.slice(-3);
      if (last3[2] > last3[0]) trendDirection = 'UP';
      else if (last3[2] < last3[0]) trendDirection = 'DOWN';
    }

    // Opening Range: first candle of the session (9:15–9:30)
    const orCandle = todayCandles[0] || null;

    // Swing pivot detection from 5-min candles (lookback = 3 candles each side)
    // Returns the most recent swing highs and lows (up to 5 each) for S/R confluence
    const swingHighs = [], swingLows = [];
    const N = 3;
    for (let i = N; i < todayCandles.length - N; i++) {
      const c = todayCandles[i];
      const isSwingHigh = todayCandles.slice(i - N, i).every(x => x.high <= c.high) &&
                          todayCandles.slice(i + 1, i + N + 1).every(x => x.high <= c.high);
      const isSwingLow  = todayCandles.slice(i - N, i).every(x => x.low  >= c.low) &&
                          todayCandles.slice(i + 1, i + N + 1).every(x => x.low  >= c.low);
      if (isSwingHigh) swingHighs.push(parseFloat(c.high.toFixed(2)));
      if (isSwingLow)  swingLows.push(parseFloat(c.low.toFixed(2)));
    }

    // Run intraday regime on same candles — used to qualify commentary state
    const intradayRegime = detectIntradayRegime(todayCandles, null, { prevClose });

    return {
      rsi:           calcRSI(closes),
      rsiHistory:    calcRSIHistory(closes, 14, 5),
      macdData:      calcMACD(closes),
      vwap:          calcVWAP(todayCandles),
      ema21:         calcEMA(closes, 21),
      volumeAvg:     volAvg,
      volumeCurrent: volCurrent,
      volumeSpike,
      lastCandle,
      prevCandle:    prev5candle,
      change5min,
      trendDirection,
      prevClose,
      intradayRegime,
      orHigh:      orCandle?.high || null,
      orLow:       orCandle?.low  || null,
      swingHighs:  swingHighs.slice(-5),   // most recent 5
      swingLows:   swingLows.slice(-5),
    };
  } catch (err) {
    console.error('[commentary] Intraday candles error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Daily bias — EMA21/50 position + swing structure
// ─────────────────────────────────────────────────────────────────────
function calcEMAValue(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

async function fetchDailyBias(dp) {
  try {
    const toDate   = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 120); // 120 days for EMA50 warmup

    const fmt = (d) => {
      const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
      return ist.toISOString().slice(0, 19).replace('T', ' ');
    };
    const data = await dp.getHistoricalRaw(NIFTY_TOKEN, 'day',
      encodeURIComponent(fmt(fromDate)), encodeURIComponent(fmt(toDate)));
    if (!data?.data?.candles?.length) return null;

    const candles = data.data.candles.map(([time, open, high, low, close]) => ({ high, low, close }));
    const closes  = candles.map(c => c.close);
    const last    = closes[closes.length - 1];

    const ema21 = calcEMAValue(closes, 21);
    const ema50 = calcEMAValue(closes, 50);
    const aboveEma21 = ema21 ? last > ema21 : null;
    const aboveEma50 = ema50 ? last > ema50 : null;

    // Swing structure: last 15 daily candles
    const recent = candles.slice(-15);
    const h0 = recent[0].high, hn = recent[recent.length - 1].high;
    const l0 = recent[0].low,  ln = recent[recent.length - 1].low;
    const hhhl = hn > h0 && ln > l0; // higher highs + higher lows
    const lllh = hn < h0 && ln < l0; // lower lows + lower highs

    let bias = 'NEUTRAL', reason = '';
    if (aboveEma21 && hhhl)       { bias = 'BULLISH'; reason = 'Above EMA21 · HH+HL daily trend'; }
    else if (aboveEma21 && aboveEma50) { bias = 'BULLISH'; reason = 'Above EMA21 & EMA50'; }
    else if (aboveEma21)          { bias = 'BULLISH'; reason = 'Above EMA21'; }
    else if (!aboveEma21 && lllh) { bias = 'BEARISH'; reason = 'Below EMA21 · LL+LH daily trend'; }
    else if (!aboveEma21 && !aboveEma50) { bias = 'BEARISH'; reason = 'Below EMA21 & EMA50'; }
    else                          { bias = 'BEARISH'; reason = 'Below EMA21'; }

    return {
      bias,
      reason,
      ema21: ema21 ? Math.round(ema21) : null,
      ema50: ema50 ? Math.round(ema50) : null,
    };
  } catch (err) {
    console.error('[commentary] Daily bias error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// 15m bias — regime detection on today's 15-min candles
// ─────────────────────────────────────────────────────────────────────
async function fetchFifteenMinBias(dp) {
  try {
    const toDate   = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 1);

    const fmt = (d) => {
      const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
      return ist.toISOString().slice(0, 19).replace('T', ' ');
    };
    const data = await dp.getHistoricalRaw(NIFTY_TOKEN, '15minute',
      encodeURIComponent(fmt(fromDate)), encodeURIComponent(fmt(toDate)));
    if (!data?.data?.candles?.length) return null;

    const allCandles = data.data.candles.map(([time, open, high, low, close, volume]) => ({
      time: new Date(time).getTime() / 1000,
      open, high, low, close, volume: volume || 0,
    }));

    const ist = getISTTime();
    const todayIST = new Date(ist);
    todayIST.setUTCHours(3, 45, 0, 0); // 9:15 AM IST
    const todayStart = todayIST.getTime() / 1000;

    const todayCandles = allCandles.filter(c => c.time >= todayStart);
    const prevCandles  = allCandles.filter(c => c.time < todayStart);
    const prevClose    = prevCandles.length ? prevCandles[prevCandles.length - 1].close : null;

    if (todayCandles.length < 3) return null;

    const regime = detectIntradayRegime(todayCandles, null, { prevClose });

    // Map regime → simple bias + label
    const REGIME_MAP = {
      TREND_DAY_UP:    { bias: 'BULLISH', label: 'Trending Up'      },
      SHORT_SQUEEZE:   { bias: 'BULLISH', label: 'Short Squeeze'     },
      TREND_DAY_DOWN:  { bias: 'BEARISH', label: 'Trending Down'     },
      LONG_LIQUIDATION:{ bias: 'BEARISH', label: 'Selling Pressure'  },
      BREAKOUT_DAY:    { bias: 'NEUTRAL', label: 'Breakout Attempt'  },
      TRAP_DAY:        { bias: 'NEUTRAL', label: 'Trap'              },
      RANGE_DAY:       { bias: 'NEUTRAL', label: 'Ranging'           },
      LOW_VOL_DRIFT:   { bias: 'NEUTRAL', label: 'Low Activity'      },
    };
    const mapped = REGIME_MAP[regime.regime] ?? { bias: 'NEUTRAL', label: regime.regime };

    return {
      bias:         mapped.bias,
      label:        mapped.label,
      regime:       regime.regime,
      confidence:   regime.confidence,
      vwapPosition: regime.vwapPosition,
    };
  } catch (err) {
    console.error('[commentary] 15m bias error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// 5-min OI snapshot for detecting short-term OI changes
// ─────────────────────────────────────────────────────────────────────
async function getOIChange5Min(currentCallOI, currentPutOI) {
  const KEY = `${NS}:oi-snapshot-5min`;
  const snapshot = await redisGet(KEY);

  if (!snapshot || !snapshot.callOI || !snapshot.putOI) {
    // Store first snapshot; return zeros
    await redisSet(KEY, { callOI: currentCallOI, putOI: currentPutOI, time: Date.now() }, 360);
    return { callOIChange5min: 0, putOIChange5min: 0 };
  }

  const callOIChange5min = snapshot.callOI > 0
    ? ((currentCallOI - snapshot.callOI) / snapshot.callOI) * 100
    : 0;
  const putOIChange5min = snapshot.putOI > 0
    ? ((currentPutOI - snapshot.putOI) / snapshot.putOI) * 100
    : 0;

  // Refresh snapshot (TTL of 360s ensures it auto-expires if not called)
  await redisSet(KEY, { callOI: currentCallOI, putOI: currentPutOI, time: Date.now() }, 360);

  return { callOIChange5min, putOIChange5min };
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 2: Analysis Engine
// ─────────────────────────────────────────────────────────────────────

function analyzePriceStructure(data) {
  const { spot, ema9, ema21, vwap, support, resistance } = data;

  const intradayBias = ema9  ? (spot > ema9  ? 'Bullish' : 'Bearish') : null;
  const dailyBias    = ema21 ? (spot > ema21 ? 'Bullish' : 'Bearish') : null;

  let structure = 'Neutral';
  if (ema9 && ema21 && spot > ema9 && spot > ema21 && (vwap == null || spot > vwap)) {
    structure = 'Strong Uptrend';
  } else if (ema9 && ema21 && spot < ema9 && spot < ema21 && (vwap == null || spot < vwap)) {
    structure = 'Strong Downtrend';
  } else if (intradayBias && dailyBias && intradayBias !== dailyBias) {
    structure = 'Conflicted';
  }

  let positionInRange = 50;
  if (support && resistance && resistance > support) {
    positionInRange = ((spot - support) / (resistance - support)) * 100;
  }

  return { intradayBias, dailyBias, structure, positionInRange };
}

function analyzeOIActivity(marketActivity) {
  if (!marketActivity) return { conviction: 'Low', narrative: '', tradingImplication: '' };

  const { activity, strength, description, actionable } = marketActivity;

  let conviction = 'Low';
  if (strength >= 7)     conviction = 'High';
  else if (strength >= 5) conviction = 'Moderate';

  return {
    conviction,
    narrative:          description || activity || '',
    tradingImplication: actionable  || '',
    activity,
  };
}

function analyzeLevels(data) {
  const { spot, support, resistance, maxPain } = data;

  const distToSupport    = support    ? ((spot - support) / spot) * 100 : 999;
  const distToResistance = resistance ? ((resistance - spot) / spot) * 100 : 999;
  const distToMaxPain    = maxPain    ? Math.abs(((spot - maxPain) / spot) * 100) : 999;

  let primaryLevel = null;
  let levelContext = '';
  let actionableLevel = null;

  if (Math.abs(distToSupport) < 0.3) {
    primaryLevel = support;
    levelContext = `At major support ${support}`;
    actionableLevel = {
      type:   'SUPPORT_TEST',
      level:  support,
      action: `Watch ${support}. Break = ${(support - 30).toFixed(0)}, Hold = rally to ${resistance || support + 100}`,
      bias:   'Bullish',
    };
  } else if (Math.abs(distToResistance) < 0.3) {
    primaryLevel = resistance;
    levelContext = `Testing resistance ${resistance}`;
    actionableLevel = {
      type:   'RESISTANCE_TEST',
      level:  resistance,
      action: `Strong Call wall. Likely rejection. Short with SL ${(resistance + 30).toFixed(0)}`,
      bias:   'Bearish',
    };
  } else if (distToMaxPain < 0.4) {
    primaryLevel = maxPain;
    levelContext = `Stuck at Max Pain ${maxPain}`;
    actionableLevel = {
      type:   'MAX_PAIN',
      level:  maxPain,
      action: `Rangebound. Trade ${support || maxPain - 100}-${resistance || maxPain + 100} range or avoid`,
      bias:   'Neutral',
    };
  } else {
    primaryLevel = Math.abs(distToSupport) < Math.abs(distToResistance) ? support : resistance;
    levelContext = `Between ${support}-${resistance}`;
    actionableLevel = {
      type:   'MID_RANGE',
      level:  primaryLevel,
      action: `Wait for ${support} (buy) or ${resistance} (sell)`,
      bias:   'Neutral',
    };
  }

  return { primaryLevel, levelContext, actionableLevel };
}

function analyzeTimeContext(timeBucket, volumeRatio) {
  const { bucket } = timeBucket;

  if (bucket === 'opening_hour') {
    return {
      context:      'Opening Hour (9:15-10:15)',
      tradingNotes: "High volatility. Wait for 9:30 AM consolidation. Don't chase moves.",
    };
  }
  if (bucket === 'mid_day') {
    return {
      context:      'Mid-day (10:15-14:30)',
      tradingNotes: volumeRatio < 0.7
        ? 'Low volume - avoid trades. Likely rangebound.'
        : 'Active session - trade with trend.',
    };
  }
  if (bucket === 'closing_hour') {
    return {
      context:      'Last Hour (14:30-15:30)',
      tradingNotes: 'Volatility spike expected. Book profits or trail stops.',
    };
  }
  return { context: '', tradingNotes: '' };
}

function findConflicts(data) {
  const { spot, ema9, pcr, activity } = data;
  const conflicts = [];

  // Price vs OI conflict
  if (ema9) {
    if (spot > ema9 && (activity === 'Short Buildup' || activity === 'Long Unwinding')) {
      conflicts.push({
        type:        'PRICE_OI_CONFLICT',
        message:     'Price up but OI suggests weakness',
        implication: 'Weak rally - be cautious on longs',
      });
    } else if (spot < ema9 && (activity === 'Long Buildup' || activity === 'Short Covering')) {
      conflicts.push({
        type:        'PRICE_OI_CONFLICT',
        message:     'Price down but OI suggests strength',
        implication: 'Dip buying happening - shorts risky',
      });
    }
  }

  // PCR conflict
  if (pcr != null) {
    if (pcr > 1.2 && ema9 && spot < ema9) {
      conflicts.push({
        type:        'PCR_CONFLICT',
        message:     `High PCR (${pcr.toFixed(2)}) but price weak`,
        implication: 'Heavy put writing vs weak price - wait for reversal confirmation',
      });
    } else if (pcr < 0.8 && ema9 && spot > ema9) {
      conflicts.push({
        type:        'PCR_CONFLICT',
        message:     `Low PCR (${pcr.toFixed(2)}) but price strong`,
        implication: 'Excessive call buying vs strong price - rally may be overextended',
      });
    }
  }

  // Timeframe conflict
  const intradayBullish = ema9 ? spot > ema9 : null;
  const ema21 = data.ema21;
  const dailyBullish    = ema21 ? spot > ema21 : null;
  if (intradayBullish != null && dailyBullish != null && intradayBullish !== dailyBullish) {
    conflicts.push({
      type:        'TIMEFRAME_CONFLICT',
      message:     intradayBullish
        ? 'Intraday bullish but daily bearish'
        : 'Intraday bearish but daily bullish',
      implication: 'Counter-trend move - use tight stops',
    });
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 3: Commentary Generator
// ─────────────────────────────────────────────────────────────────────

// ── BankNifty relative strength vs Nifty ─────────────────────────────────────
function computeBankRelStrength(niftyChangePct, bankNiftyChangePct) {
  if (niftyChangePct == null || bankNiftyChangePct == null) return null;
  const diff = bankNiftyChangePct - niftyChangePct;
  if (diff > 0.5)  return { diff: parseFloat(diff.toFixed(2)), label: 'BankNifty outperforming',   status: 'leading'  };
  if (diff < -0.5) return { diff: parseFloat(diff.toFixed(2)), label: 'BankNifty underperforming', status: 'lagging'  };
  return               { diff: parseFloat(diff.toFixed(2)), label: 'BankNifty in line with Nifty', status: 'inline'   };
}

// ── Multi-source S/R confluence scorer ───────────────────────────────────────
// Collects every potential S/R level from all sources, clusters nearby levels
// within 0.4%, sums weights, returns strongest support below spot and strongest
// resistance above spot — each with a human-readable sources list.
//
// Source weights (institutional > price-action > technical):
//   oiWall (put/call):  3   — real money positioned there
//   maxPain:            2   — option expiry gravity
//   orLevel (H/L):      2   — opening range is universally watched
//   swingPivot:         2   — actual price-action rejection
//   vwap:               2   — institutional benchmark
//   prevClose:          1   — reference gap level
//   dayExtremes (H/L):  1   — today's range edges
//   ema9 / ema21:       1   — trend following reference
//
function buildSRLevels(spot, {
  oiSupport, oiResistance, maxPain, orHigh, orLow,
  swingHighs = [], swingLows = [],
  vwap, prevClose, niftyHigh, niftyLow, ema9, ema21,
}) {
  // 1. Seed candidate levels
  const candidates = [];
  const add = (price, weight, label, side) => {
    if (price && !isNaN(price) && isFinite(price)) {
      candidates.push({ price: parseFloat(price), weight, label, side });
    }
  };

  add(oiSupport,   3, 'OI put wall',   'support');
  add(oiResistance,3, 'OI call wall',  'resistance');
  add(maxPain,     2, 'Max Pain',      spot > maxPain ? 'support' : 'resistance');
  add(orHigh,      2, 'OR high',       'resistance');
  add(orLow,       2, 'OR low',        'support');
  add(vwap,        2, 'VWAP',          spot > vwap ? 'support' : 'resistance');
  add(prevClose,   1, 'Prev close',    spot > prevClose ? 'support' : 'resistance');
  add(niftyHigh,   1, 'Day high',      'resistance');
  add(niftyLow,    1, 'Day low',       'support');
  add(ema9,        1, 'EMA9',          spot > ema9 ? 'support' : 'resistance');
  add(ema21,       1, 'EMA21',         spot > ema21 ? 'support' : 'resistance');
  swingHighs.forEach(p => add(p, 2, 'Swing high', 'resistance'));
  swingLows.forEach(p  => add(p, 2, 'Swing low',  'support'));

  // 2. Cluster levels within 0.4% of each other
  const CLUSTER_BAND = 0.004;
  const clusters = [];
  for (const c of candidates) {
    const existing = clusters.find(cl => Math.abs(cl.price - c.price) / cl.price <= CLUSTER_BAND);
    if (existing) {
      existing.weight += c.weight;
      existing.price   = (existing.price + c.price) / 2; // merge toward centroid
      if (!existing.sources.includes(c.label)) existing.sources.push(c.label);
    } else {
      clusters.push({ price: c.price, weight: c.weight, sources: [c.label], side: c.side });
    }
  }

  // 3. Pick best support (below spot) and best resistance (above spot)
  const supports    = clusters.filter(c => c.price < spot).sort((a, b) => b.weight - a.weight);
  const resistances = clusters.filter(c => c.price > spot).sort((a, b) => b.weight - a.weight);

  const fmt = (cl) => cl ? {
    price:    parseFloat(cl.price.toFixed(0)),
    weight:   cl.weight,
    sources:  cl.sources,
    label:    cl.sources.slice(0, 2).join(' + '),  // top 2 sources for display
    strong:   cl.weight >= 5,
  } : null;

  return {
    support:    fmt(supports[0])    || null,
    resistance: fmt(resistances[0]) || null,
    // Legacy scalar fallback for code that still reads .support/.resistance as numbers
    supportPrice:    supports[0]    ? parseFloat(supports[0].price.toFixed(0))    : null,
    resistancePrice: resistances[0] ? parseFloat(resistances[0].price.toFixed(0)) : null,
  };
}

function generateLiveCommentary(marketData, optionChain, intraday) {
  const spot        = parseFloat(marketData.indices?.nifty          || 0);
  const prevClose   = parseFloat(marketData.indices?.niftyPrevClose || spot);
  const niftyHigh   = parseFloat(marketData.indices?.niftyHigh      || spot);
  const niftyLow    = parseFloat(marketData.indices?.niftyLow       || spot);
  const ema9        = parseFloat(marketData.indices?.niftyEMA9      || 0) || null;
  const vix         = parseFloat(marketData.indices?.vix             || 0);

  // BankNifty relative strength
  const niftyChangePct    = parseFloat(marketData.indices?.niftyChangePercent    ?? 0) || null;
  const bankNiftyChangePct = parseFloat(marketData.indices?.bankNiftyChangePercent ?? 0) || null;
  const bankRelStrength   = computeBankRelStrength(niftyChangePct, bankNiftyChangePct);

  const pcr         = optionChain?.pcr         || null;
  const oiSupport   = optionChain?.support     || null;
  const oiResistance= optionChain?.resistance  || null;
  const maxPain     = optionChain?.maxPain     || null;
  const marketActivity = optionChain?.marketActivity || null;

  const orHigh = intraday?.orHigh || null;
  const orLow  = intraday?.orLow  || null;

  // Build confluent S/R levels from all sources
  const srLevels = buildSRLevels(spot, {
    oiSupport, oiResistance, maxPain,
    orHigh, orLow,
    swingHighs: intraday?.swingHighs || [],
    swingLows:  intraday?.swingLows  || [],
    vwap:       intraday?.vwap || null,
    prevClose,
    niftyHigh, niftyLow,
    ema9,
    ema21:      intraday?.ema21 || null,
  });

  // Scalar S/R used throughout existing analysis functions
  const support    = srLevels.supportPrice    ?? oiSupport    ?? niftyLow;
  const resistance = srLevels.resistancePrice ?? oiResistance ?? niftyHigh;

  const ema21     = intraday?.ema21     || null;
  const rsi       = intraday?.rsi       || null;
  const vwap      = intraday?.vwap      || null;
  const rsiHistory = intraday?.rsiHistory || [];
  const change5min = intraday?.change5min ?? null;

  const timeBucket  = getTimeBucket();
  const volumeRatio = (intraday?.volumeAvg && intraday?.volumeCurrent)
    ? intraday.volumeCurrent / intraday.volumeAvg
    : 1;

  // ── Analysis Engine ──
  const analysisData = {
    spot, ema9, ema21, vwap, support, resistance, maxPain, pcr,
    activity: marketActivity?.activity || null,
  };

  const priceStructure = analyzePriceStructure(analysisData);
  const oiActivity     = analyzeOIActivity(marketActivity);
  const levelAnalysis  = analyzeLevels({ spot, support, resistance, maxPain });
  const timeContext    = analyzeTimeContext(timeBucket, volumeRatio);
  const conflicts      = findConflicts(analysisData);

  // ── Reversal Zone Detection ──
  const reversalData = {
    price:      { current: spot, dayHigh: niftyHigh, dayLow: niftyLow, change5min },
    indicators: { rsi, rsiHistory, macdData: intraday?.macdData || null },
    volume:     {
      current:    intraday?.volumeCurrent || 0,
      avg:        intraday?.volumeAvg     || 0,
      lastCandle: intraday?.lastCandle    || null,
      prevCandle: intraday?.prevCandle    || null,
      spike:      intraday?.volumeSpike   || false,
    },
    oi: {
      callOIChange5min: intraday?.callOIChange5min ?? 0,
      putOIChange5min:  intraday?.putOIChange5min  ?? 0,
      pcr,
    },
    levels: {
      support:    support    ? { level: support,    oiChange: 0, strength: 5 } : null,
      resistance: resistance ? { level: resistance, oiChange: 0, strength: 5 } : null,
    },
    trend: { direction: intraday?.trendDirection || 'NEUTRAL' },
  };
  const reversalResult = detectReversalZone(reversalData);

  // ── Determine bias (considering conflicts) ──
  const hasConflicts = conflicts.length > 0;

  let bias      = 'NEUTRAL';
  let biasEmoji = '🟡';

  if (!hasConflicts) {
    const { intradayBias, dailyBias: dailyBiasVal } = priceStructure;
    const { tradingImplication } = oiActivity;

    if (tradingImplication.includes('buy') || tradingImplication.includes('long') || tradingImplication.includes('longs')) {
      if (intradayBias === 'Bullish') { bias = 'BULLISH'; biasEmoji = '🟢'; }
    } else if (tradingImplication.includes('sell') || tradingImplication.includes('short') || tradingImplication.includes('shorts')) {
      if (intradayBias === 'Bearish') { bias = 'BEARISH'; biasEmoji = '🔴'; }
    } else if (intradayBias && dailyBiasVal && intradayBias === dailyBiasVal) {
      if (intradayBias === 'Bullish') { bias = 'BULLISH'; biasEmoji = '🟢'; }
      else                           { bias = 'BEARISH'; biasEmoji = '🔴'; }
    }
  }

  // ── Build warnings ──
  const warnings = [];
  conflicts.forEach(c => warnings.push(`⚠️ ${c.message}`));
  if (timeBucket.bucket === 'opening_hour') warnings.push('⏰ Opening volatility - wait for 9:30 AM consolidation');
  if (timeBucket.bucket === 'closing_hour') warnings.push('⏰ Closing hour - book profits or trail stops');
  if (vix > 20)  warnings.push(`⚠️ VIX elevated (${vix.toFixed(1)}) - reduce position size`);
  if (pcr && pcr > 1.2 && bias === 'BEARISH') warnings.push(`⚠️ PCR ${pcr.toFixed(2)} shows heavy put writing - shorts risky`);
  if (pcr && pcr < 0.8 && bias === 'BULLISH') warnings.push(`⚠️ PCR ${pcr.toFixed(2)} shows excessive call buying - longs risky`);
  // BankNifty relative strength — significant divergence is a market warning
  if (bankRelStrength?.status === 'lagging' && bias !== 'BEARISH') {
    warnings.push(`BankNifty lagging Nifty by ${Math.abs(bankRelStrength.diff).toFixed(1)}% — financial sector weakness may drag`);
  } else if (bankRelStrength?.status === 'leading' && bias !== 'BULLISH') {
    warnings.push(`BankNifty leading Nifty by ${bankRelStrength.diff.toFixed(1)}% — financial sector driving momentum`);
  }

  // ── Regime qualification — incorporate intraday regime into commentary ──
  // OI signals can be misleading when regime is adversarial (TRAP_DAY, TREND_DAY_DOWN).
  const regime = intraday?.intradayRegime;
  const regimeType = regime?.regime;
  const regimeConf = regime?.confidence;

  if (regimeType === 'TRAP_DAY' && regimeConf !== 'LOW') {
    // Trap day: OI signals are unreliable — longs are being set up for a squeeze in the wrong direction.
    // Prepend to warnings regardless of what OI says.
    const trapDir = regime.signals?.[0]?.includes('Bull') ? 'bear' : 'bull';
    warnings.unshift(`⚠️ Trap Day detected — ${trapDir} trap in play. Breakout signals unreliable. Wait for clear direction.`);
    // Force bias to NEUTRAL on a high-confidence trap — OI direction is actively misleading
    if (regimeConf === 'HIGH') {
      bias = 'NEUTRAL'; biasEmoji = '🟡';
    }
  } else if (regimeType === 'TREND_DAY_DOWN' && regimeConf !== 'LOW') {
    warnings.unshift(`⚠️ Regime: Trend Day Down — OR broken, below VWAP. Counter-trend longs high risk.`);
    if (bias === 'BULLISH') { bias = 'NEUTRAL'; biasEmoji = '🟡'; }
  } else if (regimeType === 'LONG_LIQUIDATION') {
    warnings.unshift(`⚠️ Regime: Long Liquidation — forced selling detected. Avoid catching falling knife.`);
    if (bias === 'BULLISH') { bias = 'NEUTRAL'; biasEmoji = '🟡'; }
  } else if (regimeType === 'SHORT_SQUEEZE' && regimeConf !== 'LOW') {
    // Short squeeze: reinforce bullish signals, add to warnings as context
    warnings.unshift(`📈 Regime: Short Squeeze — shorts covering, momentum accelerating. Trail stops, don't fade.`);
  }

  // ── Synthesize narrative — one coherent story from all signals ──
  const narrativeCtx = {
    regimeType, regimeConf, regimeSignals: regime?.signals || [],
    reversalResult, oiActivity, marketActivity,
    spot, vwap, ema9, ema21, rsi, change5min, volumeRatio,
    trendDirection: intraday?.trendDirection || 'NEUTRAL',
    support, resistance, maxPain, pcr,
    priceStructure, levelAnalysis, hasConflicts,
    niftyHigh, bankRelStrength,
  };
  const narr = synthesizeNarrative(narrativeCtx);

  // Use narrative bias if stronger than what keyword matching found
  let finalBias = bias, finalBiasEmoji = biasEmoji;
  if (narr.bias && narr.bias !== 'NEUTRAL') {
    finalBias = narr.bias;
    finalBiasEmoji = narr.bias === 'BULLISH' ? '🟢' : '🔴';
  }

  // Medium-confidence reversal: add to warnings
  if (reversalResult.reversalZone && reversalResult.confidence === 'MEDIUM') {
    warnings.push(`🔄 ${reversalResult.commentary.state}: ${reversalResult.commentary.headline}`);
  }

  return {
    state:           narr.state,
    stateEmoji:      narr.stateEmoji,
    bias:            finalBias,
    biasEmoji:       finalBiasEmoji,
    keyLevel:        narr.keyLevel || prevClose.toFixed(0),
    headline:        narr.headline,
    action:          narr.action,
    timeNotes:       timeContext.tradingNotes,
    warnings,
    reversal:        reversalResult.reversalZone ? reversalResult : null,
    structure:       priceStructure.structure,
    positionInRange: priceStructure.positionInRange?.toFixed(0),
    bankRelStrength,
    orHigh:     orHigh ? parseFloat(orHigh.toFixed(0)) : null,
    orLow:      orLow  ? parseFloat(orLow.toFixed(0))  : null,
    srLevels,
    regime:     regimeType ? { type: regimeType, confidence: regimeConf, signals: regime?.signals || [] } : null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// CEREBRUM — synthesizes all market signals into one coherent narrative
// Observes → interprets → names the setup → states the trade
// Priority: Regime > Reversal > Setup detection > OI > Structure
// ─────────────────────────────────────────────────────────────────────
function synthesizeNarrative({
  regimeType, regimeConf, regimeSignals,
  reversalResult, oiActivity, marketActivity,
  spot, vwap, ema9, ema21, rsi, change5min, volumeRatio, trendDirection,
  support, resistance, pcr,
  priceStructure, levelAnalysis,
  niftyHigh, bankRelStrength,
}) {
  const oiAct     = marketActivity?.activity || null;
  const aboveVwap = vwap  && spot > vwap;
  const aboveEMA9 = ema9  && spot > ema9;
  const aboveEMA21= ema21 && spot > ema21;
  const atRes     = resistance && Math.abs(spot - resistance) / resistance < 0.004;
  const atSup     = support    && Math.abs(spot - support)    / support    < 0.004;
  const nearEMA9  = ema9  && Math.abs(spot - ema9)  / ema9  < 0.003;
  const nearEMA21 = ema21 && Math.abs(spot - ema21) / ema21 < 0.004;
  const nearVwap  = vwap  && Math.abs(spot - vwap)  / vwap  < 0.003;
  const rsiOB     = rsi && rsi > 65;
  const rsiOS     = rsi && rsi < 35;
  const volHigh   = volumeRatio && volumeRatio > 1.5;
  const volLow    = volumeRatio && volumeRatio < 0.6;
  const R         = v => v ? parseFloat(v).toFixed(0) : '—';
  const pct       = v => v != null ? `${v > 0 ? '+' : ''}${parseFloat(v).toFixed(1)}%` : '';

  // ── helpers ──
  const oiSupports  = (direction) => {
    if (direction === 'BULLISH') return oiAct === 'Long Buildup' ? ' Put writing confirms floor below.' : oiAct === 'Short Covering' ? ' Shorts covering adds fuel.' : '';
    if (direction === 'BEARISH') return oiAct === 'Short Buildup' ? ' Call writing confirms ceiling above.' : oiAct === 'Long Unwinding' ? ' Longs exiting adds supply.' : '';
    return '';
  };
  const oiConflicts = (direction) => {
    if (direction === 'BULLISH' && (oiAct === 'Short Buildup' || oiAct === 'Long Unwinding')) return ` Note: OI shows ${oiAct} — watch for divergence.`;
    if (direction === 'BEARISH' && (oiAct === 'Long Buildup'  || oiAct === 'Short Covering')) return ` Note: OI shows ${oiAct} — conflicting signal.`;
    return '';
  };
  const volNote = volHigh ? ` Volume ${volumeRatio.toFixed(1)}x — conviction.` : volLow ? ` Volume thin — move may not hold.` : '';
  const rsiNote = (dir) => rsiOB && dir === 'BULLISH' ? ` RSI ${R(rsi)} extended — momentum strong but watch for fade.`
                         : rsiOS && dir === 'BEARISH' ? ` RSI ${R(rsi)} oversold — don't chase shorts.`
                         : rsiOB && dir === 'BEARISH' ? ` RSI ${R(rsi)} overbought — confirms exhaustion.`
                         : rsiOS && dir === 'BULLISH' ? ` RSI ${R(rsi)} oversold — bounce has fuel.` : '';

  // ════════════════════════════════════════════════════════════════
  // LAYER 1: REGIME — highest context, overrides OI when directional
  // ════════════════════════════════════════════════════════════════

  if (regimeType === 'TRAP_DAY' && regimeConf !== 'LOW') {
    const bullTrap = regimeSignals.some(s => /bull/i.test(s));
    const oiConflict = bullTrap && oiAct === 'Long Buildup' ? `OI shows Long Buildup (put writing) — but ` : '';
    const headline = bullTrap
      ? `${oiConflict}breakout above ${R(resistance)} failed — bull trap in play`
      : `Breakdown below ${R(support)} reversed — bear trap, shorts getting squeezed`;
    const watchKey = bullTrap ? support : resistance;
    const action = bullTrap
      ? `Bulls who chased the break are now underwater.${rsiNote('BEARISH')} Close below VWAP ${R(vwap)} = trap deepening. Stay flat or short with SL above ${R(niftyHigh)}.`
      : `Bears caught offside${aboveVwap ? ', price back above VWAP' : ''}. Shorts covering.${oiSupports('BULLISH')} Watch ${R(resistance)} — hold above = squeeze builds.`;
    return { state: 'TRAP DAY', stateEmoji: '⚠️', bias: bullTrap ? 'BEARISH' : 'NEUTRAL', headline, action, keyLevel: R(watchKey) };
  }

  if (regimeType === 'SHORT_SQUEEZE' && regimeConf !== 'LOW') {
    const lastCandleNote = change5min && change5min > 0.3 ? `, last candle ${pct(change5min)}` : '';
    const headline = `Short squeeze — consecutive green candles${lastCandleNote}, volume expanding${aboveVwap ? ', above VWAP' : ''}`;
    const action = `Shorts covering${volNote}${oiSupports('BULLISH')} Don't fade momentum.${rsiNote('BULLISH')} Next resistance ${R(resistance)} — break = acceleration. Trail stops.`;
    return { state: 'SHORT SQUEEZE', stateEmoji: '🚀', bias: 'BULLISH', headline, action, keyLevel: R(resistance) };
  }

  if (regimeType === 'LONG_LIQUIDATION') {
    const lastCandleNote = change5min && change5min < -0.3 ? `, last candle ${pct(change5min)}` : '';
    const headline = `Long liquidation — forced selling${lastCandleNote}${!aboveVwap ? ', below VWAP' : ''}${volHigh ? `, ${volumeRatio.toFixed(1)}x volume` : ''}`;
    const pcrNote = pcr && pcr > 1.2 ? ` PCR ${pcr.toFixed(2)} — institutional put buying confirms hedging.` : '';
    const action = `Longs being flushed.${pcrNote}${rsiNote('BEARISH')} Knife-catch risk high — wait for volume to dry up near ${R(support)} before considering longs.`;
    return { state: 'LONG LIQUIDATION', stateEmoji: '📉', bias: 'BEARISH', headline, action, keyLevel: R(support) };
  }

  if (regimeType === 'TREND_DAY_UP' && regimeConf !== 'LOW') {
    const vwapTest = !aboveVwap ? ` — currently testing VWAP ${R(vwap)}, watch for hold` : '';
    const headline = `Trend day up — OR broken, HH+HL structure${aboveVwap ? ', holding above VWAP' : vwapTest}`;
    const action = `Structure intact.${oiSupports('BULLISH')}${rsiNote('BULLISH')}${volNote} Dips toward ${R(support)} are continuation buys. Target ${R(resistance)}. Invalidated by close below VWAP.`;
    return { state: 'TREND UP', stateEmoji: '📈', bias: 'BULLISH', headline, action, keyLevel: R(support) };
  }

  if (regimeType === 'TREND_DAY_DOWN' && regimeConf !== 'LOW') {
    const vwapTest = aboveVwap ? ` — testing VWAP ${R(vwap)} from below, watch for rejection` : '';
    const headline = `Trend day down — OR broken, LL+LH structure${!aboveVwap ? ', below VWAP' : vwapTest}`;
    const action = `Bears in control.${oiSupports('BEARISH')}${rsiNote('BEARISH')}${volNote} Bounces toward ${R(resistance)} are shorting setups. Next support ${R(support)}. Invalidated by reclaim above VWAP.`;
    return { state: 'TREND DOWN', stateEmoji: '📉', bias: 'BEARISH', headline, action, keyLevel: R(resistance) };
  }

  // ════════════════════════════════════════════════════════════════
  // LAYER 2: REVERSAL ZONE — candlestick/OI/RSI confluence
  // ════════════════════════════════════════════════════════════════

  if (reversalResult?.reversalZone && reversalResult.confidence === 'HIGH') {
    const rev  = reversalResult;
    const top2 = (rev.signals || []).slice(0, 2).map(s => s.message).join(' + ');
    const dir  = rev.direction;
    const action = `${oiConflicts(dir)}${rev.commentary.action}${volNote}`;
    return {
      state: rev.commentary.state, stateEmoji: '🔄',
      bias: dir === 'BULLISH' ? 'BULLISH' : dir === 'BEARISH' ? 'BEARISH' : 'NEUTRAL',
      headline: top2 || rev.commentary.headline, action,
      keyLevel: R(levelAnalysis?.primaryLevel),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // LAYER 3: SETUP DETECTION — specific intraday patterns
  // ════════════════════════════════════════════════════════════════

  // ── EMA Bounce (trend continuation pullback) ──
  // Price pulled back to EMA9 or EMA21 in an uptrend, now bouncing
  if ((nearEMA9 || nearEMA21) && aboveVwap && change5min > 0.15 && trendDirection !== 'DOWN') {
    const emaLabel = nearEMA9 ? `EMA9 ${R(ema9)}` : `EMA21 ${R(ema21)}`;
    const emaLevel = nearEMA9 ? ema9 : ema21;
    const headline = `Bouncing off ${emaLabel} — trend continuation pullback setup`;
    const action = `Textbook pullback-to-EMA in an uptrend.${oiSupports('BULLISH')}${volNote}${rsiNote('BULLISH')} ${emaLabel} is the SL level — hold above = bias intact, long bias. Target ${R(resistance)}.`;
    return { state: 'EMA BOUNCE', stateEmoji: '↗️', bias: 'BULLISH', headline, action, keyLevel: R(emaLabel) };
  }

  // ── EMA Rejection (trend continuation fade) ──
  // Price rallied to EMA in a downtrend, now failing
  if ((nearEMA9 || nearEMA21) && !aboveVwap && change5min < -0.15 && trendDirection !== 'UP') {
    const emaLabel = nearEMA9 ? `EMA9 ${R(ema9)}` : `EMA21 ${R(ema21)}`;
    const headline = `Rejected at ${emaLabel} — EMA acting as resistance in downtrend`;
    const action = `Classic bear continuation — rally to EMA faded.${oiSupports('BEARISH')}${rsiNote('BEARISH')}${volNote} Stay below ${emaLabel} = bearish. Target ${R(support)}.`;
    return { state: 'EMA REJECTION', stateEmoji: '↘️', bias: 'BEARISH', headline, action, keyLevel: R(nearEMA9 ? ema9 : ema21) };
  }

  // ── VWAP Reclaim (bullish) ──
  // Price dipped below VWAP, reclaimed it with green candle
  if (nearVwap && aboveVwap && change5min > 0.15 && trendDirection === 'UP') {
    const headline = `VWAP ${R(vwap)} reclaimed — bulls took back institutional benchmark`;
    const action = `Reclaiming VWAP is a significant intraday reversal signal.${oiSupports('BULLISH')}${volNote} Hold above VWAP = bullish continuation. Slip back below = false reclaim, exit. Target ${R(resistance)}.`;
    return { state: 'VWAP RECLAIM', stateEmoji: '↗️', bias: 'BULLISH', headline, action, keyLevel: R(vwap) };
  }

  // ── VWAP Rejection (bearish) ──
  // Price rallied to VWAP from below, rejected
  if (nearVwap && !aboveVwap && change5min < -0.15 && trendDirection === 'DOWN') {
    const headline = `Rejected at VWAP ${R(vwap)} — bears defending the institutional level`;
    const action = `VWAP rejection is a high-probability short setup.${oiSupports('BEARISH')}${rsiNote('BEARISH')}${volNote} Hold below VWAP = bearish. Target ${R(support)}.`;
    return { state: 'VWAP REJECTION', stateEmoji: '↘️', bias: 'BEARISH', headline, action, keyLevel: R(vwap) };
  }

  // ── OR Breakout (price cleared opening range) ──
  // Handled by TREND_DAY regime; here for BREAKOUT_DAY / ambiguous
  if (regimeType === 'BREAKOUT_DAY') {
    const dir  = aboveVwap ? 'BULLISH' : 'BEARISH';
    const headline = `OR broken ${aboveVwap ? 'up' : 'down'}${volHigh ? ` with ${volumeRatio.toFixed(1)}x volume` : ', volume not yet confirming'}`;
    const action = `Breakout in progress — direction${aboveVwap ? '' : ' not yet'} confirmed.${oiSupports(dir)}${volLow ? ' Thin volume is a concern — wait for retest.' : ''} Hold ${aboveVwap ? 'above' : 'below'} OR ${aboveVwap ? R(resistance) : R(support)} = bias intact.`;
    return { state: 'OR BREAKOUT', stateEmoji: aboveVwap ? '⬆️' : '⬇️', bias: dir, headline, action, keyLevel: aboveVwap ? R(resistance) : R(support) };
  }

  // ── Breakout Retest ──
  // Price previously broke above resistance, pulled back to test it as support
  const prevResNowSup = resistance && support && Math.abs(support - resistance) / resistance < 0.008;
  if (prevResNowSup && aboveVwap && change5min > 0 && oiAct !== 'Short Buildup') {
    const headline = `Testing prior resistance ${R(resistance)} as support — breakout retest setup`;
    const action = `Classic breakout-retest.${oiSupports('BULLISH')}${volNote} Hold here = high-probability long entry. SL below ${R(support)}. Target: prior high + extension.`;
    return { state: 'RETEST', stateEmoji: '🎯', bias: 'BULLISH', headline, action, keyLevel: R(resistance) };
  }

  // ── Level tests with full context ──
  if (atRes) {
    const dir  = (rsiOB || oiAct === 'Short Buildup') ? 'BEARISH' : aboveVwap ? 'NEUTRAL' : 'NEUTRAL';
    const momentum = change5min > 0.2 ? 'approaching with momentum' : change5min < -0.1 ? 'already stalling / fading' : 'reaching the level';
    const headline = `${momentum === 'already stalling / fading' ? 'Stalling at' : 'Testing'} resistance ${R(resistance)}${aboveVwap ? ', above VWAP' : ''}${rsiOB ? ', RSI extended' : ''}`;
    const action = `${oiAct === 'Short Buildup' ? 'Fresh call writing confirms supply. ' : oiAct === 'Long Buildup' ? 'Put writing below provides a floor, but resistance holding for now. ' : ''}${rsiNote('BEARISH')}${volNote} ${momentum === 'approaching with momentum' ? 'Needs volume to push through.' : 'Distribution possible.'} Break above = ${R(parseFloat(resistance) + 50)}. Rejection = VWAP ${R(vwap)} next.`;
    return { state: 'AT RESISTANCE', stateEmoji: '⚡', bias: dir, headline, action, keyLevel: R(resistance) };
  }

  if (atSup) {
    // Only BEARISH if spot is clearly below VWAP (not just marginally — e.g. first candle of day, VWAP ≈ spot)
    const clearlyBelowVwap = !aboveVwap && !nearVwap;
    const dir  = (rsiOS || oiAct === 'Long Buildup') ? 'NEUTRAL' : clearlyBelowVwap ? 'BEARISH' : 'NEUTRAL';
    const holding = change5min >= 0;
    const headline = `Testing support ${R(support)}${!aboveVwap ? ', below VWAP' : ''}${rsiOS ? ', RSI oversold' : ''}`;
    const action = `${oiAct === 'Long Buildup' ? 'Put writing building a floor here. ' : oiAct === 'Short Buildup' ? 'Call writers active — bears not giving up at this level. ' : ''}${rsiNote('BULLISH')}${volNote} ${holding ? 'Holding so far.' : 'Still under pressure.'} Hold = bounce to ${R(parseFloat(support) + 60)}. Break = ${R(parseFloat(support) - 80)}.`;
    return { state: 'AT SUPPORT', stateEmoji: '🛡️', bias: dir, headline, action, keyLevel: R(support) };
  }

  // ════════════════════════════════════════════════════════════════
  // LAYER 4: OI ACTIVITY — with VWAP/RSI/volume context
  // ════════════════════════════════════════════════════════════════

  if (oiActivity?.conviction !== 'Low' && oiAct && oiAct !== 'Consolidation') {
    const oiMap = {
      'Long Buildup':   { state: 'LONG BUILDUP',   stateEmoji: '🚀', bias: 'BULLISH' },
      'Short Buildup':  { state: 'SHORT BUILDUP',  stateEmoji: '📉', bias: 'BEARISH' },
      'Long Unwinding': { state: 'LONG UNWINDING', stateEmoji: '😰', bias: 'BEARISH' },
      'Short Covering': { state: 'SHORT COVERING', stateEmoji: '🎯', bias: 'BULLISH' },
    };
    const entry = oiMap[oiAct] || { state: oiAct.toUpperCase(), stateEmoji: '📊', bias: 'NEUTRAL' };
    const { narrative, tradingImplication } = oiActivity;
    const vwapCtx  = aboveVwap ? `price above VWAP ${R(vwap)}` : `price below VWAP ${R(vwap)}`;
    const pcrCtx   = pcr ? ` PCR ${pcr.toFixed(2)}.` : '';
    const conflict = (entry.bias === 'BULLISH' && !aboveVwap) ? ' — caution: price below VWAP, OI may be stale.' :
                     (entry.bias === 'BEARISH' &&  aboveVwap) ? ' — note: price above VWAP, bulls not fully surrendered.' : '';
    const headline = `${narrative || oiAct} — ${vwapCtx}${rsiOB ? `, RSI ${R(rsi)} overbought` : rsiOS ? `, RSI ${R(rsi)} oversold` : ''}${pcrCtx} (OI ~3–5 min lag)`;
    const action   = `${tradingImplication}${conflict}${volNote}${rsiNote(entry.bias)} Watch ${entry.bias === 'BULLISH' ? R(resistance) : R(support)} for next directional move.`;
    return { ...entry, headline, action, keyLevel: entry.bias === 'BULLISH' ? R(support) : R(resistance) };
  }

  // ════════════════════════════════════════════════════════════════
  // LAYER 5: STRUCTURE FALLBACK — VWAP + EMA + RSI
  // ════════════════════════════════════════════════════════════════

  const emaCtx = aboveEMA9 && aboveEMA21 ? 'above EMA9 + EMA21' : !aboveEMA9 && !aboveEMA21 ? 'below EMA9 + EMA21' : aboveEMA9 ? 'above EMA9, below EMA21' : 'below EMA9, above EMA21';
  const momentumCtx = trendDirection === 'UP' ? 'higher highs forming' : trendDirection === 'DOWN' ? 'lower lows forming' : 'no clear momentum';
  const rsiCtx = rsiOB ? `RSI ${R(rsi)} overbought` : rsiOS ? `RSI ${R(rsi)} oversold — watch for squeeze` : `RSI ${R(rsi)}`;
  const structBias = (aboveVwap && aboveEMA9) ? 'BULLISH' : (!aboveVwap && !aboveEMA9) ? 'BEARISH' : 'NEUTRAL';
  const headline = `${aboveVwap ? 'Above' : 'Below'} VWAP ${R(vwap)}, ${emaCtx} — ${momentumCtx}. ${rsiCtx}.`;
  const action = structBias === 'BULLISH'
    ? `Structure bullish — all MAs aligned.${volNote} ${R(support)} (EMA9/VWAP zone) is the key support. Hold there = bias intact. Watch ${R(resistance)} for breakout.`
    : structBias === 'BEARISH'
    ? `Structure bearish — price below all MAs.${volNote} ${R(resistance)} is the ceiling. Watch ${R(support)} for next support test.`
    : `Mixed signals — price between key levels.${volNote} Wait for clear directional break above ${R(resistance)} or below ${R(support)}.`;
  return {
    state: structBias === 'BULLISH' ? 'ABOVE VWAP' : structBias === 'BEARISH' ? 'BELOW VWAP' : 'CONSOLIDATING',
    stateEmoji: structBias === 'BULLISH' ? '📈' : structBias === 'BEARISH' ? '📉' : '😴',
    bias: structBias, headline, action, keyLevel: structBias === 'BULLISH' ? R(support) : R(resistance),
  };
}

// ─────────────────────────────────────────────────────────────────────
// OI-based state commentary builder
// ─────────────────────────────────────────────────────────────────────
function buildOIStateCommentary(activity, oiActivity, levelAnalysis, support, resistance) {
  const { narrative, tradingImplication } = oiActivity;
  const { primaryLevel, actionableLevel } = levelAnalysis;

  const map = {
    'Long Buildup':    { state: 'LONG BUILDUP',    stateEmoji: '🚀', keyLevel: support?.toFixed(0),    oiBias: 'Bullish' },
    'Short Buildup':   { state: 'SHORT BUILDUP',   stateEmoji: '📉', keyLevel: resistance?.toFixed(0), oiBias: 'Bearish' },
    'Long Unwinding':  { state: 'LONG UNWINDING',  stateEmoji: '😰', keyLevel: support?.toFixed(0),    oiBias: 'Bearish' },
    'Short Covering':  { state: 'SHORT COVERING',  stateEmoji: '🎯', keyLevel: resistance?.toFixed(0), oiBias: 'Bullish' },
    'Consolidation':   { state: 'CONSOLIDATION',   stateEmoji: '😴', keyLevel: support?.toFixed(0),    oiBias: 'Neutral' },
  };

  const entry = map[activity] || { state: activity.toUpperCase(), stateEmoji: '📊', keyLevel: primaryLevel?.toFixed(0), oiBias: 'Neutral' };
  const oiBias    = entry.oiBias;
  const levelBias = actionableLevel?.bias || 'Neutral'; // 'Bullish' | 'Bearish' | 'Neutral'

  // Only append level action if it doesn't directly contradict the OI direction.
  // Conflicting example: OI says Long Buildup (Bullish) but level says "Short with SL X" (Bearish).
  let actionSuffix = '';
  if (actionableLevel) {
    const isConflict = (oiBias === 'Bullish' && levelBias === 'Bearish') ||
                       (oiBias === 'Bearish' && levelBias === 'Bullish');
    if (!isConflict) {
      actionSuffix = actionableLevel.action;
    } else {
      // Soften: just note the level as context without a trade instruction
      const levelType = levelBias === 'Bearish' ? 'resistance' : 'support';
      actionSuffix = `Watch ${levelType} at ${actionableLevel.level}`;
    }
  }

  return {
    state:      entry.state,
    stateEmoji: entry.stateEmoji,
    headline:   narrative,
    action:     actionSuffix ? `${tradingImplication}. ${actionSuffix}`.trim() : tradingImplication,
    keyLevel:   entry.keyLevel || primaryLevel?.toFixed(0),
    oiBias:     entry.oiBias,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Price structure based commentary builder
// ─────────────────────────────────────────────────────────────────────
function buildPriceStateCommentary(ema9, vwap, priceStructure, levelAnalysis, support, resistance) {
  const { structure } = priceStructure;
  const { primaryLevel, levelContext, actionableLevel } = levelAnalysis;
  const levelAction = actionableLevel?.action || '';

  if (structure === 'Strong Uptrend') {
    return {
      state:      'STRONG UPTREND',
      stateEmoji: '🚀',
      headline:   `Above EMA9${vwap ? ', EMA21, VWAP' : ''} - all systems bullish`,
      action:     `Buy dips. ${levelAction}`,
      keyLevel:   ema9?.toFixed(0) || support?.toFixed(0),
    };
  }

  if (structure === 'Strong Downtrend') {
    return {
      state:      'STRONG DOWNTREND',
      stateEmoji: '📉',
      headline:   `Below EMA9${vwap ? ', EMA21, VWAP' : ''} - bears in control`,
      action:     `Sell rallies. ${levelAction}`,
      keyLevel:   ema9?.toFixed(0) || resistance?.toFixed(0),
    };
  }

  if (structure === 'Conflicted') {
    return {
      state:      'CONFLICTED',
      stateEmoji: '🔄',
      headline:   priceStructure.intradayBias === 'Bullish'
        ? `Intraday bullish but below EMA21 - counter-trend`
        : `Intraday bearish but above EMA21 - counter-trend`,
      action:     `Use tight stops. ${levelAction}`,
      keyLevel:   ema9?.toFixed(0) || primaryLevel?.toFixed(0),
    };
  }

  // Near levels (Neutral/default structure)
  if (levelAnalysis.actionableLevel?.type === 'SUPPORT_TEST') {
    return {
      state:      'AT SUPPORT',
      stateEmoji: '🛡️',
      headline:   levelContext,
      action:     levelAction,
      keyLevel:   support?.toFixed(0),
    };
  }

  if (levelAnalysis.actionableLevel?.type === 'RESISTANCE_TEST') {
    return {
      state:      'AT RESISTANCE',
      stateEmoji: '🚧',
      headline:   levelContext,
      action:     levelAction,
      keyLevel:   resistance?.toFixed(0),
    };
  }

  if (levelAnalysis.actionableLevel?.type === 'MAX_PAIN') {
    return {
      state:      'MAX PAIN ZONE',
      stateEmoji: '😴',
      headline:   levelContext,
      action:     levelAction,
      keyLevel:   primaryLevel?.toFixed(0),
    };
  }

  // Default rangebound
  return {
    state:      'RANGEBOUND',
    stateEmoji: '↔️',
    headline:   levelContext || `Trading in ${support}-${resistance} range`,
    action:     levelAction || `Trade support/resistance bounces or wait for clear direction.`,
    keyLevel:   primaryLevel?.toFixed(0),
  };
}

// ─────────────────────────────────────────────────────────────────────
// PRE-MARKET COMMENTARY (unchanged logic)
// ─────────────────────────────────────────────────────────────────────
function generatePreMarketCommentary(marketData, optionChain) {
  const prevClose  = parseFloat(marketData.indices?.niftyPrevClose || 0);
  const giftNifty  = parseFloat(marketData.indices?.giftNifty      || 0);
  const vix        = parseFloat(marketData.indices?.vix            || 0);

  // Gap = (GIFT Nifty − last session close) / last session close.
  // niftyLastSessionClose = always last trading day's close (Friday at 8 AM Monday).
  // niftyPrevClose outside market hours = day-before-last (Thursday) — used for the
  // Nifty ticker's change%, NOT for gap reference. Using it here showed Monday
  // pre-market gap vs Thursday instead of vs Friday.
  const gapRef = parseFloat(marketData.indices?.niftyLastSessionClose || 0) || prevClose;
  const gapPercent = (gapRef > 0 && giftNifty > 0) ? (giftNifty - gapRef) / gapRef * 100 : 0;
  const expectedOpen = gapRef * (1 + gapPercent / 100);

  const pcr         = optionChain?.pcr        || null;
  const support     = optionChain?.support    || null;
  const resistance  = optionChain?.resistance || null;
  const maxPain     = optionChain?.maxPain    || null;

  let state, stateEmoji, tradingBias, biasEmoji, headline, action, keyLevel;

  if (Math.abs(gapPercent) < 0.2) {
    state = 'FLAT OPENING'; stateEmoji = '➡️'; tradingBias = 'NEUTRAL'; biasEmoji = '🟡';
    headline = `Flat opening expected near ${expectedOpen.toFixed(0)}`;
    action   = `Wait for direction post 9:30 AM. Avoid early trades.`;
    keyLevel = prevClose.toFixed(0);
  } else if (gapPercent > 1.0) {
    state = 'BIG GAP UP'; stateEmoji = '🚀'; tradingBias = 'BULLISH'; biasEmoji = '🟢';
    headline = `Strong gap up at ${expectedOpen.toFixed(0)} (+${gapPercent.toFixed(2)}%)`;
    action   = `Wait for 9:30 AM consolidation. Don't chase. Enter longs if holds above ${prevClose.toFixed(0)}.`;
    keyLevel = prevClose.toFixed(0);
  } else if (gapPercent > 0.5) {
    state = 'GAP UP'; stateEmoji = '📈'; tradingBias = 'BULLISH'; biasEmoji = '🟢';
    headline = `Moderate gap up at ${expectedOpen.toFixed(0)} (+${gapPercent.toFixed(2)}%)`;
    action   = `Buy dips if sustains above ${prevClose.toFixed(0)}. Trail stops.`;
    keyLevel = prevClose.toFixed(0);
  } else if (gapPercent > 0) {
    state = 'SMALL GAP UP'; stateEmoji = '📈'; tradingBias = 'BULLISH'; biasEmoji = '🟢';
    headline = 'Small gap up expected - positive momentum';
    action   = 'Long on breakout above opening high. Watch for follow-through.';
    keyLevel = expectedOpen.toFixed(0);
  } else if (gapPercent < -1.0) {
    state = 'BIG GAP DOWN'; stateEmoji = '⚠️'; tradingBias = 'BEARISH'; biasEmoji = '🔴';
    headline = `Sharp gap down at ${expectedOpen.toFixed(0)} (${gapPercent.toFixed(2)}%)`;
    action   = 'Oversold bounce likely. Wait 30 min. Avoid panic selling.';
    keyLevel = expectedOpen.toFixed(0);
  } else if (gapPercent < -0.5) {
    state = 'GAP DOWN'; stateEmoji = '📉'; tradingBias = 'BEARISH'; biasEmoji = '🔴';
    headline = `Moderate gap down at ${expectedOpen.toFixed(0)} (${gapPercent.toFixed(2)}%)`;
    action   = `Sell rallies if fails to reclaim ${prevClose.toFixed(0)}. Book profits.`;
    keyLevel = prevClose.toFixed(0);
  } else {
    state = 'SMALL GAP DOWN'; stateEmoji = '📉'; tradingBias = 'BEARISH'; biasEmoji = '🔴';
    headline = 'Small gap down - weakness may continue';
    action   = 'Short on breakdown below opening low. Tight SL.';
    keyLevel = expectedOpen.toFixed(0);
  }

  // Enrich action with OI context
  const oiParts = [];
  if (support && resistance) oiParts.push(`OI levels: support ${support}, resistance ${resistance}`);
  else if (support)    oiParts.push(`OI put wall at ${support}`);
  else if (resistance) oiParts.push(`OI call wall at ${resistance}`);
  if (maxPain) oiParts.push(`max pain ${maxPain}`);
  if (oiParts.length) action = `${action} ${oiParts.join(', ')}.`;

  // Build warnings
  const warnings = [];
  if (vix > 20)  warnings.push(`⚠️ VIX ${vix.toFixed(1)} elevated — expect wider swings, reduce size`);
  if (pcr && pcr > 1.2 && tradingBias === 'BEARISH') warnings.push(`⚠️ PCR ${pcr.toFixed(2)} (heavy put writing) — shorts risky`);
  if (pcr && pcr < 0.8 && tradingBias === 'BULLISH') warnings.push(`⚠️ PCR ${pcr.toFixed(2)} (heavy call buying) — longs risky`);
  if (pcr && pcr > 1.2 && tradingBias !== 'BEARISH') warnings.push(`PCR ${pcr.toFixed(2)} — put writers defending, bullish lean`);
  if (pcr && pcr < 0.8 && tradingBias !== 'BULLISH') warnings.push(`PCR ${pcr.toFixed(2)} — call heavy, bearish lean`);

  return { state, stateEmoji, bias: tradingBias, biasEmoji, keyLevel, headline, action, warnings };
}

// ─────────────────────────────────────────────────────────────────────
// GET handler
// ─────────────────────────────────────────────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === '1';

    const CACHE_KEY    = `${NS}:market-commentary`;
    const marketIsOpen = isMarketOpen();

    if (!refresh) {
      const cached = await redisGet(CACHE_KEY);
      if (cached) {
        const age    = Date.now() - new Date(cached.timestamp).getTime();
        const maxAge = marketIsOpen ? 45_000 : 300_000;
        if (age < maxAge) {
          return NextResponse.json({ ...cached, fromCache: true });
        }
      }
    }

    const baseUrl = request.url.split('/api/')[0];

    // Parallel data fetch
    const [marketData, optionChainData] = await Promise.all([
      fetch(`${baseUrl}/api/market-data`).then(r => r.json()),
      fetch(`${baseUrl}/api/option-chain?underlying=NIFTY&expiry=weekly`).then(r => r.json()).catch(() => null),
    ]);

    let commentary;
    let dailyBias = null, fifteenMinBias = null;

    // Weekend check — markets are closed Sat/Sun; don't show a pre-market gap analysis
    const istNow  = getISTTime();
    const istDay  = istNow.getUTCDay(); // 0 = Sun, 6 = Sat
    const isWeekend = istDay === 0 || istDay === 6;

    if (marketIsOpen) {
      // Fetch Kite intraday candles + daily bias + 15m bias in parallel
      let intradayData = null;
      try {
        const dp = await getDataProvider();
        if (dp.isConnected()) {
          const [id, db, fb] = await Promise.all([
            fetchIntradayCandles(dp),
            fetchDailyBias(dp).catch(() => null),
            fetchFifteenMinBias(dp).catch(() => null),
          ]);
          intradayData    = id;
          dailyBias       = db;
          fifteenMinBias  = fb;
        }
      } catch {}

      // 5-min OI change tracking (best-effort)
      if (optionChainData?.totalCallOI && optionChainData?.totalPutOI) {
        const { callOIChange5min, putOIChange5min } = await getOIChange5Min(
          optionChainData.totalCallOI,
          optionChainData.totalPutOI
        );
        // Inject into optionChain for reversal detector
        optionChainData._callOIChange5min = callOIChange5min;
        optionChainData._putOIChange5min  = putOIChange5min;

        if (intradayData) {
          Object.assign(intradayData, { callOIChange5min, putOIChange5min });
        }
      }

      commentary = generateLiveCommentary(marketData, optionChainData, intradayData);
    } else if (isWeekend) {
      // Show last session summary — GIFT Nifty isn't trading, gap calc is meaningless
      const lastClose = marketData.indices?.nifty;
      const lastPct   = marketData.indices?.niftyChangePercent;
      const dow       = istDay === 0 ? 'Sunday' : 'Saturday';
      commentary = {
        state:      'MARKETS CLOSED',
        stateEmoji: '🔒',
        bias:       'Neutral',
        biasEmoji:  '🟡',
        keyLevel:   lastClose || '---',
        headline:   `${dow} — Markets closed. Nifty last at ${lastClose ?? '---'}${lastPct != null ? ` (${parseFloat(lastPct) >= 0 ? '+' : ''}${parseFloat(lastPct).toFixed(2)}%)` : ''}.`,
        action:     'Review your watchlist, plan trades for Monday. GIFT Nifty resumes Sunday evening.',
        warnings:   [],
      };
    } else {
      commentary = generatePreMarketCommentary(marketData, optionChainData);
    }

    // ── Bias history tracking — only during live market hours ─────────────
    // Pre-market commentary should never show intraday bias timestamps.
    if (marketIsOpen) {
      const BIAS_HISTORY_KEY = `${NS}:commentary:bias-history`;
      const allHistory  = (await redisGet(BIAS_HISTORY_KEY)) || [];
      // Filter to today's IST date only — yesterday's entries have a 24h TTL but must not show
      const todayIST    = getISTTime().toISOString().slice(0, 10);
      const prevHistory = allHistory.filter(e => e.timestamp?.slice(0, 10) === todayIST);
      if (!prevHistory[0] || prevHistory[0].bias !== commentary.bias) {
        const ist = getISTTime();
        const hh  = String(ist.getUTCHours()).padStart(2, '0');
        const mm  = String(ist.getUTCMinutes()).padStart(2, '0');
        const entry = { bias: commentary.bias, state: commentary.state, time: `${hh}:${mm}`, timestamp: new Date().toISOString() };
        const updated = [entry, ...prevHistory].slice(0, 5);
        await redisSet(BIAS_HISTORY_KEY, updated, 86400);
        commentary.biasHistory = updated;
      } else {
        commentary.biasHistory = prevHistory;
      }
    }

    // ── Pass advance/decline into commentary so clients get it in one fetch
    const sentiment = marketData?.sentiment;
    if (sentiment?.advances !== undefined) {
      commentary.advances = sentiment.advances;
      commentary.declines = sentiment.declines;
      commentary.advDecline = sentiment.advDecline;
    }

    const result = {
      success:      true,
      commentary,
      dailyBias,
      fifteenMinBias,
      method:       'rule-based',
      marketStatus: marketIsOpen ? 'OPEN' : 'PRE_MARKET',
      timestamp:    new Date().toISOString(),
    };

    await redisSet(CACHE_KEY, result, marketIsOpen ? 45 : 300);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Market commentary error:', error);

    return NextResponse.json({
      success: true,
      commentary: {
        state:      'LOADING',
        stateEmoji: '⏳',
        bias:       'NEUTRAL',
        biasEmoji:  '🟡',
        keyLevel:   null,
        headline:   'Market data loading...',
        action:     'Please wait',
        warnings:   [],
        reversal:   null,
      },
      error:     error.message,
      timestamp: new Date().toISOString(),
    }, { status: 200 });
  }
}
