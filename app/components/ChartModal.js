'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import DrawingToolbar from '@/app/components/DrawingToolbar';
import { 
  computeIchimoku, computeVWAP, computeEMA, computeRSI, 
  computeSMAAligned, computeBB, computeSMC, computeCPR, aggregateWeekly
} from '@/app/lib/chart-indicators';

// ── Interval tabs ──────────────────────────────────────────────────────────────
const INTERVAL_LABELS = {
  '5minute':  '5m',
  '15minute': '15m',
  '60minute': '1H',
  'day':      'D',
  'week':     'W',
};

// ── EMA colours (shared palette) ──────────────────────────────────────────────
const EMA_COLORS = {
  ema9:  '#22d3ee',
  ema21: '#f97316',
  ema50: '#a78bfa',
  ema9D: '#e879f9',
  ema9W: '#fb923c',
};

// ── Overlay catalogue — mirrors chart/page.js exactly ─────────────────────────
const OVERLAY_DEFS = [
  { key: 'showVwap',   label: 'VWAP',                   color: '#f59e0b',         intradayOnly: true,  dailyOnly: false },
  { key: 'showOrBand', label: 'OR Band',                 color: '#3b82f6',         intradayOnly: true,  dailyOnly: false },
  { key: 'showSR',     label: 'S/R Zones',               color: '#94a3b8',         intradayOnly: false, dailyOnly: false },
  { key: 'showEma9',   label: 'EMA 9',                   color: EMA_COLORS.ema9,  intradayOnly: false, dailyOnly: false },
  { key: 'showEma21',  label: 'EMA 21',                  color: EMA_COLORS.ema21, intradayOnly: false, dailyOnly: false },
  { key: 'showEma50',  label: 'EMA 50',                  color: EMA_COLORS.ema50, intradayOnly: false, dailyOnly: false },
  { key: 'showEma9D',  label: 'EMA 9 Daily',             color: EMA_COLORS.ema9D, intradayOnly: true,  dailyOnly: false },
  { key: 'showEma9W',  label: 'EMA 9 Weekly',            color: EMA_COLORS.ema9W, intradayOnly: false, dailyOnly: true  },
  { key: 'showVolume', label: 'Volume',                   color: '#475569',         intradayOnly: false, dailyOnly: false },
  { key: 'showSMC',    label: 'SMC  (BOS · OB · FVG)',   color: '#6366f1',         intradayOnly: false, dailyOnly: false },
  { key: 'showCPR',    label: 'CPR  (TC · P · BC)',       color: '#6366f1',         intradayOnly: false, dailyOnly: false },
  { key: 'showBB',     label: 'Bollinger Bands',          color: '#2962ff',         intradayOnly: false, dailyOnly: false, hasParams: true },
  { key: 'showRSI',    label: 'RSI',                      color: '#818cf8',         intradayOnly: false, dailyOnly: false, hasParams: true },
  { key: 'showIchimoku', label: 'Ichimoku Cloud',         color: '#10b981',         intradayOnly: false, dailyOnly: false, hasParams: true },
];

const DEFAULT_SETTINGS = {
  showVwap:    true,
  showOrBand:  true,
  showSR:      true,
  showEma9:    true,
  showEma21:   true,
  showEma50:   false,
  showEma9D:   true,
  showEma9W:   true,
  showVolume:  true,
  showSMC:     true,
  showCPR:     false,
  showBB:      false,
  showRSI:     false,
  showIchimoku:false,
  ichiCloud:   true,
  ichiTenkan:  true,
  ichiKijun:   true,
  ichiChikou:  false,
  bullColor:   '#22c55e',
  bearColor:   '#ef4444',
  rsiPeriod:   12,
  rsiMAPeriod: 5,
  bbLength:    20,
  bbMult:      2.0,
};

const SETTINGS_KEY = 'tv_chart_settings'; // shared with chart/page.js
const IST_OFFSET_S = 5.5 * 3600;
const RSI_MIN_H = 50;
const RSI_MAX_H = 200;

