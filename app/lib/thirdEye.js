// ─── Third Eye Engine ─────────────────────────────────────────────────────────
// Market intent state machine for Nifty intraday.
// Input : execution TF candles + bias TF candles + persisted engine state + options context + config.
// Output: { state, side, qualifier, longScore, shortScore, candlesInState, biasAlignment, features, keyLevels }
//
// Design principles:
//  - State transitions require 2 confirmed candle closes (except INVALIDATED/TRAPPED = 1 candle)
//  - Scores are EMA-smoothed before state evaluation — prevents single-candle spikes
//  - Qualifier (strengthening/holding/weakening/stretched) layers on state without flipping headline
//  - Candle-close only — no tick-level state changes
//  - Session phases gate or weight transitions
// ─────────────────────────────────────────────────────────────────────────────

import { computeVWAP, computeRSI, computeADX } from '@/app/lib/chart-indicators';

// ── Default config (overridden by user settings) ─────────────────────────────
export const DEFAULT_CONFIG = {
  adxStrong:            25,   // ADX ≥ this → full trend score
  adxForming:           20,   // ADX ≥ this → partial trend score
  rsiBull:              60,   // RSI ≥ this → bullish momentum
  rsiBear:              40,   // RSI ≤ this → bearish momentum
  candleStrengthImpulsive: 1.2, // body/ATR ≥ this → impulsive
  candleStrengthWeak:   0.5,  // body/ATR ≤ this → noise/doji
  confirmationCandles:  2,    // closes required before state transition
  scoreSmoothing:       3,    // EMA period for score smoothing
  staleGuardCandles:    8,    // candles before "no new catalyst" note
  buildingThreshold:    55,   // smoothed score to enter BUILDING
  confirmedThreshold:   65,   // smoothed score to enter CONFIRMED
  continuingThreshold:  60,   // smoothed score to sustain CONTINUING
  exhaustedZoneHigh:    55,   // dominant score ≤ this → enter exhaustion zone
  exhaustedZoneLow:     40,
  invalidationScore:    65,   // opposite score ≥ this → INVALIDATED (1 candle)
  rangingThreshold:     35,   // both scores ≤ this for rangingMinCandles → RANGING
  rangingMinCandles:    3,
  pullbackRetrace:      0.50, // price retraces ≤ this fraction → healthy pullback
};

// ── States ────────────────────────────────────────────────────────────────────
export const STATES = {
  NEUTRAL:          'NEUTRAL',
  BUILDING_LONG:    'BUILDING_LONG',
  BUILDING_SHORT:   'BUILDING_SHORT',
  CONFIRMED_LONG:   'CONFIRMED_LONG',
  CONFIRMED_SHORT:  'CONFIRMED_SHORT',
  CONTINUING_LONG:  'CONTINUING_LONG',
  CONTINUING_SHORT: 'CONTINUING_SHORT',
  PULLBACK_LONG:    'PULLBACK_LONG',    // retracing in a long trend
  PULLBACK_SHORT:   'PULLBACK_SHORT',   // retracing in a short trend
  DEEP_PULLBACK_LONG:  'DEEP_PULLBACK_LONG',
  DEEP_PULLBACK_SHORT: 'DEEP_PULLBACK_SHORT',
  EXHAUSTED_LONG:   'EXHAUSTED_LONG',
  EXHAUSTED_SHORT:  'EXHAUSTED_SHORT',
  INVALIDATED:      'INVALIDATED',
  TRAPPED_LONG:     'TRAPPED_LONG',
  TRAPPED_SHORT:    'TRAPPED_SHORT',
  RANGING:          'RANGING',
};

export function getSide(state) {
  if (state.includes('LONG'))  return 'long';
  if (state.includes('SHORT')) return 'short';
  return 'neutral';
}

// ── IST helpers ───────────────────────────────────────────────────────────────
function istHHMM(unixSec) {
  const d = new Date((unixSec + 5.5 * 3600) * 1000);
  return d.getUTCHours() * 100 + d.getUTCMinutes();
}

function sessionPhase(unixSec) {
  const t = istHHMM(unixSec);
  if (t < 915 || t >= 1530)  return 'closed';
  if (t < 930)               return 'opening';   // 9:15–9:30
  if (t < 1130)              return 'primary';   // 9:30–11:30
  if (t < 1300)              return 'lull';      // 11:30–13:00
  if (t < 1500)              return 'secondary'; // 13:00–15:00
  return 'close';                                // 15:00–15:30
}

