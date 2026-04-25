// ─── Third Eye — Scalp Setup Detector ────────────────────────────────────────
// Five setup types:
//   1. VWAP_CROSS      — candle closes above/below VWAP after being on wrong side
//   2. PULLBACK_RESUME — PULLBACK state + strong candle resuming original direction
//   3. POWER_CANDLE    — CS ≥ 1.2 on correct side of VWAP in trending state
//   4. ATR_EXPANSION   — price breaks dayOpen ± ATR with impulsive expansion candle
//   5. ORB             — close above/below Opening Range High/Low (9:15–9:45)
//
// Session gates (per setup):
//   primary + secondary:       Pullback Resume, ATR Expansion
//   primary + secondary + lull: VWAP Cross, Power Candle, ORB
//   (opening is blocked for all — OR range still forming)
//
// Universal guards:
//   - ADX ≥ 12 (allows early-session signals; below 12 = pure noise)
//   - Dedup via lastSignal.candleTime
//   - Back-to-back same-direction cooldown (per setup)
// ─────────────────────────────────────────────────────────────────────────────

const SL_PTS     = 30;
const TARGET_PTS = 30;

const BLOCKED_STATES = new Set([
  'EXHAUSTED_LONG', 'EXHAUSTED_SHORT',
  'DEEP_PULLBACK_LONG', 'DEEP_PULLBACK_SHORT',
  'INVALIDATED', 'TRAPPED_LONG', 'TRAPPED_SHORT',
  'RANGING',
]);

// Momentum setups: primary + secondary only
function isPrimarySecondary(phase) {
  return phase === 'primary' || phase === 'secondary';
}

// Structural setups: also fire in lull (volume lower but signal is still valid)
function isPrimarySecondaryLull(phase) {
  return phase === 'primary' || phase === 'secondary' || phase === 'lull';
}

function rsiOk(rsi, direction) {
  if (rsi == null) return true;
  if (direction === 'bull') return rsi >= 42 && rsi <= 78;
  if (direction === 'bear') return rsi >= 22 && rsi <= 58;
  return true;
}

