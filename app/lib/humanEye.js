// ── Human Eye — Pattern Observer Engine ──────────────────────────────────────
// Pure observer: scans candle data and scores detected patterns.
// No order placement, no side effects.

// ── Session time helpers (IST = UTC+5:30) ────────────────────────────────────
function getSessionTime(candles) {
  if (!candles?.length) return 'midday';
  const lastCandle = candles[candles.length - 1];
  const ts = lastCandle.time; // unix seconds
  const ist = new Date((ts + 5.5 * 3600) * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (mins < 555) return 'premarket';       // before 9:15
  if (mins <= 570) return 'opening';        // 9:15–9:30 (first 15 min)
  if (mins < 870) return 'midday';          // 9:30–14:30
  if (mins <= 930) return 'closing';        // 14:30–15:30
  return 'postmarket';
}

// ── Swing pivot finder ────────────────────────────────────────────────────────
function findSwingPivots(candles, strength = 3) {
  const highs = [];
  const lows = [];
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

// ── BOS detection (standalone, no chart dependency) ──────────────────────────
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
  const bulls = result.filter(r => r.type === 'bull');
  const bears = result.filter(r => r.type === 'bear');
  return [bulls[bulls.length - 1], bears[bears.length - 1]].filter(Boolean);
}

// ── Volume context ────────────────────────────────────────────────────────────
function getVolumeContext(candles) {
  if (!candles || candles.length < 10) return { mult: 1, context: 'normal' };
  const lookback = candles.length - 1;
  const refStart = Math.max(0, lookback - 24);
  const refEnd   = Math.max(0, lookback - 4);
  const refSlice = candles.slice(refStart, refEnd);
  if (!refSlice.length) return { mult: 1, context: 'normal' };
  const avgVol = refSlice.reduce((s, c) => s + (c.volume || 0), 0) / refSlice.length;
  const lastVol = candles[lookback]?.volume || 0;
  if (!avgVol) return { mult: 1, context: 'normal' };
  const mult = parseFloat((lastVol / avgVol).toFixed(1));
  let context = 'normal';
  if (mult >= 3)       context = 'climax';
  else if (mult >= 1.8) context = 'high';
  else if (mult < 0.4)  context = 'dryup';
  else if (mult < 0.7)  context = 'low';
  return { mult, context };
}

// ── Pattern detection ─────────────────────────────────────────────────────────
export function detectPatterns(candles) {
  if (!candles || candles.length < 3) return [];
  const patterns = [];
  const n = candles.length;
  const c0 = candles[n - 1]; // current (last)
  const c1 = candles[n - 2]; // previous
  const c2 = candles[n - 3]; // two back

  const body0  = Math.abs(c0.close - c0.open);
  const range0 = c0.high - c0.low;
  const body1  = Math.abs(c1.close - c1.open);
  const range1 = c1.high - c1.low;
  const body2  = Math.abs(c2.close - c2.open);
  const range2 = c2.high - c2.low;

  const isBull0 = c0.close >= c0.open;
  const isBull1 = c1.close >= c1.open;
  const isBull2 = c2.close >= c2.open;

  const upperWick0 = c0.high - Math.max(c0.open, c0.close);
  const lowerWick0 = Math.min(c0.open, c0.close) - c0.low;

  // ── Single candle patterns ────────────────────────────────────────────────

  // Doji
  if (range0 > 0 && body0 / range0 < 0.10) {
    patterns.push({ id: 'doji', name: 'Doji', direction: 'neutral', strength: 1, candleCount: 1 });
  }

  // Inside bar
  if (c0.high <= c1.high && c0.low >= c1.low) {
    patterns.push({ id: 'inside_bar', name: 'Inside Bar', direction: 'neutral', strength: 1, candleCount: 1 });
  }

  // Hammer (bullish)
  if (range0 > 0) {
    const lowerPct = lowerWick0 / range0;
    const bodyPct  = body0 / range0;
    const upperPct = upperWick0 / range0;
    if (lowerPct >= 0.60 && bodyPct < 0.35 && upperPct < 0.10) {
      patterns.push({ id: 'hammer', name: 'Hammer', direction: 'bull', strength: 2, candleCount: 1 });
    }
    // Shooting star (bearish)
    if (upperPct >= 0.60 && bodyPct < 0.35 && lowerPct < 0.10) {
      patterns.push({ id: 'shooting_star', name: 'Shooting Star', direction: 'bear', strength: 2, candleCount: 1 });
    }
    // Bull pin — broader wick rejection
    if (lowerPct >= 0.70 && !patterns.find(p => p.id === 'hammer')) {
      patterns.push({ id: 'bull_pin', name: 'Bull Pin', direction: 'bull', strength: 2, candleCount: 1 });
    }
    // Bear pin
    if (upperPct >= 0.70 && !patterns.find(p => p.id === 'shooting_star')) {
      patterns.push({ id: 'bear_pin', name: 'Bear Pin', direction: 'bear', strength: 2, candleCount: 1 });
    }
    // Marubozu
    if (body0 / range0 >= 0.90) {
      if (isBull0) {
        patterns.push({ id: 'bull_marubozu', name: 'Bull Marubozu', direction: 'bull', strength: 2, candleCount: 1 });
      } else {
        patterns.push({ id: 'bear_marubozu', name: 'Bear Marubozu', direction: 'bear', strength: 2, candleCount: 1 });
      }
    }
  }

  // ── Two-candle patterns ───────────────────────────────────────────────────

  // Engulfing
  if (range0 > 0 && range1 > 0) {
    const c0Lo = Math.min(c0.open, c0.close);
    const c0Hi = Math.max(c0.open, c0.close);
    const c1Lo = Math.min(c1.open, c1.close);
    const c1Hi = Math.max(c1.open, c1.close);
    if (isBull0 && !isBull1 && c0Lo < c1Lo && c0Hi > c1Hi) {
      patterns.push({ id: 'bull_engulfing', name: 'Bull Engulfing', direction: 'bull', strength: 3, candleCount: 2 });
    }
    if (!isBull0 && isBull1 && c0Lo < c1Lo && c0Hi > c1Hi) {
      patterns.push({ id: 'bear_engulfing', name: 'Bear Engulfing', direction: 'bear', strength: 3, candleCount: 2 });
    }
  }

  // Tweezer bottom
  if (isBull0 && Math.abs(c0.low - c1.low) / Math.max(c0.low, c1.low) <= 0.0005) {
    patterns.push({ id: 'tweezer_bottom', name: 'Tweezer Bottom', direction: 'bull', strength: 3, candleCount: 2 });
  }
  // Tweezer top
  if (!isBull0 && Math.abs(c0.high - c1.high) / Math.max(c0.high, c1.high) <= 0.0005) {
    patterns.push({ id: 'tweezer_top', name: 'Tweezer Top', direction: 'bear', strength: 3, candleCount: 2 });
  }

  // ── Three-candle patterns ─────────────────────────────────────────────────

  if (range0 > 0 && range1 > 0 && range2 > 0) {
    const c1Mid = (c2.open + c2.close) / 2; // c2 = first candle, c1 = middle, c0 = third

    // Morning star: c2 bearish, c1 small body (< 30% of c2), c0 bullish closing above c2 midpoint
    if (!isBull2 && body1 < body2 * 0.30 && isBull0 && c0.close > (c2.open + c2.close) / 2) {
      patterns.push({ id: 'morning_star', name: 'Morning Star', direction: 'bull', strength: 4, candleCount: 3 });
    }

    // Evening star: c2 bullish, c1 small body, c0 bearish closing below c2 midpoint
    if (isBull2 && body1 < body2 * 0.30 && !isBull0 && c0.close < (c2.open + c2.close) / 2) {
      patterns.push({ id: 'evening_star', name: 'Evening Star', direction: 'bear', strength: 4, candleCount: 3 });
    }

    // Three white soldiers: 3 consecutive bullish, each closing higher, each opening within prev body
    if (isBull0 && isBull1 && isBull2 &&
        c0.close > c1.close && c1.close > c2.close &&
        c0.open >= Math.min(c1.open, c1.close) && c0.open <= Math.max(c1.open, c1.close) &&
        c1.open >= Math.min(c2.open, c2.close) && c1.open <= Math.max(c2.open, c2.close)) {
      patterns.push({ id: 'three_white_soldiers', name: 'Three White Soldiers', direction: 'bull', strength: 3, candleCount: 3 });
    }

    // Three black crows: opposite
    if (!isBull0 && !isBull1 && !isBull2 &&
        c0.close < c1.close && c1.close < c2.close &&
        c0.open >= Math.min(c1.open, c1.close) && c0.open <= Math.max(c1.open, c1.close) &&
        c1.open >= Math.min(c2.open, c2.close) && c1.open <= Math.max(c2.open, c2.close)) {
      patterns.push({ id: 'three_black_crows', name: 'Three Black Crows', direction: 'bear', strength: 3, candleCount: 3 });
    }
  }

  // ── Advanced multi-candle patterns ────────────────────────────────────────

  // Inside bar breakout: c1 was an inside bar relative to c2, c0 closes beyond c2's range
  if (c1.high <= c2.high && c1.low >= c2.low) {
    if (c0.close > c2.high) {
      patterns.push({ id: 'inside_bar_breakout', name: 'IB Breakout', direction: 'bull', strength: 3, candleCount: 3 });
    } else if (c0.close < c2.low) {
      patterns.push({ id: 'inside_bar_breakout', name: 'IB Breakdown', direction: 'bear', strength: 3, candleCount: 3 });
    }
  }

  // Liquidity sweep: last candle wicks beyond swing H/L in last 15, but CLOSES back on other side
  if (candles.length >= 15) {
    const slice15 = candles.slice(-15);
    const swingHigh = Math.max(...slice15.slice(0, -1).map(c => c.high));
    const swingLow  = Math.min(...slice15.slice(0, -1).map(c => c.low));
    const threshold = 0.001; // 0.1%

    // Wick above swing high but close back below it (bear sweep / stop hunt above)
    if (c0.high > swingHigh * (1 + threshold) && c0.close < swingHigh) {
      patterns.push({ id: 'liquidity_sweep', name: 'Liq. Sweep High', direction: 'bear', strength: 3, candleCount: 1 });
    }
    // Wick below swing low but close back above it (bull sweep / stop hunt below)
    if (c0.low < swingLow * (1 - threshold) && c0.close > swingLow) {
      patterns.push({ id: 'liquidity_sweep', name: 'Liq. Sweep Low', direction: 'bull', strength: 3, candleCount: 1 });
    }
  }

  // Order block retest: BOS fired, price returned to the range of the last opposing candle before breakout
  if (candles.length >= 20) {
    const slice20 = candles.slice(-20);
    const bosLevels = detectBOSInternal(slice20, 2);
    for (const bos of bosLevels) {
      if (bos.breakIdx === undefined) continue;
      // Find the last opposing candle before the break
      let obCandle = null;
      for (let i = bos.breakIdx - 1; i >= 0; i--) {
        const c = slice20[i];
        if (bos.type === 'bull' && !( c.close >= c.open)) { obCandle = c; break; } // bearish OB before bullish BOS
        if (bos.type === 'bear' && c.close >= c.open)     { obCandle = c; break; } // bullish OB before bearish BOS
      }
      if (!obCandle) continue;
      // Check if current price is within the OB range
      const currentClose = c0.close;
      if (currentClose >= obCandle.low && currentClose <= obCandle.high) {
        patterns.push({
          id: 'order_block_retest',
          name: bos.type === 'bull' ? 'OB Retest (Bull)' : 'OB Retest (Bear)',
          direction: bos.type,
          strength: 4,
          candleCount: 20,
        });
        break; // only one OB retest per scan
      }
    }
  }

  return patterns;
}

// ── Context detection ─────────────────────────────────────────────────────────
export function detectContext(candles, vwapData, rsiValue) {
  if (!candles || candles.length < 10) {
    return {
      trend: 'ranging', trendStrength: 'weak',
      vwap: null, bos: null,
      volume: { mult: 1, context: 'normal' },
      rsi: rsiValue ?? null,
      orderBlock: null,
      sessionTime: 'midday',
    };
  }

  // ── Trend via swing H/L (last 10 candles) ────────────────────────────────
  const slice10 = candles.slice(-10);
  const { highs, lows } = findSwingPivots(slice10, 2);

  let trend = 'ranging';
  let trendStrength = 'weak';

  if (highs.length >= 2 && lows.length >= 2) {
    const lastHighs = highs.slice(-2);
    const lastLows  = lows.slice(-2);
    const higherHighs = lastHighs[1].price > lastHighs[0].price;
    const higherLows  = lastLows[1].price  > lastLows[0].price;
    const lowerHighs  = lastHighs[1].price < lastHighs[0].price;
    const lowerLows   = lastLows[1].price  < lastLows[0].price;

    if (higherHighs && higherLows) {
      trend = 'uptrend';
      trendStrength = highs.length >= 3 && lows.length >= 3 ? 'strong' : 'weak';
    } else if (lowerHighs && lowerLows) {
      trend = 'downtrend';
      trendStrength = highs.length >= 3 && lows.length >= 3 ? 'strong' : 'weak';
    }
  } else {
    // Fallback: linear price direction
    const first = candles[candles.length - 10].close;
    const last  = candles[candles.length - 1].close;
    const chgPct = (last - first) / first * 100;
    if (chgPct > 0.5) trend = 'uptrend';
    else if (chgPct < -0.5) trend = 'downtrend';
  }

  // ── VWAP context ──────────────────────────────────────────────────────────
  let vwap = null;
  if (vwapData?.length) {
    const lastVwap = vwapData[vwapData.length - 1]?.value;
    const lastClose = candles[candles.length - 1].close;
    if (lastVwap) {
      const distPct = parseFloat(Math.abs((lastClose - lastVwap) / lastVwap * 100).toFixed(2));
      vwap = {
        price: lastVwap,
        above: lastClose >= lastVwap,
        distPct,
        atVwap: distPct <= 0.1,
      };
    }
  }

  // ── BOS context ───────────────────────────────────────────────────────────
  let bos = null;
  const bosLevels = detectBOSInternal(candles);
  if (bosLevels.length) {
    const lastClose = candles[candles.length - 1].close;
    // Pick most recently detected BOS
    const mostRecent = bosLevels.reduce((a, b) => (b.idx > a.idx ? b : a));
    const distPct = parseFloat(Math.abs((lastClose - mostRecent.price) / mostRecent.price * 100).toFixed(2));
    bos = { type: mostRecent.type, price: mostRecent.price, distPct };
  }

  // ── Order block ───────────────────────────────────────────────────────────
  let orderBlock = null;
  if (bosLevels.length) {
    const mostRecent = bosLevels.reduce((a, b) => (b.idx > a.idx ? b : a));
    if (mostRecent.breakIdx !== undefined) {
      for (let i = mostRecent.breakIdx - 1; i >= 0; i--) {
        const c = candles[i];
        const isBull = c.close >= c.open;
        if (mostRecent.type === 'bull' && !isBull) {
          orderBlock = { price: (c.high + c.low) / 2, high: c.high, low: c.low, type: 'bear' };
          break;
        }
        if (mostRecent.type === 'bear' && isBull) {
          orderBlock = { price: (c.high + c.low) / 2, high: c.high, low: c.low, type: 'bull' };
          break;
        }
      }
    }
  }

  // ── Volume ────────────────────────────────────────────────────────────────
  const volume = getVolumeContext(candles);

  // ── Session time ──────────────────────────────────────────────────────────
  const sessionTime = getSessionTime(candles);

  return {
    trend,
    trendStrength,
    vwap,
    bos,
    volume,
    rsi: rsiValue ?? null,
    orderBlock,
    sessionTime,
  };
}

// ── Setup scorer ──────────────────────────────────────────────────────────────
export function scoreSetup(pattern, context, environment) {
  const base = pattern.strength * 2; // max 8 for strength-4

  // env bonus
  const envMap = { tight: 2, medium: 1, light: 0 };
  const envBonus = envMap[environment] ?? 1;

  // trend bonus
  let trendBonus = 0;
  if (context.trend !== 'ranging') {
    const trendIsBull = context.trend === 'uptrend';
    const patternIsBull = pattern.direction === 'bull';
    const patternIsBear = pattern.direction === 'bear';
    if ((trendIsBull && patternIsBull) || (!trendIsBull && patternIsBear)) {
      trendBonus = 2;
    } else if ((trendIsBull && patternIsBear) || (!trendIsBull && patternIsBull)) {
      trendBonus = -2;
    }
    // neutral patterns get no trendBonus
  }

  // location bonus
  let locationBonus = 0;
  const lastClose = context.vwap ? null : null; // we'll check via context flags
  if (context.vwap?.atVwap) {
    locationBonus = Math.max(locationBonus, 1);
  }
  if (context.bos && context.bos.distPct <= 0.3) {
    locationBonus = Math.max(locationBonus, 2);
  }
  if (context.orderBlock) {
    // Check if current price is within order block range
    // We approximate with bos distance — if OB exists and bos is very close, treat as near OB
    if (context.bos && context.bos.distPct <= 0.2) {
      locationBonus = Math.max(locationBonus, 3);
    } else {
      locationBonus = Math.max(locationBonus, 2);
    }
  }

  // volume bonus
  let volumeBonus = 0;
  const volCtx = context.volume?.context;
  const isTrendPattern = pattern.direction !== 'neutral';
  const trendAligned = (context.trend === 'uptrend' && pattern.direction === 'bull') ||
                       (context.trend === 'downtrend' && pattern.direction === 'bear');
  const counterTrend  = (context.trend === 'uptrend' && pattern.direction === 'bear') ||
                        (context.trend === 'downtrend' && pattern.direction === 'bull');

  if (volCtx === 'climax' && counterTrend) volumeBonus = 2;
  else if (volCtx === 'high' && trendAligned) volumeBonus = 2;
  else if (volCtx === 'dryup') volumeBonus = -1;

  // RSI bonus
  let rsiBonus = 0;
  const rsi = context.rsi;
  if (rsi != null) {
    if (pattern.direction === 'bull' && rsi < 40)  rsiBonus = 1;
    if (pattern.direction === 'bear' && rsi > 60)  rsiBonus = 1;
    if (pattern.direction === 'bull' && rsi > 70)  rsiBonus = -2;
    if (pattern.direction === 'bear' && rsi < 30)  rsiBonus = -2;
  }

  // session penalty
  let penalties = 0;
  if (context.sessionTime === 'opening')  penalties -= 2;
  if (context.sessionTime === 'closing')  penalties -= 1;

  const total = Math.max(0, base + envBonus + trendBonus + locationBonus + volumeBonus + rsiBonus + penalties);

  return {
    total,
    breakdown: {
      base,
      envBonus,
      trendBonus,
      locationBonus,
      volumeBonus,
      rsiBonus,
      penalties,
    },
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────
export function runHumanEye(candles, vwapData, rsiValue, environment = 'medium') {
  if (!candles || candles.length < 3) {
    return { patterns: [], context: null, topSetup: null, watchList: [], strongSetups: [] };
  }

  const rawPatterns = detectPatterns(candles);
  const context     = detectContext(candles, vwapData, rsiValue);

  const patterns = rawPatterns.map(p => {
    const { total, breakdown } = scoreSetup(p, context, environment);
    return { pattern: p, score: total, scoreBreakdown: breakdown };
  });

  // Sort by score descending
  patterns.sort((a, b) => b.score - a.score);

  const topSetup     = patterns[0] ?? null;
  const watchList    = patterns.filter(p => p.score >= 3 && p.score < 6);
  const strongSetups = patterns.filter(p => p.score >= 6);

  return { patterns, context, topSetup, watchList, strongSetups };
}