// Session weight modifier on scores (0.0–1.0 multiplier)
function sessionWeight(phase) {
  return { opening: 0.7, primary: 1.0, lull: 0.8, secondary: 1.0, close: 0.6, closed: 0.0 }[phase] ?? 1.0;
}

// ── ATR computation ───────────────────────────────────────────────────────────
// Simple Wilder ATR aligned to candle array
function computeATR(candles, period = 14) {
  const n   = candles.length;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  let atr = sum / period;
  out[period] = atr;
  for (let i = period + 1; i < n; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    atr = (atr * (period - 1) + tr) / period;
    out[i] = parseFloat(atr.toFixed(2));
  }
  return out;
}

// ── EMA (price) ───────────────────────────────────────────────────────────────
// Seeds with SMA of first `period` candles, then applies Wilder-style EMA.
function computeEMA(candles, period) {
  const n     = candles.length;
  const out   = new Array(n).fill(null);
  if (n < period) return out;
  const alpha = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  out[period - 1] = parseFloat(ema.toFixed(2));
  for (let i = period; i < n; i++) {
    ema = alpha * candles[i].close + (1 - alpha) * ema;
    out[i] = parseFloat(ema.toFixed(2));
  }
  return out;
}

// ── Swing high/low (simple lookback) ─────────────────────────────────────────
function recentSwings(candles, lookback = 20) {
  const slice = candles.slice(-lookback);
  const swingHigh = Math.max(...slice.map(c => c.high));
  const swingLow  = Math.min(...slice.map(c => c.low));
  return { swingHigh, swingLow };
}

// ── EMA smoothing on a running value ─────────────────────────────────────────
function emaStep(prev, current, period) {
  if (prev == null) return current;
  const k = 2 / (period + 1);
  return prev * (1 - k) + current * k;
}

