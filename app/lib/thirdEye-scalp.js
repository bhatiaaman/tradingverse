// ─── Third Eye — Scalp Setup Detector ────────────────────────────────────────
// Detects high-probability scalp entries for ATM CE/PE options.
// Not rigid — a single clean trigger is enough. 30pt Nifty SL/target.
//
// Three setup types:
//   VWAP_CROSS    — candle closes above/below VWAP after being on wrong side
//   POWER_CANDLE  — CS ≥ 1.2 on correct side of VWAP in active state
//   PULLBACK_RESUME — PULLBACK state + strong candle resuming original direction
//
// Guards:
//   - Primary / secondary session only
//   - Not in EXHAUSTED, INVALIDATED, RANGING, TRAPPED states
//   - RSI not at extremes (avoids fading momentum at limits)
//   - One signal per candle close (dedup via lastSignalCandleTime)
//   - No back-to-back same-direction signals within 3 candles
// ─────────────────────────────────────────────────────────────────────────────

const SL_PTS     = 30;  // Nifty points SL distance
const TARGET_PTS = 30;  // Nifty points target distance

// States that are valid for scalp entry
const VALID_STATES = new Set([
  'BUILDING_LONG',   'BUILDING_SHORT',
  'CONFIRMED_LONG',  'CONFIRMED_SHORT',
  'CONTINUING_LONG', 'CONTINUING_SHORT',
  'PULLBACK_LONG',   'PULLBACK_SHORT',
  'NEUTRAL',         // allow VWAP_CROSS from neutral
]);

