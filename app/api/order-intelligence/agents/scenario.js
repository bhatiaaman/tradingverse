// ─────────────────────────────────────────────────────────────────────────────
// Scenario Synthesizer — "What is the overall setup here?"
//
// Reads outputs from all agents + raw context (sentiment, OI, zone state)
// and produces a single high-level scenario assessment with confidence.
//
// Scenario types:
//   MEAN_REVERSION_SELL  — at/near resistance, multiple bearish signals
//   MEAN_REVERSION_BUY   — at/near support, multiple bullish signals
//   REJECTION_SELL       — rejection wick at resistance confirms short
//   REJECTION_BUY        — rejection wick at support confirms long
//   BREAK_RETEST_LONG    — broken resistance retested as support, long
//   BREAK_RETEST_SHORT   — broken support retested as resistance, short
//   BREAKOUT_LONG        — confirmed breakout above resistance
//   BREAKDOWN_SHORT      — confirmed breakdown below support
//   MOMENTUM_LONG        — no nearby zone, bullish momentum
//   MOMENTUM_SHORT       — no nearby zone, bearish momentum
//   INSIDE_ZONE          — price inside zone — no-trade
//   COUNTER_TREND        — trade direction conflicts with zone + market
//   UNCLEAR              — insufficient data
// ─────────────────────────────────────────────────────────────────────────────

function getTradeBias(instrumentType, transactionType) {
  if (instrumentType === 'CE') return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH';
  if (instrumentType === 'PE') return transactionType === 'BUY' ? 'BEARISH' : 'BULLISH';
  return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH';
}

