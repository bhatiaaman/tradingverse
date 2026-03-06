// ═══════════════════════════════════════════════════════════════════════
// MARKET ACTIVITY DETECTOR - OI + Price Analysis (FIXED)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detect market activity based on OI change and price movement
 * @param {Object} current - Current data { totalCallOI, totalPutOI, spot }
 * @param {Object} previous - Previous data { totalCallOI, totalPutOI, spot }
 * @returns {Object} - { activity, strength, description, actionable }
 */
export function detectMarketActivity(current, previous, sinceOpen = false) {
  if (!previous || !current) {
    return { activity: 'Unknown', strength: 0, description: 'Insufficient data', actionable: '', emoji: '⏳' };
  }
  const ctx = sinceOpen ? 'since open' : 'recent';

  // Calculate changes
  const callOIChange = current.totalCallOI - previous.totalCallOI;
  const putOIChange = current.totalPutOI - previous.totalPutOI;
  const totalOIChange = callOIChange + putOIChange;
  const priceChange = current.spot - previous.spot;

  const callOIChangePct = previous.totalCallOI > 0 ? (callOIChange / previous.totalCallOI) * 100 : 0;
  const putOIChangePct = previous.totalPutOI > 0 ? (putOIChange / previous.totalPutOI) * 100 : 0;
  const totalOIChangePct = (previous.totalCallOI + previous.totalPutOI) > 0 
    ? (totalOIChange / (previous.totalCallOI + previous.totalPutOI)) * 100 : 0;
  const priceChangePct = previous.spot > 0 ? (priceChange / previous.spot) * 100 : 0;

  // Thresholds
  const significantOI = Math.abs(totalOIChangePct) > 2; // 2% OI change
  const significantPrice = Math.abs(priceChangePct) > 0.3; // 0.3% price change

  // Determine activity
  let activity = 'Neutral';
  let strength = 0; // 0-10
  let description = '';
  let actionable = '';
  let emoji = '➡️';

  if (!significantOI && !significantPrice) {
    return {
      activity: 'Consolidation',
      strength: 2,
      description: sinceOpen ? 'Market ranging since open — no significant OI or price movement' : 'Low OI & price movement — sideways range',
      actionable: 'Wait for breakout confirmation',
      emoji: '😴',
    };
  }

  // ── Long Buildup: Price ↑ + OI ↑ (Bullish) ──
  if (priceChange > 0 && totalOIChange > 0) {
    activity = 'Long Buildup';
    strength = Math.min(10, Math.round((priceChangePct + totalOIChangePct) * 1.5));
    emoji = '🚀';

    if (callOIChangePct > putOIChangePct) {
      description = `Fresh longs ${ctx} — Call OI +${callOIChangePct.toFixed(1)}%, price +${priceChangePct.toFixed(2)}%`;
      actionable = strength > 6
        ? 'Strong bullish setup — consider longs on dips'
        : 'Moderate buying — watch for continuation';
    } else {
      description = `Put writing ${ctx} — Put OI +${putOIChangePct.toFixed(1)}%, price +${priceChangePct.toFixed(2)}%`;
      actionable = 'Bulls defending levels — supports forming';
    }
  }

  // ── Short Buildup: Price ↓ + OI ↑ (Bearish) ──
  else if (priceChange < 0 && totalOIChange > 0) {
    activity = 'Short Buildup';
    strength = Math.min(10, Math.round((Math.abs(priceChangePct) + totalOIChangePct) * 1.5));
    emoji = '📉';

    if (putOIChangePct > callOIChangePct) {
      description = `Fresh shorts ${ctx} — Put OI +${putOIChangePct.toFixed(1)}%, price ${priceChangePct.toFixed(2)}%`;
      actionable = strength > 6
        ? 'Strong bearish setup — consider shorts on rallies'
        : 'Moderate selling — watch for breakdown';
    } else {
      description = `Call writing ${ctx} — Call OI +${callOIChangePct.toFixed(1)}%, price ${priceChangePct.toFixed(2)}%`;
      actionable = 'Bears capping rallies — resistance forming';
    }
  }

  // ── Long Unwinding: Price ↓ + OI ↓ (Bearish) ──
  else if (priceChange < 0 && totalOIChange < 0) {
    activity = 'Long Unwinding';
    strength = Math.min(10, Math.round((Math.abs(priceChangePct) + Math.abs(totalOIChangePct)) * 1.5));
    emoji = '😰';

    if (Math.abs(callOIChangePct) > Math.abs(putOIChangePct)) {
      description = `Longs exiting ${ctx} — Call OI ${callOIChangePct.toFixed(1)}%, price ${priceChangePct.toFixed(2)}%`;
      actionable = strength > 6
        ? 'Heavy unwinding — avoid longs, wait for stabilisation'
        : 'Profit booking — supports may hold';
    } else {
      description = `Put unwinding ${ctx} — Put OI ${putOIChangePct.toFixed(1)}%, price ${priceChangePct.toFixed(2)}%`;
      actionable = 'Bears losing conviction but price weak — stay cautious';
    }
  }

  // ── Short Covering: Price ↑ + OI ↓ (Bullish) ──
  else if (priceChange > 0 && totalOIChange < 0) {
    activity = 'Short Covering';
    strength = Math.min(10, Math.round((priceChangePct + Math.abs(totalOIChangePct)) * 1.5));
    emoji = '🎯';

    if (Math.abs(putOIChangePct) > Math.abs(callOIChangePct)) {
      description = `Shorts covering ${ctx} — Put OI ${putOIChangePct.toFixed(1)}%, price +${priceChangePct.toFixed(2)}%`;
      actionable = strength > 6
        ? 'Strong covering rally — momentum trade, tight stops'
        : 'Bears retreating — longs have edge';
    } else {
      description = `Call unwinding ${ctx} — Call OI ${callOIChangePct.toFixed(1)}%, price +${priceChangePct.toFixed(2)}%`;
      actionable = 'Profit booking in calls but price rising — mixed signals';
    }
  }

  // ── Edge cases ──
  else {
    activity = 'Mixed Signals';
    strength = 3;
    description = `Conflicting moves ${ctx} — OI ${totalOIChangePct > 0 ? '+' : ''}${totalOIChangePct.toFixed(1)}%, price ${priceChangePct > 0 ? '+' : ''}${priceChangePct.toFixed(2)}%`;
    actionable = 'No clear direction — wait for clarity';
    emoji = '❓';
  }

  return { activity, strength, description, actionable, emoji };
}

