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

// Overlay definitions — order = display order in settings panel
const OVERLAY_DEFS = [
  { key: 'showVwap',   label: 'VWAP',      color: '#f59e0b', intradayOnly: true  },
  { key: 'showOrBand', label: 'OR Band',   color: '#3b82f6', intradayOnly: true  },
  { key: 'showSR',     label: 'S/R Zones', color: '#94a3b8', intradayOnly: false },
  { key: 'showEma9',   label: 'EMA 9',     color: '#22d3ee', intradayOnly: false },
  { key: 'showEma21',  label: 'EMA 21',    color: '#f97316', intradayOnly: false },
  { key: 'showEma50',  label: 'EMA 50',    color: '#a78bfa', intradayOnly: false },
  { key: 'showVolume', label: 'Volume',    color: '#475569', intradayOnly: false },
];

const DEFAULT_SETTINGS = {
  showVwap:   true,
  showOrBand: true,
  showSR:     true,
  showEma9:   true,
  showEma21:  true,
  showEma50:  false,
  showVolume: true,
};

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
  const [loading, setLoading]             = useState(true);
  const [vwap, setVwap]                   = useState(null);
  const [settings, setSettings]           = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings]   = useState(false);
  const [dropdownPos, setDropdownPos]     = useState(null);
  const [regimeData, setRegimeData]       = useState(null);
  const [stationData, setStationData]     = useState(null);

  const containerRef   = useRef(null);
  const chartRef       = useRef(null);
  const settingsBtnRef = useRef(null);
  const dropdownRef    = useRef(null);

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const indexSymbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
    const indexRef = indexSymbols.includes(symbol) ? symbol : 'NIFTY';

    // Phase 1: chart data first — need last close as spotPrice for station detection
    let spotPrice = 0;
    try {
      const cd = await fetch(`/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=${chartInterval}`).then(r => r.json());
      const c = cd.candles || [];
      setCandles(c);
      spotPrice = c.length ? c[c.length - 1].close : 0;
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

      // 1. Session filter (9:15–15:30 IST) on original UTC timestamps
      // 2. Shift to IST so chart displays correct local time without timezone API
      const sessionFiltered = isIntraday ? toSessionOnly(candles) : candles;
      const display = isIntraday ? toISTTimestamps(sessionFiltered) : candles;
      if (display.length === 0) return;

      const chart = LWC.createChart(el, {
        layout: {
          background: { color: '#0a0e1a' },
          textColor:  '#94a3b8',
          fontSize:   11,
          fontFamily: 'monospace',
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.03)' },
          horzLines: { color: 'rgba(255,255,255,0.03)' },
        },
        crosshair: {
          mode:     0,
          vertLine: { color: 'rgba(148,163,184,0.6)', width: 1, style: 1, labelVisible: true },
          horzLine: { color: 'rgba(148,163,184,0.6)', width: 1, style: 1, labelVisible: true },
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
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)', textColor: '#64748b' },
        timeScale: {
          borderColor:    'rgba(255,255,255,0.06)',
          timeVisible:    true,
          secondsVisible: false,
          tickMarkFormatter: ts => {
            const d = new Date(ts * 1000);
            if (chartInterval === 'day') {
              const istD = new Date((ts - IST_OFFSET_S) * 1000);
              return istD.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
            }
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
        upColor:          '#00d4aa',
        downColor:        '#ff4757',
        borderUpColor:    '#00d4aa',
        borderDownColor:  '#ff4757',
        wickUpColor:      '#00d4aa',
        wickDownColor:    '#ff4757',
        priceLineVisible: false,
        lastValueVisible: true,
      });
      candleSeries.setData(display);

      // ── Volume ───────────────────────────────────────────────────────────────
      if (settings.showVolume) {
        const volSeries = chart.addHistogramSeries({
          priceFormat:  { type: 'volume' },
          priceScaleId: 'volume',
        });
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        volSeries.setData(display.map((c, i) => ({
          time:  c.time,
          value: c.volume,
          color: i === 0 || c.close >= display[i - 1]?.close
            ? 'rgba(0,212,170,0.2)' : 'rgba(255,71,87,0.2)',
        })));
      }

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

          // "Broken" flag: zone where price has crossed through — keep original label
          // but mark as broken (S↓ / R↑) and use thinner dashed line + muted color.
          // Full flip (S→R) only confirmed after retest + rejection, which we can't
          // detect here, so we leave the structural label intact.
          const classify = s => {
            const broken = (s.type === 'SUPPORT' && cur < s.price) ||
                           (s.type === 'RESISTANCE' && cur > s.price);
            return { ...s, broken };
          };
          const classified = stations.map(classify);
          const sup = classified.filter(s => s.type === 'SUPPORT').sort((a, b) => dist(a) - dist(b)).slice(0, 4);
          const res = classified.filter(s => s.type === 'RESISTANCE').sort((a, b) => dist(a) - dist(b)).slice(0, 4);
          for (const s of sup) candleSeries.createPriceLine({ price: s.price, color: s.broken ? '#86efac' : '#4ade80', lineWidth: s.broken ? 1 : 2, lineStyle: s.broken ? 1 : 3, axisLabelVisible: true, title: s.broken ? `S↓${s.quality >= 7 ? '★' : ''}` : `S${s.quality >= 7 ? '★' : ''}` });
          for (const r of res) candleSeries.createPriceLine({ price: r.price, color: r.broken ? '#fca5a5' : '#f87171', lineWidth: r.broken ? 1 : 2, lineStyle: r.broken ? 1 : 3, axisLabelVisible: true, title: r.broken ? `R↑${r.quality >= 7 ? '★' : ''}` : `R${r.quality >= 7 ? '★' : ''}` });
        }
      }

      // ── EMA 9 ────────────────────────────────────────────────────────────────
      if (settings.showEma9) {
        const data = computeEMA(display, 9);
        if (data.length) chart.addLineSeries({
          color: '#22d3ee', lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          title: 'EMA9',
          crosshairMarkerVisible: false,
        }).setData(data);
      }

      // ── EMA 21 ───────────────────────────────────────────────────────────────
      if (settings.showEma21) {
        const data = computeEMA(display, 21);
        if (data.length) chart.addLineSeries({
          color: '#f97316', lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          title: 'EMA21',
          crosshairMarkerVisible: false,
        }).setData(data);
      }

      // ── EMA 50 ───────────────────────────────────────────────────────────────
      if (settings.showEma50) {
        const data = computeEMA(display, 50);
        if (data.length) chart.addLineSeries({
          color: '#a78bfa', lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          title: 'EMA50',
          crosshairMarkerVisible: false,
        }).setData(data);
      }

      chart.timeScale().fitContent();
    };

    loadLWC(buildChart);

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles, chartInterval, stationData, settings]);

  const toggle = key => setSettings(s => ({ ...s, [key]: !s[key] }));

  const isIntraday = chartInterval !== 'day';
  const ltp        = candles.length > 0 ? candles[candles.length - 1].close : null;
  const open0      = candles.length > 0 ? candles[0].open : null;
  const changePct  = ltp != null && open0 ? ((ltp - open0) / open0) * 100 : null;
  const isUp       = changePct != null ? changePct >= 0 : null;

  const regime          = regimeData?.regime ? (REGIME_BADGE[regimeData.regime] || REGIME_BADGE.INITIALIZING) : null;
  const confColor       = regimeData?.confidence ? (CONF_COLORS[regimeData.confidence] || 'text-slate-400') : 'text-slate-400';
  const scenarioResult  = stationData?.scenario || null;
  const scenarioConfCls = scenarioResult?.confidence ? (CONF_COLORS[scenarioResult.confidence] || 'text-slate-400') : 'text-slate-400';
  const anyEma          = settings.showEma9 || settings.showEma21 || settings.showEma50;

  return (
    <div className="h-screen bg-[#0a0e1a] flex flex-col text-white overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="bg-[#0a0e1a] border-b border-white/[0.06] px-4 h-12 flex items-center gap-3 flex-shrink-0">

        {/* Back link */}
        <a
          href="/terminal"
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-1"
          title="Back to terminal"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
          </svg>
          Terminal
        </a>

        <span className="w-px h-4 bg-white/10" />

        {/* Symbol */}
        <span className="text-white font-bold text-sm tracking-wide">{symbol}</span>

        {/* LTP + change */}
        {ltp != null && (
          <>
            <span className="font-mono text-sm text-slate-300">
              ₹{ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
            {changePct != null && (
              <span className={`font-mono text-xs font-semibold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {isUp ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
              </span>
            )}
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Interval buttons */}
        <div className="flex items-center gap-1">
          {Object.entries(INTERVAL_LABELS).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setChartInterval(val)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                chartInterval === val
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              {label}
            </button>
          ))}

          <span className="w-px h-4 bg-white/10 mx-1.5" />

          {/* Settings / Overlays button */}
          <button
            ref={settingsBtnRef}
            onClick={openSettings}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              showSettings
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
            }`}
          >
            {/* gear icon */}
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
            </svg>
            Overlays
          </button>
        </div>
      </header>

      {/* ── Chart area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">

        {/* Loading spinner */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#0a0e1a]">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <span className="w-4 h-4 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
              Loading…
            </div>
          </div>
        )}

        {/* Error state */}
        {!loading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#0a0e1a]">
            <div className="flex flex-col items-center gap-4 bg-[#111827] border border-white/[0.08] rounded-2xl px-8 py-6">
              <span className="text-2xl">⚠</span>
              <div className="text-center">
                <p className="text-slate-200 font-semibold text-sm">Could not load chart data</p>
                <p className="text-slate-500 text-xs mt-1">Symbol: {symbol}</p>
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

        {/* Symbol · interval — top-left watermark */}
        <div className="absolute top-2 left-3 z-10 text-[10px] text-slate-600 font-mono pointer-events-none select-none">
          {symbol} · {INTERVAL_LABELS[chartInterval]}
        </div>

        {/* EMA legend — top-center pill */}
        {anyEma && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 pointer-events-none select-none bg-[#0a0e1a]/70 px-3 py-1 rounded-full border border-white/[0.06]">
            {settings.showEma9 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: '#22d3ee' }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: '#22d3ee' }} />
                EMA 9
              </span>
            )}
            {settings.showEma21 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: '#f97316' }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: '#f97316' }} />
                EMA 21
              </span>
            )}
            {settings.showEma50 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold font-mono" style={{ color: '#a78bfa' }}>
                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: '#a78bfa' }} />
                EMA 50
              </span>
            )}
          </div>
        )}

        {/* VWAP badge — bottom-left */}
        {settings.showVwap && isIntraday && vwap != null && (
          <div className="absolute bottom-20 left-3 z-10 flex items-center gap-1.5 bg-[#0a0e1a]/90 border border-amber-500/20 rounded-lg px-2.5 py-1 pointer-events-none select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-[10px] text-amber-400 font-mono font-semibold">VWAP</span>
            <span className="text-[10px] text-slate-300 font-mono">₹{vwap.toFixed(1)}</span>
          </div>
        )}

        {/* Regime badge — bottom-left below VWAP */}
        {regime && (
          <div className="absolute bottom-10 left-3 z-10 flex items-center gap-1.5 bg-[#0a0e1a]/90 border border-white/10 rounded-lg px-2.5 py-1.5 pointer-events-none select-none">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${regime.dot}`} />
            <span className="text-xs font-semibold text-slate-300">{regime.label}</span>
            {regimeData?.confidence && (
              <span className={`text-[10px] font-bold ${confColor}`}>{regimeData.confidence}</span>
            )}
          </div>
        )}

        {/* Scenario badge — bottom-right */}
        {scenarioResult?.label && scenarioResult.scenario !== 'UNCLEAR' && (
          <div className="absolute bottom-10 right-3 z-10 flex items-center gap-1 bg-[#0a0e1a]/90 border border-white/10 rounded-lg px-2.5 py-1.5 pointer-events-none select-none">
            <span className="text-xs text-slate-400">{scenarioResult.label}</span>
            {scenarioResult.confidence && (
              <span className={`text-[10px] font-bold ml-1 ${scenarioConfCls}`}>{scenarioResult.confidence}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Settings dropdown — fixed position, never clipped ─────────────────── */}
      {showSettings && dropdownPos && (
        <div
          ref={dropdownRef}
          className="fixed z-[200] bg-[#111827] border border-white/[0.12] rounded-xl shadow-2xl p-3"
          style={{ top: dropdownPos.top, right: dropdownPos.right, minWidth: 188 }}
        >
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2 px-1">
            Chart Overlays
          </div>
          <div className="space-y-0.5">
            {OVERLAY_DEFS.map(({ key, label, color, intradayOnly }) => {
              const disabled = intradayOnly && !isIntraday;
              const on       = settings[key] && !disabled;
              return (
                <button
                  key={key}
                  onClick={() => !disabled && toggle(key)}
                  disabled={disabled}
                  className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg transition-colors text-left ${
                    disabled ? 'opacity-25 cursor-not-allowed' : 'hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="flex items-center w-5 flex-shrink-0">
                    <span
                      className="w-full h-0.5 rounded-full block transition-opacity"
                      style={{ backgroundColor: color, opacity: on ? 1 : 0.2 }}
                    />
                  </span>
                  <span className={`text-xs flex-1 ${on ? 'text-slate-200' : 'text-slate-500'}`}>{label}</span>
                  <span className={`text-[10px] font-bold w-5 text-right ${on ? 'text-indigo-400' : 'text-slate-600'}`}>
                    {on ? 'ON' : 'OFF'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
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
