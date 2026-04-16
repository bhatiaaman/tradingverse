// ── Third Eye Narrative Generator ─────────────────────────────────────────────
// Pure function — takes a scan entry + bias state, returns a narrative object.
// No React, no Redis, no side effects. Server-safe and testable.
//
// Speaks as an experienced intraday trader watching the screen:
//   - Position-aware (knows if we're in a trade direction)
//   - Bias-coherent (narrative always matches current bias state)
//   - Action-oriented: GO / HOLD / WATCH / WARNING / EXIT / WAIT
//
// Returns: { type, action, headline, reason, biasNote? }

// ─────────────────────────────────────────────────────────────────────────────
// Action type → display label mapping
// ─────────────────────────────────────────────────────────────────────────────

// Setup ID → human-readable short name for narrative
const SETUP_SHORT = {
  's1_ob_retest':            'OB Retest',
  's3_orb_bull':             'ORB Breakout',
  's3_orb_bear':             'ORB Breakdown',
  's4_pc_pullback_bull':     'PC Pullback',
  's4_pc_pullback_bear':     'PC Pullback',
  's5_ema_bounce_bull':      'EMA Bounce',
  's5_ema_bounce_bear':      'EMA Bounce',
  's6_engulf_bull':          'Bull Engulf',
  's6_engulf_bear':          'Bear Engulf',
  's8_hl':                   'Higher Low',
  's8_lh':                   'Lower High',
  's9_sr_flip':              'S/R Flip',
  's10_double_bottom':       'Double Bottom',
  's10_double_top':          'Double Top',
  's11_ib_bull':             'IB Breakout',
  's11_ib_bear':             'IB Breakdown',
  's12_confluence_bull':     'Confluence',
  's12_confluence_bear':     'Confluence',
  's13_choch_bull':          'CHoCH Bull',
  's13_choch_bear':          'CHoCH Bear',
  's14_fvg_bull':            'FVG Fill',
  's14_fvg_bear':            'FVG Fill',
  's15_ote_bull':            'OTE Zone',
  's15_ote_bear':            'OTE Zone',
  's16_spring':              'Wyckoff Spring',
  's16_upthrust':            'Wyckoff Upthrust',
  's17_confluence_bull':     'Stack (3 factors)',
  's17_confluence_bear':     'Stack (3 factors)',
  's18_bb_bull':             'BB Breakout',
  's18_bb_bear':             'BB Breakdown',
  's19_flag_bull':           'Flag Breakout',
  's19_flag_bear':           'Flag Breakdown',
  's20_ema_cross_bull':      'EMA Cross',
  's20_ema_cross_bear':      'EMA Cross',
  's21_vwap_reclaim_bull':   'VWAP Reclaim',
  's21_vwap_reclaim_bear':   'VWAP Rejection',
};

// ─────────────────────────────────────────────────────────────────────────────
// Context helpers
// ─────────────────────────────────────────────────────────────────────────────

function vwapNote(context) {
  const v = context?.vwap;
  if (!v) return '';
  if (v.atVwap) return ' at VWAP';
  if (v.distPct <= 0.25) return ` near VWAP (${v.distPct.toFixed(1)}% away)`;
  return v.above ? ` — above VWAP` : ` — below VWAP`;
}

function trendNote(context) {
  if (context?.trend === 'uptrend')   return 'Trend structure is cleanly BULLISH';
  if (context?.trend === 'downtrend') return 'Trend structure is cleanly BEARISH';
  return 'Market is currently consolidatng';
}

function setupName(s) {
  if (!s) return 'no setup';
  return SETUP_SHORT[s.pattern?.id] ?? s.pattern?.name ?? 'setup';
}

// ─────────────────────────────────────────────────────────────────────────────
// buildNarrative
//
// Inputs:
//   entry      : { time, topSetup, context, candle, rawPatterns }
//   biasState  : current bias after applyBiasTransition() for this candle
//                { bias, prevBias, changed, reason, pendingFlip }
//   quietCount : how many consecutive candles had no new setup (for consolidation narrative)
// ─────────────────────────────────────────────────────────────────────────────

