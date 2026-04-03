'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Nav from '../../components/Nav';
import { createChart } from '../../lib/chart/Chart';
import DrawingToolbar from '../../components/DrawingToolbar';
import OrderModal from '../../components/OrderModal';
import { nseStrikeSteps } from '../../lib/nseStrikeSteps';

// ── Constants ─────────────────────────────────────────────────────────────────
const INTERVALS = [
  { value: 'minute',   label: '1m'  },
  { value: '5minute',  label: '5m'  },
  { value: '15minute', label: '15m' },
];

const IST_OFFSET_S = 5.5 * 3600;
const RSI_MIN_H = 50;
const RSI_MAX_H = 240;
const SETTINGS_KEY = 'tv_chart_settings'; // shared with chart/page.js

const EMA_COLORS = { ema9: '#22d3ee', ema21: '#f97316', ema50: '#a78bfa', ema9D: '#e879f9' };

const OVERLAY_DEFS = [
  { key: 'vwap',   label: 'VWAP',                 color: '#f59e0b' },
  { key: 'orBand', label: 'OR Band',               color: '#3b82f6' },
  { key: 'ema9',   label: 'EMA 9',                 color: EMA_COLORS.ema9  },
  { key: 'ema21',  label: 'EMA 21',                color: EMA_COLORS.ema21 },
  { key: 'ema50',  label: 'EMA 50',                color: EMA_COLORS.ema50 },
  { key: 'ema9D',  label: 'EMA 9 Daily',           color: EMA_COLORS.ema9D },
  { key: 'volume', label: 'Volume',                color: '#475569' },
  { key: 'smc',    label: 'SMC  (BOS · OB · FVG)', color: '#6366f1' },
  { key: 'cpr',    label: 'CPR  (TC · P · BC)',     color: '#6366f1' },
  { key: 'bb',     label: 'Bollinger Bands',        color: '#2962ff', hasParams: true },
  { key: 'rsi',    label: 'RSI',                    color: '#818cf8', hasParams: true },
];

const DEFAULT_OVERLAYS = {
  vwap: false, orBand: true, ema9: true, ema21: true, ema50: false,
  ema9D: true, volume: true, smc: false, cpr: false, bb: false, rsi: false,
};

// ── Compute helpers (mirrors chart/page.js) ───────────────────────────────────
function computeVWAP(candles) {
  let cumTPV = 0, cumVol = 0;
  return candles.map(c => {
    const tp = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1;
    cumTPV += tp * vol; cumVol += vol;
    return { time: c.time, value: parseFloat((cumTPV / cumVol).toFixed(2)) };
  });
}

function computeEMA(candles, period) {
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

function computeRSI(candles, period) {
  const out = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d >= 0) gainSum += d; else lossSum -= d;
  }
  let avgGain = gainSum / period, avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(0, d))  / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    out[i]  = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function computeSMAAligned(values, period) {
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

function computeBB(candles, length = 20, mult = 2.0) {
  const n = candles.length;
  if (n < length) return null;
  const basis = new Array(n).fill(null), upper = new Array(n).fill(null), lower = new Array(n).fill(null);
  for (let i = length - 1; i < n; i++) {
    const slice = candles.slice(i - length + 1, i + 1);
    const mean = slice.reduce((s, c) => s + c.close, 0) / length;
    const sd = Math.sqrt(slice.reduce((s, c) => s + (c.close - mean) ** 2, 0) / length);
    basis[i] = parseFloat(mean.toFixed(2));
    upper[i] = parseFloat((mean + mult * sd).toFixed(2));
    lower[i] = parseFloat((mean - mult * sd).toFixed(2));
  }
  return { basis, upper, lower };
}

function computeSMC(candles) {
  const n = candles.length, STR = 2;
  if (n < STR * 2 + 5) return null;
  const pivotHighs = [], pivotLows = [];
  for (let i = STR; i < n - STR; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= STR; j++) {
      if (candles[i-j].high >= candles[i].high || candles[i+j].high >= candles[i].high) isH = false;
      if (candles[i-j].low  <= candles[i].low  || candles[i+j].low  <= candles[i].low)  isL = false;
    }
    if (isH) pivotHighs.push({ idx: i, price: candles[i].high });
    if (isL) pivotLows.push({ idx: i, price: candles[i].low });
  }
  const allBreaks = [];
  for (const ph of pivotHighs) for (let j = ph.idx + 1; j < n; j++) { if (candles[j].close > ph.price) { allBreaks.push({ type: 'bull', price: ph.price, idx: ph.idx, breakIdx: j }); break; } }
  for (const pl of pivotLows)  for (let j = pl.idx + 1; j < n; j++) { if (candles[j].close < pl.price) { allBreaks.push({ type: 'bear', price: pl.price, idx: pl.idx, breakIdx: j }); break; } }
  allBreaks.sort((a, b) => a.breakIdx - b.breakIdx);
  let trendState = null;
  for (const brk of allBreaks) { brk.isCHoCH = trendState !== null && trendState !== brk.type; trendState = brk.type; }
  const lastClose = candles[n - 1].close;
  const rawOBs = [], seenOBs = new Set();
  for (const bos of allBreaks.slice(-14)) {
    for (let i = bos.idx - 1; i >= Math.max(0, bos.idx - 20); i--) {
      const c = candles[i], isBullBar = c.close >= c.open;
      const isOpposite = (bos.type === 'bull' && !isBullBar) || (bos.type === 'bear' && isBullBar);
      if (!isOpposite) continue;
      const key = `${bos.type}_${Math.round(c.high)}_${Math.round(c.low)}`;
      if (seenOBs.has(key)) break; seenOBs.add(key);
      const mitigated = bos.type === 'bull' ? candles.slice(bos.breakIdx).some(cc => cc.close < c.low) : candles.slice(bos.breakIdx).some(cc => cc.close > c.high);
      if (!mitigated) rawOBs.push({ bias: bos.type, high: c.high, low: c.low, barIdx: i });
      break;
    }
  }
  const bullOBs = rawOBs.filter(o => o.bias === 'bull' && o.low  <= lastClose).sort((a, b) => b.high - a.high).slice(0, 1);
  const bearOBs = rawOBs.filter(o => o.bias === 'bear' && o.high >= lastClose).sort((a, b) => a.low  - b.low).slice(0, 1);
  const rawFVGs = [];
  for (let i = 2; i < n - 1; i++) {
    const prev = candles[i - 2], curr = candles[i];
    if (curr.low > prev.high && (curr.low - prev.high) / prev.high * 100 >= 0.20) { if (!candles.slice(i + 1).some(c => c.low <= prev.high)) rawFVGs.push({ type: 'bull', high: curr.low, low: prev.high, startIdx: i - 1 }); }
    if (curr.high < prev.low && (prev.low - curr.high) / curr.high * 100 >= 0.20) { if (!candles.slice(i + 1).some(c => c.high >= prev.low)) rawFVGs.push({ type: 'bear', high: prev.low, low: curr.high, startIdx: i - 1 }); }
  }
  // Filter to show UNBROKEN BOS and ALL CHoCH (trend reversals)
  const unbrokenBreaks = allBreaks.slice(-15).filter(bos => {
    if (bos.isCHoCH) return true; // Always show CHoCH
    const sliceAfterBreak = candles.slice(bos.breakIdx + 1);
    if (bos.type === 'bull') return !sliceAfterBreak.some(c => c.close < bos.price);
    return !sliceAfterBreak.some(c => c.close > bos.price);
  });
  return { bosLevels: unbrokenBreaks, orderBlocks: [...bullOBs, ...bearOBs], fvgs: [...rawFVGs.filter(f => f.type === 'bull' && f.low <= lastClose).sort((a, b) => b.high - a.high).slice(0, 1), ...rawFVGs.filter(f => f.type === 'bear' && f.high >= lastClose).sort((a, b) => a.low - b.low).slice(0, 1)] };
}

