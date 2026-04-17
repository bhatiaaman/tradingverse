// ═══════════════════════════════════════════════════════════════════════
// MARKET ACTIVITY DETECTOR - OI + Price Analysis (FIXED)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detect market activity based on OI change and price movement
 * @param {Object} current - Current data { totalCallOI, totalPutOI, spot }
 * @param {Object} previous - Previous data { totalCallOI, totalPutOI, spot }
 * @returns {Object} - { activity, strength, description, actionable }
 */
/**
 * Detect market activity based on OI change and price movement
 * Incorporates CE/PE divergence and optional Futures OI trend.
 * @param {Object} current - Current data { totalCallOI, totalPutOI, spot }
 * @param {Object} previous - Previous data { totalCallOI, totalPutOI, spot }
 * @param {Boolean} sinceOpen - Is this comparison against session-open baseline?
 * @param {Number} futOIChangePct - Change in Futures OI (optional)
 * @returns {Object} - { activity, strength, description, actionable, emoji }
 */
export function detectMarketActivity(current, previous, sinceOpen = false, futOIChangePct = 0) {
  if (!previous || !current) {
    return { activity: 'Unknown', strength: 0, description: 'Insufficient data', actionable: '', emoji: '⏳' };
  }
  const ctx = sinceOpen ? 'since open' : 'recent';

  // 1. Core Deltas
  const callOIChangePct = previous.totalCallOI > 0 ? ((current.totalCallOI - previous.totalCallOI) / previous.totalCallOI) * 100 : 0;
  const putOIChangePct  = previous.totalPutOI > 0  ? ((current.totalPutOI - previous.totalPutOI) / previous.totalPutOI) * 100 : 0;
  const totalOIChangePct = (previous.totalCallOI + previous.totalPutOI) > 0 
    ? ((current.totalCallOI + current.totalPutOI - (previous.totalCallOI + previous.totalPutOI)) / (previous.totalCallOI + previous.totalPutOI)) * 100 
    : 0;
  const priceChangePct  = previous.spot > 0 ? ((current.spot - previous.spot) / previous.spot) * 100 : 0;

  // 2. Thresholds (Lowered for better sensitivity)
  const isTrendingPrice = Math.abs(priceChangePct) >= 0.1; // 0.1% move is enough to confirm direction
  const isTrendingOI    = Math.abs(totalOIChangePct) >= 1 || Math.abs(callOIChangePct) >= 1.5 || Math.abs(putOIChangePct) >= 1.5;
  const isFutSignal     = Math.abs(futOIChangePct) >= 1;

  // 3. Directional Classification (Divergence Logic)
  let activity = 'Neutral';
  let strength = 0;
  let description = '';
  let actionable = '';
  let emoji = '➡️';

  // Bearish Components
  const isCallBuildup   = priceChangePct < 0 && callOIChangePct > 0.8;    // Price down, Calls added
  const isPutUnwinding  = priceChangePct < 0 && putOIChangePct < -0.8;   // Price down, Puts exiting
  const isFutShorting   = priceChangePct < 0 && futOIChangePct > 0.8;    // Price down, Futures added

  // Bullish Components
  const isPutBuildup    = priceChangePct > 0 && putOIChangePct > 0.8;     // Price up, Puts added
  const isCallUnwinding = priceChangePct > 0 && callOIChangePct < -0.8;  // Price up, Calls exiting
  const isFutLonging    = priceChangePct > 0 && futOIChangePct > 0.8;    // Price up, Futures added

  // Fallback for Consolidation
  if (!isTrendingPrice && !isTrendingOI && !isFutSignal) {
    return {
      activity: 'Consolidation',
      strength: 2,
      description: sinceOpen ? 'Market ranging since open — no significant OI or price movement' : 'Low OI & price movement — sideways range',
      actionable: 'Wait for breakout confirmation',
      emoji: '😴',
    };
  }

  // 4. Activity Synthesizer
  if (isCallBuildup || isPutUnwinding || isFutShorting) {
    const buildup = isCallBuildup && isPutUnwinding ? 'Short Buildup & Long Unwinding' : isCallBuildup ? 'Short Buildup' : 'Long Unwinding';
    activity    = buildup;
    strength    = Math.min(10, Math.round((Math.abs(priceChangePct) * 10) + Math.abs(totalOIChangePct) * 2));
    if (isFutShorting) strength += 2; // Futures confirmation bonus
    emoji       = '📉';
    description = `${activity} ${ctx} — Call OI ${callOIChangePct > 0 ? '+' : ''}${callOIChangePct.toFixed(1)}%, Put OI ${putOIChangePct.toFixed(1)}%, price ${priceChangePct.toFixed(2)}%`;
    actionable  = strength > 7 ? 'Strong bearish move — avoid aggressive longs' : 'Bears dominant — watch for continuation on support break';
  } 
  else if (isPutBuildup || isCallUnwinding || isFutLonging) {
    const buildup = isPutBuildup && isCallUnwinding ? 'Long Buildup & Short Covering' : isPutBuildup ? 'Long Buildup' : 'Short Covering';
    activity    = buildup;
    strength    = Math.min(10, Math.round((priceChangePct * 10) + Math.abs(totalOIChangePct) * 2));
    if (isFutLonging) strength += 2; // Futures confirmation bonus
    emoji       = '🚀';
    description = `${activity} ${ctx} — Put OI ${putOIChangePct > 0 ? '+' : ''}${putOIChangePct.toFixed(1)}%, Call OI ${callOIChangePct.toFixed(1)}%, price +${priceChangePct.toFixed(2)}%`;
    actionable  = strength > 7 ? 'Strong bullish momentum — stay with the trend' : 'Bulls in control — supports likely to hold on dips';
  }
  else if (isTrendingPrice) {
    // Price moving but OI hasn't caught up or is conflicting
    const dir   = priceChangePct > 0 ? 'Up' : 'Down';
    activity    = `Price ${dir} Drift`;
    strength    = 3;
    emoji       = priceChangePct > 0 ? '📈' : '📉';
    description = `Price moving ${dir} (${priceChangePct.toFixed(2)}%) but OI ${ctx} remains neutral or conflicting.`;
    actionable  = 'Weak conviction move — wait for OI confirmation before large bets';
  } else {
    activity    = 'Range Formation';
    strength    = 3;
    emoji       = '↔️';
    description = `OI shifting while price remains stalled. Call OI ${callOIChangePct.toFixed(1)}%, Put OI ${putOIChangePct.toFixed(1)}%`;
    actionable  = 'Option writers active — price needs to move to reveal actual trend';
  }

  return { activity, strength: Math.min(10, strength), description, actionable, emoji };
}