// ── Feature engineering ───────────────────────────────────────────────────────
// Returns per-candle feature object for the LAST candle in the array.
function computeFeatures(candles, config) {
  const n  = candles.length;
  const c  = candles[n - 1];
  const phase = sessionPhase(c.time);

  // Indicators (full arrays, we use last values)
  const vwapArr  = computeVWAP(candles);
  const rsiArr   = computeRSI(candles, 14);
  const adxData  = computeADX(candles, 14);
  const atrArr   = computeATR(candles, 14);
  const ema9Arr  = computeEMA(candles, 9);
  const ema21Arr = computeEMA(candles, 21);

  const vwap = vwapArr[n - 1]?.value ?? null;
  const rsi  = rsiArr[n - 1];
  const adx  = adxData.adx[n - 1];
  const pdi  = adxData.plusDI[n - 1];
  const mdi  = adxData.minusDI[n - 1];
  const atr  = atrArr[n - 1];
  const prevAtr = atrArr[n - 2];
  const ema9  = ema9Arr[n - 1];
  const ema21 = ema21Arr[n - 1];

  // ADX trend: look 3 candles back to determine rising/falling
  const adxPrev3 = adxData.adx[n - 4] ?? adxData.adx[n - 2];
  const adxRising = adx != null && adxPrev3 != null && adx > adxPrev3;

  // ATR regime
  const atrExpanding = atr != null && prevAtr != null && atr > prevAtr;

  // Candle body
  const body   = Math.abs(c.close - c.open);
  const candleStrength = (atr && atr > 0) ? body / atr : 0;
  const direction = body < 0.1 * (c.high - c.low) ? 'doji'
    : c.close >= c.open ? 'bull' : 'bear';

  // VWAP context
  const vwapAbove    = vwap != null ? c.close > vwap : null;
  const vwapDistance = (vwap != null && atr && atr > 0) ? Math.abs(c.close - vwap) / atr : null;

  // Recent candle profile (avg body/ATR of last 3 candles, excluding current)
  let profileSum = 0, profileCount = 0;
  for (let i = Math.max(0, n - 4); i < n - 1; i++) {
    const cb = Math.abs(candles[i].close - candles[i].open);
    const ca = atrArr[i];
    if (ca && ca > 0) { profileSum += cb / ca; profileCount++; }
  }
  const recentProfile = profileCount > 0 ? profileSum / profileCount : candleStrength;
  const relativeStrength = recentProfile > 0 ? candleStrength / recentProfile : 1;

  // Swing levels (last 20 candles)
  const { swingHigh, swingLow } = recentSwings(candles, 20);

  // Pullback detection: compare current close vs the swing move
  const moveRange = swingHigh - swingLow;
  const pullbackFromHigh = moveRange > 0 ? (swingHigh - c.close) / moveRange : 0;
  const pullbackFromLow  = moveRange > 0 ? (c.close - swingLow)  / moveRange : 0;

  // ── ATR expansion zone ────────────────────────────────────────────────────
  // Day open = first candle's open for today's IST session (≥ 09:15)
  const dayStartSec = (() => {
    const istMs = (c.time + 5.5 * 3600) * 1000;
    const ist   = new Date(istMs);
    return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 3, 45)).getTime() / 1000; // 09:15 IST = 03:45 UTC
  })();
  const firstTodayIdx = candles.findIndex(x => x.time >= dayStartSec);
  const dayOpen = firstTodayIdx >= 0 ? candles[firstTodayIdx].open : null;

  const atrExpansionHigh = (dayOpen && atr) ? parseFloat((dayOpen + atr).toFixed(1)) : null;
  const atrExpansionLow  = (dayOpen && atr) ? parseFloat((dayOpen - atr).toFixed(1)) : null;
  const aboveExpansion   = atrExpansionHigh != null ? c.close > atrExpansionHigh : false;
  const belowExpansion   = atrExpansionLow  != null ? c.close < atrExpansionLow  : false;

  // Volume spike: current candle volume > 1.5× avg of last 10 candles
  // (volume is futures volume when the scan route overlays futures candles)
  const volSlice = candles.slice(Math.max(0, n - 11), n - 1);
  const avgVol   = volSlice.length > 0
    ? volSlice.reduce((s, x) => s + (x.volume ?? 0), 0) / volSlice.length
    : 0;
  const volumeSpike = (c.volume && avgVol > 0) ? c.volume > avgVol * 1.5 : false;

  return {
    time:            c.time,
    close:           c.close,
    high:            c.high,
    low:             c.low,
    vwap,
    vwapAbove,
    vwapDistance:    vwapDistance ? parseFloat(vwapDistance.toFixed(2)) : null,
    rsi:             rsi   != null ? parseFloat(rsi.toFixed(1))  : null,
    adx:             adx   != null ? parseFloat(adx.toFixed(1))  : null,
    plusDI:          pdi   != null ? parseFloat(pdi.toFixed(1))  : null,
    minusDI:         mdi   != null ? parseFloat(mdi.toFixed(1))  : null,
    adxRising,
    atr:             atr   != null ? parseFloat(atr.toFixed(1))  : null,
    atrExpanding,
    candleStrength:  parseFloat(candleStrength.toFixed(2)),
    direction,
    recentProfile:   parseFloat(recentProfile.toFixed(2)),
    relativeStrength: parseFloat(relativeStrength.toFixed(2)),
    swingHigh,
    swingLow,
    pullbackFromHigh: parseFloat(pullbackFromHigh.toFixed(2)),
    pullbackFromLow:  parseFloat(pullbackFromLow.toFixed(2)),
    sessionPhase:    phase,
    sessionWeight:   sessionWeight(phase),
    // ATR expansion zone
    dayOpen,
    atrExpansionHigh,
    atrExpansionLow,
    aboveExpansion,
    belowExpansion,
    volumeSpike,
    ema9:        ema9  != null ? parseFloat(ema9.toFixed(1))  : null,
    ema21:       ema21 != null ? parseFloat(ema21.toFixed(1)) : null,
    aboveEma9:   ema9  != null ? c.close > ema9  : null,
    aboveEma21:  ema21 != null ? c.close > ema21 : null,
  };
}

