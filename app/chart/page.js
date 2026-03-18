'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const CDN_URL = 'https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js';

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

// IST offset in seconds (UTC+5:30)
const IST_OFFSET_S = 5.5 * 3600;

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Overlay definitions — order = display order in settings panel
const OVERLAY_DEFS = [
  { key: 'showVwap',   label: 'VWAP',        color: '#f59e0b', intradayOnly: true,  dailyOnly: false },
  { key: 'showOrBand', label: 'OR Band',     color: '#3b82f6', intradayOnly: true,  dailyOnly: false },
  { key: 'showSR',     label: 'S/R Zones',  color: '#94a3b8', intradayOnly: false, dailyOnly: false },
  { key: 'showEma9',   label: 'EMA 9',       color: '#22d3ee', intradayOnly: false, dailyOnly: false },
  { key: 'showEma21',  label: 'EMA 21',      color: '#f97316', intradayOnly: false, dailyOnly: false },
  { key: 'showEma50',  label: 'EMA 50',      color: '#a78bfa', intradayOnly: false, dailyOnly: false },
  { key: 'showEma9D',  label: 'EMA 9 Daily', color: '#e879f9', intradayOnly: true,  dailyOnly: false },
  { key: 'showEma9W',  label: 'EMA 9 Weekly',color: '#fb923c', intradayOnly: false, dailyOnly: true  },
  { key: 'showVolume', label: 'Volume',      color: '#475569', intradayOnly: false, dailyOnly: false },
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
};

// ── Chart themes ──────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    // canvas colors (hex, passed to LWC)
    bg:           '#0a0e1a',
    text:         '#94a3b8',
    grid:         'rgba(255,255,255,0.03)',
    crosshair:    'rgba(148,163,184,0.6)',
    scaleBorder:  'rgba(255,255,255,0.06)',
    scaleText:    '#64748b',
    candleUp:     '#00d4aa',
    candleDown:   '#ff4757',
    srSupport:    '#4ade80',
    srSupBroken:  '#86efac',
    srResist:     '#f87171',
    srResBroken:  '#fca5a5',
    ema9Color:    '#22d3ee',
    ema21Color:   '#f97316',
    ema50Color:   '#a78bfa',
    ema9DColor:   '#e879f9',
    ema9WColor:   '#fb923c',
    // tailwind classes (UI chrome)
    pageBg:       'bg-[#0a0e1a]',
    headerBg:     'bg-[#0a0e1a]',
    headerBorder: 'border-white/[0.06]',
    text1:        'text-white',
    text2:        'text-slate-400',
    textHover:    'hover:text-slate-200',
    divider:      'bg-white/10',
    btnHover:     'hover:bg-white/[0.06]',
    btnActive:    'bg-slate-700',
    badgeBg:      'bg-[#0a0e1a]/90',
    badgeBorder:  'border-white/10',
    dropdownBg:   'bg-[#111827]',
    dropdownBdr:  'border-white/[0.12]',
    watermark:    'text-slate-600',
    emaPillBg:    'bg-[#0a0e1a]/70 border-white/[0.06]',
    vwapBorder:   'border-amber-500/20',
  },
  light: {
    // canvas colors (darker for visibility on white)
    bg:           '#f8fafc',
    text:         '#475569',
    grid:         'rgba(0,0,0,0.05)',
    crosshair:    'rgba(71,85,105,0.6)',
    scaleBorder:  'rgba(0,0,0,0.1)',
    scaleText:    '#64748b',
    candleUp:     '#059669',
    candleDown:   '#dc2626',
    srSupport:    '#15803d',   // green-700 — strong on white
    srSupBroken:  '#4ade80',   // green-400 — faded broken
    srResist:     '#b91c1c',   // red-700
    srResBroken:  '#f87171',   // red-400 — faded broken
    ema9Color:    '#0e7490',   // cyan-700 — readable on white
    ema21Color:   '#c2410c',   // orange-700
    ema50Color:   '#6d28d9',   // violet-700
    ema9DColor:   '#9333ea',   // purple-600
    ema9WColor:   '#ea580c',   // orange-600
    // tailwind classes
    pageBg:       'bg-slate-100',
    headerBg:     'bg-white',
    headerBorder: 'border-slate-200',
    text1:        'text-slate-900',
    text2:        'text-slate-500',
    textHover:    'hover:text-slate-700',
    divider:      'bg-slate-200',
    btnHover:     'hover:bg-slate-100',
    btnActive:    'bg-slate-200',
    badgeBg:      'bg-white/90',
    badgeBorder:  'border-slate-200',
    dropdownBg:   'bg-white',
    dropdownBdr:  'border-slate-200',
    watermark:    'text-slate-300',
    emaPillBg:    'bg-white/80 border-slate-200',
    vwapBorder:   'border-amber-400/40',
  },
};

