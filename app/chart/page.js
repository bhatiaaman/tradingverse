'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

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
];

const DEFAULT_SETTINGS = {
  showVwap:   true,
  showOrBand: true,
  showSR:     true,
  showEma9:   true,
  showEma21:  true,
  showEma50:  false,
  showEma9D:  true,
  showEma9W:  true,
  showVolume: true,
  showSMC:    true,
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

function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return total >= 540 && total <= 935;
}

// ── SMC computation ────────────────────────────────────────────────────────────
// Detects BOS/CHoCH, Order Blocks, and FVGs from raw candle data.
function computeSMC(candles, strength = 3) {
  const n = candles.length;
  if (n < strength * 2 + 5) return null;

  // ── Swing pivots ─────────────────────────────────────────────────────────
  const pivotHighs = [], pivotLows = [];
  for (let i = strength; i < n - strength; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= strength; j++) {
      if (candles[i-j].high >= candles[i].high || candles[i+j].high >= candles[i].high) isH = false;
      if (candles[i-j].low  <= candles[i].low  || candles[i+j].low  <= candles[i].low)  isL = false;
    }
    if (isH) pivotHighs.push({ idx: i, price: candles[i].high });
    if (isL) pivotLows.push({ idx: i, price: candles[i].low });
  }

  // ── BOS / CHoCH — find first close-break of each pivot then label CHoCH/BOS ─
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

  // Assign CHoCH (first break after a trend flip) vs BOS (continuation)
  let trendState = null;
  for (const brk of allBreaks) {
    brk.isCHoCH = trendState !== null && trendState !== brk.type;
    trendState   = brk.type;
  }

  // Only show breaks visible in recent history (last 120 bars)
  const recentBreaks = allBreaks.filter(b => b.breakIdx >= n - 120);

  // ── Order Blocks — last opposing candle before each recent BOS/CHoCH break ──
  const orderBlocks = [];
  const seenOBPrices = new Set();
  for (const bos of allBreaks.slice(-10)) {
    if (bos.breakIdx == null) continue;
    for (let i = bos.breakIdx - 1; i >= Math.max(0, bos.breakIdx - 25); i--) {
      const c = candles[i];
      const isBullCandle = c.close >= c.open;
      const isMatch = (bos.type === 'bull' && !isBullCandle) || (bos.type === 'bear' && isBullCandle);
      if (!isMatch) continue;
      const key = `${bos.type}_${c.high.toFixed(0)}_${c.low.toFixed(0)}`;
      if (seenOBPrices.has(key)) break;
      seenOBPrices.add(key);
      // Mitigated if price has since crossed the OB zone
      const slice = candles.slice(bos.breakIdx);
      const mitigated = bos.type === 'bull'
        ? slice.some(cc => cc.low  < c.low)
        : slice.some(cc => cc.high > c.high);
      if (!mitigated) orderBlocks.push({ bias: bos.type, high: c.high, low: c.low, barIdx: i });
      break;
    }
  }

  // ── FVGs — 3-candle imbalance, unmitigated only ──────────────────────────
  const fvgs = [];
  const fvgStart = Math.max(0, n - 150);
  for (let i = fvgStart + 2; i < n - 1; i++) {
    const prev = candles[i - 2], curr = candles[i];
    if (curr.low > prev.high) {
      const sizePct = (curr.low - prev.high) / prev.high * 100;
      if (sizePct < 0.1) continue;
      const mitigated = candles.slice(i + 1).some(c => c.low <= prev.high);
      if (!mitigated) fvgs.push({ type: 'bull', high: curr.low, low: prev.high, startIdx: i - 1 });
    }
    if (curr.high < prev.low) {
      const sizePct = (prev.low - curr.high) / curr.high * 100;
      if (sizePct < 0.1) continue;
      const mitigated = candles.slice(i + 1).some(c => c.high >= prev.low);
      if (!mitigated) fvgs.push({ type: 'bear', high: prev.low, low: curr.high, startIdx: i - 1 });
    }
  }

  return {
    bosLevels:   recentBreaks,
    orderBlocks: orderBlocks.slice(-6),
    fvgs:        fvgs.slice(-6),
  };
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
  const [settings, setSettings]           = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const saved = JSON.parse(localStorage.getItem('tv_chart_settings') || '{}');
      return { ...DEFAULT_SETTINGS, ...saved };
    } catch { return DEFAULT_SETTINGS; }
  });
  const [showSettings, setShowSettings]   = useState(false);
  const [dropdownPos, setDropdownPos]     = useState(null);
  const [regimeData, setRegimeData]       = useState(null);
  const [stationData, setStationData]     = useState(null);
  const [hoverOHLC, setHoverOHLC]         = useState(null);
  const [isMobile, setIsMobile]           = useState(false);

  const containerRef   = useRef(null);
  const chartRef       = useRef(null);
  const settingsBtnRef = useRef(null);
  const dropdownRef    = useRef(null);

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const indexSymbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
    const indexRef = indexSymbols.includes(symbol) ? symbol : 'NIFTY';

    let spotPrice = 0;
    const needDailyFetch = chartInterval !== 'day';
    try {
      const [cd, dd] = await Promise.all([
        fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=${chartInterval}&bust=1`).then(r => r.json()),
        needDailyFetch
          ? fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=day&bust=1`).then(r => r.json())
          : Promise.resolve(null),
      ]);
      const c = cd?.candles || [];
      setCandles(c);
      spotPrice = c.length ? c[c.length - 1].close : 0;
      setDailyCandles(needDailyFetch ? (dd?.candles || []) : c);
    } catch { /* leave candles empty */ }

    const [regimeRes, stationRes] = await Promise.allSettled([
      fetch('/api/market-regime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: indexRef, type: 'intraday' }),
      }).then(r => r.json()),
      fetch('/api/order-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, exchange: 'NSE', instrumentType: 'EQ',
          transactionType: 'BUY', spotPrice, productType: 'MIS', includeStation: true }),
      }).then(r => r.json()),
    ]);

    if (regimeRes.status === 'fulfilled')  setRegimeData(regimeRes.value);
    if (stationRes.status === 'fulfilled') setStationData(stationRes.value);
    setLoading(false);
  }, [symbol, chartInterval]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-refresh every 60s during market hours
  useEffect(() => {
    const id = setInterval(() => { if (isMarketHours()) fetchAll(); }, 60000);
    return () => clearInterval(id);
  }, [fetchAll]);

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

  // ── Build / rebuild chart whenever data or settings change ─────────────────
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const el = containerRef.current;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const isIntraday = chartInterval !== 'day';

    import('@/app/lib/chart/Chart.js').then(({ createChart }) => {
      if (!containerRef.current) return; // component unmounted while awaiting import

      const chart = createChart(el, { interval: chartInterval });
      chartRef.current = chart;

      // ── Candles ────────────────────────────────────────────────────────────
      chart.setCandles(candles);

      // ── Crosshair → OHLCV overlay ─────────────────────────────────────────
      chart.onCrosshairMove(info => {
        if (info?.bar) setHoverOHLC(info.bar);
        else           setHoverOHLC(null);
      });

      // ── VWAP ──────────────────────────────────────────────────────────────
      if (settings.showVwap && isIntraday) {
        const todayIST   = new Date(Date.now() + IST_OFFSET_S * 1000).toISOString().slice(0, 10);
        const todayCdls  = candles.filter(c => new Date((c.time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10) === todayIST);
        const vwapData   = computeVWAP(todayCdls.length ? todayCdls : candles);
        chart.setLine('vwap', { data: vwapData, color: '#f59e0b', width: 2 });
        const last = vwapData[vwapData.length - 1]?.value;
        setVwap(last ?? null);
      } else {
        setVwap(null);
      }

      // ── OR Band ───────────────────────────────────────────────────────────
      if (settings.showOrBand && isIntraday && candles.length >= 1) {
        const todayIST = new Date(Date.now() + IST_OFFSET_S * 1000).toISOString().slice(0, 10);
        const dayStart = candles.findIndex(c => new Date((c.time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10) === todayIST);
        const orC = candles[dayStart >= 0 ? dayStart : 0];
        chart.setZone({ id: 'or_high', price: orC.high, color: 'rgba(96,165,250,0.8)',  label: 'OR H', style: 'dashed', inline: true });
        chart.setZone({ id: 'or_low',  price: orC.low,  color: 'rgba(96,165,250,0.8)',  label: 'OR L', style: 'dashed', inline: true });
      }

      // ── S/R zones from Station agent ──────────────────────────────────────
      if (settings.showSR) {
        const stations = stationData?.station?.allStations;
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
      }

      // ── EMA lines ─────────────────────────────────────────────────────────
      if (settings.showEma9)  chart.setLine('ema9',  { data: computeEMA(candles, 9),  color: EMA_COLORS.ema9,  width: 2 });
      if (settings.showEma21) chart.setLine('ema21', { data: computeEMA(candles, 21), color: EMA_COLORS.ema21, width: 2 });
      if (settings.showEma50) chart.setLine('ema50', { data: computeEMA(candles, 50), color: EMA_COLORS.ema50, width: 2 });

      // ── EMA 9 Daily — flat zone line on intraday ──────────────────────────
      if (settings.showEma9D && isIntraday && dailyCandles.length >= 9) {
        const val = computeEMA(dailyCandles, 9).at(-1)?.value;
        if (val) chart.setZone({ id: 'ema9d', price: val, color: 'rgba(232,121,249,0.85)', label: 'D·EMA9', style: 'solid', width: 2.5, inline: true });
      }

      // ── EMA 9 Weekly — flat zone line on daily chart ──────────────────────
      if (settings.showEma9W && !isIntraday && dailyCandles.length >= 9) {
        const val = computeEMA(aggregateWeekly(dailyCandles), 9).at(-1)?.value;
        if (val) chart.setZone({ id: 'ema9w', price: val, color: 'rgba(251,146,60,0.85)', label: 'W·EMA9', style: 'solid', width: 2.5, inline: true });
      }

      // ── SMC overlays (BOS · OB · FVG) ────────────────────────────────────
      if (settings.showSMC && candles.length > 10) {
        const smc = computeSMC(candles);
        if (smc) chart.setSMC(smc);
        else chart.clearSMC();
      } else {
        chart.clearSMC();
      }

      // ── Volume ────────────────────────────────────────────────────────────
      chart.setShowVolume(settings.showVolume);
    });

    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [candles, dailyCandles, chartInterval, stationData, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = key => setSettings(s => {
    const next = { ...s, [key]: !s[key] };
    try { localStorage.setItem('tv_chart_settings', JSON.stringify(next)); } catch {}
    return next;
  });

  const isIntraday = chartInterval !== 'day';
  const ltp        = candles.length > 0 ? candles[candles.length - 1].close : null;
  const open0      = candles.length > 0 ? candles[0].open : null;
  const changePct  = ltp != null && open0 ? ((ltp - open0) / open0) * 100 : null;
  const isUp       = changePct != null ? changePct >= 0 : null;
  const regime          = regimeData?.regime ? (REGIME_BADGE[regimeData.regime] || REGIME_BADGE.INITIALIZING) : null;
  const confColor       = regimeData?.confidence ? (CONF_COLORS[regimeData.confidence] || 'text-slate-400') : 'text-slate-400';
  const scenarioResult  = stationData?.scenario || null;
  const scenarioConfCls = scenarioResult?.confidence ? (CONF_COLORS[scenarioResult.confidence] || 'text-slate-400') : 'text-slate-400';
  const anyEma = settings.showEma9 || settings.showEma21 || settings.showEma50 ||
                 (settings.showEma9D && isIntraday) || (settings.showEma9W && !isIntraday);

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
          <span className="text-white font-bold text-sm tracking-wide">{symbol}</span>

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
            onClick={() => chartRef.current?.fitContent()}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
            title="Reset view (or double-click chart)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
            </svg>
            <span className="hidden sm:inline">Reset</span>
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

        {/* OHLCV overlay — top-left */}
        {(() => {
          const bar    = hoverOHLC || (candles.length > 0 ? candles[candles.length - 1] : null);
          const chgPct = bar ? ((bar.close - bar.open) / bar.open * 100) : null;
          const barUp  = bar ? bar.close >= bar.open : null;
          return (
            <div className="absolute top-2 left-2 z-10 pointer-events-none select-none">
              <div className="text-[10px] text-slate-600 font-mono">
                {symbol} · {INTERVAL_LABELS[chartInterval] ?? chartInterval}
              </div>
              {bar && (
                <>
                  <div className="hidden sm:flex items-center gap-2 mt-0.5 text-[11px] font-mono">
                    <span className="text-slate-400">O <span className="text-white">{bar.open.toFixed(2)}</span></span>
                    <span className="text-slate-400">H <span className="text-emerald-400">{bar.high.toFixed(2)}</span></span>
                    <span className="text-slate-400">L <span className="text-red-400">{bar.low.toFixed(2)}</span></span>
                    <span className="text-slate-400">C <span className={barUp ? 'text-emerald-400' : 'text-red-400'}>{bar.close.toFixed(2)}</span></span>
                    {chgPct != null && <span className={barUp ? 'text-emerald-400' : 'text-red-400'}>{barUp ? '+' : ''}{chgPct.toFixed(2)}%</span>}
                    {bar.volume != null && <span className="text-slate-400">V <span className="text-white">{fmtVol(bar.volume)}</span></span>}
                  </div>
                  <div className="sm:hidden mt-0.5 font-mono space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className={`font-semibold ${barUp ? 'text-emerald-400' : 'text-red-400'}`}>{bar.close.toFixed(2)}</span>
                      {chgPct != null && <span className={`text-[10px] ${barUp ? 'text-emerald-400' : 'text-red-400'}`}>{barUp ? '+' : ''}{chgPct.toFixed(2)}%</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span>O <span className="text-white">{bar.open.toFixed(1)}</span></span>
                      <span>H <span className="text-emerald-400">{bar.high.toFixed(1)}</span></span>
                      <span>L <span className="text-red-400">{bar.low.toFixed(1)}</span></span>
                      {bar.volume != null && <span>V <span className="text-white">{fmtVol(bar.volume)}</span></span>}
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
          <div className="absolute bottom-4 left-3 z-10 flex items-center gap-1.5 bg-[#0a0e1a]/90 border border-amber-500/20 rounded-lg px-2.5 py-1 pointer-events-none select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-[10px] text-amber-500 font-mono font-semibold">VWAP</span>
            <span className="text-[10px] text-slate-400 font-mono">₹{vwap.toFixed(1)}</span>
          </div>
        )}

        {/* Regime badge — bottom-left (above VWAP if present) */}
        {regime && (
          <div className={`absolute ${settings.showVwap && isIntraday && vwap ? 'bottom-12' : 'bottom-4'} left-3 z-10 flex items-center gap-1.5 bg-[#0a0e1a]/90 border border-white/10 rounded-lg px-2.5 py-1.5 pointer-events-none select-none`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${regime.dot}`} />
            <span className="text-xs font-semibold text-white">{regime.label}</span>
            {regimeData?.confidence && (
              <span className={`text-[10px] font-bold ${confColor}`}>{regimeData.confidence}</span>
            )}
          </div>
        )}

        {/* Scenario badge — bottom-right */}
        {scenarioResult?.label && scenarioResult.scenario !== 'UNCLEAR' && (
          <div className="absolute bottom-4 right-3 z-10 flex items-center gap-1 bg-[#0a0e1a]/90 border border-white/10 rounded-lg px-2.5 py-1.5 pointer-events-none select-none">
            <span className="text-xs text-slate-400">{scenarioResult.label}</span>
            {scenarioResult.confidence && (
              <span className={`text-[10px] font-bold ml-1 ${scenarioConfCls}`}>{scenarioResult.confidence}</span>
            )}
          </div>
        )}

      </div>{/* end chart area */}

      {/* ── Settings panel: bottom sheet on mobile, dropdown on desktop ──────── */}
      {showSettings && (
        isMobile ? (
          <div className="fixed inset-0 z-[200] flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowSettings(false)} />
            <div className="relative bg-[#111827] border-t border-white/[0.12] rounded-t-2xl shadow-2xl p-4 pb-8">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-3 px-1">Chart Overlays</div>
              <div className="grid grid-cols-2 gap-1">
                {OVERLAY_DEFS.map(({ key, label, color, intradayOnly, dailyOnly }) => {
                  const disabled = (intradayOnly && !isIntraday) || (dailyOnly && isIntraday);
                  const on       = settings[key] && !disabled;
                  return (
                    <button key={key} onClick={() => !disabled && toggle(key)} disabled={disabled}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors text-left ${
                        disabled ? 'opacity-25 cursor-not-allowed' : on ? 'bg-slate-700' : 'hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="w-4 h-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: color, opacity: on ? 1 : 0.3 }} />
                      <span className={`text-sm flex-1 ${on ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                    </button>
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
                {OVERLAY_DEFS.map(({ key, label, color, intradayOnly, dailyOnly }) => {
                  const disabled = (intradayOnly && !isIntraday) || (dailyOnly && isIntraday);
                  const on       = settings[key] && !disabled;
                  return (
                    <button key={key} onClick={() => !disabled && toggle(key)} disabled={disabled}
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
                  );
                })}
              </div>
            </div>
          )
        )
      )}
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