// ── Bias TF summary ───────────────────────────────────────────────────────────
function computeBiasSummary(biasCandles) {
  if (!biasCandles || biasCandles.length < 20) return { bias: 'neutral', rsi: null, adx: null, vwapAbove: null };
  const n     = biasCandles.length;
  const vwap  = computeVWAP(biasCandles);
  const rsi   = computeRSI(biasCandles, 14);
  const adxD  = computeADX(biasCandles, 14);

  const lastVwap = vwap[n - 1]?.value;
  const lastClose = biasCandles[n - 1].close;
  const lastRsi   = rsi[n - 1];
  const lastAdx   = adxD.adx[n - 1];
  const vwapAbove = lastVwap != null ? lastClose > lastVwap : null;

  let bias = 'neutral';
  if (vwapAbove && lastRsi != null && lastRsi > 55) bias = 'bullish';
  if (!vwapAbove && lastRsi != null && lastRsi < 45) bias = 'bearish';

  return {
    bias,
    rsi:       lastRsi   != null ? parseFloat(lastRsi.toFixed(1)) : null,
    adx:       lastAdx   != null ? parseFloat(lastAdx.toFixed(1)) : null,
    vwapAbove,
  };
}

// ── Raw score computation ─────────────────────────────────────────────────────
function computeRawScore(features, side, optionsCtx, config) {
  const isLong = side === 'long';
  let score = 0;

  // VWAP position (20 pts)
  if (features.vwapAbove === isLong) score += 20;
  else if (features.vwapAbove === null) score += 10; // no VWAP data

  // Candle strength — only credit direction-matching candles (20 pts)
  const dirMatch = (isLong && features.direction === 'bull') || (!isLong && features.direction === 'bear');
  if (dirMatch) {
    score += Math.min(features.candleStrength / (config.candleStrengthImpulsive * 1.5), 1.0) * 20;
  }

  // RSI (15 pts)
  if (features.rsi != null) {
    if (isLong) {
      if (features.rsi >= config.rsiBull)     score += 15;
      else if (features.rsi >= 50)            score += 8;
      else if (features.rsi < config.rsiBear) score += 0; // opposing
    } else {
      if (features.rsi <= config.rsiBear)     score += 15;
      else if (features.rsi <= 50)            score += 8;
      else if (features.rsi > config.rsiBull) score += 0;
    }
  } else {
    score += 7; // no data → neutral
  }

  // ADX (15 pts) — trend strength, direction-neutral
  if (features.adx != null) {
    if (features.adx >= config.adxStrong)     score += 15;
    else if (features.adx >= config.adxForming) score += 8;
    // Below forming → 0
    // Bonus if DI lines aligned with direction
    if (features.plusDI != null && features.minusDI != null) {
      if (isLong  && features.plusDI  > features.minusDI + 5) score += 2;
      if (!isLong && features.minusDI > features.plusDI  + 5) score += 2;
    }
  } else {
    score += 5;
  }

  // ATR regime (10 pts)
  score += features.atrExpanding ? 10 : 4;

  // Options / PCR (20 pts base)
  if (optionsCtx?.available) {
    const adj = isLong ? optionsCtx.longScoreAdj : optionsCtx.shortScoreAdj;
    score += 10 + adj; // 10 base + adjustment
  } else {
    score += 10; // neutral when options unavailable
  }

  // Session weight — scales raw score
  score = score * features.sessionWeight;

  return Math.round(Math.min(Math.max(score, 0), 100));
}

