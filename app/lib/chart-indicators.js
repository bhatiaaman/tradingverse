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
  // Pivot strength: 3 bars each side — catches more pivots on 5m/15m without too much noise
  const STR = 3;
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
  }).slice(-8); // Show up to 8 recent structural levels

  // ── Order Blocks ─────────────────────────────────────────────────────────
  // OB = last opposite-direction candle at the origin of the impulsive move that broke structure.
  // Mitigated = median price traded through.
  const rawOBs  = [];
  const seenOBs = new Set();
  for (const bos of allBreaks) {
    let originIdx = bos.idx;
    if (bos.type === 'bear') {
      let maxH = -Infinity;
      for (let k = bos.idx; k <= bos.breakIdx; k++) {
        if (candles[k].high > maxH) { maxH = candles[k].high; originIdx = k; }
      }
    } else {
      let minL = Infinity;
      for (let k = bos.idx; k <= bos.breakIdx; k++) {
        if (candles[k].low < minL) { minL = candles[k].low; originIdx = k; }
      }
    }

    // Look backward from the extreme to find the OB
    for (let i = originIdx; i >= Math.max(0, originIdx - 15); i--) {
      const c         = candles[i];
      const isBullBar = c.close >= c.open;
      const isOpposite = (bos.type === 'bull' && !isBullBar) || (bos.type === 'bear' && isBullBar);
      if (!isOpposite) continue;
      
      const key = `${bos.type}_${i}`;
      if (seenOBs.has(key)) { break; }
      seenOBs.add(key);
      
      const slice     = candles.slice(bos.breakIdx + 1);
      const midPoint  = (c.high + c.low) / 2;
      const mitigated = bos.type === 'bull'
        ? slice.some(cc => cc.low < midPoint)
        : slice.some(cc => cc.high > midPoint);
        
      if (!mitigated) {
        rawOBs.push({ bias: bos.type, high: c.high, low: c.low, barIdx: i });
      }
      break;
    }
  }
  // Show the most recent unmitigated OBs (up to 3)
  const bullOBs = rawOBs
    .filter(o => o.bias === 'bull')
    .sort((a, b) => b.barIdx - a.barIdx)
    .slice(0, 3);
  const bearOBs = rawOBs
    .filter(o => o.bias === 'bear')
    .sort((a, b) => b.barIdx - a.barIdx)
    .slice(0, 3);

  // ── FVGs — only significant gaps (≥0.05%), hide tiny ones ─────────────────
  const rawFVGs = [];
  for (let i = 2; i < n - 1; i++) {
    const prev = candles[i - 2], curr = candles[i];
    if (curr.low > prev.high) {
      if ((curr.low - prev.high) / prev.high * 100 < 0.05) continue; // lowered from 0.50
      if (!candles.slice(i + 1).some(c => c.low <= prev.high))
        rawFVGs.push({ type: 'bull', high: curr.low, low: prev.high, startIdx: i - 1 });
    }
    if (curr.high < prev.low) {
      if ((prev.low - curr.high) / curr.high * 100 < 0.05) continue; // lowered from 0.50
      if (!candles.slice(i + 1).some(c => c.high >= prev.low))
        rawFVGs.push({ type: 'bear', high: prev.low, low: curr.high, startIdx: i - 1 });
    }
  }
  // Only the most recent unmitigated FVG on each side
  const bullFVGs = rawFVGs.filter(f => f.type === 'bull').sort((a, b) => b.startIdx - a.startIdx).slice(0, 1);
  const bearFVGs = rawFVGs.filter(f => f.type === 'bear').sort((a, b) => b.startIdx - a.startIdx).slice(0, 1);

  return { bosLevels: recentBreaks, orderBlocks: [...bullOBs, ...bearOBs], fvgs: [...bullFVGs, ...bearFVGs] };
}

