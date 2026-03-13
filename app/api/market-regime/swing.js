// ─────────────────────────────────────────────────────────────────────────────
// Swing / Positional Market Phase Detection
// Input: daily candles for NIFTY / BANKNIFTY (last ~90 days)
// Output: market phase, confidence, key signals
//
// Phases:
//   MARKUP        — price above both EMAs, HH+HL structure, bullish volume
//   DISTRIBUTION  — price at highs but selling volume dominates / ATR expanding
//   MARKDOWN      — price below both EMAs, LL+LH structure, bearish volume
//   ACCUMULATION  — compression below EMAs, volatility contracting, holding support
// ─────────────────────────────────────────────────────────────────────────────

function calcEMA(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcATRSlice(candles) {
  if (candles.length < 2) return 0;
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

export function detectSwingPhase(candles) {
  if (!candles || candles.length < 20) {
    return { phase: 'INSUFFICIENT_DATA', confidence: 'LOW', signals: [] };
  }

  const closes = candles.map(c => c.close);
  const latest = closes[closes.length - 1];
  const n      = candles.length;

  // ── EMAs ──────────────────────────────────────────────────────────────────
  const ema20       = calcEMA(closes, Math.min(20, n));
  const ema50       = calcEMA(closes, Math.min(50, n));
  const aboveEma20  = ema20 ? latest > ema20 : null;
  const aboveEma50  = ema50 ? latest > ema50 : null;
  const emaUptrend  = (ema20 && ema50) ? ema20 > ema50 : null;

  // ── Volume split: up-day vol vs down-day vol (last 20 candles) ─────────────
  const last20    = candles.slice(-20);
  const upVol     = last20.filter(c => c.close >= c.open).reduce((s, c) => s + c.volume, 0);
  const dnVol     = last20.filter(c => c.close <  c.open).reduce((s, c) => s + c.volume, 0);
  const volBullish = upVol > dnVol * 1.2;   // 20% more volume on up days
  const volBearish = dnVol > upVol * 1.2;

  // ── ATR trend: early 20 vs recent 20 candles ──────────────────────────────
  const earlyATR      = n >= 40 ? calcATRSlice(candles.slice(-40, -20)) : null;
  const recentATR     = calcATRSlice(candles.slice(-20));
  const atrExpanding  = earlyATR ? recentATR > earlyATR * 1.15 : false;
  const atrContracting = earlyATR ? recentATR < earlyATR * 0.85 : false;

  // ── Swing structure over last 30 candles (first half vs second half) ───────
  const last30       = candles.slice(-Math.min(30, n));
  const mid          = Math.floor(last30.length / 2);
  const firstHalf    = last30.slice(0, mid);
  const secondHalf   = last30.slice(mid);
  const firstHigh    = Math.max(...firstHalf.map(c => c.high));
  const secondHigh   = Math.max(...secondHalf.map(c => c.high));
  const firstLow     = Math.min(...firstHalf.map(c => c.low));
  const secondLow    = Math.min(...secondHalf.map(c => c.low));
  const bullStructure = secondHigh > firstHigh && secondLow > firstLow; // HH + HL
  const bearStructure = secondHigh < firstHigh && secondLow < firstLow; // LH + LL

  // ── Classify phase ────────────────────────────────────────────────────────
  let phase, confidence;
  const signals = [];

  if (aboveEma20 && aboveEma50 && emaUptrend && volBullish && bullStructure) {
    phase = 'MARKUP'; confidence = 'HIGH';
    signals.push('Above both EMAs · HH+HL structure · bullish volume confirms');
  } else if (aboveEma20 && aboveEma50 && emaUptrend && (volBearish || atrExpanding)) {
    phase = 'DISTRIBUTION'; confidence = 'MEDIUM';
    signals.push('Price at highs but selling volume dominates');
    if (atrExpanding) signals.push('ATR expanding — volatility rising at peak');
  } else if (aboveEma20 && aboveEma50 && emaUptrend) {
    phase = 'MARKUP'; confidence = 'MEDIUM';
    signals.push('Above both EMAs · uptrend intact · volume neutral');
  } else if (!aboveEma20 && !aboveEma50 && bearStructure && volBearish) {
    phase = 'MARKDOWN'; confidence = 'HIGH';
    signals.push('Below both EMAs · LH+LL structure · bearish volume confirms');
  } else if (!aboveEma20 && !aboveEma50 && bearStructure) {
    phase = 'MARKDOWN'; confidence = 'MEDIUM';
    signals.push('Below both EMAs · lower highs and lows forming');
  } else if (!aboveEma20 && atrContracting && !volBearish) {
    phase = 'ACCUMULATION'; confidence = 'MEDIUM';
    signals.push('Below 20 EMA · volatility contracting · no panic selling');
    if (!aboveEma50) signals.push('Testing or holding long-term support zone');
  } else if (aboveEma20 && !aboveEma50) {
    // Recovery attempt — above short-term but not mid-term EMA
    if (bullStructure && volBullish) {
      phase = 'MARKUP'; confidence = 'LOW';
      signals.push('Reclaiming 20 EMA · attempting recovery toward 50 EMA');
    } else {
      phase = 'ACCUMULATION'; confidence = 'LOW';
      signals.push('Bouncing below 50 EMA · recovery not yet confirmed');
    }
  } else if (!aboveEma20 && !aboveEma50 && atrContracting) {
    phase = 'ACCUMULATION'; confidence = 'LOW';
    signals.push('Compression below EMAs · base formation possible');
  } else {
    phase = 'DISTRIBUTION'; confidence = 'LOW';
    signals.push('Mixed signals — possible transition between phases');
  }

  return {
    phase,
    confidence,
    signals,
    priceVsEma20:  aboveEma20 === null ? null : aboveEma20 ? 'ABOVE' : 'BELOW',
    priceVsEma50:  aboveEma50 === null ? null : aboveEma50 ? 'ABOVE' : 'BELOW',
    ema20:         ema20  ? parseFloat(ema20.toFixed(2))  : null,
    ema50:         ema50  ? parseFloat(ema50.toFixed(2))  : null,
    currentPrice:  parseFloat(latest.toFixed(2)),
    volumeBias:    volBullish ? 'BULLISH' : volBearish ? 'BEARISH' : 'NEUTRAL',
    atrState:      atrExpanding ? 'EXPANDING' : atrContracting ? 'CONTRACTING' : 'STABLE',
    structure:     bullStructure ? 'BULLISH' : bearStructure ? 'BEARISH' : 'MIXED',
  };
}