function getTradeIntent(instrumentType, transactionType) {
  const tx = transactionType === 'BUY' ? 'Buying' : 'Selling';
  const bias = getTradeBias(instrumentType, transactionType);
  const biasLabel = bias === 'BULLISH' ? 'Bullish' : 'Bearish';
  if (instrumentType === 'CE' || instrumentType === 'PE') {
    return `${tx} ${instrumentType} → ${biasLabel}`;
  }
  return `${tx} → ${biasLabel}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classify the primary scenario based on zone state + trade bias
// ─────────────────────────────────────────────────────────────────────────────
function classifyScenario(tradeBias, zoneState, zoneType, zoneDistance, stationLoaded, order) {
  // Station not loaded yet — no zone data, default to open-space momentum
  if (!stationLoaded) return tradeBias === 'BULLISH' ? 'MOMENTUM_LONG' : 'MOMENTUM_SHORT';

  const threshold = (order?.productType === 'MIS' || order?.productType === 'BO') ? 0.75 : 2;

  // Station loaded, but no zone found nearby (or beyond threshold) — open space momentum
  if (!zoneState || !zoneType || zoneDistance == null || zoneDistance > threshold) {
    return tradeBias === 'BULLISH' ? 'MOMENTUM_LONG' : 'MOMENTUM_SHORT';
  }

  if (zoneState === 'INSIDE_ZONE') return 'INSIDE_ZONE';

  if (zoneState === 'FAILED_BREAK') {
    // Break didn't hold — zone rejected price back. Trade in direction of rejection.
    if (zoneType === 'RESISTANCE' && tradeBias === 'BEARISH') return 'MEAN_REVERSION_SELL';
    if (zoneType === 'SUPPORT'    && tradeBias === 'BULLISH') return 'MEAN_REVERSION_BUY';
    return 'COUNTER_TREND'; // e.g. buying after failed breakout
  }

  if (zoneState === 'BREAK_RETEST') {
    // Zone was broken then retested — entering in direction of break
    if (zoneType === 'RESISTANCE' && tradeBias === 'BULLISH') return 'BREAK_RETEST_LONG';
    if (zoneType === 'SUPPORT'    && tradeBias === 'BEARISH') return 'BREAK_RETEST_SHORT';
    return 'COUNTER_TREND';
  }

  if (zoneState === 'BROKEN') {
    // Zone broken, price moved away — entering in direction of break
    if (zoneType === 'SUPPORT'    && tradeBias === 'BEARISH') return 'BREAKDOWN_SHORT';
    if (zoneType === 'RESISTANCE' && tradeBias === 'BULLISH') return 'BREAKOUT_LONG';
    return 'COUNTER_TREND';
  }

  if (zoneState === 'REJECTION') {
    if (zoneType === 'RESISTANCE' && tradeBias === 'BEARISH') return 'REJECTION_SELL';
    if (zoneType === 'SUPPORT'    && tradeBias === 'BULLISH') return 'REJECTION_BUY';
    return 'COUNTER_TREND';
  }

  // AT_ZONE or APPROACHING
  if (zoneType === 'RESISTANCE' && tradeBias === 'BEARISH') return 'MEAN_REVERSION_SELL';
  if (zoneType === 'SUPPORT'    && tradeBias === 'BULLISH') return 'MEAN_REVERSION_BUY';
  if (zoneType === 'RESISTANCE' && tradeBias === 'BULLISH') return 'COUNTER_TREND';
  if (zoneType === 'SUPPORT'    && tradeBias === 'BEARISH') return 'COUNTER_TREND';

  return 'UNCLEAR';
}

// ─────────────────────────────────────────────────────────────────────────────
// Human-readable metadata for each scenario type
// ─────────────────────────────────────────────────────────────────────────────
const SCENARIO_META = {
  MEAN_REVERSION_SELL:  { label: 'Mean Reversion Sell',    color: 'red',    summary: 'Price at/near resistance — look for rejection setup' },
  MEAN_REVERSION_BUY:   { label: 'Mean Reversion Buy',     color: 'green',  summary: 'Price at/near support — look for bounce setup' },
  REJECTION_SELL:       { label: 'Rejection Sell',         color: 'red',    summary: 'Rejection wick at resistance confirms short' },
  REJECTION_BUY:        { label: 'Rejection Buy',          color: 'green',  summary: 'Rejection wick at support confirms long' },
  BREAK_RETEST_LONG:    { label: 'Break + Retest Long',    color: 'green',  summary: 'Broken resistance retested as support — continuation' },
  BREAK_RETEST_SHORT:   { label: 'Break + Retest Short',   color: 'red',    summary: 'Broken support retested as resistance — continuation' },
  BREAKOUT_LONG:        { label: 'Breakout Long',          color: 'green',  summary: 'Confirmed break above resistance — momentum entry' },
  BREAKDOWN_SHORT:      { label: 'Breakdown Short',        color: 'red',    summary: 'Confirmed break below support — momentum entry' },
  MOMENTUM_LONG:        { label: 'Open Space — Long',      color: 'green',  summary: 'No nearby zone — price in open space, bias determines direction' },
  MOMENTUM_SHORT:       { label: 'Open Space — Short',     color: 'red',    summary: 'No nearby zone — price in open space, bias determines direction' },
  INSIDE_ZONE:          { label: 'Inside Zone',            color: 'yellow', summary: 'Price inside consolidation — wait for confirmed break' },
  COUNTER_TREND:        { label: 'Zone Conflict',           color: 'yellow', summary: 'Trade direction conflicts with zone and/or market context' },
  UNCLEAR:              { label: 'Run Station Analysis',   color: 'slate',  summary: 'Station analysis needed to identify zones and classify setup' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Gather individual evidence signals
// ─────────────────────────────────────────────────────────────────────────────
// Map an intraday regime string to a clear bias direction (BULLISH/BEARISH/null)
function regimeToBias(regime) {
  if (!regime) return null;
  if (regime === 'TREND_DAY_UP'  || regime === 'SHORT_SQUEEZE')    return 'BULLISH';
  if (regime === 'TREND_DAY_DOWN'|| regime === 'LONG_LIQUIDATION') return 'BEARISH';
  return null; // RANGE_DAY, TRAP_DAY, BREAKOUT_DAY etc. have no clear single direction
}

function gatherSignals({ tradeBias, sentiment, zoneState, zone, oiData, structureChecks, marketRegime, order }) {
  const signals = [];

  // ── Market bias (intraday) ────────────────────────────────────────────────
  // Prefer regime-derived bias (more current than commentary) when it gives a clear direction
  const regimeBias = regimeToBias(marketRegime);
  const mktBias    = regimeBias ?? sentiment?.intradayBias ?? 'NEUTRAL';
  if (mktBias !== 'NEUTRAL') {
    const mktAligned = mktBias === tradeBias;
    signals.push({
      aligned: mktAligned,
      label: mktAligned
        ? `Market ${mktBias.toLowerCase()} — aligned with trade`
        : `Market ${mktBias.toLowerCase()} — counter-trend`,
      weight: 2,
    });
  }

  // ── Zone context ──────────────────────────────────────────────────────────
  const threshold = (order?.productType === 'MIS' || order?.productType === 'BO') ? 0.75 : 2;
  if (zone && zone.distance <= threshold) {
    const z = zone;
    const zLabel = `${z.type.charAt(0)}${z.type.slice(1).toLowerCase()} ₹${z.price.toFixed(0)}`;

    if (zoneState === 'REJECTION') {
      const aligned = (z.type === 'RESISTANCE' && tradeBias === 'BEARISH') ||
                      (z.type === 'SUPPORT'    && tradeBias === 'BULLISH');
      signals.push({ aligned, label: `Rejection wick at ${zLabel} — zone ${aligned ? 'confirmed' : 'conflicting'}`, weight: 3 });
    } else if (zoneState === 'FAILED_BREAK') {
      // Zone held — resistance rejected breakout, or support rejected breakdown
      const aligned = (z.type === 'RESISTANCE' && tradeBias === 'BEARISH') ||
                      (z.type === 'SUPPORT'    && tradeBias === 'BULLISH');
      const verb = z.type === 'RESISTANCE' ? 'Failed breakout' : 'Failed breakdown';
      signals.push({ aligned, label: `${verb} at ${zLabel} — zone ${aligned ? 'confirmed rejection' : 'fighting zone'}`, weight: 3 });
    } else if (zoneState === 'BREAK_RETEST') {
      const aligned = (z.type === 'RESISTANCE' && tradeBias === 'BULLISH') ||
                      (z.type === 'SUPPORT'    && tradeBias === 'BEARISH');
      const priorRole = z.type.charAt(0) + z.type.slice(1).toLowerCase(); // "Resistance" / "Support"
      const newRole   = z.type === 'RESISTANCE' ? 'support' : 'resistance';
      signals.push({ aligned, label: `Break+Retest — prior ${priorRole} ₹${z.price.toFixed(0)} now acting as ${newRole} — ${aligned ? 'continuation setup' : 'wrong direction'}`, weight: 3 });
    } else if (zoneState === 'BROKEN') {
      const aligned = (z.type === 'SUPPORT' && tradeBias === 'BEARISH') ||
                      (z.type === 'RESISTANCE' && tradeBias === 'BULLISH');
      signals.push({ aligned, label: `Broken ${zLabel.toLowerCase()} — ${aligned ? 'momentum aligned' : 'trading against break'}`, weight: 2 });
    } else if (zoneState === 'INSIDE_ZONE') {
      signals.push({ aligned: false, label: `Inside ${zLabel} — no-trade zone`, weight: 2 });
    } else {
      // AT_ZONE or APPROACHING
      const aligned = (z.type === 'RESISTANCE' && tradeBias === 'BEARISH') ||
                      (z.type === 'SUPPORT'    && tradeBias === 'BULLISH');
      const qualSuffix = z.quality >= 7 ? ' (strong)' : '';
      const prefix = zoneState === 'APPROACHING' ? 'Approaching' : 'At';
      signals.push({ aligned, label: `${prefix} ${zLabel}${qualSuffix} — ${aligned ? 'zone aligned' : 'fighting zone'}`, weight: aligned ? 2 : 3 });
    }

    // Zone quality
    if (z.quality >= 7 && zoneState !== 'INSIDE_ZONE') {
      const aligned = (z.type === 'RESISTANCE' && tradeBias === 'BEARISH') ||
                      (z.type === 'SUPPORT'    && tradeBias === 'BULLISH') ||
                      zoneState === 'BREAK_RETEST' || zoneState === 'BROKEN';
      signals.push({ aligned, label: `High-quality zone (${z.quality}/10, ${z.tests ?? 0} tests)`, weight: 1 });
    }
  }

  // ── OI market activity ────────────────────────────────────────────────────
  if (oiData?.marketActivity?.activity && oiData.marketActivity.activity !== 'Initializing') {
    const ACT_BIAS = {
      'Long Buildup':   'BULLISH',
      'Short Covering': 'BULLISH',
      'Long Unwinding': 'BEARISH',
      'Short Buildup':  'BEARISH',
    };
    const actBias = ACT_BIAS[oiData.marketActivity.activity];
    if (actBias) {
      const aligned = actBias === tradeBias;
      signals.push({
        aligned,
        label: `${oiData.marketActivity.activity} — OI flow ${aligned ? 'aligned' : 'conflicting'}`,
        weight: 2,
      });
    }
  }

  // ── OI wall ───────────────────────────────────────────────────────────────
  if (oiData?.spotPrice && (oiData?.resistance || oiData?.support)) {
    const band = oiData.spotPrice * 0.0075; // 0.75% — matches oi.js wall proximity threshold
    const nearCE = Math.abs(oiData.spotPrice - oiData.resistance) <= band;
    const nearPE = oiData.support && Math.abs(oiData.spotPrice - oiData.support) <= band;
    if (nearCE) {
      const aligned = tradeBias === 'BEARISH';
      signals.push({ aligned, label: `OI resistance wall ₹${oiData.resistance} — ${aligned ? 'supply overhead' : 'blocking bulls'}`, weight: 2 });
    }
    if (nearPE) {
      const aligned = tradeBias === 'BULLISH';
      signals.push({ aligned, label: `OI support wall ₹${oiData.support} — ${aligned ? 'demand floor' : 'blocking bears'}`, weight: 2 });
    }
  }

  // ── EMA alignment (from structure checks, type = 'checkEMAAlignment') ────
  if (structureChecks?.length) {
    const ema = structureChecks.find(c => c.type === 'checkEMAAlignment');
    if (ema) {
      if (ema.passed) {
        signals.push({ aligned: true, label: ema.title, weight: 1 });
      } else {
        // Counter-EMA — note it, but treat as moderate signal not fatal
        signals.push({ aligned: false, label: `${ema.title} (counter-trend — moderate)`, weight: 1 });
      }
    }
  }

  return signals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score confidence from signals
// ─────────────────────────────────────────────────────────────────────────────
function scoreConfidence(signals, scenario) {
  if (scenario === 'UNCLEAR' || scenario === 'INSIDE_ZONE') return 'LOW';

  const forWeight     = signals.filter(s => s.aligned).reduce((s, x) => s + x.weight, 0);
  const againstWeight = signals.filter(s => !s.aligned).reduce((s, x) => s + x.weight, 0);

  if (forWeight >= 6 && againstWeight <= 1) return 'HIGH';
  if (forWeight >= 4 && againstWeight <= 2) return 'MEDIUM';
  if (forWeight >= 2 && againstWeight === 0) return 'MEDIUM';
  return 'LOW';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export function runScenarioAgent({ order, sentiment, stationOutput, oiData, structureChecks, marketRegime }) {
  const tradeBias    = getTradeBias(order?.instrumentType, order?.transactionType);
  const tradeIntent  = getTradeIntent(order?.instrumentType, order?.transactionType);
  const zoneState    = stationOutput?.zoneState   ?? null;
  const zone         = stationOutput?.nearestStation ?? null;
  const zoneType     = zone?.type   ?? null;
  const zoneDistance = zone?.distance ?? null;
  // stationLoaded: station agent has run and returned results (not just null/unrun)
  const stationLoaded = stationOutput != null;

  const scenario  = classifyScenario(tradeBias, zoneState, zoneType, zoneDistance, stationLoaded, order);
  const meta      = SCENARIO_META[scenario] ?? SCENARIO_META.UNCLEAR;
  const signals   = gatherSignals({ tradeBias, sentiment, zoneState, zone, oiData, structureChecks, marketRegime, order });
  const confidence = scoreConfidence(signals, scenario);

  const forSignals     = signals.filter(s => s.aligned);
  const againstSignals = signals.filter(s => !s.aligned);

  // Downgrade color when confidence is low — don't show misleading green/red
  const color = confidence === 'LOW' ? 'slate' : meta.color;

  // For COUNTER_TREND: build a specific summary naming the zone and conflict
  let summary = meta.summary;
  if (scenario === 'COUNTER_TREND') {
    const mktBias    = sentiment?.intradayBias ?? 'NEUTRAL';
    const mktAligned = mktBias !== 'NEUTRAL' && mktBias === tradeBias;
    const mktOpp     = mktBias !== 'NEUTRAL' && mktBias !== tradeBias;

    // Name the specific conflict (resistance vs support)
    const isBuyingAtResistance = tradeBias === 'BULLISH' && zoneType === 'RESISTANCE';
    const isSellingAtSupport   = tradeBias === 'BEARISH' && zoneType === 'SUPPORT';

    if (isBuyingAtResistance) {
      if (mktOpp)     summary = `Buying into resistance — both zone and market trend oppose this trade`;
      else if (mktAligned) summary = `Buying into resistance — zone says sell; market trend partially supports the move`;
      else            summary = `Buying into resistance — zone favours sellers; wait for a confirmed break above`;
    } else if (isSellingAtSupport) {
      if (mktOpp)     summary = `Selling into support — both zone and market trend oppose this trade`;
      else if (mktAligned) summary = `Selling into support — zone says buy; market trend partially supports the move`;
      else            summary = `Selling into support — zone favours buyers; wait for a confirmed break below`;
    } else if (zoneState === 'BREAK_RETEST' && zoneType === 'RESISTANCE' && tradeBias === 'BEARISH') {
      summary = `Selling into flipped support ₹${zone?.price?.toFixed(0) ?? '—'} — prior resistance broke up, zone now supports buyers`;
    } else if (zoneState === 'BREAK_RETEST' && zoneType === 'SUPPORT' && tradeBias === 'BULLISH') {
      summary = `Buying into flipped resistance ₹${zone?.price?.toFixed(0) ?? '—'} — prior support broke down, zone now resists buyers`;
    } else if (mktAligned) {
      summary = `Zone signal conflicts with your trade — market trend aligns`;
    } else if (mktOpp) {
      summary = `Both zone and market trend conflict with your trade`;
    } else {
      summary = `Trade direction conflicts with zone signal`;
    }
  }

  return {
    scenario,
    label:       meta.label,
    color,
    summary,
    tradeIntent,
    confidence,
    forSignals,
    againstSignals,
    totalSignals: signals.length,
  };
}
