'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import OrderModal         from '@/app/components/OrderModal';
import IntelligencePill   from '@/app/components/IntelligencePill';
import SymbolSearch        from '@/app/components/SymbolSearch';
import DrawingToolbar      from '@/app/components/DrawingToolbar';

const RSI_MIN_H = 50;
const RSI_MAX_H = 200;

// Index symbols trade via options only — "+" opens a CE/PE picker instead of a stock order
const INDEX_STRIKE_STEP = { NIFTY: 50, BANKNIFTY: 100, FINNIFTY: 50, MIDCPNIFTY: 25, SENSEX: 100 };

const INTERVAL_LABELS = {
  '5minute':  '5m',
  '15minute': '15m',
  '60minute': '1H',
  'day':      'D',
};

const REGIME_BADGE = {
  TREND_DAY_UP:     { dot: 'bg-green-400',   label: 'Trend ↑',       conf: 'text-green-400'   },
  TREND_DAY_DOWN:   { dot: 'bg-red-400',     label: 'Trend ↓',       conf: 'text-red-400'     },
  RANGE_DAY:        { dot: 'bg-amber-400',   label: 'Range Day',     conf: 'text-amber-400'   },
  BREAKOUT_DAY:     { dot: 'bg-blue-400',    label: 'Breakout',      conf: 'text-blue-400'    },
  SHORT_SQUEEZE:    { dot: 'bg-emerald-400', label: 'Short Squeeze', conf: 'text-emerald-400' },
  LONG_LIQUIDATION: { dot: 'bg-red-500',     label: 'Long Liq.',     conf: 'text-red-400'     },
  TRAP_DAY:         { dot: 'bg-orange-400',  label: 'Trap Day ⚠',    conf: 'text-orange-400'  },
  LOW_VOL_DRIFT:    { dot: 'bg-slate-400',   label: 'Low Vol',       conf: 'text-slate-400'   },
  INITIALIZING:     { dot: 'bg-slate-500',   label: 'Starting…',     conf: 'text-slate-500'   },
};

const CONF_COLORS = { HIGH: 'text-emerald-400', MEDIUM: 'text-amber-400', LOW: 'text-slate-500' };

const IST_OFFSET_S = 5.5 * 3600;

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// EMA colors
const EMA_COLORS = {
  ema9:  '#22d3ee',
  ema21: '#f97316',
  ema50: '#a78bfa',
  ema9D: '#e879f9',
  ema9W: '#fb923c',
};

const OVERLAY_DEFS = [
  { key: 'showVwap',   label: 'VWAP',         color: '#f59e0b',          intradayOnly: true,  dailyOnly: false },
  { key: 'showOrBand', label: 'OR Band',      color: '#3b82f6',          intradayOnly: true,  dailyOnly: false },
  { key: 'showSR',     label: 'S/R Zones',   color: '#94a3b8',          intradayOnly: false, dailyOnly: false },
  { key: 'showEma9',   label: 'EMA 9',        color: EMA_COLORS.ema9,   intradayOnly: false, dailyOnly: false },
  { key: 'showEma21',  label: 'EMA 21',       color: EMA_COLORS.ema21,  intradayOnly: false, dailyOnly: false },
  { key: 'showEma50',  label: 'EMA 50',       color: EMA_COLORS.ema50,  intradayOnly: false, dailyOnly: false },
  { key: 'showEma9D',  label: 'EMA 9 Daily',  color: EMA_COLORS.ema9D,  intradayOnly: true,  dailyOnly: false },
  { key: 'showEma9W',  label: 'EMA 9 Weekly', color: EMA_COLORS.ema9W,  intradayOnly: false, dailyOnly: true  },
  { key: 'showVolume', label: 'Volume',       color: '#475569',          intradayOnly: false, dailyOnly: false },
  { key: 'showSMC',    label: 'SMC  (BOS · OB · FVG)', color: '#6366f1', intradayOnly: false, dailyOnly: false },
  { key: 'showCPR',    label: 'CPR  (TC · P · BC)',    color: '#6366f1', intradayOnly: false, dailyOnly: false },
  { key: 'showRSI',    label: 'RSI',          color: '#818cf8',          intradayOnly: false, dailyOnly: false, hasParams: true },
];

const DEFAULT_SETTINGS = {
  showVwap:      true,
  showOrBand:    true,
  showSR:        true,
  showEma9:      true,
  showEma21:     true,
  showEma50:     false,
  showEma9D:     true,
  showEma9W:     true,
  showVolume:    true,
  showSMC:       true,
  showCPR:       false,
  showRSI:       false,
  bullColor:     '#22c55e',
  bearColor:     '#ef4444',
  rsiPeriod:     12,
  rsiMAPeriod:   5,
};

