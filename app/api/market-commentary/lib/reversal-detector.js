// ═══════════════════════════════════════════════════════════════════════
// INTELLIGENT REVERSAL ZONE DETECTOR
// Multi-factor, context-aware reversal detection
// ═══════════════════════════════════════════════════════════════════════

/**
 * Main entry point
 * @param {Object} data
 * @param {Object} data.price      - { current, dayHigh, dayLow, change5min }
 * @param {Object} data.indicators - { rsi, rsiHistory: number[] }
 * @param {Object} data.volume     - { current, avg, lastCandle: {open, close} }
 * @param {Object} data.oi         - { callOIChange5min, putOIChange5min, pcr }
 * @param {Object} data.levels     - { support: {level, oiChange, strength}, resistance: {level, oiChange, strength} }
 * @param {Object} data.trend      - { direction: 'UP'|'DOWN'|'NEUTRAL' }
 * @returns {Object} reversalResult
 */
export function detectReversalZone(data) {
  const signals = [];

  const rangeSignal  = checkPriceExtremes(data);
  const rsiSignal    = checkRSIReversal(data);
  const volSignal    = checkVolumeReversal(data);
  const oiSignal     = checkOIDivergence(data);
  const levelSignal  = checkKeyLevelTest(data);

  if (rangeSignal)  signals.push(rangeSignal);
  if (rsiSignal)    signals.push(rsiSignal);
  if (volSignal)    signals.push(volSignal);
  if (oiSignal)     signals.push(oiSignal);
  if (levelSignal)  signals.push(levelSignal);

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

  // Price up but calls reducing (long unwinding at high)
  if (priceChange5 > 0.3 && callOIChange5min != null && callOIChange5min < -1.5) {
    return {
      type: 'LONG_UNWINDING_AT_HIGH',
      direction: 'BEARISH',
      strength: 'MODERATE',
      message: 'Price rising but longs exiting (Call OI -)',
      watch: 'Weak rally - reversal possible',
    };
  }

  // Price down but puts reducing (short covering at low)
  if (priceChange5 < -0.3 && putOIChange5min != null && putOIChange5min < -1.5) {
    return {
      type: 'SHORT_COVERING_AT_LOW',
      direction: 'BULLISH',
      strength: 'MODERATE',
      message: 'Price falling but shorts covering (Put OI -)',
      watch: 'Weak decline - reversal possible',
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
