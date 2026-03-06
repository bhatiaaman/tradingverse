// Copyright (c) 2025 Amandeep Bhatia — TradePreflight
// Licensed under Apache 2.0 — https://github.com/amanbhatia/tradepreflight
// ─────────────────────────────────────────────────────────────────────────────
// Pattern Agent — answers "What is price action saying in the last 1-5 candles?"
// Checks candle patterns, volume alignment, ATR-based size, and structure.
//
// MIS (intraday)  → 8 checks on 15m candles
// NRML / CNC      → 8 + 4 = 12 checks (15m + daily)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Direction helper (same as behavioral + structure)
// ─────────────────────────────────────────────────────────────────────────────
function getTradeBias(instrumentType, transactionType) {
  if (instrumentType === 'CE') return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH';
  if (instrumentType === 'PE') return transactionType === 'BUY' ? 'BEARISH' : 'BULLISH';
  return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH'; // EQ / FUT
}

// ─────────────────────────────────────────────────────────────────────────────
// ATR — Wilder's smoothed (not in codebase elsewhere)
// ─────────────────────────────────────────────────────────────────────────────
function calcATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close)
    ));
  }
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candlestick pattern detector — copied from behavioral-agent/route.js
// Returns array of { name, candles, direction, meaning, strength }
// ─────────────────────────────────────────────────────────────────────────────
function detectPatterns(candles) {
  if (!candles || candles.length < 3) return [];
  const patterns = [];
  const last3 = candles.slice(-3);
  const [c1, c2, c3] = last3;

  const body    = c => Math.abs(c.close - c.open);
  const range   = c => c.high - c.low;
  const isBull  = c => c.close > c.open;
  const isBear  = c => c.close < c.open;
  const isDoji  = c => range(c) > 0 && body(c) / range(c) < 0.1;

  // ── 1-candle on c3 ──
  if (isDoji(c3)) {
    patterns.push({ name: 'Doji', candles: 1, direction: 'neutral',
      meaning: 'Indecision — buyers and sellers in balance. Wait for confirmation.', strength: 'weak' });
  }

  const upperWick3 = c3.high - Math.max(c3.open, c3.close);
  const lowerWick3 = Math.min(c3.open, c3.close) - c3.low;

  if (lowerWick3 > body(c3) * 2 && upperWick3 < body(c3) * 0.5 && range(c3) > 0) {
    const name = isBull(c3) ? 'Hammer' : 'Hanging Man';
    patterns.push({ name, candles: 1, direction: isBull(c3) ? 'bullish' : 'bearish',
      meaning: isBull(c3)
        ? 'Buyers rejected lower prices — potential reversal up.'
        : 'Hanging Man after uptrend signals potential reversal down.',
      strength: 'moderate' });
  }

  if (upperWick3 > body(c3) * 2 && lowerWick3 < body(c3) * 0.5 && range(c3) > 0) {
    const name = isBear(c3) ? 'Shooting Star' : 'Inverted Hammer';
    patterns.push({ name, candles: 1, direction: isBear(c3) ? 'bearish' : 'neutral',
      meaning: isBear(c3)
        ? 'Sellers rejected higher prices — potential reversal down.'
        : 'Inverted Hammer — needs bullish confirmation next candle.',
      strength: 'moderate' });
  }

  // ── 2-candle on c2+c3 ──
  if (isBear(c2) && isBull(c3) && c3.open < c2.close && c3.close > c2.open && body(c3) > body(c2)) {
    patterns.push({ name: 'Bullish Engulfing', candles: 2, direction: 'bullish',
      meaning: 'Bulls fully engulfed previous bearish candle — strong reversal signal.', strength: 'strong' });
  }

  if (isBull(c2) && isBear(c3) && c3.open > c2.close && c3.close < c2.open && body(c3) > body(c2)) {
    patterns.push({ name: 'Bearish Engulfing', candles: 2, direction: 'bearish',
      meaning: 'Bears fully engulfed previous bullish candle — strong reversal signal.', strength: 'strong' });
  }

  if (isBull(c2) && isBear(c3) && c3.open < c2.close && c3.close > c2.open && body(c3) < body(c2)) {
    patterns.push({ name: 'Bearish Harami', candles: 2, direction: 'bearish',
      meaning: 'Inside bearish candle after bullish — momentum slowing.', strength: 'moderate' });
  }

  if (isBear(c2) && isBull(c3) && c3.open > c2.close && c3.close < c2.open && body(c3) < body(c2)) {
    patterns.push({ name: 'Bullish Harami', candles: 2, direction: 'bullish',
      meaning: 'Inside bullish candle after bearish — potential base forming.', strength: 'moderate' });
  }

  // ── 3-candle on c1+c2+c3 ──
  if (isBear(c1) && isDoji(c2) && isBull(c3) &&
      c3.close > (c1.open + c1.close) / 2 && body(c3) > body(c1) * 0.5) {
    patterns.push({ name: 'Morning Star', candles: 3, direction: 'bullish',
      meaning: 'Classic reversal: down-doji-up. Strong bullish signal after downtrend.', strength: 'strong' });
  }

  if (isBull(c1) && isDoji(c2) && isBear(c3) &&
      c3.close < (c1.open + c1.close) / 2 && body(c3) > body(c1) * 0.5) {
    patterns.push({ name: 'Evening Star', candles: 3, direction: 'bearish',
      meaning: 'Classic reversal: up-doji-down. Strong bearish signal after uptrend.', strength: 'strong' });
  }

  if (isBull(c1) && isBull(c2) && isBull(c3) &&
      c2.close > c1.close && c3.close > c2.close &&
      body(c2) > body(c1) * 0.7 && body(c3) > body(c2) * 0.7) {
    patterns.push({ name: 'Three White Soldiers', candles: 3, direction: 'bullish',
      meaning: 'Three consecutive strong bullish candles — sustained buying pressure.', strength: 'strong' });
  }

  if (isBear(c1) && isBear(c2) && isBear(c3) &&
      c2.close < c1.close && c3.close < c2.close &&
      body(c2) > body(c1) * 0.7 && body(c3) > body(c2) * 0.7) {
    patterns.push({ name: 'Three Black Crows', candles: 3, direction: 'bearish',
      meaning: 'Three consecutive strong bearish candles — sustained selling pressure.', strength: 'strong' });
  }

  return patterns;
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume analyser — copied from behavioral-agent/route.js
// Returns { signal, detail, actionable }
// ─────────────────────────────────────────────────────────────────────────────
function analyzeVolume(candles) {
  if (!candles || candles.length < 6) return null;
  const recent     = candles.slice(-5);
  const avgVol     = candles.slice(-20, -5).reduce((s, c) => s + c.volume, 0) / 15;
  const lastCandle = recent[recent.length - 1];
  const prevCandle = recent[recent.length - 2];
  const priceUp    = lastCandle.close > prevCandle.close;
  const volUp      = lastCandle.volume > prevCandle.volume;
  const volRatio   = avgVol > 0 ? lastCandle.volume / avgVol : 1;

  const maxVol = Math.max(...recent.map(c => c.volume));

  if (lastCandle.volume === maxVol && volRatio > 2.5 &&
      Math.abs(lastCandle.close - prevCandle.close) < Math.abs(prevCandle.close - recent[recent.length - 3].close) * 0.5) {
    return { signal: 'climax',
      detail: `Volume climax: ${volRatio.toFixed(1)}× avg, price stalling`,
      actionable: 'Volume climax — exhaustion likely. Watch for sharp reversal.' };
  }
  if ((priceUp && lastCandle.volume < prevCandle.volume) ||
      (!priceUp && lastCandle.volume > prevCandle.volume)) {
    return { signal: 'divergence',
      detail: 'Price and volume diverging — trend may be weakening.',
      actionable: 'Volume divergence: move not confirmed by participation.' };
  }
  if (volRatio < 1 && Math.abs(lastCandle.close - prevCandle.close) > 0.5 * prevCandle.close) {
    return { signal: 'fakeout',
      detail: 'Breakout lacks volume confirmation — risk of fakeout.',
      actionable: 'Low volume breakout — high fakeout risk.' };
  }
  if (volRatio > 1.5 && Math.abs(lastCandle.close - prevCandle.close) < 0.1 * prevCandle.close) {
    return { signal: 'churn',
      detail: `Churn: ${volRatio.toFixed(1)}× avg volume, little price movement.`,
      actionable: 'High volume churn — large players absorbing, direction unclear.' };
  }
  if (priceUp && volUp && volRatio > 1.5) {
    return { signal: 'bullish',
      detail: `Volume ${volRatio.toFixed(1)}× avg — strong buying confirmation`,
      actionable: 'Strong bullish volume.' };
  }
  if (!priceUp && volUp && volRatio > 1.5) {
    return { signal: 'bearish',
      detail: `Volume ${volRatio.toFixed(1)}× avg — strong selling pressure`,
      actionable: 'Strong bearish volume.' };
  }
  if (priceUp && !volUp) {
    return { signal: 'weak_bullish',
      detail: 'Price rising on declining volume — weak move.',
      actionable: 'Weak bullish move — may not sustain without volume.' };
  }
  if (!priceUp && !volUp) {
    return { signal: 'weak_bearish',
      detail: 'Price falling on declining volume — weak selling.',
      actionable: 'Weak selling — may find support.' };
  }
  return { signal: 'neutral', detail: `Volume near average (${volRatio.toFixed(1)}×)`, actionable: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Map pattern direction against trade bias → severity + riskScore
// Returns highest-severity conflict only (no stacking of same pattern list)
// ─────────────────────────────────────────────────────────────────────────────
function evaluatePatterns(patterns, tradeBias) {
  const BIAS_OPPOSITE = { BULLISH: 'bearish', BEARISH: 'bullish' };
  const opposite = BIAS_OPPOSITE[tradeBias];

  // Separate into confirming, neutral, conflicting
  const conflicts  = patterns.filter(p => p.direction === opposite);
  const confirms   = patterns.filter(p =>
    (tradeBias === 'BULLISH' && p.direction === 'bullish') ||
    (tradeBias === 'BEARISH' && p.direction === 'bearish')
  );
  const neutrals   = patterns.filter(p => p.direction === 'neutral');

  if (conflicts.length === 0) {
    if (confirms.length > 0) {
      return { pass: true, label: `Pattern confirms trade: ${confirms.map(p => p.name).join(', ')}` };
    }
    if (neutrals.length > 0) {
      return { pass: true, label: `Neutral pattern — ${neutrals.map(p => p.name).join(', ')} (wait for confirmation)` };
    }
    return { pass: true, label: null };
  }

  // Pick the highest-severity conflict
  const order = { strong: 3, moderate: 2, weak: 1 };
  const worst = conflicts.sort((a, b) => (order[b.strength] ?? 0) - (order[a.strength] ?? 0))[0];

  const severityMap = { strong: 'warning', moderate: 'caution', weak: 'caution' };
  const scoreMap    = { strong: 18,        moderate: 10,         weak: 5 };

  return {
    pass:      false,
    name:      worst.name,
    direction: worst.direction,
    meaning:   worst.meaning,
    severity:  severityMap[worst.strength],
    riskScore: scoreMap[worst.strength],
    allConflicts: conflicts.map(p => p.name),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── 15m CHECKS ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// CHECK 1: Candle patterns on 15m
function checkCandlePatterns15m(data) {
  const candles = data.patternData?.candles15m;
  if (!candles?.length) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const patterns  = detectPatterns(candles);
  if (patterns.length === 0) return null;

  const result = evaluatePatterns(patterns, tradeBias);
  if (result.pass) return null;

  return {
    type:      'PATTERN_CONFLICT_15M',
    severity:  result.severity,
    title:     `${result.name} on 15m — conflicts with ${tradeBias.toLowerCase()} trade`,
    detail:    result.meaning + (result.allConflicts.length > 1
      ? ` (also: ${result.allConflicts.slice(1).join(', ')})` : ''),
    riskScore: result.riskScore,
  };
}

// CHECK 2: Volume alignment on 15m
function checkVolumeAlignment15m(data) {
  const candles = data.patternData?.candles15m;
  if (!candles?.length) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const vol       = analyzeVolume(candles);
  if (!vol) return null;

  const { signal, detail, actionable } = vol;

  // Climax against trade direction
  if (signal === 'climax') {
    return {
      type: 'VOLUME_CLIMAX_15M', severity: 'warning',
      title: 'Volume climax on 15m — exhaustion signal',
      detail: `${detail}. ${actionable}`,
      riskScore: 12,
    };
  }
  // Divergence (price-volume disagreement)
  if (signal === 'divergence') {
    return {
      type: 'VOLUME_DIVERGENCE_15M', severity: 'caution',
      title: 'Volume-price divergence on 15m',
      detail: `${detail} ${actionable}`,
      riskScore: 8,
    };
  }
  // Fakeout breakout (move without volume)
  if (signal === 'fakeout') {
    return {
      type: 'VOLUME_FAKEOUT_15M', severity: 'caution',
      title: 'Low volume move — fakeout risk on 15m',
      detail: actionable,
      riskScore: 10,
    };
  }
  // Weak move against trade direction
  if (signal === 'weak_bullish' && tradeBias === 'BEARISH') {
    return {
      type: 'VOLUME_WEAK_MOVE_15M', severity: 'caution',
      title: 'Weak bullish move (low volume) — conflicting with SELL',
      detail: detail,
      riskScore: 5,
    };
  }
  if (signal === 'weak_bearish' && tradeBias === 'BULLISH') {
    return {
      type: 'VOLUME_WEAK_MOVE_15M', severity: 'caution',
      title: 'Weak bearish move (low volume) — conflicting with BUY',
      detail: detail,
      riskScore: 5,
    };
  }

  return null;
}

// CHECK 3: Big candle on 15m — body > 2× ATR
function checkBigCandle15m(data) {
  const candles = data.patternData?.candles15m;
  if (!candles?.length) return null;

  const atr = calcATR(candles, 14);
  if (!atr) return null;

  const last  = candles[candles.length - 1];
  const body  = Math.abs(last.close - last.open);
  const ratio = body / atr;

  if (ratio < 2) return null;

  return {
    type:      'BIG_CANDLE_15M',
    severity:  'warning',
    title:     `Big candle on 15m — ${ratio.toFixed(1)}× ATR body`,
    detail:    `Last 15m candle body (${body.toFixed(1)}) is ${ratio.toFixed(1)}× the 14-period ATR (${atr.toFixed(1)}). Entering after an extended candle increases mean-reversion risk.`,
    riskScore: 15,
  };
}

// CHECK 4: Inside bar on 15m — current candle inside previous
function checkInsideBar15m(data) {
  const candles = data.patternData?.candles15m;
  if (!candles || candles.length < 2) return null;

  const cur  = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const isInside = cur.high <= prev.high && cur.low >= prev.low;
  if (!isInside) return null;

  return {
    type:      'INSIDE_BAR_15M',
    severity:  'caution',
    title:     'Inside bar on 15m — breakout not yet confirmed',
    detail:    `Current 15m candle is contained within the previous candle's range (${prev.low.toFixed(0)}–${prev.high.toFixed(0)}). Wait for a clear breakout of the inside bar before entering.`,
    riskScore: 8,
  };
}

// CHECK 5: Wick rejection — long wick pointing in trade direction
function checkWickRejection15m(data) {
  const candles = data.patternData?.candles15m;
  if (!candles?.length) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const last      = candles[candles.length - 1];
  const r         = last.high - last.low;
  if (r === 0) return null;

  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  // BUY trade → concerned about upper wick rejection (price tried to go up, rejected)
  // SELL trade → concerned about lower wick rejection (price tried to go down, rejected)
  const wickRatio =
    tradeBias === 'BULLISH' ? upperWick / r :
    tradeBias === 'BEARISH' ? lowerWick / r : 0;

  if (wickRatio < 0.6) return null;

  const direction = tradeBias === 'BULLISH' ? 'upper' : 'lower';
  const side      = tradeBias === 'BULLISH' ? 'sell' : 'buy';

  return {
    type:      'WICK_REJECTION_15M',
    severity:  'caution',
    title:     `Wick rejection on 15m — ${side}ers rejected your entry direction`,
    detail:    `Last 15m candle has a ${direction} wick covering ${Math.round(wickRatio * 100)}% of its range. This shows supply/demand zone resistance in your trade direction.`,
    riskScore: 10,
  };
}

// CHECK 6: Consecutive candles moving AGAINST trade direction
function checkConsecutiveCandles15m(data) {
  const candles = data.patternData?.candles15m;
  if (!candles || candles.length < 3) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const last5     = candles.slice(-5);

  // Count how many consecutive candles at the end are against trade
  let count = 0;
  for (let i = last5.length - 1; i >= 0; i--) {
    const c      = last5[i];
    const isDown = c.close < c.open;
    const isUp   = c.close > c.open;
    const against =
      (tradeBias === 'BULLISH' && isDown) ||
      (tradeBias === 'BEARISH' && isUp);
    if (against) count++;
    else break;
  }

  if (count < 3) return null;

  const dir = tradeBias === 'BULLISH' ? 'bearish' : 'bullish';
  return {
    type:      'CONSECUTIVE_CANDLES_15M',
    severity:  'caution',
    title:     `${count} consecutive ${dir} 15m candles against your trade`,
    detail:    `Last ${count} candles closed ${dir}. Short-term 15m momentum is against your ${tradeBias.toLowerCase()} trade.`,
    riskScore: 8,
  };
}

// CHECK 7: Pin bar (Hammer/Shooting Star variant) against trade direction
function checkPinBar15m(data) {
  const candles = data.patternData?.candles15m;
  if (!candles?.length) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const c         = candles[candles.length - 1];
  const r         = c.high - c.low;
  if (r === 0) return null;

  const body      = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;

  const isPinBar  = body / r < 0.3; // body < 30% of range
  if (!isPinBar) return null;

  // Shooting star type (long upper wick) = bearish rejection → conflicts with BUY
  const shootingStar = upperWick > body * 2 && upperWick > lowerWick;
  // Hammer type (long lower wick) = bullish rejection → conflicts with SELL
  const hammer       = lowerWick > body * 2 && lowerWick > upperWick;

  const conflicts =
    (tradeBias === 'BULLISH' && shootingStar) ||
    (tradeBias === 'BEARISH' && hammer);

  if (!conflicts) return null;

  const patternName = shootingStar ? 'Shooting Star pin bar' : 'Hammer pin bar';
  const direction   = shootingStar ? 'sellers' : 'buyers';

  return {
    type:      'PIN_BAR_15M',
    severity:  'warning',
    title:     `${patternName} on 15m — ${direction} rejected the move`,
    detail:    `Strong wick (${Math.round(Math.max(upperWick, lowerWick) / r * 100)}% of candle range) with a small body (${Math.round(body / r * 100)}% of range). ${direction.charAt(0).toUpperCase() + direction.slice(1)} aggressively rejected this price level.`,
    riskScore: 15,
  };
}

// CHECK 8: Engulfing on last 2 candles
function checkEngulfingRecent15m(data) {
  const candles = data.patternData?.candles15m;
  if (!candles || candles.length < 2) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const prev = candles[candles.length - 2];
  const cur  = candles[candles.length - 1];

  const prevBull = prev.close > prev.open;
  const prevBear = prev.close < prev.open;
  const curBull  = cur.close  > cur.open;
  const curBear  = cur.close  < cur.open;
  const prevBody = Math.abs(prev.close - prev.open);
  const curBody  = Math.abs(cur.close  - cur.open);

  const bullEngulf = prevBear && curBull && cur.open < prev.close && cur.close > prev.open && curBody > prevBody;
  const bearEngulf = prevBull && curBear && cur.open > prev.close && cur.close < prev.open && curBody > prevBody;

  if (!bullEngulf && !bearEngulf) return null;

  const pattern   = bullEngulf ? 'Bullish Engulfing' : 'Bearish Engulfing';
  const direction = bullEngulf ? 'BULLISH' : 'BEARISH';

  if (direction === tradeBias) return null; // confirms — pass

  return {
    type:      'ENGULFING_15M',
    severity:  'warning',
    title:     `${pattern} on 15m — conflicts with ${tradeBias.toLowerCase()} trade`,
    detail:    `${pattern} is a strong ${direction.toLowerCase()} reversal signal. Entering a ${tradeBias.toLowerCase()} trade against this pattern increases risk significantly.`,
    riskScore: 15,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── DAILY CHECKS (NRML / CNC only) ──────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// CHECK 9: Candle patterns on daily
function checkCandlePatternDaily(data) {
  const candles = data.patternData?.candlesDaily;
  if (!candles?.length) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const patterns  = detectPatterns(candles);
  if (patterns.length === 0) return null;

  const result = evaluatePatterns(patterns, tradeBias);
  if (result.pass) return null;

  // Daily patterns carry higher weight — bump score up one tier
  const scoreBoost = result.severity === 'warning' ? 0 : 5; // moderate → closer to warning
  return {
    type:      'PATTERN_CONFLICT_DAILY',
    severity:  result.severity,
    title:     `${result.name} on Daily — conflicts with ${tradeBias.toLowerCase()} swing trade`,
    detail:    result.meaning + ' Daily-level patterns carry higher significance for swing trades.',
    riskScore: result.riskScore + scoreBoost,
  };
}

// CHECK 10: Big daily candle — body > 2× ATR(14) on daily
function checkBigCandleDaily(data) {
  const candles = data.patternData?.candlesDaily;
  if (!candles?.length) return null;

  const atr  = calcATR(candles, 14);
  if (!atr) return null;

  const last  = candles[candles.length - 1];
  const body  = Math.abs(last.close - last.open);
  const ratio = body / atr;

  if (ratio < 2) return null;

  return {
    type:      'BIG_CANDLE_DAILY',
    severity:  'warning',
    title:     `Big daily candle — ${ratio.toFixed(1)}× ATR body`,
    detail:    `Yesterday's daily candle body was ${ratio.toFixed(1)}× the 14-period ATR. Entering the day after a wide-range candle increases mean-reversion risk.`,
    riskScore: 15,
  };
}

// CHECK 11: 4+ consecutive daily candles AGAINST trade direction
function checkConsecutiveDailyCandles(data) {
  const candles = data.patternData?.candlesDaily;
  if (!candles || candles.length < 4) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const last8     = candles.slice(-8);

  let count = 0;
  for (let i = last8.length - 1; i >= 0; i--) {
    const c      = last8[i];
    const isDown = c.close < c.open;
    const isUp   = c.close > c.open;
    const against =
      (tradeBias === 'BULLISH' && isDown) ||
      (tradeBias === 'BEARISH' && isUp);
    if (against) count++;
    else break;
  }

  if (count < 4) return null;

  const dir = tradeBias === 'BULLISH' ? 'bearish' : 'bullish';
  return {
    type:      'CONSECUTIVE_DAILY_CANDLES',
    severity:  'warning',
    title:     `${count} consecutive ${dir} daily candles`,
    detail:    `Daily candles have closed ${dir} for ${count} straight sessions. Strong daily momentum is against your ${tradeBias.toLowerCase()} swing trade.`,
    riskScore: 18,
  };
}

// CHECK 12: Volume alignment on daily
function checkVolumeAlignmentDaily(data) {
  const candles = data.patternData?.candlesDaily;
  if (!candles?.length) return null;

  const vol = analyzeVolume(candles);
  if (!vol) return null;

  const { signal, detail, actionable } = vol;

  if (signal === 'climax') {
    return {
      type: 'VOLUME_CLIMAX_DAILY', severity: 'warning',
      title: 'Volume climax on daily — exhaustion signal',
      detail: `${detail}. ${actionable} Higher significance on daily timeframe for swing trades.`,
      riskScore: 12,
    };
  }
  if (signal === 'divergence') {
    return {
      type: 'VOLUME_DIVERGENCE_DAILY', severity: 'caution',
      title: 'Volume-price divergence on daily',
      detail: `${detail} ${actionable}`,
      riskScore: 8,
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registries — paired [fn, passLabel] so labels never rely on check.name lookup
// ─────────────────────────────────────────────────────────────────────────────
const INTRADAY_CHECKS = [
  [checkCandlePatterns15m,     'No conflicting candle pattern (15m)'],
  [checkVolumeAlignment15m,    'Volume aligned with move (15m)'],
  [checkBigCandle15m,          'Normal candle size — not extended (15m)'],
  [checkInsideBar15m,          'No inside bar — breakout confirmed (15m)'],
  [checkWickRejection15m,      'No wick rejection at entry (15m)'],
  [checkConsecutiveCandles15m, 'No momentum conflict (15m)'],
  [checkPinBar15m,             'No pin bar rejection (15m)'],
  [checkEngulfingRecent15m,    'No conflicting engulfing (15m)'],
];

const SWING_EXTRA_CHECKS = [
  [checkCandlePatternDaily,      'No conflicting daily candle pattern'],
  [checkBigCandleDaily,          'Normal daily candle size'],
  [checkConsecutiveDailyCandles, 'No consecutive daily candles against trade'],
  [checkVolumeAlignmentDaily,    'Daily volume aligned'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Verdict — same thresholds as behavioral and structure
// ─────────────────────────────────────────────────────────────────────────────
function scoreToVerdict(score) {
  if (score === 0)  return 'clear';
  if (score < 20)   return 'caution';
  if (score < 45)   return 'warning';
  return 'danger';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export function runPatternAgent(data) {
  const isSwing  = ['NRML', 'CNC'].includes(data.order.productType?.toUpperCase());
  const registry = isSwing
    ? [...INTRADAY_CHECKS, ...SWING_EXTRA_CHECKS]
    : INTRADAY_CHECKS;

  const checks = registry.map(([check, passLabel]) => {
    try {
      const result = check(data);
      if (result) return { ...result, passed: false };
      return { type: check.name, passed: true, title: passLabel };
    } catch (e) {
      console.error(`Pattern check error [${check.name}]:`, e);
      return { type: check.name, passed: true, title: passLabel };
    }
  });

  const triggered = checks.filter(c => !c.passed);
  const riskScore = triggered.reduce((sum, b) => sum + (b.riskScore ?? 0), 0);
  const verdict   = scoreToVerdict(riskScore);

  return { behaviors: triggered, checks, verdict, riskScore };
}
