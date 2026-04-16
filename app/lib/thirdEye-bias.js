// ── Third Eye Bias State Machine ─────────────────────────────────────────────
// Pure JS — no React, no Redis, no side effects. Fully testable.
//
// States: NEUTRAL | BULL | BEAR
//
// Guarded transitions (no single-candle BULL→BEAR flip):
//   NEUTRAL → BULL   : CHoCH bull / Spring / ORB bull + vol / Engulf at VWAP (bull)
//   NEUTRAL → BEAR   : CHoCH bear / Upthrust / ORB bear + vol / Engulf at VWAP (bear)
//   BULL    → NEUTRAL: 3 candles in downtrend AND below VWAP (reality check)
//                      OR confirmed BOS bear (freshBreak=false)
//   BEAR    → NEUTRAL: 3 candles in uptrend AND above VWAP (reality check)
//                      OR confirmed BOS bull (freshBreak=false)
//   NEUTRAL → BEAR   : (after BULL→NEUTRAL) if next candle has bear setup ≥ threshold
//   NEUTRAL → BULL   : (after BEAR→NEUTRAL) if next candle has bull setup ≥ threshold
//
// Key rule: BULL→BEAR and BEAR→BULL ALWAYS go through NEUTRAL first (2-candle flip minimum).
// This eliminates flip-flopping from single noisy candles.

// ─────────────────────────────────────────────────────────────────────────────
// Setup IDs that trigger a hard bias STATE CHANGE (not just hints)
// ─────────────────────────────────────────────────────────────────────────────

const HARD_BULL_IDS = new Set([
  's13_choch_bull',   // Liquidity Sweep + CHoCH → bull
  's16_spring',       // Wyckoff Spring
  's3_orb_bull',      // ORB Breakout (strong initial move)
  's6_engulf_bull',   // Engulf at VWAP/key level
  's11_ib_bull',      // Inside bar breakout
  's18_bb_bull',      // BB Momentum breakout
  's19_flag_bull',    // Flag breakout
  's20_ema_cross_bull', // EMA cross + VWAP confirm
  's21_vwap_reclaim_bull', // VWAP reclaim
]);

const HARD_BEAR_IDS = new Set([
  's13_choch_bear',
  's16_upthrust',
  's3_orb_bear',
  's6_engulf_bear',
  's11_ib_bear',
  's18_bb_bear',
  's19_flag_bear',
  's20_ema_cross_bear',
  's21_vwap_reclaim_bear',
]);

// CHoCH / BOS exit signals — force NEUTRAL regardless of current state
const FORCE_NEUTRAL_AFTER_BULL = new Set(['s13_choch_bear', 's16_upthrust']);
const FORCE_NEUTRAL_AFTER_BEAR = new Set(['s13_choch_bull', 's16_spring']);

// ─────────────────────────────────────────────────────────────────────────────
// applyBiasTransition
//
// Called once per sealed candle, in chronological order.
// Inputs:
//   state        : current bias state { bias: 'NEUTRAL'|'BULL'|'BEAR', downtrendCount, uptrendCount, pendingFlip, addsToday }
//   thirdEyeResult: output of runThirdEye() for this candle
//   context      : context from buildContext() — includes .trend, .vwap.above, .bos
// Returns: new state object (immutable — always returns a fresh copy)
// ─────────────────────────────────────────────────────────────────────────────

