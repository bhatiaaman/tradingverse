// ─────────────────────────────────────────────────────────────────────────────
// Intraday Market Regime Detection
// Input: today's 5-minute candles for NIFTY / BANKNIFTY
// Output: regime type, confidence, key levels, signals, volatility state
//
// Regimes:
//   TREND_DAY_UP      — OR broken up, HH+HL, above VWAP
//   TREND_DAY_DOWN    — OR broken down, LL+LH, below VWAP
//   RANGE_DAY         — multiple VWAP crosses, oscillating inside OR
//   BREAKOUT_DAY      — OR broken with volume but structure not fully confirmed
//   SHORT_SQUEEZE     — rapid up move, consecutive up candles, volume surge
//   LONG_LIQUIDATION  — rapid selloff, consecutive down candles, volume surge
//   TRAP_DAY          — breakout that reversed back inside range
//   LOW_VOL_DRIFT     — inside OR, low volume, slow drift
//   INITIALIZING      — not enough candles yet (< 3)
// ─────────────────────────────────────────────────────────────────────────────

function calcVWAP(candles) {
  let cumTPV = 0, cumVol = 0;
  for (const c of candles) {
    const tp  = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1; // NIFTY index has 0 volume — use equal weighting
    cumTPV += tp * vol;
    cumVol += vol;
  }
  return cumVol > 0 ? cumTPV / cumVol : null;
}

function calcATR(candles) {
  if (candles.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < candles.length; i++) {
    sum += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close),
    );
  }
  return sum / (candles.length - 1);
}