// ── ADX (Average Directional Index) ──────────────────────────────────────────
// Returns { adx[], plusDI[], minusDI[] } all aligned to candles.length (null during warmup).
// Uses Wilder's smoothing — same method as ATR/RSI.
export function computeADX(candles, period = 14) {
  const n     = candles.length;
  const adx    = new Array(n).fill(null);
  const plusDI  = new Array(n).fill(null);
  const minusDI = new Array(n).fill(null);
  if (n < period * 2 + 1) return { adx, plusDI, minusDI };

  // Per-candle TR, +DM, -DM
  const tr  = new Array(n).fill(0);
  const pdm = new Array(n).fill(0);
  const mdm = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr[i]  = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const up   = h - candles[i - 1].high;
    const down = candles[i - 1].low - l;
    pdm[i] = (up > down && up > 0)     ? up   : 0;
    mdm[i] = (down > up && down > 0)   ? down : 0;
  }

  // Wilder initial sums (indices 1..period)
  let sTR  = tr.slice(1, period + 1).reduce((s, v) => s + v, 0);
  let sPDM = pdm.slice(1, period + 1).reduce((s, v) => s + v, 0);
  let sMDM = mdm.slice(1, period + 1).reduce((s, v) => s + v, 0);

  const dxArr = new Array(n).fill(null);

  // First DI pair at index `period`
  const _pdi0 = sTR > 0 ? 100 * sPDM / sTR : 0;
  const _mdi0 = sTR > 0 ? 100 * sMDM / sTR : 0;
  plusDI[period]  = parseFloat(_pdi0.toFixed(2));
  minusDI[period] = parseFloat(_mdi0.toFixed(2));
  dxArr[period]   = (_pdi0 + _mdi0) > 0 ? 100 * Math.abs(_pdi0 - _mdi0) / (_pdi0 + _mdi0) : 0;

  for (let i = period + 1; i < n; i++) {
    sTR  = sTR  - sTR  / period + tr[i];
    sPDM = sPDM - sPDM / period + pdm[i];
    sMDM = sMDM - sMDM / period + mdm[i];
    const pdi = sTR > 0 ? 100 * sPDM / sTR : 0;
    const mdi = sTR > 0 ? 100 * sMDM / sTR : 0;
    plusDI[i]  = parseFloat(pdi.toFixed(2));
    minusDI[i] = parseFloat(mdi.toFixed(2));
    dxArr[i]   = (pdi + mdi) > 0 ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
  }

  // ADX = Wilder smooth of DX; seed = avg of first `period` DX values (indices period..2*period-1)
  let adxVal = dxArr.slice(period, period * 2).reduce((s, v) => s + (v || 0), 0) / period;
  adx[period * 2 - 1] = parseFloat(adxVal.toFixed(2));
  for (let i = period * 2; i < n; i++) {
    adxVal = (adxVal * (period - 1) + (dxArr[i] || 0)) / period;
    adx[i] = parseFloat(adxVal.toFixed(2));
  }

  return { adx, plusDI, minusDI };
}

// ── Ichimoku Cloud ────────────────────────────────────────────────────────────
export function computeIchimoku(candles, tenkanPeriod = 9, kijunPeriod = 26, senkouPeriod = 52, displacement = 26) {
  const n = candles.length;
  if (n === 0) return [];
  
  // We return data up to n + displacement - 1 to accommodate the future Senkou spans
  const outLen = n + displacement - 1;
  const out = Array.from({ length: outLen }, (_, i) => ({
    time: i < n ? candles[i].time : null, // The renderer relies primarily on index
    tenkan: null,
    kijun: null,
    senkouA: null,
    senkouB: null,
    chikou: null,
  }));

  const calcExtremes = (start, end) => {
    let hi = -Infinity, lo = Infinity;
    for (let i = start; i <= end; i++) {
        if (candles[i].high > hi) hi = candles[i].high;
        if (candles[i].low < lo) lo = candles[i].low;
    }
    return { hi, lo };
  };

  for (let i = 0; i < n; i++) {
    // Tenkan-sen (Conversion Line)
    if (i >= tenkanPeriod - 1) {
      const { hi, lo } = calcExtremes(i - tenkanPeriod + 1, i);
      out[i].tenkan = parseFloat(((hi + lo) / 2).toFixed(2));
    }
    
    // Kijun-sen (Base Line)
    if (i >= kijunPeriod - 1) {
      const { hi, lo } = calcExtremes(i - kijunPeriod + 1, i);
      out[i].kijun = parseFloat(((hi + lo) / 2).toFixed(2));
    }
    
    // Senkou Span A (Leading Span A, plotted 26 bars ahead)
    if (out[i].tenkan !== null && out[i].kijun !== null) {
      const sa = (out[i].tenkan + out[i].kijun) / 2;
      const targetIdx = i + displacement - 1;
      if (targetIdx < outLen) out[targetIdx].senkouA = parseFloat(sa.toFixed(2));
    }
    
    // Senkou Span B (Leading Span B, plotted 26 bars ahead)
    if (i >= senkouPeriod - 1) {
      const { hi, lo } = calcExtremes(i - senkouPeriod + 1, i);
      const sb = (hi + lo) / 2;
      const targetIdx = i + displacement - 1;
      if (targetIdx < outLen) out[targetIdx].senkouB = parseFloat(sb.toFixed(2));
    }
    
    // Chikou Span (Lagging Span, plotted 26 bars behind)
    const backIdx = i - displacement + 1;
    if (backIdx >= 0) {
      out[backIdx].chikou = candles[i].close;
    }
  }

  return out;
}
