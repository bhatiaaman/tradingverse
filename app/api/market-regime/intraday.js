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
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
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
export function detectIntradayRegime(candles, oiData = null) {
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
  const volExpanding = recentVol > avgVol * 1.5;
  const volLow       = recentVol < avgVol * 0.7;

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
  const orBreakUp    = currentPrice > orHigh;
  const orBreakDown  = currentPrice < orLow;

  // ── Trap: breakout then reversal back inside OR ────────────────────────────
  const lookback    = candles.slice(-8);
  const hadHighBreak = lookback.some(c => c.high > orHigh);
  const hadLowBreak  = lookback.some(c => c.low  < orLow);
  const backInside   = currentPrice > orLow && currentPrice < orHigh;
  const trapUp       = hadHighBreak && backInside && !priceAboveVwap;
  const trapDown     = hadLowBreak  && backInside &&  priceAboveVwap;

  // ── Rapid squeeze / liquidation ────────────────────────────────────────────
  const last4    = n >= 4 ? candles.slice(-4) : [];
  const allUp    = last4.length === 4 && last4.every(c => c.close > c.open);
  const allDown  = last4.length === 4 && last4.every(c => c.close < c.open);

  // ── Classify ───────────────────────────────────────────────────────────────
  let regime, confidence;
  const signals = [];

  if (trapUp) {
    regime = 'TRAP_DAY'; confidence = 'HIGH';
    signals.push('Bull trap — breakout above OR reversed back below VWAP');
  } else if (trapDown) {
    regime = 'TRAP_DAY'; confidence = 'HIGH';
    signals.push('Bear trap — breakdown below OR recovered above VWAP');
  } else if (allUp && volExpanding && priceAboveVwap && (orBreakUp || bullStructure)) {
    regime = 'SHORT_SQUEEZE';
    // OI confirms: low PCR (shorts covering) or PCR falling sharply = strong squeeze signal
    confidence = (oiSqueeze || oiFallingSharply) ? 'HIGH' : 'MEDIUM';
    signals.push('4 consecutive green candles · volume surge · above VWAP');
    if (oiSqueeze)       signals.push(`PCR ${pcr} — call-heavy · short covering likely`);
    if (oiFallingSharply) signals.push(`PCR fell ${pcrDelta?.toFixed(2)} intraday — puts unwinding`);
  } else if (!allUp && oiSqueeze && oiFallingSharply && priceAboveVwap && volExpanding) {
    // OI-only squeeze: price moving up + volume + PCR collapsing — even without 4 straight greens
    regime = 'SHORT_SQUEEZE'; confidence = 'MEDIUM';
    signals.push(`PCR ${pcr} (low) · fell ${pcrDelta?.toFixed(2)} intraday — short covering underway`);
    signals.push('Volume expanding · price above VWAP');
  } else if (allDown && volExpanding && !priceAboveVwap && (orBreakDown || bearStructure)) {
    regime = 'LONG_LIQUIDATION';
    // OI confirms: high PCR (put buyers / hedgers) or PCR rising sharply = confirmed liquidation
    confidence = (oiLiquidation || oiRisingSharply) ? 'HIGH' : 'MEDIUM';
    signals.push('4 consecutive red candles · volume surge · below VWAP');
    if (oiLiquidation)    signals.push(`PCR ${pcr} — put-heavy · forced selling likely`);
    if (oiRisingSharply)  signals.push(`PCR rose ${pcrDelta?.toFixed(2)} intraday — put buying accelerating`);
  } else if (!allDown && oiLiquidation && oiRisingSharply && !priceAboveVwap && volExpanding) {
    // OI-only liquidation: price falling + volume + PCR spiking — even without 4 straight reds
    regime = 'LONG_LIQUIDATION'; confidence = 'MEDIUM';
    signals.push(`PCR ${pcr} (high) · rose ${pcrDelta?.toFixed(2)} intraday — put buying / longs exiting`);
    signals.push('Volume expanding · price below VWAP');
  } else if (orBreakUp && bullStructure && priceAboveVwap && volExpanding) {
    regime = 'TREND_DAY_UP'; confidence = 'HIGH';
    signals.push('OR broken up · HH+HL structure · above VWAP · volume confirming');
  } else if (orBreakDown && bearStructure && !priceAboveVwap && volExpanding) {
    regime = 'TREND_DAY_DOWN'; confidence = 'HIGH';
    signals.push('OR broken down · LL+LH structure · below VWAP · volume confirming');
  } else if (orBreakUp && priceAboveVwap) {
    regime = 'TREND_DAY_UP'; confidence = 'MEDIUM';
    signals.push('OR broken up · holding above VWAP');
    if (bullStructure) signals.push('HH+HL structure building');
  } else if (orBreakDown && !priceAboveVwap) {
    regime = 'TREND_DAY_DOWN'; confidence = 'MEDIUM';
    signals.push('OR broken down · holding below VWAP');
    if (bearStructure) signals.push('LL+LH structure building');
  } else if ((orBreakUp || orBreakDown) && volExpanding) {
    regime = 'BREAKOUT_DAY'; confidence = 'MEDIUM';
    signals.push(`OR broken ${orBreakUp ? 'up' : 'down'} with volume — direction not yet confirmed`);
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
