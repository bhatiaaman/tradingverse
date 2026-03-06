// Copyright (c) 2025 Amandeep Bhatia — TradePreflight
// Licensed under Apache 2.0 — https://github.com/amanbhatia/tradepreflight
// ─────────────────────────────────────────────────────────────────────────────
// OI Agent — "What does Open Interest tell me about this trade?"
//
// Index options only: NIFTY and BANKNIFTY.
// Returns null/unavailable for any other symbol.
//
// 4 checks:
//   1) PCR extremes (contrarian crowding signal)
//   2) OI wall alignment (CE wall = resistance, PE wall = support)
//   3) Max pain proximity near expiry
//   4) Market activity (Long Buildup / Short Covering / etc.) vs trade direction
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getTradeBias(instrumentType, transactionType) {
  if (instrumentType === 'CE') return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH';
  if (instrumentType === 'PE') return transactionType === 'BUY' ? 'BEARISH' : 'BULLISH';
  return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH'; // EQ / FUT
}

function formatOI(oi) {
  if (!oi) return '0L';
  return (oi / 100000).toFixed(1) + 'L';
}

function scoreToVerdict(score) {
  if (score === 0)  return 'clear';
  if (score < 20)   return 'caution';
  if (score < 45)   return 'warning';
  return 'danger';
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 1: PCR Bias — extreme PCR as contrarian crowding signal
// PCR < 0.7 = everyone bullish → contrarian risk for bulls
// PCR > 1.5 = extreme fear → contrarian risk for bears
// ─────────────────────────────────────────────────────────────────────────────
function checkPCRBias(data) {
  const { pcr } = data.oiData;
  if (pcr == null) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  if (pcr < 0.7 && tradeBias === 'BULLISH') {
    return {
      type:     'PCR_EXTREME_GREED',
      severity: 'caution',
      title:    `PCR ${pcr.toFixed(2)} — excessive call writing, contrarian risk for bulls`,
      detail:   `PCR below 0.7 signals crowded bullishness. When everyone is long, the market tends to reverse from extremes. Consider reducing size.`,
      riskScore: 10,
    };
  }

  if (pcr > 1.5 && tradeBias === 'BEARISH') {
    return {
      type:     'PCR_EXTREME_FEAR',
      severity: 'caution',
      title:    `PCR ${pcr.toFixed(2)} — excessive put buying, contrarian risk for bears`,
      detail:   `PCR above 1.5 signals extreme fear. Crowded shorts often get squeezed. Consider waiting for PCR to normalise.`,
      riskScore: 10,
    };
  }

  return { passed: true, title: `PCR ${pcr.toFixed(2)} — no crowding extreme` };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 2: OI Wall Alignment — buying into CE wall or selling into PE wall
// CE wall (highest Call OI strike) = supply / resistance overhead
// PE wall (highest Put OI strike)  = demand / support below
// ─────────────────────────────────────────────────────────────────────────────
function checkOIWallAlignment(data) {
  const { support, supportOI, resistance, resistanceOI, spotPrice } = data.oiData;
  if (!support || !resistance || !spotPrice) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const band = spotPrice * 0.0075; // 0.75% proximity band

  const nearResistance = Math.abs(spotPrice - resistance) <= band;
  const nearSupport    = Math.abs(spotPrice - support)    <= band;

  // ── Conflict: trading into a wall ─────────────────────────────────────────
  if (nearResistance && tradeBias === 'BULLISH') {
    return {
      type:     'BUYING_INTO_CE_WALL',
      severity: 'warning',
      title:    `Buying into CE wall at ₹${resistance} — ${formatOI(resistanceOI)} contracts overhead`,
      detail:   `Call writers have heavy positions at ₹${resistance}. Strong supply overhead. Wait for the wall to break or widen before entering long.`,
      riskScore: 15,
    };
  }

  if (nearSupport && tradeBias === 'BEARISH') {
    return {
      type:     'SELLING_INTO_PE_WALL',
      severity: 'warning',
      title:    `Selling into PE wall at ₹${support} — ${formatOI(supportOI)} contracts below`,
      detail:   `Put writers are defending ₹${support}. Strong demand below. Risk of bounce if the wall holds — wait for it to break before shorting.`,
      riskScore: 15,
    };
  }

  // ── Aligned: wall is behind the trade ────────────────────────────────────
  if (nearSupport && tradeBias === 'BULLISH') {
    return { passed: true, title: `PE wall at ₹${support} (${formatOI(supportOI)}) — demand floor supporting trade` };
  }
  if (nearResistance && tradeBias === 'BEARISH') {
    return { passed: true, title: `CE wall at ₹${resistance} (${formatOI(resistanceOI)}) — supply ceiling supporting trade` };
  }

  // ── No nearby wall ────────────────────────────────────────────────────────
  return { passed: true, title: `No OI wall within 0.75% — price in open space` };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 3: Max Pain Proximity — near expiry, price gravitates to max pain
// Relevant only within 3 days of weekly expiry
// ─────────────────────────────────────────────────────────────────────────────
function checkMaxPain(data) {
  const { maxPain, spotPrice, expiry } = data.oiData;
  if (!maxPain || !spotPrice || !expiry) return null;

  const expiryDate    = new Date(expiry);
  const now           = new Date();
  const daysToExpiry  = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
  const pctFromMaxPain = Math.abs(spotPrice - maxPain) / spotPrice * 100;

  if (daysToExpiry <= 3 && pctFromMaxPain > 1.5) {
    return {
      type:     'MAX_PAIN_DIVERGENCE',
      severity: 'caution',
      title:    `Max pain ₹${maxPain} is ${pctFromMaxPain.toFixed(1)}% from spot — ${daysToExpiry}d to expiry`,
      detail:   `Near expiry, market makers defend max pain to minimise option payouts. Price gravitates to ₹${maxPain} into settlement.`,
      riskScore: 10,
    };
  }

  if (daysToExpiry <= 3) {
    return { passed: true, title: `Price near max pain ₹${maxPain} — expiry pinning risk is low` };
  }

  return { passed: true, title: `Max pain ₹${maxPain} — ${daysToExpiry}d to expiry, low pinning pressure` };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 4: Market Activity — OI flow vs trade direction
// Long Buildup / Short Covering → BULLISH
// Long Unwinding / Short Buildup → BEARISH
// Initializing → NEUTRAL (skip check)
// ─────────────────────────────────────────────────────────────────────────────
function checkMarketActivity(data) {
  const marketActivity = data.oiData?.marketActivity;
  if (!marketActivity) return null;

  const { activity, description, actionable } = marketActivity;
  if (!activity || activity === 'Initializing') return null;

  const ACTIVITY_BIAS = {
    'Long Buildup':   'BULLISH',
    'Short Covering': 'BULLISH',
    'Long Unwinding': 'BEARISH',
    'Short Buildup':  'BEARISH',
  };

  const activityBias = ACTIVITY_BIAS[activity];
  if (!activityBias) return null; // unknown activity, skip

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  if (activityBias === tradeBias) {
    return { passed: true, title: `${activity} — OI flow aligned with ${tradeBias.toLowerCase()} trade` };
  }

  return {
    type:     'ACTIVITY_CONFLICT',
    severity: 'caution',
    title:    `${activity} — OI flow conflicts with ${tradeBias.toLowerCase()} trade`,
    detail:   `${description ?? ''}${actionable ? '. ' + actionable : ''}`.trim(),
    riskScore: 12,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────
const CHECKS = [
  checkPCRBias,
  checkOIWallAlignment,
  checkMaxPain,
  checkMarketActivity,
];

const PASS_LABELS = {
  checkPCRBias:         'PCR within normal range',
  checkOIWallAlignment: 'No nearby OI wall conflict',
  checkMaxPain:         'Max pain — no expiry pressure',
  checkMarketActivity:  'OI activity — no signal yet',
};

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export function runOIAgent(data) {
  const checks = CHECKS.map(check => {
    try {
      const result = check(data);
      if (!result)       return { type: check.name, passed: true,  title: PASS_LABELS[check.name] ?? check.name };
      if (result.passed) return { type: check.name, passed: true,  title: result.title };
      return { ...result, passed: false };
    } catch (e) {
      console.error(`OI check error [${check.name}]:`, e);
      return { type: check.name, passed: true, title: PASS_LABELS[check.name] ?? check.name };
    }
  });

  const triggered = checks.filter(c => !c.passed);
  const riskScore = triggered.reduce((sum, b) => sum + (b.riskScore ?? 0), 0);
  const verdict   = scoreToVerdict(riskScore);

  return { behaviors: triggered, checks, verdict, riskScore };
}
