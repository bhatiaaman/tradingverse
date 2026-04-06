// ─── Shared Chart Indicator Computations ─────────────────────────────────────
// Single source of truth for all indicator calculations used across chart pages.
// All functions are pure (no React dependencies) and accept raw candle arrays.
// Candle shape: { time, open, high, low, close, volume }

const IST_OFFSET_CPR = 5.5 * 3600; // seconds

function dateIST(unixSec) {
  return new Date((unixSec + IST_OFFSET_CPR) * 1000).toISOString().slice(0, 10);
}

function _cprLevels(H, L, C) {
  const P  = (H + L + C) / 3;
  const BC = (H + L) / 2;
  const TC = 2 * P - BC;
  const widthPct   = P > 0 ? ((TC - BC) / P) * 100 : 0;
  const widthClass = widthPct < 0.15 ? 'narrow' : widthPct > 0.35 ? 'wide' : 'normal';
  return { tc: TC, p: P, bc: BC, r1: 2*P-L, r2: P+(H-L), s1: 2*P-H, s2: P-(H-L), widthPct, widthClass };
}

// ── Weekly aggregation ────────────────────────────────────────────────────────
export function aggregateWeekly(dailyCandles) {
  const weeks = {};
  for (const c of dailyCandles) {
    const d = new Date(c.time * 1000);
    const day = d.getUTCDay();
    const daysToMon = day === 0 ? -6 : 1 - day;
    const monTime = c.time + daysToMon * 86400;
    if (!weeks[monTime]) {
      weeks[monTime] = { time: monTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else {
      weeks[monTime].high   = Math.max(weeks[monTime].high, c.high);
      weeks[monTime].low    = Math.min(weeks[monTime].low,  c.low);
      weeks[monTime].close  = c.close;
      weeks[monTime].volume += c.volume;
    }
  }
  return Object.values(weeks).sort((a, b) => a.time - b.time);
}

// ── CPR — per-day segments ────────────────────────────────────────────────────
// Returns array of { startIdx, endIdx, tc, p, bc, r1, r2, s1, s2, widthPct, widthClass }
// chartInterval: 'day' → weekly CPR; anything else → daily intraday CPR
export function computeCPR(candles, dailyCandles, chartInterval) {
  if (!candles?.length || !dailyCandles?.length) return [];

  if (chartInterval === 'day') {
    const weeklies = aggregateWeekly(dailyCandles);
    if (weeklies.length < 2) return [];
    const weeklyDates = weeklies.map(w => dateIST(w.time));
    const segments = [];
    let startIdx = 0;
    for (let i = 0; i < candles.length; i++) {
      const d = dateIST(candles[i].time);
      const wIdx = weeklyDates.findLastIndex(wd => wd <= d);
      const isLast = i === candles.length - 1;
      const nextD = isLast ? null : dateIST(candles[i + 1].time);
      const nextWIdx = nextD ? weeklyDates.findLastIndex(wd => wd <= nextD) : -1;
      if (isLast || nextWIdx !== wIdx) {
        if (wIdx > 0) {
          const prev = weeklies[wIdx - 1];
          segments.push({ startIdx, endIdx: i, ...(_cprLevels(prev.high, prev.low, prev.close)) });
        }
        startIdx = i + 1;
      }
    }
    return segments;
  }

  // Intraday: group by IST date, each day gets CPR from prior daily candle
  const segments = [];
  let dayStart = 0;
  let currentDate = dateIST(candles[0].time);
  for (let i = 1; i <= candles.length; i++) {
    const isLast = i === candles.length;
    const d = isLast ? null : dateIST(candles[i].time);
    if (isLast || d !== currentDate) {
      let prevIdx = -1;
      for (let j = dailyCandles.length - 1; j >= 0; j--) {
        if (dateIST(dailyCandles[j].time) < currentDate) { prevIdx = j; break; }
      }
      if (prevIdx >= 0) {
        const prev = dailyCandles[prevIdx];
        segments.push({ startIdx: dayStart, endIdx: i - 1, ...(_cprLevels(prev.high, prev.low, prev.close)) });
      }
      currentDate = d;
      dayStart = i;
    }
  }
  return segments;
}

// ── VWAP ──────────────────────────────────────────────────────────────────────
export function computeVWAP(candles) {
  let cumTPV = 0, cumVol = 0;
  return candles.map(c => {
    const tp  = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1;
    cumTPV += tp * vol;
    cumVol += vol;
    return { time: c.time, value: parseFloat((cumTPV / cumVol).toFixed(2)) };
  });
}

// ── EMA ───────────────────────────────────────────────────────────────────────
export function computeEMA(candles, period) {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  const result = [];
  for (let i = period - 1; i < candles.length; i++) {
    if (i > period - 1) ema = candles[i].close * k + ema * (1 - k);
    result.push({ time: candles[i].time, value: parseFloat(ema.toFixed(2)) });
  }
  return result;
}

// ── RSI ───────────────────────────────────────────────────────────────────────
export function computeRSI(candles, period) {
  const out = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d >= 0) gainSum += d; else lossSum -= d;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(0, d))  / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// ── SMA aligned to RSI output (null-safe) ────────────────────────────────────
export function computeSMAAligned(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0, runStart = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) { sum = 0; runStart = -1; continue; }
    if (runStart === -1) runStart = i;
    sum += values[i];
    const runLen = i - runStart + 1;
    if (runLen > period) sum -= values[i - period];
    if (runLen >= period) out[i] = sum / period;
  }
  return out;
}