// ── Main detector ─────────────────────────────────────────────────────────────
export function detectScalpSetup(
  features, state, prevFeatures, prevSignal,
  strikeStep = 50, underlying = 'NIFTY', isExpiryDay = true,
  tf = '5minute', orHigh = null, orLow = null
) {
  if (!features?.close) return null;

  // candleInterval drives back-to-back cooldowns — must match the actual TF
  const candleInterval = tf === '15minute' ? 900 : 300;

  // ── Universal guard: dedup — same candle emitted every scan until next close ─
  if (prevSignal?.candleTime === features.time) return null;

  // ── Universal guard: ADX minimum (12 allows early-session ORB/VWAP signals) ─
  if (features.adx != null && features.adx < 12) return null;

  const spot = features.close;
  const phase = features.sessionPhase;

  // ─────────────────────────────────────────────────────────────────────────
  // Setup 1: VWAP CROSS  (primary + secondary + lull)
  // Candle close flips VWAP side — requires reasonable body and direction match.
  // ─────────────────────────────────────────────────────────────────────────
  if (isPrimarySecondaryLull(phase) && !BLOCKED_STATES.has(state)) {
    if (prevFeatures?.vwapAbove != null && features.vwapAbove != null &&
        prevFeatures.vwapAbove !== features.vwapAbove) {

      const direction = features.vwapAbove ? 'bull' : 'bear';
      const csOk      = features.candleStrength >= 0.7;
      const dirMatch  = features.direction === direction;
      const tooSoon   = prevSignal?.direction === direction &&
                        (features.time - prevSignal.candleTime) < 3 * candleInterval;

      if (csOk && dirMatch && rsiOk(features.rsi, direction) && !tooSoon) {
        return _buildSetup('VWAP_CROSS', 'VWAP Cross', direction, spot, features, 'high', strikeStep);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup 2: PULLBACK RESUME  (primary + secondary)
  // In PULLBACK state, strong candle resumes the original trend direction.
  // ─────────────────────────────────────────────────────────────────────────
  if (isPrimarySecondary(phase) && !BLOCKED_STATES.has(state)) {
    if (state === 'PULLBACK_LONG' || state === 'PULLBACK_SHORT') {
      const direction = state === 'PULLBACK_LONG' ? 'bull' : 'bear';
      const dirMatch  = features.direction === direction;
      const vwapOk    = features.vwapAbove === (direction === 'bull');
      const tooSoon   = prevSignal?.direction === direction &&
                        (features.time - prevSignal.candleTime) < 3 * candleInterval;

      if (dirMatch && features.candleStrength >= 0.9 && vwapOk &&
          rsiOk(features.rsi, direction) && !tooSoon) {
        return _buildSetup('PULLBACK_RESUME', 'Pullback Resume', direction, spot, features, 'high', strikeStep);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup 3: POWER CANDLE  (primary + secondary + lull)
  // Impulsive candle in an established trend direction with VWAP alignment.
  // ─────────────────────────────────────────────────────────────────────────
  if (isPrimarySecondaryLull(phase) && !BLOCKED_STATES.has(state)) {
    const powerStates = new Set([
      'BUILDING_LONG', 'CONFIRMED_LONG', 'CONTINUING_LONG',
      'BUILDING_SHORT', 'CONFIRMED_SHORT', 'CONTINUING_SHORT',
    ]);

    if (powerStates.has(state) && features.candleStrength >= 1.2) {
      const direction = state.includes('LONG') ? 'bull' : 'bear';
      const dirMatch  = features.direction === direction;
      const vwapOk    = features.vwapAbove === (direction === 'bull');
      const tooSoon   = prevSignal?.direction === direction &&
                        (features.time - prevSignal.candleTime) < 3 * candleInterval;

      if (dirMatch && vwapOk && rsiOk(features.rsi, direction) && !tooSoon) {
        return _buildSetup('POWER_CANDLE', 'Power Candle', direction, spot, features, 'medium', strikeStep);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup 4: ATR EXPANSION  (primary + secondary, not opening)
  // Price breaks outside dayOpen ± ATR with an impulsive expansion candle.
  // Sensex: expiry day (Thursday) only — higher liquidity and IV expansion.
  // ─────────────────────────────────────────────────────────────────────────
  if (isPrimarySecondary(phase) && phase !== 'opening') {
    if (underlying !== 'SENSEX' || isExpiryDay) {
      const direction = features.aboveExpansion ? 'bull'
                      : features.belowExpansion ? 'bear' : null;

      if (direction) {
        const dirMatch       = features.direction === direction;
        const expansionCandle = features.atrExpanding &&
                                features.relativeStrength >= 1.3 && // relaxed from 1.5
                                features.candleStrength  >= 0.8;
        const vwapAlign      = features.vwapAbove === (direction === 'bull');
        const rangeBreak     = direction === 'bull'
          ? features.close > features.swingHigh
          : features.close < features.swingLow;
        const tooSoon        = prevSignal?.direction === direction &&
                               (features.time - prevSignal.candleTime) < 4 * candleInterval;

        if (dirMatch && expansionCandle && (vwapAlign || rangeBreak) &&
            features.adx >= 16 && rsiOk(features.rsi, direction) && !tooSoon) {

          const confirmCount = [vwapAlign, rangeBreak, features.relativeStrength >= 2.0, features.volumeSpike]
            .filter(Boolean).length;
          const confidence = confirmCount >= 3 ? 'high' : 'medium';

          const atrVal    = features.atr || 30;
          const slPts     = Math.max(25, Math.round(atrVal * 0.8));
          const targetPts = Math.max(35, Math.round(atrVal * 1.5));

          return _buildSetup('ATR_EXPANSION', 'ATR Expansion', direction, spot, features, confidence, strikeStep, slPts, targetPts);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup 5: ORB — Opening Range Breakout  (primary + secondary + lull)
  // Fires after the opening range (9:15–9:45) is complete and price closes
  // above OR High (CE) or below OR Low (PE) with a strong directional candle.
  // OR must have at least 3 candles (15 min of data) to be valid.
  // Long cooldown: 6 candles to prevent re-triggering on the same breakout.
  // ─────────────────────────────────────────────────────────────────────────
  // ORB waits for the full opening range (9:15–9:44) — earliest fire is 9:45
  const istMin = Math.floor(((features.time + 19800) % 86400) / 60);
  if (isPrimarySecondaryLull(phase) && orHigh != null && orLow != null && istMin >= 585) {
    const orbBull = features.close > orHigh && features.direction === 'bull';
    const orbBear = features.close < orLow  && features.direction === 'bear';
    const direction = orbBull ? 'bull' : orbBear ? 'bear' : null;

    if (direction) {
      const csOk    = features.candleStrength >= 0.7;
      const tooSoon = prevSignal?.direction === direction &&
                      (features.time - prevSignal.candleTime) < 6 * candleInterval;

      if (csOk && rsiOk(features.rsi, direction) && !tooSoon) {
        const breakoutPts = direction === 'bull'
          ? features.close - orHigh
          : orLow - features.close;
        const confidence = (breakoutPts >= 15 || features.volumeSpike) ? 'high' : 'medium';

        const setup = _buildSetup('ORB', 'OR Breakout', direction, spot, features, confidence, strikeStep);
        return { ...setup, orHigh, orLow };
      }
    }
  }

  return null;
}

// ── Build setup object ────────────────────────────────────────────────────────
function _buildSetup(type, label, direction, spot, features, confidence, strikeStep = 50, slPts = SL_PTS, targetPts = TARGET_PTS) {
  const isBull = direction === 'bull';
  const target = parseFloat((spot + (isBull ? targetPts : -targetPts)).toFixed(1));
  const sl     = parseFloat((spot + (isBull ? -slPts : slPts)).toFixed(1));
  const strike = Math.round(spot / strikeStep) * strikeStep;
  const optType = isBull ? 'CE' : 'PE';

  return {
    type,
    label,
    direction,
    optType,
    strike,
    confidence,
    niftyPrice:  spot,
    niftyTarget: target,
    niftySl:     sl,
    slPts,
    targetPts,
    candleStrength: features.candleStrength,
    rsi:            features.rsi,
    vwap:           features.vwap,
    sessionPhase:   features.sessionPhase,
    candleTime:     features.time,
    atrExpansionHigh: features.atrExpansionHigh ?? null,
    atrExpansionLow:  features.atrExpansionLow  ?? null,
    volumeSpike:      features.volumeSpike       ?? false,
  };
}
