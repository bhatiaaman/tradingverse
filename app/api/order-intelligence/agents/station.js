// Copyright (c) 2025 Amandeep Bhatia — TradePreflight
// Licensed under Apache 2.0 — https://github.com/amanbhatia/tradepreflight
// ─────────────────────────────────────────────────────────────────────────────
// Station Agent — answers "Am I at the right zone to trade?"
//
// A Station Zone has price memory: prior swing high/low, consolidation,
// volume cluster, S/R flip, or liquidity.
//
// 3 valid scenarios:
//   A) Break + Retest → enter in direction of break
//   B) Rejection at Zone → reversal entry
//   C) Inside Zone → CAUTION, no-trade
//
// MIS → 5 checks
// NRML / CNC → 5 + 2 daily checks = 7 checks
// ─────────────────────────────────────────────────────────────────────────────

import { detectStations } from '../../behavioral-agent/lib/station-detector.js';

// ─────────────────────────────────────────────────────────────────────────────
// Direction helper (same as all other agents)
// ─────────────────────────────────────────────────────────────────────────────
function getTradeBias(instrumentType, transactionType) {
  if (instrumentType === 'CE') return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH';
  if (instrumentType === 'PE') return transactionType === 'BUY' ? 'BEARISH' : 'BULLISH';
  return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH'; // EQ / FUT
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone State Machine
// Returns: 'BREAK_RETEST' | 'REJECTION' | 'INSIDE_ZONE' | 'AT_ZONE' | 'APPROACHING'
// ─────────────────────────────────────────────────────────────────────────────
function determineZoneState(zone, candles15m, spotPrice) {
  if (!zone || !candles15m?.length) return 'APPROACHING';

  const band    = zone.price * 0.005;  // 0.5% tolerance
  const atZone  = Math.abs(spotPrice - zone.price) <= band;
  const recent  = candles15m.slice(-15);

  // ── Inside zone: ≥3 of last 5 candles straddle zone price ─────────────────
  const last5       = candles15m.slice(-5);
  const straddleCount = last5.filter(c => c.high > zone.price && c.low < zone.price).length;
  if (straddleCount >= 3) return 'INSIDE_ZONE';

  // ── BOS detection ──────────────────────────────────────────────────────────
  // BOS is valid only if at least 3 candles followed it (pullback had time to form)
  let bosIndex = -1;
  for (let i = 0; i < recent.length - 3; i++) {
    if (zone.type === 'RESISTANCE' && recent[i].close > zone.price + band) {
      bosIndex = i;
    }
    if (zone.type === 'SUPPORT' && recent[i].close < zone.price - band) {
      bosIndex = i;
    }
  }
  const hasBOS = bosIndex >= 0;
  if (hasBOS && atZone) return 'BREAK_RETEST';

  // ── Rejection wick on last candle ─────────────────────────────────────────
  if (atZone && recent.length > 0) {
    const last = recent[recent.length - 1];
    const body       = Math.abs(last.close - last.open);
    const upperWick  = last.high - Math.max(last.open, last.close);
    const lowerWick  = Math.min(last.open, last.close) - last.low;
    const hasReject  =
      (zone.type === 'RESISTANCE' && upperWick > body * 1.5) ||
      (zone.type === 'SUPPORT'    && lowerWick > body * 1.5);
    if (hasReject) return 'REJECTION';
    return 'AT_ZONE';
  }

  return 'APPROACHING';
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume expansion helper — used by checkVolumeExpansion
// ─────────────────────────────────────────────────────────────────────────────
function findBreakVolumeRatio(zone, candles15m) {
  if (!candles15m || candles15m.length < 20) return null;
  const band   = zone.price * 0.005;
  const recent = candles15m.slice(-15);
  const avg20  = candles15m.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  if (avg20 === 0) return null;

  // Find first candle that closed beyond zone
  const breakCandle = recent.find(c =>
    (zone.type === 'RESISTANCE' && c.close > zone.price + band) ||
    (zone.type === 'SUPPORT'    && c.close < zone.price - band)
  );
  if (!breakCandle) return null;
  return breakCandle.volume / avg20;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── CHECKS ───────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// CHECK 1: Is there a meaningful zone nearby?
function checkZonePresence(data) {
  const sr = data.stationResult;
  if (!sr?.available || !sr.nearestStation) {
    return { passed: true, title: 'No major zone within 2% — open space entry' };
  }

  const z = sr.nearestStation;
  if (z.distance > 2) {
    return {
      passed: true,
      title: `Nearest zone ₹${z.price.toFixed(0)} (${z.type.toLowerCase()}) at ${z.distance.toFixed(1)}% — approaching`,
    };
  }

  const zLabel   = z.type.charAt(0) + z.type.slice(1).toLowerCase();
  const factors  = z.factors?.length ? z.factors : null;
  const factorSuffix = factors
    ? (factors.length === 1 ? ` — ${factors[0]}` : ` — ${factors.join(', ')} (${factors.length} signals)`)
    : ` — quality ${z.quality}/10`;
  return {
    passed: true,
    title: `${zLabel} ₹${z.price.toFixed(0)}${factorSuffix}`,
  };
}

// CHECK 2: Is trade direction aligned with zone type?
function checkZoneAlignment(data) {
  const sr = data.stationResult;
  if (!sr?.available || !sr.nearestStation || sr.nearestStation.distance > 2) return null;

  const zone      = sr.nearestStation;
  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const zoneState = data._zoneState;  // pre-computed in runStationAgent

  // ── BOS flip: resistance broken upward → now acts as support ──────────────
  if (zoneState === 'BREAK_RETEST') {
    const bullishFlip = zone.type === 'RESISTANCE' && tradeBias === 'BULLISH';
    const bearishFlip = zone.type === 'SUPPORT'    && tradeBias === 'BEARISH';
    if (bullishFlip) {
      return { passed: true, title: `Resistance ₹${zone.price.toFixed(0)} flipped to support after BOS — aligned` };
    }
    if (bearishFlip) {
      return { passed: true, title: `Support ₹${zone.price.toFixed(0)} flipped to resistance after BOS — aligned` };
    }
  }

  // ── Aligned (no flip needed) ───────────────────────────────────────────────
  if (zone.type === 'PIVOT') {
    return { passed: true, title: `Pivot zone ₹${zone.price.toFixed(0)} — bidirectional decision point` };
  }
  if (zone.type === 'SUPPORT' && tradeBias === 'BULLISH') {
    return { passed: true, title: `Buying at support ₹${zone.price.toFixed(0)} — zone is demand` };
  }
  if (zone.type === 'RESISTANCE' && tradeBias === 'BEARISH') {
    return { passed: true, title: `Selling at resistance ₹${zone.price.toFixed(0)} — zone is supply` };
  }

  // ── Conflict ──────────────────────────────────────────────────────────────
  if (zone.type === 'RESISTANCE' && tradeBias === 'BULLISH') {
    return {
      type: 'ZONE_ALIGNMENT_CONFLICT',
      severity: 'warning',
      title: `Buying into resistance ₹${zone.price.toFixed(0)} — zone is supply pressure`,
      detail: `This zone (${zone.factors?.join(', ')}) has acted as resistance. Without a confirmed breakout, buying here means fighting supply. Wait for a BOS or trade from support below.`,
      riskScore: 15,
    };
  }
  if (zone.type === 'SUPPORT' && tradeBias === 'BEARISH') {
    return {
      type: 'ZONE_ALIGNMENT_CONFLICT',
      severity: 'warning',
      title: `Selling into support ₹${zone.price.toFixed(0)} — zone is demand`,
      detail: `This zone (${zone.factors?.join(', ')}) has acted as support. Without a confirmed breakdown, selling here means fighting demand. Wait for a BOS or trade from resistance above.`,
      riskScore: 15,
    };
  }

  return null;
}

// CHECK 3: Which scenario is price in? (A/B/C)
function checkZoneScenario(data) {
  const sr = data.stationResult;
  if (!sr?.available || !sr.nearestStation || sr.nearestStation.distance > 2) return null;

  const zone      = sr.nearestStation;
  const zoneState = data._zoneState;
  const zoneLow   = zone.price * 0.995;
  const zoneHigh  = zone.price * 1.005;

  const zoneLabel = zone.type.charAt(0) + zone.type.slice(1).toLowerCase();

  switch (zoneState) {
    case 'BREAK_RETEST':
      return { passed: true, title: `Break+Retest at ${zoneLabel} ₹${zone.price.toFixed(0)} — high-probability continuation` };
    case 'REJECTION':
      return { passed: true, title: `Rejection from ${zoneLabel} ₹${zone.price.toFixed(0)} — wick confirms reversal` };
    case 'AT_ZONE':
    case 'APPROACHING':
      return { passed: true, title: `Approaching ${zoneLabel} ₹${zone.price.toFixed(0)} — watch for setup confirmation` };
    case 'INSIDE_ZONE':
      return {
        type:     'INSIDE_ZONE',
        severity: 'caution',
        title:    `Price inside ${zoneLabel} ₹${zone.price.toFixed(0)} — no-trade zone`,
        detail:   `Overlapping candles inside the ${zoneLabel} zone. Wait for a confirmed break above ₹${zoneHigh.toFixed(0)} or below ₹${zoneLow.toFixed(0)} before entering.`,
        riskScore: 12,
      };
    default:
      return null;
  }
}

// CHECK 4: Volume expansion on break (only relevant for BREAK_RETEST)
function checkVolumeExpansion(data) {
  if (data._zoneState !== 'BREAK_RETEST') return null;

  const sr = data.stationResult;
  if (!sr?.available || !sr.nearestStation) return null;

  const volRatio = findBreakVolumeRatio(sr.nearestStation, data.stationData?.candles15m);
  if (volRatio == null) return null;

  if (volRatio < 1.5) {
    return {
      type:     'LOW_BREAK_VOLUME',
      severity: 'caution',
      title:    `Break without volume expansion (${volRatio.toFixed(1)}× avg) — fakeout risk`,
      detail:   `The break candle had below-average volume. Volume should expand on a genuine breakout to confirm institutional participation.`,
      riskScore: 8,
    };
  }

  return {
    passed: true,
    title:  `Volume expanded on break (${volRatio.toFixed(1)}× avg) — breakout confirmed`,
  };
}

// CHECK 5: Zone quality and retest count
function checkZoneStrength(data) {
  const sr = data.stationResult;
  if (!sr?.available || !sr.nearestStation || sr.nearestStation.distance > 2) return null;

  const zone      = sr.nearestStation;
  const zoneLabel = zone.type.charAt(0) + zone.type.slice(1).toLowerCase();

  if (zone.quality < 4) {
    return {
      type:     'WEAK_ZONE',
      severity: 'caution',
      title:    `Weak ${zoneLabel} zone (quality ${zone.quality}/10) — single-timeframe only`,
      detail:   `Zone has low confluence (${zone.factors?.join(', ')}). Multi-timeframe zones (quality ≥ 6) are more reliable. Consider waiting for a stronger zone.`,
      riskScore: 8,
    };
  }
  if (zone.tests > 3) {
    return {
      type:     'ZONE_WEAKENED',
      severity: 'caution',
      title:    `${zoneLabel} zone weakened — ${zone.tests} retests reduce reliability`,
      detail:   `This ${zoneLabel} zone has been tested ${zone.tests} times. Each retest consumes liquidity; zones become less reliable after 3+ tests.`,
      riskScore: 8,
    };
  }

  if (zone.quality >= 6 && zone.tests <= 3) {
    return { passed: true, title: `Strong ${zoneLabel} zone — quality ${zone.quality}/10, ${zone.tests} prior test(s)` };
  }
  return { passed: true, title: `${zoneLabel} zone quality ${zone.quality}/10` };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SWING-ONLY CHECKS (NRML / CNC) ──────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// CHECK 6: Does the zone have daily timeframe confluence?
function checkDailyZoneConfluence(data) {
  const sr = data.stationResult;
  if (!sr?.available || !sr.nearestStation || sr.nearestStation.distance > 2) return null;

  const zone       = sr.nearestStation;
  const hasDaily   = zone.timeframes?.includes('Daily') || zone.factors?.some(f => f.includes('Daily'));

  if (hasDaily) {
    return { passed: true, title: `Zone confirmed on daily timeframe — suitable for swing` };
  }

  return {
    type:     'NO_DAILY_CONFLUENCE',
    severity: 'caution',
    title:    'Zone is 15m-only — no daily timeframe confirmation',
    detail:   `For swing trades, zones with daily timeframe factors (daily EMA or daily swing S/R) carry more weight. Current zone factors: ${zone.factors?.join(', ') ?? 'none'}.`,
    riskScore: 10,
  };
}

// CHECK 7: Has daily price already moved well beyond the zone?
function checkDailyApproachAngle(data) {
  const sr = data.stationResult;
  if (!sr?.available || !sr.nearestStation) return null;

  const candlesDaily = data.stationData?.candlesDaily;
  if (!candlesDaily?.length || candlesDaily.length < 3) return null;

  const zone        = sr.nearestStation;
  const last3daily  = candlesDaily.slice(-3);
  const threshold   = zone.price * 0.01;  // 1% beyond zone

  // Count how many of last 3 daily candles closed meaningfully past zone
  const pastCount = last3daily.filter(c => {
    const pastResistance = zone.type === 'RESISTANCE' && c.close > zone.price + threshold;
    const pastSupport    = zone.type === 'SUPPORT'    && c.close < zone.price - threshold;
    return pastResistance || pastSupport;
  }).length;

  if (pastCount >= 2) {
    return {
      type:     'ZONE_EXTENDED',
      severity: 'caution',
      title:    'Price has moved significantly beyond zone on daily — may be extended',
      detail:   `${pastCount} of the last 3 daily candles closed more than 1% beyond the zone (₹${zone.price.toFixed(0)}). The zone may no longer be relevant for the current swing setup.`,
      riskScore: 8,
    };
  }

  return { passed: true, title: `Daily approach angle to zone ₹${zone.price.toFixed(0)} looks intact` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registries — paired [fn, passLabel] so labels never rely on check.name lookup
// ─────────────────────────────────────────────────────────────────────────────
const INTRADAY_CHECKS = [
  [checkZonePresence,    'No major zone within 2% — open space entry'],
  [checkZoneAlignment,   'Zone aligned with trade direction'],
  [checkZoneScenario,    'No zone scenario conflict'],
  [checkVolumeExpansion, 'Volume confirms move'],
  [checkZoneStrength,    'Zone strength adequate'],
];

const SWING_EXTRA_CHECKS = [
  [checkDailyZoneConfluence, 'Daily zone confluence present'],
  [checkDailyApproachAngle,  'Daily approach angle intact'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Verdict — same thresholds as all other agents
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
export function runStationAgent(data) {
  // 1. Run detectStations once (5m candles not available — degrades gracefully)
  let stationResult = null;
  try {
    stationResult = detectStations({
      candles: {
        candles5m:    null,
        candles15m:   data.stationData?.candles15m ?? [],
        candlesDaily: data.stationData?.candlesDaily ?? [],
      },
      currentPrice:    data.order.spotPrice,
      transactionType: data.order.transactionType,
    });
  } catch (e) {
    console.error('station: detectStations failed', e);
  }

  // 2. Pre-compute zone state once — shared across all checks
  const zone      = stationResult?.nearestStation ?? null;
  const zoneState = determineZoneState(zone, data.stationData?.candles15m, data.order.spotPrice);

  // 3. Enrich data
  const enriched = { ...data, stationResult, _zoneState: zoneState };

  // 4. Pick registry (each entry is [checkFn, passLabel])
  const isSwing  = ['NRML', 'CNC'].includes(data.order.productType?.toUpperCase());
  const registry = isSwing
    ? [...INTRADAY_CHECKS, ...SWING_EXTRA_CHECKS]
    : INTRADAY_CHECKS;

  // 5. Run checks — same try/catch map as all other agents
  const checks = registry.map(([check, passLabel]) => {
    try {
      const result = check(enriched);
      if (!result)         return { type: check.name, passed: true,  title: passLabel };
      if (result.passed)   return { type: check.name, passed: true,  title: result.title };
      return { ...result, passed: false };
    } catch (e) {
      console.error(`Station check error [${check.name}]:`, e);
      return { type: check.name, passed: true, title: passLabel };
    }
  });

  const triggered = checks.filter(c => !c.passed);
  const riskScore = triggered.reduce((sum, b) => sum + (b.riskScore ?? 0), 0);
  const verdict   = scoreToVerdict(riskScore);

  return { behaviors: triggered, checks, verdict, riskScore };
}
