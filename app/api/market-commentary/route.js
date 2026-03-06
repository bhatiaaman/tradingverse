// ═══════════════════════════════════════════════════════════════════════
// MARKET COMMENTARY - 3-Layer Architecture
// Layer 1: Data Collection (price + options + intraday candles + time)
// Layer 2: Analysis Engine (structure, OI, levels, time, conflicts)
// Layer 3: Commentary Generator (reversal-aware, trader-friendly output)
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { getKiteCredentials } from '@/app/lib/kite-credentials';
import { detectReversalZone } from './lib/reversal-detector.js';

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

// ─────────────────────────────────────────────────────────────────────
// Kite 5-minute intraday candles (today only)
// ─────────────────────────────────────────────────────────────────────
async function fetchIntradayCandles(apiKey, accessToken) {
  try {
    const toDate   = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 2);

    const fmt = (d) => {
      const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
      return ist.toISOString().slice(0, 19).replace('T', ' ');
    };

    const url = `https://api.kite.trade/instruments/historical/${NIFTY_TOKEN}/5minute?from=${encodeURIComponent(fmt(fromDate))}&to=${encodeURIComponent(fmt(toDate))}`;
    const res = await fetch(url, {
      headers: {
        'X-Kite-Version': '3',
        Authorization: `token ${apiKey}:${accessToken}`,
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
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

    return {
      rsi:           calcRSI(closes),
      rsiHistory:    calcRSIHistory(closes, 14, 5),
      vwap:          calcVWAP(todayCandles),
      ema21:         calcEMA(closes, 21),
      volumeAvg:     volAvg,
      volumeCurrent: volCurrent,
      volumeSpike,
      lastCandle,
      change5min,
      trendDirection,
    };
  } catch (err) {
    console.error('[commentary] Intraday candles error:', err.message);
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

function generateLiveCommentary(marketData, optionChain, intraday) {
  const spot        = parseFloat(marketData.indices?.nifty          || 0);
  const prevClose   = parseFloat(marketData.indices?.niftyPrevClose || spot);
  const niftyHigh   = parseFloat(marketData.indices?.niftyHigh      || spot);
  const niftyLow    = parseFloat(marketData.indices?.niftyLow       || spot);
  const ema9        = parseFloat(marketData.indices?.niftyEMA9      || 0) || null;
  const vix         = parseFloat(marketData.indices?.vix             || 0);

  const pcr         = optionChain?.pcr         || null;
  const support     = optionChain?.support     || niftyLow;
  const resistance  = optionChain?.resistance  || niftyHigh;
  const maxPain     = optionChain?.maxPain     || null;
  const marketActivity = optionChain?.marketActivity || null;

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
    indicators: { rsi, rsiHistory },
    volume:     {
      current:    intraday?.volumeCurrent || 0,
      avg:        intraday?.volumeAvg     || 0,
      lastCandle: intraday?.lastCandle    || null,
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

  // ── Priority 1: High-confidence reversal zone ──
  if (reversalResult.reversalZone && reversalResult.confidence === 'HIGH') {
    const rc = reversalResult.commentary;
    return {
      state:           rc.state,
      stateEmoji:      rc.stateEmoji || '🔄',
      bias:            reversalResult.direction === 'BULLISH' ? 'BULLISH' : reversalResult.direction === 'BEARISH' ? 'BEARISH' : 'NEUTRAL',
      biasEmoji:       reversalResult.direction === 'BULLISH' ? '🟢' : reversalResult.direction === 'BEARISH' ? '🔴' : '🟡',
      keyLevel:        levelAnalysis.primaryLevel?.toFixed(0) || prevClose.toFixed(0),
      headline:        rc.headline,
      action:          rc.action,
      timeNotes:       timeContext.tradingNotes,
      warnings,
      reversal:        reversalResult,
      structure:       priceStructure.structure,
      positionInRange: priceStructure.positionInRange?.toFixed(0),
    };
  }

  // ── Priority 2: OI-activity based (High/Moderate conviction) ──
  let state, stateEmoji, headline, action, keyLevel;

  if (oiActivity.conviction !== 'Low' && marketActivity?.activity && marketActivity.activity !== 'Consolidation') {
    const activity = marketActivity.activity;
    ({ state, stateEmoji, headline, action, keyLevel } = buildOIStateCommentary(
      activity, oiActivity, levelAnalysis, support, resistance
    ));
  } else {
    // ── Priority 3: Price structure based ──
    ({ state, stateEmoji, headline, action, keyLevel } = buildPriceStateCommentary(
      ema9, vwap, priceStructure, levelAnalysis, support, resistance
    ));
  }

  // Append conflict implication to action if present
  if (hasConflicts && conflicts[0].implication) {
    action = `⚠️ ${conflicts[0].implication}. ${action}`;
  }

  // Medium-confidence reversal: add to warnings only — never mix into action text
  if (reversalResult.reversalZone && reversalResult.confidence === 'MEDIUM') {
    warnings.push(`🔄 ${reversalResult.commentary.state}: ${reversalResult.commentary.headline}. ${reversalResult.commentary.action}`);
  }

  return {
    state,
    stateEmoji,
    bias,
    biasEmoji,
    keyLevel:        keyLevel || prevClose.toFixed(0),
    headline,
    action,
    timeNotes:       timeContext.tradingNotes,
    warnings,
    reversal:        reversalResult.reversalZone ? reversalResult : null,
    structure:       priceStructure.structure,
    positionInRange: priceStructure.positionInRange?.toFixed(0),
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

  // Use Gift Nifty's own % change (from its own prev close) applied to Nifty's prev close.
  // Fallback: if giftNiftyChangePercent unavailable, approximate via price diff.
  const giftNiftyChangePct = parseFloat(marketData.indices?.giftNiftyChangePercent || 0);
  const gapPercent   = giftNiftyChangePct || (prevClose ? (giftNifty - prevClose) / prevClose * 100 : 0);
  const expectedOpen = prevClose * (1 + gapPercent / 100);

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
        const maxAge = marketIsOpen ? 60_000 : 300_000;
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

    if (marketIsOpen) {
      // Fetch Kite intraday candles for RSI / VWAP / EMA21 / volume
      let intradayData = null;
      try {
        const { apiKey, accessToken } = await getKiteCredentials();
        if (apiKey && accessToken) {
          intradayData = await fetchIntradayCandles(apiKey, accessToken);
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
    } else {
      commentary = generatePreMarketCommentary(marketData, optionChainData);
    }

    // ── Bias history tracking (persists across cache refreshes) ───────────
    const BIAS_HISTORY_KEY = `${NS}:commentary:bias-history`;
    const prevHistory = (await redisGet(BIAS_HISTORY_KEY)) || [];
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
      method:       'rule-based',
      marketStatus: marketIsOpen ? 'OPEN' : 'PRE_MARKET',
      timestamp:    new Date().toISOString(),
    };

    await redisSet(CACHE_KEY, result, marketIsOpen ? 60 : 300);

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