// ── Bollinger Bands ───────────────────────────────────────────────────────────
export function computeBB(candles, length = 20, mult = 2.0) {
  const n = candles.length;
  if (n < length) return null;
  const basis = new Array(n).fill(null);
  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  for (let i = length - 1; i < n; i++) {
    const slice = candles.slice(i - length + 1, i + 1);
    const mean  = slice.reduce((s, c) => s + c.close, 0) / length;
    const variance = slice.reduce((s, c) => s + (c.close - mean) ** 2, 0) / length;
    const sd    = Math.sqrt(variance);
    basis[i] = parseFloat(mean.toFixed(2));
    upper[i] = parseFloat((mean + mult * sd).toFixed(2));
    lower[i] = parseFloat((mean - mult * sd).toFixed(2));
  }
  return { basis, upper, lower };
}

// ── SMC (BOS / CHoCH / Order Blocks / FVGs) ──────────────────────────────────
// OB detection: last opposite-direction candle BEFORE the PIVOT (not the break).
// OB mitigation: close price (wick touches don't count) — matches TradingView.
// CHoCH: majority vote of last 3 breaks prevents single noise break from flipping trend.
export function computeSMC(candles) {
  const n = candles.length;
  // Pivot strength: 5 bars each side (matches standard TV SMC, removes minor noise)
  const STR = 5; 
  if (n < STR * 2 + 5) return null;

  // ── Swing pivots ─────────────────────────────────────────────────────────
  const pivotHighs = [], pivotLows = [];
  for (let i = STR; i < n - STR; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= STR; j++) {
      if (candles[i-j].high >= candles[i].high || candles[i+j].high >= candles[i].high) isH = false;
      if (candles[i-j].low  <= candles[i].low  || candles[i+j].low  <= candles[i].low)  isL = false;
    }
    if (isH) pivotHighs.push({ idx: i, price: candles[i].high });
    if (isL) pivotLows.push({ idx: i, price: candles[i].low  });
  }

  // ── BOS / CHoCH ──────────────────────────────────────────────────────────
  const allBreaks = [];
  for (const ph of pivotHighs) {
    for (let j = ph.idx + 1; j < n; j++) {
      if (candles[j].close > ph.price) {
        allBreaks.push({ type: 'bull', price: ph.price, idx: ph.idx, breakIdx: j });
        break;
      }
    }
  }
  for (const pl of pivotLows) {
    for (let j = pl.idx + 1; j < n; j++) {
      if (candles[j].close < pl.price) {
        allBreaks.push({ type: 'bear', price: pl.price, idx: pl.idx, breakIdx: j });
        break;
      }
    }
  }
  allBreaks.sort((a, b) => a.breakIdx - b.breakIdx);

  // Assign CHoCH vs BOS via majority vote of last 3 breaks (noise resistant)
  for (let i = 0; i < allBreaks.length; i++) {
    const brk = allBreaks[i];
    if (i === 0) { brk.isCHoCH = false; continue; }
    const lookback = allBreaks.slice(Math.max(0, i - 3), i);
    const bearCount = lookback.filter(b => b.type === 'bear').length;
    const bullCount = lookback.filter(b => b.type === 'bull').length;
    if (bearCount === bullCount) {
      brk.isCHoCH = allBreaks[i - 1].type !== brk.type;
    } else {
      const dominantTrend = bearCount > bullCount ? 'bear' : 'bull';
      brk.isCHoCH = brk.type !== dominantTrend;
    }
  }

  // Show unbroken BOS + all CHoCH (trend reversals always significant)
  const lastClose = candles[n - 1].close;
  const recentBreaks = allBreaks.slice(-15).filter(bos => {
    if (bos.isCHoCH) return true;
    const sliceAfterBreak = candles.slice(bos.breakIdx + 1);
    if (bos.type === 'bull') return !sliceAfterBreak.some(c => c.close < bos.price);
    return !sliceAfterBreak.some(c => c.close > bos.price);
  }).slice(-5); // Keep chart clean by showing max 5 recent structural bounds

  // ── Order Blocks ─────────────────────────────────────────────────────────
  const rawOBs  = [];
  const seenOBs = new Set();
  for (const bos of allBreaks.slice(-20)) {
    const pivotI = bos.idx;
    for (let i = pivotI - 1; i >= Math.max(0, pivotI - 20); i--) {
      const c          = candles[i];
      const isBullBar  = c.close >= c.open;
      const isOpposite = (bos.type === 'bull' && !isBullBar) || (bos.type === 'bear' && isBullBar);
      if (!isOpposite) continue;
      const key = `${bos.type}_${Math.round(c.high)}_${Math.round(c.low)}`;
      if (seenOBs.has(key)) break;
      seenOBs.add(key);
      const slice     = candles.slice(bos.breakIdx);
      const mitigated = bos.type === 'bull'
        ? slice.some(cc => cc.close < c.low)
        : slice.some(cc => cc.close > c.high);
      if (!mitigated) rawOBs.push({ bias: bos.type, high: c.high, low: c.low, barIdx: i });
      break;
    }
  }
  const bullOBs = rawOBs.filter(o => o.bias === 'bull' && o.low  <= lastClose).sort((a, b) => b.high - a.high).slice(0, 3);
  const bearOBs = rawOBs.filter(o => o.bias === 'bear' && o.high >= lastClose).sort((a, b) => a.low  - b.low).slice(0, 3);

  // ── FVGs ─────────────────────────────────────────────────────────────────
  const rawFVGs = [];
  for (let i = 2; i < n - 1; i++) {
    const prev = candles[i - 2], curr = candles[i];
    if (curr.low > prev.high) {
      if ((curr.low - prev.high) / prev.high * 100 < 0.20) continue;
      if (!candles.slice(i + 1).some(c => c.low <= prev.high))
        rawFVGs.push({ type: 'bull', high: curr.low, low: prev.high, startIdx: i - 1 });
    }
    if (curr.high < prev.low) {
      if ((prev.low - curr.high) / curr.high * 100 < 0.20) continue;
      if (!candles.slice(i + 1).some(c => c.high >= prev.low))
        rawFVGs.push({ type: 'bear', high: prev.low, low: curr.high, startIdx: i - 1 });
    }
  }
  const bullFVGs = rawFVGs.filter(f => f.type === 'bull' && f.low  <= lastClose).sort((a, b) => b.high - a.high).slice(0, 1);
  const bearFVGs = rawFVGs.filter(f => f.type === 'bear' && f.high >= lastClose).sort((a, b) => a.low  - b.low).slice(0, 1);

  return { bosLevels: recentBreaks, orderBlocks: [...bullOBs, ...bearOBs], fvgs: [...bullFVGs, ...bearFVGs] };
}
