// ═══════════════════════════════════════════════════════════════════════
// INTELLIGENT REVERSAL ZONE DETECTOR
// Multi-factor, context-aware reversal detection
// ═══════════════════════════════════════════════════════════════════════

/**
 * Main entry point
 * @param {Object} data
 * @param {Object} data.price      - { current, dayHigh, dayLow, change5min }
 * @param {Object} data.indicators - { rsi, rsiHistory: number[], macdData: { histogram, prevHistogram, lastCross } }
 * @param {Object} data.volume     - { current, avg, lastCandle: {open, close} }
 * @param {Object} data.oi         - { callOIChange5min, putOIChange5min, pcr }
 * @param {Object} data.levels     - { support: {level, oiChange, strength}, resistance: {level, oiChange, strength} }
 * @param {Object} data.trend      - { direction: 'UP'|'DOWN'|'NEUTRAL' }
 * @returns {Object} reversalResult
 */
export function detectReversalZone(data) {
  const signals = [];

  const rangeSignal    = checkPriceExtremes(data);
  const rsiSignal      = checkRSIReversal(data);
  const volSignal      = checkVolumeReversal(data);
  const oiSignal       = checkOIDivergence(data);
  const levelSignal    = checkKeyLevelTest(data);
  const candleSignal   = checkCandlePattern(data);
  const rsiVelSignal   = checkRSIVelocity(data);
  const macdSignal     = checkMACDCross(data);
  const accelSignal    = checkPriceAcceleration(data);

  if (rangeSignal)    signals.push(rangeSignal);
  if (rsiSignal)      signals.push(rsiSignal);
  if (volSignal)      signals.push(volSignal);
  if (oiSignal)       signals.push(oiSignal);
  if (levelSignal)    signals.push(levelSignal);
  if (candleSignal)   signals.push(candleSignal);
  if (rsiVelSignal)   signals.push(rsiVelSignal);
  if (macdSignal)     signals.push(macdSignal);
  if (accelSignal)    signals.push(accelSignal);

  return synthesizeSignals(signals, data);
}