// ── State transition logic ────────────────────────────────────────────────────
function resolveTransition(prevState, sLong, sShort, features, pending, config) {
  const dom     = sLong >= sShort ? 'long' : 'short';
  const domScore = Math.max(sLong, sShort);
  const recScore = Math.min(sLong, sShort);
  const side     = getSide(prevState);

  // 1. INVALIDATION — single candle, highest priority (only for active states)
  const activeStates = ['BUILDING_LONG','CONFIRMED_LONG','CONTINUING_LONG','PULLBACK_LONG','DEEP_PULLBACK_LONG','EXHAUSTED_LONG',
                        'BUILDING_SHORT','CONFIRMED_SHORT','CONTINUING_SHORT','PULLBACK_SHORT','DEEP_PULLBACK_SHORT','EXHAUSTED_SHORT'];
  if (activeStates.includes(prevState)) {
    const oppScore = side === 'long' ? sShort : sLong;
    const vwapFlipped = side === 'long' ? features.vwapAbove === false : features.vwapAbove === true;
    if (oppScore >= config.invalidationScore && vwapFlipped) {
      return { state: 'INVALIDATED', pending: null };
    }
  }

  // 2. TRAP — single candle: building/confirmed state but dominant score collapses fast + opposite direction candle
  if (['BUILDING_LONG','CONFIRMED_LONG'].includes(prevState)) {
    if (features.direction === 'bear' && features.relativeStrength > 1.3 && !features.vwapAbove) {
      return { state: 'TRAPPED_LONG', pending: null };
    }
  }
  if (['BUILDING_SHORT','CONFIRMED_SHORT'].includes(prevState)) {
    if (features.direction === 'bull' && features.relativeStrength > 1.3 && features.vwapAbove) {
      return { state: 'TRAPPED_SHORT', pending: null };
    }
  }

  // 3. RANGING — 3 consecutive candles with both scores low (tracked via pending)
  if (sLong < config.rangingThreshold && sShort < config.rangingThreshold) {
    const rangingCount = (pending?.type === 'RANGING' ? pending.count : 0) + 1;
    if (rangingCount >= config.rangingMinCandles) {
      return { state: 'RANGING', pending: null };
    }
    return { state: prevState, pending: { type: 'RANGING', count: rangingCount } };
  }

  // Helper: 2-candle confirmation gate
  function twoCandle(targetState) {
    if (pending?.type === targetState) {
      if (pending.count + 1 >= config.confirmationCandles) {
        return { state: targetState, pending: null };
      }
      return { state: prevState, pending: { type: targetState, count: pending.count + 1 } };
    }
    return { state: prevState, pending: { type: targetState, count: 1 } };
  }

  // 4. NEUTRAL → BUILDING
  if (prevState === 'NEUTRAL' || prevState === 'RANGING' || prevState === 'INVALIDATED' ||
      prevState === 'TRAPPED_LONG' || prevState === 'TRAPPED_SHORT') {
    if (domScore >= config.buildingThreshold && features.sessionPhase !== 'closed') {
      const target = dom === 'long' ? 'BUILDING_LONG' : 'BUILDING_SHORT';
      // Suppress in opening phase (flag but allow)
      return twoCandle(target);
    }
    return { state: prevState === 'INVALIDATED' || prevState.startsWith('TRAPPED') ? 'NEUTRAL' : prevState, pending: null };
  }

  // 5. BUILDING → CONFIRMED (2 candles)
  if (prevState === 'BUILDING_LONG') {
    if (dom === 'long' && domScore >= config.confirmedThreshold && features.adxRising) {
      return twoCandle('CONFIRMED_LONG');
    }
    if (dom === 'short' || domScore < config.buildingThreshold) {
      return { state: 'NEUTRAL', pending: null };
    }
  }
  if (prevState === 'BUILDING_SHORT') {
    if (dom === 'short' && domScore >= config.confirmedThreshold && features.adxRising) {
      return twoCandle('CONFIRMED_SHORT');
    }
    if (dom === 'long' || domScore < config.buildingThreshold) {
      return { state: 'NEUTRAL', pending: null };
    }
  }

  // 6. CONFIRMED → CONTINUING (2 candles)
  if (prevState === 'CONFIRMED_LONG') {
    if (dom === 'long' && domScore >= config.continuingThreshold) return twoCandle('CONTINUING_LONG');
    if (dom === 'short' || domScore < config.buildingThreshold)   return twoCandle('EXHAUSTED_LONG');
  }
  if (prevState === 'CONFIRMED_SHORT') {
    if (dom === 'short' && domScore >= config.continuingThreshold) return twoCandle('CONTINUING_SHORT');
    if (dom === 'long'  || domScore < config.buildingThreshold)    return twoCandle('EXHAUSTED_SHORT');
  }

  // 7. CONTINUING ↔ PULLBACK ↔ EXHAUSTED
  if (prevState === 'CONTINUING_LONG') {
    // VWAP-hold override: 2 consecutive candles below VWAP while LONG → exit trend
    // (VWAP position is more reliable than lagging composite score)
    if (features.vwapAbove === false) {
      const n = (pending?.type === 'VWAP_HOLD_LONG' ? pending.count : 0) + 1;
      if (n >= 2) return { state: 'EXHAUSTED_LONG', pending: null };
      return { state: prevState, pending: { type: 'VWAP_HOLD_LONG', count: n } };
    }
    if (domScore >= config.continuingThreshold && dom === 'long') return { state: 'CONTINUING_LONG', pending: null };
    // Pullback: price retracing but structure intact
    if (features.pullbackFromHigh > 0.1 && features.pullbackFromHigh <= config.pullbackRetrace && features.vwapAbove !== false) {
      return twoCandle('PULLBACK_LONG');
    }
    if (domScore <= config.exhaustedZoneHigh) return twoCandle('EXHAUSTED_LONG');
  }
  if (prevState === 'CONTINUING_SHORT') {
    // VWAP-hold override: 2 consecutive candles above VWAP while SHORT → exit trend
    if (features.vwapAbove === true) {
      const n = (pending?.type === 'VWAP_HOLD_SHORT' ? pending.count : 0) + 1;
      if (n >= 2) return { state: 'EXHAUSTED_SHORT', pending: null };
      return { state: prevState, pending: { type: 'VWAP_HOLD_SHORT', count: n } };
    }
    if (domScore >= config.continuingThreshold && dom === 'short') return { state: 'CONTINUING_SHORT', pending: null };
    if (features.pullbackFromLow > 0.1 && features.pullbackFromLow <= config.pullbackRetrace && features.vwapAbove !== true) {
      return twoCandle('PULLBACK_SHORT');
    }
    if (domScore <= config.exhaustedZoneHigh) return twoCandle('EXHAUSTED_SHORT');
  }

  // 8. PULLBACK → CONTINUING or DEEP_PULLBACK
  if (prevState === 'PULLBACK_LONG') {
    if (dom === 'long' && domScore >= config.continuingThreshold) return twoCandle('CONTINUING_LONG');
    if (features.pullbackFromHigh > config.pullbackRetrace)       return twoCandle('DEEP_PULLBACK_LONG');
    if (domScore <= config.exhaustedZoneHigh)                     return twoCandle('EXHAUSTED_LONG');
  }
  if (prevState === 'PULLBACK_SHORT') {
    if (dom === 'short' && domScore >= config.continuingThreshold) return twoCandle('CONTINUING_SHORT');
    if (features.pullbackFromLow > config.pullbackRetrace)         return twoCandle('DEEP_PULLBACK_SHORT');
    if (domScore <= config.exhaustedZoneHigh)                      return twoCandle('EXHAUSTED_SHORT');
  }

  // 9. DEEP_PULLBACK → EXHAUSTED or recovery
  if (prevState === 'DEEP_PULLBACK_LONG') {
    if (dom === 'long' && domScore >= config.confirmedThreshold && features.vwapAbove) return twoCandle('CONTINUING_LONG');
    return twoCandle('EXHAUSTED_LONG');
  }
  if (prevState === 'DEEP_PULLBACK_SHORT') {
    if (dom === 'short' && domScore >= config.confirmedThreshold && !features.vwapAbove) return twoCandle('CONTINUING_SHORT');
    return twoCandle('EXHAUSTED_SHORT');
  }

  // 10. EXHAUSTED → INVALIDATED or hang
  if (prevState === 'EXHAUSTED_LONG' || prevState === 'EXHAUSTED_SHORT') {
    // Already handled invalidation above; just stay exhausted or clear to neutral
    if (domScore < config.exhaustedZoneLow) return { state: 'NEUTRAL', pending: null };
  }

  // Default: stay in current state, reset any non-matching pending
  const newPending = pending?.type === (pending?.type) ? pending : null;
  return { state: prevState, pending: newPending };
}