export function applyBiasTransition(state, thirdEyeResult, context, candle) {
  const { bias, downtrendCount = 0, uptrendCount = 0, pendingFlip = null } = state;

  const topSetup  = thirdEyeResult.strongSetups?.[0] ?? thirdEyeResult.watchList?.[0] ?? null;
  const setupId   = topSetup?.pattern?.id ?? null;
  const setupDir  = topSetup?.pattern?.direction ?? null;
  const setupScore = topSetup?.score ?? 0;

  const trend    = context?.trend;
  const aboveVwap = context?.vwap?.above;
  const bos      = context?.bos;

  // ── Closing / opening session gates ────────────────────────────────────────
  if (context?.sessionTime === 'closing') {
    // Don't flip bias in the last 30 minutes — stay in current state
    return { ...state };
  }

  let nextBias  = bias;
  let nextDown  = downtrendCount;
  let nextUp    = uptrendCount;
  let nextPending = pendingFlip;
  let changed   = false;
  let reason    = null;

  // ── BULL state ─────────────────────────────────────────────────────────────
  if (bias === 'BULL') {
    // 1. FAST INVALIDATION (0.6% against trend or Swing Low break)
    const movePct = candle ? (candle.close - candle.open) / candle.open * 100 : 0;
    const brokeSwingLow = context?.swingSequence?.lastHL && candle?.close < context.swingSequence.lastHL.price;

    if (movePct <= -0.6 || brokeSwingLow) {
      nextBias = 'NEUTRAL'; nextPending = null;
      nextDown = 0; nextUp = 0;
      changed = true; reason = brokeSwingLow 
        ? `Structural Reversal — price broke below last swing low (${context.swingSequence.lastHL.price})`
        : `Hard Invalidation — strong bearish candle (${movePct.toFixed(2)}%) clears bull bias`;
    }
    // 2. Hard exit: CHoCH or Upthrust against bull
    else if (setupId && FORCE_NEUTRAL_AFTER_BULL.has(setupId)) {
      nextBias = 'NEUTRAL'; nextPending = 'BEAR';
      nextDown = 0; nextUp = 0;
      changed = true; reason = `CHoCH/Upthrust — bias clearing to NEUTRAL`;
    }
    // 3. Confirmed BOS against bull (not fresh — already held for 1+ candle)
    else if (bos?.type === 'bear' && !bos?.freshBreak) {
      nextBias = 'NEUTRAL'; nextPending = 'BEAR';
      nextDown = 0; nextUp = 0;
      changed = true; reason = `Confirmed bear BOS — clearing bull bias`;
    }
    // 4. Reality check: sustained downtrend + below VWAP for 2 candles
    else {
      if (trend === 'downtrend' && aboveVwap === false) {
        nextDown = downtrendCount + 1;
        if (nextDown >= 2) {
          nextBias = 'NEUTRAL'; nextPending = null;
          nextDown = 0;
          changed = true; reason = `Reality check — Price sustained below VWAP for 2 candles`;
        }
      } else {
        nextDown = 0;
      }
    }
  }

  // ── BEAR state ─────────────────────────────────────────────────────────────
  else if (bias === 'BEAR') {
    // 1. FAST INVALIDATION (0.6% against trend)
    const movePct = candle ? (candle.close - candle.open) / candle.open * 100 : 0;
    if (movePct >= 0.6) {
      nextBias = 'NEUTRAL'; nextPending = null;
      nextDown = 0; nextUp = 0;
      changed = true; reason = `Hard Invalidation — strong bullish candle (${movePct.toFixed(2)}%) clears bear bias`;
    }
    // 2. Hard exit: CHoCH or Spring against bear
    else if (setupId && FORCE_NEUTRAL_AFTER_BEAR.has(setupId)) {
      nextBias = 'NEUTRAL'; nextPending = 'BULL';
      nextDown = 0; nextUp = 0;
      changed = true; reason = `CHoCH/Spring — bias clearing to NEUTRAL`;
    }
    // 3. Confirmed BOS against bear
    else if (bos?.type === 'bull' && !bos?.freshBreak) {
      nextBias = 'NEUTRAL'; nextPending = 'BULL';
      nextDown = 0; nextUp = 0;
      changed = true; reason = `Confirmed bull BOS — clearing bear bias`;
    }
    // 4. Reality check: sustained uptrend + above VWAP for 2 candles (Expert: 3 was too slow)
    else {
      if (trend === 'uptrend' && aboveVwap === true) {
        nextUp = uptrendCount + 1;
        if (nextUp >= 2) {
          nextBias = 'NEUTRAL'; nextPending = null;
          nextUp = 0;
          changed = true; reason = `Reality check — 2 candles uptrend + above VWAP`;
        }
      } else {
        nextUp = 0;
      }
    }
  }

  // ── NEUTRAL state ──────────────────────────────────────────────────────────
  else {
    nextDown = 0; nextUp = 0;

    // Check if a pending flip has a confirming signal this candle
    if (pendingFlip === 'BULL' && setupDir === 'bull' && setupScore >= 5) {
      nextBias = 'BULL'; nextPending = null;
      changed = true; reason = `Pending bull confirm — ${setupId} (score ${setupScore})`;
    }
    else if (pendingFlip === 'BEAR' && setupDir === 'bear' && setupScore >= 5) {
      nextBias = 'BEAR'; nextPending = null;
      changed = true; reason = `Pending bear confirm — ${setupId} (score ${setupScore})`;
    }
    // Fresh hard bull signal from neutral (no pending needed)
    else if (setupId && HARD_BULL_IDS.has(setupId) && setupScore >= 6) {
      nextBias = 'BULL'; nextPending = null;
      changed = true; reason = `${setupId} (score ${setupScore}) — going BULL`;
    }
    // Fresh hard bear signal from neutral
    else if (setupId && HARD_BEAR_IDS.has(setupId) && setupScore >= 6) {
      nextBias = 'BEAR'; nextPending = null;
      changed = true; reason = `${setupId} (score ${setupScore}) — going BEAR`;
    }
    // Stale pending flip — expire after 2 candles with no confirming signal
    // (pendingFlip is cleared when the 2nd neutral candle passes without confirmation)
    // This is handled by the caller maintaining a pendingFlipAge counter
  }

  return {
    bias:           nextBias,
    downtrendCount: nextDown,
    uptrendCount:   nextUp,
    pendingFlip:    changed && nextBias !== 'NEUTRAL' ? null : nextPending,
    changed,
    reason:         changed ? reason : null,
    prevBias:       bias,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// isNewTradingDay
// Returns true if the last stored bias date is different from today IST.
// Used to auto-reset bias at session start each day.
// ─────────────────────────────────────────────────────────────────────────────

export function todayIST() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function isNewTradingDay(storedDate) {
  return !storedDate || storedDate !== todayIST();
}

// ─────────────────────────────────────────────────────────────────────────────
// freshBiasState — default state for a new session
// ─────────────────────────────────────────────────────────────────────────────

export function freshBiasState() {
  return {
    bias:           'NEUTRAL',
    date:           todayIST(),
    since:          null,         // IST HH:MM when current bias started
    downtrendCount: 0,
    uptrendCount:   0,
    addsToday:      0,            // tracks pyramid adds
    pendingFlip:    null,
    pendingFlipAge: 0,
    lastUpdated:    null,         // ISO timestamp of last candle processed
  };
}