function dateIST(unixSec) { return new Date((unixSec + IST_OFFSET_S) * 1000).toISOString().slice(0, 10); }
function _cprLevels(H, L, C) {
  const P = (H + L + C) / 3, BC = (H + L) / 2, TC = 2 * P - BC, widthPct = P > 0 ? ((TC - BC) / P) * 100 : 0;
  return { tc: TC, p: P, bc: BC, r1: 2*P-L, r2: P+(H-L), s1: 2*P-H, s2: P-(H-L), widthPct, widthClass: widthPct < 0.15 ? 'narrow' : widthPct > 0.35 ? 'wide' : 'normal' };
}
function computeCPR(candles, dailyCandles) {
  if (!candles?.length || !dailyCandles?.length) return [];
  const segments = [];
  let dayStart = 0, currentDate = dateIST(candles[0].time);
  for (let i = 1; i <= candles.length; i++) {
    const isLast = i === candles.length, d = isLast ? null : dateIST(candles[i].time);
    if (isLast || d !== currentDate) {
      let prevIdx = -1;
      for (let j = dailyCandles.length - 1; j >= 0; j--) { if (dateIST(dailyCandles[j].time) < currentDate) { prevIdx = j; break; } }
      if (prevIdx >= 0) { const prev = dailyCandles[prevIdx]; segments.push({ startIdx: dayStart, endIdx: i - 1, ..._cprLevels(prev.high, prev.low, prev.close) }); }
      currentDate = d; dayStart = i;
    }
  }
  return segments;
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
function p2(v) { return v != null ? v.toFixed(2) : '—'; }
function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e7) return (v / 1e7).toFixed(1) + 'Cr';
  if (v >= 1e5) return (v / 1e5).toFixed(1) + 'L';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(v);
}
function fmtPx(v) {
  if (v == null) return '—';
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── OptionChartPanel ──────────────────────────────────────────────────────────
const OptionChartPanel = forwardRef(function OptionChartPanel(
  { symbol, strike, expiry, type, interval, overlays, rsiSettings, bbSettings, candleColors, rsiHeight, onRsiDragStart, onCrosshairIndex, expiryType },
  ref
) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const chartCreatedForRef = useRef({ el: null, interval: null });
  const candlesRef   = useRef(null);
  const dailyCandlesRef = useRef(null);
  const tradingSymbolRef = useRef(null);

  const [loading,        setLoading]        = useState(true);
  const [err,            setErr]            = useState(null);
  const [info,           setInfo]           = useState(null);
  const [hoverData,      setHoverData]      = useState(null);
  const [lastPriceY,     setLastPriceY]     = useState(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [activeTool,     setActiveTool]     = useState(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);

  // Keep latest prop values accessible in async / effect callbacks
  const overlaysRef    = useRef(overlays);
  const rsiSettingsRef = useRef(rsiSettings);
  const bbSettingsRef  = useRef(bbSettings);
  const candleColorsRef = useRef(candleColors);
  const rsiHeightRef   = useRef(rsiHeight);
  useEffect(() => { overlaysRef.current = overlays; },       [overlays]);
  useEffect(() => { rsiSettingsRef.current = rsiSettings; }, [rsiSettings]);
  useEffect(() => { bbSettingsRef.current = bbSettings; },   [bbSettings]);
  useEffect(() => { candleColorsRef.current = candleColors; }, [candleColors]);
  useEffect(() => { rsiHeightRef.current = rsiHeight; },     [rsiHeight]);

  useImperativeHandle(ref, () => ({
    setCrosshairAt(idx) { chartRef.current?.setCrosshairAt(idx); },
    clearCrosshair()    { chartRef.current?.clearCrosshair();    },
    setRSIPaneHeight(h) { chartRef.current?.setRSIPaneHeight(h); },
  }), []);

  // Drawing key — shared with chart/page.js where tradingSymbol is the same
  const drawingKey = (ts, iv) => `tv_drawings_${ts}_${iv}`;

  // ── Sync active tool ───────────────────────────────────────────────────────
  useEffect(() => { chartRef.current?.setActiveTool(activeTool ?? null); }, [activeTool]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && activeTool) { chartRef.current?.cancelDrawing(); setActiveTool(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
        chartRef.current?.deleteDrawing(selectedDrawingId);
        setSelectedDrawingId(null);
        const ts = candlesRef.current && info?.tradingSymbol;
        if (ts) try { localStorage.setItem(drawingKey(ts, interval), JSON.stringify(chartRef.current?.getDrawings() ?? [])); } catch {}
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTool, selectedDrawingId, interval, info?.tradingSymbol]);

  // ── Full overlay application ───────────────────────────────────────────────
  const applyOverlays = useCallback((chart, candles, dailyCandles) => {
    if (!chart || !candles?.length) return;
    const ov  = overlaysRef.current;
    const rsiS = rsiSettingsRef.current;
    const bbS  = bbSettingsRef.current;
    const cc   = candleColorsRef.current;
    const rsiH = rsiHeightRef.current;

    // VWAP — last session only
    if (ov.vwap) {
      const lastDate = new Date((candles[candles.length - 1].time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10);
      const sess = candles.filter(c => new Date((c.time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10) === lastDate);
      chart.setLine('vwap', { data: computeVWAP(sess.length ? sess : candles.slice(-1)), color: '#f59e0b', width: 2 });
    } else { chart.clearLine('vwap'); }

    // OR Band
    if (ov.orBand && candles.length >= 1) {
      const lastDate = new Date((candles[candles.length - 1].time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10);
      const dayStart = candles.findIndex(c => new Date((c.time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10) === lastDate);
      const orC = candles[dayStart >= 0 ? dayStart : 0];
      chart.setZone({ id: 'or_high', price: orC.high, color: 'rgba(96,165,250,0.8)',  label: 'OR H', style: 'dashed', inline: true });
      chart.setZone({ id: 'or_low',  price: orC.low,  color: 'rgba(96,165,250,0.8)',  label: 'OR L', style: 'dashed', inline: true });
    } else { chart.clearZone('or_high'); chart.clearZone('or_low'); }

    // EMAs
    if (ov.ema9)  chart.setLine('ema9',  { data: computeEMA(candles, 9),  color: EMA_COLORS.ema9,  width: 2 }); else chart.clearLine('ema9');
    if (ov.ema21) chart.setLine('ema21', { data: computeEMA(candles, 21), color: EMA_COLORS.ema21, width: 2 }); else chart.clearLine('ema21');
    if (ov.ema50) chart.setLine('ema50', { data: computeEMA(candles, 50), color: EMA_COLORS.ema50, width: 2 }); else chart.clearLine('ema50');

    // EMA 9 Daily flat line (option charts are always intraday)
    if (ov.ema9D && dailyCandles?.length >= 9) {
      const val = computeEMA(dailyCandles, 9).at(-1)?.value;
      if (val) chart.setZone({ id: 'ema9d', price: val, color: 'rgba(232,121,249,0.85)', label: 'D·EMA9', style: 'solid', width: 2.5, inline: true });
    } else { chart.clearZone('ema9d'); }

    // SMC
    if (ov.smc && candles.length > 10) {
      const smc = computeSMC(candles);
      if (smc) chart.setSMC(smc); else chart.clearSMC();
    } else { chart.clearSMC(); }

    // CPR
    if (ov.cpr && dailyCandles?.length) {
      const segs = computeCPR(candles, dailyCandles);
      chart.setCPR(segs.length ? segs : null);
    } else { chart.clearCPR(); }

    // Bollinger Bands
    if (ov.bb && candles.length >= (bbS.length ?? 20)) {
      chart.setBB(computeBB(candles, bbS.length ?? 20, bbS.mult ?? 2.0));
    } else { chart.clearBB(); }

    // Candle colors + volume
    chart.setCandleColors({ bull: cc.bull, bear: cc.bear });
    chart.setShowVolume(ov.volume);

    // RSI
    if (ov.rsi && candles.length > (rsiS.period ?? 12) + 1) {
      const rsi = computeRSI(candles, rsiS.period ?? 12);
      const rsiMA = (rsiS.maPeriod ?? 5) >= 2 ? computeSMAAligned(rsi, rsiS.maPeriod) : null;
      const lbl = (rsiS.maPeriod ?? 5) >= 2 ? `RSI(${rsiS.period},${rsiS.maPeriod})` : `RSI(${rsiS.period})`;
      chart.setRSIPane(rsi, rsiMA, lbl);
      chart.setRSIPaneHeight(rsiH);
    } else { chart.clearRSIPane(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch candles & build chart ────────────────────────────────────────────
  useEffect(() => {
    if (!symbol || !strike || !expiry || !type) return;
    let cancelled = false;

    async function load() {
      setLoading(true); setErr(null); setInfo(null); setHoverData(null);
      candlesRef.current = null; dailyCandlesRef.current = null;

      const tsRes  = await fetch(`/api/option-meta?action=tradingsymbol&symbol=${symbol}&expiry=${expiry}&strike=${strike}&type=${type}`);
      const tsData = await tsRes.json();
      if (cancelled) return;
      if (!tsRes.ok || !tsData.tradingSymbol) { setErr(tsData.error || 'Symbol not found'); setLoading(false); return; }

      const kiteTs = tsData.tradingSymbol;
      tradingSymbolRef.current = kiteTs;
      const [cdData, ddData] = await Promise.all([
        fetch(`/api/chart-data?symbol=${encodeURIComponent(kiteTs)}&interval=${interval}`).then(r => r.json()),
        fetch(`/api/chart-data?symbol=${encodeURIComponent(kiteTs)}&interval=day&days=365`).then(r => r.json()).catch(() => ({ candles: [] })),
      ]);
      if (cancelled) return;
      if (cdData.error) { setErr(cdData.error); setLoading(false); return; }
      if (!cdData.candles?.length) { setErr('No data'); setLoading(false); return; }

      const candles = cdData.candles;
      const dailyCandles = ddData.candles || [];
      candlesRef.current = candles;
      dailyCandlesRef.current = dailyCandles;

      setInfo({ ltp: candles[candles.length - 1].close, open: candles[0].open, tradingSymbol: kiteTs });
      setLoading(false);

      const el = containerRef.current;
      if (!el) return;

      // Always recreate on new load (symbol/expiry/strike/type changed)
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

      const chart = createChart(el, { interval });
      chartRef.current = chart;
      chartCreatedForRef.current = { el, interval };

      chart.onCrosshairMove(data => {
        if (data) {
          setHoverData({ bar: data.bar, lineValues: data.lineValues });
          onCrosshairIndex?.(data.index);
        } else {
          setHoverData(null);
          onCrosshairIndex?.(null);
        }
      });
      chart.onLastPriceY(y => setLastPriceY(y));
      chart.onDrawingSelect(id => setSelectedDrawingId(id ?? null));

      chart.setCandles(candles);

      // Restore drawings
      try {
        const saved = localStorage.getItem(drawingKey(kiteTs, interval));
        if (saved) chart.setDrawings(JSON.parse(saved));
      } catch {}

      chart.onDrawingComplete((_, all) => {
        try { localStorage.setItem(drawingKey(kiteTs, interval), JSON.stringify(all)); } catch {}
      });

      if (activeTool) chart.setActiveTool(activeTool);
      applyOverlays(chart, candles, dailyCandles);
      setHoverData({ bar: candles[candles.length - 1], lineValues: {} });
    }

    load().catch(e => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => {
      cancelled = true;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [symbol, strike, expiry, type, interval]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-apply overlays when settings change (no chart recreation) ───────────
  useEffect(() => {
    if (!chartRef.current || !candlesRef.current) return;
    applyOverlays(chartRef.current, candlesRef.current, dailyCandlesRef.current);
  }, [overlays, rsiSettings, bbSettings, candleColors, rsiHeight, applyOverlays]);

  // ── Poll for candle updates (incremental, no chart recreation) ───────────────
  // Fetch latest candles every 5 seconds and update chart without full redraw
  useEffect(() => {
    if (!chartRef.current || !tradingSymbolRef.current) return;
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/chart-data?symbol=${encodeURIComponent(tradingSymbolRef.current)}&interval=${interval}`);
        const data = await res.json();
        if (data.candles?.length && chartRef.current) {
          candlesRef.current = data.candles;
          chartRef.current.updateCandles(data.candles);  // Incremental update, NOT full recreate
          // Update LTP
          const lastCandle = data.candles[data.candles.length - 1];
          if (lastCandle) {
            setInfo(prev => ({ ...prev, ltp: lastCandle.close }));
          }
        }
      } catch (err) {
        console.error('Chart poll error:', err);
      }
    }, 5000);  // Poll every 5 seconds
    return () => clearInterval(pollInterval);
  }, [interval]);

  // Destroy on unmount
  useEffect(() => {
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, []);

  const color = type === 'CE' ? '#22c55e' : '#ef4444';
  const abs   = info ? info.ltp - info.open : null;
  const pct   = info && info.open ? (abs / info.open * 100) : null;
  const up    = abs != null ? abs >= 0 : null;
  const { bar, lineValues } = hoverData || {};
  const rsiBottom = (overlays.rsi ? rsiHeight + 28 : 0) + 10;

  return (
    <div className="h-full flex flex-col rounded-xl border border-[#1e3a5f] bg-[#0a0e1a] overflow-hidden">

      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e3a5f] bg-[#0d1421] shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold font-mono text-white">{symbol} {strike} {type}</span>
          {info?.tradingSymbol && <span className="text-[10px] text-slate-600 font-mono hidden md:inline">{info.tradingSymbol}</span>}
        </div>
        <div className="flex items-center gap-3 text-sm font-mono shrink-0">
          {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
          {err     && <span className="text-xs text-red-400 truncate max-w-[200px]">{err}</span>}
          {info && !loading && (
            <>
              <span className="text-white font-semibold">{fmtPx(info.ltp)}</span>
              {abs != null && (
                <span className={up ? 'text-green-400' : 'text-red-400'}>
                  {up ? '+' : ''}{abs.toFixed(2)} ({up ? '+' : ''}{pct.toFixed(2)}%)
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chart canvas */}
      <div className="relative flex-1 min-h-0 w-full">
        <div ref={containerRef} className="w-full h-full" />

        {/* Drawing toolbar */}
        <DrawingToolbar
          activeTool={activeTool}
          onToolSelect={setActiveTool}
          selectedDrawingId={selectedDrawingId}
          onDeleteSelected={() => {
            if (!selectedDrawingId) return;
            chartRef.current?.deleteDrawing(selectedDrawingId);
            setSelectedDrawingId(null);
            const ts = info?.tradingSymbol;
            if (ts) try { localStorage.setItem(drawingKey(ts, interval), JSON.stringify(chartRef.current?.getDrawings() ?? [])); } catch {}
          }}
          onClearAll={() => {
            chartRef.current?.clearDrawings();
            setSelectedDrawingId(null);
            const ts = info?.tradingSymbol;
            if (ts) try { localStorage.removeItem(drawingKey(ts, interval)); } catch {}
          }}
        />

        {/* OHLCV + indicator values */}
        {bar && (
          <div className="absolute top-2 left-14 z-10 pointer-events-none">
            <div className="flex items-center gap-2.5 text-[11px] font-mono">
              <span className="text-slate-500">O <span className="text-slate-200">{p2(bar.open)}</span></span>
              <span className="text-slate-500">H <span className="text-green-400">{p2(bar.high)}</span></span>
              <span className="text-slate-500">L <span className="text-red-400">{p2(bar.low)}</span></span>
              <span className="text-slate-500">C <span className={bar.close >= bar.open ? 'text-green-300' : 'text-red-300'}>{p2(bar.close)}</span></span>
              <span className="text-slate-500">V <span className="text-slate-400">{fmtVol(bar.volume)}</span></span>
              {overlays.vwap  && lineValues?.vwap  != null && <span style={{ color: '#f59e0b' }}>VWAP {p2(lineValues.vwap)}</span>}
              {overlays.ema9  && lineValues?.ema9  != null && <span style={{ color: EMA_COLORS.ema9  }}>EMA9 {p2(lineValues.ema9)}</span>}
              {overlays.ema21 && lineValues?.ema21 != null && <span style={{ color: EMA_COLORS.ema21 }}>EMA21 {p2(lineValues.ema21)}</span>}
              {overlays.ema50 && lineValues?.ema50 != null && <span style={{ color: EMA_COLORS.ema50 }}>EMA50 {p2(lineValues.ema50)}</span>}
            </div>
          </div>
        )}

        {/* RSI drag handle */}
        {overlays.rsi && (
          <div
            className="absolute left-0 z-20 hover:bg-blue-500/15 transition-colors cursor-row-resize flex items-center justify-center"
            style={{ right: 74, bottom: rsiBottom - 4, height: 6 }}
            onMouseDown={onRsiDragStart}
          >
            <div className="w-8 h-0.5 rounded-full bg-slate-700 pointer-events-none" />
          </div>
        )}

        {/* Order entry button */}
        {lastPriceY !== null && (
          <button
            onClick={() => setOrderModalOpen(true)}
            style={{ top: lastPriceY - 11, right: 80 }}
            className="absolute z-20 w-[22px] h-[22px] rounded-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 border border-indigo-400/60 shadow-lg flex items-center justify-center text-white text-sm font-bold leading-none transition-colors"
            title={`Place order — ${symbol} ${strike} ${type}`}
          >+</button>
        )}
      </div>

      <OrderModal
        isOpen={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        symbol={symbol}
        price={strike}
        defaultType="BUY"
        optionType={type}
        optionExpiry={expiry}
        optionExpiryType={expiryType}
        onOrderPlaced={() => setOrderModalOpen(false)}
      />
    </div>
  );
});

// ── SymbolCombobox ─────────────────────────────────────────────────────────────
function SymbolCombobox({ symbols, value, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [open,  setOpen]  = useState(false);
  const ref = useRef(null);
  const filtered = (query.length < 1 ? symbols.slice(0, 25) : symbols.filter(s => s.name.includes(query.toUpperCase()))).slice(0, 25);
  useEffect(() => { function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); } document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  useEffect(() => { setQuery(value || ''); }, [value]);
  return (
    <div className="relative" ref={ref}>
      <input className="w-44 bg-[#0d1f3c] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
        placeholder="Symbol…" value={query}
        onChange={e => { setQuery(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => setOpen(true)} />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-48 bg-[#0d1f3c] border border-[#1e3a5f] rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {filtered.map(s => (
            <li key={s.name} className="px-3 py-1.5 text-sm text-slate-300 hover:bg-[#1e3a5f] hover:text-white cursor-pointer font-mono flex justify-between"
              onMouseDown={() => { setQuery(s.name); setOpen(false); onChange(s.name); }}>
              <span>{s.name}</span><span className="text-[10px] text-slate-500">±{s.strikeGap}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
function OptionsChartInner() {
  const params = useSearchParams();

  const [symbol,      setSymbol]      = useState(params.get('symbol')   || 'NIFTY');
  const [expiry,      setExpiry]      = useState(params.get('expiry')   || '');
  const [strike,      setStrike]      = useState(null);  // Never init from URL — wait for strikes validation
  const [interval,    setInterval]    = useState(params.get('interval') || '5minute');
  const [layout,      setLayout]      = useState('vertical');
  const [singleType,  setSingleType]  = useState('CE');

  // ── Shared overlay/indicator settings ─────────────────────────────────────
  const [overlays, setOverlays] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        vwap:   saved.showVwap   ?? DEFAULT_OVERLAYS.vwap,
        orBand: saved.showOrBand ?? DEFAULT_OVERLAYS.orBand,
        ema9:   saved.showEma9   ?? DEFAULT_OVERLAYS.ema9,
        ema21:  saved.showEma21  ?? DEFAULT_OVERLAYS.ema21,
        ema50:  saved.showEma50  ?? DEFAULT_OVERLAYS.ema50,
        ema9D:  saved.showEma9D  ?? DEFAULT_OVERLAYS.ema9D,
        volume: saved.showVolume ?? DEFAULT_OVERLAYS.volume,
        smc:    saved.showSMC    ?? DEFAULT_OVERLAYS.smc,
        cpr:    saved.showCPR    ?? DEFAULT_OVERLAYS.cpr,
        bb:     saved.showBB     ?? DEFAULT_OVERLAYS.bb,
        rsi:    saved.showRSI    ?? DEFAULT_OVERLAYS.rsi,
      };
    } catch { return DEFAULT_OVERLAYS; }
  });
  const [rsiSettings,   setRsiSettings]   = useState(() => { try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); return { period: s.rsiPeriod ?? 12, maPeriod: s.rsiMAPeriod ?? 5 }; } catch { return { period: 12, maPeriod: 5 }; } });
  const [bbSettings,    setBbSettings]    = useState(() => { try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); return { length: s.bbLength ?? 20, mult: s.bbMult ?? 2.0 }; } catch { return { length: 20, mult: 2.0 }; } });
  const [candleColors,  setCandleColors]  = useState(() => { try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); return { bull: s.bullColor ?? '#22c55e', bear: s.bearColor ?? '#ef4444' }; } catch { return { bull: '#22c55e', bear: '#ef4444' }; } });
  const [rsiHeight,     setRsiHeight]     = useState(80);
  const [showOverlays,  setShowOverlays]  = useState(false);
  const [overlayPos,    setOverlayPos]    = useState(null);
  const overlayBtnRef  = useRef(null);
  const overlayDropRef = useRef(null);

  const [spotPrice,   setSpotPrice]   = useState(null);
  const [splitRatio,  setSplitRatio]  = useState(0.5);
  const [hSplitRatio, setHSplitRatio] = useState(0.5);
  const [allSymbols,  setAllSymbols]  = useState([]);
  const [expiries,    setExpiries]    = useState([]);
  const [strikes,     setStrikes]     = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingExp,  setLoadingExp]  = useState(false);
  const [loadingStr,  setLoadingStr]  = useState(false);

  const urlStrikeRef    = useRef(params.get('strike') ? Number(params.get('strike')) : null);
  const lastLoadedRef   = useRef(null);
  const chartAreaRef    = useRef(null);
  const cePanelRef      = useRef(null);
  const pePanelRef      = useRef(null);
  const cePanelWrapRef  = useRef(null);
  const pePanelWrapRef  = useRef(null);
  const ceHPanelWrapRef = useRef(null);
  const peHPanelWrapRef = useRef(null);

  const [chartKey, setChartKey] = useState(null);

  // Persist overlay settings to shared key (mirrors chart/page.js key names)
  const persistSettings = (patch = {}) => {
    try {
      const prev = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...prev, ...patch }));
    } catch {}
  };

  const toggleOverlay = (key) => {
    setOverlays(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const MAP = { vwap: 'showVwap', orBand: 'showOrBand', ema9: 'showEma9', ema21: 'showEma21', ema50: 'showEma50', ema9D: 'showEma9D', volume: 'showVolume', smc: 'showSMC', cpr: 'showCPR', bb: 'showBB', rsi: 'showRSI' };
      persistSettings({ [MAP[key]]: next[key] });
      return next;
    });
  };

  // Click outside overlay dropdown
  useEffect(() => {
    if (!showOverlays) return;
    const h = e => {
      if (overlayDropRef.current && !overlayDropRef.current.contains(e.target) &&
          overlayBtnRef.current  && !overlayBtnRef.current.contains(e.target)) setShowOverlays(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showOverlays]);

  const openOverlayDropdown = () => {
    if (showOverlays) { setShowOverlays(false); return; }
    const rect = overlayBtnRef.current.getBoundingClientRect();
    setOverlayPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setShowOverlays(true);
  };

  // ── Meta fetching ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/option-meta?action=symbols').then(r => r.json()).then(d => { if (d.symbols) setAllSymbols(d.symbols); }).catch(() => {}).finally(() => setLoadingMeta(false));
  }, []);

  useEffect(() => {
    if (!symbol) return;
    lastLoadedRef.current = null;
    setExpiry(''); setStrike(null); setStrikes([]); setExpiries([]); setLoadingExp(true);
    fetch(`/api/option-meta?action=expiries&symbol=${symbol}`).then(r => r.json()).then(d => {
      if (d.expiries?.length) { setExpiries(d.expiries); const urlExp = params.get('expiry'); setExpiry(d.expiries.find(e => e.date === urlExp) ? urlExp : d.expiries[0].date); }
    }).catch(() => {}).finally(() => setLoadingExp(false));
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!symbol || !expiry) return;
    setStrike(null); setStrikes([]); setLoadingStr(true);

    function pickATM(list, spot, sym) {
      if (!spot || !list.length) return list[Math.floor(list.length / 2)] ?? null;
      // Snap spot to nearest valid step, then find closest real strike in the list
      const step = nseStrikeSteps[sym] ?? (spot >= 5000 ? 50 : spot >= 1000 ? 20 : spot >= 500 ? 10 : spot >= 100 ? 5 : 2.5);
      const snapped = Math.round(spot / step) * step;
      // Pick the strike in the list closest to the snapped value
      return list.reduce((p, c) => Math.abs(c - snapped) < Math.abs(p - snapped) ? c : p);
    }

    async function load() {
      // Fetch spot first and set it immediately — don't block strikes on slow spot
      let spotData = { ltp: null };
      try {
        spotData = await fetch(`/api/option-meta?action=spot&symbol=${symbol}`).then(r => r.json());
      } catch {}
      setSpotPrice(spotData.ltp ?? null);

      // Now fetch strikes with spot already available
      const sData = await fetch(`/api/option-meta?action=strikes&symbol=${symbol}&expiry=${expiry}`).then(r => r.json());
      let list = sData.strikes || [];
      // Cache miss — bust and retry once
      if (!list.length) {
        const retry = await fetch(`/api/option-meta?action=strikes&symbol=${symbol}&expiry=${expiry}&bust=1`).then(r => r.json()).catch(() => ({}));
        list = retry.strikes || [];
      }
      setStrikes(list);
      if (!list.length) return;
      const urlStrike = urlStrikeRef.current;
      if (urlStrike && list.includes(urlStrike)) { setStrike(urlStrike); urlStrikeRef.current = null; return; }
      setStrike(pickATM(list, spotData.ltp, symbol));
    }

    load().catch(() => {}).finally(() => setLoadingStr(false));
  }, [symbol, expiry]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!symbol || !expiry || !strike) return;
    if (loadingMeta || loadingExp || loadingStr) return;
    const key = { symbol, expiry, strike, interval }, keyStr = JSON.stringify(key);
    if (lastLoadedRef.current === keyStr) return;
    lastLoadedRef.current = keyStr;
    setChartKey(key);
    const url = new URL(window.location.href);
    Object.entries(key).forEach(([k, v]) => url.searchParams.set(k, v));
    window.history.replaceState({}, '', url.toString());
  }, [symbol, expiry, strike, interval, loadingMeta, loadingExp, loadingStr]);

  // ── Splitter drag handlers ────────────────────────────────────────────────
  function startVDividerDrag(e) {
    e.preventDefault();
    const startY = e.clientY, startR = splitRatio, totalH = chartAreaRef.current?.clientHeight || 600;
    function onMove(me) { const r = Math.max(0.2, Math.min(0.8, startR + (me.clientY - startY) / totalH)); if (cePanelWrapRef.current) cePanelWrapRef.current.style.flex = String(r); if (pePanelWrapRef.current) pePanelWrapRef.current.style.flex = String(1 - r); }
    function onUp(me) { setSplitRatio(Math.max(0.2, Math.min(0.8, startR + (me.clientY - startY) / totalH))); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }
  function startHDividerDrag(e) {
    e.preventDefault();
    const startX = e.clientX, startR = hSplitRatio, totalW = chartAreaRef.current?.clientWidth || 1200;
    function onMove(me) { const r = Math.max(0.2, Math.min(0.8, startR + (me.clientX - startX) / totalW)); if (ceHPanelWrapRef.current) ceHPanelWrapRef.current.style.flex = String(r); if (peHPanelWrapRef.current) peHPanelWrapRef.current.style.flex = String(1 - r); }
    function onUp(me) { setHSplitRatio(Math.max(0.2, Math.min(0.8, startR + (me.clientX - startX) / totalW))); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }
  function makeRsiDragHandler(e) {
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY, startH = rsiHeight;
    function onMove(me) { const h = Math.max(RSI_MIN_H, Math.min(RSI_MAX_H, startH + (startY - me.clientY))); cePanelRef.current?.setRSIPaneHeight(h); pePanelRef.current?.setRSIPaneHeight(h); }
    function onUp(me) { setRsiHeight(Math.max(RSI_MIN_H, Math.min(RSI_MAX_H, startH + (startY - me.clientY)))); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }

  const expiryObj = expiries.find(e => e.date === expiry);
  const expiryType = expiryObj?.isMonthly ? 'monthly' : 'weekly';

  const panelProps = chartKey ? {
    symbol: chartKey.symbol, strike: chartKey.strike, expiry: chartKey.expiry,
    interval: chartKey.interval, overlays, rsiSettings, bbSettings, candleColors,
    rsiHeight, onRsiDragStart: makeRsiDragHandler, expiryType,
  } : null;

  function renderCharts() {
    if (!chartKey || !panelProps) return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 opacity-10">📈</div>
          <p className="text-slate-500 text-sm">Select symbol, expiry and strike above</p>
        </div>
      </div>
    );
    const ceKey = `ce-${chartKey.symbol}-${chartKey.expiry}-${chartKey.strike}-${chartKey.interval}`;
    const peKey = `pe-${chartKey.symbol}-${chartKey.expiry}-${chartKey.strike}-${chartKey.interval}`;

    if (layout === 'single') return (
      <div className="h-full flex flex-col gap-2">
        <div className="flex gap-1 shrink-0">
          {['CE', 'PE'].map(t => (
            <button key={t} onClick={() => setSingleType(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold font-mono transition-colors ${singleType === t ? (t === 'CE' ? 'bg-green-600/30 text-green-400 border border-green-500/50' : 'bg-red-600/30 text-red-400 border border-red-500/50') : 'bg-[#0d1f3c] text-slate-400 border border-[#1e3a5f] hover:text-slate-200'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0">
          <OptionChartPanel key={`${singleType}-${ceKey.slice(3)}`} ref={singleType === 'CE' ? cePanelRef : pePanelRef} {...panelProps} type={singleType} onCrosshairIndex={null} />
        </div>
      </div>
    );

    if (layout === 'horizontal') return (
      <div ref={chartAreaRef} className="h-full flex">
        <div ref={ceHPanelWrapRef} style={{ flex: hSplitRatio, minWidth: 0, minHeight: 0 }}>
          <OptionChartPanel key={ceKey} ref={cePanelRef} {...panelProps} type="CE" onCrosshairIndex={idx => idx != null ? pePanelRef.current?.setCrosshairAt(idx) : pePanelRef.current?.clearCrosshair()} />
        </div>
        <div className="w-1.5 shrink-0 bg-[#1e3a5f] hover:bg-blue-500/50 transition-colors flex items-center justify-center cursor-col-resize" onMouseDown={startHDividerDrag}>
          <div className="h-8 w-0.5 rounded-full bg-slate-500/40 pointer-events-none" />
        </div>
        <div ref={peHPanelWrapRef} style={{ flex: 1 - hSplitRatio, minWidth: 0, minHeight: 0 }}>
          <OptionChartPanel key={peKey} ref={pePanelRef} {...panelProps} type="PE" onCrosshairIndex={idx => idx != null ? cePanelRef.current?.setCrosshairAt(idx) : cePanelRef.current?.clearCrosshair()} />
        </div>
      </div>
    );

    // Vertical (default)
    return (
      <div ref={chartAreaRef} className="h-full flex flex-col">
        <div ref={cePanelWrapRef} style={{ flex: splitRatio, minHeight: 0 }}>
          <OptionChartPanel key={ceKey} ref={cePanelRef} {...panelProps} type="CE" onCrosshairIndex={idx => idx != null ? pePanelRef.current?.setCrosshairAt(idx) : pePanelRef.current?.clearCrosshair()} />
        </div>
        <div className="h-1.5 shrink-0 bg-[#1e3a5f] hover:bg-blue-500/50 transition-colors flex items-center justify-center cursor-row-resize" onMouseDown={startVDividerDrag}>
          <div className="w-8 h-0.5 rounded-full bg-slate-500/40 pointer-events-none" />
        </div>
        <div ref={pePanelWrapRef} style={{ flex: 1 - splitRatio, minHeight: 0 }}>
          <OptionChartPanel key={peKey} ref={pePanelRef} {...panelProps} type="PE" onCrosshairIndex={idx => idx != null ? cePanelRef.current?.setCrosshairAt(idx) : cePanelRef.current?.clearCrosshair()} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-[#060b14] text-white overflow-hidden">
      <Nav />

      {/* ── Form bar ──────────────────────────────────────────────────────── */}
      <div className="border-b border-[#1e3a5f] bg-[#0a0e1a] shrink-0">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex flex-wrap items-end gap-3">

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Symbol</label>
            {loadingMeta ? <div className="w-44 h-9 rounded-lg bg-[#0d1f3c] animate-pulse" />
              : <SymbolCombobox symbols={allSymbols} value={symbol} onChange={setSymbol} />}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Expiry</label>
            {loadingExp ? <div className="w-36 h-9 rounded-lg bg-[#0d1f3c] animate-pulse" /> : (
              <select className="w-36 bg-[#0d1f3c] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                value={expiry} onChange={e => setExpiry(e.target.value)}>
                {expiries.length === 0 && <option value="">—</option>}
                {expiries.map(ex => <option key={ex.date} value={ex.date}>{ex.shortLabel}</option>)}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Strike</label>
            {loadingStr ? <div className="w-28 h-9 rounded-lg bg-[#0d1f3c] animate-pulse" /> : (
              <select className="w-28 bg-[#0d1f3c] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                value={strike ?? ''} onChange={e => setStrike(Number(e.target.value))}>
                {strikes.length === 0 && <option value="">—</option>}
                {strikes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Interval</label>
            <div className="flex rounded-lg overflow-hidden border border-[#1e3a5f]">
              {INTERVALS.map(iv => (
                <button key={iv.value} onClick={() => setInterval(iv.value)}
                  className={`px-3 py-2 text-sm font-mono transition-colors ${interval === iv.value ? 'bg-blue-600 text-white' : 'bg-[#0d1f3c] text-slate-400 hover:bg-[#1e3a5f] hover:text-white'}`}>
                  {iv.label}
                </button>
              ))}
            </div>
          </div>

          {spotPrice != null && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Spot</label>
              <span className="px-3 py-2 text-sm font-mono font-semibold text-amber-300 bg-amber-900/20 rounded-lg border border-amber-800/30">{fmtPx(spotPrice)}</span>
            </div>
          )}

          {expiryObj && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-transparent select-none">·</label>
              <span className={`px-2.5 py-1.5 text-[11px] rounded-md font-mono ${expiryObj.isMonthly ? 'bg-blue-900/40 text-blue-300' : 'bg-amber-900/40 text-amber-300'}`}>
                {expiryObj.isMonthly ? 'Monthly' : 'Weekly'} · {expiryObj.label}
              </span>
            </div>
          )}

          <div className="flex-1 min-w-0" />

          {/* Overlays dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Overlays</label>
            <button ref={overlayBtnRef} onClick={openOverlayDropdown}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                showOverlays ? 'bg-slate-700 text-white border-slate-600' : 'bg-[#0d1f3c] text-slate-400 border-[#1e3a5f] hover:text-slate-200 hover:bg-[#1e3a5f]'
              }`}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
                <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
              </svg>
              Overlays
              <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform ${showOverlays ? 'rotate-180' : ''}`}>
                <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          </div>

          {/* Layout */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Layout</label>
            <div className="flex rounded-lg overflow-hidden border border-[#1e3a5f]">
              <button onClick={() => setLayout('single')} title="Single" className={`px-2.5 py-2 transition-colors ${layout === 'single' ? 'bg-blue-600 text-white' : 'bg-[#0d1f3c] text-slate-400 hover:bg-[#1e3a5f]'}`}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" fill="currentColor" opacity="0.85"/></svg>
              </button>
              <button onClick={() => setLayout('vertical')} title="Stacked" className={`px-2.5 py-2 transition-colors ${layout === 'vertical' ? 'bg-blue-600 text-white' : 'bg-[#0d1f3c] text-slate-400 hover:bg-[#1e3a5f]'}`}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="5" rx="1" fill="currentColor" opacity="0.85"/><rect x="1" y="8" width="12" height="5" rx="1" fill="currentColor" opacity="0.85"/></svg>
              </button>
              <button onClick={() => setLayout('horizontal')} title="Side by side" className={`px-2.5 py-2 transition-colors ${layout === 'horizontal' ? 'bg-blue-600 text-white' : 'bg-[#0d1f3c] text-slate-400 hover:bg-[#1e3a5f]'}`}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="12" rx="1" fill="currentColor" opacity="0.85"/><rect x="8" y="1" width="5" height="12" rx="1" fill="currentColor" opacity="0.85"/></svg>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Chart area ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-4 py-3">
        {renderCharts()}
      </div>

      {/* ── Overlays dropdown — fixed position ───────────────────────────── */}
      {showOverlays && overlayPos && (
        <div ref={overlayDropRef}
          className="fixed z-[200] bg-[#111827] border border-white/[0.12] rounded-xl shadow-2xl p-3"
          style={{ top: overlayPos.top, right: overlayPos.right, minWidth: 200 }}
        >
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2 px-1">Chart Overlays</div>
          <div className="space-y-0.5">
            {OVERLAY_DEFS.map(({ key, label, color, hasParams }) => {
              const on = overlays[key];
              return (
                <div key={key}>
                  <button onClick={() => toggleOverlay(key)}
                    className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg transition-colors text-left hover:bg-white/[0.06]">
                    <span className="flex items-center w-5 flex-shrink-0">
                      <span className="w-full h-0.5 rounded-full block" style={{ backgroundColor: color, opacity: on ? 1 : 0.2 }} />
                    </span>
                    <span className={`text-xs flex-1 ${on ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                    <span className={`text-[10px] font-bold w-5 text-right ${on ? 'text-indigo-500' : 'text-slate-400'}`}>{on ? 'ON' : 'OFF'}</span>
                  </button>
                  {hasParams && on && key === 'bb' && (
                    <div className="flex items-center gap-2 px-2 pb-1.5 text-[10px] text-slate-400">
                      <span>Len</span>
                      <input type="number" min={2} max={200} value={bbSettings.length}
                        onChange={e => { const v = Math.max(2, Math.min(200, +e.target.value || 20)); setBbSettings(s => ({ ...s, length: v })); persistSettings({ bbLength: v }); }}
                        className="w-10 bg-slate-800 border border-white/10 rounded px-1 py-0.5 text-white text-[10px] text-center" />
                      <span>SD</span>
                      <input type="number" min={0.1} max={5} step={0.1} value={bbSettings.mult}
                        onChange={e => { const v = Math.max(0.1, Math.min(5, +e.target.value || 2.0)); setBbSettings(s => ({ ...s, mult: v })); persistSettings({ bbMult: v }); }}
                        className="w-10 bg-slate-800 border border-white/10 rounded px-1 py-0.5 text-white text-[10px] text-center" />
                    </div>
                  )}
                  {hasParams && on && key === 'rsi' && (
                    <div className="flex items-center gap-2 px-2 pb-1.5 text-[10px] text-slate-400">
                      <span>Period</span>
                      <input type="number" min={2} max={50} value={rsiSettings.period}
                        onChange={e => { const v = Math.max(2, Math.min(50, +e.target.value || 12)); setRsiSettings(s => ({ ...s, period: v })); persistSettings({ rsiPeriod: v }); }}
                        className="w-10 bg-slate-800 border border-white/10 rounded px-1 py-0.5 text-white text-[10px] text-center" />
                      <span>MA</span>
                      <input type="number" min={0} max={30} value={rsiSettings.maPeriod}
                        onChange={e => { const v = Math.max(0, Math.min(30, +e.target.value || 0)); setRsiSettings(s => ({ ...s, maPeriod: v })); persistSettings({ rsiMAPeriod: v }); }}
                        className="w-10 bg-slate-800 border border-white/10 rounded px-1 py-0.5 text-white text-[10px] text-center" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Candle colors */}
          <div className="border-t border-white/[0.08] mt-2 pt-2 px-1">
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5">Candle Colors</div>
            {[['Bull', 'bull'], ['Bear', 'bear']].map(([lbl, key]) => (
              <div key={key} className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] text-slate-500 w-6">{lbl}</span>
                {['#22c55e','#26a69a','#ffffff','#3b82f6','#f59e0b','#ef4444','#f97316','#000000'].map(c => (
                  <button key={c} onClick={() => { setCandleColors(prev => { const n = { ...prev, [key]: c }; persistSettings({ [key === 'bull' ? 'bullColor' : 'bearColor']: c }); return n; }); }}
                    className="w-4 h-4 rounded-full flex-shrink-0 transition-all"
                    style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid rgba(255,255,255,0.3)' : c === '#000000' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                      boxShadow: candleColors[key] === c ? '0 0 0 2px #fff' : 'none', transform: candleColors[key] === c ? 'scale(1.15)' : 'scale(1)' }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OptionsChartPage() {
  return (
    <Suspense fallback={<div className="h-[100dvh] bg-[#060b14]" />}>
      <OptionsChartInner />
    </Suspense>
  );
}
