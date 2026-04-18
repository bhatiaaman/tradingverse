// ─── Third Eye — Commentary Engine ───────────────────────────────────────────
// Converts engine state → stable, human-readable 4-part narrative.
//
// Structure per commentary:
//   headline  — one bold line, what is happening
//   context   — 1-2 lines, what indicators say (values interpolated)
//   watch     — forward-looking: key level to hold or break
//   risk      — explicit invalidation condition with price
//   options   — options overlay (optional, shown when triggered)
//
// Stability rules:
//   - Headline is locked to state. Only qualifier text updates within a state.
//   - Stale guard: after N candles with no state change, append "(N candles, no new catalyst)"
//   - Options overlay updates independently on its own 60s cadence.
// ─────────────────────────────────────────────────────────────────────────────

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmt(n, dec = 0) {
  if (n == null) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: dec });
}

function rsiLabel(rsi) {
  if (rsi == null) return '';
  if (rsi >= 70)  return `RSI ${rsi} (overbought)`;
  if (rsi <= 30)  return `RSI ${rsi} (oversold)`;
  if (rsi >= 60)  return `RSI ${rsi} (bullish)`;
  if (rsi <= 40)  return `RSI ${rsi} (bearish)`;
  return `RSI ${rsi}`;
}

function adxLabel(adx, rising) {
  if (adx == null) return '';
  const trend = adx >= 25 ? 'strong trend' : adx >= 20 ? 'trend forming' : 'no trend';
  const dir   = rising ? ', rising' : ', flat';
  return `ADX ${adx} (${trend}${dir})`;
}

function atrLabel(expanding) {
  return expanding ? 'volatility expanding' : 'volatility contracting';
}

function vwapLabel(close, vwap) {
  if (close == null || vwap == null) return '';
  const dist = Math.abs(close - vwap);
  const above = close > vwap;
  return `${above ? 'above' : 'below'} VWAP (${fmt(vwap)})`;
}

function sessionNote(phase) {
  return {
    opening:  '⚠ Opening range — elevated risk.',
    lull:     'Midday lull — lower conviction window.',
    close:    'Approaching session close — square-off risk.',
    closed:   'Market closed.',
    primary:  '',
    secondary: '',
  }[phase] ?? '';
}

// ── Qualifier suffix ──────────────────────────────────────────────────────────
function qualifierSuffix(qualifier) {
  return {
    strengthening: 'Momentum strengthening.',
    weakening:     'Momentum starting to fade.',
    stretched:     'Move is stretched — pullback risk.',
    holding:       '',
    neutral:       '',
  }[qualifier] ?? '';
}

// ── Bias alignment note ───────────────────────────────────────────────────────
function biasNote(biasAlignment, biasSummary, biasTf) {
  if (!biasSummary) return '';
  const map = { bullish: 'bullish', bearish: 'bearish', neutral: 'neutral' };
  const label = map[biasSummary.bias] ?? 'neutral';
  if (biasAlignment?.aligned)  return `${biasTf} bias: ${label} ✓`;
  if (biasAlignment?.counter)  return `${biasTf} bias: ${label} — counter-trend, lower conviction.`;
  return `${biasTf} bias: ${label}.`;
}

// ── Options overlay ───────────────────────────────────────────────────────────
function buildOptionsOverlay(optionsCtx) {
  if (!optionsCtx?.available) return null;
  const lines = [];
  if (optionsCtx.pcrInfo?.label) lines.push(`PCR ${optionsCtx.pcrInfo.label}`);
  if (optionsCtx.wallAlerts?.length) lines.push(...optionsCtx.wallAlerts);
  if (optionsCtx.maxPainNote)         lines.push(optionsCtx.maxPainNote);
  if (optionsCtx.activityLabel)       lines.push(optionsCtx.activityLabel);
  return lines.length ? lines : null;
}

// ── Stale guard ───────────────────────────────────────────────────────────────
function staleNote(candlesInState, staleGuardCandles) {
  if (candlesInState < staleGuardCandles) return '';
  return ` (${candlesInState} candles, no new catalyst)`;
}

// ── Template registry ─────────────────────────────────────────────────────────
// Each entry is a function receiving { features, biasAlignment, biasSummary, biasTf, optionsCtx, qualifier, candlesInState, config }
// and returning { headline, context, watch, risk }