export function buildNarrative(entry, biasState, quietCount = 0) {
  const { topSetup: s, context: c, candle } = entry;
  const { bias, prevBias, changed, reason, pendingFlip, addsToday = 0 } = biasState;

  const inLong  = bias === 'BULL';
  const inShort = bias === 'BEAR';
  const isFlat  = bias === 'NEUTRAL';

  // ── Session gates ──────────────────────────────────────────────────────────
  if (c?.sessionTime === 'opening') {
    return {
      type: 'wait', action: 'WAIT',
      headline: 'First candle forming — standing aside',
      reason: `Don't act on candle 1. ${inLong ? 'Long bias from prior session.' : inShort ? 'Short bias from prior session.' : 'No position.'} Let it close cleanly.`,
    };
  }
  if (c?.sessionTime === 'closing') {
    return {
      type: 'caution', action: 'WRAP UP',
      headline: 'Last 30 min — start wrapping up',
      reason: inLong || inShort
        ? 'Trail stop tight or close out. No new entries this late in the session.'
        : 'Stay flat. No new positions in the last half hour.',
    };
  }

  // ── Bias just changed THIS candle ─────────────────────────────────────────
  if (changed && prevBias !== bias) {
    // NEUTRAL → BULL
    if (bias === 'BULL' && prevBias === 'NEUTRAL') {
      return {
        type: 'entry', direction: 'bull', action: 'GO LONG',
        headline: `Bias turned BULL — ${setupName(s)}`,
        reason: reason || `${setupName(s)}. Structure + momentum aligned bullish. Looking for entry on next dip.`,
        sl: s?.pattern?.sl ?? null,
      };
    }
    // NEUTRAL → BEAR
    if (bias === 'BEAR' && prevBias === 'NEUTRAL') {
      return {
        type: 'entry', direction: 'bear', action: 'GO SHORT',
        headline: `Bias turned BEAR — ${setupName(s)}`,
        reason: reason || `${setupName(s)}. Structure + momentum aligned bearish. Looking for entry on next bounce.`,
        sl: s?.pattern?.sl ?? null,
      };
    }
    // BULL → NEUTRAL (reality check or BOS)
    if (bias === 'NEUTRAL' && prevBias === 'BULL') {
      const isPanic = reason?.includes('Hard Invalidation');
      return {
        type: 'exit', direction: 'bear', action: isPanic ? 'INVALIDATED' : 'EXIT LONG',
        headline: isPanic ? 'Panic price action — clearing long bias' : (pendingFlip === 'BEAR' ? 'Bull bias cleared — bearish signal building' : 'Bull bias cleared — standing aside'),
        reason: reason || 'Lost bullish structure. Closing long bias. Waiting for next clean setup.',
      };
    }
    // BEAR → NEUTRAL
    if (bias === 'NEUTRAL' && prevBias === 'BEAR') {
      const isPanic = reason?.includes('Hard Invalidation');
      return {
        type: 'exit', direction: 'bull', action: isPanic ? 'INVALIDATED' : 'EXIT SHORT',
        headline: isPanic ? 'Panic price action — clearing short bias' : (pendingFlip === 'BULL' ? 'Bear bias cleared — bullish signal building' : 'Bear bias cleared — standing aside'),
        reason: reason || 'Lost bearish structure. Covering short bias. Waiting for next clean setup.',
      };
    }
  }

  // ── Pending flip — one good setup fired, waiting for second confirmation ──
  if (pendingFlip === 'BULL' && isFlat) {
    return {
      type: 'watch', direction: 'bull', action: 'POTENTIAL LONG',
      headline: `Bull signal fired — waiting on confirmation`,
      reason: `${setupName(s)} fired. Not confirmed yet. Next candle needs to close bullish with structure. Stay flat until confirmed.`,
    };
  }
  if (pendingFlip === 'BEAR' && isFlat) {
    return {
      type: 'watch', direction: 'bear', action: 'POTENTIAL SHORT',
      headline: `Bear signal fired — waiting on confirmation`,
      reason: `${setupName(s)} fired. Not confirmed yet. Next candle needs to close bearish with structure. Stay flat.`,
    };
  }

  // ── Active bias, strong setup this candle ─────────────────────────────────
  if (s && s.score >= 6) {
    const dir = s.pattern?.direction;

    // Setup aligns with bias → GO / ADD signal
    if ((inLong && dir === 'bull') || (inShort && dir === 'bear')) {
      const isAdd = addsToday > 0;
      const canAdd = addsToday < 3;
      
      return {
        type: 'go', direction: dir, 
        action: isAdd 
          ? (canAdd ? (inLong ? 'ADD LONG' : 'ADD SHORT') : (inLong ? 'HOLD LONG' : 'HOLD SHORT'))
          : (inLong ? 'GO LONG' : 'GO SHORT'),
        headline: isAdd 
          ? (canAdd ? `${setupName(s)} — adding to conviction` : 'Max pyramiding reached — holding current size')
          : `Fresh Bias established — ${setupName(s)}`,
        reason: isAdd
          ? (canAdd ? `${setupName(s)} confirmed. Adding unit ${addsToday + 1}/3. Trend is maturing beautifully.` : `Scale-in limit (3) reached. Letting the profits run.`)
          : `${setupName(s)} at${vwapNote(c)}. ${trendNote(c)}. Bias is ${bias}. High alignment for initial entry.`,
        sl: s.pattern?.sl ?? null, score: s.score,
        isAdd: isAdd && canAdd
      };
    }

    // Setup fires against bias → WARNING / CAUTION
    if ((inLong && dir === 'bear') || (inShort && dir === 'bull')) {
      return {
        type: 'warning', action: 'TIGHTEN SL',
        headline: `Counter-signal: ${setupName(s)} building`,
        reason: `${dir === 'bear' ? 'Bearish' : 'Bullish'} pattern detected (score ${s.score}) against established ${bias} bias. Expert view: Stay alert. Tighten trail stop to last swing ${inLong ? 'low' : 'high'}.`,
      };
    }
  }

  // ── Active bias, moderate setup ───────────────────────────────────────────
  if (s && s.score >= 4) {
    const dir = s.pattern?.direction;
    if ((inLong && dir === 'bull') || (inShort && dir === 'bear')) {
      return {
        type: 'continue', direction: dir, action: inLong ? 'HOLD LONG' : 'HOLD SHORT',
        headline: `${setupName(s)} — bias intact, watching`,
        reason: `${setupName(s)} forming${vwapNote(c)}. Not a full GO signal yet. Stay in position, trail stop.`,
      };
    }
  }

  // ── Active bias, no setup — quiet candle ──────────────────────────────────
  if (inLong || inShort) {
    const dir = inLong ? 'bull' : 'bear';
    const side = inLong ? 'Bulls' : 'Bears';
    if (quietCount >= 3) {
      return {
        type: 'hold', direction: dir, action: inLong ? 'HOLD LONG' : 'HOLD SHORT',
        headline: `${side} in control — taking a breather`,
        reason: `Price is consolidating after the move. ${trendNote(c)}${vwapNote(c)}. Range is tight. No need to worry — trend is intact. Waiting for the next expansion.`,
      };
    }
    return {
      type: 'hold', direction: dir, action: inLong ? 'HOLD LONG' : 'HOLD SHORT',
      headline: `Holding — ${side.toLowerCase()} consensus intact`,
      reason: `Consolidating above support. No fresh entry trigger yet. An expert trader stays patient here. Trend conviction remains ${bias}.`,
    };
  }

  // ── Neutral, no signal — just observing ───────────────────────────────────
  const volumeNote = c?.volume?.context === 'dryup' ? ' Volume drying up — expect a move soon.' : '';
  const vwapCtx    = c?.vwap?.atVwap ? 'Consolidating at VWAP.' : (c?.vwap?.above ? 'Holding above VWAP.' : 'Struggling below VWAP.');
  const trendCtx   = trendNote(c);

  return {
    type: 'observe', action: 'OBSERVE',
    headline: `${vwapCtx} Waiting for expansion.`,
    reason: `${trendCtx}${volumeNote} Price action is neutral. No high-conviction setup detected yet. Watching for structure break.`,
  };
}