// ── Weekly aggregation (for EMA 9 Weekly on daily chart) ──────────────────────
function aggregateWeekly(dailyCandles) {
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

// ── CPR — per-day segments, each computed from the prior day's HLC ────────────
// Returns an array of segment objects (one per trading day visible in `candles`):
//   { startIdx, endIdx, tc, p, bc, r1, r2, s1, s2, widthPct, widthClass }
// This mirrors TradingView's `line.new(bar_index, …)` per-day approach.
// For daily charts: one segment per week (from prior week's HLC).
const IST_OFFSET_CPR = 5.5 * 3600; // seconds

function dateIST(unixSec) {
  return new Date((unixSec + IST_OFFSET_CPR) * 1000).toISOString().slice(0, 10);
}

function _cprLevels(H, L, C) {
  const P  = (H + L + C) / 3;
  const BC = (H + L) / 2;
  const TC = 2 * P - BC;
  const widthPct  = P > 0 ? ((TC - BC) / P) * 100 : 0;
  const widthClass = widthPct < 0.15 ? 'narrow' : widthPct > 0.35 ? 'wide' : 'normal';
  return { tc: TC, p: P, bc: BC, r1: 2*P-L, r2: P+(H-L), s1: 2*P-H, s2: P-(H-L), widthPct, widthClass };
}

function computeCPR(candles, dailyCandles, chartInterval) {
  if (!candles?.length || !dailyCandles?.length) return [];

  if (chartInterval === 'day') {
    // Daily chart: one CPR segment per week, derived from the prior week
    const weeklies = aggregateWeekly(dailyCandles);
    if (weeklies.length < 2) return [];
    const weeklyDates = weeklies.map(w => dateIST(w.time));
    const segments = [];
    let startIdx = 0;
    for (let i = 0; i < candles.length; i++) {
      const d = dateIST(candles[i].time);
      // Find which weekly bucket this candle falls in
      const wIdx = weeklyDates.findLastIndex(wd => wd <= d);
      const isLast = i === candles.length - 1;
      const nextD = isLast ? null : dateIST(candles[i + 1].time);
      const nextWIdx = nextD ? weeklyDates.findLastIndex(wd => wd <= nextD) : -1;
      if (isLast || nextWIdx !== wIdx) {
        // End of this week's segment — derive CPR from prior week
        if (wIdx > 0) {
          const prev = weeklies[wIdx - 1];
          segments.push({ startIdx, endIdx: i, ...(_cprLevels(prev.high, prev.low, prev.close)) });
        }
        startIdx = i + 1;
      }
    }
    return segments;
  }

  // Intraday: group candles by IST date, each day gets CPR from prior daily candle
  const segments = [];
  let dayStart = 0;
  let currentDate = dateIST(candles[0].time);

  for (let i = 1; i <= candles.length; i++) {
    const isLast = i === candles.length;
    const d = isLast ? null : dateIST(candles[i].time);

    if (isLast || d !== currentDate) {
      // Find the daily candle strictly before currentDate
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

function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e7) return (v / 1e7).toFixed(2) + 'Cr';
  if (v >= 1e5) return (v / 1e5).toFixed(2) + 'L';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function computeVWAP(candles) {
  let cumTPV = 0, cumVol = 0;
  return candles.map(c => {
    const tp  = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1;
    cumTPV += tp * vol;
    cumVol += vol;
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

function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return total >= 540 && total <= 935;
}

// ── SMC computation ────────────────────────────────────────────────────────────
// Detects BOS/CHoCH, Order Blocks, and FVGs from raw candle data.
// OB detection: last opposite-direction candle BEFORE the PIVOT (not the break).
// OB mitigation: close price (wick touches don't count) — matches TradingView.
function computeSMC(candles) {
  const n = candles.length;
  const STR = 3; // pivot strength: 3 bars each side
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

  // Assign CHoCH (trend flip) vs BOS (continuation)
  let trendState = null;
  for (const brk of allBreaks) {
    brk.isCHoCH = trendState !== null && trendState !== brk.type;
    trendState   = brk.type;
  }

  // Show only the most recent 4 structural breaks (keeps chart readable)
  const recentBreaks = allBreaks.slice(-4);

  const lastClose = candles[n - 1].close;

  // ── Order Blocks ─────────────────────────────────────────────────────────
  // OB = last opposite-direction candle BEFORE the pivot that was broken.
  // Bull BOS (broke above pivot high): demand OB = last bearish candle before the pivot high.
  // Bear BOS (broke below pivot low):  supply OB = last bullish candle before the pivot low.
  const rawOBs   = [];
  const seenOBs  = new Set();

  for (const bos of allBreaks.slice(-14)) {
    const pivotI = bos.idx; // the swing pivot bar index
    for (let i = pivotI - 1; i >= Math.max(0, pivotI - 20); i--) {
      const c           = candles[i];
      const isBullBar   = c.close >= c.open;
      // Demand (bull) OB: last BEARISH bar before the swing high
      // Supply (bear) OB: last BULLISH bar before the swing low
      const isOpposite  = (bos.type === 'bull' && !isBullBar) || (bos.type === 'bear' && isBullBar);
      if (!isOpposite) continue;

      const key = `${bos.type}_${Math.round(c.high)}_${Math.round(c.low)}`;
      if (seenOBs.has(key)) break;
      seenOBs.add(key);

      // Mitigation check: price closes through the OB after the BOS
      const slice      = candles.slice(bos.breakIdx);
      const mitigated  = bos.type === 'bull'
        ? slice.some(cc => cc.close < c.low)
        : slice.some(cc => cc.close > c.high);

      if (!mitigated) rawOBs.push({ bias: bos.type, high: c.high, low: c.low, barIdx: i });
      break;
    }
  }

  // 1 nearest demand OB (below price) + 1 nearest supply OB (above price)
  const bullOBs = rawOBs.filter(o => o.bias === 'bull' && o.low  <= lastClose)
    .sort((a, b) => b.high - a.high).slice(0, 1);
  const bearOBs = rawOBs.filter(o => o.bias === 'bear' && o.high >= lastClose)
    .sort((a, b) => a.low  - b.low).slice(0, 1);
  const orderBlocks = [...bullOBs, ...bearOBs];

  // ── FVGs ─────────────────────────────────────────────────────────────────
  // 3-candle imbalance; mitigation = wick reaches the far edge of the gap.
  const rawFVGs = [];
  for (let i = 2; i < n - 1; i++) {
    const prev = candles[i - 2], curr = candles[i];
    if (curr.low > prev.high) {
      if ((curr.low - prev.high) / prev.high * 100 < 0.20) continue;
      const mitigated = candles.slice(i + 1).some(c => c.low <= prev.high);
      if (!mitigated) rawFVGs.push({ type: 'bull', high: curr.low, low: prev.high, startIdx: i - 1 });
    }
    if (curr.high < prev.low) {
      if ((prev.low - curr.high) / curr.high * 100 < 0.20) continue;
      const mitigated = candles.slice(i + 1).some(c => c.high >= prev.low);
      if (!mitigated) rawFVGs.push({ type: 'bear', high: prev.low, low: curr.high, startIdx: i - 1 });
    }
  }
  // 1 nearest bull FVG below price + 1 nearest bear FVG above price
  const bullFVGs = rawFVGs.filter(f => f.type === 'bull' && f.low  <= lastClose)
    .sort((a, b) => b.high - a.high).slice(0, 1);
  const bearFVGs = rawFVGs.filter(f => f.type === 'bear' && f.high >= lastClose)
    .sort((a, b) => a.low  - b.low).slice(0, 1);
  const fvgs = [...bullFVGs, ...bearFVGs];

  return { bosLevels: recentBreaks, orderBlocks, fvgs };
}

// ── Inner chart component (uses useSearchParams) ──────────────────────────────
function ChartPageInner() {
  const params = useSearchParams();
  const symbol = params.get('symbol') || 'NIFTY';

  const [chartInterval, setChartInterval] = useState(params.get('interval') || '5minute');
  const [candles, setCandles]             = useState([]);
  const [dailyCandles, setDailyCandles]   = useState([]);
  const [loading, setLoading]             = useState(true);
  const [vwap, setVwap]                   = useState(null);
  const [settings, setSettings]           = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings]   = useState(false);
  const [dropdownPos, setDropdownPos]     = useState(null);
  const [intelligence, setIntelligence]   = useState(null);
  const [hoverOHLC, setHoverOHLC]         = useState(null);
  const [isMobile, setIsMobile]           = useState(false);
  const [chartTheme, setChartTheme]       = useState('dark');
  const [chartRsiH, setChartRsiH]         = useState(80);
  const [lastPriceY, setLastPriceY]         = useState(null);
  const [atRightEdge, setAtRightEdge]       = useState(true);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [indexPicker, setIndexPicker]       = useState(false);   // CE/PE picker for indices
  const [orderOptionType, setOrderOptionType] = useState(null);  // 'CE' | 'PE' | null
  const [activeTool, setActiveTool]         = useState(null);    // drawing tool id or null

  const containerRef   = useRef(null);
  const chartRef       = useRef(null);
  const settingsBtnRef = useRef(null);
  const dropdownRef    = useRef(null);
  const chartRsiHRef   = useRef(80);
  // Tracks which candles/interval/theme the current chart was created with.
  // If these haven't changed, only overlays need updating — no destroy/recreate.
  const chartCreatedForRef = useRef({ candles: null, interval: null, theme: null });

  // ── Restore persisted settings + theme after mount (avoids SSR hydration mismatch) ─
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('tv_chart_settings');
      if (savedSettings) setSettings(s => ({ ...s, ...JSON.parse(savedSettings) }));
    } catch {}
    try {
      const saved = localStorage.getItem('tv_chart_theme');
      if (saved && saved !== 'dark') setChartTheme(saved);
    } catch {}
  }, []);

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const indexSymbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
    const indexRef = indexSymbols.includes(symbol) ? symbol : 'NIFTY';

    let spotPrice = 0;
    const needDailyFetch = chartInterval !== 'day';
    try {
      const [cd, dd] = await Promise.all([
        fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=${chartInterval}${chartInterval === 'day' ? '&days=730' : ''}&bust=1`).then(r => r.json()),
        needDailyFetch
          ? fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=day&days=730&bust=1`).then(r => r.json())
          : Promise.resolve(null),
      ]);
      const c = cd?.candles || [];
      setCandles(c);
      spotPrice = c.length ? c[c.length - 1].close : 0;
      setDailyCandles(needDailyFetch ? (dd?.candles || []) : c);
    } catch { /* leave candles empty */ }

    try {
      const intelRes = await fetch(
        `/api/intelligence?symbol=${encodeURIComponent(symbol)}&interval=${chartInterval}`
      );
      if (intelRes.ok) setIntelligence(await intelRes.json());
    } catch { /* non-fatal */ }
    setLoading(false);
  }, [symbol, chartInterval]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Drawing tools — sync activeTool to chart, persist drawings ───────────────
  const drawingKey = (sym, iv) => `tv_drawings_${sym}_${iv}`;

  // Sync activeTool to chart instance whenever it changes
  useEffect(() => {
    chartRef.current?.setActiveTool(activeTool ?? null);
  }, [activeTool]);

  // Escape key: cancel in-progress drawing first, then deselect tool
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      if (activeTool) {
        chartRef.current?.cancelDrawing();
        setActiveTool(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool]);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-refresh candles every 60s during market hours
  useEffect(() => {
    const id = setInterval(() => { if (isMarketHours()) fetchAll(); }, 60000);
    return () => clearInterval(id);
  }, [fetchAll]);

  // Auto-refresh intelligence every 3 min during market hours (independent of candles)
  useEffect(() => {
    const refreshIntel = async () => {
      if (!isMarketHours() || !symbol) return;
      try {
        const res = await fetch(`/api/intelligence?symbol=${encodeURIComponent(symbol)}&interval=${chartInterval}`);
        if (res.ok) setIntelligence(await res.json());
      } catch { /* non-fatal */ }
    };
    const id = setInterval(refreshIntel, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [symbol, chartInterval]);

  // Click outside dropdown → close
  useEffect(() => {
    if (!showSettings) return;
    const onOutside = e => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        settingsBtnRef.current && !settingsBtnRef.current.contains(e.target)
      ) setShowSettings(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [showSettings]);

  const openSettings = () => {
    if (showSettings) { setShowSettings(false); return; }
    const rect = settingsBtnRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setShowSettings(true);
  };

  // ── Build / rebuild chart, or just update overlays if data hasn't changed ────
  // Key invariant: chart is destroyed+recreated (resetting viewport) ONLY when
  // candles, chartInterval, or chartTheme change. Toggling overlays in settings
  // skips recreation and just updates lines/zones on the existing chart instance,
  // so the user's zoom/pan state is fully preserved.
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const el         = containerRef.current;
    const isIntraday = chartInterval !== 'day';
    const cf         = chartCreatedForRef.current;
    // Only recreate (which resets viewport) when interval, theme, or container changes, or on first load.
    // Candle data refreshes (new reference on auto-refresh) are handled via updateCandles
    // below — which preserves zoom/pan, unlike setCandles which calls fitContent.
    // cf.el tracks the DOM node — if the container remounted (symbol change via key=), chart must be recreated.
    const needsRecreation = !chartRef.current
      || cf.el        !== el
      || cf.interval  !== chartInterval
      || cf.theme     !== chartTheme;

    const applyOverlays = (chart) => {

      // ── VWAP ──────────────────────────────────────────────────────────────
      if (settings.showVwap && isIntraday) {
        // Use last trading session in candles (not "today" — market may be closed)
        const lastDate  = new Date((candles[candles.length - 1].time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10);
        const sessCdls  = candles.filter(c => new Date((c.time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10) === lastDate);
        const vwapData  = computeVWAP(sessCdls.length ? sessCdls : candles.slice(-1));
        chart.setLine('vwap', { data: vwapData, color: '#f59e0b', width: 2 });
        const last = vwapData[vwapData.length - 1]?.value;
        setVwap(last ?? null);
      } else {
        chart.clearLine('vwap');
        setVwap(null);
      }

      // ── OR Band ───────────────────────────────────────────────────────────
      if (settings.showOrBand && isIntraday && candles.length >= 1) {
        // Use last trading session's first bar
        const lastDate = new Date((candles[candles.length - 1].time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10);
        const dayStart = candles.findIndex(c => new Date((c.time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10) === lastDate);
        const orC = candles[dayStart >= 0 ? dayStart : 0];
        chart.setZone({ id: 'or_high', price: orC.high, color: 'rgba(96,165,250,0.8)',  label: 'OR H', style: 'dashed', inline: true });
        chart.setZone({ id: 'or_low',  price: orC.low,  color: 'rgba(96,165,250,0.8)',  label: 'OR L', style: 'dashed', inline: true });
      } else {
        chart.clearZone('or_high');
        chart.clearZone('or_low');
      }

      // ── S/R zones from Station agent ──────────────────────────────────────
      if (settings.showSR) {
        const stations = intelligence?.agents?.station?.allStations;
        chart.clearZonesWithPrefix('sr_');
        if (stations?.length) {
          const ltp    = candles[candles.length - 1]?.close || 0;
          const dist   = s => Math.abs(s.price - ltp);
          const broken = s => (s.type === 'SUPPORT' && ltp < s.price) || (s.type === 'RESISTANCE' && ltp > s.price);
          const sup = stations.filter(s => s.type === 'SUPPORT').sort((a, b) => dist(a) - dist(b)).slice(0, 4);
          const res = stations.filter(s => s.type === 'RESISTANCE').sort((a, b) => dist(a) - dist(b)).slice(0, 4);
          for (const s of sup) chart.setZone({ id: `sr_s_${s.price}`, price: s.price,
            color: broken(s) ? 'rgba(134,239,172,0.55)' : 'rgba(74,222,128,0.85)',
            label: `S${s.quality >= 7 ? '★' : ''}`, style: 'dashed', inline: true });
          for (const r of res) chart.setZone({ id: `sr_r_${r.price}`, price: r.price,
            color: broken(r) ? 'rgba(252,165,165,0.55)' : 'rgba(248,113,113,0.85)',
            label: `R${r.quality >= 7 ? '★' : ''}`, style: 'dashed', inline: true });
        }
      } else {
        chart.clearZonesWithPrefix('sr_');
      }

      // ── EMA lines ─────────────────────────────────────────────────────────
      if (settings.showEma9)  chart.setLine('ema9',  { data: computeEMA(candles, 9),  color: EMA_COLORS.ema9,  width: 2 });
      else                    chart.clearLine('ema9');
      if (settings.showEma21) chart.setLine('ema21', { data: computeEMA(candles, 21), color: EMA_COLORS.ema21, width: 2 });
      else                    chart.clearLine('ema21');
      if (settings.showEma50) chart.setLine('ema50', { data: computeEMA(candles, 50), color: EMA_COLORS.ema50, width: 2 });
      else                    chart.clearLine('ema50');

      // ── EMA 9 Daily — flat zone line on intraday ──────────────────────────
      if (settings.showEma9D && isIntraday && dailyCandles.length >= 9) {
        const val = computeEMA(dailyCandles, 9).at(-1)?.value;
        if (val) chart.setZone({ id: 'ema9d', price: val, color: 'rgba(232,121,249,0.85)', label: 'D·EMA9', style: 'solid', width: 2.5, inline: true });
      } else {
        chart.clearZone('ema9d');
      }

      // ── EMA 9 Weekly — flat zone line on daily chart ──────────────────────
      if (settings.showEma9W && !isIntraday && dailyCandles.length >= 9) {
        const val = computeEMA(aggregateWeekly(dailyCandles), 9).at(-1)?.value;
        if (val) chart.setZone({ id: 'ema9w', price: val, color: 'rgba(251,146,60,0.85)', label: 'W·EMA9', style: 'solid', width: 2.5, inline: true });
      } else {
        chart.clearZone('ema9w');
      }

      // ── SMC overlays (BOS · OB · FVG) ────────────────────────────────────
      if (settings.showSMC && candles.length > 10) {
        const smc = computeSMC(candles);
        if (smc) chart.setSMC(smc);
        else chart.clearSMC();
      } else {
        chart.clearSMC();
      }

      // ── CPR (Central Pivot Range) — per-day segments ─────────────────────
      if (settings.showCPR) {
        const segs = computeCPR(candles, dailyCandles, chartInterval);
        chart.setCPR(segs.length ? segs : null);
      } else {
        chart.clearCPR();
      }

      // ── Candle colors ─────────────────────────────────────────────────────
      chart.setCandleColors({ bull: settings.bullColor, bear: settings.bearColor });

      // ── Volume ────────────────────────────────────────────────────────────
      chart.setShowVolume(settings.showVolume);

      // ── RSI sub-pane ──────────────────────────────────────────────────────
      if (settings.showRSI && candles.length > (settings.rsiPeriod ?? 12) + 1) {
        const period   = settings.rsiPeriod ?? 12;
        const maPeriod = settings.rsiMAPeriod ?? 5;
        const rsi      = computeRSI(candles, period);
        const rsiMA    = maPeriod >= 2 ? computeSMAAligned(rsi, maPeriod) : null;
        const lbl      = maPeriod >= 2 ? `RSI(${period},${maPeriod})` : `RSI(${period})`;
        chart.setRSIPane(rsi, rsiMA, lbl);
        chart.setRSIPaneHeight(chartRsiHRef.current);
      } else {
        chart.clearRSIPane();
      }
    }; // end applyOverlays

    if (!needsRecreation) {
      // Candles refreshed (new reference) — slide viewport if at right edge, else stay put
      if (cf.candles !== candles) {
        chartRef.current.updateCandles(candles);
        chartCreatedForRef.current = { ...cf, candles };
      }
      // Settings or overlay toggle — just re-apply without touching viewport
      applyOverlays(chartRef.current);
      return;
    }

    // Full recreation — new candles, interval, or theme
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    import('@/app/lib/chart/Chart.js').then(({ createChart }) => {
      if (!containerRef.current) return;

      const chart = createChart(el, { interval: chartInterval, theme: chartTheme });
      chartRef.current = chart;
      chartCreatedForRef.current = { el, candles, interval: chartInterval, theme: chartTheme };

      chart.onCrosshairMove(info => {
        if (info?.bar) setHoverOHLC(info.bar);
        else           setHoverOHLC(null);
      });
      chart.onLastPriceY(y => setLastPriceY(y));
      chart.onViewportChange(({ atEnd }) => setAtRightEdge(atEnd));

      chart.setCandles(candles); // fitContent called inside — shows all bars
      // Zoom to a sensible default window: show last 2-3 trading days for intraday
      const defaultBars = {
        '1minute':  390,   // ~1 trading day
        '5minute':  234,   // ~3 trading days  (78 bars/day × 3)
        '15minute': 104,   // ~4 trading days  (26 bars/day × 4)
        '60minute': 150,   // ~6 weeks
      }[chartInterval];
      if (defaultBars) chart.fitRecent(defaultBars);

      // Load saved drawings for this symbol+interval
      try {
        const saved = localStorage.getItem(drawingKey(symbol, chartInterval));
        if (saved) chart.setDrawings(JSON.parse(saved));
      } catch {}

      // Persist drawings on each placement
      chart.onDrawingComplete((_, all) => {
        try { localStorage.setItem(drawingKey(symbol, chartInterval), JSON.stringify(all)); } catch {}
      });

      // Re-apply active tool after recreation
      if (activeTool) chart.setActiveTool(activeTool);

      applyOverlays(chart);
    });
  }, [candles, dailyCandles, chartInterval, chartTheme, intelligence, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Destroy chart only on unmount — NOT on every effect re-run.
  // Putting destroy() in the main effect cleanup was the root cause of viewport resets:
  // React runs cleanup before each re-run, destroying the chart so needsRecreation=true.
  useEffect(() => {
    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, []);

  // Fallback: if lastPriceY is still null 300ms after candles load, read it directly.
  // Covers the edge case where the RAF fires before onLastPriceY is registered.
  useEffect(() => {
    if (lastPriceY !== null || !candles.length) return;
    const t = setTimeout(() => {
      const y = chartRef.current?.getLastPriceY?.();
      if (y != null) setLastPriceY(y);
    }, 300);
    return () => clearTimeout(t);
  }, [candles, lastPriceY]);

  const toggle = key => setSettings(s => {
    const next = { ...s, [key]: !s[key] };
    try { localStorage.setItem('tv_chart_settings', JSON.stringify(next)); } catch {}
    return next;
  });

  const setNum = (key, val) => setSettings(s => {
    const next = { ...s, [key]: val };
    try { localStorage.setItem('tv_chart_settings', JSON.stringify(next)); } catch {}
    return next;
  });

  const setSetting = (key, val) => setSettings(s => {
    const next = { ...s, [key]: val };
    try { localStorage.setItem('tv_chart_settings', JSON.stringify(next)); } catch {}
    return next;
  });

  const toggleTheme = () => {
    const next = chartTheme === 'dark' ? 'light' : 'dark';
    setChartTheme(next);
    try { localStorage.setItem('tv_chart_theme', next); } catch {}
    chartRef.current?.setTheme(next);
  };

  const isIntraday = chartInterval !== 'day';
  const ltp        = candles.length > 0 ? candles[candles.length - 1].close : null;
  const open0      = candles.length > 0 ? candles[0].open : null;
  const changePct  = ltp != null && open0 ? ((ltp - open0) / open0) * 100 : null;
  const isUp       = changePct != null ? changePct >= 0 : null;
  // Derive regime from central intelligence (for S/R zone useEffect + regime badge)
  const regimeData = intelligence?.regime ?? null;
  const regime     = regimeData?.regime ? (REGIME_BADGE[regimeData.regime] || REGIME_BADGE.INITIALIZING) : null;
  const confColor  = regimeData?.confidence ? (CONF_COLORS[regimeData.confidence] || 'text-slate-400') : 'text-slate-400';
  const anyEma = settings.showEma9 || settings.showEma21 || settings.showEma50 ||
                 (settings.showEma9D && isIntraday) || (settings.showEma9W && !isIntraday);

  const isIndex  = symbol in INDEX_STRIKE_STEP;
  const step     = INDEX_STRIKE_STEP[symbol] ?? 1;
  const lastClose = candles.length ? candles[candles.length - 1].close : null;
  const atmStrike = lastClose ? Math.round(lastClose / step) * step : null;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-[#0a0e1a] text-white">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="bg-[#0a0e1a] border-b border-white/[0.06] flex-shrink-0">

        {/* Row 1: back · symbol · price · [desktop: intervals + controls] */}
        <div className="px-3 h-11 flex items-center gap-2">

          <a href="/terminal"
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm"
            title="Back to terminal"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
            </svg>
            <span className="hidden sm:inline">Terminal</span>
          </a>

          <span className="w-px h-4 bg-white/10" />
          <SymbolSearch symbol={symbol} />

          {ltp != null && (
            <>
              <span className="font-mono text-sm text-slate-400">
                ₹{ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              {changePct != null && (
                <span className={`font-mono text-xs font-semibold ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                  {isUp ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
                </span>
              )}
            </>
          )}

          <div className="flex-1" />

          {/* Desktop: interval buttons */}
          <div className="hidden sm:flex items-center gap-1">
            {Object.entries(INTERVAL_LABELS).map(([val, label]) => (
              <button key={val} onClick={() => setChartInterval(val)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  chartInterval === val ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
                }`}
              >{label}</button>
            ))}
            <span className="w-px h-4 bg-white/10 mx-1.5" />
          </div>

          {/* Reset view */}
          <button
            onClick={() => {
              const defaultBars = { '1minute': 390, '5minute': 234, '15minute': 104, '60minute': 150 }[chartInterval];
              if (defaultBars) chartRef.current?.fitRecent(defaultBars);
              else chartRef.current?.fitContent();
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
            title="Reset view (or double-click chart)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
            </svg>
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Light/dark theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
            title={chartTheme === 'dark' ? 'Switch to light chart' : 'Switch to dark chart'}
          >
            {chartTheme === 'dark' ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
              </svg>
            )}
          </button>

          {/* Overlays toggle */}
          <button
            ref={settingsBtnRef}
            onClick={openSettings}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              showSettings ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
            </svg>
            <span className="hidden sm:inline">Overlays</span>
          </button>
        </div>

        {/* Row 2: interval strip — mobile only */}
        <div className="sm:hidden flex items-center gap-1 px-3 pb-2">
          {Object.entries(INTERVAL_LABELS).map(([val, label]) => (
            <button key={val} onClick={() => setChartInterval(val)}
              className={`flex-1 py-1 rounded-md text-xs font-semibold transition-colors ${
                chartInterval === val ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-white/[0.06]'
              }`}
            >{label}</button>
          ))}
        </div>
      </header>

      {/* ── Chart area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">

        {/* Loading spinner */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#0a0e1a]">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <span className="w-4 h-4 border-2 border-slate-400 border-t-indigo-500 rounded-full animate-spin" />
              Loading…
            </div>
          </div>
        )}

        {/* Error state */}
        {!loading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#0a0e1a]">
            <div className="flex flex-col items-center gap-4 bg-[#111827] border border-white/[0.12] rounded-2xl px-8 py-6">
              <span className="text-2xl">⚠</span>
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Could not load chart data</p>
                <p className="text-slate-400 text-xs mt-1">Symbol: {symbol}</p>
              </div>
              <button onClick={fetchAll}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >Retry</button>
            </div>
          </div>
        )}

        {/* Chart canvas mount point — keyed so DOM is fresh on symbol/interval change */}
        <div
          ref={containerRef}
          key={`${symbol}-${chartInterval}`}
          className="w-full h-full"
        />

        {/* Drawing toolbar — left edge, vertically centered */}
        <DrawingToolbar activeTool={activeTool} onToolSelect={setActiveTool} />

        {/* RSI pane drag handle — draggable resize strip above the RSI pane */}
        {settings.showRSI && (
          <div
            className="absolute left-0 right-0 h-2 cursor-ns-resize z-20 group"
            style={{ bottom: 28 + chartRsiH - 4 }}
            onMouseDown={e => {
              e.preventDefault();
              const startY = e.clientY;
              const startH = chartRsiHRef.current;
              const onMove = mv => {
                const newH = Math.max(RSI_MIN_H, Math.min(RSI_MAX_H, startH - (mv.clientY - startY)));
                chartRsiHRef.current = newH;
                chartRef.current?.setRSIPaneHeight(newH);
                setChartRsiH(newH);
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-slate-600/50 group-hover:bg-slate-400/60 transition-colors" />
          </div>
        )}

        {/* Scroll-to-latest button — TV-style ►► appears when scrolled away from right edge */}
        {!atRightEdge && (
          <button
            onClick={() => chartRef.current?.scrollToEnd()}
            className="absolute z-20 bottom-20 right-20 flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#1e293b] hover:bg-[#334155] border border-white/[0.12] shadow-lg text-slate-300 text-[11px] font-semibold transition-colors"
            title="Scroll to latest bar"
          >
            <svg width="13" height="11" viewBox="0 0 13 11" fill="currentColor">
              <path d="M0 1.5 L4.5 5.5 L0 9.5 L0 1.5Z"/>
              <path d="M5 1.5 L9.5 5.5 L5 9.5 L5 1.5Z"/>
              <rect x="10.5" y="1.5" width="2" height="8" rx="1"/>
            </svg>
          </button>
        )}

        {/* Order entry button — floats beside the last-price pill */}
        {lastPriceY !== null && candles.length > 0 && (
          <button
            onClick={() => {
              if (isIndex) { setIndexPicker(v => !v); }
              else { setOrderModalOpen(true); }
            }}
            style={{ top: lastPriceY - 11, right: 80 }}
            className="absolute z-20 w-[22px] h-[22px] rounded-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 border border-indigo-400/60 shadow-lg flex items-center justify-center text-white text-sm font-bold leading-none transition-colors"
            title={isIndex ? `Trade ${symbol} options — ATM ${atmStrike}` : `Place order — ₹${lastClose?.toFixed(2)}`}
          >+</button>
        )}

        {/* Index CE/PE picker — appears when + is clicked on NIFTY/BANKNIFTY/etc */}
        {indexPicker && lastPriceY !== null && atmStrike && (
          <div
            style={{ top: lastPriceY - 15, right: 108 }}
            className="absolute z-30 flex items-center gap-1.5 bg-[#0f1d33] border border-white/10 rounded-lg px-2.5 py-1.5 shadow-2xl"
          >
            <span className="text-[11px] text-slate-400 font-mono mr-0.5">ATM {atmStrike}</span>
            <button
              onClick={() => { setOrderOptionType('CE'); setIndexPicker(false); setOrderModalOpen(true); }}
              className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
            >CE</button>
            <button
              onClick={() => { setOrderOptionType('PE'); setIndexPicker(false); setOrderModalOpen(true); }}
              className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-red-700 hover:bg-red-600 text-white transition-colors"
            >PE</button>
            <button
              onClick={() => setIndexPicker(false)}
              className="ml-0.5 text-slate-500 hover:text-slate-300 text-xs leading-none"
            >✕</button>
          </div>
        )}

        {/* OHLCV overlay — top-left */}
        {(() => {
          const bar    = hoverOHLC || (candles.length > 0 ? candles[candles.length - 1] : null);
          const chgPct = bar ? ((bar.close - bar.open) / bar.open * 100) : null;
          const barUp  = bar ? bar.close >= bar.open : null;
          const isLight  = chartTheme === 'light';
          const valClr   = isLight ? 'text-slate-900' : 'text-white';
          const lblClr   = isLight ? 'text-slate-500' : 'text-slate-400';
          const bullClr  = isLight ? 'text-emerald-700' : 'text-emerald-400';
          const bearClr  = isLight ? 'text-red-600'     : 'text-red-400';
          return (
            <div className="absolute top-2 left-2 z-10 pointer-events-none select-none">
              <div className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-600'}`}>
                {symbol} · {INTERVAL_LABELS[chartInterval] ?? chartInterval}
              </div>
              {bar && (
                <>
                  <div className="hidden sm:flex items-center gap-2 mt-0.5 text-[11px] font-mono">
                    <span className={lblClr}>O <span className={valClr}>{bar.open.toFixed(2)}</span></span>
                    <span className={lblClr}>H <span className={bullClr}>{bar.high.toFixed(2)}</span></span>
                    <span className={lblClr}>L <span className={bearClr}>{bar.low.toFixed(2)}</span></span>
                    <span className={lblClr}>C <span className={barUp ? bullClr : bearClr}>{bar.close.toFixed(2)}</span></span>
                    {chgPct != null && <span className={barUp ? bullClr : bearClr}>{barUp ? '+' : ''}{chgPct.toFixed(2)}%</span>}
                    {bar.volume != null && <span className={lblClr}>V <span className={valClr}>{fmtVol(bar.volume)}</span></span>}
                  </div>
                  <div className="sm:hidden mt-0.5 font-mono space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className={`font-semibold ${barUp ? bullClr : bearClr}`}>{bar.close.toFixed(2)}</span>
                      {chgPct != null && <span className={`text-[10px] ${barUp ? bullClr : bearClr}`}>{barUp ? '+' : ''}{chgPct.toFixed(2)}%</span>}
                    </div>
                    <div className={`flex items-center gap-1.5 text-[10px] ${lblClr}`}>
                      <span>O <span className={valClr}>{bar.open.toFixed(1)}</span></span>
                      <span>H <span className={bullClr}>{bar.high.toFixed(1)}</span></span>
                      <span>L <span className={bearClr}>{bar.low.toFixed(1)}</span></span>
                      {bar.volume != null && <span>V <span className={valClr}>{fmtVol(bar.volume)}</span></span>}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* EMA legend — top-center pill (desktop only) */}
        {anyEma && (
          <div className="hidden sm:flex absolute top-2 left-1/2 -translate-x-1/2 z-10 items-center gap-4 pointer-events-none select-none bg-[#0a0e1a]/70 border border-white/[0.06] px-3 py-1 rounded-full">
            {settings.showEma9 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: EMA_COLORS.ema9 }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: EMA_COLORS.ema9 }} /> EMA 9
              </span>
            )}
            {settings.showEma21 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: EMA_COLORS.ema21 }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: EMA_COLORS.ema21 }} /> EMA 21
              </span>
            )}
            {settings.showEma50 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: EMA_COLORS.ema50 }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: EMA_COLORS.ema50 }} /> EMA 50
              </span>
            )}
            {settings.showEma9D && isIntraday && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: EMA_COLORS.ema9D }}>
                <span className="w-5 h-px rounded-full inline-block" style={{ backgroundColor: EMA_COLORS.ema9D }} /> D·EMA9
              </span>
            )}
            {settings.showEma9W && !isIntraday && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: EMA_COLORS.ema9W }}>
                <span className="w-5 h-px rounded-full inline-block" style={{ backgroundColor: EMA_COLORS.ema9W }} /> W·EMA9
              </span>
            )}
          </div>
        )}

        {/* VWAP badge — bottom-left */}
        {settings.showVwap && isIntraday && vwap != null && (
          <div className="absolute left-3 z-10 flex items-center gap-1.5 bg-[#0a0e1a]/90 border border-amber-500/20 rounded-lg px-2.5 py-1 pointer-events-none select-none"
            style={{ bottom: (settings.showRSI ? chartRsiH + 28 : 0) + 16 }}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-[10px] text-amber-500 font-mono font-semibold">VWAP</span>
            <span className="text-[10px] text-slate-400 font-mono">₹{vwap.toFixed(1)}</span>
          </div>
        )}

        {/* Intelligence pill — bottom-left, expandable */}
        <IntelligencePill
          intelligence={intelligence}
          bottomOffset={(settings.showRSI ? chartRsiH + 28 : 0) + 16}
        />


      </div>{/* end chart area */}

      {/* ── Settings panel: bottom sheet on mobile, dropdown on desktop ──────── */}
      {showSettings && (
        isMobile ? (
          <div className="fixed inset-0 z-[200] flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowSettings(false)} />
            <div className="relative bg-[#111827] border-t border-white/[0.12] rounded-t-2xl shadow-2xl p-4 pb-8">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-3 px-1">Chart Overlays</div>
              {[
                { key: 'bullColor', label: 'Bull candle', def: '#22c55e' },
                { key: 'bearColor', label: 'Bear candle', def: '#ef4444' },
              ].map(({ key, label, def }) => (
                <div key={key} className="px-1 mb-3">
                  <div className="text-xs text-slate-500 mb-1.5">{label}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['#22c55e','#26a69a','#ffffff','#3b82f6','#f59e0b','#ef4444','#f97316','#000000'].map(c => (
                      <button key={c} onClick={() => setSetting(key, c)}
                        style={{ backgroundColor: c, width: 22, height: 22, borderRadius: 4,
                          boxShadow: (settings[key] ?? def) === c ? '0 0 0 2px #fff' : '0 0 0 1px rgba(255,255,255,0.15)' }}
                      />
                    ))}
                    <label className="relative cursor-pointer flex items-center justify-center w-[22px] h-[22px] rounded text-slate-400 text-sm font-bold"
                      style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.15)' }}>
                      +<input type="color" value={settings[key] ?? def} onChange={e => setSetting(key, e.target.value)} className="absolute opacity-0 w-0 h-0" />
                    </label>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-1">
                {OVERLAY_DEFS.map(({ key, label, color, intradayOnly, dailyOnly, hasParams }) => {
                  const disabled = (intradayOnly && !isIntraday) || (dailyOnly && isIntraday);
                  const on       = settings[key] && !disabled;
                  return (
                    <div key={key} className={`${hasParams && on ? 'col-span-2' : ''}`}>
                      <button onClick={() => !disabled && toggle(key)} disabled={disabled}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors text-left w-full ${
                          disabled ? 'opacity-25 cursor-not-allowed' : on ? 'bg-slate-700' : 'hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="w-4 h-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: color, opacity: on ? 1 : 0.3 }} />
                        <span className={`text-sm flex-1 ${on ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                      </button>
                      {hasParams && on && (
                        <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-slate-400">
                          <label className="flex items-center gap-1.5">Period
                            <input type="number" min={2} max={50} value={settings.rsiPeriod ?? 12}
                              onChange={e => setNum('rsiPeriod', Math.max(2, Math.min(50, +e.target.value || 12)))}
                              className="w-12 bg-slate-800 border border-white/10 rounded px-1.5 py-0.5 text-white text-xs text-center"
                            />
                          </label>
                          <label className="flex items-center gap-1.5">MA
                            <input type="number" min={0} max={30} value={settings.rsiMAPeriod ?? 5}
                              onChange={e => setNum('rsiMAPeriod', Math.max(0, Math.min(30, +e.target.value || 0)))}
                              className="w-12 bg-slate-800 border border-white/10 rounded px-1.5 py-0.5 text-white text-xs text-center"
                            />
                          </label>
                          <span className="text-slate-600 text-[10px]">(0 = off)</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          dropdownPos && (
            <div ref={dropdownRef}
              className="fixed z-[200] bg-[#111827] border border-white/[0.12] rounded-xl shadow-2xl p-3"
              style={{ top: dropdownPos.top, right: dropdownPos.right, minWidth: 196 }}
            >
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2 px-1">Chart Overlays</div>
              <div className="space-y-0.5">
                {OVERLAY_DEFS.map(({ key, label, color, intradayOnly, dailyOnly, hasParams }) => {
                  const disabled = (intradayOnly && !isIntraday) || (dailyOnly && isIntraday);
                  const on       = settings[key] && !disabled;
                  return (
                    <div key={key}>
                      <button onClick={() => !disabled && toggle(key)} disabled={disabled}
                        className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg transition-colors text-left ${
                          disabled ? 'opacity-25 cursor-not-allowed' : 'hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="flex items-center w-5 flex-shrink-0">
                          <span className="w-full h-0.5 rounded-full block" style={{ backgroundColor: color, opacity: on ? 1 : 0.2 }} />
                        </span>
                        <span className={`text-xs flex-1 ${on ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                        <span className={`text-[10px] font-bold w-5 text-right ${on ? 'text-indigo-500' : 'text-slate-400'}`}>
                          {on ? 'ON' : 'OFF'}
                        </span>
                      </button>
                      {hasParams && on && (
                        <div className="flex items-center gap-2 px-2 pb-1.5 text-[10px] text-slate-400">
                          <span>Period</span>
                          <input type="number" min={2} max={50} value={settings.rsiPeriod ?? 12}
                            onChange={e => setNum('rsiPeriod', Math.max(2, Math.min(50, +e.target.value || 12)))}
                            className="w-10 bg-slate-800 border border-white/10 rounded px-1 py-0.5 text-white text-[10px] text-center"
                          />
                          <span>MA</span>
                          <input type="number" min={0} max={30} value={settings.rsiMAPeriod ?? 5}
                            onChange={e => setNum('rsiMAPeriod', Math.max(0, Math.min(30, +e.target.value || 0)))}
                            className="w-10 bg-slate-800 border border-white/10 rounded px-1 py-0.5 text-white text-[10px] text-center"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-white/[0.08] mt-2 pt-2 px-1">
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5">Candle Colors</div>
                {[['Bull', 'bullColor', '#22c55e'], ['Bear', 'bearColor', '#ef4444']].map(([lbl, key, def]) => (
                  <div key={key} className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] text-slate-500 w-6">{lbl}</span>
                    {['#22c55e','#26a69a','#ffffff','#3b82f6','#f59e0b','#ef4444','#f97316','#000000'].map(c => (
                      <button key={c} onClick={() => setSetting(key, c)}
                        className="w-4 h-4 rounded-full flex-shrink-0 ring-offset-[#111827] transition-all"
                        style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid rgba(255,255,255,0.3)' : c === '#000000' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                          outline: settings[key] === c ? '2px solid #6366f1' : 'none', outlineOffset: '1px' }}
                      />
                    ))}
                    <label className="w-4 h-4 rounded-full cursor-pointer flex-shrink-0 flex items-center justify-center bg-white/10 text-[8px] text-slate-400 hover:bg-white/20">
                      +<input type="color" value={settings[key] ?? def} onChange={e => setSetting(key, e.target.value)} className="absolute opacity-0 w-0 h-0" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )
        )
      )}
    {/* Place order modal */}
    <OrderModal
      isOpen={orderModalOpen}
      onClose={() => { setOrderModalOpen(false); setOrderOptionType(null); }}
      symbol={symbol}
      price={isIndex ? atmStrike : lastClose}
      defaultType="BUY"
      optionType={orderOptionType}
      onOrderPlaced={() => { setOrderModalOpen(false); setOrderOptionType(null); }}
      intelligence={intelligence}
    />
    </div>
  );
}

// ── Page export (wraps inner in Suspense for useSearchParams) ─────────────────
export default function ChartPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <span className="w-5 h-5 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    }>
      <ChartPageInner />
    </Suspense>
  );
}