// ── Weekly aggregation (for EMA 9 Weekly on daily chart) ──────────────────────
function aggregateWeekly(dailyCandles) {
  const weeks = {};
  for (const c of dailyCandles) {
    const d = new Date(c.time * 1000);
    const day = d.getUTCDay(); // 0=Sun
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

// Format volume: 1.23Cr / 45.6L / 123K
function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e7) return (v / 1e7).toFixed(2) + 'Cr';
  if (v >= 1e5) return (v / 1e5).toFixed(2) + 'L';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

// ── Maths ─────────────────────────────────────────────────────────────────────
function computeVWAP(candles) {
  let cumTPV = 0, cumVol = 0;
  return candles.map(c => {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
    return { time: c.time, value: cumVol > 0 ? cumTPV / cumVol : c.close };
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

// Filter to 9:15–15:30 IST — uses original UTC timestamps
function toSessionOnly(candles) {
  return candles.filter(c => {
    const istMins = Math.floor((c.time % 86400) / 60) + 330; // minutes since midnight IST
    const dayMins = istMins % 1440;
    return dayMins >= 555 && dayMins <= 930; // 9:15 = 555, 15:30 = 930
  });
}

// Shift timestamps to IST so LWC displays IST times via UTC methods (avoids locale issues)
function toISTTimestamps(candles) {
  return candles.map(c => ({ ...c, time: c.time + IST_OFFSET_S }));
}

// Convert Kite daily Unix timestamp → LWC BusinessDay { year, month, day } in IST
// Kite: "2026-03-13T00:00:00+0530" → UTC epoch = March 12 18:30 UTC
// Adding IST_OFFSET_S → March 13 00:00 UTC → getUTCDate/Month/FullYear = correct IST date
function toBusinessDay(ts) {
  const d = new Date((ts + IST_OFFSET_S) * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function loadLWC(cb) {
  if (typeof window.LightweightCharts !== 'undefined') { cb(); return; }
  if (document.querySelector(`script[src="${CDN_URL}"]`)) {
    const poll = setInterval(() => {
      if (typeof window.LightweightCharts !== 'undefined') { clearInterval(poll); cb(); }
    }, 50);
    return;
  }
  const s = document.createElement('script');
  s.src = CDN_URL;
  s.onload = cb;
  document.head.appendChild(s);
}

function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return total >= 540 && total <= 935; // 9:00–15:35
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
  const [isDark, setIsDark]               = useState(true);
  const [settings, setSettings]           = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings]   = useState(false);
  const [dropdownPos, setDropdownPos]     = useState(null);
  const [regimeData, setRegimeData]       = useState(null);
  const [stationData, setStationData]     = useState(null);
  const [hoverOHLC, setHoverOHLC]         = useState(null);
  const [isMobile, setIsMobile]           = useState(false);
  const [isLandscape, setIsLandscape]     = useState(false);

  const containerRef     = useRef(null);
  const volContainerRef  = useRef(null);
  const chartRef         = useRef(null);
  const volChartRef      = useRef(null);
  const candleSeriesRef  = useRef(null);
  const displayRef       = useRef([]);
  const priceShiftRef    = useRef(0);
  const resetViewRef     = useRef(null);   // stable fn set inside useEffect
  const settingsBtnRef   = useRef(null);
  const dropdownRef      = useRef(null);

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const indexSymbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
    const indexRef = indexSymbols.includes(symbol) ? symbol : 'NIFTY';

    // Phase 1: chart data + daily candles (for EMA9D/EMA9W overlays)
    let spotPrice = 0;
    const needDailyFetch = chartInterval !== 'day';
    try {
      const fetches = [
        fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=${chartInterval}&bust=1`).then(r => r.json()),
        needDailyFetch
          ? fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=day&bust=1`).then(r => r.json())
          : Promise.resolve(null),
      ];
      const [cd, dd] = await Promise.all(fetches);
      const c = cd?.candles || [];
      setCandles(c);
      spotPrice = c.length ? c[c.length - 1].close : 0;
      // daily candles: for intraday use fetched daily; for daily chart use same candles
      setDailyCandles(needDailyFetch ? (dd?.candles || []) : c);
    } catch { /* leave candles empty */ }

    // Phase 2: regime + station in parallel, now with correct spotPrice
    const [regimeRes, stationRes] = await Promise.allSettled([
      fetch('/api/market-regime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: indexRef, type: 'intraday' }),
      }).then(r => r.json()),
      fetch('/api/order-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          exchange: 'NSE',
          instrumentType: 'EQ',
          transactionType: 'BUY',
          spotPrice,
          productType: 'MIS',
          includeStation: true,
        }),
      }).then(r => r.json()),
    ]);

    if (regimeRes.status === 'fulfilled')  setRegimeData(regimeRes.value);
    if (stationRes.status === 'fulfilled') setStationData(stationRes.value);
    setLoading(false);
  }, [symbol, chartInterval]);

  // Run on mount and interval change
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Detect mobile/tablet (<640px) + landscape orientation
  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 640);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  // Full reset after orientation change — clears price pan + refits time scale
  useEffect(() => {
    const onOrientationChange = () => {
      setTimeout(() => {
        resetViewRef.current?.();
      }, 350);
    };
    window.addEventListener('orientationchange', onOrientationChange);
    return () => window.removeEventListener('orientationchange', onOrientationChange);
  }, []);

  // Auto-refresh every 60s during market hours
  useEffect(() => {
    const id = setInterval(() => {
      if (isMarketHours()) fetchAll();
    }, 60000);
    return () => clearInterval(id);
  }, [fetchAll]);

  // ── Click outside dropdown → close ─────────────────────────────────────────
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

  // ── Build / rebuild chart ───────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const buildChart = () => {
      const el = containerRef.current;
      if (!el) return;
      el.innerHTML = '';

      const LWC        = window.LightweightCharts;
      const isIntraday = chartInterval !== 'day';
      const theme      = THEMES[isDark ? 'dark' : 'light'];

      // 1. Session filter (9:15–15:30 IST) on original UTC timestamps
      // 2. Shift to IST so chart displays correct local time without timezone API
      const sessionFiltered = isIntraday ? toSessionOnly(candles) : candles;
      // Intraday: shift to IST unix timestamps for correct time display
      // Daily: convert to BusinessDay objects — removes all timezone ambiguity
      const display = isIntraday
        ? toISTTimestamps(sessionFiltered)
        : candles.map(c => ({ ...c, time: toBusinessDay(c.time) }));
      if (display.length === 0) return;
      displayRef.current = display;

      const chart = LWC.createChart(el, {
        layout: {
          background: { color: theme.bg },
          textColor:  theme.text,
          fontSize:   11,
          fontFamily: 'monospace',
        },
        grid: {
          vertLines: { color: theme.grid },
          horzLines: { color: theme.grid },
        },
        crosshair: {
          mode:     0,   // Normal — follows mouse exactly, like TradingView
          vertLine: { color: 'rgba(120,140,160,0.7)', width: 1, style: 1, labelVisible: true },
          horzLine: { color: 'rgba(120,140,160,0.7)', width: 1, style: 1, labelVisible: true },
        },
        handleScroll: {
          mouseWheel:      true,
          pressedMouseMove: true,
          horzTouchDrag:   true,
          vertTouchDrag:   true,
        },
        handleScale: {
          mouseWheel: true,
          pinch:      true,
          axisPressedMouseMove: { time: true, price: true },
        },
        rightPriceScale: { borderColor: theme.scaleBorder, textColor: theme.scaleText },
        timeScale: {
          borderColor:    'rgba(255,255,255,0.06)',
          timeVisible:    chartInterval !== 'day',
          secondsVisible: false,
          tickMarkFormatter: (time, tickMarkType) => {
            if (chartInterval === 'day') {
              // time is a BusinessDay object { year, month, day } — no timezone math needed
              if (tickMarkType === 0) return String(time.year);
              if (tickMarkType === 1) return MONTHS_SHORT[time.month - 1];
              return `${String(time.day).padStart(2, '0')} ${MONTHS_SHORT[time.month - 1]}`;
            }
            // Intraday: Unix timestamps pre-shifted +IST_OFFSET_S, read via UTC methods
            const d = new Date(time * 1000);
            const h = String(d.getUTCHours()).padStart(2, '0');
            const m = String(d.getUTCMinutes()).padStart(2, '0');
            return `${h}:${m}`;
          },
        },
        autoSize: true,
      });
      chartRef.current = chart;

      // ── Candlestick ──────────────────────────────────────────────────────────
      const candleSeries = chart.addCandlestickSeries({
        upColor:          theme.candleUp,
        downColor:        theme.candleDown,
        borderUpColor:    theme.candleUp,
        borderDownColor:  theme.candleDown,
        wickUpColor:      theme.candleUp,
        wickDownColor:    theme.candleDown,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      candleSeries.setData(display);

      // ── VWAP (intraday only) ─────────────────────────────────────────────────
      if (settings.showVwap && isIntraday) {
        const vwapData = computeVWAP(display);
        chart.addLineSeries({
          color:            '#f59e0b',
          lineWidth:        1,
          lineStyle:        2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        }).setData(vwapData);
        const last = vwapData[vwapData.length - 1]?.value;
        if (last) setVwap(last);
      } else {
        setVwap(null);
      }

      // ── OR Band ──────────────────────────────────────────────────────────────
      if (settings.showOrBand && isIntraday && display.length >= 1) {
        const lastDay  = Math.floor(display[display.length - 1].time / 86400);
        const dayStart = display.findIndex(c => Math.floor(c.time / 86400) === lastDay);
        const orCandle = display[dayStart >= 0 ? dayStart : 0];
        candleSeries.createPriceLine({ price: orCandle.high, color: '#60a5fa', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'OR H' });
        candleSeries.createPriceLine({ price: orCandle.low,  color: '#60a5fa', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'OR L' });
      }

      // ── S/R zones from Station agent ─────────────────────────────────────────
      if (settings.showSR) {
        const stations = stationData?.station?.allStations;
        if (stations?.length) {
          const ltp  = candles[candles.length - 1]?.close || 0;
          const cur  = display[display.length - 1]?.close || ltp;
          const dist = s => Math.abs(s.price - cur);
          const classify = s => {
            const broken = (s.type === 'SUPPORT' && cur < s.price) ||
                           (s.type === 'RESISTANCE' && cur > s.price);
            return { ...s, broken };
          };
          const classified = stations.map(classify);
          const sup = classified.filter(s => s.type === 'SUPPORT').sort((a, b) => dist(a) - dist(b)).slice(0, 4);
          const res = classified.filter(s => s.type === 'RESISTANCE').sort((a, b) => dist(a) - dist(b)).slice(0, 4);
          for (const s of sup) candleSeries.createPriceLine({ price: s.price, color: s.broken ? theme.srSupBroken : theme.srSupport, lineWidth: s.broken ? 1 : 2, lineStyle: s.broken ? 1 : 3, axisLabelVisible: true, title: s.broken ? `S↓${s.quality >= 7 ? '★' : ''}` : `S${s.quality >= 7 ? '★' : ''}` });
          for (const r of res) candleSeries.createPriceLine({ price: r.price, color: r.broken ? theme.srResBroken : theme.srResist, lineWidth: r.broken ? 1 : 2, lineStyle: r.broken ? 1 : 3, axisLabelVisible: true, title: r.broken ? `R↑${r.quality >= 7 ? '★' : ''}` : `R${r.quality >= 7 ? '★' : ''}` });
        }
      }

      // ── EMA 9 ────────────────────────────────────────────────────────────────
      if (settings.showEma9) {
        const data = computeEMA(display, 9);
        if (data.length) chart.addLineSeries({
          color: theme.ema9Color, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          title: 'EMA9', crosshairMarkerVisible: false,
        }).setData(data);
      }

      // ── EMA 21 ───────────────────────────────────────────────────────────────
      if (settings.showEma21) {
        const data = computeEMA(display, 21);
        if (data.length) chart.addLineSeries({
          color: theme.ema21Color, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          title: 'EMA21', crosshairMarkerVisible: false,
        }).setData(data);
      }

      // ── EMA 50 ───────────────────────────────────────────────────────────────
      if (settings.showEma50) {
        const data = computeEMA(display, 50);
        if (data.length) chart.addLineSeries({
          color: theme.ema50Color, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          title: 'EMA50', crosshairMarkerVisible: false,
        }).setData(data);
      }

      // ── EMA 9 Daily (on intraday charts) ─────────────────────────────────────
      if (settings.showEma9D && isIntraday && dailyCandles.length >= 9) {
        const ema9D = computeEMA(dailyCandles, 9);
        const val   = ema9D.length ? ema9D[ema9D.length - 1].value : null;
        if (val) candleSeries.createPriceLine({ price: val, color: theme.ema9DColor, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'D·EMA9' });
      }

      // ── EMA 9 Weekly (on daily chart) ────────────────────────────────────────
      if (settings.showEma9W && !isIntraday && dailyCandles.length >= 9) {
        const weekly = aggregateWeekly(dailyCandles);
        const ema9W  = computeEMA(weekly, 9);
        const val    = ema9W.length ? ema9W[ema9W.length - 1].value : null;
        if (val) candleSeries.createPriceLine({ price: val, color: theme.ema9WColor, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'W·EMA9' });
      }

      chart.timeScale().fitContent();

      // ── Separate volume pane ─────────────────────────────────────────────────
      if (settings.showVolume && volContainerRef.current) {
        volContainerRef.current.innerHTML = '';
        const volChart = LWC.createChart(volContainerRef.current, {
          layout:     { background: { color: theme.bg }, textColor: theme.scaleText, fontSize: 10, fontFamily: 'monospace' },
          grid:       { vertLines: { visible: false }, horzLines: { visible: false } },
          crosshair:  { mode: 0, vertLine: { color: 'rgba(120,140,160,0.5)', labelVisible: false }, horzLine: { visible: false } },
          handleScroll: false,
          handleScale:  false,
          // Hide price scale so bars use the full width of the pane
          rightPriceScale: { visible: false },
          leftPriceScale:  { visible: false },
          timeScale:   { visible: false, borderColor: 'transparent' },
          autoSize:    true,
        });
        const volSeries = volChart.addHistogramSeries({
          priceFormat:      { type: 'volume' },
          priceScaleId:     'vol',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        volChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.02, bottom: 0 } });
        volSeries.setData(display.map((c, i) => ({
          time:  c.time,
          value: c.volume,
          color: i === 0 || c.close >= display[i - 1]?.close
            ? 'rgba(0,212,170,0.75)' : 'rgba(255,71,87,0.75)',
        })));
        volChart.timeScale().fitContent();
        volChartRef.current = volChart;
        // One-directional sync: main chart drives vol chart time range
        chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
          if (range && volChartRef.current) {
            volChartRef.current.timeScale().setVisibleLogicalRange(range);
          }
        });
      }

      // ── OHLC on crosshair hover ───────────────────────────────────────────────
      chart.subscribeCrosshairMove(param => {
        if (!param || !param.time) { setHoverOHLC(null); return; }
        const bar = param.seriesData?.get(candleSeries);
        const vol = param.logical != null ? displayRef.current[param.logical]?.volume : null;
        if (bar) setHoverOHLC({ open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: vol });
        else setHoverOHLC(null);
      });

      candleSeriesRef.current = candleSeries;
    };

    loadLWC(buildChart);

    // ── Vertical price-pan drag (TradingView style) ──────────────────────────
    // Left-click drag: horizontal → LWC native scroll; vertical → price pan.
    // Vertical threshold: dy must be > 1.5× dx to avoid accidental trigger.
    // Cursor becomes 'ns-resize' during vertical drag for visual feedback.
    // Double-click → reset price pan to auto-fit.
    const el = containerRef.current;
    priceShiftRef.current = 0;

    const dragState = { active: false, startX: 0, startY: 0, lastY: 0, dir: null };

    // Reset price pan + time zoom — called from double-click, double-tap, and reset button
    const resetChartView = () => {
      priceShiftRef.current = 0;
      if (candleSeriesRef.current) candleSeriesRef.current.applyOptions({ autoscaleInfoProvider: undefined });
      if (chartRef.current) chartRef.current.timeScale().fitContent();
    };
    resetViewRef.current = resetChartView;

    // Shared price-pan logic used by both mouse and touch handlers
    const applyPriceShift = deltaY => {
      const cs = candleSeriesRef.current;
      if (!cs) return;
      const refY = el.clientHeight / 2;
      const p1   = cs.coordinateToPrice(refY);
      const p2   = cs.coordinateToPrice(refY + deltaY);
      if (p1 == null || p2 == null) return;
      priceShiftRef.current += p1 - p2;
      const shift = priceShiftRef.current;
      cs.applyOptions({
        autoscaleInfoProvider: orig => {
          const r = orig();
          if (!r) return null;
          return { priceRange: { minValue: r.priceRange.minValue - shift, maxValue: r.priceRange.maxValue - shift } };
        },
      });
    };

    const onMouseDown = e => {
      if (e.button !== 0 || !el.contains(e.target)) return;
      dragState.active = true;
      dragState.startX = e.clientX;
      dragState.startY = e.clientY;
      dragState.lastY  = e.clientY;
      dragState.dir    = null;
    };

    const onMouseMove = e => {
      if (!dragState.active) return;
      const cs = candleSeriesRef.current;
      const ch = chartRef.current;
      if (!cs || !ch) return;

      const dx = Math.abs(e.clientX - dragState.startX);
      const dy = Math.abs(e.clientY - dragState.startY);

      if (!dragState.dir && (dx > 3 || dy > 3)) {
        // Require vertical to clearly dominate (1.5×) to avoid accidental triggers
        dragState.dir = (dy > dx * 1.5) ? 'v' : 'h';
        if (dragState.dir === 'v') {
          ch.applyOptions({ handleScroll: { pressedMouseMove: false, mouseWheel: true } });
          el.style.cursor = 'ns-resize';
        }
      }

      if (dragState.dir !== 'v') return;

      const deltaY = e.clientY - dragState.lastY;
      dragState.lastY = e.clientY;
      if (deltaY !== 0) applyPriceShift(deltaY);
    };

    const onMouseUp = () => {
      if (dragState.active && dragState.dir === 'v') {
        const ch = chartRef.current;
        if (ch) ch.applyOptions({ handleScroll: { pressedMouseMove: true, mouseWheel: true } });
        el.style.cursor = '';
      }
      dragState.active = false;
      dragState.dir    = null;
    };

    const onDblClick = () => resetChartView();

    // ── Touch handlers for vertical pan on mobile/tablet ────────────────────
    // Long press (600ms hold without moving) → reset chart view
    let longPressTimer = null;

    const cancelLongPress = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };

    const onTouchStart = e => {
      if (e.touches.length > 1) { dragState.active = false; cancelLongPress(); return; }
      const t = e.touches[0];
      dragState.active = true;
      dragState.startX = t.clientX;
      dragState.startY = t.clientY;
      dragState.lastY  = t.clientY;
      dragState.dir    = null;
      // Start long-press timer — fires if finger stays still for 600ms
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        dragState.active = false;
        dragState.dir    = null;
        resetChartView();
        if (navigator.vibrate) navigator.vibrate(40); // haptic feedback if available
      }, 600);
    };

    const onTouchMove = e => {
      if (e.touches.length > 1) { dragState.active = false; cancelLongPress(); return; }
      if (!dragState.active) return;
      const t  = e.touches[0];
      const dx = Math.abs(t.clientX - dragState.startX);
      const dy = Math.abs(t.clientY - dragState.startY);
      // Any movement > 6px cancels long press
      if (dx > 6 || dy > 6) cancelLongPress();
      if (!dragState.dir && (dx > 3 || dy > 3)) {
        dragState.dir = (dy > dx * 1.5) ? 'v' : 'h';
        if (dragState.dir === 'v') {
          // Disable LWC's own vertical touch drag — we own vertical now
          chartRef.current?.applyOptions({
            handleScroll: { mouseWheel: true, pressedMouseMove: false, horzTouchDrag: true, vertTouchDrag: false },
          });
        }
      }
      if (dragState.dir !== 'v') return;
      e.preventDefault();
      const deltaY = t.clientY - dragState.lastY;
      dragState.lastY = t.clientY;
      if (deltaY !== 0) applyPriceShift(deltaY);
    };

    const onTouchEnd = e => {
      cancelLongPress();
      if (dragState.active && dragState.dir === 'v') {
        // Restore full LWC scroll handling
        chartRef.current?.applyOptions({
          handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
        });
      }
      dragState.active = false;
      dragState.dir    = null;
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    el.addEventListener('dblclick',   onDblClick);
    el.addEventListener('touchstart',  onTouchStart, { passive: true });
    el.addEventListener('touchmove',   onTouchMove,  { passive: false });
    el.addEventListener('touchend',    onTouchEnd);

    return () => {
      cancelLongPress();
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
      if (volChartRef.current) { volChartRef.current.remove(); volChartRef.current = null; }
      candleSeriesRef.current = null;
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
      el.removeEventListener('dblclick',   onDblClick);
      el.removeEventListener('touchstart',  onTouchStart);
      el.removeEventListener('touchmove',   onTouchMove);
      el.removeEventListener('touchend',    onTouchEnd);
    };
  }, [candles, dailyCandles, chartInterval, stationData, settings, isDark, isMobile]);

  const toggle = key => setSettings(s => ({ ...s, [key]: !s[key] }));

  const isIntraday = chartInterval !== 'day';
  const theme      = THEMES[isDark ? 'dark' : 'light'];
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
    <div className={`h-[100dvh] flex flex-col overflow-hidden ${theme.pageBg} ${theme.text1}`}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className={`${theme.headerBg} border-b ${theme.headerBorder} flex-shrink-0`}>

        {/* Row 1: back · symbol · price · [desktop: intervals + controls] · [mobile: icons] */}
        <div className="px-3 h-11 flex items-center gap-2">

          {/* Back link — icon only on mobile */}
          <a
            href="/terminal"
            className={`flex items-center gap-1.5 ${theme.text2} ${theme.textHover} transition-colors text-sm`}
            title="Back to terminal"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
            </svg>
            <span className="hidden sm:inline">Terminal</span>
          </a>

          <span className={`w-px h-4 ${theme.divider}`} />

          {/* Symbol */}
          <span className={`${theme.text1} font-bold text-sm tracking-wide`}>{symbol}</span>

          {/* LTP + change */}
          {ltp != null && (
            <>
              <span className={`font-mono text-sm ${theme.text2}`}>
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

          {/* Desktop: interval buttons inline */}
          <div className="hidden sm:flex items-center gap-1">
            {Object.entries(INTERVAL_LABELS).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setChartInterval(val)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  chartInterval === val ? 'bg-indigo-600 text-white' : `${theme.text2} ${theme.textHover} ${theme.btnHover}`
                }`}
              >{label}</button>
            ))}
            <span className={`w-px h-4 ${theme.divider} mx-1.5`} />
          </div>

          {/* Theme toggle — always visible */}
          <button
            onClick={() => setIsDark(d => !d)}
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${theme.text2} ${theme.textHover} ${theme.btnHover}`}
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
              </svg>
            )}
          </button>

          {/* Reset view button — in toolbar */}
          <button
            onClick={() => resetViewRef.current?.()}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${theme.text2} ${theme.textHover} ${theme.btnHover}`}
            title="Reset view (or double-click chart)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
            </svg>
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Overlays button — icon+text on desktop, icon-only on mobile */}
          <button
            ref={settingsBtnRef}
            onClick={openSettings}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              showSettings ? `${theme.btnActive} ${theme.text1}` : `${theme.text2} ${theme.textHover} ${theme.btnHover}`
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
        <div className={`sm:hidden flex items-center gap-1 px-3 pb-2`}>
          {Object.entries(INTERVAL_LABELS).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setChartInterval(val)}
              className={`flex-1 py-1 rounded-md text-xs font-semibold transition-colors ${
                chartInterval === val ? 'bg-indigo-600 text-white' : `${theme.text2} ${theme.btnHover}`
              }`}
            >{label}</button>
          ))}
        </div>
      </header>

      {/* ── Chart area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* Main chart wrapper */}
        <div className="flex-1 relative min-h-0">

          {/* Loading spinner */}
          {loading && (
            <div className={`absolute inset-0 flex items-center justify-center z-10 ${theme.pageBg}`}>
              <div className={`flex items-center gap-2 ${theme.text2} text-sm`}>
                <span className="w-4 h-4 border-2 border-slate-400 border-t-indigo-500 rounded-full animate-spin" />
                Loading…
              </div>
            </div>
          )}

          {/* Error state */}
          {!loading && candles.length === 0 && (
            <div className={`absolute inset-0 flex items-center justify-center z-10 ${theme.pageBg}`}>
              <div className={`flex flex-col items-center gap-4 ${theme.dropdownBg} border ${theme.dropdownBdr} rounded-2xl px-8 py-6`}>
                <span className="text-2xl">⚠</span>
                <div className="text-center">
                  <p className={`${theme.text1} font-semibold text-sm`}>Could not load chart data</p>
                  <p className={`${theme.text2} text-xs mt-1`}>Symbol: {symbol}</p>
                </div>
                <button
                  onClick={fetchAll}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* LightweightCharts mount point */}
          <div ref={containerRef} className="w-full h-full" />


        {/* Symbol · interval + OHLCV — top-left */}
        {(() => {
          const bar    = hoverOHLC || (candles.length > 0 ? candles[candles.length - 1] : null);
          const chgPct = bar ? ((bar.close - bar.open) / bar.open * 100) : null;
          const barUp  = bar ? bar.close >= bar.open : null;
          return (
            <div className="absolute top-2 left-2 z-10 pointer-events-none select-none">
              <div className={`text-[10px] ${theme.watermark} font-mono`}>
                {symbol} · {INTERVAL_LABELS[chartInterval]}
              </div>
              {bar && (
                <>
                  {/* Desktop: single row */}
                  <div className="hidden sm:flex items-center gap-2 mt-0.5 text-[11px] font-mono">
                    <span className={theme.text2}>O <span className={theme.text1}>{bar.open.toFixed(2)}</span></span>
                    <span className={theme.text2}>H <span className="text-emerald-400">{bar.high.toFixed(2)}</span></span>
                    <span className={theme.text2}>L <span className="text-red-400">{bar.low.toFixed(2)}</span></span>
                    <span className={theme.text2}>C <span className={barUp ? 'text-emerald-400' : 'text-red-400'}>{bar.close.toFixed(2)}</span></span>
                    {chgPct != null && <span className={barUp ? 'text-emerald-400' : 'text-red-400'}>{barUp ? '+' : ''}{chgPct.toFixed(2)}%</span>}
                    {bar.volume != null && <span className={theme.text2}>V <span className={theme.text1}>{fmtVol(bar.volume)}</span></span>}
                  </div>
                  {/* Mobile: two compact rows */}
                  <div className="sm:hidden mt-0.5 font-mono space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className={barUp ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{bar.close.toFixed(2)}</span>
                      {chgPct != null && <span className={`text-[10px] ${barUp ? 'text-emerald-400' : 'text-red-400'}`}>{barUp ? '+' : ''}{chgPct.toFixed(2)}%</span>}
                    </div>
                    <div className={`flex items-center gap-1.5 text-[10px] ${theme.text2}`}>
                      <span>O <span className={theme.text1}>{bar.open.toFixed(1)}</span></span>
                      <span>H <span className="text-emerald-400">{bar.high.toFixed(1)}</span></span>
                      <span>L <span className="text-red-400">{bar.low.toFixed(1)}</span></span>
                      {bar.volume != null && <span>V <span className={theme.text1}>{fmtVol(bar.volume)}</span></span>}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* EMA legend — top-center pill (desktop only) */}
        {anyEma && (
          <div className={`hidden sm:flex absolute top-2 left-1/2 -translate-x-1/2 z-10 items-center gap-4 pointer-events-none select-none ${theme.emaPillBg} px-3 py-1 rounded-full border`}>
            {settings.showEma9 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: theme.ema9Color }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: theme.ema9Color }} />
                EMA 9
              </span>
            )}
            {settings.showEma21 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: theme.ema21Color }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: theme.ema21Color }} />
                EMA 21
              </span>
            )}
            {settings.showEma50 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: theme.ema50Color }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: theme.ema50Color }} />
                EMA 50
              </span>
            )}
            {settings.showEma9D && isIntraday && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: theme.ema9DColor }}>
                <span className="w-5 h-px rounded-full inline-block" style={{ backgroundColor: theme.ema9DColor }} />
                D·EMA9
              </span>
            )}
            {settings.showEma9W && !isIntraday && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: theme.ema9WColor }}>
                <span className="w-5 h-px rounded-full inline-block" style={{ backgroundColor: theme.ema9WColor }} />
                W·EMA9
              </span>
            )}
          </div>
        )}

          {/* VWAP badge — bottom-left */}
          {settings.showVwap && isIntraday && vwap != null && (
            <div className={`absolute bottom-10 left-3 z-10 flex items-center gap-1.5 ${theme.badgeBg} border ${theme.vwapBorder} rounded-lg px-2.5 py-1 pointer-events-none select-none`}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-[10px] text-amber-500 font-mono font-semibold">VWAP</span>
              <span className={`text-[10px] ${theme.text2} font-mono`}>₹{vwap.toFixed(1)}</span>
            </div>
          )}

          {/* Regime badge — bottom-left below VWAP */}
          {regime && (
            <div className={`absolute bottom-3 left-3 z-10 flex items-center gap-1.5 ${theme.badgeBg} border ${theme.badgeBorder} rounded-lg px-2.5 py-1.5 pointer-events-none select-none`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${regime.dot}`} />
              <span className={`text-xs font-semibold ${theme.text1}`}>{regime.label}</span>
              {regimeData?.confidence && (
                <span className={`text-[10px] font-bold ${confColor}`}>{regimeData.confidence}</span>
              )}
            </div>
          )}

          {/* Scenario badge — bottom-right */}
          {scenarioResult?.label && scenarioResult.scenario !== 'UNCLEAR' && (
            <div className={`absolute bottom-3 right-3 z-10 flex items-center gap-1 ${theme.badgeBg} border ${theme.badgeBorder} rounded-lg px-2.5 py-1.5 pointer-events-none select-none`}>
              <span className={`text-xs ${theme.text2}`}>{scenarioResult.label}</span>
              {scenarioResult.confidence && (
                <span className={`text-[10px] font-bold ml-1 ${scenarioConfCls}`}>{scenarioResult.confidence}</span>
              )}
            </div>
          )}
        </div>{/* end main chart wrapper */}

        {/* Volume pane — separate LWC instance, hideable */}
        {settings.showVolume && (
          <div className={`flex-shrink-0 relative border-t ${theme.headerBorder} ${isLandscape ? 'h-12' : 'h-24'}`}>
            <div ref={volContainerRef} className="w-full h-full" />
            <div className={`absolute top-1 left-2 text-[9px] font-mono pointer-events-none select-none ${theme.text2}`}>
              VOL
            </div>
          </div>
        )}

      </div>{/* end chart area */}

      {/* ── Settings panel: bottom sheet on mobile, dropdown on desktop ──────── */}
      {showSettings && (
        isMobile ? (
          /* Mobile: full-width bottom sheet with backdrop */
          <div className="fixed inset-0 z-[200] flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowSettings(false)}
            />
            <div className={`relative ${theme.dropdownBg} border-t ${theme.dropdownBdr} rounded-t-2xl shadow-2xl p-4 pb-8`}>
              {/* Drag handle */}
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
              <div className={`text-[11px] ${theme.text2} font-semibold uppercase tracking-wider mb-3 px-1`}>
                Chart Overlays
              </div>
              <div className="grid grid-cols-2 gap-1">
                {OVERLAY_DEFS.map(({ key, label, color, intradayOnly, dailyOnly }) => {
                  const disabled = (intradayOnly && !isIntraday) || (dailyOnly && isIntraday);
                  const on       = settings[key] && !disabled;
                  return (
                    <button
                      key={key}
                      onClick={() => !disabled && toggle(key)}
                      disabled={disabled}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors text-left ${
                        disabled ? 'opacity-25 cursor-not-allowed' : on ? `${theme.btnActive}` : `${theme.btnHover}`
                      }`}
                    >
                      <span className="w-4 h-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: color, opacity: on ? 1 : 0.3 }} />
                      <span className={`text-sm flex-1 ${on ? theme.text1 : theme.text2}`}>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Desktop: fixed dropdown */
          dropdownPos && (
            <div
              ref={dropdownRef}
              className={`fixed z-[200] ${theme.dropdownBg} border ${theme.dropdownBdr} rounded-xl shadow-2xl p-3`}
              style={{ top: dropdownPos.top, right: dropdownPos.right, minWidth: 196 }}
            >
              <div className={`text-[10px] ${theme.text2} font-semibold uppercase tracking-wider mb-2 px-1`}>
                Chart Overlays
              </div>
              <div className="space-y-0.5">
                {OVERLAY_DEFS.map(({ key, label, color, intradayOnly, dailyOnly }) => {
                  const disabled = (intradayOnly && !isIntraday) || (dailyOnly && isIntraday);
                  const on       = settings[key] && !disabled;
                  return (
                    <button
                      key={key}
                      onClick={() => !disabled && toggle(key)}
                      disabled={disabled}
                      className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg transition-colors text-left ${
                        disabled ? 'opacity-25 cursor-not-allowed' : `${theme.btnHover}`
                      }`}
                    >
                      <span className="flex items-center w-5 flex-shrink-0">
                        <span className="w-full h-0.5 rounded-full block" style={{ backgroundColor: color, opacity: on ? 1 : 0.2 }} />
                      </span>
                      <span className={`text-xs flex-1 ${on ? theme.text1 : theme.text2}`}>{label}</span>
                      <span className={`text-[10px] font-bold w-5 text-right ${on ? 'text-indigo-500' : theme.text2}`}>
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