/**
 * Generate REAL actionable insights based on ACTUAL market data
 * @param {Object} optionChain - { support, resistance, maxPain, pcr }
 * @param {Number} spot - Current spot price
 * @returns {Array} - Array of actionable insights
 */
export function generateActionableInsights(optionChain, spot) {
  const insights = [];

  if (!optionChain || !spot) {
    return insights;
  }

  const { support, resistance, maxPain, pcr } = optionChain;

  // CRITICAL: Calculate ACTUAL distances using REAL spot price
  const supportDist = support ? ((spot - support) / spot) * 100 : null;
  const resistanceDist = resistance ? ((resistance - spot) / spot) * 100 : null;
  const maxPainDist = maxPain ? ((spot - maxPain) / maxPain) * 100 : null;

  // ──────────────────────────────────────────────────────────────────
  // 1. PCR ANALYSIS (Priority - affects overall bias)
  // ──────────────────────────────────────────────────────────────────
  if (pcr) {
    if (pcr > 1.3) {
      insights.push({
        type: 'pcr',
        level: 'high',
        message: `Bullish PCR: ${pcr.toFixed(2)}`,
        action: `Heavy put writing at ${support}. Traders defending support - dips are buying opportunities.`,
        emoji: '🐂',
      });
    } else if (pcr < 0.8) {
      insights.push({
        type: 'pcr',
        level: 'low',
        message: `Bearish PCR: ${pcr.toFixed(2)}`,
        action: `Excessive call buying shows greed. Market vulnerable to pullback - book profits on rallies.`,
        emoji: '🐻',
      });
    } else {
      insights.push({
        type: 'pcr',
        level: 'neutral',
        message: `Neutral PCR: ${pcr.toFixed(2)}`,
        action: 'Balanced positioning. No clear directional bias from options traders.',
        emoji: '⚖️',
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. MAX PAIN ANALYSIS
  // ──────────────────────────────────────────────────────────────────
  if (maxPain && maxPainDist !== null) {
    const absMaxPainDist = Math.abs(maxPainDist);
    
    if (absMaxPainDist < 0.5) {
      insights.push({
        type: 'maxpain',
        level: 'at',
        message: `At Max Pain ${maxPain}`,
        action: `Spot ${spot.toFixed(0)} very close to Max Pain. Expect rangebound, choppy moves till expiry.`,
        emoji: '🧲',
      });
    } else if (maxPainDist > 0) {
      insights.push({
        type: 'maxpain',
        level: 'above',
        message: `${absMaxPainDist.toFixed(1)}% above Max Pain`,
        action: `Spot ${spot.toFixed(0)} vs Max Pain ${maxPain}. Gravitational pull down likely - call writers will defend.`,
        emoji: '⬇️',
      });
    } else {
      insights.push({
        type: 'maxpain',
        level: 'below',
        message: `${absMaxPainDist.toFixed(1)}% below Max Pain`,
        action: `Spot ${spot.toFixed(0)} vs Max Pain ${maxPain}. Upward pull likely - put writers will defend.`,
        emoji: '⬆️',
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. SUPPORT/RESISTANCE ANALYSIS (Based on ACTUAL position)
  // ──────────────────────────────────────────────────────────────────
  if (support && resistance && supportDist !== null && resistanceDist !== null) {
    
    // Near Support
    if (Math.abs(supportDist) < 0.5) {
      insights.push({
        type: 'support',
        level: 'testing',
        message: `Testing Support ${support}`,
        action: `Strong Put OI wall. High probability bounce - risk-reward favors longs with SL below ${(support - 20).toFixed(0)}.`,
        emoji: '🛡️',
      });
    }
    // Near Resistance
    else if (Math.abs(resistanceDist) < 0.5) {
      insights.push({
        type: 'resistance',
        level: 'testing',
        message: `Testing Resistance ${resistance}`,
        action: `Strong Call OI wall. Tough to break - consider profit booking or shorts with SL above ${(resistance + 20).toFixed(0)}.`,
        emoji: '🚧',
      });
    }
    // In Range
    else {
      const rangePosition = ((spot - support) / (resistance - support)) * 100;
      
      if (rangePosition > 70) {
        insights.push({
          type: 'range',
          level: 'upper',
          message: `Upper Range: ${support}-${resistance}`,
          action: `Near ${resistance} resistance. Risk-reward poor for longs - wait for pullback to ${support}.`,
          emoji: '📍',
        });
      } else if (rangePosition < 30) {
        insights.push({
          type: 'range',
          level: 'lower',
          message: `Lower Range: ${support}-${resistance}`,
          action: `Near ${support} support. Risk-reward favors longs. Resistance at ${resistance}.`,
          emoji: '📍',
        });
      } else {
        insights.push({
          type: 'range',
          level: 'middle',
          message: `Mid-Range: ${support}-${resistance}`,
          action: 'No edge. Wait for move toward support/resistance for better risk-reward.',
          emoji: '↔️',
        });
      }
    }
  }

  return insights;
}