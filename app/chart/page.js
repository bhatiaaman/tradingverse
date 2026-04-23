'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import OrderModal         from '@/app/components/OrderModal';
import QuickOrder          from '@/app/components/QuickOrder';
import WatchlistDrawer     from '@/app/components/WatchlistDrawer';
import IntelligencePill   from '@/app/components/IntelligencePill';
import SymbolSearch        from '@/app/components/SymbolSearch';
import DrawingToolbar      from '@/app/components/DrawingToolbar';
import {
  aggregateWeekly, computeVWAP, computeEMA, computeRSI,
  computeSMAAligned, computeBB, computeSMC, computeCPR,
  computeIchimoku
} from '@/app/lib/chart-indicators';
import { useChartRefresh } from '@/app/lib/chart/useChartRefresh';
import { Loader2 } from 'lucide-react';

const RSI_MIN_H = 50;
const RSI_MAX_H = 200;

// Index symbols trade via options only — "+" opens a CE/PE picker instead of a stock order
const INDEX_STRIKE_STEP = { NIFTY: 50, BANKNIFTY: 100, FINNIFTY: 50, MIDCPNIFTY: 25, SENSEX: 100 };

const INTERVAL_LABELS = {
  '5minute':  '5m',
  '15minute': '15m',
  '60minute': '1H',
  'day':      'D',
  'week':     'W',
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

// Preset color palette for EMA line pickers
const EMA_LINE_PALETTE = ['#22d3ee','#f97316','#e879f9','#fb923c','#22c55e','#f59e0b','#ef4444','#ffffff','#94a3b8','#000000'];

const OVERLAY_DEFS = [
  { key: 'showVwap',   label: 'VWAP',         color: '#f59e0b',          intradayOnly: true,  dailyOnly: false },
  { key: 'showOrBand', label: 'OR Band',      color: '#3b82f6',          intradayOnly: true,  dailyOnly: false },
  { key: 'showSR',     label: 'S/R Zones',   color: '#94a3b8',          intradayOnly: false, dailyOnly: false },
  { key: 'showEma9',   label: 'EMA 9',        color: EMA_COLORS.ema9,   intradayOnly: false, dailyOnly: false, hasStyle: true, colorKey: 'ema9Color',  widthKey: 'ema9Width'  },
  { key: 'showEma21',  label: 'EMA 21',       color: EMA_COLORS.ema21,  intradayOnly: false, dailyOnly: false, hasStyle: true, colorKey: 'ema21Color', widthKey: 'ema21Width' },
  { key: 'showEma50',  label: 'EMA 50',       color: EMA_COLORS.ema50,  intradayOnly: false, dailyOnly: false, hasStyle: true, colorKey: 'ema50Color', widthKey: 'ema50Width' },
  { key: 'showEma9D',  label: 'EMA 9 Daily',  color: EMA_COLORS.ema9D,  intradayOnly: true,  dailyOnly: false, hasStyle: true, colorKey: 'ema9DColor', widthKey: 'ema9DWidth' },
  { key: 'showEma9W',  label: 'EMA 9 Weekly', color: EMA_COLORS.ema9W,  intradayOnly: false, dailyOnly: true,  hasStyle: true, colorKey: 'ema9WColor', widthKey: 'ema9WWidth' },
  { key: 'showVolume', label: 'Volume',       color: '#475569',          intradayOnly: false, dailyOnly: false },
  { key: 'showSMC',    label: 'SMC  (BOS · OB · FVG)', color: '#6366f1', intradayOnly: false, dailyOnly: false },
  { key: 'showCPR',    label: 'CPR  (TC · P · BC)',    color: '#6366f1', intradayOnly: false, dailyOnly: false },
  { key: 'showSL',     label: 'SL Clusters',           color: '#ef4444', intradayOnly: false, dailyOnly: false },
  { key: 'showBB',     label: 'Bollinger Bands', color: '#2962ff',        intradayOnly: false, dailyOnly: false, hasParams: true },
  { key: 'showRSI',    label: 'RSI',          color: '#818cf8',          intradayOnly: false, dailyOnly: false, hasParams: true },
  { key: 'showIchimoku', label: 'Ichimoku Cloud', color: '#10b981',        intradayOnly: false, dailyOnly: false, hasParams: true },
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
  showSL:        false,
  showBB:        false,
  showRSI:       false,
  showIchimoku:  false,
  ichiCloud:     true,
  ichiTenkan:    true,
  ichiKijun:     true,
  ichiChikou:    false,
  bullColor:     '#22c55e',
  bearColor:     '#ef4444',
  rsiPeriod:     12,
  rsiMAPeriod:   5,
  bbLength:      20,
  bbMult:        2.0,
  // EMA line styles
  ema9Color:     EMA_COLORS.ema9,
  ema9Width:     2,
  ema21Color:    EMA_COLORS.ema21,
  ema21Width:    2,
  ema50Color:    EMA_COLORS.ema50,
  ema50Width:    2,
  ema9DColor:    EMA_COLORS.ema9D,
  ema9DWidth:    2,
  ema9WColor:    EMA_COLORS.ema9W,
  ema9WWidth:    2,
};

function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e7) return (v / 1e7).toFixed(2) + 'Cr';
  if (v >= 1e5) return (v / 1e5).toFixed(2) + 'L';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return total >= 540 && total <= 935;
}

// ── Parse NFO option tradingsymbol (e.g. NIFTY2642124250CE → { underlying, expiry, strike, type }) ──
// Returns null for equity symbols. Handles NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, and stock options.
function parseOptionSymbol(sym) {
  if (!sym) return null;
  // NFO tradingsymbols: <NAME><YY><MMM|M><DD?><STRIKE><CE|PE>
  // e.g. NIFTY2441822000CE (weekly), NIFTY24APR22000CE (monthly)
  const m = sym.match(/^([A-Z&]+)(\d{2})([A-Z0-9]{1,3})(\d{0,2})(\d{4,})(\d+)?(CE|PE)$/);
  if (!m) return null;
  const [, underlying, yy, month, dd, strikePart, strikeDec, type] = m;
  const strike = parseFloat(strikePart + (strikeDec ? '.' + strikeDec : ''));
  return { underlying, expiry: `${yy}${month}${dd}`, strike, type };
}