// ── Qualifier ─────────────────────────────────────────────────────────────────
function computeQualifier(state, sLong, sShort, features, prevSmoothed, config) {
  const side = getSide(state);
  if (side === 'neutral') return 'neutral';

  const domScore = side === 'long' ? sLong : sShort;
  const prevDom  = prevSmoothed ? (side === 'long' ? prevSmoothed.long : prevSmoothed.short) : domScore;

  const scoreDelta = domScore - prevDom;

  // Stretched: VWAP distance very extended
  if (features.vwapDistance != null && features.vwapDistance > 2.0) return 'stretched';

  // Strengthening
  if (scoreDelta > 4 && features.adxRising && features.atrExpanding) return 'strengthening';
  if (scoreDelta > 6) return 'strengthening';

  // Weakening
  if (scoreDelta < -4) return 'weakening';
  if (!features.adxRising && features.adx != null && features.adx < config.adxForming) return 'weakening';

  return 'holding';
}

// ── Bias TF alignment ─────────────────────────────────────────────────────────
function computeBiasAlignment(state, biasSummary) {
  const side  = getSide(state);
  if (side === 'neutral') return { aligned: null, label: '—' };
  const match = (side === 'long' && biasSummary.bias === 'bullish') ||
                (side === 'short' && biasSummary.bias === 'bearish');
  const counter = (side === 'long' && biasSummary.bias === 'bearish') ||
                  (side === 'short' && biasSummary.bias === 'bullish');
  return {
    aligned: match,
    counter,
    label: match ? '✓ aligned' : counter ? '✗ counter-trend' : '~ neutral',
  };
}

