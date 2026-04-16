// ── Human Eye — Pattern Observer Engine ──────────────────────────────────────
// Architecture:
//   1. precompute()       — runs once per scan, all expensive calculations
//   2. detectPatterns()   — uses precomputed data, no re-scanning
//   3. buildContext()     — assembles context object from precomputed data
//   4. detectSetups()     — multi-condition setups (S1–S18)
//   5. scoreSetup()       — adds context bonuses to setup base strength
//   6. runThirdEye()      — orchestrates all layers


// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function getSessionTime(candles) {
  if (!candles?.length) return 'midday';
  const ts  = candles[candles.length - 1].time;
  const ist = new Date((ts + 5.5 * 3600) * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (mins < 555)  return 'premarket';
  if (mins <= 555) return 'opening';    // 9:15 candle only (closes at 9:29)
  if (mins < 870)  return 'midday';    // 9:30 onwards
  if (mins <= 930) return 'closing';   // 14:30–15:30
  return 'postmarket';
}

function findSwingPivots(candles, strength = 3) {
  const highs = [], lows = [];
  for (let i = strength; i < candles.length - strength; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= strength; j++) {
      if (candles[i - j].high >= candles[i].high || candles[i + j].high >= candles[i].high) isHigh = false;
      if (candles[i - j].low  <= candles[i].low  || candles[i + j].low  <= candles[i].low)  isLow  = false;
    }
    if (isHigh) highs.push({ idx: i, price: candles[i].high });
    if (isLow)  lows.push({ idx: i, price: candles[i].low });
  }
  return { highs, lows };
}

function detectBOSInternal(candles, strength = 3) {
  if (!candles || candles.length < strength * 2 + 5) return [];
  const result = [];
  for (let i = strength; i < candles.length - strength; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= strength; j++) {
      if (candles[i - j].high >= candles[i].high || candles[i + j].high >= candles[i].high) isHigh = false;
      if (candles[i - j].low  <= candles[i].low  || candles[i + j].low  <= candles[i].low)  isLow  = false;
    }
    if (isHigh) {
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].close > candles[i].high) {
          result.push({ type: 'bull', price: candles[i].high, idx: i, breakIdx: j });
          break;
        }
      }
    }
    if (isLow) {
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].close < candles[i].low) {
          result.push({ type: 'bear', price: candles[i].low, idx: i, breakIdx: j });
          break;
        }
      }
    }
  }
  return result;
}

function getVolumeContext(candles) {
  if (!candles || candles.length < 10) return { mult: 1, context: 'normal' };
  const lookback = candles.length - 1;
  const lastVol  = candles[lookback]?.volume || 0;

  // Session-aware baseline: compare against candles from the same time window.
  // Post-11am IST (660 mins) volume is structurally lower — comparing to morning
  // candles would flag everything as "low". Use only same-session peers.
  const lastTs   = candles[lookback]?.time;
  const lastMins = lastTs ? (() => {
    const ist = new Date((lastTs + 5.5 * 3600) * 1000);
    return ist.getUTCHours() * 60 + ist.getUTCMinutes();
  })() : null;

  let refSlice;
  if (lastMins !== null && lastMins >= 660) {
    // Post 11am: use only the post-11am candles before the current one
    refSlice = candles.slice(0, lookback).filter(c => {
      const ist  = new Date((c.time + 5.5 * 3600) * 1000);
      const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      return mins >= 660;
    }).slice(-20);
  } else {
    // Pre/around 11am: use the last 20 candles before current (excluding current + 3 lookback buffer)
    refSlice = candles.slice(Math.max(0, lookback - 24), Math.max(0, lookback - 3));
  }

  if (!refSlice.length) return { mult: 1, context: 'normal' };
  const avgVol = refSlice.reduce((s, c) => s + (c.volume || 0), 0) / refSlice.length;
  if (!avgVol) return { mult: 1, context: 'normal' };
  const mult = parseFloat((lastVol / avgVol).toFixed(1));
  let context = 'normal';
  if (mult >= 3)        context = 'climax';
  else if (mult >= 1.8) context = 'high';
  else if (mult < 0.4)  context = 'dryup';
  else if (mult < 0.7)  context = 'low';
  return { mult, context };
}