// ─────────────────────────────────────────────────────────────────────
// Signal 1: Price at day extremes
// ─────────────────────────────────────────────────────────────────────
function checkPriceExtremes(data) {
  const { current, dayHigh, dayLow } = data.price || {};
  if (!current || !dayHigh || !dayLow) return null;

  const distFromHigh = ((dayHigh - current) / dayHigh) * 100;
  const distFromLow  = ((current - dayLow) / current) * 100;

  if (distFromHigh < 0.15) {
    return {
      type: 'NEAR_HIGH',
      direction: 'BEARISH',
      strength: distFromHigh < 0.05 ? 'STRONG' : 'MODERATE',
      message: `At day high ${dayHigh.toFixed(0)} - reversal zone`,
      watch: 'Watch for rejection, volume decline, RSI divergence',
    };
  }

  if (distFromLow < 0.15) {
    return {
      type: 'NEAR_LOW',
      direction: 'BULLISH',
      strength: distFromLow < 0.05 ? 'STRONG' : 'MODERATE',
      message: `At day low ${dayLow.toFixed(0)} - reversal zone`,
      watch: 'Watch for bounce, volume increase, RSI uptick',
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Signal 2: RSI reversal / divergence
// ─────────────────────────────────────────────────────────────────────
function checkRSIReversal(data) {
  const { rsi, rsiHistory } = data.indicators || {};
  if (rsi == null) return null;

  const rsiHistory5 = Array.isArray(rsiHistory) && rsiHistory.length >= 5
    ? rsiHistory
    : null;

  const rsi5ago   = rsiHistory5 ? rsiHistory5[rsiHistory5.length - 5] : null;
  const rsiChange = rsi5ago != null ? rsi - rsi5ago : null;

  // Oversold turning up
  if (rsi < 35 && rsiChange != null && rsiChange > 2) {
    return {
      type: 'RSI_OVERSOLD_TURNING',
      direction: 'BULLISH',
      strength: rsi < 25 ? 'STRONG' : 'MODERATE',
      message: `RSI oversold ${rsi.toFixed(0)} turning up (+${rsiChange.toFixed(1)})`,
      watch: 'Watch for price confirmation, volume support',
    };
  }

  // Overbought turning down
  if (rsi > 65 && rsiChange != null && rsiChange < -2) {
    return {
      type: 'RSI_OVERBOUGHT_TURNING',
      direction: 'BEARISH',
      strength: rsi > 75 ? 'STRONG' : 'MODERATE',
      message: `RSI overbought ${rsi.toFixed(0)} turning down (${rsiChange.toFixed(1)})`,
      watch: 'Watch for price rejection, volume decline',
    };
  }

  // Price/RSI divergence
  const priceChange5 = data.price?.change5min ?? null;
  if (priceChange5 != null && rsiChange != null) {
    if (priceChange5 > 0.2 && rsiChange < -1) {
      return {
        type: 'BEARISH_DIVERGENCE',
        direction: 'BEARISH',
        strength: 'MODERATE',
        message: 'Price rising but RSI weakening (divergence)',
        watch: 'Potential exhaustion - watch for reversal',
      };
    }
    if (priceChange5 < -0.2 && rsiChange > 1) {
      return {
        type: 'BULLISH_DIVERGENCE',
        direction: 'BULLISH',
        strength: 'MODERATE',
        message: 'Price falling but RSI strengthening (divergence)',
        watch: 'Potential bottom - watch for bounce',
      };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Signal 3: Volume spike with reversal candle
// ─────────────────────────────────────────────────────────────────────
function checkVolumeReversal(data) {
  const { current: volCurrent, avg: volAvg, lastCandle } = data.volume || {};
  if (!volCurrent || !volAvg || volAvg === 0) return null;

  const trendDirection = data.trend?.direction || 'NEUTRAL';
  const priceChange5   = data.price?.change5min ?? null;

  // Volume spike with opposing candle
  if (volCurrent > volAvg * 2 && lastCandle) {
    const reversalCandle = (
      (trendDirection === 'DOWN' && lastCandle.close > lastCandle.open) ||
      (trendDirection === 'UP'   && lastCandle.close < lastCandle.open)
    );

    if (reversalCandle) {
      return {
        type: 'VOLUME_REVERSAL',
        direction: trendDirection === 'DOWN' ? 'BULLISH' : 'BEARISH',
        strength: volCurrent > volAvg * 3 ? 'STRONG' : 'MODERATE',
        message: `${(volCurrent / volAvg).toFixed(1)}x volume spike with reversal candle`,
        watch: 'Strong signal - watch for follow-through',
      };
    }
  }

  // Climax volume (exhaustion)
  if (priceChange5 != null && volCurrent > volAvg * 2.5 && Math.abs(priceChange5) > 0.5) {
    return {
      type: 'CLIMAX_VOLUME',
      direction: priceChange5 > 0 ? 'BEARISH' : 'BULLISH',
      strength: 'MODERATE',
      message: 'Climax volume - potential exhaustion',
      watch: 'Heavy volume at extreme - reversal possible',
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Signal 4: OI divergence (put/call buildup at extremes)
// ─────────────────────────────────────────────────────────────────────
function checkOIDivergence(data) {
  const { callOIChange5min, putOIChange5min } = data.oi || {};
  const { current, dayHigh, dayLow } = data.price || {};
  const priceChange5 = data.price?.change5min ?? null;

  if (current == null) return null;

  const nearHigh = dayHigh ? ((dayHigh - current) / dayHigh) * 100 < 0.2 : false;
  const nearLow  = dayLow  ? ((current - dayLow) / current) * 100 < 0.2  : false;

  // Heavy put buildup at highs → BEARISH
  if (nearHigh && putOIChange5min != null && putOIChange5min > 2.0) {
    return {
      type: 'PUT_BUILDUP_AT_HIGH',
      direction: 'BEARISH',
      strength: putOIChange5min > 3.5 ? 'STRONG' : 'MODERATE',
      message: `Heavy put buildup (+${putOIChange5min.toFixed(1)}%) near day high`,
      watch: 'Big players shorting - reversal likely',
    };
  }

  // Heavy call buildup at lows → BULLISH
  if (nearLow && callOIChange5min != null && callOIChange5min > 2.0) {
    return {
      type: 'CALL_BUILDUP_AT_LOW',
      direction: 'BULLISH',
      strength: callOIChange5min > 3.5 ? 'STRONG' : 'MODERATE',
      message: `Heavy call buildup (+${callOIChange5min.toFixed(1)}%) near day low`,
      watch: 'Big players buying - reversal likely',
    };
  }

  if (priceChange5 == null) return null;

  // Price up + call OI falling — two possible meanings depending on context:
  // (a) Near day high: longs unwinding (bearish — weak rally)
  // (b) Mid-range or after a down move: call SHORTS covering = short squeeze (bullish continuation)
  if (priceChange5 > 0.3 && callOIChange5min != null && callOIChange5min < -1.5) {
    const nearHigh = dayHigh ? ((dayHigh - current) / dayHigh) * 100 < 0.3 : false;
    if (nearHigh) {
      return {
        type: 'LONG_UNWINDING_AT_HIGH',
        direction: 'BEARISH',
        strength: 'MODERATE',
        message: 'Price rising but longs exiting (Call OI -)',
        watch: 'Weak rally near highs - reversal possible',
      };
    } else {
      return {
        type: 'SHORT_COVERING_RALLY',
        direction: 'BULLISH',
        strength: Math.abs(callOIChange5min) > 3.0 ? 'STRONG' : 'MODERATE',
        message: `Short covering rally — call shorts exiting (Call OI ${callOIChange5min.toFixed(1)}%)`,
        watch: 'Shorts being squeezed — momentum may accelerate',
      };
    }
  }

  // Price down but puts reducing — put shorts covering into weakness (bullish)
  if (priceChange5 < -0.3 && putOIChange5min != null && putOIChange5min < -1.5) {
    return {
      type: 'SHORT_COVERING_AT_LOW',
      direction: 'BULLISH',
      strength: 'MODERATE',
      message: 'Price falling but shorts covering (Put OI -)',
      watch: 'Weak decline — reversal possible',
    };
  }

  // Price down + put OI rising sharply = fresh put writing = bearish conviction
  if (priceChange5 < -0.3 && putOIChange5min != null && putOIChange5min > 2.0) {
    return {
      type: 'FRESH_PUT_WRITING_ON_DECLINE',
      direction: 'BEARISH',
      strength: putOIChange5min > 3.5 ? 'STRONG' : 'MODERATE',
      message: `Fresh put writing on decline (Put OI +${putOIChange5min.toFixed(1)}%)`,
      watch: 'Smart money adding shorts — decline may continue',
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Signal 5: Key level test with OI backing
// ─────────────────────────────────────────────────────────────────────
function checkKeyLevelTest(data) {
  const { current } = data.price || {};
  const { support, resistance } = data.levels || {};
  if (!current) return null;

  if (support?.level) {
    const atSupport = Math.abs(current - support.level) < support.level * 0.003;
    if (atSupport && support.oiChange > 0) {
      return {
        type: 'SUPPORT_TEST',
        direction: 'BULLISH',
        strength: support.strength > 7 ? 'STRONG' : 'MODERATE',
        message: `Testing support ${support.level.toFixed(0)} with fresh put base`,
        watch: 'Strong support - watch for bounce or break',
      };
    }
  }

  if (resistance?.level) {
    const atResistance = Math.abs(resistance.level - current) < current * 0.003;

    if (atResistance && resistance.oiChange < 0) {
      return {
        type: 'WEAK_RESISTANCE',
        direction: 'BULLISH',
        strength: Math.abs(resistance.oiChange) > 500000 ? 'STRONG' : 'MODERATE',
        message: `At resistance ${resistance.level.toFixed(0)} but calls reducing`,
        watch: 'Weak resistance - breakout possible',
      };
    }

    if (atResistance && resistance.oiChange > 0) {
      return {
        type: 'STRONG_RESISTANCE',
        direction: 'BEARISH',
        strength: resistance.strength > 7 ? 'STRONG' : 'MODERATE',
        message: `Testing resistance ${resistance.level.toFixed(0)} with fresh call wall`,
        watch: 'Strong resistance - rejection likely',
      };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Signal 6: Candlestick reversal patterns (pin bar, hammer, engulfing)
// ─────────────────────────────────────────────────────────────────────
function checkCandlePattern(data) {
  const { lastCandle, prevCandle } = data.volume || {};
  if (!lastCandle) return null;

  const { open, high, low, close } = lastCandle;
  const range      = high - low;
  if (range <= 0) return null;

  const body       = Math.abs(close - open);
  const upperWick  = high - Math.max(open, close);
  const lowerWick  = Math.min(open, close) - low;
  const midpoint   = (high + low) / 2;

  // ── Hammer / Pin bar (bullish reversal from lows) ──
  // Long lower wick (≥ 2× body), small upper wick, close above midpoint
  if (
    body > 0 &&
    lowerWick >= body * 2 &&
    lowerWick >= range * 0.5 &&
    close > midpoint
  ) {
    return {
      type:      'HAMMER',
      direction: 'BULLISH',
      strength:  lowerWick >= body * 3 ? 'STRONG' : 'MODERATE',
      message:   `Hammer / pin bar at ${low.toFixed(0)} — strong rejection of lows`,
      watch:     'Buyers stepped in aggressively. Watch next candle for confirmation.',
    };
  }

  // ── Shooting Star (bearish reversal from highs) ──
  // Long upper wick (≥ 2× body), small lower wick, close below midpoint
  if (
    body > 0 &&
    upperWick >= body * 2 &&
    upperWick >= range * 0.5 &&
    close < midpoint
  ) {
    return {
      type:      'SHOOTING_STAR',
      direction: 'BEARISH',
      strength:  upperWick >= body * 3 ? 'STRONG' : 'MODERATE',
      message:   `Shooting star at ${high.toFixed(0)} — rejection of highs`,
      watch:     'Sellers took control at highs. Watch for follow-through selling.',
    };
  }

  // ── Engulfing patterns (need prev candle) ──
  if (!prevCandle) return null;

  const prevBody = Math.abs(prevCandle.close - prevCandle.open);

  // Bullish engulfing: prev = bearish candle, current = bullish candle that fully covers prev body
  if (
    prevCandle.close < prevCandle.open &&  // prev was bearish
    close > open &&                         // current is bullish
    body > prevBody * 1.1 &&               // current body > prev body (with buffer)
    open <= prevCandle.close &&            // opened at or below prev close
    close >= prevCandle.open              // closed at or above prev open
  ) {
    return {
      type:      'BULLISH_ENGULFING',
      direction: 'BULLISH',
      strength:  body >= prevBody * 1.5 ? 'STRONG' : 'MODERATE',
      message:   `Bullish engulfing candle at ${close.toFixed(0)} — absorbs prior selling`,
      watch:     'Strong reversal signal. Watch for volume confirmation.',
    };
  }

  // Bearish engulfing: prev = bullish candle, current = bearish candle that fully covers prev body
  if (
    prevCandle.close > prevCandle.open &&  // prev was bullish
    close < open &&                         // current is bearish
    body > prevBody * 1.1 &&
    open >= prevCandle.close &&
    close <= prevCandle.open
  ) {
    return {
      type:      'BEARISH_ENGULFING',
      direction: 'BEARISH',
      strength:  body >= prevBody * 1.5 ? 'STRONG' : 'MODERATE',
      message:   `Bearish engulfing candle at ${close.toFixed(0)} — absorbs prior buying`,
      watch:     'Strong reversal signal. Watch for follow-through selling.',
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Signal 7: RSI velocity (rapid RSI change mid-session)
// ─────────────────────────────────────────────────────────────────────
function checkRSIVelocity(data) {
  const { rsi, rsiHistory } = data.indicators || {};
  if (rsi == null || !Array.isArray(rsiHistory) || rsiHistory.length < 3) return null;

  // Compare current RSI vs 3 periods ago (not just oversold/overbought turning)
  const prev = rsiHistory[rsiHistory.length - 3];
  if (prev == null) return null;
  const delta = rsi - prev;

  if (delta >= 8 && rsi > 40) {
    return {
      type:      'RSI_VELOCITY_UP',
      direction: 'BULLISH',
      strength:  delta >= 12 ? 'STRONG' : 'MODERATE',
      message:   `RSI surged +${delta.toFixed(1)} pts in 3 candles — rapid momentum shift`,
      watch:     'Sharp RSI upturn signals reversal attempt. Confirm with price close above prior high.',
    };
  }

  if (delta <= -8 && rsi < 60) {
    return {
      type:      'RSI_VELOCITY_DOWN',
      direction: 'BEARISH',
      strength:  delta <= -12 ? 'STRONG' : 'MODERATE',
      message:   `RSI dropped ${delta.toFixed(1)} pts in 3 candles — momentum collapsing`,
      watch:     'Sharp RSI fall signals reversal attempt. Confirm with price close below prior low.',
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Signal 8: MACD histogram cross / pending cross
// ─────────────────────────────────────────────────────────────────────
function checkMACDCross(data) {
  const macdData = data.indicators?.macdData;
  if (!macdData?.lastCross) return null;

  const { lastCross, histogram, prevHistogram } = macdData;
  const expanding = Math.abs(histogram) > Math.abs(prevHistogram ?? 0);

  if (lastCross === 'BULLISH') {
    return {
      type:      'MACD_BULLISH_CROSS',
      direction: 'BULLISH',
      strength:  expanding ? 'STRONG' : 'MODERATE',
      message:   'MACD crossed above signal line — bullish momentum confirmed',
      watch:     'Watch for price follow-through above nearest resistance.',
    };
  }

  if (lastCross === 'BEARISH') {
    return {
      type:      'MACD_BEARISH_CROSS',
      direction: 'BEARISH',
      strength:  expanding ? 'STRONG' : 'MODERATE',
      message:   'MACD crossed below signal line — bearish momentum confirmed',
      watch:     'Watch for price follow-through below nearest support.',
    };
  }

  if (lastCross === 'BULLISH_PENDING') {
    return {
      type:      'MACD_BULLISH_PENDING',
      direction: 'BULLISH',
      strength:  'MODERATE',
      message:   'MACD histogram shrinking from below — bullish cross forming',
      watch:     'Momentum shifting. Watch for MACD line to cross above signal.',
    };
  }

  if (lastCross === 'BEARISH_PENDING') {
    return {
      type:      'MACD_BEARISH_PENDING',
      direction: 'BEARISH',
      strength:  'MODERATE',
      message:   'MACD histogram weakening from above — bearish cross forming',
      watch:     'Momentum fading. Watch for MACD line to cross below signal.',
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Signal 9: Price acceleration — sharp 5-min candle body, OI-independent
// Fires when a single candle shows a strong directional move (> 0.6%)
// regardless of OI data availability. Catches short squeezes and
// panic selling that OI snapshots miss due to NSE reporting lag.
// ─────────────────────────────────────────────────────────────────────
function checkPriceAcceleration(data) {
  const { lastCandle } = data.volume || {};
  const { current, dayHigh, dayLow } = data.price || {};
  if (!lastCandle || !current) return null;

  const { open, high, low, close } = lastCandle;
  const range = high - low;
  if (range <= 0 || !open || !close) return null;

  // Candle body as % of price
  const body = Math.abs(close - open);
  const bodyPct = (body / open) * 100;

  // Only fire on strong directional candles (body > 0.6%, body > 60% of range)
  if (bodyPct < 0.6 || body < range * 0.6) return null;

  const bullish = close > open;

  // Strength tiers
  let strength = 'MODERATE';
  if (bodyPct >= 1.0) strength = 'STRONG';

  // Additional context: is this move toward or away from day extreme?
  const distFromHigh = dayHigh ? ((dayHigh - current) / dayHigh) * 100 : null;
  const distFromLow  = dayLow  ? ((current - dayLow) / current) * 100  : null;

  if (bullish) {
    // Bullish acceleration away from day low = likely short squeeze / reversal
    const fromLow = distFromLow != null && distFromLow < 1.0;
    return {
      type:      'PRICE_ACCELERATION_UP',
      direction: 'BULLISH',
      strength,
      message:   `Sharp ${bodyPct.toFixed(1)}% bullish candle${fromLow ? ' off day low' : ''} — price accelerating up`,
      watch:     'Strong momentum candle. Watch for follow-through above ' + close.toFixed(0) + '.',
    };
  } else {
    const fromHigh = distFromHigh != null && distFromHigh < 1.0;
    return {
      type:      'PRICE_ACCELERATION_DOWN',
      direction: 'BEARISH',
      strength,
      message:   `Sharp ${bodyPct.toFixed(1)}% bearish candle${fromHigh ? ' off day high' : ''} — price accelerating down`,
      watch:     'Strong momentum candle. Watch for follow-through below ' + close.toFixed(0) + '.',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Synthesize all signals into a conclusion
// ─────────────────────────────────────────────────────────────────────
function synthesizeSignals(signals, data) {
  if (signals.length === 0) {
    return { reversalZone: false };
  }

  const bullishSignals = signals.filter(s => s.direction === 'BULLISH');
  const bearishSignals = signals.filter(s => s.direction === 'BEARISH');
  const strongSignals  = signals.filter(s => s.strength === 'STRONG');

  let direction = 'NEUTRAL';
  if (bullishSignals.length > bearishSignals.length)      direction = 'BULLISH';
  else if (bearishSignals.length > bullishSignals.length) direction = 'BEARISH';

  let confidence = 'LOW';
  if (strongSignals.length >= 2)                          confidence = 'HIGH';
  else if (strongSignals.length === 1 || signals.length >= 3) confidence = 'MEDIUM';

  const commentary = buildReversalCommentary(signals, direction, confidence, data);

  return {
    reversalZone: true,
    direction,
    confidence,
    signalCount: signals.length,
    signals,
    commentary,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Build human-readable commentary object
// ─────────────────────────────────────────────────────────────────────
function buildReversalCommentary(signals, direction, confidence, data) {
  const emoji = direction === 'NEUTRAL' ? '⚠️' : '🔄';

  let state;
  if (confidence === 'HIGH') {
    state = direction === 'BULLISH' ? 'BULLISH REVERSAL ZONE' : 'BEARISH REVERSAL ZONE';
  } else if (confidence === 'MEDIUM') {
    state = direction === 'BULLISH' ? 'POTENTIAL BULLISH ZONE' : 'POTENTIAL BEARISH ZONE';
  } else {
    state = 'REVERSAL WATCH';
  }

  // Top 2 strongest signals first
  const topSignals = [...signals]
    .sort((a, b) => (b.strength === 'STRONG' ? 1 : 0) - (a.strength === 'STRONG' ? 1 : 0))
    .slice(0, 2);

  const headline  = topSignals.map(s => s.message).join(' + ');
  const watchFor  = [...new Set(topSignals.map(s => s.watch))].join('. ');

  const current = data.price?.current ?? 0;
  let action;
  if (confidence === 'HIGH') {
    action = direction === 'BULLISH'
      ? `Strong reversal signals. Watch for confirmation: price > ${(current + 20).toFixed(0)}, RSI > 45. If confirmed, longs favored.`
      : `Strong reversal signals. Watch for confirmation: price < ${(current - 20).toFixed(0)}, RSI < 55. If confirmed, shorts favored.`;
  } else if (confidence === 'MEDIUM') {
    action = `Reversal possible but not confirmed. ${watchFor}. Do not commit until confirmation.`;
  } else {
    action = `Early signals. ${watchFor}. Stay alert but wait for more confirmation.`;
  }

  return {
    state: `${emoji} ${state}`,
    stateEmoji: emoji,
    headline,
    action,
    confidence,
    signalDetails: topSignals,
  };
}
