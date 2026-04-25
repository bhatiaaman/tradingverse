// ── Bias Arbitration Engine ───────────────────────────────────────────────────
// Aggregates five independent signal streams into a single weighted consensus
// score (-10 to +10) with conflict detection.
//
// Weights: DOM 35% · Structure 25% · Momentum 15% · Options 15% · Indicators 10%
//
// Input:
//   engineResult  — from runThirdEye() (smoothedLong/Short, side, features)
//   optionsCtx    — from getOptionsContext() (pcr, callWall, putWall)
//   domVerdict    — from getDomContext() (domScore, level)
//   spot          — current spot price
//
// Output:
//   { finalScore, biasLabel, confidence, conflict, engines, agreementNote }
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function scoreToLabel(score) {
  if (score >=  6) return 'Strong Bullish';
  if (score >=  3) return 'Bullish';
  if (score >= -3) return 'Neutral';
  if (score >= -6) return 'Bearish';
  return 'Strong Bearish';
}

export function runArbitration({ engineResult, optionsCtx, domVerdict, spot }) {
  const engines = {};

  // ── 1. DOM (35%) ── signed score from dom-context.js ─────────────────────
  const domScore    = (domVerdict?.domScore != null && domVerdict?.level !== 'no-data')
    ? domVerdict.domScore : 0;
  const domAvail    = domVerdict != null && domVerdict.level !== 'no-data';
  engines.dom = {
    score: parseFloat(clamp(domScore, -10, 10).toFixed(1)),
    weight: 0.35,
    available: domAvail,
  };

  // ── 2. Structure (25%) ── ThirdEye long/short balance ────────────────────
  const long  = engineResult?.smoothedLong  ?? 50;
  const short = engineResult?.smoothedShort ?? 50;
  const structScore = parseFloat(clamp((long - short) / 5, -10, 10).toFixed(1));
  engines.structure = { score: structScore, weight: 0.25, available: true };

  // ── 3. Momentum (15%) ── ADX strength × direction ────────────────────────
  const adx       = engineResult?.features?.adx      ?? 0;
  const adxRising = engineResult?.features?.adxRising ?? false;
  const side      = engineResult?.side ?? null;
  let momentumScore = 0;
  if (side) {
    const sign = side === 'bull' ? 1 : -1;
    momentumScore  = sign * Math.min(8, adx / 3.5);
    if (adxRising) momentumScore *= 1.15;
  }
  engines.momentum = {
    score: parseFloat(clamp(momentumScore, -8, 8).toFixed(1)),
    weight: 0.15,
    available: true,
  };

  // ── 4. Options (15%) ── PCR-driven + wall proximity bonus ────────────────
  const optAvail = optionsCtx?.available !== false && optionsCtx?.pcr != null;
  let optScore = 0;
  if (optAvail) {
    optScore = clamp((optionsCtx.pcr - 1.0) * 12, -7, 7);
    if (spot && optionsCtx.callWall && optionsCtx.putWall) {
      const dCall = Math.abs(optionsCtx.callWall - spot);
      const dPut  = Math.abs(optionsCtx.putWall  - spot);
      if (dPut < dCall) optScore = clamp(optScore + 0.5, -7, 7);
      else if (dCall < dPut) optScore = clamp(optScore - 0.5, -7, 7);
    }
  }
  engines.options = {
    score: parseFloat(optScore.toFixed(1)),
    weight: 0.15,
    available: optAvail,
  };

  // ── 5. Indicators (10%) ── RSI + EMA stack ───────────────────────────────
  const rsi       = engineResult?.features?.rsi        ?? 50;
  const aboveEma9  = engineResult?.features?.aboveEma9 ?? false;
  const aboveEma21 = engineResult?.features?.aboveEma21 ?? false;
  const rsiPts = rsi > 65 ? 3 : rsi > 55 ? 1 : rsi > 45 ? -1 : rsi > 35 ? -2 : -3;
  const emaPts = (aboveEma9 && aboveEma21) ? 3 : (!aboveEma9 && !aboveEma21) ? -3 : 0;
  engines.indicators = {
    score: parseFloat(clamp(rsiPts + emaPts, -6, 6).toFixed(1)),
    weight: 0.10,
    available: true,
  };

  // Attach labels
  for (const e of Object.values(engines)) {
    e.label = scoreToLabel(e.score);
  }

  // ── Weighted final score ──────────────────────────────────────────────────
  const weighted   = Object.values(engines).reduce((s, e) => s + e.weight * e.score, 0);
  const finalScore = parseFloat(clamp(weighted, -10, 10).toFixed(1));

  // ── Conflict detection ────────────────────────────────────────────────────
  // Primary: DOM and Structure (the two heaviest engines) disagree strongly
  const domVsStruct = domAvail
    && Math.abs(engines.dom.score) >= 4
    && Math.abs(engines.structure.score) >= 4
    && engines.dom.score * engines.structure.score < 0;

  // Secondary: weighted bull and bear contributions both substantial
  const bullW = Object.values(engines)
    .reduce((s, e) => e.score > 0 ? s + e.weight * e.score : s, 0);
  const bearW = Object.values(engines)
    .reduce((s, e) => e.score < 0 ? s + e.weight * Math.abs(e.score) : s, 0);
  const conflict = domVsStruct || (bullW > 1.5 && bearW > 1.5);

  // ── Confidence ────────────────────────────────────────────────────────────
  const abs = Math.abs(finalScore);
  const confidence = conflict ? 'low'
    : abs >= 6 ? 'high'
    : abs >= 3 ? 'medium'
    : 'low';

  // ── Agreement summary ─────────────────────────────────────────────────────
  const NAMES = { dom: 'DOM', structure: 'Structure', momentum: 'Momentum', options: 'Options', indicators: 'Indicators' };
  const total      = Object.keys(engines).length;
  const bullList   = Object.entries(engines).filter(([, e]) => e.available && e.score > 1).map(([k]) => NAMES[k]);
  const bearList   = Object.entries(engines).filter(([, e]) => e.available && e.score < -1).map(([k]) => NAMES[k]);
  const diverging  = bullList.length > bearList.length
    ? bearList : bullList.length < bearList.length ? bullList : [];

  let agreementNote;
  if (conflict) {
    agreementNote = `Mixed signals — ${bearList.join(', ')} vs ${bullList.join(', ')} · avoid aggressive positions`;
  } else if (bullList.length > bearList.length) {
    agreementNote = diverging.length
      ? `${bullList.length}/${total} engines bullish · ${diverging.join(', ')} diverging`
      : `${bullList.length}/${total} engines bullish`;
  } else if (bearList.length > bullList.length) {
    agreementNote = diverging.length
      ? `${bearList.length}/${total} engines bearish · ${diverging.join(', ')} diverging`
      : `${bearList.length}/${total} engines bearish`;
  } else {
    agreementNote = `Engines split — no clear consensus`;
  }

  return {
    finalScore,
    biasLabel: scoreToLabel(finalScore),
    confidence,
    conflict,
    engines,
    bullEngines: bullList,
    bearEngines: bearList,
    agreementNote,
  };
}