/**
 * Synthesized actionable insights — reconciles OI activity, PCR, Max Pain, and S/R
 * instead of firing independent signals that can contradict each other.
 *
 * @param {Object} optionChain - { support, resistance, maxPain, pcr, strikeGap }
 * @param {Number} spot
 * @param {Object} marketActivity - output of detectMarketActivity()
 * @returns {Array} max 3 insights, each { type, emoji, message }
 */
export function generateActionableInsights(optionChain, spot, marketActivity = null) {
  const insights = [];
  if (!optionChain || !spot) return insights;

  const { support, resistance, maxPain, pcr, strikeGap = 50 } = optionChain;
  const activity    = marketActivity?.activity || '';
  const actStrength = marketActivity?.strength || 0;
  const isBullish   = ['Long Buildup', 'Short Covering'].includes(activity);
  const isBearish   = ['Short Buildup', 'Long Unwinding'].includes(activity);
  const isActive    = isBullish || isBearish;
  const pcrBullish  = pcr > 1.2;
  const pcrBearish  = pcr !== null && pcr < 0.8;

  const supportDist = support   ? Math.abs(((spot - support)   / spot) * 100) : null;
  const resistDist  = resistance ? Math.abs(((resistance - spot) / spot) * 100) : null;
  const maxPainDiff = maxPain   ? (spot - maxPain) / maxPain * 100 : null;
  const range       = (support && resistance) ? resistance - support : null;
  const rangePos    = range ? ((spot - support) / range) * 100 : 50;
  const mpNearSup   = maxPain && support   && Math.abs(maxPain - support)   <= strikeGap;
  const mpNearRes   = maxPain && resistance && Math.abs(maxPain - resistance) <= strikeGap;

  // ── Insight 1: Market Posture — reconcile OI activity + PCR ────────────────
  if (isActive) {
    let msg = '';
    if (isBullish && pcrBearish) {
      // Bullish OI activity but PCR shows call-heavy positioning — warn but don't negate
      const frothy = pcr < 0.7 ? 'PCR very call-heavy — keep stops tight' : `PCR ${pcr.toFixed(2)} slightly call-heavy — trail stops`;
      msg = `${activity} in progress (${marketActivity?.description?.split('—')[1]?.trim() || ''}). ${frothy}. Longs valid but don't chase extended moves.`;
    } else if (isBearish && pcrBullish) {
      msg = `${activity} but PCR ${pcr.toFixed(2)} shows put writers defending. Bearish momentum exists — shorts on bounces, not into put walls.`;
    } else if (isBullish) {
      const conf = actStrength >= 7 ? 'Strong' : 'Moderate';
      const pcrNote = pcrBullish ? `PCR ${pcr.toFixed(2)} confirms` : `PCR ${pcr.toFixed(2)} neutral`;
      msg = `${conf} ${activity}. ${pcrNote}. ${actStrength >= 7 ? 'Ride with trailing SL.' : `Watch for hold above ${support} for continuation.`}`;
    } else {
      const conf = actStrength >= 7 ? 'Strong' : 'Moderate';
      const pcrNote = pcrBearish ? `PCR ${pcr.toFixed(2)} confirms` : `PCR ${pcr.toFixed(2)} neutral`;
      msg = `${conf} ${activity}. ${pcrNote}. ${actStrength >= 7 ? 'Shorts with trailing SL.' : `Watch for break below ${support}.`}`;
    }
    if (msg) insights.push({ type: 'posture', emoji: isBullish ? '🚀' : '📉', message: msg });
  } else if (pcr !== null) {
    // No strong OI signal — lead with PCR
    const msg = pcrBullish
      ? `PCR ${pcr.toFixed(2)} — Put writers active, bullish tilt. Dips near ${support} are buying opportunities.`
      : pcrBearish
      ? `PCR ${pcr.toFixed(2)} — Call writers dominant. Book partial profits on rallies toward ${resistance}.`
      : `PCR ${pcr.toFixed(2)} — Balanced positioning. Trade the range ${support}–${resistance}, no directional edge.`;
    insights.push({ type: 'posture', emoji: pcrBullish ? '🐂' : pcrBearish ? '🐻' : '⚖️', message: msg });
  }

  // ── Insight 2: Key level in play — consolidate Max Pain + S/R ──────────────
  const nearSup = supportDist !== null && supportDist < 0.5;
  const nearRes = resistDist  !== null && resistDist  < 0.5;

  if (nearSup) {
    if (mpNearSup) {
      insights.push({ type: 'level', emoji: '🧲',
        message: `${support} is both peak Put OI wall (S1) and Max Pain pin — strong floor but expect chop here, not a clean V-bounce. ${isBullish ? `Longs above ${support}, SL below ${support - strikeGap}.` : 'Wait for confirmed hold before entering.'}` });
    } else {
      insights.push({ type: 'level', emoji: '🛡️',
        message: `Spot at S1 ${support} Put OI wall. ${isBullish ? `Aligned with ${activity} — good risk/reward for longs, SL below ${support - strikeGap}.` : `Watch for hold vs break. Close below ${support - strikeGap} turns structure bearish.`}` });
    }
  } else if (nearRes) {
    if (mpNearRes) {
      insights.push({ type: 'level', emoji: '🚧',
        message: `${resistance} is R1 Call OI wall and Max Pain — double ceiling. ${isBullish ? `Breakout above ${resistance} needs volume; reject here → pullback to ${support}.` : `Bears in control at this zone — resistance holding.`}` });
    } else {
      const breakoutTarget = resistance + strikeGap * 2;
      insights.push({ type: 'level', emoji: '🚧',
        message: `Spot at R1 ${resistance} Call OI wall. ${isBullish ? `Breakout → target ${breakoutTarget}. Rejection → pullback to ${support}.` : `Tough ceiling — shorts below ${resistance}, SL above ${resistance + strikeGap}.`}` });
    }
  } else if (maxPainDiff !== null) {
    const absDiff = Math.abs(maxPainDiff);
    if (absDiff < 0.5) {
      insights.push({ type: 'level', emoji: '🧲',
        message: `Spot pinned near Max Pain ${maxPain} — range-bound action between ${support}–${resistance} expected. Avoid chasing breakouts without volume.` });
    } else if (maxPainDiff > 0.5) {
      insights.push({ type: 'level', emoji: '⬇️',
        message: `Spot ${absDiff.toFixed(1)}% above Max Pain ${maxPain}. Gravity pull toward ${maxPain}–${support} likely as expiry nears. Call writers will cap rallies.` });
    } else {
      insights.push({ type: 'level', emoji: '⬆️',
        message: `Spot ${absDiff.toFixed(1)}% below Max Pain ${maxPain}. Put writers have incentive to defend ${support}. Upward drift toward ${maxPain} likely.` });
    }
  }

  // ── Insight 3: Trade setup — only when near an actionable extreme ───────────
  if (range && range > 0) {
    if (rangePos < 30 && isBullish) {
      const sl = support - strikeGap;
      const reward = resistance - spot;
      const risk   = spot - sl;
      const rr     = risk > 0 ? (reward / risk).toFixed(1) : '—';
      insights.push({ type: 'setup', emoji: '🎯',
        message: `Setup: Long above ${spot.toFixed(0)} → target ${resistance} (+${reward.toFixed(0)} pts). SL below ${sl}. R:R ≈ 1:${rr}.` });
    } else if (rangePos > 70 && isBearish) {
      const sl = resistance + strikeGap;
      const reward = spot - support;
      const risk   = sl - spot;
      const rr     = risk > 0 ? (reward / risk).toFixed(1) : '—';
      insights.push({ type: 'setup', emoji: '🎯',
        message: `Setup: Short below ${spot.toFixed(0)} → target ${support} (−${reward.toFixed(0)} pts). SL above ${sl}. R:R ≈ 1:${rr}.` });
    } else if (rangePos >= 30 && rangePos <= 70 && !nearSup && !nearRes) {
      insights.push({ type: 'setup', emoji: '↔️',
        message: `Spot mid-range (${support}–${resistance}, ${range} pts). No edge here — wait for a move toward ${support} to go long or ${resistance} to go short.` });
    }
  }

  return insights.slice(0, 3);
}