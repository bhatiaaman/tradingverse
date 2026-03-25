// ── Human Eye — Pattern Observer Engine ──────────────────────────────────────
// Architecture:
//   1. precompute()       — runs once per scan, all expensive calculations
//   2. detectPatterns()   — uses precomputed data, no re-scanning
//   3. buildContext()     — assembles context object from precomputed data
//   4. detectSetups()     — multi-condition setups (S1–S17)
//   5. scoreSetup()       — adds context bonuses to setup base strength
//   6. runHumanEye()      — orchestrates all layers


// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function getSessionTime(candles) {
  if (!candles?.length) return 'midday';
  const ts  = candles[candles.length - 1].time;
  const ist = new Date((ts + 5.5 * 3600) * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (mins < 555)  return 'premarket';
  if (mins <= 570) return 'opening';    // 9:15–9:30
  if (mins < 870)  return 'midday';    // 9:30–14:30
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
  const refStart = Math.max(0, lookback - 24);
  const refEnd   = Math.max(0, lookback - 4);
  const refSlice = candles.slice(refStart, refEnd);
  if (!refSlice.length) return { mult: 1, context: 'normal' };
  const avgVol  = refSlice.reduce((s, c) => s + (c.volume || 0), 0) / refSlice.length;
  const lastVol = candles[lookback]?.volume || 0;
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
      const details    = { poleMovePct: parseFloat(poleMovePct.toFixed(2)), flagRangePct: parseFloat(flagRangePct.toFixed(2)) };

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
    atVwap:  distPct <= 0.15,
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
    orb:            computeORB(candles),
    ema:            computeEMAStack(candles),
    fvgs:           detectFVGs(candles),
    tradingRange:   detectTradingRange(candles),
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
  // Trend from swing sequence, fallback to linear price direction
  let trend = 'ranging', trendStrength = 'weak';
  if (pre.swingSequence) {
    trend = pre.swingSequence.type;
    const { highs, lows } = pre.swingPivots2;
    trendStrength = highs.length >= 3 && lows.length >= 3 ? 'strong' : 'weak';
  } else if (candles.length >= 10) {
    const first  = candles[candles.length - 10].close;
    const last   = candles[candles.length - 1].close;
    const chgPct = (last - first) / first * 100;
    if (chgPct > 0.5)  trend = 'uptrend';
    if (chgPct < -0.5) trend = 'downtrend';
  }

  // BOS context — most recently detected
  let bos = null;
  if (pre.bosLevels.length) {
    const lastClose  = candles[candles.length - 1].close;
    const mostRecent = pre.bosLevels.reduce((a, b) => b.idx > a.idx ? b : a);
    const distPct    = parseFloat(Math.abs((lastClose - mostRecent.price) / mostRecent.price * 100).toFixed(2));
    bos = { type: mostRecent.type, price: mostRecent.price, distPct };
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
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4 — SETUP DETECTION (stub — S1–S6 coming next)
// ─────────────────────────────────────────────────────────────────────────────

export function detectSetups(candles, patterns, context, pre) {
  // Placeholder — setup library builds here in next phase
  // Returns same shape as patterns for now
  return patterns;
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

  const total = Math.max(0, base + envBonus + trendBonus + locationBonus + volumeBonus + rsiBonus + penalties);
  return { total, breakdown: { base, envBonus, trendBonus, locationBonus, volumeBonus, rsiBonus, penalties } };
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 6 — ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

export function runHumanEye(candles, vwapData, rsiValue, environment = 'medium') {
  if (!candles || candles.length < 3) {
    return { patterns: [], context: null, topSetup: null, watchList: [], strongSetups: [] };
  }

  // Layer 1: pre-compute everything once
  const pre = precompute(candles, vwapData, rsiValue);

  // Layer 2: pattern detection (reads from pre, no re-scanning)
  const rawPatterns = detectPatterns(candles, pre);

  // Layer 3: context assembly (reads from pre, no re-scanning)
  const context = buildContext(candles, pre);

  // Layer 4: setup detection (stub for now — setup library next)
  const allSetups = detectSetups(candles, rawPatterns, context, pre);

  // Layer 5: score each setup
  const scored = allSetups.map(p => {
    const { total, breakdown } = scoreSetup(p, context, environment);
    return { pattern: p, score: total, scoreBreakdown: breakdown };
  });

  scored.sort((a, b) => b.score - a.score);

  return {
    patterns:     scored,
    context,
    topSetup:     scored[0] ?? null,
    watchList:    scored.filter(p => p.score >= 3 && p.score < 6),
    strongSetups: scored.filter(p => p.score >= 6),
  };
}