// ── Inner chart component (uses useSearchParams) ──────────────────────────────
function ChartPageInner() {
  const params    = useSearchParams();
  const [symbol, setSymbol] = useState(() => params.get('symbol') || 'NIFTY');
  const atParam   = params.get('at')    || null;
  const atDirParam= params.get('atdir') || 'bull';
  const backParam = params.get('back');
  const themeParam = params.get('theme');

  // Detect when we're viewing an NFO option's chart (e.g. NIFTY2642124250CE)
  const parsedOption = parseOptionSymbol(symbol);
  const isOptionChart = !!parsedOption;
  const isIndex   = !isOptionChart && (symbol in INDEX_STRIKE_STEP);
  const step      = INDEX_STRIKE_STEP[symbol] ?? 1;

  const [chartInterval, setChartInterval] = useState(params.get('interval') || '5minute');
  const [candles, setCandles]             = useState([]);
  const [dailyCandles, setDailyCandles]   = useState([]);
  const [loading, setLoading]             = useState(true);
  const [vwap, setVwap]                   = useState(null);
  const [settings, setSettings]           = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings]   = useState(false);
  const [dropdownPos, setDropdownPos]     = useState(null);
  const [configPage, setConfigPage]       = useState(null);
  const [intelligence, setIntelligence]   = useState(null);
  const [slData, setSlData]               = useState(null);
  const [hoverOHLC, setHoverOHLC]         = useState(null);
  const [isMobile, setIsMobile]           = useState(false);
  const [chartTheme, setChartTheme]       = useState(themeParam === 'light' ? 'light' : 'dark');
  const [chartRsiH, setChartRsiH]         = useState(80);
  const [lastPriceY, setLastPriceY]         = useState(null);
  const [atRightEdge, setAtRightEdge]       = useState(true);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [indexPicker, setIndexPicker]       = useState(false);   // CE/PE picker for indices
  const [orderOptionType, setOrderOptionType] = useState(null);  // 'CE' | 'PE' | null
  const [activeTool, setActiveTool]         = useState(null);    // drawing tool id or null
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [quickOrderOpen,   setQuickOrderOpen]     = useState(false);
  const [quickOrderSide,   setQuickOrderSide]     = useState('BUY');
  const [quickOrderPrice,  setQuickOrderPrice]    = useState(null);
  // Performance Refs for Ultra-Smooth Crosshair (Kite-style)
  const crosshairLineRef   = useRef(null);
  const crosshairButtonRef = useRef(null);
  const crosshairPillRef   = useRef(null);
  const crosshairPriceRef  = useRef(null);
  const hoverPriceRef      = useRef(null);  // price at cursor — read by click handler, never causes re-render
  
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);


  // Quick-order state (indices only)
  const [quickQty,     setQuickQty]     = useState(symbol === 'BANKNIFTY' ? 30 : 65);
  const [quickLotSize, setQuickLotSize] = useState(symbol === 'BANKNIFTY' ? 30 : 65);
  const [quickStatus,  setQuickStatus]  = useState(null); // null | 'loading' | { ok, rows, error }
  const [indexExpiries, setIndexExpiries] = useState([]);
  const [resolvingOption, setResolvingOption] = useState(null); // 'CE' | 'PE' | null
  // pickerLtps stores { CE: { ltp, tradingSymbol } | null, PE: … | null, loading: bool }
  const [pickerLtps, setPickerLtps] = useState({ CE: null, PE: null, loading: false });
  const [resolvedOptionSymbol, setResolvedOptionSymbol] = useState(null); // actual NFO tradingsymbol
  const quickTimerRef = useRef(null);

  // Fetch lot size when FnO symbol or underlying changes
  // Only relevant for index charts (quick CE/PE top-bar buttons) and option charts.
  // For plain stock charts, always use 1.
  useEffect(() => {
    if (!isIndex && !isOptionChart) {
      setQuickLotSize(1);
      setQuickQty(1);
      return;
    }
    const baseSymbol = isOptionChart ? parsedOption.underlying : symbol;
    fetch(`/api/option-meta?action=lotsize&symbol=${baseSymbol}`)
      .then(r => r.json())
      .then(d => {
        if (d.lotSize) {
          setQuickLotSize(d.lotSize);
          setQuickQty(d.lotSize);
        } else {
          setQuickLotSize(1);
          setQuickQty(1);
        }
      })
      .catch(() => {
        setQuickLotSize(1);
        setQuickQty(1);
      });

    // Also fetch expiries if it's an index
    if (isIndex) {
      fetch(`/api/option-meta?action=expiries&symbol=${symbol}`)
        .then(r => r.json())
        .then(d => { if (d.expiries) setIndexExpiries(d.expiries); })
        .catch(() => {});
    }
  }, [symbol, isOptionChart, parsedOption?.underlying, isIndex]);

  const containerRef   = useRef(null);
  const chartRef       = useRef(null);
  const settingsBtnRef = useRef(null);
  const dropdownRef    = useRef(null);
  const chartRsiHRef   = useRef(80);
  // Tracks which candles/interval/theme/symbol the current chart was created with.
  // If these haven't changed, only overlays need updating — no destroy/recreate.
  const chartCreatedForRef = useRef({ candles: null, interval: null, theme: null, symbol: null });
  const candlesRef  = useRef(null);  // Track latest candles without triggering React re-runs
  const smcCacheRef = useRef({ key: null, result: null }); // memoize computeSMC — O(n²), only rerun on new candles

  // ── Restore persisted settings + theme after mount (avoids SSR hydration mismatch) ─
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('tv_chart_settings');
      if (savedSettings) setSettings(s => ({ ...s, ...JSON.parse(savedSettings) }));
    } catch {}
    try {
      const saved = localStorage.getItem('tv_chart_theme');
      // URL param wins for initial launch; user can still toggle later.
      if (themeParam === 'dark' || themeParam === 'light') setChartTheme(themeParam);
      else if (saved && saved !== 'dark') setChartTheme(saved);
    } catch {}

    try {
      const saved = localStorage.getItem('tv_watchlist_open');
      if (saved !== null) setIsWatchlistOpen(saved === 'true');
    } catch {}
  }, [themeParam]);

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    // Only show loading overlay on initial load (no candles yet). For symbol
    // switches the old chart stays visible while new data loads — no flash.
    if (!candlesRef.current?.length) setLoading(true);
    const indexSymbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'];
    const indexRef = indexSymbols.includes(symbol) ? symbol : 'NIFTY';

    let spotPrice = 0;
    const needDailyFetch = chartInterval !== 'day';
    const isWeeklyInterval = chartInterval === 'week';
    try {
      // For weekly, fetch daily candles from API and aggregate client-side
      const apiInterval = isWeeklyInterval ? 'day' : chartInterval;
      const [cd, dd] = await Promise.all([
        fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=${apiInterval}${(chartInterval === 'day' || isWeeklyInterval) ? '&days=730' : ''}&bust=1`).then(r => r.json()),
        needDailyFetch && !isWeeklyInterval
          ? fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=day&days=730&bust=1`).then(r => r.json())
          : Promise.resolve(null),
      ]);
      const rawDaily = cd?.candles || [];
      // Weekly: aggregate daily → weekly candles; keep raw daily for overlays
      const c = isWeeklyInterval ? aggregateWeekly(rawDaily) : rawDaily;
      candlesRef.current = c;
      setCandles(c);
      spotPrice = c.length ? c[c.length - 1].close : 0;
      if (isWeeklyInterval) {
        setDailyCandles(rawDaily);
      } else {
        setDailyCandles(needDailyFetch ? (dd?.candles || []) : c);
      }
    } catch { /* leave candles empty */ }

    try {
      const intelInterval = chartInterval === 'week' ? 'day' : chartInterval;
      const intelRes = await fetch(
        `/api/intelligence?symbol=${encodeURIComponent(symbol)}&interval=${intelInterval}`
      );
      if (intelRes.ok) setIntelligence(await intelRes.json());

    } catch { /* non-fatal */ }
    setLoading(false);
  }, [symbol, chartInterval]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleWatchlist = () => {
    setIsWatchlistOpen(prev => {
      const next = !prev;
      localStorage.setItem('tv_watchlist_open', String(next));
      return next;
    });
  };

  const handleSelectSymbol = (newSym) => {
    setSymbol(newSym);
    setOrderOptionType(null);
    setIntelligence(null);
    const url = new URL(window.location.href);
    url.searchParams.set('symbol', newSym);
    window.history.pushState({}, '', url.toString());
  };

  // ── SL Clusters — fetch only when toggle is on ───────────────────────────────
  useEffect(() => {
    if (!settings.showSL) { setSlData(null); return; }
    fetch(`/api/analysis/stop-loss-zones?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(chartInterval)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setSlData(d); })
      .catch(() => {});
  }, [settings.showSL, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drawing tools — sync activeTool to chart, persist drawings ───────────────
  const drawingKey = (sym, iv) => `tv_drawings_${sym}_${iv}`;

  // Sync activeTool to chart instance whenever it changes
  useEffect(() => {
    chartRef.current?.setActiveTool(activeTool ?? null);
  }, [activeTool]);

  // Keyboard: Escape cancels/deselects tool; Delete/Backspace removes selected drawing
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && activeTool) {
        chartRef.current?.cancelDrawing();
        setActiveTool(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        // Don't intercept Backspace in text inputs
        if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
        chartRef.current?.deleteDrawing(selectedDrawingId);
        setSelectedDrawingId(null);
        try {
          const all = chartRef.current?.getDrawings() ?? [];
          localStorage.setItem(drawingKey(symbol, chartInterval), JSON.stringify(all));
        } catch {}
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool, selectedDrawingId, symbol, chartInterval]);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Central refresh — 5s LTP tick + 30s candle refresh (useChartRefresh) ─────
  // Replaces the old fetchAndPatch useCallback + two separate setInterval effects.
  // See app/lib/chart/useChartRefresh.js for the full implementation.
  useChartRefresh({
    symbol,
    interval: chartInterval,
    chartRef,
    candlesRef,
    // onRefreshed: call applyOverlays with fresh candles so EMA9/VWAP/CPR stay in sync
    // after every 30s background candle refresh (candlesRef.current is already updated
    // by the hook before this callback fires).
    onRefreshed: (newCandles) => {
      if (chartRef.current) applyOverlays(chartRef.current, newCandles);
    },
  });


  // Auto-refresh intelligence every 3 min during market hours (independent of candles)
  useEffect(() => {
    const refreshIntel = async () => {
      if (!isMarketHours() || !symbol) return;
      try {
        const res = await fetch(`/api/intelligence?symbol=${encodeURIComponent(symbol)}&interval=${chartInterval === 'week' ? 'day' : chartInterval}`);
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
      ) { setShowSettings(false); setConfigPage(null); }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [showSettings]);

  const openSettings = () => {
    if (showSettings) { setShowSettings(false); setConfigPage(null); return; }
    const rect = settingsBtnRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setShowSettings(true);
  };

  // ── applyOverlays ─────────────────────────────────────────────────────────────
  // Lifted OUT of the main useEffect so it can be called from two places:
  //   1. Inside the main useEffect (on initial load + settings toggle)
  //   2. Via onRefreshed in useChartRefresh (on every 30s candle refresh)
  // Takes (chart, candles) explicitly so both call sites pass the correct data.
  // Everything else (settings, dailyCandles, intelligence, chartInterval) is
  // captured from the latest React state via the useCallback dep array.
  const applyOverlays = useCallback((chart, candles) => {
    if (!chart || !candles?.length) return;
    const isIntraday = chartInterval !== 'day' && chartInterval !== 'week';

    // ── VWAP ──────────────────────────────────────────────────────────────
    if (settings.showVwap && isIntraday) {
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
        
        // Re-evaluate polarity dynamically against live tick
        const getPolarity = s => s.price >= ltp ? 'RESISTANCE' : 'SUPPORT';
        
        const sup = stations.filter(s => getPolarity(s) === 'SUPPORT').sort((a, b) => dist(a) - dist(b)).slice(0, 4);
        const res = stations.filter(s => getPolarity(s) === 'RESISTANCE').sort((a, b) => dist(a) - dist(b)).slice(0, 4);
        
        // Render support (below price)
        for (const s of sup) {
          const originalRes = s.type === 'RESISTANCE'; // was resistance, now support
          chart.setZone({ id: `sr_s_${s.price}`, price: s.price,
            color: originalRes ? 'rgba(134,239,172,0.85)' : 'rgba(74,222,128,0.85)',
            label: `S${s.quality >= 7 ? '★' : ''}`, style: 'dashed', inline: true });
        }
        
        // Render resistance (above price)
        for (const r of res) {
          const originalSup = r.type === 'SUPPORT'; // was support, now resistance
          chart.setZone({ id: `sr_r_${r.price}`, price: r.price,
            color: originalSup ? 'rgba(252,165,165,0.85)' : 'rgba(248,113,113,0.85)',
            label: `R${r.quality >= 7 ? '★' : ''}`, style: 'dashed', inline: true });
        }
      }
    } else {
      chart.clearZonesWithPrefix('sr_');
    }

    // ── EMA lines ─────────────────────────────────────────────────────────
    if (settings.showEma9)  chart.setLine('ema9',  { data: computeEMA(candles, 9),  color: settings.ema9Color  ?? EMA_COLORS.ema9,  width: settings.ema9Width  ?? 2 });
    else                    chart.clearLine('ema9');
    if (settings.showEma21) chart.setLine('ema21', { data: computeEMA(candles, 21), color: settings.ema21Color ?? EMA_COLORS.ema21, width: settings.ema21Width ?? 2 });
    else                    chart.clearLine('ema21');
    if (settings.showEma50) chart.setLine('ema50', { data: computeEMA(candles, 50), color: settings.ema50Color ?? EMA_COLORS.ema50, width: settings.ema50Width ?? 2 });
    else                    chart.clearLine('ema50');

    // ── EMA 9 Daily — stepped line on intraday (one value per day, TV-style) ──
    chart.clearZone('ema9d'); // clear old flat-zone if any
    if (settings.showEma9D && isIntraday && dailyCandles.length >= 9) {
      const IST_OFF = 5.5 * 3600;
      const dailyEmaVals = computeEMA(dailyCandles, 9);
      const dateToEma = {};
      for (const dv of dailyEmaVals) {
        const dk = new Date((dv.time + IST_OFF) * 1000).toISOString().slice(0, 10);
        dateToEma[dk] = dv.value;
      }
      const ema9dData = candles.flatMap(c => {
        const dk = new Date((c.time + IST_OFF) * 1000).toISOString().slice(0, 10);
        return dateToEma[dk] !== undefined ? [{ time: c.time, value: dateToEma[dk] }] : [];
      });
      if (ema9dData.length) chart.setLine('ema9d', { data: ema9dData, color: settings.ema9DColor ?? EMA_COLORS.ema9D, width: settings.ema9DWidth ?? 2 });
      else chart.clearLine('ema9d');
    } else {
      chart.clearLine('ema9d');
    }

    // ── EMA 9 Weekly — stepped line on daily chart (one value per week) ──────
    chart.clearZone('ema9w'); // clear old flat-zone if any
    if (settings.showEma9W && chartInterval === 'day' && dailyCandles.length >= 9) {
      const weeklyCandles = aggregateWeekly(dailyCandles);
      const weeklyEmaVals = computeEMA(weeklyCandles, 9);
      // Build monday-timestamp → ema value map
      const weekToEma = {};
      for (const dv of weeklyEmaVals) weekToEma[dv.time] = dv.value;
      // Map each daily candle to its week's EMA
      const ema9wData = dailyCandles.flatMap(c => {
        const d   = new Date(c.time * 1000);
        const day = d.getUTCDay();
        const daysToMon = day === 0 ? -6 : 1 - day;
        const monTime = c.time + daysToMon * 86400;
        const val = weekToEma[monTime];
        return val !== undefined ? [{ time: c.time, value: val }] : [];
      });
      if (ema9wData.length) chart.setLine('ema9w', { data: ema9wData, color: settings.ema9WColor ?? EMA_COLORS.ema9W, width: settings.ema9WWidth ?? 2 });
      else chart.clearLine('ema9w');
    } else {
      chart.clearLine('ema9w');
    }

    // ── SMC overlays (BOS · OB · FVG) ────────────────────────────────────
    if (settings.showSMC && candles.length > 10) {
      // computeSMC is O(n²) — memoize by candle count so overlay toggles don't re-scan
      const cacheKey = `${symbol}_${chartInterval}_${candles.length}`;
      if (smcCacheRef.current.key !== cacheKey) {
        smcCacheRef.current = { key: cacheKey, result: computeSMC(candles) };
      }
      const smc = smcCacheRef.current.result;
      if (smc) chart.setSMC(smc);
      else chart.clearSMC();
    } else {
      chart.clearSMC();
    }

    // ── SL Clusters ──────────────────────────────────────────────────────
    if (settings.showSL && slData) {
      chart.setSLClusters(slData);
    } else {
      chart.clearSLClusters();
    }

    // ── CPR (Central Pivot Range) — per-day segments ─────────────────────
    if (settings.showCPR) {
      const segs = computeCPR(candles, dailyCandles, chartInterval);
      chart.setCPR(segs.length ? segs : null);
    } else {
      chart.clearCPR();
    }

    // ── Bollinger Bands ───────────────────────────────────────────────────
    if (settings.showBB && candles.length >= (settings.bbLength ?? 20)) {
      const bb = computeBB(candles, settings.bbLength ?? 20, settings.bbMult ?? 2.0);
      chart.setBB(bb);
    } else {
      chart.clearBB();
    }

    // ── Ichimoku Cloud ───────────────────────────────────────────────────
    if (settings.showIchimoku && candles.length >= 26) {
      const ichimoku = computeIchimoku(candles);
      chart.setIchimoku(ichimoku, {
        showTenkan: settings.ichiTenkan,
        showKijun: settings.ichiKijun,
        showCloud: settings.ichiCloud,
        showChikou: settings.ichiChikou
      });
    } else {
      chart.clearIchimoku();
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
  }, [settings, dailyCandles, intelligence, slData, chartInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build / rebuild chart, or just update overlays if data hasn't changed ────
  // Key invariant: chart is destroyed+recreated (resetting viewport) ONLY when
  // candles, chartInterval, or chartTheme change. Toggling overlays in settings
  // skips recreation and just updates lines/zones on the existing chart instance,
  // so the user's zoom/pan state is fully preserved.
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const el         = containerRef.current;
    const isIntraday = chartInterval !== 'day' && chartInterval !== 'week';
    const cf         = chartCreatedForRef.current;
    // Recreate only when interval or theme changes (or first load).
    // Symbol changes are handled via updateCandles + fitContent — no DOM remount needed.
    const needsRecreation = !chartRef.current
      || cf.interval  !== chartInterval
      || cf.theme     !== chartTheme;


    const applyOverlays_local = (chart) => applyOverlays(chart, candles); // local alias capturing closure `candles`

    if (!needsRecreation) {
      if (cf.candles !== candles) {
        chartRef.current.updateCandles(candles);
        // Symbol switched → reset viewport to show full new chart
        if (cf.symbol !== symbol) chartRef.current.fitContent();
        chartCreatedForRef.current = { ...cf, candles, symbol };
      }
      applyOverlays_local(chartRef.current);
      if (atParam) {
        const atSec = parseInt(atParam, 10);
        if (atSec > 0) chartRef.current.setMarkers([{ time: atSec, direction: atDirParam }]);
      }
      return;
    }

    // Full recreation — new candles, interval, or theme
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    import('@/app/lib/chart/Chart.js').then(({ createChart }) => {
      if (!containerRef.current) return;

      const chart = createChart(el, { interval: chartInterval, theme: chartTheme });
      chartRef.current = chart;
      chartCreatedForRef.current = { el, candles, interval: chartInterval, theme: chartTheme, symbol };

      chart.onCrosshairMove(info => {
        if (info && info.y !== null) {
          if (info.bar) setHoverOHLC(info.bar);
          else          setHoverOHLC(null);

          const price = chart.yToPrice(info.y);
          // Store price in ref — click handler reads hoverPriceRef, no setState needed
          // Round to 1 decimal place as requested
          hoverPriceRef.current = parseFloat(price.toFixed(1));

          // Direct DOM updates only — no setState to avoid re-render flicker
          if (crosshairLineRef.current) {
            crosshairLineRef.current.style.top     = `${info.y}px`;
            crosshairLineRef.current.style.display = 'block';
          }
          if (crosshairButtonRef.current) {
            crosshairButtonRef.current.style.top     = `${info.y - 12}px`;
            crosshairButtonRef.current.style.display = 'flex';
          }
          if (crosshairPillRef.current) {
            crosshairPillRef.current.style.top     = `${info.y - 10}px`;
            crosshairPillRef.current.style.display = 'flex';
          }
          if (crosshairPriceRef.current) crosshairPriceRef.current.textContent = price.toFixed(1);
        } else {
          setHoverOHLC(null);
          // Do NOT hide crosshair elements here — cursor may have moved onto the button.
          // Elements are hidden only when mouse leaves the chart container (onMouseLeave above).
        }
      });
      chart.onLastPriceY(y => {
        setLastPriceY(y);
        // Initial setup: move crosshair to current price on load if no hover has happened
        const lastCandle = candlesRef.current?.[candlesRef.current.length - 1];
        if (y !== null && hoverPriceRef.current === null && lastCandle) {
          const price = lastCandle.close;
          hoverPriceRef.current = parseFloat(price.toFixed(1));
          
          if (crosshairLineRef.current) {
            crosshairLineRef.current.style.top = `${y}px`;
            crosshairLineRef.current.style.display = 'block';
          }
          if (crosshairButtonRef.current) {
            crosshairButtonRef.current.style.top = `${y - 12}px`;
            crosshairButtonRef.current.style.display = 'flex';
          }
          if (crosshairPillRef.current) {
            crosshairPillRef.current.style.top = `${y - 10}px`;
            crosshairPillRef.current.style.display = 'flex';
          }
          if (crosshairPriceRef.current) crosshairPriceRef.current.textContent = price.toFixed(1);
        }
      });
      chart.onViewportChange(({ atEnd }) => setAtRightEdge(atEnd));

      chart.setCandles(candles); // fitContent called inside — shows all bars
      // Zoom to a sensible default window: show last 2-3 trading days for intraday
      const defaultBars = {
        '1minute':  390,   // ~1 trading day
        '5minute':  234,   // ~3 trading days  (78 bars/day × 3)
        '15minute': 104,   // ~4 trading days  (26 bars/day × 4)
        '60minute': 150,   // ~6 weeks
        'week':      52,   // ~1 year of weekly bars
      }[chartInterval];
      if (defaultBars) chart.fitRecent(defaultBars);

      // Load saved drawings for this symbol+interval
      try {
        const saved = localStorage.getItem(drawingKey(symbol, chartInterval));
        if (saved) chart.setDrawings(JSON.parse(saved));
      } catch {}

      // Persist drawings on each placement or deletion
      chart.onDrawingComplete((_, all) => {
        try { localStorage.setItem(drawingKey(symbol, chartInterval), JSON.stringify(all)); } catch {}
      });

      // Sync selection to React state
      chart.onDrawingSelect((id) => setSelectedDrawingId(id ?? null));

      // Re-apply active tool after recreation
      if (activeTool) chart.setActiveTool(activeTool);

      applyOverlays(chart, candles);

      // If opened from scanner with ?at= param, mark + scroll to signal candle
      if (atParam) {
        const atSec = parseInt(atParam, 10);
        if (atSec > 0) {
          chart.setMarkers([{ time: atSec, direction: atDirParam }]);
          chart.scrollToTime(atSec);
        }
      }
    });
  }, [candles, dailyCandles, chartInterval, chartTheme, intelligence, settings, slData]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const isIntraday = chartInterval !== 'day' && chartInterval !== 'week';
  const ltp        = candles.length > 0 ? candles[candles.length - 1].close : null;
  const open0      = candles.length > 0 ? candles[0].open : null;
  const changePct  = ltp != null && open0 ? ((ltp - open0) / open0) * 100 : null;
  const isUp       = changePct != null ? changePct >= 0 : null;
  // Derive regime from central intelligence (for S/R zone useEffect + regime badge)
  const regimeData = intelligence?.regime ?? null;
  const regime     = regimeData?.regime ? (REGIME_BADGE[regimeData.regime] || REGIME_BADGE.INITIALIZING) : null;
  const confColor  = regimeData?.confidence ? (CONF_COLORS[regimeData.confidence] || 'text-slate-400') : 'text-slate-400';
  const anyEma = settings.showEma9 || settings.showEma21 || settings.showEma50 ||
                 (settings.showEma9D && isIntraday) || (settings.showEma9W && chartInterval === 'day');

  const lastClose = candles.length ? candles[candles.length - 1].close : null;

  // ── Pre-fetch CE+PE LTPs when the picker opens ──────────────────────────────
  // pickerStrike is derived from quickOrderPrice (the chart level clicked),
  // NOT from lastClose — so the premium shown matches the level the user pointed at.
  useEffect(() => {
    if (!indexPicker || !quickOrderPrice || !indexExpiries.length) {
      setPickerLtps({ CE: null, PE: null, loading: false });
      return;
    }
    const strike = Math.round(quickOrderPrice / step) * step;
    const expiry = indexExpiries[0].date;
    setPickerLtps({ CE: null, PE: null, loading: true });
    Promise.all([
      fetch(`/api/option-meta?action=tradingsymbol&symbol=${symbol}&expiry=${expiry}&strike=${strike}&type=CE`).then(r => r.json()),
      fetch(`/api/option-meta?action=tradingsymbol&symbol=${symbol}&expiry=${expiry}&strike=${strike}&type=PE`).then(r => r.json()),
    ]).then(([ce, pe]) => {
      setPickerLtps({
        CE: ce.tradingSymbol ? { ltp: ce.ltp ?? null, tradingSymbol: ce.tradingSymbol } : null,
        PE: pe.tradingSymbol ? { ltp: pe.ltp ?? null, tradingSymbol: pe.tradingSymbol } : null,
        loading: false,
      });
    }).catch(() => {
      setPickerLtps({ CE: null, PE: null, loading: false });
    });
  }, [indexPicker, quickOrderPrice, symbol, step, indexExpiries]);

  // ── Index CE/PE picker handler ───────────────────────────────────────────────
  const handlePickOption = async (type) => {
    const pickerStrike = quickOrderPrice ? Math.round(quickOrderPrice / step) * step : atmStrike;
    if (!pickerStrike || !indexExpiries.length || resolvingOption) return;
    setResolvingOption(type);
    try {
      // Use pre-fetched data if available (happy path — no extra API call)
      const prefetched = pickerLtps[type];
      if (prefetched?.tradingSymbol) {
        setResolvedOptionSymbol(prefetched.tradingSymbol);
        setQuickOrderPrice(prefetched.ltp);
        setQuickOrderSide('BUY');
        setOrderOptionType(type);
        setIndexPicker(false);
        setQuickOrderOpen(true);
        setResolvingOption(null);
        return;
      }
      // Fallback: fetch now (picker opened before prefetch completed)
      const expiry = indexExpiries[0].date;
      const res  = await fetch(`/api/option-meta?action=tradingsymbol&symbol=${symbol}&expiry=${expiry}&strike=${pickerStrike}&type=${type}`);
      const data = await res.json();
      if (data.tradingSymbol && data.ltp !== null) {
        setResolvedOptionSymbol(data.tradingSymbol);
        setQuickOrderPrice(data.ltp);
        setQuickOrderSide('BUY');
        setOrderOptionType(type);
        setIndexPicker(false);
        setQuickOrderOpen(true);
      }
    } catch (e) {
      console.error('Failed to resolve option:', e);
    } finally {
      setResolvingOption(null);
    }
  };

  const handleAtmQuick = useCallback(async (optionType) => {
    if (!ltp || quickStatus === 'loading') return;
    setQuickStatus('loading');
    if (quickTimerRef.current) clearTimeout(quickTimerRef.current);
    try {
      const res  = await fetch('/api/options/atm-quick-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ symbol, price: ltp, optionType, qty: quickQty }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setQuickStatus({ ok: false, error: data.error || 'Order failed', rows: [
          { label: 'Symbol', value: data.tradingsymbol ?? symbol },
          { label: 'Type',   value: optionType, color: 'text-amber-400' },
          { label: 'Strike', value: data.atmStrike ? `${data.atmStrike}` : '—' },
        ]});
      } else {
        setQuickStatus({ ok: true, rows: [
          { label: 'Symbol',    value: data.tradingsymbol },
          { label: 'Strike',    value: `${data.atmStrike} ${optionType}` },
          { label: 'Entry',     value: `₹${data.entryLimit}` },
          { label: 'Kite ID',   value: data.kiteOrderId ?? '—', color: 'text-slate-400' },
          { label: 'SL trigger',value: data.slOrderId ? `₹${data.slTrigger}` : (data.slError ? 'failed' : '—'),
            color: data.slOrderId ? 'text-amber-400' : 'text-red-400' },
        ], error: data.slError ?? null });
      }
    } catch (e) {
      setQuickStatus({ ok: false, error: e.message || 'Network error', rows: [] });
    }
    quickTimerRef.current = setTimeout(() => setQuickStatus(null), 10000);
  }, [symbol, ltp, quickQty, quickStatus]);
  const atmStrike = lastClose ? Math.round(lastClose / step) * step : null;

  return (
    <div className="h-[100dvh] flex flex-row overflow-hidden bg-[#0a0e1a] text-white">
      
      {/* Main Content Area: Header + Chart */}
      <div className="flex-1 flex flex-col min-w-0">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="bg-[#0a0e1a] border-b border-white/[0.06] flex-shrink-0">

        {/* Row 1: back · symbol · price · [desktop: intervals + controls] */}
        <div className="px-3 h-11 flex items-center gap-2">

          <a href={backParam || "/trades"}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm"
            title="Go back"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
            </svg>
            <span className="hidden sm:inline">{
              !backParam ? 'Trades' :
              backParam === '/trades' ? 'Trades' :
              backParam === '/eye' ? 'Eye' :
              backParam === '/options' ? 'Options' :
              'Back'
            }</span>
          </a>

          <span className="w-px h-4 bg-white/10" />
          <SymbolSearch symbol={symbol} onSelectSymbol={handleSelectSymbol} />

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

          {/* Quick-order controls (index symbols only) */}
          {isIndex && (
            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-white/[0.08]">
              <input
                type="number"
                value={quickQty}
                min={quickLotSize} step={quickLotSize}
                onChange={e => setQuickQty(Math.max(quickLotSize, parseInt(e.target.value) || quickLotSize))}
                className="w-[52px] bg-[#0d1829] border border-white/[0.10] rounded px-1.5 py-0.5 text-[11px] text-white text-center focus:outline-none focus:border-indigo-500 font-mono"
                title={`Qty (1 lot = ${quickLotSize})`}
              />
              <button
                onClick={() => handleAtmQuick('CE')}
                disabled={quickStatus === 'loading' || !ltp}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/40 text-emerald-400 disabled:opacity-40 transition-colors"
                title="Quick BUY ATM CE"
              >⚡ CE</button>
              <button
                onClick={() => handleAtmQuick('PE')}
                disabled={quickStatus === 'loading' || !ltp}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-600/20 hover:bg-red-600/40 border border-red-600/40 text-red-400 disabled:opacity-40 transition-colors"
                title="Quick BUY ATM PE"
              >⚡ PE</button>
              {quickStatus === 'loading' && (
                <span className="w-3 h-3 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
              )}
            </div>
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
      <div className="flex-1 relative min-h-0" onMouseLeave={() => {
        if (crosshairLineRef.current)   crosshairLineRef.current.style.display   = 'none';
        if (crosshairButtonRef.current) crosshairButtonRef.current.style.display = 'none';
        if (crosshairPillRef.current)   crosshairPillRef.current.style.display   = 'none';
        setHoverOHLC(null);
      }}>

        {/* Loading spinner */}
        {loading && (
          <div className={`absolute inset-0 flex items-center justify-center z-10 ${chartTheme === 'light' ? 'bg-white' : 'bg-[#0a0e1a]'}`}>
            <div className={`flex items-center gap-2 text-sm ${chartTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
              <span className={`w-4 h-4 border-2 rounded-full animate-spin ${chartTheme === 'light' ? 'border-slate-300 border-t-indigo-500' : 'border-slate-400 border-t-indigo-500'}`} />
              Loading…
            </div>
          </div>
        )}

        {/* Error state */}
        {!loading && candles.length === 0 && (
          <div className={`absolute inset-0 flex items-center justify-center z-10 ${chartTheme === 'light' ? 'bg-white' : 'bg-[#0a0e1a]'}`}>
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

        {/* Chart canvas mount point */}
        <div
          ref={containerRef}
          className="w-full h-full"
        />

        {/* Drawing toolbar — left edge, vertically centered */}
        <DrawingToolbar
          activeTool={activeTool}
          onToolSelect={setActiveTool}
          selectedDrawingId={selectedDrawingId}
          onDeleteSelected={() => {
            if (!selectedDrawingId) return;
            chartRef.current?.deleteDrawing(selectedDrawingId);
            setSelectedDrawingId(null);
            try {
              const all = chartRef.current?.getDrawings() ?? [];
              localStorage.setItem(drawingKey(symbol, chartInterval), JSON.stringify(all));
            } catch {}
          }}
          onClearAll={() => {
            chartRef.current?.clearDrawings();
            setSelectedDrawingId(null);
            try { localStorage.removeItem(drawingKey(symbol, chartInterval)); } catch {}
          }}
        />

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

        {/* Quick-order status panel */}
        {quickStatus && quickStatus !== 'loading' && (
          <div className={`absolute top-2 right-2 z-30 flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border shadow-2xl min-w-[220px] ${
            quickStatus.ok ? 'bg-[#0d1f14] border-emerald-600/40' : 'bg-[#1a0d0d] border-red-600/40'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <span className={`text-[11px] font-bold ${quickStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {quickStatus.ok ? '✓ Order Placed' : '✕ Order Failed'}
              </span>
              <button onClick={() => setQuickStatus(null)} className="text-slate-600 hover:text-slate-400 text-xs">✕</button>
            </div>
            {quickStatus.rows?.map((row, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500">{row.label}</span>
                <span className={row.color ?? 'text-slate-200'}>{row.value}</span>
              </div>
            ))}
            {quickStatus.error && <p className="text-[10px] text-red-400 leading-snug">{quickStatus.error}</p>}
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

        {/* Horizontal Dash Crosshair — always in DOM, shown/hidden via direct style */}
        <div
          ref={crosshairLineRef}
          className="absolute left-0 right-0 border-t border-dashed border-white/20 pointer-events-none z-30"
          style={{ display: 'none', top: 0 }}
        />

        {/* Cursor-floating order button + price pill — always in DOM, no flicker */}
        {/* Price Pill on Axis */}
        <div
          ref={crosshairPillRef}
          className="absolute z-40 right-1 h-[20px] w-[70px] bg-black border border-white/20 rounded items-center justify-center pointer-events-none"
          style={{ display: 'none', top: 0 }}
        >
          <span ref={crosshairPriceRef} className="text-[10px] text-white font-mono font-bold" />
        </div>

        {/* Blue + Button */}
        {!indexPicker && (
          <button
            ref={crosshairButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              const price = hoverPriceRef.current;
              if (price === null || price === undefined) return;
              setQuickOrderPrice(price);
              if (isOptionChart) {
                setQuickOrderSide('BUY');
                setQuickOrderOpen(true);
              } else if (isIndex) {
                setIndexPicker(true);
              } else {
                setOrderOptionType(null);
                setQuickOrderSide('BUY');
                setQuickOrderOpen(true);
              }
            }}
            style={{ display: 'none', top: 0, right: 74 }}
            className="absolute z-50 w-[24px] h-[24px] rounded-full bg-indigo-600 hover:bg-indigo-500 border border-indigo-400 shadow-[0_0_15px_rgba(79,70,229,0.5)] flex items-center justify-center text-white text-base font-black leading-none transition-colors active:scale-90 cursor-pointer pointer-events-auto"
            title="Quick order at cursor price"
          >
            <span className="mb-0.5">+</span>
          </button>
        )}

        {/* Index CE/PE picker — appears when + is clicked on NIFTY/BANKNIFTY/etc */}
        {indexPicker && lastPriceY !== null && (() => {
          const pickerStrike = quickOrderPrice ? Math.round(quickOrderPrice / step) * step : atmStrike;
          if (!pickerStrike) return null;
          return (
            <div
              style={{ top: lastPriceY - 15, right: 108 }}
              className="absolute z-30 flex items-center gap-1.5 bg-[#0f1d33] border border-white/10 rounded-lg px-2.5 py-1.5 shadow-2xl"
            >
              <div className="flex flex-col mr-1">
                <span className="text-[10px] text-slate-500 font-mono leading-tight">
                  @ ₹{quickOrderPrice?.toFixed(0)}
                </span>
                <span className="text-[11px] text-slate-300 font-mono font-semibold leading-tight">
                  {pickerStrike} strike
                </span>
              </div>
              <button
                disabled={!!resolvingOption}
                onClick={() => handlePickOption('CE')}
                className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-emerald-700 hover:bg-emerald-600 text-white transition-colors flex flex-col items-center min-w-[46px] justify-center leading-tight"
              >
                {resolvingOption === 'CE'
                  ? <Loader2 size={10} className="animate-spin" />
                  : <>
                      <span>CE</span>
                      <span className="text-[9px] font-normal opacity-80">
                        {pickerLtps.loading ? '…' : pickerLtps.CE?.ltp != null ? `₹${pickerLtps.CE.ltp.toFixed(1)}` : ''}
                      </span>
                    </>
                }
              </button>
              <button
                disabled={!!resolvingOption}
                onClick={() => handlePickOption('PE')}
                className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-red-700 hover:bg-red-600 text-white transition-colors flex flex-col items-center min-w-[46px] justify-center leading-tight"
              >
                {resolvingOption === 'PE'
                  ? <Loader2 size={10} className="animate-spin" />
                  : <>
                      <span>PE</span>
                      <span className="text-[9px] font-normal opacity-80">
                        {pickerLtps.loading ? '…' : pickerLtps.PE?.ltp != null ? `₹${pickerLtps.PE.ltp.toFixed(1)}` : ''}
                      </span>
                    </>
                }
              </button>
              <button
                onClick={() => setIndexPicker(false)}
                className="ml-0.5 text-slate-500 hover:text-slate-300 text-xs leading-none"
              >✕</button>
            </div>
          );
        })()}

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
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: settings.ema9Color ?? EMA_COLORS.ema9 }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: settings.ema9Color ?? EMA_COLORS.ema9 }} /> EMA 9
              </span>
            )}
            {settings.showEma21 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: settings.ema21Color ?? EMA_COLORS.ema21 }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: settings.ema21Color ?? EMA_COLORS.ema21 }} /> EMA 21
              </span>
            )}
            {settings.showEma50 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: settings.ema50Color ?? EMA_COLORS.ema50 }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: settings.ema50Color ?? EMA_COLORS.ema50 }} /> EMA 50
              </span>
            )}
            {settings.showEma9D && isIntraday && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: settings.ema9DColor ?? EMA_COLORS.ema9D }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: settings.ema9DColor ?? EMA_COLORS.ema9D }} /> D·EMA9
              </span>
            )}
            {settings.showEma9W && !isIntraday && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: settings.ema9WColor ?? EMA_COLORS.ema9W }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: settings.ema9WColor ?? EMA_COLORS.ema9W }} /> W·EMA9
              </span>
            )}
          </div>
        )}

        {/* VWAP badge — bottom-left, stacked above the Intelligence pill */}
        {settings.showVwap && isIntraday && vwap != null && (
          <div className="absolute left-14 z-10 flex items-center gap-1.5 bg-[#0a0e1a]/90 border border-amber-500/20 rounded-lg px-2.5 py-1 pointer-events-none select-none"
            style={{ bottom: (settings.showRSI ? chartRsiH + 28 : 0) + 52 }}>
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
              {configPage ? (
                <div className="px-1 animate-in fade-in zoom-in-95 duration-200">
                  <button onClick={() => setConfigPage(null)} className="flex items-center gap-2 mb-4 text-xs font-semibold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Back
                  </button>
                  <div className="text-lg font-bold text-white mb-4">{OVERLAY_DEFS.find(d => d.key === configPage)?.label} Config</div>
                  
                  {configPage === 'showBB' && (
                    <div className="flex flex-col gap-4">
                      <label className="flex flex-col gap-2 text-sm text-slate-400">
                        Length
                        <input type="number" min={2} max={200} value={settings.bbLength ?? 20}
                          onChange={e => setNum('bbLength', Math.max(2, Math.min(200, +e.target.value || 20)))}
                          className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-base"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-slate-400">
                        StdDev
                        <input type="number" min={0.1} max={5} step={0.1} value={settings.bbMult ?? 2.0}
                          onChange={e => setNum('bbMult', Math.max(0.1, Math.min(5, +e.target.value || 2.0)))}
                          className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-base"
                        />
                      </label>
                    </div>
                  )}
                  {configPage === 'showRSI' && (
                    <div className="flex flex-col gap-4">
                      <label className="flex flex-col gap-2 text-sm text-slate-400">
                        Period
                        <input type="number" min={2} max={50} value={settings.rsiPeriod ?? 12}
                          onChange={e => setNum('rsiPeriod', Math.max(2, Math.min(50, +e.target.value || 12)))}
                          className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-base"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-slate-400">
                        MA (0 = Off)
                        <input type="number" min={0} max={30} value={settings.rsiMAPeriod ?? 5}
                          onChange={e => setNum('rsiMAPeriod', Math.max(0, Math.min(30, +e.target.value || 0)))}
                          className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-base"
                        />
                      </label>
                    </div>
                  )}
                  {configPage === 'showIchimoku' && (
                    <div className="flex flex-col gap-3">
                      {[
                        { k: 'ichiCloud', label: 'Kumo (Cloud)', color: '#10b981' },
                        { k: 'ichiTenkan', label: 'Tenkan-sen', color: '#3b82f6' },
                        { k: 'ichiKijun', label: 'Kijun-sen', color: '#f59e0b' },
                        { k: 'ichiChikou', label: 'Chikou (Lag)', color: '#8b5cf6' }
                      ].map(({k, label, color}) => (
                        <label key={k} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/5 cursor-pointer active:bg-white/[0.08] transition-colors">
                          <input type="checkbox" checked={!!settings[k]} onChange={() => toggle(k)} className="w-5 h-5 accent-indigo-500 rounded bg-slate-800" />
                          <span className="w-4 h-1 rounded-full shrink-0" style={{backgroundColor: color}} />
                          <span className="flex-1 text-sm text-white font-medium">{label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
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
                    {OVERLAY_DEFS.map(({ key, label, color, intradayOnly, dailyOnly, hasParams, hasStyle, colorKey, widthKey }) => {
                      const disabled  = (intradayOnly && !isIntraday) || (dailyOnly && chartInterval !== 'day');
                      const on        = settings[key] && !disabled;
                      const liveColor = hasStyle ? (settings[colorKey] ?? color) : color;
                      return (
                        <div key={key} className={`${(hasStyle) && on ? 'col-span-2' : ''}`}>
                          <div className={`flex items-center w-full rounded-xl transition-colors ${disabled ? 'opacity-25' : on ? 'bg-slate-700' : 'hover:bg-white/[0.06]'}`}>
                            <button onClick={() => !disabled && toggle(key)} disabled={disabled}
                              className="flex items-center gap-2.5 px-3 py-2.5 text-left flex-1"
                            >
                              <span className="w-4 h-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: liveColor, opacity: on ? 1 : 0.3 }} />
                              <span className={`text-sm flex-1 ${on ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                            </button>
                            {hasParams && on && (
                              <button onClick={(e) => { e.stopPropagation(); setConfigPage(key); }} className="p-3 text-slate-400 hover:text-white transition-colors border-l border-white/10" title="Config">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                              </button>
                            )}
                          </div>
                          {hasStyle && on && (
                            <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-1">
                              {EMA_LINE_PALETTE.map(c => (
                                <button key={c} onClick={() => setSetting(colorKey, c)}
                                  className="w-4 h-4 rounded-full flex-shrink-0 transition-all"
                                  style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid rgba(255,255,255,0.3)' : 'none',
                                    outline: (settings[colorKey] ?? color) === c ? '2px solid #fff' : 'none', outlineOffset: '1px' }}
                                />
                              ))}
                              <label className="w-4 h-4 rounded-full cursor-pointer flex-shrink-0 flex items-center justify-center bg-white/10 text-[9px] text-slate-400 hover:bg-white/20 relative">
                                +<input type="color" value={settings[colorKey] ?? color} onChange={e => setSetting(colorKey, e.target.value)} className="absolute opacity-0 w-0 h-0" />
                              </label>
                              <div className="flex items-center gap-1 ml-auto">
                                {[[1,'—'],[2,'━'],[3,'━━']].map(([w, glyph]) => (
                                  <button key={w} onClick={() => setSetting(widthKey, w)}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${(settings[widthKey] ?? 2) === w ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                  >{glyph}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          dropdownPos && (
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
                  <div className="text-xs text-white font-semibold mb-3 px-1">{OVERLAY_DEFS.find(d => d.key === configPage)?.label} Config</div>
                  
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
                        MA Period (0=Off)
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
                    {OVERLAY_DEFS.map(({ key, label, color, intradayOnly, dailyOnly, hasParams, hasStyle, colorKey, widthKey }) => {
                      const disabled    = (intradayOnly && !isIntraday) || (dailyOnly && chartInterval !== 'day');
                      const on          = settings[key] && !disabled;
                      const liveColor   = hasStyle ? (settings[colorKey] ?? color) : color;
                      return (
                        <div key={key}>
                          <div className="flex items-center w-full">
                            <button onClick={() => !disabled && toggle(key)} disabled={disabled}
                              className={`flex-1 flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors text-left ${
                                disabled ? 'opacity-25 cursor-not-allowed' : 'hover:bg-white/[0.06]'
                              }`}
                            >
                              <span className="flex items-center w-5 flex-shrink-0">
                                <span className="w-full h-0.5 rounded-full block" style={{ backgroundColor: liveColor, opacity: on ? 1 : 0.2 }} />
                              </span>
                              <span className={`text-xs flex-1 ${on ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                              <span className={`text-[10px] font-bold w-5 text-right pl-1 ${on ? 'text-indigo-500' : 'text-slate-400'}`}>
                                {on ? 'ON' : 'OFF'}
                              </span>
                            </button>
                            {hasParams && on && (
                              <button onClick={(e) => { e.stopPropagation(); setConfigPage(key); }} className="p-1.5 ml-0.5 text-slate-400 hover:text-slate-100 bg-white/[0.04] hover:bg-white/[0.12] rounded-md transition-colors" title="Configure">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                              </button>
                            )}
                          </div>
                          {hasStyle && on && (
                            <div className="flex items-center gap-1.5 px-2 pb-1.5">
                              {EMA_LINE_PALETTE.map(c => (
                                <button key={c} onClick={() => setSetting(colorKey, c)}
                                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 transition-all"
                                  style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid rgba(255,255,255,0.3)' : 'none',
                                    outline: (settings[colorKey] ?? color) === c ? '2px solid #fff' : 'none', outlineOffset: '1px' }}
                                />
                              ))}
                              <label className="w-3.5 h-3.5 rounded-full cursor-pointer flex-shrink-0 flex items-center justify-center bg-white/10 text-[7px] text-slate-400 hover:bg-white/20 relative">
                                +<input type="color" value={settings[colorKey] ?? color} onChange={e => setSetting(colorKey, e.target.value)} className="absolute opacity-0 w-0 h-0" />
                              </label>
                              <div className="flex items-center gap-0.5 ml-auto">
                                {[[1,'—'],[2,'━'],[3,'━━']].map(([w, glyph]) => (
                                  <button key={w} onClick={() => setSetting(widthKey, w)}
                                    className={`px-1 py-0.5 rounded text-[9px] font-mono transition-colors ${(settings[widthKey] ?? 2) === w ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                  >{glyph}</button>
                                ))}
                              </div>
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
                </>
              )}
            </div>
          )
        )
      )}
    {/* Place order modal */}
    <OrderModal
      isOpen={orderModalOpen}
      onClose={() => { setOrderModalOpen(false); setOrderOptionType(null); }}
      symbol={isOptionChart ? parsedOption.underlying : symbol}
      price={isOptionChart ? parsedOption.strike : (isIndex ? atmStrike : lastClose)}
      defaultType="BUY"
      optionType={isOptionChart ? parsedOption.type : orderOptionType}
      optionExpiry={isOptionChart ? parsedOption.expiry : null}
      onOrderPlaced={() => { setOrderModalOpen(false); setOrderOptionType(null); }}
      intelligence={intelligence}
    />

    {/* Quick Order Drawer */}
    <QuickOrder
      isOpen={quickOrderOpen}
      onClose={() => { setQuickOrderOpen(false); setResolvedOptionSymbol(null); setOrderOptionType(null); }}
      symbol={orderOptionType ? (resolvedOptionSymbol ?? `${symbol}${atmStrike}${orderOptionType}`) : (isOptionChart ? symbol : symbol)}
      price={quickOrderPrice}
      type={quickOrderSide}
      intelligence={intelligence}
      lotSize={quickLotSize}
      onOpenFullAnalysis={() => {
        setQuickOrderOpen(false);
        setOrderModalOpen(true);
      }}
    />
    </div>{/* end main content area */}

    <WatchlistDrawer
      isOpen={isWatchlistOpen}
      onToggle={toggleWatchlist}
      onSelectSymbol={handleSelectSymbol}
      currentSymbol={symbol}
      theme={chartTheme}
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
