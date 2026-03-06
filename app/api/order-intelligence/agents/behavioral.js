// Copyright (c) 2025 Amandeep Bhatia — TradePreflight
// Licensed under Apache 2.0 — https://github.com/amanbhatia/tradepreflight
import { getSector } from '../lib/sector-map.js';

// ─────────────────────────────────────────────────────────────────────────────
// Direction helper
// BUY CE = Bullish, SELL CE = Bearish
// BUY PE = Bearish, SELL PE = Bullish
// BUY EQ = Bullish, SELL EQ = Bearish
// ─────────────────────────────────────────────────────────────────────────────
function getTradeBias(instrumentType, transactionType) {
  if (instrumentType === 'CE') return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH';
  if (instrumentType === 'PE') return transactionType === 'BUY' ? 'BEARISH' : 'BULLISH';
  return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH'; // EQ / FUT
}

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOR 1: Adding to a losing position
// Fires when user already holds the same symbol in the same direction at a loss.
// ─────────────────────────────────────────────────────────────────────────────
function checkAddingToLoser(data) {
  const { sameSymbol } = data.positions;
  if (!sameSymbol) return null;

  const addingLong  = sameSymbol.quantity > 0 && data.order.transactionType === 'BUY';
  const addingShort = sameSymbol.quantity < 0 && data.order.transactionType === 'SELL';
  if (!addingLong && !addingShort) return null;

  const threshold = data.order.exchange === 'NFO' ? -500 : -200;
  if (sameSymbol.pnl >= threshold) return null;

  const loss = Math.abs(sameSymbol.pnl).toFixed(0);
  return {
    type: 'ADDING_TO_LOSER',
    severity: 'warning',
    title: 'Adding to a losing position',
    detail: `${sameSymbol.tradingsymbol} is currently down ₹${loss}. Averaging in increases your risk.`,
    riskScore: 25,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOR 2: Going against the trend (overall market + sector)
// Fires when trade direction conflicts with overall market and/or sector bias.
// ─────────────────────────────────────────────────────────────────────────────
function checkAgainstTrend(data) {
  const { overallBias, intradayBias } = data.sentiment ?? {};
  const { bias: sectorBias, name: sectorName } = data.sector ?? {};
  const { transactionType, instrumentType, symbol } = data.order;

  const tradeBias = getTradeBias(instrumentType, transactionType);

  // Use intraday bias if available, fallback to overall
  const marketBias = intradayBias || overallBias;

  const conflicts = [];

  if (marketBias && marketBias !== 'NEUTRAL' && marketBias !== tradeBias) {
    conflicts.push({ label: 'Market', bias: marketBias });
  }

  // Only check sector if the symbol has a known sector mapping
  const symbolSector = getSector(symbol);
  if (symbolSector && sectorBias && sectorBias !== 'NEUTRAL' && sectorBias !== tradeBias) {
    conflicts.push({ label: sectorName || symbolSector, bias: sectorBias });
  }

  if (conflicts.length === 0) return null;

  const bothConflict = conflicts.length === 2;
  const conflictText = conflicts
    .map(c => `${c.label} is ${c.bias.toLowerCase()}`)
    .join(' and ');

  return {
    type: 'AGAINST_TREND',
    severity: bothConflict ? 'warning' : 'caution',
    title: 'Going against the trend',
    detail: `Counter-trend trade: ${conflictText}.`,
    riskScore: bothConflict ? 20 : 10,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOR 3: Too many open positions
// Fires when 4+ positions are open before placing another order.
// ─────────────────────────────────────────────────────────────────────────────
function checkPositionCount(data) {
  const count = data.positions?.count ?? 0;
  if (count < 4) return null;

  return {
    type: 'HIGH_POSITION_COUNT',
    severity: count >= 6 ? 'warning' : 'caution',
    title: 'High number of open positions',
    detail: `You already have ${count} open positions. Adding more increases overall portfolio risk.`,
    riskScore: count >= 6 ? 15 : 8,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOR 4: High VIX (India VIX > 18)
// Fires when market volatility is elevated — options are expensive, risk is high.
// ─────────────────────────────────────────────────────────────────────────────
function checkHighVIX(data) {
  const vix = data.vix;
  if (vix == null || isNaN(vix)) return null;

  if (vix > 25) {
    return {
      type: 'HIGH_VIX',
      severity: 'warning',
      title: `High volatility — VIX ${vix.toFixed(1)}`,
      detail: `VIX above 25 means options are expensive and wide swings are likely. Use tighter stops and smaller size.`,
      riskScore: 18,
    };
  }
  if (vix > 18) {
    return {
      type: 'ELEVATED_VIX',
      severity: 'caution',
      title: `Elevated volatility — VIX ${vix.toFixed(1)}`,
      detail: `VIX above 18 — premium is above normal. Factor in wider stop-loss.`,
      riskScore: 8,
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOR 5: Duplicate open order
// Fires when an open/pending order already exists for the same symbol.
// ─────────────────────────────────────────────────────────────────────────────
function checkDuplicateOrder(data) {
  const { open } = data.orders ?? {};
  const symbol = data.order.symbol?.toUpperCase();
  if (!open?.length || !symbol) return null;

  const dupe = open.find(o =>
    o.tradingsymbol?.toUpperCase().startsWith(symbol)
  );
  if (!dupe) return null;

  return {
    type: 'DUPLICATE_ORDER',
    severity: 'caution',
    title: 'Open order already exists',
    detail: `${dupe.tradingsymbol} has a ${dupe.status?.toLowerCase()} ${dupe.transaction_type?.toLowerCase()} order pending. Placing another may double your exposure.`,
    riskScore: 12,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOR 6: Sector overexposure
// Fires when 2+ existing positions are already in the same sector as the trade.
// ─────────────────────────────────────────────────────────────────────────────
function checkSectorExposure(data) {
  const sectorName = data.sector?.name;
  const positions  = data.positions?.all;
  if (!sectorName || !positions?.length) return null;

  const count = positions.filter(p => {
    // Strip expiry/strike suffix to get root symbol (e.g. RELIANCE26MAR1400CE → RELIANCE)
    const root = p.tradingsymbol?.replace(/\d.*$/, '').toUpperCase();
    return getSector(root) === sectorName;
  }).length;

  if (count < 2) return null;

  return {
    type: 'SECTOR_OVEREXPOSURE',
    severity: count >= 3 ? 'warning' : 'caution',
    title: 'Sector overexposure',
    detail: `You already have ${count} open positions in ${sectorName}. Adding more concentrates sector risk.`,
    riskScore: count >= 3 ? 18 : 10,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Registry — paired [fn, passLabel] so labels never rely on check.name lookup
// ─────────────────────────────────────────────────────────────────────────────
const BEHAVIORS = [
  [checkAddingToLoser,  'No loser averaging'],
  [checkAgainstTrend,   'Trade aligned with trend'],
  [checkPositionCount,  'Position count OK'],
  [checkHighVIX,        'VIX within normal range'],
  [checkDuplicateOrder, 'No duplicate open order'],
  [checkSectorExposure, 'Sector exposure is diversified'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Verdict from cumulative risk score
// ─────────────────────────────────────────────────────────────────────────────
function scoreToVerdict(score) {
  if (score === 0)  return 'clear';
  if (score < 20)   return 'caution';
  if (score < 45)   return 'warning';
  return 'danger';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — run all registered behaviors against the shared data object
// ─────────────────────────────────────────────────────────────────────────────
export function runBehavioralAgent(data) {
  const checks = BEHAVIORS.map(([check, passLabel]) => {
    try {
      const result = check(data);
      if (result) return { ...result, passed: false };
      return { type: check.name, passed: true, title: passLabel };
    } catch (e) {
      console.error(`Behavior check error:`, e);
      return { type: check.name, passed: true, title: passLabel };
    }
  });

  const triggered = checks.filter(c => !c.passed);
  const riskScore = triggered.reduce((sum, b) => sum + (b.riskScore ?? 0), 0);
  const verdict   = scoreToVerdict(riskScore);

  return { behaviors: triggered, checks, verdict, riskScore };
}