// ── Compute functions (identical to chart/page.js) ────────────────────────────
// Note: All indicator computation functions have been removed to avoid duplication.
// They are now imported from @/app/lib/chart-indicators at the top of the file.

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChartModal({
  symbol, ltp, regimeData, stationIntel, scenarioResult, transactionType, onClose,
}) {
  const [chartInterval, setChartInterval] = useState('5minute');
  const [candles, setCandles]             = useState([]);
  const [dailyCandles, setDailyCandles]   = useState([]);
  const [loading, setLoading]             = useState(false);
  const [settings, setSettings]           = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings]   = useState(false);
  const [dropdownPos, setDropdownPos]     = useState(null);
  const [configPage, setConfigPage]       = useState(null);
  const [hoverOHLC, setHoverOHLC]         = useState(null);
  const [vwap, setVwap]                   = useState(null);
  const [chartRsiH, setChartRsiH]         = useState(80);
  const [activeTool, setActiveTool]       = useState(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [chartTheme, setChartTheme]       = useState('dark');

  const containerRef    = useRef(null);
  const chartRef        = useRef(null);
  const settingsBtnRef  = useRef(null);
  const dropdownRef     = useRef(null);
  const chartRsiHRef    = useRef(80);
  const rsiDragRef      = useRef(null);
  const chartCreatedForRef = useRef({ candles: null, interval: null, theme: null, el: null });

  // ── Load persisted settings + theme (shared with chart/page.js) ──────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) setSettings(s => ({ ...s, ...JSON.parse(saved) }));
    } catch {}
    try {
      const saved = localStorage.getItem('tv_chart_theme');
      if (saved && saved !== 'dark') setChartTheme(saved);
    } catch {}
  }, []);

  // ── ESC to close ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') {
        if (activeTool) { chartRef.current?.cancelDrawing(); setActiveTool(null); return; }
        onClose();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
        chartRef.current?.deleteDrawing(selectedDrawingId);
        setSelectedDrawingId(null);
        try { localStorage.setItem(drawingKey(symbol, chartInterval), JSON.stringify(chartRef.current?.getDrawings() ?? [])); } catch {}
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, activeTool, selectedDrawingId, symbol, chartInterval]);

  // ── Click outside dropdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (!showSettings) return;
    const onOutside = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          settingsBtnRef.current && !settingsBtnRef.current.contains(e.target)) setShowSettings(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [showSettings]);

  const drawingKey = (sym, iv) => `tv_drawings_${sym}_${iv}`;

  // ── Fetch candles ─────────────────────────────────────────────────────────────
  const fetchCandles = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setCandles([]);
    setDailyCandles([]);

    const isWeekly = chartInterval === 'week';
    const apiInterval = isWeekly ? 'day' : chartInterval;
    const needDaily = !['day', 'week'].includes(chartInterval);

    try {
      const [cd, dd] = await Promise.all([
        fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=${apiInterval}${['day', 'week'].includes(chartInterval) ? '&days=730' : ''}`).then(r => r.json()),
        needDaily
          ? fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=day&days=730`).then(r => r.json())
          : Promise.resolve(null),
      ]);
      const rawDaily = cd?.candles || [];
      const c = isWeekly ? aggregateWeekly(rawDaily) : rawDaily;
      setCandles(c);
      setDailyCandles(isWeekly ? rawDaily : (needDaily ? (dd?.candles || []) : c));
    } catch {}
    setLoading(false);
  }, [symbol, chartInterval]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  // ── Sync drawing tool to chart ────────────────────────────────────────────────
  useEffect(() => { chartRef.current?.setActiveTool(activeTool ?? null); }, [activeTool]);

  // ── Build / update chart ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const el = containerRef.current;
    const isIntraday = chartInterval !== 'day' && chartInterval !== 'week';
    const cf = chartCreatedForRef.current;
    const needsRecreation = !chartRef.current || cf.el !== el || cf.interval !== chartInterval || cf.theme !== chartTheme;

    const applyOverlays = (chart) => {
      // VWAP
      if (settings.showVwap && isIntraday) {
        const lastDate = new Date((candles[candles.length - 1].time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10);
        const sessCdls = candles.filter(c => new Date((c.time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10) === lastDate);
        const vwapData = computeVWAP(sessCdls.length ? sessCdls : candles.slice(-1));
        chart.setLine('vwap', { data: vwapData, color: '#f59e0b', width: 2 });
        setVwap(vwapData[vwapData.length - 1]?.value ?? null);
      } else {
        chart.clearLine('vwap');
        setVwap(null);
      }

      // OR Band
      if (settings.showOrBand && isIntraday && candles.length >= 1) {
        const lastDate = new Date((candles[candles.length - 1].time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10);
        const dayStart = candles.findIndex(c => new Date((c.time + IST_OFFSET_S) * 1000).toISOString().slice(0, 10) === lastDate);
        const orC = candles[dayStart >= 0 ? dayStart : 0];
        chart.setZone({ id: 'or_high', price: orC.high, color: 'rgba(96,165,250,0.8)',  label: 'OR H', style: 'dashed', inline: true });
        chart.setZone({ id: 'or_low',  price: orC.low,  color: 'rgba(96,165,250,0.8)',  label: 'OR L', style: 'dashed', inline: true });
      } else {
        chart.clearZone('or_high');
        chart.clearZone('or_low');
      }

      // S/R zones from passed stationIntel prop
      if (settings.showSR) {
        const stations = stationIntel?.result?.station?.allStations;
        chart.clearZonesWithPrefix('sr_');
        if (stations?.length) {
          const ltp    = candles[candles.length - 1]?.close || 0;
          const dist   = s => Math.abs(s.price - ltp);
          const broken = s => (s.type === 'SUPPORT' && ltp < s.price) || (s.type === 'RESISTANCE' && ltp > s.price);
          const sup = stations.filter(s => s.type === 'SUPPORT').sort((a, b) => dist(a) - dist(b)).slice(0, 4);
          const res = stations.filter(s => s.type === 'RESISTANCE').sort((a, b) => dist(a) - dist(b)).slice(0, 4);
          for (const s of sup) chart.setZone({ id: `sr_s_${s.price}`, price: s.price, color: broken(s) ? 'rgba(134,239,172,0.55)' : 'rgba(74,222,128,0.85)', label: `S${s.quality >= 7 ? '★' : ''}`, style: 'dashed', inline: true });
          for (const r of res) chart.setZone({ id: `sr_r_${r.price}`, price: r.price, color: broken(r) ? 'rgba(252,165,165,0.55)' : 'rgba(248,113,113,0.85)', label: `R${r.quality >= 7 ? '★' : ''}`, style: 'dashed', inline: true });
        }
      } else {
        chart.clearZonesWithPrefix('sr_');
      }

      // EMAs
      if (settings.showEma9)  chart.setLine('ema9',  { data: computeEMA(candles, 9),  color: EMA_COLORS.ema9,  width: 2 }); else chart.clearLine('ema9');
      if (settings.showEma21) chart.setLine('ema21', { data: computeEMA(candles, 21), color: EMA_COLORS.ema21, width: 2 }); else chart.clearLine('ema21');
      if (settings.showEma50) chart.setLine('ema50', { data: computeEMA(candles, 50), color: EMA_COLORS.ema50, width: 2 }); else chart.clearLine('ema50');

      // EMA 9 Daily flat line (intraday only)
      if (settings.showEma9D && isIntraday && dailyCandles.length >= 9) {
        const val = computeEMA(dailyCandles, 9).at(-1)?.value;
        if (val) chart.setZone({ id: 'ema9d', price: val, color: 'rgba(232,121,249,0.85)', label: 'D·EMA9', style: 'solid', width: 2.5, inline: true });
      } else { chart.clearZone('ema9d'); }

      // EMA 9 Weekly flat line (daily only)
      if (settings.showEma9W && chartInterval === 'day' && dailyCandles.length >= 9) {
        const val = computeEMA(aggregateWeekly(dailyCandles), 9).at(-1)?.value;
        if (val) chart.setZone({ id: 'ema9w', price: val, color: 'rgba(251,146,60,0.85)', label: 'W·EMA9', style: 'solid', width: 2.5, inline: true });
      } else { chart.clearZone('ema9w'); }

      // SMC
      if (settings.showSMC && candles.length > 10) {
        const smc = computeSMC(candles);
        if (smc) chart.setSMC(smc); else chart.clearSMC();
      } else { chart.clearSMC(); }

      // CPR
      if (settings.showCPR) {
        const segs = computeCPR(candles, dailyCandles, chartInterval);
        chart.setCPR(segs.length ? segs : null);
      } else { chart.clearCPR(); }

      // Bollinger Bands
      if (settings.showBB && candles.length >= (settings.bbLength ?? 20)) {
        chart.setBB(computeBB(candles, settings.bbLength ?? 20, settings.bbMult ?? 2.0));
      } else { chart.clearBB(); }

      // Ichimoku Cloud
      if (settings.showIchimoku && candles.length >= 26) {
        chart.setIchimoku(computeIchimoku(candles), {
          showTenkan: settings.ichiTenkan,
          showKijun: settings.ichiKijun,
          showCloud: settings.ichiCloud,
          showChikou: settings.ichiChikou
        });
      } else { chart.clearIchimoku(); }

      // Candle colours
      chart.setCandleColors({ bull: settings.bullColor, bear: settings.bearColor });

      // Volume
      chart.setShowVolume(settings.showVolume);

      // RSI
      if (settings.showRSI && candles.length > (settings.rsiPeriod ?? 12) + 1) {
        const period = settings.rsiPeriod ?? 12;
        const maPeriod = settings.rsiMAPeriod ?? 5;
        const rsi = computeRSI(candles, period);
        const rsiMA = maPeriod >= 2 ? computeSMAAligned(rsi, maPeriod) : null;
        chart.setRSIPane(rsi, rsiMA, maPeriod >= 2 ? `RSI(${period},${maPeriod})` : `RSI(${period})`);
        chart.setRSIPaneHeight(chartRsiHRef.current);
      } else { chart.clearRSIPane(); }
    };

    if (!needsRecreation) {
      if (cf.candles !== candles) {
        chartRef.current.updateCandles(candles);
        chartCreatedForRef.current = { ...cf, candles };
      }
      applyOverlays(chartRef.current);
      return;
    }

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    import('@/app/lib/chart/Chart.js').then(({ createChart }) => {
      if (!containerRef.current) return;
      const chart = createChart(el, { interval: chartInterval, theme: chartTheme });
      chartRef.current = chart;
      chartCreatedForRef.current = { el, candles, interval: chartInterval, theme: chartTheme };

      chart.onCrosshairMove(info => { if (info?.bar) setHoverOHLC(info.bar); else setHoverOHLC(null); });
      chart.onDrawingSelect(id => setSelectedDrawingId(id ?? null));

      chart.setCandles(candles);
      const defaultBars = { '5minute': 234, '15minute': 104, '60minute': 150, 'week': 52 }[chartInterval];
      if (defaultBars) chart.fitRecent(defaultBars);

      // Load saved drawings (shared with chart/page.js)
      try {
        const saved = localStorage.getItem(drawingKey(symbol, chartInterval));
        if (saved) chart.setDrawings(JSON.parse(saved));
      } catch {}

      chart.onDrawingComplete((_, all) => {
        try { localStorage.setItem(drawingKey(symbol, chartInterval), JSON.stringify(all)); } catch {}
      });

      if (activeTool) chart.setActiveTool(activeTool);
      applyOverlays(chart);
    });
  }, [candles, dailyCandles, chartInterval, chartTheme, stationIntel, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Destroy on unmount
  useEffect(() => {
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, []);

  // ── RSI drag-resize ───────────────────────────────────────────────────────────
  const onRsiDragStart = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = chartRsiHRef.current;
    const onMove = (mv) => {
      const newH = Math.min(RSI_MAX_H, Math.max(RSI_MIN_H, startH - (mv.clientY - startY)));
      chartRsiHRef.current = newH;
      setChartRsiH(newH);
      chartRef.current?.setRSIPaneHeight(newH);
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    rsiDragRef.current = { onMove, onUp };
  };

  const toggle = key => setSettings(s => {
    const next = { ...s, [key]: !s[key] };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    return next;
  });

  const setNum = (key, val) => setSettings(s => {
    const next = { ...s, [key]: val };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    return next;
  });

  const setSetting = (key, val) => setSettings(s => {
    const next = { ...s, [key]: val };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    return next;
  });

  const toggleTheme = () => {
    const next = chartTheme === 'dark' ? 'light' : 'dark';
    setChartTheme(next);
    try { localStorage.setItem('tv_chart_theme', next); } catch {}
    chartRef.current?.setTheme(next);
  };

  const openSettings = () => {
    if (showSettings) { setShowSettings(false); setConfigPage(null); return; }
    const rect = settingsBtnRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setShowSettings(true);
    setConfigPage(null);
  };

  const isIntraday = chartInterval !== 'day' && chartInterval !== 'week';
  const anyEma = settings.showEma9 || settings.showEma21 || settings.showEma50 ||
                 (settings.showEma9D && isIntraday) || (settings.showEma9W && chartInterval === 'day');

  const CONF_COLORS = { HIGH: 'text-emerald-400', MEDIUM: 'text-amber-400', LOW: 'text-slate-500' };
  const REGIME_BADGE = {
    TREND_DAY_UP:     { dot: 'bg-green-400',   label: 'Trend ↑'       },
    TREND_DAY_DOWN:   { dot: 'bg-red-400',     label: 'Trend ↓'       },
    RANGE_DAY:        { dot: 'bg-amber-400',   label: 'Range Day'     },
    BREAKOUT_DAY:     { dot: 'bg-blue-400',    label: 'Breakout'      },
    SHORT_SQUEEZE:    { dot: 'bg-emerald-400', label: 'Short Squeeze' },
    LONG_LIQUIDATION: { dot: 'bg-red-500',     label: 'Long Liq.'     },
    TRAP_DAY:         { dot: 'bg-orange-400',  label: 'Trap Day ⚠'    },
    LOW_VOL_DRIFT:    { dot: 'bg-slate-400',   label: 'Low Vol'       },
  };

  const regime       = regimeData?.regime ? (REGIME_BADGE[regimeData.regime] || null) : null;
  const confColor    = regimeData?.confidence ? (CONF_COLORS[regimeData.confidence] || 'text-slate-400') : 'text-slate-400';
  const scenCls      = scenarioResult?.confidence ? (CONF_COLORS[scenarioResult.confidence] || 'text-slate-400') : 'text-slate-400';

  const rsiBottom = (settings.showRSI ? chartRsiH + 28 : 0) + 10;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed z-50 flex flex-col bg-[#0a0e1a] border border-white/[0.08] rounded-2xl overflow-hidden"
        style={{ top: '2.5vh', left: '2.5vw', width: '95vw', height: '95vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
          {/* Symbol + price */}
          <span className="text-white font-bold text-sm tracking-wide">{symbol}</span>
          {ltp != null && (
            <span className="font-mono text-xs text-slate-300">₹{typeof ltp === 'number' ? ltp.toFixed(2) : ltp}</span>
          )}

          <div className="flex-1" />

          {/* Interval tabs */}
          <div className="flex items-center gap-0.5">
            {Object.entries(INTERVAL_LABELS).map(([val, label]) => (
              <button key={val} onClick={() => setChartInterval(val)}
                className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                  chartInterval === val ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
                }`}
              >{label}</button>
            ))}
          </div>

          <span className="w-px h-4 bg-white/10 mx-1" />

          {/* Theme toggle */}
          <button onClick={toggleTheme}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
            title={chartTheme === 'dark' ? 'Switch to light chart' : 'Switch to dark chart'}
          >
            {chartTheme === 'dark' ? (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
              </svg>
            )}
          </button>

          {/* Overlays */}
          <button ref={settingsBtnRef} onClick={openSettings}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              showSettings ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
            </svg>
            Overlays
          </button>

          {/* Close */}
          <button onClick={onClose}
            className="ml-1 p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
            </svg>
          </button>
        </div>

        {/* ── Chart area ──────────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#0a0e1a]">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <span className="w-4 h-4 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
                Loading…
              </div>
            </div>
          )}

          {!loading && candles.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#0a0e1a]">
              <div className="flex flex-col items-center gap-4 bg-[#111827] border border-white/[0.12] rounded-2xl px-8 py-6">
                <span className="text-2xl">⚠</span>
                <div className="text-center">
                  <p className="text-white font-semibold text-sm">Could not load chart data</p>
                  <p className="text-slate-400 text-xs mt-1">{symbol}</p>
                </div>
                <button onClick={fetchCandles}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
                >Retry</button>
              </div>
            </div>
          )}

          {/* Canvas */}
          <div ref={containerRef} key={`${symbol}-${chartInterval}`} className="w-full h-full" />

          {/* Drawing toolbar */}
          <DrawingToolbar
            activeTool={activeTool}
            onToolSelect={setActiveTool}
            selectedDrawingId={selectedDrawingId}
            onDeleteSelected={() => {
              if (!selectedDrawingId) return;
              chartRef.current?.deleteDrawing(selectedDrawingId);
              setSelectedDrawingId(null);
              try { localStorage.setItem(drawingKey(symbol, chartInterval), JSON.stringify(chartRef.current?.getDrawings() ?? [])); } catch {}
            }}
            onClearAll={() => {
              chartRef.current?.clearDrawings();
              setSelectedDrawingId(null);
              try { localStorage.removeItem(drawingKey(symbol, chartInterval)); } catch {}
            }}
          />

          {/* RSI drag handle */}
          {settings.showRSI && (
            <div
              onMouseDown={onRsiDragStart}
              className="absolute left-0 right-0 h-2 cursor-ns-resize z-20 flex items-center justify-center group"
              style={{ bottom: rsiBottom - 4 }}
            >
              <div className="w-10 h-0.5 rounded-full bg-slate-700 group-hover:bg-indigo-500 transition-colors" />
            </div>
          )}

          {/* OHLC hover */}
          {hoverOHLC && (
            <div className="absolute top-2 left-14 z-10 flex items-center gap-3 pointer-events-none select-none">
              {[['O', hoverOHLC.open], ['H', hoverOHLC.high], ['L', hoverOHLC.low], ['C', hoverOHLC.close]].map(([k, v]) => (
                <span key={k} className="text-[10px] font-mono text-slate-400">
                  <span className="text-slate-600">{k} </span>{v?.toFixed(2)}
                </span>
              ))}
              {hoverOHLC.volume > 0 && (
                <span className="text-[10px] font-mono text-slate-400">
                  <span className="text-slate-600">V </span>
                  {hoverOHLC.volume >= 1e7 ? (hoverOHLC.volume / 1e7).toFixed(2) + 'Cr' : hoverOHLC.volume >= 1e5 ? (hoverOHLC.volume / 1e5).toFixed(2) + 'L' : hoverOHLC.volume.toLocaleString()}
                </span>
              )}
            </div>
          )}

          {/* EMA legend */}
          {anyEma && !hoverOHLC && (
            <div className="absolute top-2 left-14 z-10 flex items-center gap-3 pointer-events-none select-none">
              {settings.showEma9  && <span className="text-[10px] font-mono font-semibold" style={{ color: EMA_COLORS.ema9  }}>EMA9</span>}
              {settings.showEma21 && <span className="text-[10px] font-mono font-semibold" style={{ color: EMA_COLORS.ema21 }}>EMA21</span>}
              {settings.showEma50 && <span className="text-[10px] font-mono font-semibold" style={{ color: EMA_COLORS.ema50 }}>EMA50</span>}
              {settings.showEma9D && isIntraday && <span className="text-[10px] font-mono font-semibold" style={{ color: EMA_COLORS.ema9D }}>D·EMA9</span>}
              {settings.showEma9W && chartInterval === 'day' && <span className="text-[10px] font-mono font-semibold" style={{ color: EMA_COLORS.ema9W }}>W·EMA9</span>}
            </div>
          )}

          {/* VWAP badge */}
          {settings.showVwap && isIntraday && vwap != null && (
            <div className="absolute left-14 z-10 flex items-center gap-1.5 bg-[#0a0e1a]/90 border border-amber-500/20 rounded-lg px-2.5 py-1 pointer-events-none select-none"
              style={{ bottom: rsiBottom + 40 }}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-[10px] text-amber-500 font-mono font-semibold">VWAP</span>
              <span className="text-[10px] text-slate-400 font-mono">₹{vwap.toFixed(1)}</span>
            </div>
          )}

          {/* Regime badge */}
          {regime && (
            <div className="absolute left-14 z-10 flex items-center gap-1.5 bg-[#0a0e1a]/90 border border-white/10 rounded-lg px-2.5 py-1.5 pointer-events-none select-none"
              style={{ bottom: rsiBottom + 10 }}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${regime.dot}`} />
              <span className="text-xs font-semibold text-slate-300">{regime.label}</span>
              {regimeData?.confidence && <span className={`text-[10px] font-bold ${confColor}`}>{regimeData.confidence}</span>}
            </div>
          )}

          {/* Scenario badge */}
          {scenarioResult?.label && scenarioResult.scenario !== 'UNCLEAR' && (
            <div className="absolute right-14 z-10 flex items-center gap-1 bg-[#0a0e1a]/90 border border-white/10 rounded-lg px-2.5 py-1.5 pointer-events-none select-none"
              style={{ bottom: rsiBottom + 10 }}>
              <span className="text-xs text-slate-400">{scenarioResult.label}</span>
              {scenarioResult.confidence && <span className={`text-[10px] font-bold ml-1 ${scenCls}`}>{scenarioResult.confidence}</span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Overlays dropdown — fixed, never clipped ──────────────────────────── */}
      {showSettings && dropdownPos && (
        <div ref={dropdownRef}
          className="fixed z-[200] bg-[#111827] border border-white/[0.12] rounded-xl shadow-2xl p-3"
          style={{ top: dropdownPos.top, right: dropdownPos.right, minWidth: 196 }}
        >
          {configPage ? (
            <div>
              <button onClick={() => setConfigPage(null)} className="flex items-center gap-1.5 mb-3 text-[10px] uppercase font-bold text-slate-400 hover:text-white transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Back
              </button>
              <div className="text-xs text-white font-semibold mb-3 px-1">{OVERLAY_DEFS.find(d => d.key === configPage)?.label}</div>
              
              {configPage === 'showBB' && (
                <div className="flex flex-col gap-3 px-1 pb-1 text-[11px] text-slate-400">
                  <label className="flex items-center justify-between gap-3">
                    Length
                    <input type="number" min={2} max={200} value={settings.bbLength ?? 20}
                      onChange={e => setNum('bbLength', Math.max(2, Math.min(200, +e.target.value || 20)))}
                      className="w-14 bg-slate-800 border border-white/10 rounded px-2 py-1 text-white text-center" />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    StdDev
                    <input type="number" min={0.1} max={5} step={0.1} value={settings.bbMult ?? 2.0}
                      onChange={e => setNum('bbMult', Math.max(0.1, Math.min(5, +e.target.value || 2.0)))}
                      className="w-14 bg-slate-800 border border-white/10 rounded px-2 py-1 text-white text-center" />
                  </label>
                </div>
              )}
              {configPage === 'showRSI' && (
                <div className="flex flex-col gap-3 px-1 pb-1 text-[11px] text-slate-400">
                  <label className="flex items-center justify-between gap-3">
                    Period
                    <input type="number" min={2} max={50} value={settings.rsiPeriod ?? 12}
                      onChange={e => setNum('rsiPeriod', Math.max(2, Math.min(50, +e.target.value || 12)))}
                      className="w-14 bg-slate-800 border border-white/10 rounded px-2 py-1 text-white text-center" />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    MA
                    <input type="number" min={0} max={30} value={settings.rsiMAPeriod ?? 5}
                      onChange={e => setNum('rsiMAPeriod', Math.max(0, Math.min(30, +e.target.value || 0)))}
                      className="w-14 bg-slate-800 border border-white/10 rounded px-2 py-1 text-white text-center" />
                  </label>
                </div>
              )}
              {configPage === 'showIchimoku' && (
                <div className="flex flex-col gap-2.5 px-1 pb-1 text-[11px] text-slate-400">
                  {[
                    { k: 'ichiCloud', label: 'Kumo (Cloud)', color: '#10b981' },
                    { k: 'ichiTenkan', label: 'Tenkan-sen', color: '#3b82f6' },
                    { k: 'ichiKijun', label: 'Kijun-sen', color: '#f59e0b' },
                    { k: 'ichiChikou', label: 'Chikou (Lag)', color: '#8b5cf6' }
                  ].map(({k, label, color}) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer hover:text-slate-200 transition-colors">
                      <input type="checkbox" checked={!!settings[k]} onChange={() => toggle(k)} className="w-3.5 h-3.5 accent-indigo-500 rounded bg-slate-800" />
                      <span className="w-3 h-0.5 rounded-full shrink-0" style={{backgroundColor: color}} />
                      <span className="flex-1">{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2 px-1">Chart Overlays</div>
              <div className="space-y-0.5">
                {OVERLAY_DEFS.map(({ key, label, color, intradayOnly, dailyOnly, hasParams }) => {
                  const disabled = (intradayOnly && !isIntraday) || (dailyOnly && chartInterval !== 'day');
                  const on = settings[key] && !disabled;
                  return (
                    <div key={key} className="flex items-center gap-1 w-full">
                      <button onClick={() => !disabled && toggle(key)} disabled={disabled}
                        className={`flex-1 flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors text-left ${
                          disabled ? 'opacity-25 cursor-not-allowed' : 'hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="flex items-center w-5 flex-shrink-0">
                          <span className="w-full h-0.5 rounded-full block" style={{ backgroundColor: color, opacity: on ? 1 : 0.2 }} />
                        </span>
                        <span className={`text-xs flex-1 ${on ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                        <span className={`text-[10px] font-bold text-right pl-1 ${on ? 'text-indigo-500' : 'text-slate-400'}`}>{on ? 'ON' : 'OFF'}</span>
                      </button>
                      {hasParams && on && (
                        <button onClick={(e) => { e.stopPropagation(); setConfigPage(key); }} className="p-1.5 ml-0.5 text-slate-400 hover:text-slate-100 bg-white/[0.04] hover:bg-white/[0.12] rounded-md transition-colors" title="Configure">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {/* Candle colors */}
          <div className="border-t border-white/[0.08] mt-2 pt-2 px-1">
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5">Candle Colors</div>
            {[['Bull', 'bullColor'], ['Bear', 'bearColor']].map(([lbl, key]) => (
              <div key={key} className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] text-slate-500 w-6">{lbl}</span>
                {['#22c55e','#26a69a','#ffffff','#3b82f6','#f59e0b','#ef4444','#f97316','#000000'].map(c => (
                  <button key={c} onClick={() => setSetting(key, c)}
                    className="w-4 h-4 rounded-full flex-shrink-0 transition-all"
                    style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid rgba(255,255,255,0.3)' : c === '#000000' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                      boxShadow: settings[key] === c ? `0 0 0 2px #fff` : 'none', transform: settings[key] === c ? 'scale(1.15)' : 'scale(1)' }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