function detectFlagAndPole(candles) {
  // Need at least: pole (3-5) + flag (3-6) + current candle = 15 minimum
  if (candles.length < 15) return null;
  const n  = candles.length;
  const c0 = candles[n - 1]; // current candle

  // Try each flag length (3–6 candles before current)
  for (let flagLen = 3; flagLen <= 6; flagLen++) {
    const flagStart = n - 1 - flagLen;
    if (flagStart < 5) continue;

    const flagCandles  = candles.slice(flagStart, n - 1);
    const flagHigh     = Math.max(...flagCandles.map(c => c.high));
    const flagLow      = Math.min(...flagCandles.map(c => c.low));
    const flagRange    = flagHigh - flagLow;
    const flagRangePct = (flagRange / flagLow) * 100;

    // Flag must be tight: range ≤ 0.8%
    if (flagRangePct > 0.8) continue;

    // Try each pole length (3–5 candles before the flag)
    for (let poleLen = 3; poleLen <= 5; poleLen++) {
      const poleStart = flagStart - poleLen;
      if (poleStart < 0) continue;

      const poleCandles = candles.slice(poleStart, flagStart);
      const poleOpen    = poleCandles[0].open;
      const poleClose   = poleCandles[poleCandles.length - 1].close;
      const poleMovePct = (poleClose - poleOpen) / poleOpen * 100;

      // Pole must be a strong directional move ≥ 1.5%
      if (Math.abs(poleMovePct) < 1.5) continue;

      // Flag should not retrace more than 40% of the pole height
      const poleHeight = Math.abs(poleClose - poleOpen);
      if (flagRange > poleHeight * 0.40) continue;

      const isBullPole = poleMovePct > 0;
      const details    = { poleMovePct: parseFloat(poleMovePct.toFixed(2)), flagRangePct: parseFloat(flagRangePct.toFixed(2)), flagHigh, flagLow };

      // Breakout from flag — confirmed signal
      if (isBullPole && c0.close > flagHigh)
        return { id: 'bull_flag', name: 'Bull Flag Breakout', direction: 'bull', strength: 4, details };
      if (!isBullPole && c0.close < flagLow)
        return { id: 'bear_flag', name: 'Bear Flag Breakdown', direction: 'bear', strength: 4, details };

      // Still inside flag — setup forming, watch for breakout
      if (isBullPole && c0.close >= flagLow && c0.close <= flagHigh)
        return { id: 'bull_flag_forming', name: 'Bull Flag Forming', direction: 'bull', strength: 3, details };
      if (!isBullPole && c0.close >= flagLow && c0.close <= flagHigh)
        return { id: 'bear_flag_forming', name: 'Bear Flag Forming', direction: 'bear', strength: 3, details };
    }
  }
  return null;
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — PRE-COMPUTE
// Runs once per scan. All expensive scans happen here.
// Everything else reads from the returned object.
// ─────────────────────────────────────────────────────────────────────────────

function computeVwapHistory(candles, vwapData) {
  // Returns per-candle above/below VWAP for the last 5 candles (matched by timestamp)
  if (!vwapData?.length) return [];
  const vwapMap = new Map(vwapData.map(v => [v.time, v.value]));
  const n = candles.length;
  const result = [];
  for (let i = Math.max(0, n - 5); i < n; i++) {
    const vwapVal = vwapMap.get(candles[i].time);
    if (!vwapVal) continue;
    result.push({ idx: i, close: candles[i].close, aboveVwap: candles[i].close >= vwapVal, vwapVal });
  }
  return result;
}

function computeVwapPosition(candles, vwapData) {
  if (!vwapData?.length) return null;
  const lastVwap  = vwapData[vwapData.length - 1]?.value;
  const lastClose = candles[candles.length - 1].close;
  if (!lastVwap) return null;
  const distPct = parseFloat(Math.abs((lastClose - lastVwap) / lastVwap * 100).toFixed(2));
  return {
    price:   lastVwap,
    above:   lastClose >= lastVwap,
    distPct,
    atVwap:  distPct <= 0.10,
  };
}

function computeORB(candles) {
  // Opening Range = first 15-min window of session (9:15–9:30 IST)
  const orbCandles = candles.filter(c => {
    const ist  = new Date((c.time + 5.5 * 3600) * 1000);
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return mins >= 555 && mins < 570;
  });
  if (!orbCandles.length) return null;
  return {
    high:   Math.max(...orbCandles.map(c => c.high)),
    low:    Math.min(...orbCandles.map(c => c.low)),
    formed: true,
  };
}

function computeEMAValue(candles, period) {
  if (candles.length < period) return null;
  const k   = 2 / (period + 1);
  let ema   = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

// Returns last 2 values of EMA for crossover detection
function computeEMAHistory(candles, period) {
  if (candles.length < period + 1) return null;
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  let prev = ema;
  for (let i = period; i < candles.length; i++) {
    prev = ema;
    ema  = candles[i].close * k + ema * (1 - k);
  }
  return { cur: ema, prev };
}

function computeEMAStack(candles) {
  if (!candles || candles.length < 55) return null;
  const ema9  = computeEMAValue(candles, 9);
  const ema21 = computeEMAValue(candles, 21);
  const ema50 = computeEMAValue(candles, 50);
  if (!ema9 || !ema21 || !ema50) return null;
  const lastClose = candles[candles.length - 1].close;
  return {
    ema9, ema21, ema50,
    stackedBull:      ema9 > ema21 && ema21 > ema50,
    stackedBear:      ema9 < ema21 && ema21 < ema50,
    priceAboveEma9:   lastClose > ema9,
    priceAboveEma21:  lastClose > ema21,
    priceAboveEma50:  lastClose > ema50,
    atEma21: parseFloat(Math.abs((lastClose - ema21) / ema21 * 100).toFixed(2)) <= 0.2,
    atEma50: parseFloat(Math.abs((lastClose - ema50) / ema50 * 100).toFixed(2)) <= 0.2,
    distEma21Pct: parseFloat(Math.abs((lastClose - ema21) / ema21 * 100).toFixed(2)),
    distEma50Pct: parseFloat(Math.abs((lastClose - ema50) / ema50 * 100).toFixed(2)),
  };
}

function detectFVGs(candles, lookback = 50) {
  // Fair Value Gap: 3-candle imbalance where c[i-2].high < c[i].low (bull)
  // or c[i-2].low > c[i].high (bear)
  const fvgs  = [];
  const start = Math.max(0, candles.length - lookback);
  for (let i = start + 2; i < candles.length - 1; i++) {
    const prev = candles[i - 2];
    const curr = candles[i];
    if (curr.low > prev.high) {
      fvgs.push({ type: 'bull', high: curr.low, low: prev.high, mid: (curr.low + prev.high) / 2, idx: i });
    }
    if (curr.high < prev.low) {
      fvgs.push({ type: 'bear', high: prev.low, low: curr.high, mid: (prev.low + curr.high) / 2, idx: i });
    }
  }
  // Only return unmitigated FVGs (price hasn't fully passed through)
  const lastClose = candles[candles.length - 1].close;
  return fvgs.filter(fvg =>
    fvg.type === 'bull' ? lastClose >= fvg.low : lastClose <= fvg.high
  ).slice(-5);
}

function detectTradingRange(candles, lookback = 10) {
  if (candles.length < lookback) return null;
  const slice    = candles.slice(-lookback);
  const high     = Math.max(...slice.map(c => c.high));
  const low      = Math.min(...slice.map(c => c.low));
  const rangePct = parseFloat(((high - low) / low * 100).toFixed(2));
  if (rangePct <= 1.5) return { high, low, rangePct, candleCount: slice.length };
  return null;
}

function computeOrderBlocks(candles, bosLevels) {
  // For each BOS, find the last opposing candle before the break (that's the OB)
  const obs = [];
  for (const bos of bosLevels) {
    if (bos.breakIdx === undefined) continue;
    for (let i = bos.breakIdx - 1; i >= 0; i--) {
      const c      = candles[i];
      const isBull = c.close >= c.open;
      if (bos.type === 'bull' && !isBull) {
        obs.push({ bosType: bos.type, high: c.high, low: c.low, mid: (c.high + c.low) / 2, bosPrice: bos.price });
        break;
      }
      if (bos.type === 'bear' && isBull) {
        obs.push({ bosType: bos.type, high: c.high, low: c.low, mid: (c.high + c.low) / 2, bosPrice: bos.price });
        break;
      }
    }
  }
  return obs;
}

function computeSwingSequence(candles) {
  // Check last 20 candles for HH/HL (uptrend structure) or LH/LL (downtrend structure)
  if (candles.length < 15) return null;
  const { highs, lows } = findSwingPivots(candles.slice(-20), 2);
  if (highs.length < 2 || lows.length < 2) return null;
  const h = highs.slice(-2);
  const l = lows.slice(-2);
  if (h[1].price > h[0].price && l[1].price > l[0].price)
    return { type: 'uptrend', lastHL: l[1], lastHH: h[1] };
  if (h[1].price < h[0].price && l[1].price < l[0].price)
    return { type: 'downtrend', lastLH: h[1], lastLL: l[1] };
  return null;
}

function computePowerCandles(candles, lookback = 15) {
  // Power candle: large body (≥ 65% of range), strong move (≥ 0.8%), scanned in last N candles.
  // Excludes the current (last) candle — we're looking for a prior impulse to pull back from.
  if (candles.length < 5) return [];
  const n      = candles.length;
  const refEnd = Math.max(0, n - 4);
  const refSlice = candles.slice(Math.max(0, refEnd - 20), refEnd);
  const avgVol = refSlice.length
    ? refSlice.reduce((s, c) => s + (c.volume || 0), 0) / refSlice.length
    : 0;

  const result = [];
  const start  = Math.max(0, n - 1 - lookback);
  for (let i = start; i < n - 1; i++) {
    const c     = candles[i];
    const body  = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (!range) continue;
    const bodyPct = body / range;
    const movePct = Math.abs((c.close - c.open) / c.open * 100);
    const volMult = avgVol > 0 ? c.volume / avgVol : 1;
    if (bodyPct >= 0.65 && movePct >= 0.8 && volMult >= 1.3) {
      result.push({
        idx:       i,
        direction: c.close > c.open ? 'bull' : 'bear',
        high:      c.high,
        low:       c.low,
        open:      c.open,
        close:     c.close,
        range:     range,
        bodyPct:   parseFloat(bodyPct.toFixed(2)),
        movePct:   parseFloat(movePct.toFixed(2)),
      });
    }
  }
  return result;
}

function computeATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const slice = candles.slice(-(period + 1));
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    const curr = slice[i], prev = slice[i - 1];
    const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
    sum += tr;
  }
  return parseFloat((sum / period).toFixed(2));
}

function computeBollingerBands(candles, period = 20, stdMult = 2) {
  if (candles.length < period) return null;
  const slice    = candles.slice(-period);
  const mean     = slice.reduce((s, c) => s + c.close, 0) / period;
  const variance = slice.reduce((s, c) => s + (c.close - mean) ** 2, 0) / period;
  const std      = Math.sqrt(variance);
  return {
    upper:  parseFloat((mean + stdMult * std).toFixed(2)),
    middle: parseFloat(mean.toFixed(2)),
    lower:  parseFloat((mean - stdMult * std).toFixed(2)),
  };
}