// ── Main engine entry ─────────────────────────────────────────────────────────
// `prevEngineState` is the Redis-persisted object from the last scan.
export function runThirdEye(executionCandles, biasCandles, prevEngineState, optionsCtx, config = DEFAULT_CONFIG) {
  if (!executionCandles || executionCandles.length < 30) {
    return { error: 'Insufficient candle data', state: 'NEUTRAL', side: 'neutral' };
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Feature engineering on execution TF (last candle = current)
  const features = computeFeatures(executionCandles, cfg);

  // Bias TF summary
  const biasSummary = computeBiasSummary(biasCandles);

  // Raw scores for this candle
  const rawLong  = computeRawScore(features, 'long',  optionsCtx, cfg);
  const rawShort = computeRawScore(features, 'short', optionsCtx, cfg);

  // EMA-smooth scores using persisted buffer
  const buf       = prevEngineState?.smoothingBuffer ?? [];
  const prevEmaL  = prevEngineState?.smoothedLong  ?? rawLong;
  const prevEmaS  = prevEngineState?.smoothedShort ?? rawShort;
  const sLong     = Math.round(emaStep(prevEmaL, rawLong,  cfg.scoreSmoothing));
  const sShort    = Math.round(emaStep(prevEmaS, rawShort, cfg.scoreSmoothing));

  // State transition
  const prevState   = prevEngineState?.state    ?? 'NEUTRAL';
  const prevPending = prevEngineState?.pending   ?? null;
  const { state: newState, pending: newPending } = resolveTransition(
    prevState, sLong, sShort, features, prevPending, cfg
  );

  // ── Candles in state & Timing
  // Significant: Only increment when a NEW candle timestamp is detected in the input series.
  // Prevents "fake duration" when scanning more frequently than the candle timeframe (e.g. every 30s on 5m chart).
  const isNewCandle = features.time !== prevEngineState?.features?.time;
  const isNewState  = newState !== prevState;

  const candlesInState = isNewState
    ? 1
    : (isNewCandle ? (prevEngineState?.candlesInState ?? 0) + 1 : (prevEngineState?.candlesInState ?? 1));

  const stateStartTime = isNewState
    ? features.time
    : (prevEngineState?.stateStartTime ?? features.time);

  // Qualifier
  const qualifier = computeQualifier(
    newState, sLong, sShort, features,
    prevEngineState ? { long: prevEngineState.smoothedLong, short: prevEngineState.smoothedShort } : null,
    cfg
  );

  // Bias alignment
  const biasAlignment = computeBiasAlignment(newState, biasSummary);

  // Key levels for commentary
  const keyLevels = {
    vwap:      features.vwap,
    swingHigh: features.swingHigh,
    swingLow:  features.swingLow,
    close:     features.close,
    callWall:  optionsCtx?.callWall  ?? null,
    putWall:   optionsCtx?.putWall   ?? null,
    maxPain:   optionsCtx?.maxPain   ?? null,
  };

  // Persisted state for next scan
  const nextEngineState = {
    state:          newState,
    side:           getSide(newState),
    pending:        newPending,
    candlesInState,
    stateStartTime,
    smoothedLong:   sLong,
    smoothedShort:  sShort,
    smoothingBuffer: [...buf.slice(-2), { long: rawLong, short: rawShort }],
    qualifier,
    features,       // last candle features
    biasAlignment,
    biasSummary,
    keyLevels,
    timestamp:      Date.now(),
  };

  return {
    ...nextEngineState,
    rawLong,
    rawShort,
    optionsCtx,
  };
}