const TEMPLATES = {

  NEUTRAL({ features, biasSummary, biasTf }) {
    return {
      headline: 'Waiting for direction',
      context:  `No clear intent. ${vwapLabel(features.close, features.vwap)}. ${adxLabel(features.adx, features.adxRising)}. ${biasNote(null, biasSummary, biasTf)}`,
      watch:    `Watch for a decisive close above ${fmt(features.swingHigh)} or below ${fmt(features.swingLow)}.`,
      risk:     'Stay patient — no setup in play.',
    };
  },

  RANGING({ features, biasSummary, biasTf }) {
    return {
      headline: 'No directional conviction — ranging',
      context:  `Both sides weak. ${adxLabel(features.adx, features.adxRising)}. VWAP (${fmt(features.vwap)}) acting as magnet. ${atrLabel(features.atrExpanding)}.`,
      watch:    `Wait for clean break and hold above ${fmt(features.swingHigh)} or below ${fmt(features.swingLow)}.`,
      risk:     'Momentum trades in a ranging market have low probability.',
    };
  },

  BUILDING_LONG({ features, qualifier, candlesInState, biasSummary, biasAlignment, biasTf, config }) {
    const q = qualifierSuffix(qualifier);
    return {
      headline: 'Buyers starting to build above VWAP',
      context:  `First signs of bullish intent. ${vwapLabel(features.close, features.vwap)}. ${rsiLabel(features.rsi)}. ${adxLabel(features.adx, features.adxRising)}. ${biasNote(biasAlignment, biasSummary, biasTf)} ${q}`,
      watch:    `Need follow-through close above ${fmt(features.swingHigh)} with ADX rising.`,
      risk:     `Invalidated on close below VWAP (${fmt(features.vwap)}).`,
    };
  },

  BUILDING_SHORT({ features, qualifier, candlesInState, biasSummary, biasAlignment, biasTf, config }) {
    const q = qualifierSuffix(qualifier);
    return {
      headline: 'Sellers starting to build below VWAP',
      context:  `First signs of bearish intent. ${vwapLabel(features.close, features.vwap)}. ${rsiLabel(features.rsi)}. ${adxLabel(features.adx, features.adxRising)}. ${biasNote(biasAlignment, biasSummary, biasTf)} ${q}`,
      watch:    `Need follow-through close below ${fmt(features.swingLow)} with ADX rising.`,
      risk:     `Invalidated on close above VWAP (${fmt(features.vwap)}).`,
    };
  },

  CONFIRMED_LONG({ features, qualifier, candlesInState, staleGuardCandles, biasSummary, biasAlignment, biasTf }) {
    const q    = qualifierSuffix(qualifier);
    const stale = staleNote(candlesInState, staleGuardCandles);
    return {
      headline: 'Bulls in control above VWAP',
      context:  `Follow-through buying confirmed${stale}. ${rsiLabel(features.rsi)}. ${adxLabel(features.adx, features.adxRising)}. ${atrLabel(features.atrExpanding)}. ${biasNote(biasAlignment, biasSummary, biasTf)} ${q}`,
      watch:    `Hold above VWAP (${fmt(features.vwap)}) and ${fmt(features.swingLow)}. Target: ${fmt(features.swingHigh)}.`,
      risk:     `Invalidated on close below VWAP (${fmt(features.vwap)}).`,
    };
  },

  CONFIRMED_SHORT({ features, qualifier, candlesInState, staleGuardCandles, biasSummary, biasAlignment, biasTf }) {
    const q    = qualifierSuffix(qualifier);
    const stale = staleNote(candlesInState, staleGuardCandles);
    return {
      headline: 'Bears in control below VWAP',
      context:  `Follow-through selling confirmed${stale}. ${rsiLabel(features.rsi)}. ${adxLabel(features.adx, features.adxRising)}. ${atrLabel(features.atrExpanding)}. ${biasNote(biasAlignment, biasSummary, biasTf)} ${q}`,
      watch:    `Stay below VWAP (${fmt(features.vwap)}) and ${fmt(features.swingHigh)}. Target: ${fmt(features.swingLow)}.`,
      risk:     `Invalidated on close above VWAP (${fmt(features.vwap)}).`,
    };
  },

  CONTINUING_LONG({ features, qualifier, candlesInState, staleGuardCandles, biasSummary, biasAlignment, biasTf }) {
    const q    = qualifierSuffix(qualifier);
    const stale = staleNote(candlesInState, staleGuardCandles);
    return {
      headline: 'Sustained bullish move — trend active',
      context:  `Long side sustained${stale}. ${rsiLabel(features.rsi)}. ${adxLabel(features.adx, features.adxRising)}. ${atrLabel(features.atrExpanding)}. ${biasNote(biasAlignment, biasSummary, biasTf)} ${q}`,
      watch:    `Dips toward VWAP (${fmt(features.vwap)}) likely to get bought. Next target: ${fmt(features.swingHigh)}.`,
      risk:     `Trend weakens on close below ${fmt(features.swingLow)}.`,
    };
  },

  CONTINUING_SHORT({ features, qualifier, candlesInState, staleGuardCandles, biasSummary, biasAlignment, biasTf }) {
    const q    = qualifierSuffix(qualifier);
    const stale = staleNote(candlesInState, staleGuardCandles);
    return {
      headline: 'Sustained bearish move — trend active',
      context:  `Short side sustained${stale}. ${rsiLabel(features.rsi)}. ${adxLabel(features.adx, features.adxRising)}. ${atrLabel(features.atrExpanding)}. ${biasNote(biasAlignment, biasSummary, biasTf)} ${q}`,
      watch:    `Bounces toward VWAP (${fmt(features.vwap)}) likely to get sold. Next target: ${fmt(features.swingLow)}.`,
      risk:     `Trend weakens on close above ${fmt(features.swingHigh)}.`,
    };
  },

  PULLBACK_LONG({ features, qualifier, candlesInState, biasSummary, biasAlignment, biasTf, config }) {
    const retPct = Math.round(features.pullbackFromHigh * 100);
    return {
      headline: 'Healthy pullback in progress — long trend intact',
      context:  `Retracing ${retPct}% of the move. ${vwapLabel(features.close, features.vwap)}. Structure intact. ${rsiLabel(features.rsi)}. ${biasNote(biasAlignment, biasSummary, biasTf)}`,
      watch:    `Watch for absorption near ${fmt(features.swingLow)} / VWAP (${fmt(features.vwap)}). Resumption above ${fmt(features.swingHigh)} confirms continuation.`,
      risk:     `Pullback deepens if close below ${fmt(features.vwap)} with momentum.`,
    };
  },

  PULLBACK_SHORT({ features, qualifier, candlesInState, biasSummary, biasAlignment, biasTf, config }) {
    const retPct = Math.round(features.pullbackFromLow * 100);
    return {
      headline: 'Healthy bounce in progress — short trend intact',
      context:  `Retracing ${retPct}% of the down move. ${vwapLabel(features.close, features.vwap)}. Structure intact. ${rsiLabel(features.rsi)}. ${biasNote(biasAlignment, biasSummary, biasTf)}`,
      watch:    `Watch for rejection near ${fmt(features.swingHigh)} / VWAP (${fmt(features.vwap)}). Resumption below ${fmt(features.swingLow)} confirms continuation.`,
      risk:     `Bounce extends if close above ${fmt(features.vwap)} with momentum.`,
    };
  },

  DEEP_PULLBACK_LONG({ features, biasSummary, biasAlignment, biasTf }) {
    return {
      headline: 'Pullback deepening — long thesis under pressure',
      context:  `Retraced more than 50% of the move. ${vwapLabel(features.close, features.vwap)}. ${rsiLabel(features.rsi)}. Long case at risk of failure.`,
      watch:    `Need reclaim of VWAP (${fmt(features.vwap)}) and ${fmt(features.swingLow)} to restart.`,
      risk:     `Setup invalidated on close below ${fmt(features.swingLow)}.`,
    };
  },

  DEEP_PULLBACK_SHORT({ features, biasSummary, biasAlignment, biasTf }) {
    return {
      headline: 'Bounce deepening — short thesis under pressure',
      context:  `Retraced more than 50% of the down move. ${vwapLabel(features.close, features.vwap)}. ${rsiLabel(features.rsi)}. Short case at risk.`,
      watch:    `Need break back below VWAP (${fmt(features.vwap)}) and ${fmt(features.swingHigh)} to restart.`,
      risk:     `Setup invalidated on close above ${fmt(features.swingHigh)}.`,
    };
  },

  EXHAUSTED_LONG({ features, biasSummary, biasAlignment, biasTf }) {
    return {
      headline: 'Bullish move exhausting',
      context:  `Buying pressure fading. ${rsiLabel(features.rsi)}. ${adxLabel(features.adx, features.adxRising)}. Move getting stretched. ${biasNote(biasAlignment, biasSummary, biasTf)}`,
      watch:    `Watch VWAP (${fmt(features.vwap)}) for support. Any strong bearish candle raises exit flag.`,
      risk:     `Exit longs on decisive close below VWAP (${fmt(features.vwap)}).`,
    };
  },

  EXHAUSTED_SHORT({ features, biasSummary, biasAlignment, biasTf }) {
    return {
      headline: 'Bearish move exhausting',
      context:  `Selling pressure fading. ${rsiLabel(features.rsi)}. ${adxLabel(features.adx, features.adxRising)}. Move getting stretched. ${biasNote(biasAlignment, biasSummary, biasTf)}`,
      watch:    `Watch VWAP (${fmt(features.vwap)}) for resistance. Any strong bullish candle raises exit flag.`,
      risk:     `Exit shorts on decisive close above VWAP (${fmt(features.vwap)}).`,
    };
  },

  INVALIDATED({ features, biasSummary, biasAlignment, biasTf }) {
    return {
      headline: 'Setup invalidated — opposing move taking over',
      context:  `Strong counter-candle. ${vwapLabel(features.close, features.vwap)}. ${rsiLabel(features.rsi)}. Prior setup is off.`,
      watch:    `Wait for market to stabilise before looking for new setup.`,
      risk:     'No active setup. Avoid forcing trades.',
    };
  },

  TRAPPED_LONG({ features }) {
    return {
      headline: 'Breakout above VWAP failed — potential bull trap',
      context:  `Price pushed above VWAP but reversed sharply. ${vwapLabel(features.close, features.vwap)}. Early longs likely offside.`,
      watch:    `Watch for further selling pressure below ${fmt(features.swingLow)}.`,
      risk:     'Trap confirmed. Longs at risk until reclaim of VWAP with follow-through.',
    };
  },

  TRAPPED_SHORT({ features }) {
    return {
      headline: 'Breakdown below VWAP failed — potential bear trap',
      context:  `Price broke below VWAP but reversed sharply. ${vwapLabel(features.close, features.vwap)}. Early shorts likely offside.`,
      watch:    `Watch for further buying pressure above ${fmt(features.swingHigh)}.`,
      risk:     'Trap confirmed. Shorts at risk until break back below VWAP with follow-through.',
    };
  },
};

// ── Main export ───────────────────────────────────────────────────────────────
export function buildCommentary(engineResult, biasTf = '15m') {
  const {
    state, qualifier, candlesInState, features,
    biasAlignment, biasSummary, optionsCtx,
  } = engineResult;

  const config           = engineResult.config ?? {};
  const staleGuardCandles = config.staleGuardCandles ?? 8;

  const templateFn = TEMPLATES[state] ?? TEMPLATES['NEUTRAL'];

  const { headline, context, watch, risk } = templateFn({
    features,
    qualifier,
    candlesInState,
    staleGuardCandles,
    biasAlignment,
    biasSummary,
    biasTf,
    config,
    optionsCtx,
  });

  // Session note appended to context if relevant
  const sNote = sessionNote(features.sessionPhase);
  const fullContext = [context.trim(), sNote].filter(Boolean).join(' ');

  // Options overlay
  const optLines = buildOptionsOverlay(optionsCtx);

  return {
    headline:      headline.trim(),
    context:       fullContext.trim(),
    watch:         watch.trim(),
    risk:          risk.trim(),
    optionsLines:  optLines,
    qualifier,
    candlesInState,
    sessionPhase:  features.sessionPhase,
    timestamp:     new Date().toISOString(),
  };
}