// States explicitly blocked
const BLOCKED_STATES = new Set([
  'EXHAUSTED_LONG', 'EXHAUSTED_SHORT',
  'DEEP_PULLBACK_LONG', 'DEEP_PULLBACK_SHORT',
  'INVALIDATED', 'TRAPPED_LONG', 'TRAPPED_SHORT',
  'RANGING',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidSession(phase) {
  return phase === 'primary' || phase === 'secondary';
}

function rsiOk(rsi, direction) {
  if (rsi == null) return true; // no data → don't block
  if (direction === 'bull') return rsi >= 45 && rsi <= 75;
  if (direction === 'bear') return rsi >= 25 && rsi <= 55;
  return true;
}

// ── Main detector ─────────────────────────────────────────────────────────────
// features     — current candle feature object from thirdEye.js
// state        — current engine state string
// prevFeatures — features from previous candle (from persisted engine state)
// prevSignal   — last fired signal { direction, candleTime } (from persisted state)
//
// Returns scalpSetup object or null.

export function detectScalpSetup(features, state, prevFeatures, prevSignal, strikeStep = 50) {
  // ── Guard: session ─────────────────────────────────────────────────────────
  if (!isValidSession(features.sessionPhase)) return null;

  // ── Guard: blocked state ───────────────────────────────────────────────────
  if (BLOCKED_STATES.has(state)) return null;

  // ── Guard: dedup — don't fire twice for same candle ────────────────────────
  if (prevSignal?.candleTime === features.time) return null;

  // ── Guard: no back-to-back same direction within 3 candles ────────────────
  // (candleTime is Unix seconds; each 5m candle = 300s apart)
  const candleInterval = 300; // 5m default; for 15m TF the gap is 900s but we can't know here
  if (prevSignal && features.time - prevSignal.candleTime < 3 * candleInterval) {
    // Allow only if direction switches
    // (handled below by direction check)
  }

  // ── Guard: ADX minimum ─────────────────────────────────────────────────────
  if (features.adx != null && features.adx < 14) return null; // pure noise

  const spot = features.close;
  if (!spot) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Setup 1: VWAP CROSS
  // Current candle closes above VWAP after prev candle was below (bull cross)
  // or below VWAP after prev was above (bear cross)
  // ─────────────────────────────────────────────────────────────────────────
  if (prevFeatures?.vwapAbove !== null && features.vwapAbove !== null &&
      prevFeatures.vwapAbove !== features.vwapAbove) {

    const direction = features.vwapAbove ? 'bull' : 'bear';

    // Need at least a reasonable candle body (not a hairline cross)
    const crossStrengthOk = features.candleStrength >= 0.7;

    // Direction match: candle should close in the crossing direction
    const dirMatch = (direction === 'bull' && features.direction === 'bull') ||
                     (direction === 'bear' && features.direction === 'bear');

    // Back-to-back same direction guard (3 candles)
    const tooSoon = prevSignal &&
      prevSignal.direction === direction &&
      (features.time - prevSignal.candleTime) < 3 * candleInterval;

    if (crossStrengthOk && dirMatch && rsiOk(features.rsi, direction) && !tooSoon) {
      return _buildSetup('VWAP_CROSS', 'VWAP Cross', direction, spot, features, 'high', strikeStep);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup 2: PULLBACK RESUME
  // In PULLBACK state, strong candle in the original trend direction
  // ─────────────────────────────────────────────────────────────────────────
  if (state === 'PULLBACK_LONG' || state === 'PULLBACK_SHORT') {
    const direction = state === 'PULLBACK_LONG' ? 'bull' : 'bear';
    const dirMatch  = (direction === 'bull' && features.direction === 'bull') ||
                      (direction === 'bear' && features.direction === 'bear');

    const tooSoon = prevSignal &&
      prevSignal.direction === direction &&
      (features.time - prevSignal.candleTime) < 3 * candleInterval;

    if (dirMatch && features.candleStrength >= 0.9 && features.vwapAbove === (direction === 'bull') &&
        rsiOk(features.rsi, direction) && !tooSoon) {
      return _buildSetup('PULLBACK_RESUME', 'Pullback Resume', direction, spot, features, 'high', strikeStep);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup 3: POWER CANDLE
  // CS ≥ 1.2, on correct side of VWAP, in BUILDING / CONFIRMED / CONTINUING
  // ─────────────────────────────────────────────────────────────────────────
  const powerStates = new Set([
    'BUILDING_LONG', 'CONFIRMED_LONG', 'CONTINUING_LONG',
    'BUILDING_SHORT', 'CONFIRMED_SHORT', 'CONTINUING_SHORT',
  ]);

  if (powerStates.has(state) && features.candleStrength >= 1.2) {
    const direction = state.includes('LONG') ? 'bull' : 'bear';
    const dirMatch  = (direction === 'bull' && features.direction === 'bull') ||
                      (direction === 'bear' && features.direction === 'bear');
    const vwapOk    = features.vwapAbove === (direction === 'bull');

    const tooSoon = prevSignal &&
      prevSignal.direction === direction &&
      (features.time - prevSignal.candleTime) < 3 * candleInterval;

    if (dirMatch && vwapOk && rsiOk(features.rsi, direction) && !tooSoon) {
      return _buildSetup('POWER_CANDLE', 'Power Candle', direction, spot, features, 'medium', strikeStep);
    }
  }

  return null;
}

// ── Build setup object ────────────────────────────────────────────────────────
function _buildSetup(type, label, direction, spot, features, confidence, strikeStep = 50) {
  const isBull    = direction === 'bull';
  const target    = parseFloat((spot + (isBull ? TARGET_PTS : -TARGET_PTS)).toFixed(1));
  const sl        = parseFloat((spot + (isBull ? -SL_PTS : SL_PTS)).toFixed(1));
  const strike    = Math.round(spot / strikeStep) * strikeStep;
  const optType   = isBull ? 'CE' : 'PE';

  return {
    type,
    label,
    direction,          // 'bull' | 'bear'
    optType,            // 'CE' | 'PE'
    strike,
    confidence,
    niftyPrice:     spot,
    niftyTarget:    target,
    niftySl:        sl,
    slPts:          SL_PTS,
    targetPts:      TARGET_PTS,
    candleStrength: features.candleStrength,
    rsi:            features.rsi,
    vwap:           features.vwap,
    sessionPhase:   features.sessionPhase,
    candleTime:     features.time,  // used for dedup on next scan
  };
}