// oiData: { pcr, pcrAtOpen, totalCallOI, totalPutOI } — optional, null = unavailable
// options: { prevClose } — yesterday's closing price, used for gap detection
export function detectIntradayRegime(candles, oiData = null, options = {}) {
  if (!candles || candles.length < 3) {
    return {
      regime: 'INITIALIZING', confidence: 'LOW', signals: [],
      vwap: null, vwapPosition: 'UNKNOWN', orHigh: null, orLow: null,
      volatilityState: 'UNKNOWN', vwapCrosses: 0, sessionProgress: 0,
    };
  }

  // ── OI / PCR signals ────────────────────────────────────────────────────────
  // PCR = totalPutOI / totalCallOI (ATM ± 5 strikes, near weekly expiry)
  // < 0.7  → call-heavy → bulls complacent / shorts covering → squeeze conditions
  // 0.7–1.2 → neutral
  // > 1.2  → put-heavy → hedging / fear → liquidation conditions
  // pcrDelta < 0 (PCR falling intraday) = puts being unwound or calls added → bullish shift
  // pcrDelta > 0 (PCR rising intraday)  = puts being added or calls unwound → bearish shift
  // ── Gap detection ────────────────────────────────────────────────────────────
  // On gap-up days: OR high is elevated from open → price consolidating below OR high
  // is NOT a range day — it's trend continuation. Same logic applies inversely for gaps down.
  const prevClose     = options?.prevClose ?? null;
  const firstOpen     = candles[0].open;
  const gapPct        = prevClose ? ((firstOpen - prevClose) / prevClose) * 100 : 0;
  const isGapUp       = gapPct >  0.5;  // gapped up > 0.5%
  const isGapDown     = gapPct < -0.5;  // gapped down > 0.5%

  const pcr      = oiData?.pcr ?? null;
  const pcrAtOpen = oiData?.pcrAtOpen ?? null;
  const pcrDelta  = (pcr != null && pcrAtOpen != null) ? pcr - pcrAtOpen : null;
  const oiSqueeze      = pcr != null && pcr < 0.7;   // low PCR → squeeze conditions
  const oiLiquidation  = pcr != null && pcr > 1.2;   // high PCR → liquidation conditions
  const oiFallingSharply = pcrDelta != null && pcrDelta < -0.15; // PCR dropped → short covering
  const oiRisingSharply  = pcrDelta != null && pcrDelta >  0.15; // PCR rising  → put buying

  const n      = candles.length;
  const latest = candles[n - 1];

  // ── Opening Range: first 3 × 5-min candles = first 15 min ─────────────────
  const orCandles = candles.slice(0, 3);
  const orHigh    = Math.max(...orCandles.map(c => c.high));
  const orLow     = Math.min(...orCandles.map(c => c.low));

  // ── VWAP ──────────────────────────────────────────────────────────────────
  const vwap           = calcVWAP(candles);
  const priceAboveVwap = vwap ? latest.close > vwap : null;

  // ── VWAP cross count ──────────────────────────────────────────────────────
  let vwapCrosses = 0;
  if (vwap) {
    for (let i = 1; i < n; i++) {
      const prev = candles[i - 1].close;
      const curr = candles[i].close;
      if ((prev < vwap && curr > vwap) || (prev > vwap && curr < vwap)) vwapCrosses++;
    }
  }

  // ── Volume ────────────────────────────────────────────────────────────────
  const avgVol       = candles.reduce((s, c) => s + c.volume, 0) / n;
  const recentVol    = candles.slice(-6).reduce((s, c) => s + c.volume, 0) / 6;
  const hasVolume    = avgVol > 0; // NIFTY index returns 0 volume — skip volume checks
  const volExpanding = hasVolume ? recentVol > avgVol * 1.5 : false;
  const volLow       = hasVolume ? recentVol < avgVol * 0.7 : false;

  // ── ATR + volatility state ─────────────────────────────────────────────────
  const atr     = calcATR(candles);
  const orRange = orHigh - orLow;
  const atrRatio = (atr && orRange) ? atr / orRange : null;
  const volatilityState =
    (volExpanding && atrRatio > 1.2)  ? 'EXPANSION' :
    (atrRatio > 0.8)                  ? 'HIGH'      :
    (volLow && atrRatio < 0.4)        ? 'LOW'       : 'NORMAL';

  // ── Structure: track highs/lows over last 10 candles ──────────────────────
  const recent  = candles.slice(-Math.min(10, n));
  const rHighs  = recent.map(c => c.high);
  const rLows   = recent.map(c => c.low);
  const bullStructure = rHighs[rHighs.length - 1] > rHighs[0] && rLows[rLows.length - 1] > rLows[0];
  const bearStructure = rHighs[rHighs.length - 1] < rHighs[0] && rLows[rLows.length - 1] < rLows[0];

  // ── Opening range break ───────────────────────────────────────────────────
  const currentPrice = latest.close;
  // On gap-up days: OR high is already elevated from the open. If price holds above
  // yesterday's close + gap and is above VWAP, count it as an effective OR break up
  // even if it consolidates slightly below the intraday OR high.
  const orBreakUp   = currentPrice > orHigh ||
                      (isGapUp   && priceAboveVwap && prevClose && currentPrice > prevClose * 1.004);
  const orBreakDown = currentPrice < orLow  ||
                      (isGapDown && !priceAboveVwap && prevClose && currentPrice < prevClose * 0.996);

  // ── Full-session OR break history (don't limit to last N candles)
  // Trap detection must look at the whole session: a selloff that started
  // in candle 2 won't appear in a slice(-8) taken at candle 14.
  const sessionHadHighBreak = candles.slice(3).some(c => c.high > orHigh);
  const sessionHadLowBreak  = candles.slice(3).some(c => c.low  < orLow);
  const backInside   = currentPrice > orLow && currentPrice < orHigh;
  const trapUp       = sessionHadHighBreak && backInside && !priceAboveVwap;
  const trapDown     = sessionHadLowBreak  && backInside &&  priceAboveVwap;

  // ── Rapid squeeze / liquidation ────────────────────────────────────────────
  // Use last 3 candles (not 4) — 4-consecutive is too strict, misses partial squeezes
  const last3    = n >= 3 ? candles.slice(-3) : [];
  const last4    = n >= 4 ? candles.slice(-4) : [];
  const allUp    = last3.length === 3 && last3.every(c => c.close > c.open);
  const allDown  = last3.length === 3 && last3.every(c => c.close < c.open);
  const allUp4   = last4.length === 4 && last4.every(c => c.close > c.open);
  const allDown4 = last4.length === 4 && last4.every(c => c.close < c.open);

  // ── Classify ───────────────────────────────────────────────────────────────
  let regime, confidence;
  const signals = [];

  if (trapUp) {
    regime = 'TRAP_DAY'; confidence = 'HIGH';
    signals.push('Bull trap — breakout above OR reversed back below VWAP');
  } else if (trapDown) {
    regime = 'TRAP_DAY'; confidence = 'HIGH';
    signals.push('Bear trap — breakdown below OR recovered above VWAP');
  } else if ((allUp || allUp4) && (volExpanding || !hasVolume) && priceAboveVwap && (orBreakUp || bullStructure || sessionHadLowBreak)) {
    regime = 'SHORT_SQUEEZE';
    // OI confirms: low PCR (shorts covering) or PCR falling sharply = strong squeeze signal
    // sessionHadLowBreak: recovery from below-OR selloff — classic short squeeze setup
    confidence = (oiSqueeze || oiFallingSharply) ? 'HIGH' : 'MEDIUM';
    const candles34 = allUp4 ? '4' : '3';
    signals.push(`${candles34} consecutive green candles · volume surge · above VWAP`);
    if (sessionHadLowBreak && !orBreakUp) signals.push('Recovering from below-OR selloff — shorts covering');
    if (oiSqueeze)        signals.push(`PCR ${pcr} — call-heavy · short covering likely`);
    if (oiFallingSharply) signals.push(`PCR fell ${pcrDelta?.toFixed(2)} intraday — puts unwinding`);
  } else if (!allUp && oiSqueeze && oiFallingSharply && priceAboveVwap && volExpanding) {
    // OI-only squeeze: price moving up + volume + PCR collapsing — even without 4 straight greens
    regime = 'SHORT_SQUEEZE'; confidence = 'MEDIUM';
    signals.push(`PCR ${pcr} (low) · fell ${pcrDelta?.toFixed(2)} intraday — short covering underway`);
    signals.push('Volume expanding · price above VWAP');
  } else if ((allDown || allDown4) && (volExpanding || !hasVolume) && !priceAboveVwap && (orBreakDown || bearStructure)) {
    regime = 'LONG_LIQUIDATION';
    // OI confirms: high PCR (put buyers / hedgers) or PCR rising sharply = confirmed liquidation
    confidence = (oiLiquidation || oiRisingSharply) ? 'HIGH' : 'MEDIUM';
    const candles34d = allDown4 ? '4' : '3';
    signals.push(`${candles34d} consecutive red candles · volume surge · below VWAP`);
    if (oiLiquidation)    signals.push(`PCR ${pcr} — put-heavy · forced selling likely`);
    if (oiRisingSharply)  signals.push(`PCR rose ${pcrDelta?.toFixed(2)} intraday — put buying accelerating`);
  } else if (!allDown && oiLiquidation && oiRisingSharply && !priceAboveVwap && volExpanding) {
    // OI-only liquidation: price falling + volume + PCR spiking — even without 4 straight reds
    regime = 'LONG_LIQUIDATION'; confidence = 'MEDIUM';
    signals.push(`PCR ${pcr} (high) · rose ${pcrDelta?.toFixed(2)} intraday — put buying / longs exiting`);
    signals.push('Volume expanding · price below VWAP');
  } else if (orBreakUp && bullStructure && priceAboveVwap && (volExpanding || !hasVolume)) {
    regime = 'TREND_DAY_UP'; confidence = 'HIGH';
    if (isGapUp) signals.push(`Gap up ${gapPct.toFixed(1)}% · holding above VWAP · HH+HL structure`);
    else signals.push('OR broken up · HH+HL structure · above VWAP · volume confirming');
  } else if (orBreakDown && bearStructure && !priceAboveVwap && (volExpanding || !hasVolume)) {
    regime = 'TREND_DAY_DOWN'; confidence = 'HIGH';
    if (isGapDown) signals.push(`Gap down ${Math.abs(gapPct).toFixed(1)}% · holding below VWAP · LL+LH structure`);
    else signals.push('OR broken down · LL+LH structure · below VWAP · volume confirming');
  } else if (orBreakUp && priceAboveVwap) {
    regime = 'TREND_DAY_UP'; confidence = 'MEDIUM';
    if (isGapUp) signals.push(`Gap up ${gapPct.toFixed(1)}% · holding above VWAP`);
    else signals.push('OR broken up · holding above VWAP');
    if (bullStructure) signals.push('HH+HL structure building');
  } else if (orBreakDown && !priceAboveVwap) {
    regime = 'TREND_DAY_DOWN'; confidence = 'MEDIUM';
    if (isGapDown) signals.push(`Gap down ${Math.abs(gapPct).toFixed(1)}% · holding below VWAP`);
    else signals.push('OR broken down · holding below VWAP');
    if (bearStructure) signals.push('LL+LH structure building');
  } else if ((orBreakUp || orBreakDown) && (volExpanding || !hasVolume)) {
    regime = 'BREAKOUT_DAY'; confidence = 'MEDIUM';
    signals.push(`OR broken ${orBreakUp ? 'up' : 'down'} with volume — direction not yet confirmed`);
  } else if (bullStructure && priceAboveVwap && (volExpanding || !hasVolume) && sessionHadLowBreak) {
    // Recovery from below-OR session low: price broke down earlier but has since recovered
    // with bull structure (HH+HL) and volume above VWAP — this is a squeeze/recovery day
    regime = 'SHORT_SQUEEZE'; confidence = 'MEDIUM';
    signals.push('Recovered from session low · bull structure building · above VWAP');
    if (oiSqueeze || oiFallingSharply) {
      confidence = 'HIGH';
      if (oiFallingSharply) signals.push(`PCR fell ${pcrDelta?.toFixed(2)} — short covering confirmed`);
    }
  } else if (bearStructure && !priceAboveVwap && (volExpanding || !hasVolume) && sessionHadHighBreak) {
    // Distribution after early high: broke up then came back down with bear structure
    regime = 'LONG_LIQUIDATION'; confidence = 'MEDIUM';
    signals.push('Retreated from session high · bear structure · below VWAP');
  } else if (vwapCrosses >= 3) {
    regime = 'RANGE_DAY'; confidence = vwapCrosses >= 5 ? 'HIGH' : 'MEDIUM';
    signals.push(`${vwapCrosses} VWAP crosses — price oscillating around VWAP`);
  } else if (!orBreakUp && !orBreakDown && volLow) {
    regime = 'LOW_VOL_DRIFT'; confidence = 'MEDIUM';
    signals.push('Inside opening range · low participation');
  } else {
    regime = 'RANGE_DAY'; confidence = 'LOW';
    signals.push('Inside opening range · no clear breakout yet');
  }

  // ── Regime shift probability ───────────────────────────────────────────────
  let regimeShiftProbability = 'LOW';
  if (volatilityState === 'EXPANSION') regimeShiftProbability = 'HIGH';
  else if (regime === 'RANGE_DAY' && vwapCrosses >= 2 && volExpanding) regimeShiftProbability = 'MEDIUM';
  else if (regime === 'LOW_VOL_DRIFT' && atrRatio > 0.6) regimeShiftProbability = 'MEDIUM';

  return {
    regime,
    confidence,
    signals,
    vwap:                  vwap   ? parseFloat(vwap.toFixed(2))   : null,
    vwapPosition:          priceAboveVwap === null ? 'UNKNOWN' : priceAboveVwap ? 'ABOVE' : 'BELOW',
    orHigh:                parseFloat(orHigh.toFixed(2)),
    orLow:                 parseFloat(orLow.toFixed(2)),
    currentPrice:          parseFloat(currentPrice.toFixed(2)),
    volatilityState,
    vwapCrosses,
    sessionProgress:       Math.round((n / 75) * 100), // 75 candles ≈ full 6.25h session
    regimeShiftProbability,
    // OI data (null when unavailable / market closed)
    pcr,
    pcrAtOpen,
    pcrDelta,
  };
}