export function precompute(candles, vwapData, rsiValue) {
  const bosLevels = detectBOSInternal(candles);
  return {
    bosLevels,
    orderBlocks:    computeOrderBlocks(candles, bosLevels),
    swingPivots:    findSwingPivots(candles, 3),
    swingPivots2:   findSwingPivots(candles.slice(-20), 2),  // short-term structure
    swingSequence:  computeSwingSequence(candles),
    volume:         getVolumeContext(candles),
    sessionTime:    getSessionTime(candles),
    vwap:           computeVwapPosition(candles, vwapData),
    vwapHistory:    computeVwapHistory(candles, vwapData),
    orb:            computeORB(candles),
    ema:            computeEMAStack(candles),
    fvgs:           detectFVGs(candles),
    tradingRange:   detectTradingRange(candles),
    powerCandles:   computePowerCandles(candles),
    bb:             computeBollingerBands(candles),
    atr14:          computeATR(candles),
    rsi:            rsiValue ?? null,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — PATTERN DETECTION
// Uses pre-computed data. No scans run here.
// Returns raw candle patterns (inputs to setup detection).
// ─────────────────────────────────────────────────────────────────────────────

export function detectPatterns(candles, pre) {
  if (!candles || candles.length < 3) return [];
  const patterns = [];
  const n  = candles.length;
  const c0 = candles[n - 1];
  const c1 = candles[n - 2];
  const c2 = candles[n - 3];

  const body0   = Math.abs(c0.close - c0.open);
  const range0  = c0.high - c0.low;
  const body1   = Math.abs(c1.close - c1.open);
  const range1  = c1.high - c1.low;
  const body2   = Math.abs(c2.close - c2.open);
  const range2  = c2.high - c2.low;

  const isBull0 = c0.close >= c0.open;
  const isBull1 = c1.close >= c1.open;
  const isBull2 = c2.close >= c2.open;

  const upperWick0 = c0.high - Math.max(c0.open, c0.close);
  const lowerWick0 = Math.min(c0.open, c0.close) - c0.low;

  // ── 1-candle ──────────────────────────────────────────────────────────────

  if (range0 > 0 && body0 / range0 < 0.10)
    patterns.push({ id: 'doji', name: 'Doji', direction: 'neutral', strength: 1 });

  if (c0.high <= c1.high && c0.low >= c1.low)
    patterns.push({ id: 'inside_bar', name: 'Inside Bar', direction: 'neutral', strength: 1 });

  if (range0 > 0) {
    const lPct = lowerWick0 / range0;
    const uPct = upperWick0 / range0;
    const bPct = body0 / range0;

    if (lPct >= 0.60 && bPct < 0.35 && uPct < 0.10)
      patterns.push({ id: 'hammer', name: 'Hammer', direction: 'bull', strength: 2 });
    else if (lPct >= 0.70)
      patterns.push({ id: 'bull_pin', name: 'Bull Pin', direction: 'bull', strength: 2 });

    if (uPct >= 0.60 && bPct < 0.35 && lPct < 0.10)
      patterns.push({ id: 'shooting_star', name: 'Shooting Star', direction: 'bear', strength: 2 });
    else if (uPct >= 0.70)
      patterns.push({ id: 'bear_pin', name: 'Bear Pin', direction: 'bear', strength: 2 });

    if (bPct >= 0.90)
      patterns.push({ id: isBull0 ? 'bull_marubozu' : 'bear_marubozu', name: isBull0 ? 'Bull Marubozu' : 'Bear Marubozu', direction: isBull0 ? 'bull' : 'bear', strength: 2 });
  }

  // Liquidity sweep — uses pre.swingPivots2 instead of re-scanning
  if (candles.length >= 15 && pre) {
    const slice15    = candles.slice(-15);
    const swingHigh  = Math.max(...slice15.slice(0, -1).map(c => c.high));
    const swingLow   = Math.min(...slice15.slice(0, -1).map(c => c.low));
    const threshold  = 0.001;
    if (c0.high > swingHigh * (1 + threshold) && c0.close < swingHigh)
      patterns.push({ id: 'liq_sweep_high', name: 'Liq. Sweep High', direction: 'bear', strength: 3 });
    if (c0.low < swingLow * (1 - threshold) && c0.close > swingLow)
      patterns.push({ id: 'liq_sweep_low', name: 'Liq. Sweep Low', direction: 'bull', strength: 3 });
  }

  // ── 2-candle ──────────────────────────────────────────────────────────────

  if (range0 > 0 && range1 > 0) {
    const c0Lo = Math.min(c0.open, c0.close), c0Hi = Math.max(c0.open, c0.close);
    const c1Lo = Math.min(c1.open, c1.close), c1Hi = Math.max(c1.open, c1.close);
    if (isBull0 && !isBull1 && c0Lo < c1Lo && c0Hi > c1Hi)
      patterns.push({ id: 'bull_engulfing', name: 'Bull Engulfing', direction: 'bull', strength: 3 });
    if (!isBull0 && isBull1 && c0Lo < c1Lo && c0Hi > c1Hi)
      patterns.push({ id: 'bear_engulfing', name: 'Bear Engulfing', direction: 'bear', strength: 3 });
  }

  if (isBull0 && Math.abs(c0.low - c1.low) / Math.max(c0.low, c1.low) <= 0.0005)
    patterns.push({ id: 'tweezer_bottom', name: 'Tweezer Bottom', direction: 'bull', strength: 3 });
  if (!isBull0 && Math.abs(c0.high - c1.high) / Math.max(c0.high, c1.high) <= 0.0005)
    patterns.push({ id: 'tweezer_top', name: 'Tweezer Top', direction: 'bear', strength: 3 });

  // ── 3-candle ──────────────────────────────────────────────────────────────

  if (range0 > 0 && range1 > 0 && range2 > 0) {
    if (!isBull2 && body1 < body2 * 0.30 && isBull0 && c0.close > (c2.open + c2.close) / 2)
      patterns.push({ id: 'morning_star', name: 'Morning Star', direction: 'bull', strength: 4 });
    if (isBull2 && body1 < body2 * 0.30 && !isBull0 && c0.close < (c2.open + c2.close) / 2)
      patterns.push({ id: 'evening_star', name: 'Evening Star', direction: 'bear', strength: 4 });

    if (isBull0 && isBull1 && isBull2 && c0.close > c1.close && c1.close > c2.close &&
        c0.open >= Math.min(c1.open, c1.close) && c0.open <= Math.max(c1.open, c1.close) &&
        c1.open >= Math.min(c2.open, c2.close) && c1.open <= Math.max(c2.open, c2.close))
      patterns.push({ id: 'three_soldiers', name: 'Three White Soldiers', direction: 'bull', strength: 3 });

    if (!isBull0 && !isBull1 && !isBull2 && c0.close < c1.close && c1.close < c2.close &&
        c0.open >= Math.min(c1.open, c1.close) && c0.open <= Math.max(c1.open, c1.close) &&
        c1.open >= Math.min(c2.open, c2.close) && c1.open <= Math.max(c2.open, c2.close))
      patterns.push({ id: 'three_crows', name: 'Three Black Crows', direction: 'bear', strength: 3 });

    // Inside bar breakout
    if (c1.high <= c2.high && c1.low >= c2.low) {
      if (c0.close > c2.high)
        patterns.push({ id: 'ib_breakout', name: 'IB Breakout', direction: 'bull', strength: 3 });
      else if (c0.close < c2.low)
        patterns.push({ id: 'ib_breakdown', name: 'IB Breakdown', direction: 'bear', strength: 3 });
    }
  }

  // ── Multi-candle — uses pre.bosLevels, no re-scan ─────────────────────────

  if (pre?.bosLevels?.length && pre?.orderBlocks?.length) {
    const lastClose = c0.close;
    for (const ob of pre.orderBlocks) {
      if (lastClose >= ob.low && lastClose <= ob.high) {
        patterns.push({
          id:        'ob_retest',
          name:      ob.bosType === 'bull' ? 'OB Retest (Bull)' : 'OB Retest (Bear)',
          direction: ob.bosType,
          strength:  4,
        });
        break;
      }
    }
  }

  // Flag and Pole / tight compression + continuation
  const flagSetup = detectFlagAndPole(candles);
  if (flagSetup) patterns.push(flagSetup);

  return patterns;
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — CONTEXT
// Assembles the context object from pre-computed data.
// No new scans. Pure assembly.
// ─────────────────────────────────────────────────────────────────────────────

export function buildContext(candles, pre) {
  // Trend detection: prioritize recent momentum over morning bias
  let trend = 'ranging', trendStrength = 'weak';
  if (pre.swingSequence) {
    trend = pre.swingSequence.type;
    const { highs, lows } = pre.swingPivots2;
    trendStrength = highs.length >= 3 && lows.length >= 3 ? 'strong' : 'weak';
  } else if (candles.length >= 5) {
    // Shorter lookback for intraday reversals
    const recentSlice = candles.slice(-5);
    const first = recentSlice[0].close;
    const last  = recentSlice[recentSlice.length - 1].close;
    const chgPct = (last - first) / first * 100;

    if (chgPct > 0.15)       trend = 'uptrend';
    else if (chgPct < -0.15) trend = 'downtrend';
    else                     trend = 'ranging';
  }

  // BOS context — most recently detected
  let bos = null;
  if (pre.bosLevels.length) {
    const n          = candles.length;
    const lastClose  = candles[n - 1].close;
    const mostRecent = pre.bosLevels.reduce((a, b) => b.idx > a.idx ? b : a);
    const distPct    = parseFloat(Math.abs((lastClose - mostRecent.price) / mostRecent.price * 100).toFixed(2));
    // freshBreak: the break happened on the current (last) candle — needs next-candle confirmation
    const freshBreak = mostRecent.breakIdx === n - 1;
    bos = { type: mostRecent.type, price: mostRecent.price, distPct, freshBreak };
  }

  // Order block — most recent, check if current price is near it
  let orderBlock = null;
  if (pre.orderBlocks.length) {
    const lastClose = candles[candles.length - 1].close;
    const nearest = pre.orderBlocks.find(ob => lastClose >= ob.low * 0.998 && lastClose <= ob.high * 1.002);
    if (nearest) orderBlock = nearest;
  }

  return {
    trend,
    trendStrength,
    vwap:         pre.vwap,
    bos,
    volume:       pre.volume,
    rsi:          pre.rsi,
    orderBlock,
    sessionTime:  pre.sessionTime,
    ema:          pre.ema,
    orb:          pre.orb,
    fvgs:         pre.fvgs,
    tradingRange: pre.tradingRange,
    swingSequence: pre.swingSequence,
    atr14:        pre.atr14,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4 — SETUP DETECTION
// Multi-condition setups. Each setup validates against pre-computed context.
// Returns setup objects with the same shape as patterns { id, name, direction, strength }
// plus optional: sl, target, details, coversPattern (suppresses a raw pattern).
// ─────────────────────────────────────────────────────────────────────────────

export function detectSetups(candles, patterns, context, pre, cfg = {}) {
  const t  = (id, key, def) => cfg[id]?.thresholds?.[key] ?? def;
  const en = (id) => cfg[id]?.enabled !== false;

  const setups = [];
  const n  = candles.length;
  const c0 = candles[n - 1];

  // ── S1: BOS + Order Block Retest ─────────────────────────────────────────
  // BOS detected, price retests the OB zone, rejection candle present.
  if (en('s1') && pre.bosLevels.length && pre.orderBlocks.length) {
    const recentBOS = pre.bosLevels.reduce((a, b) => b.idx > a.idx ? b : a);
    const ob        = pre.orderBlocks.find(o => o.bosType === recentBOS.type);
    if (ob) {
      const touchingOB = c0.low <= ob.high && c0.high >= ob.low;
      if (touchingOB) {
        const rejectionIds = ['hammer','bull_pin','shooting_star','bear_pin',
                              'bull_engulfing','bear_engulfing','doji',
                              'tweezer_bottom','tweezer_top'];
        const hasRejection = patterns.some(p =>
          rejectionIds.includes(p.id) &&
          (p.direction === recentBOS.type || p.direction === 'neutral')
        );
        if (hasRejection) {
          const dir = recentBOS.type;
          const sl  = dir === 'bull' ? ob.low  * 0.9985 : ob.high * 1.0015;
          const ext = Math.abs(recentBOS.price - ob.mid);
          const tgt = dir === 'bull' ? recentBOS.price + ext : recentBOS.price - ext;
          setups.push({
            id: 's1_ob_retest', name: 'BOS + OB Retest', direction: dir, strength: 5,
            sl, target: tgt, coversPattern: 'ob_retest',
            details: { obHigh: ob.high, obLow: ob.low, bosPrice: recentBOS.price, hasRejection },
          });
        }
      }
    }
  }

  // ── S3: Opening Range Breakout ────────────────────────────────────────────
  // ORB formed, body fully closes beyond ORB high or low, volume ≥ 1.8×.
  if (en('s3') && pre.orb?.formed && pre.sessionTime !== 'opening' && pre.sessionTime !== 'premarket') {
    const bodyHigh  = Math.max(c0.open, c0.close);
    const bodyLow   = Math.min(c0.open, c0.close);
    const orbRange  = pre.orb.high - pre.orb.low;
    const s3Vol     = t('s3', 'volMult', 1.8);

    if (bodyLow > pre.orb.high && pre.volume.mult >= s3Vol) {
      setups.push({
        id: 's3_orb_bull', name: 'ORB Breakout', direction: 'bull', strength: 4,
        sl: pre.orb.high * 0.999, target: pre.orb.high + orbRange,
        details: { orbHigh: pre.orb.high, orbLow: pre.orb.low, volMult: pre.volume.mult },
      });
    }
    if (bodyHigh < pre.orb.low && pre.volume.mult >= s3Vol) {
      setups.push({
        id: 's3_orb_bear', name: 'ORB Breakdown', direction: 'bear', strength: 4,
        sl: pre.orb.low  * 1.001, target: pre.orb.low - orbRange,
        details: { orbHigh: pre.orb.high, orbLow: pre.orb.low, volMult: pre.volume.mult },
      });
    }
  }

  // ── S6: Strong Engulfing at Key Level ────────────────────────────────────
  // Engulfing candle at BOS level, VWAP, or OB zone. Volume ≥ 1.4×.
  const atKeyLevel = (pre.vwap?.atVwap) ||
                     (!pre.vwap && (pre.ema?.atEma21 || pre.ema?.atEma50)) ||
                     (context.bos?.distPct != null && context.bos.distPct <= 0.3) ||
                     (context.orderBlock != null);

  if (en('s6') && atKeyLevel && pre.volume.mult >= t('s6', 'volMult', 1.4)) {
    const bullEngulf = patterns.find(p => p.id === 'bull_engulfing');
    const bearEngulf = patterns.find(p => p.id === 'bear_engulfing');

    if (bullEngulf) {
      setups.push({
        id: 's6_engulf_bull', name: 'Bull Engulfing at Level', direction: 'bull', strength: 4,
        sl: c0.low * 0.9985, target: null, coversPattern: 'bull_engulfing',
        details: { atVwap: !!pre.vwap?.atVwap, atBOS: context.bos?.distPct <= 0.3, volMult: pre.volume.mult },
      });
    }
    if (bearEngulf) {
      setups.push({
        id: 's6_engulf_bear', name: 'Bear Engulfing at Level', direction: 'bear', strength: 4,
        sl: c0.high * 1.0015, target: null, coversPattern: 'bear_engulfing',
        details: { atVwap: !!pre.vwap?.atVwap, atBOS: context.bos?.distPct <= 0.3, volMult: pre.volume.mult },
      });
    }
  }

  // ── S4: Power Candle Pullback ─────────────────────────────────────────────
  // Recent power candle, price pulled back 35–65% of its range, re-entry candle forming.
  if (en('s4') && pre.powerCandles.length) {
    const pc      = pre.powerCandles[pre.powerCandles.length - 1]; // most recent
    const pcRange = pc.range;
    if (pcRange > 0) {
      const isBull0    = c0.close > c0.open;
      const pullback   = pc.direction === 'bull' ? pc.high - c0.close : c0.close - pc.low;
      const pullbackPct = (pullback / pcRange) * 100;
      const s4Min = t('s4', 'pullbackMin', 35);
      const s4Max = t('s4', 'pullbackMax', 65);

      if (pullbackPct >= s4Min && pullbackPct <= s4Max) {
        // Re-entry: candle in same direction as power candle
        const reEntry = (pc.direction === 'bull' && isBull0) || (pc.direction === 'bear' && !isBull0);
        if (reEntry) {
          // Volume: expanding vs prior 2 candles avg
          const priorVolAvg = ((candles[n - 2]?.volume || 0) + (candles[n - 3]?.volume || 0)) / 2;
          const volExpanding = priorVolAvg > 0 && c0.volume > priorVolAvg;
          setups.push({
            id: `s4_pc_pullback_${pc.direction}`,
            name: 'Power Candle Pullback',
            direction: pc.direction,
            strength: volExpanding ? 4 : 3,
            sl:     pc.direction === 'bull' ? pc.low  * 0.999 : pc.high * 1.001,
            target: pc.direction === 'bull' ? pc.high : pc.low,
            details: { pullbackPct: parseFloat(pullbackPct.toFixed(1)), pcHigh: pc.high, pcLow: pc.low, volExpanding },
          });
        }
      }
    }
  }

  // ── S5: EMA Stack Bounce ──────────────────────────────────────────────────
  // EMAs stacked in trend direction, price at EMA 21, bounce candle with body ≥ 40%.
  if (en('s5') && pre.ema) {
    const bodyPct = (c0.high - c0.low) > 0
      ? Math.abs(c0.close - c0.open) / (c0.high - c0.low) : 0;
    const isBull0 = c0.close > c0.open;
    const s5Body  = t('s5', 'bodyPct', 0.40);

    if (pre.ema.stackedBull && pre.ema.atEma21 && isBull0 && bodyPct >= s5Body) {
      setups.push({
        id: 's5_ema_bounce_bull', name: 'EMA Stack Bounce', direction: 'bull', strength: 3,
        sl:     pre.ema.ema50 * 0.999,
        target: null,
        details: { ema21: parseFloat(pre.ema.ema21.toFixed(2)), ema50: parseFloat(pre.ema.ema50.toFixed(2)), distPct: pre.ema.distEma21Pct },
      });
    }
    if (pre.ema.stackedBear && pre.ema.atEma21 && !isBull0 && bodyPct >= s5Body) {
      setups.push({
        id: 's5_ema_bounce_bear', name: 'EMA Stack Bounce', direction: 'bear', strength: 3,
        sl:     pre.ema.ema50 * 1.001,
        target: null,
        details: { ema21: parseFloat(pre.ema.ema21.toFixed(2)), ema50: parseFloat(pre.ema.ema50.toFixed(2)), distPct: pre.ema.distEma21Pct },
      });
    }
  }

  const isBull0 = c0.close > c0.open;

  // ── S8: Higher Low / Lower High ──────────────────────────────────────────
  // Confirmed swing structure + price bouncing at latest HL or LH.
  if (en('s8') && pre.swingSequence?.type === 'uptrend') {
    const { lows } = pre.swingPivots2;
    const s8Dist = t('s8', 'distPct', 0.5);
    if (lows.length >= 2) {
      const lastLow = lows[lows.length - 1], prevLow = lows[lows.length - 2];
      if (lastLow.price > prevLow.price) {
        const distPct = Math.abs((c0.close - lastLow.price) / lastLow.price * 100);
        if (distPct <= s8Dist && isBull0)
          setups.push({ id: 's8_hl', name: 'Higher Low Bounce', direction: 'bull', strength: 3,
            sl: lastLow.price * 0.998, target: null,
            details: { hlPrice: lastLow.price, prevLow: prevLow.price, distPct: parseFloat(distPct.toFixed(2)) } });
      }
    }
  }
  if (en('s8') && pre.swingSequence?.type === 'downtrend') {
    const { highs } = pre.swingPivots2;
    const s8Dist = t('s8', 'distPct', 0.5);
    if (highs.length >= 2) {
      const lastHigh = highs[highs.length - 1], prevHigh = highs[highs.length - 2];
      if (lastHigh.price < prevHigh.price) {
        const distPct = Math.abs((c0.close - lastHigh.price) / lastHigh.price * 100);
        if (distPct <= s8Dist && !isBull0)
          setups.push({ id: 's8_lh', name: 'Lower High Rejection', direction: 'bear', strength: 3,
            sl: lastHigh.price * 1.002, target: null,
            details: { lhPrice: lastHigh.price, prevHigh: prevHigh.price, distPct: parseFloat(distPct.toFixed(2)) } });
      }
    }
  }

  // ── S9: S/R Flip Retest ───────────────────────────────────────────────────
  // A real S/R flip: BOS level that had ≥ 3 confirmed touches before breaking.
  // The flip level must now act as the opposite role (resistance → support / vice versa).
  //
  // Strict gates to prevent "every level flips" noise:
  //   1. BOS must be recent (within last 30 candles — stale levels ignored)
  //   2. ≥ 3 prior touches within 0.20% of the level (tighter than before)
  //   3. Volume ≥ 1.5× baseline at the retest candle
  //   4. Wick rejection ≥ 40% of candle range (clear bounce/rejection candle)
  //   5. Price must be retesting FROM the correct side (not just near the level)
  if (en('s9') && pre.bosLevels.length) {
    const recentBOS9 = pre.bosLevels.reduce((a, b) =>
      (b.breakIdx ?? 0) > (a.breakIdx ?? 0) ? b : a
    );
    const breakAge = recentBOS9.breakIdx !== undefined ? (n - 1 - recentBOS9.breakIdx) : 999;
    if (breakAge <= 30 && recentBOS9.breakIdx !== undefined && recentBOS9.breakIdx >= 5) {
      const s9DistPct   = t('s9', 'distPct', 0.30);   // how close price must be to the flip level
      const s9Touches   = t('s9', 'touchCount', 3);    // minimum prior touches (strict: 3 not 2)
      const s9VolMult   = t('s9', 'volMult', 1.5);     // volume at the retest candle
      const s9WickPct   = t('s9', 'wickPct', 0.40);   // wick rejection threshold

      const dist9 = Math.abs((c0.close - recentBOS9.price) / recentBOS9.price * 100);

      // Price must be on the correct side of the flipped level —
      // bear BOS (resistance broke down): retest from below (price ≤ level × 1.003)
      // bull BOS (support broke up): retest from above (price ≥ level × 0.997)
      const correctSide = recentBOS9.type === 'bear'
        ? c0.close <= recentBOS9.price * 1.003   // retesting ex-resistance as new support: price at or below level
        : c0.close >= recentBOS9.price * 0.997;  // retesting ex-support as new resistance: price at or above level

      if (dist9 <= s9DistPct && correctSide) {
        // Count prior touches — candles before the break that came within 0.20% of the level
        const tightTouchPct = 0.20;
        const preBOSSlice = candles.slice(0, recentBOS9.breakIdx);
        const touchCount = preBOSSlice.filter(c => {
          const pct = recentBOS9.type === 'bull'
            ? Math.abs(c.high - recentBOS9.price) / recentBOS9.price * 100
            : Math.abs(c.low  - recentBOS9.price) / recentBOS9.price * 100;
          return pct <= tightTouchPct;
        }).length;

        if (touchCount >= s9Touches && pre.volume.mult >= s9VolMult) {
          // Wick rejection check — 40% of range pointing away from the flip level
          const cRange9 = c0.high - c0.low;
          let hasRejection = false;
          if (cRange9 > 0) {
            if (recentBOS9.type === 'bull') {
              // bull BOS → ex-support now acts as resistance → upper wick rejection
              const upperWick = c0.high - Math.max(c0.close, c0.open);
              hasRejection = upperWick / cRange9 >= s9WickPct;
            } else {
              // bear BOS → ex-resistance now acts as support → lower wick rejection (bounce)
              const lowerWick = Math.min(c0.close, c0.open) - c0.low;
              hasRejection = lowerWick / cRange9 >= s9WickPct;
            }
          }

          if (hasRejection) {
            // Direction: bull BOS flip → resistance-turned-support → look SHORT (bear reaction at level)
            //            bear BOS flip → support-turned-resistance → look LONG (bull bounce at level)
            const flipDir = recentBOS9.type === 'bull' ? 'bear' : 'bull';
            setups.push({
              id: 's9_sr_flip', name: 'S/R Flip Retest', direction: flipDir, strength: 4,
              sl: flipDir === 'bull' ? recentBOS9.price * 0.997 : recentBOS9.price * 1.003,
              target: null,
              details: {
                flipPrice:  recentBOS9.price,
                flipType:   recentBOS9.type,
                touchCount,
                distPct:    parseFloat(dist9.toFixed(2)),
                volMult:    pre.volume.mult,
                breakAge,
              },
            });
          }
        }
      }
    }
  }



  // ── S10: Double Bottom / Double Top ──────────────────────────────────────
  // Two swing pivots within 0.3% of each other, second touch on lower volume.
  if (en('s10')) {
    const sliceStart10 = Math.max(0, n - 20);
    const { lows: sp2L, highs: sp2H } = pre.swingPivots2;
    if (sp2L.length >= 2) {
      const l1 = sp2L[sp2L.length - 2], l2 = sp2L[sp2L.length - 1];
      const diff = Math.abs(l1.price - l2.price) / l1.price * 100;
      if (diff <= 0.3) {
        const vol1 = candles[sliceStart10 + l1.idx]?.volume || 0;
        const vol2 = candles[sliceStart10 + l2.idx]?.volume || 0;
        const volDiv = vol1 > 0 && vol2 < vol1;
        const distDB = Math.abs((c0.close - l2.price) / l2.price * 100);
        if (distDB <= 0.5 && isBull0 && volDiv)
          setups.push({ id: 's10_double_bottom', name: 'Double Bottom', direction: 'bull', strength: 4,
            sl: l2.price * 0.998, target: null,
            details: { level: parseFloat(l2.price.toFixed(2)), diff: parseFloat(diff.toFixed(2)), volDiv } });
      }
    }
    if (sp2H.length >= 2) {
      const h1 = sp2H[sp2H.length - 2], h2 = sp2H[sp2H.length - 1];
      const diff = Math.abs(h1.price - h2.price) / h1.price * 100;
      if (diff <= 0.3) {
        const vol1 = candles[sliceStart10 + h1.idx]?.volume || 0;
        const vol2 = candles[sliceStart10 + h2.idx]?.volume || 0;
        const volDiv = vol1 > 0 && vol2 < vol1;
        const distDT = Math.abs((c0.close - h2.price) / h2.price * 100);
        if (distDT <= 0.5 && !isBull0 && volDiv)
          setups.push({ id: 's10_double_top', name: 'Double Top', direction: 'bear', strength: 4,
            sl: h2.price * 1.002, target: null,
            details: { level: parseFloat(h2.price.toFixed(2)), diff: parseFloat(diff.toFixed(2)), volDiv } });
      }
    }
  }

  // ── S11: Inside Bar Breakout (with volume + body confirmation) ───────────────────
  if (en('s11')) {
    const ibBull   = patterns.find(p => p.id === 'ib_breakout');
    const ibBear   = patterns.find(p => p.id === 'ib_breakdown');
    const s11Vol   = t('s11', 'volMult', 1.5);
    const range0   = c0.high - c0.low;
    const bodyPct0 = range0 > 0 ? Math.abs(c0.close - c0.open) / range0 : 0;
    if (ibBull && pre.volume.mult >= s11Vol && bodyPct0 >= 0.30)
      setups.push({ id: 's11_ib_bull', name: 'IB Breakout', direction: 'bull', strength: 4,
        sl: candles[n - 2].low * 0.999, target: null, coversPattern: 'ib_breakout',
        details: { volMult: pre.volume.mult, bodyPct: parseFloat(bodyPct0.toFixed(2)) } });
    if (ibBear && pre.volume.mult >= s11Vol && bodyPct0 >= 0.30)
      setups.push({ id: 's11_ib_bear', name: 'IB Breakdown', direction: 'bear', strength: 4,
        sl: candles[n - 2].high * 1.001, target: null, coversPattern: 'ib_breakdown',
        details: { volMult: pre.volume.mult, bodyPct: parseFloat(bodyPct0.toFixed(2)) } });
  }

  // ── S12: VWAP + Key Level Confluence (VWAP fallback: EMA21) ─────────────────────────
  // Within 0.3% of VWAP (or EMA21 if no VWAP) AND within 0.4% of BOS level simultaneously.
  {
    const s12VwapDist = t('s12', 'vwapDistPct', 0.3);
    const s12BosDist  = t('s12', 'bosDistPct', 0.4);
    const atVwapOrEma = pre.vwap ? pre.vwap.distPct <= s12VwapDist
                                  : (pre.ema?.atEma21 || pre.ema?.atEma50);
    const anchorSl    = pre.vwap ? pre.vwap.price : (pre.ema?.ema21 ?? null);
    if (en('s12') && atVwapOrEma && context.bos?.distPct <= s12BosDist) {
      const bPct = (c0.high - c0.low) > 0 ? Math.abs(c0.close - c0.open) / (c0.high - c0.low) : 0;
      if (bPct >= 0.35)
        setups.push({ id: `s12_confluence_${isBull0 ? 'bull' : 'bear'}`, name: 'VWAP + Level Confluence',
          direction: isBull0 ? 'bull' : 'bear', strength: 4,
          sl: anchorSl ? (isBull0 ? anchorSl * 0.999 : anchorSl * 1.001) : null, target: null,
          details: { vwapDist: pre.vwap?.distPct ?? null, bosDist: context.bos.distPct, usedEmaFallback: !pre.vwap } });
    }
  }

  // ── S13: Liquidity Sweep + CHoCH ─────────────────────────────────────────
  // Prior candle swept a swing high/low; current candle confirms direction change.
  if (en('s13') && candles.length >= 16) {
    const c1    = candles[n - 2];
    const sl16  = candles.slice(-16, -1);
    const sH    = Math.max(...sl16.slice(0, -1).map(c => c.high));
    const sL    = Math.min(...sl16.slice(0, -1).map(c => c.low));
    const thr   = 0.001;
    // CHoCH confirmation: close beyond midpoint of sweep candle (relaxed from full candle high/low)
    const c1Mid = (c1.high + c1.low) / 2;
    if (c1.high > sH * (1 + thr) && c1.close < sH && !isBull0 && c0.close < c1Mid)
      setups.push({ id: 's13_choch_bear', name: 'Liq. Sweep + CHoCH', direction: 'bear', strength: 4,
        sl: c1.high * 1.001, target: null, coversPattern: 'liq_sweep_high',
        details: { sweepHigh: parseFloat(sH.toFixed(2)), chochClose: c0.close } });
    if (c1.low < sL * (1 - thr) && c1.close > sL && isBull0 && c0.close > c1Mid)
      setups.push({ id: 's13_choch_bull', name: 'Liq. Sweep + CHoCH', direction: 'bull', strength: 4,
        sl: c1.low * 0.999, target: null, coversPattern: 'liq_sweep_low',
        details: { sweepLow: parseFloat(sL.toFixed(2)), chochClose: c0.close } });
  }

  // ── S14: FVG Fill at Structure ────────────────────────────────────────────
  // Price enters an unmitigated FVG that sits near a BOS or OB zone, rejection candle present.
  if (en('s14') && pre.fvgs.length) {
    const rejIds = ['hammer','bull_pin','shooting_star','bear_pin',
                    'bull_engulfing','bear_engulfing','doji','morning_star','evening_star'];
    for (const fvg of pre.fvgs) {
      if (c0.close < fvg.low || c0.close > fvg.high) continue;
      // Minimum FVG size: gap must be ≥ 0.2% of price — filters out noise gaps
      const fvgSizePct = (fvg.high - fvg.low) / fvg.low * 100;
      if (fvgSizePct < 0.2) continue;
      const nearBOS = pre.bosLevels.some(b => Math.abs(b.price - fvg.mid) / fvg.mid * 100 <= 0.5);
      const nearOB  = pre.orderBlocks.some(ob => ob.low <= fvg.high * 1.002 && ob.high >= fvg.low * 0.998);
      if (!(nearBOS || nearOB)) continue;
      const hasRej  = patterns.some(p => rejIds.includes(p.id) && (p.direction === fvg.type || p.direction === 'neutral'));
      if (hasRej) {
        setups.push({ id: `s14_fvg_${fvg.type}`, name: 'FVG Fill at Structure', direction: fvg.type, strength: 4,
          sl: fvg.type === 'bull' ? fvg.low * 0.999 : fvg.high * 1.001, target: null,
          details: { fvgHigh: parseFloat(fvg.high.toFixed(2)), fvgLow: parseFloat(fvg.low.toFixed(2)), nearBOS, nearOB } });
        break;
      }
    }
  }

  // ── S15: OTE Fibonacci (62–79% retracement) ───────────────────────────────
  // BOS with impulse ≥ 1.5%, price retraces into 62–79% zone.
  // BOS must be recent (within last 50 candles).
  if (en('s15') && pre.bosLevels.length) {
    const bos15 = pre.bosLevels.reduce((a, b) => b.idx > a.idx ? b : a);
    if (bos15.breakIdx !== undefined && (n - 1 - bos15.breakIdx) <= 50) {
      const iS = candles[bos15.idx], iE = candles[bos15.breakIdx];
      if (iS && iE) {
        const iH = bos15.type === 'bull' ? iE.high : iS.high;
        const iL = bos15.type === 'bull' ? iS.low  : iE.low;
        const iR = iH - iL;
        const movePct = iR / iL * 100;
        if (movePct >= t('s15', 'minMovePct', 1.5)) {
          const ote62 = bos15.type === 'bull' ? iH - iR * 0.62 : iL + iR * 0.62;
          const ote79 = bos15.type === 'bull' ? iH - iR * 0.79 : iL + iR * 0.79;
          const inOTE = bos15.type === 'bull'
            ? c0.close >= ote79 && c0.close <= ote62
            : c0.close >= ote62 && c0.close <= ote79;
          if (inOTE) {
            // Target: 127% extension of impulse beyond the impulse high/low
            const ext127 = bos15.type === 'bull' ? iL + iR * 1.27 : iH - iR * 1.27;
            setups.push({ id: `s15_ote_${bos15.type}`, name: 'OTE Retracement', direction: bos15.type, strength: 4,
              sl: bos15.type === 'bull' ? ote79 * 0.999 : ote79 * 1.001,
              target: parseFloat(ext127.toFixed(2)),
              details: { ote62: parseFloat(ote62.toFixed(2)), ote79: parseFloat(ote79.toFixed(2)), movePct: parseFloat(movePct.toFixed(2)), iH: parseFloat(iH.toFixed(2)), iL: parseFloat(iL.toFixed(2)) } });
          }
        }
      }
    }
  }

  // ── S16: Wyckoff Spring / Upthrust ───────────────────────────────────────
  // Price briefly breaks a defined trading range boundary then snaps back inside.
  // Require ≥2 prior candles fully inside range (confirms it's a real range, not trend break).
  if (en('s16') && pre.tradingRange) {
    const { high: rH, low: rL } = pre.tradingRange;
    const rng = c0.high - c0.low || 1;
    // Count candles fully inside range in recent history (excluding current)
    const insideCount = candles.slice(-8, -1).filter(c => c.low >= rL && c.high <= rH).length;
    if (insideCount >= 2) {
      if (c0.low < rL && c0.close > rL && (c0.close - c0.low) / rng >= 0.5)
        setups.push({ id: 's16_spring', name: 'Wyckoff Spring', direction: 'bull', strength: 4,
          sl: c0.low * 0.999, target: rH,
          details: { rangeLow: rL, rangeHigh: rH, wickLow: c0.low, insideCount } });
      if (c0.high > rH && c0.close < rH && (c0.high - c0.close) / rng >= 0.5)
        setups.push({ id: 's16_upthrust', name: 'Wyckoff Upthrust', direction: 'bear', strength: 4,
          sl: c0.high * 1.001, target: rL,
          details: { rangeLow: rL, rangeHigh: rH, wickHigh: c0.high, insideCount } });
    }
  }

  // ── S17: Confluence Stack (3+ independent factors) ────────────────────────
  // No dominant pattern needed — multiple independent signals at same price.
  if (en('s17')) {
    let factors = 0, stackDir = null;
    if (context.bos?.distPct <= 0.2)           { factors++; stackDir = context.bos.type; }
    if (context.orderBlock)                     { factors++; }
    if (pre.fvgs.some(f => c0.close >= f.low && c0.close <= f.high)) factors++;
    if (pre.vwap?.atVwap)                       { factors++; }
    if (pre.ema?.atEma21 || pre.ema?.atEma50)   { factors++; }
    if (pre.rsi != null && pre.rsi < 30)        { factors++; if (!stackDir) stackDir = 'bull'; }
    if (pre.rsi != null && pre.rsi > 70)        { factors++; if (!stackDir) stackDir = 'bear'; }
    if (pre.volume.context === 'climax') factors++;  // dry-up removed — too common to be meaningful
    if (patterns.some(p => ['liq_sweep_high','liq_sweep_low'].includes(p.id))) factors++;
    if (pre.tradingRange) {
      const atBoundary =
        Math.abs(c0.close - pre.tradingRange.high) / pre.tradingRange.high * 100 <= 0.2 ||
        Math.abs(c0.close - pre.tradingRange.low)  / pre.tradingRange.low  * 100 <= 0.2;
      if (atBoundary) factors++;
    }
    if (factors >= t('s17', 'minFactors', 3) && stackDir) {
      const hasConf = patterns.some(p => p.direction === stackDir || p.direction === 'neutral');
      if (hasConf)
        setups.push({ id: `s17_confluence_${stackDir}`, name: 'Confluence Stack', direction: stackDir, strength: 5,
          sl: null, target: null, details: { factors } });
    }
  }

  // ── S18: BB Momentum Breakout ─────────────────────────────────────────────
  // Close breaks outside Bollinger Band (20,2), same-direction candle,
  // RSI(12) aligned (>50 bull / <50 bear), vol ≥ 1.5×,
  // close breaks prior 10-candle swing high/low.
  // Non-opening candles: range must be ≤ 1.5× ATR14 (no chasing runaway spikes).
  // Opening candle gets a pass on range — gap moves are inherently wide.
  // SL: if candle body ≤ 1× ATR → c0.open; if body > 1× ATR (wide/gap candle) → c0.close ± 1 ATR.
  // ── S19: Flag & Pole Breakout ─────────────────────────────────────────────
  // Pole (3–5 candles, ≥1.5% move) + tight flag (3–6 candles, ≤0.8% range,
  // ≤40% retracement of pole). Breakout candle closes beyond flag high/low
  // with volume expansion. SL: far edge of flag. Strength 4 (same as IB Breakout).
  if (en('s19') && candles.length >= 15) {
    const flagSetup = patterns.find(p => p.id === 'bull_flag' || p.id === 'bear_flag');
    if (flagSetup) {
      const s19Vol = t('s19', 'volMult', 1.3);
      if (pre.volume.mult >= s19Vol) {
        const isBullFlag = flagSetup.id === 'bull_flag';
        // Use exact flag range stored in flagSetup.details by detectFlagAndPole
        const flagHigh = flagSetup.details?.flagHigh ?? Math.max(...candles.slice(-8, -1).map(c => c.high));
        const flagLow  = flagSetup.details?.flagLow  ?? Math.min(...candles.slice(-8, -1).map(c => c.low));
        setups.push({
          id:            isBullFlag ? 's19_flag_bull' : 's19_flag_bear',
          name:          isBullFlag ? 'Bull Flag Breakout' : 'Bear Flag Breakdown',
          direction:     isBullFlag ? 'bull' : 'bear',
          strength:      4,
          sl:            isBullFlag ? flagLow * 0.999 : flagHigh * 1.001,
          target:        null,
          coversPattern: flagSetup.id,
          details:       flagSetup.details,
        });
      }
    }
  }

  // ── S20: EMA9 × EMA21 Crossover + VWAP confirmation ─────────────────────────
  if (en('s20') && candles.length >= 30) {
    const h9  = computeEMAHistory(candles, 9);
    const h21 = computeEMAHistory(candles, 21);

    if (h9 && h21) {
      const bullCross = h9.prev <= h21.prev && h9.cur > h21.cur;
      const bearCross = h9.prev >= h21.prev && h9.cur < h21.cur;
      const aboveVwap = pre.vwap ? c0.close > pre.vwap.price : c0.close > h21.cur;
      const belowVwap = pre.vwap ? c0.close < pre.vwap.price : c0.close < h21.cur;

      const slBuf = (c0.high - c0.low) * 0.3;

      if (bullCross && aboveVwap) {
        const sl  = parseFloat((Math.min(c0.low, c1.low) - slBuf).toFixed(2));
        const rng = c0.close - sl;
        setups.push({
          id: 's20_ema_cross_bull', name: 'EMA Cross Bull', direction: 'bull', strength: 4,
          sl,
          target: parseFloat((c0.close + rng * 2).toFixed(2)),
          lifecycle: { slType: 'trailing', trailIndicator: 'ema9' },
          details: { ema9: parseFloat(h9.cur.toFixed(2)), ema21: parseFloat(h21.cur.toFixed(2)), vwap: pre.vwap?.price ?? null },
        });
      }

      if (bearCross && belowVwap) {
        const sl  = parseFloat((Math.max(c0.high, c1.high) + slBuf).toFixed(2));
        const rng = sl - c0.close;
        setups.push({
          id: 's20_ema_cross_bear', name: 'EMA Cross Bear', direction: 'bear', strength: 4,
          sl,
          target: parseFloat((c0.close - rng * 2).toFixed(2)),
          lifecycle: { slType: 'trailing', trailIndicator: 'ema9' },
          details: { ema9: parseFloat(h9.cur.toFixed(2)), ema21: parseFloat(h21.cur.toFixed(2)), vwap: pre.vwap?.price ?? null },
        });
      }
    }
  }

  // ── S21: VWAP Reclaim ─────────────────────────────────────────────────────
  // Previous candle was 15–90pts away from VWAP; current candle actually
  // crosses and closes on the other side of VWAP (true reclaim/rejection).
  if (en('s21') && pre.vwap && candles.length >= 20) {
    const s21c1      = candles[candles.length - 2]; // previous candle
    const vwapPrice  = pre.vwap.price;
    const prevDist   = s21c1.close - vwapPrice;  // how far prev candle was from VWAP
    const absPrevDist = Math.abs(prevDist);
    const r0         = c0.high - c0.low;
    const r1         = s21c1.high - s21c1.low;
    const bullClose  = c0.close > c0.open;        // current candle is green
    const bearClose  = c0.close < c0.open;        // current candle is red

    // Prev candle must have been 15–90pts from VWAP (extended but not extreme)
    if (absPrevDist >= 15 && absPrevDist <= 90) {

      // BULL RECLAIM: prev candle closed below VWAP, current candle closes above VWAP
      // + green candle + range not blowing out (not a runaway move)
      if (prevDist < 0 && c0.close > vwapPrice && bullClose && r0 < r1 * 1.5) {
        const sl  = parseFloat((Math.min(c0.low, s21c1.low) - 10).toFixed(2));
        const rng = c0.close - sl;
        if (rng >= 5 && rng <= 60) {
          setups.push({
            id: 's21_vwap_reclaim_bull', name: 'VWAP Reclaim', direction: 'bull', strength: 4,
            sl,
            target: parseFloat((vwapPrice + Math.max(rng * 1.5, 30)).toFixed(2)),
            lifecycle: { slType: 'trailing', trailIndicator: 'ema9' },
            details: { vwap: parseFloat(vwapPrice.toFixed(2)), prevDistFromVwap: parseFloat(absPrevDist.toFixed(1)) },
          });
        }
      }

      // BEAR REJECTION: prev candle closed above VWAP, current candle closes below VWAP
      // + red candle + range not blowing out
      if (prevDist > 0 && c0.close < vwapPrice && bearClose && r0 < r1 * 1.5) {
        const sl  = parseFloat((Math.max(c0.high, s21c1.high) + 10).toFixed(2));
        const rng = sl - c0.close;
        if (rng >= 5 && rng <= 60) {
          setups.push({
            id: 's21_vwap_reclaim_bear', name: 'VWAP Reclaim', direction: 'bear', strength: 4,
            sl,
            target: parseFloat((vwapPrice - Math.max(rng * 1.5, 30)).toFixed(2)),
            lifecycle: { slType: 'trailing', trailIndicator: 'ema9' },
            details: { vwap: parseFloat(vwapPrice.toFixed(2)), prevDistFromVwap: parseFloat(absPrevDist.toFixed(1)) },
          });
        }
      }
    }
  }

  if (en('s18') && pre.bb && candles.length >= 21) {
    const { upper, middle, lower } = pre.bb;
    const atr        = pre.atr14;
    const s18Vol     = t('s18', 'volMult', 1.5);
    const candleRange = c0.high - c0.low;
    const candleBody  = Math.abs(c0.close - c0.open);
    const isOpening  = pre.sessionTime === 'opening';
    const prior10H   = Math.max(...candles.slice(-11, -1).map(c => c.high));
    const prior10L   = Math.min(...candles.slice(-11, -1).map(c => c.low));

    // ATR range gate: skip mid-session runaway candles (opening candle exempt)
    const passesRangeGate = !atr || isOpening || candleRange <= 2.0 * atr;

    // Two-tier SL: tight when candle is normal, ATR-capped when candle is wide
    const wideCandle  = atr && candleBody > atr;
    const slBull = wideCandle ? parseFloat((c0.close - atr).toFixed(2)) : c0.open;
    const slBear = wideCandle ? parseFloat((c0.close + atr).toFixed(2)) : c0.open;

    if (
      c0.close > upper &&
      isBull0 &&
      (pre.rsi == null || pre.rsi > 50) &&
      pre.volume.mult >= s18Vol &&
      c0.close > prior10H &&
      passesRangeGate
    ) {
      setups.push({
        id: 's18_bb_bull', name: 'BB Momentum Breakout', direction: 'bull', strength: 4,
        sl: slBull, target: null,
        lifecycle: { slType: 'trailing', exitCondition: 'middle_band' },
        details: { upper, middle, volMult: pre.volume.mult, wideCandle: !!wideCandle },
      });
    }

    if (
      c0.close < lower &&
      !isBull0 &&
      (pre.rsi == null || pre.rsi < 50) &&
      pre.volume.mult >= 1.5 &&
      c0.close < prior10L &&
      passesRangeGate
    ) {
      setups.push({
        id: 's18_bb_bear', name: 'BB Momentum Breakout', direction: 'bear', strength: 4,
        sl: slBear, target: null,
        lifecycle: { slType: 'trailing', exitCondition: 'middle_band' },
        details: { lower, middle, volMult: pre.volume.mult, wideCandle: !!wideCandle },
      });
    }
  }

  return setups;
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 5 — SETUP SCORER
// Adds context bonuses to a setup's base strength.
// ─────────────────────────────────────────────────────────────────────────────

export function scoreSetup(pattern, context, environment) {
  const base = pattern.strength * 2;

  // Environment: tight market = harder to score (threshold is higher externally)
  const envMap  = { tight: 2, medium: 1, light: 0 };
  const envBonus = envMap[environment] ?? 1;

  // Trend alignment
  let trendBonus = 0;
  if (context.trend !== 'ranging') {
    const tBull = context.trend === 'uptrend';
    const pBull = pattern.direction === 'bull';
    const pBear = pattern.direction === 'bear';
    if ((tBull && pBull) || (!tBull && pBear)) trendBonus = 2;
    else if ((tBull && pBear) || (!tBull && pBull)) trendBonus = -2;
  }

  // Location bonus
  let locationBonus = 0;
  if (context.vwap?.atVwap)                                       locationBonus = Math.max(locationBonus, 1);
  if (context.bos?.distPct <= 0.3)                                locationBonus = Math.max(locationBonus, 2);
  if (context.orderBlock && context.bos?.distPct <= 0.2)          locationBonus = Math.max(locationBonus, 3);
  else if (context.orderBlock)                                     locationBonus = Math.max(locationBonus, 2);
  if (context.ema?.atEma21 || context.ema?.atEma50)               locationBonus = Math.max(locationBonus, 1);

  // Volume
  let volumeBonus = 0;
  const volCtx       = context.volume?.context;
  const trendAligned = (context.trend === 'uptrend' && pattern.direction === 'bull') ||
                       (context.trend === 'downtrend' && pattern.direction === 'bear');
  const counterTrend = (context.trend === 'uptrend' && pattern.direction === 'bear') ||
                       (context.trend === 'downtrend' && pattern.direction === 'bull');
  if (volCtx === 'climax' && counterTrend)  volumeBonus =  2;
  else if (volCtx === 'high' && trendAligned) volumeBonus = 2;
  else if (volCtx === 'dryup')              volumeBonus = -1;

  // RSI
  let rsiBonus = 0;
  const rsi = context.rsi;
  if (rsi != null) {
    if (pattern.direction === 'bull' && rsi < 40) rsiBonus =  1;
    if (pattern.direction === 'bear' && rsi > 60) rsiBonus =  1;
    if (pattern.direction === 'bull' && rsi > 70) rsiBonus = -2;
    if (pattern.direction === 'bear' && rsi < 30) rsiBonus = -2;
  }

  // Session penalties
  let penalties = 0;
  if (context.sessionTime === 'opening') penalties -= 2;
  if (context.sessionTime === 'closing') penalties -= 1;

  const total = Math.min(10, Math.max(0, base + envBonus + trendBonus + locationBonus + volumeBonus + rsiBonus + penalties));
  return { total, breakdown: { base, envBonus, trendBonus, locationBonus, volumeBonus, rsiBonus, penalties } };
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 6 — ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

export function runThirdEye(candles, vwapData, rsiValue, environment = 'medium', setupConfig = {}) {
  if (!candles || candles.length < 3) {
    return { patterns: [], context: null, topSetup: null, watchList: [], strongSetups: [] };
  }

  // Layer 1: pre-compute everything once
  const pre = precompute(candles, vwapData, rsiValue);

  // Layer 2: pattern detection (reads from pre, no re-scanning)
  const rawPatterns = detectPatterns(candles, pre);

  // Layer 3: context assembly (reads from pre, no re-scanning)
  const context = buildContext(candles, pre);

  // Layer 4: setup detection — multi-condition setups
  const setups = detectSetups(candles, rawPatterns, context, pre, setupConfig);

  // Suppress raw patterns already covered by a setup (coversPattern mechanism)
  const coveredIds       = new Set(setups.map(s => s.coversPattern).filter(Boolean));
  const residualPatterns = rawPatterns.filter(p => !coveredIds.has(p.id));

  // Layer 5: score setups only — residual raw patterns excluded from cards
  const scored = setups.map(p => {
    const { total, breakdown } = scoreSetup(p, context, environment);
    return { pattern: p, score: total, scoreBreakdown: breakdown };
  });

  scored.sort((a, b) => b.score - a.score);

  // Score residual patterns separately (used for narrative hints, not log cards)
  const scoredPatterns = residualPatterns.map(p => {
    const { total } = scoreSetup(p, context, environment);
    return { pattern: p, score: total };
  }).sort((a, b) => b.score - a.score);

  return {
    patterns:     scored,
    rawPatterns:  scoredPatterns,   // supporting candlestick patterns (not shown as cards)
    context,
    topSetup:     scored[0] ?? null,
    watchList:    scored.filter(p => p.score >= 3 && (p.score < 6 || p.pattern.watchlistOnly)),
    strongSetups: scored.filter(p => p.score >= 6 && !p.pattern.watchlistOnly),
  };
}
