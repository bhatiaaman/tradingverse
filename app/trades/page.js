  'use client';

  import React, { useState, useEffect, useRef } from 'react';
  import Link from 'next/link';
  import { TrendingUp, RefreshCw,ChevronDown, ChevronUp,AlertCircle  } from 'lucide-react';
  import { useTheme } from '../../lib/theme-context';
  import { usePageVisibility } from '@/app/hooks/usePageVisibility';

  // ── Check if nifty price is near a key H/L level (within 0.3%) ────────────
function getNiftyLevelAlerts(indices) {
  const price = parseFloat(indices?.nifty);
  if (!price || isNaN(price)) return [];
  const threshold = price * 0.003;
  const levels = [
    { val: parseFloat(indices?.niftyHigh),        label: 'daily high',   type: 'resistance' },
    { val: parseFloat(indices?.niftyLow),         label: 'daily low',    type: 'support'    },
    { val: parseFloat(indices?.niftyWeeklyHigh),  label: 'weekly high',  type: 'resistance' },
    { val: parseFloat(indices?.niftyWeeklyLow),   label: 'weekly low',   type: 'support'    },
  ];
  return levels.filter(l => l.val && !isNaN(l.val) && Math.abs(price - l.val) <= threshold);
}

// ── Bias history + reversal signals → human-readable narrative ───────────
  // history is newest-first: [current, previous, older, ...]
  // reversal is the detectReversalZone() result already in commentary.reversal
  function getBiasNarrative(history, reversal) {
    if (!history?.length) return null;

    const biasLabel = b =>
      b === 'BULLISH' ? 'Bullish' : b === 'BEARISH' ? 'Bearish' : 'Neutral';

    // ── Build reversal signal suffix from candlestick/RSI/OI/volume signals ──
    let reversalSuffix = '';
    if (reversal?.reversalZone) {
      const signalLabels = {
        rsi_reversal:   'RSI',
        volume_reversal:'volume spike',
        price_extreme:  'at extremes',
        oi_divergence:  'OI divergence',
        key_level_test: 'key level',
      };
      const signals = (reversal.signals || [])
        .map(s => signalLabels[s.type] || s.type)
        .filter(Boolean)
        .join(', ');
      const dir  = biasLabel(reversal.direction);
      const conf = reversal.confidence;
      if (conf === 'HIGH') {
        reversalSuffix = ` | ⚡ ${dir} reversal zone${signals ? ` — ${signals}` : ''}`;
      }
    }

    const [c, prev, older] = history; // c = current (newest)

    // ── 3+ entries: detect reversal accepted vs rejected ──────────────────
    if (prev && older) {
      const throughNeutral = prev.bias === 'NEUTRAL';
      if (throughNeutral && older.bias !== 'NEUTRAL') {
        if (c.bias === older.bias) {
          const side = c.bias === 'BULLISH' ? 'bulls held' : 'bears held';
          return `${older.time} ${biasLabel(older.bias)} → ${prev.time} Neutral → ${c.time} ${biasLabel(c.bias)} — reversal rejected, ${side}${reversalSuffix}`;
        }
        if (c.bias !== 'NEUTRAL') {
          return `${older.time} ${biasLabel(older.bias)} → ${prev.time} Neutral → ${c.time} ${biasLabel(c.bias)} — reversal confirmed${reversalSuffix}`;
        }
      }
    }

    // ── 2 entries: describe the transition ────────────────────────────────
    if (prev) {
      if (c.bias === prev.bias) {
        return `${biasLabel(c.bias)} holding since ${prev.time}${reversalSuffix}`;
      }
      const from = prev.bias;
      const to   = c.bias;
      const notes = {
        'BEARISH→BULLISH': 'reversal — bears capitulating',
        'BULLISH→BEARISH': 'reversal — bulls fading',
        'BEARISH→NEUTRAL': 'bearish signal weakening',
        'BULLISH→NEUTRAL': 'bullish signal weakening',
        'NEUTRAL→BEARISH': 'bias turning bearish',
        'NEUTRAL→BULLISH': 'bias turning bullish',
      };
      const note = notes[`${from}→${to}`] || '';
      return `${prev.time} ${biasLabel(from)} → ${c.time} ${biasLabel(to)}${note ? ' — ' + note : ''}${reversalSuffix}`;
    }

    // ── Single entry ──────────────────────────────────────────────────────
    const stateNote = c.state && c.state !== 'LOADING' ? ` (${c.state})` : '';
    return `${biasLabel(c.bias)} since ${c.time}${stateNote}${reversalSuffix}`;
  }

  export default function TradesPage() {
    const { isDark, toggleTheme } = useTheme();
    const [marketData, setMarketData] = useState(null);
    const [sectorData, setSectorData] = useState([]);
    const [sectorError, setSectorError] = useState('');
    const [sectorLoading, setSectorLoading] = useState(true);
    const [newsData, setNewsData] = useState([]);
    const [eventsData, setEventsData] = useState([]);
    const [newsLoading, setNewsLoading] = useState(true);
    const [optionChainData, setOptionChainData] = useState(null);
    const [optionLoading, setOptionLoading] = useState(true);
    const [optionUnderlying, setOptionUnderlying] = useState('NIFTY');
    const [optionExpiry, setOptionExpiry] = useState('weekly');

    // Helper: check if today is in last week of expiry (after 2nd last Tuesday to last Thursday)
    function isLastWeekOfExpiry(date = new Date()) {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const year = d.getFullYear();
      const month = d.getMonth();
      // Find all Tuesdays in the month
      let tuesdays = [];
      for (let i = 1; i <= 31; i++) {
        const dt = new Date(year, month, i);
        if (dt.getMonth() !== month) break;
        if (dt.getDay() === 2) tuesdays.push(dt);
      }
      // Find all Thursdays in the month
      let thursdays = [];
      for (let i = 1; i <= 31; i++) {
        const dt = new Date(year, month, i);
        if (dt.getMonth() !== month) break;
        if (dt.getDay() === 4) thursdays.push(dt);
      }
      if (tuesdays.length < 2 || thursdays.length === 0) return false;
      const secondLastTuesday = tuesdays[tuesdays.length - 2];
      const lastThursday = thursdays[thursdays.length - 1];
      // If today is after second last Tuesday and on or before last Thursday
      return d > secondLastTuesday && d <= lastThursday;
    }

    // Auto-select expiry type for NIFTY
    useEffect(() => {
      if (optionUnderlying === 'NIFTY') {
        setOptionExpiry(isLastWeekOfExpiry() ? 'monthly' : 'weekly');
      } else if (optionUnderlying === 'BANKNIFTY') {
        setOptionExpiry('monthly'); // Always monthly for BankNifty
      }
    }, [optionUnderlying]);
    const [sentimentData, setSentimentData] = useState(null);
    const [sentimentLoading, setSentimentLoading] = useState(true);
    const [kiteAuth, setKiteAuth] = useState({ isLoggedIn: false, checking: true });
    const isMarketHours = () => {
      const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      return mins >= 540 && mins <= 960; // 9:00 AM – 4:00 PM IST
    };
    const isVisible = usePageVisibility();
    const [commentary, setCommentary] = useState(null);
    const [commentaryLoading, setCommentaryLoading] = useState(true); 
    const [commentaryCollapsed, setCommentaryCollapsed] = useState(false);
    // Chart state
    const [chartSymbol, setChartSymbol] = useState('NIFTY');
    const [chartInterval, setChartInterval] = useState('15minute');
    const [emaPeriods, setEmaPeriods] = useState([9,21]);
    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const candleSeriesRef = useRef(null);

    // Check Kite auth status
    useEffect(() => {
      const checkKiteAuth = async () => {
        try {
          const res = await fetch('/api/kite-config');
          const data = await res.json();
          setKiteAuth({ isLoggedIn: data.tokenValid === true, checking: false });
        } catch (error) {
          setKiteAuth({ isLoggedIn: false, checking: false });
        }
      };
      checkKiteAuth();
      const pollInterval = setInterval(checkKiteAuth, 5000);
      const handleMessage = (event) => {
        if (event.data?.type === 'KITE_LOGIN_SUCCESS' || event.data?.type === 'KITE_LOGOUT_SUCCESS') {
          checkKiteAuth();
        }
      };
      window.addEventListener('message', handleMessage);
      return () => {
        clearInterval(pollInterval);
        window.removeEventListener('message', handleMessage);
      };
    }, []);

    const openKiteSettings = () => {
      window.open('/settings/kite', 'kite-settings', 'width=600,height=700,scrollbars=yes');
    };

    // Fetch market data
    useEffect(() => {
      const fetchMarketData = async () => {
        try {
          const response = await fetch('/api/market-data');
          const data = await response.json();
          setMarketData(data);
        } catch (error) {
          console.error('Failed to fetch market data:', error);
        }
      };
      fetchMarketData();
      const interval = setInterval(() => { if (isMarketHours() && isVisible) fetchMarketData(); }, 60000);
      return () => clearInterval(interval);
    }, []);

    // Fetch sector performance data
    useEffect(() => {
      let firstLoad = true;
      const fetchSectorData = async () => {
        // Show spinner only on initial load — subsequent polls update silently
        if (firstLoad) setSectorLoading(true);
        try {
          const response = await fetch('/api/sector-performance');
          const data = await response.json();
          // On transient error the API returns stale cached sectors + error field.
          // Only update the sector list when real sector data is present; never clear it.
          if (data.sectors?.length > 0) {
            setSectorData(data.sectors);
            setSectorError('');
          } else if (data?.error) {
            // Keep existing data visible; just note the error quietly
            setSectorError(data.error);
          }
        } catch (error) {
          console.error('Failed to fetch sector data:', error);
          // Don't clear sectorData on network error — keep last known values
        } finally {
          if (firstLoad) { setSectorLoading(false); firstLoad = false; }
        }
      };
      fetchSectorData();
      const interval = setInterval(() => { if (isMarketHours() && isVisible) fetchSectorData(); }, 300000);
      return () => clearInterval(interval);
    }, []);

    // Fetch option chain data
    useEffect(() => {
      const fetchOptionChain = async () => {
        setOptionLoading(true);
        try {
          const response = await fetch(`/api/option-chain?underlying=${optionUnderlying}&expiry=${optionExpiry}`);
          const data = await response.json();
          setOptionChainData(data);
        } catch (error) {
          console.error('Failed to fetch option chain:', error);
        } finally {
          setOptionLoading(false);
        }
      };
      fetchOptionChain();
      const interval = setInterval(() => { if (isMarketHours()) fetchOptionChain(); }, 60000);
      return () => clearInterval(interval);
    }, [optionUnderlying, optionExpiry]);

    // Fetch market news and events
    useEffect(() => {
      const fetchNewsAndEvents = async () => {
        try {
          const response = await fetch('/api/market-events');
          const data = await response.json();
          if (data.news) setNewsData(data.news);
          if (data.events) setEventsData(data.events);
        } catch (error) {
          console.error('Error fetching news:', error);
        } finally {
          setNewsLoading(false);
        }
      };
      fetchNewsAndEvents();
      const interval = setInterval(fetchNewsAndEvents, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }, []);

    // Add fetch function (around line 150)
    useEffect(() => {
      const fetchCommentary = async () => {
        try {
          const response = await fetch('/api/market-commentary');
          const data = await response.json();
          setCommentary(data.commentary);
        } catch (error) {
          console.error('Failed to fetch commentary:', error);
        } finally {
          setCommentaryLoading(false);
        }
      };
      
      fetchCommentary();
      
      // Refresh every 5 minutes
      const interval = setInterval(() => {
        if (isMarketHours() && isVisible) fetchCommentary();
      }, 5 * 60 * 1000);
      
      return () => clearInterval(interval);
    }, []);

    // Fetch sentiment data
    useEffect(() => {
      const fetchSentiment = async () => {
        setSentimentLoading(true);
        try {
          const pcr = optionChainData?.pcr;
          const url = pcr ? `/api/sentiment?pcr=${pcr}` : '/api/sentiment';
          const response = await fetch(url);
          const data = await response.json();
          setSentimentData(data);
        } catch (error) {
          console.error('Error fetching sentiment:', error);
        } finally {
          setSentimentLoading(false);
        }
      };
      fetchSentiment();
      const interval = setInterval(() => { if (isMarketHours() && isVisible) fetchSentiment(); }, 15 * 60 * 1000);
      return () => clearInterval(interval);
    }, [optionChainData?.pcr]);

    // Calculate EMA from candle data
    const calculateEMA = (candles, period) => {
      if (!candles || candles.length < period) return [];
      const k = 2 / (period + 1);
      const emaData = [];
      let sum = 0;
      for (let i = 0; i < period; i++) sum += candles[i].close;
      let ema = sum / period;
      emaData.push({ time: candles[period - 1].time, value: ema });
      for (let i = period; i < candles.length; i++) {
        ema = candles[i].close * k + ema * (1 - k);
        emaData.push({ time: candles[i].time, value: ema });
      }
      return emaData;
    };

    // Initialize chart
    useEffect(() => {
      const el = chartRef.current;
      if (!el) return;
      let chart = null;
      let candleSeries = null;
      let emaSeriesArr = [];
      let refreshInterval = null;
      let resizeObserver = null;

      const initChart = async () => {
        if (typeof window.LightweightCharts === 'undefined') {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js';
          script.onload = () => initChart();
          document.head.appendChild(script);
          return;
        }
        el.innerHTML = '';
        chart = window.LightweightCharts.createChart(el, {
          layout: { background: { type: 'solid', color: '#112240' }, textColor: '#94a3b8' },
          grid: { vertLines: { color: 'rgba(66, 99, 235, 0.1)' }, horzLines: { color: 'rgba(66, 99, 235, 0.1)' } },
          width: el.clientWidth,
          height: el.clientHeight || 400,
          crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
          rightPriceScale: { borderColor: 'rgba(66, 99, 235, 0.3)' },
          timeScale: {
            borderColor: 'rgba(66, 99, 235, 0.3)',
            timeVisible: chartInterval !== 'day' && chartInterval !== 'week',
            secondsVisible: false,
          },
          localization: {
            timeFormatter: (timestamp) => {
              const date = new Date(timestamp * 1000);
              if (chartInterval === 'day' || chartInterval === 'week') {
                return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
              }
              return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
            },
          },
        });
        candleSeries = chart.addCandlestickSeries({
          upColor: '#10b981', downColor: '#ef4444',
          borderUpColor: '#10b981', borderDownColor: '#ef4444',
          wickUpColor: '#10b981', wickDownColor: '#ef4444',
        });
        // Add multiple EMA series
        emaSeriesArr = emaPeriods.map((period, idx) => {
          const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#a21caf'];
          return chart.addLineSeries({
            color: colors[idx % colors.length],
            lineWidth: 2,
            title: `EMA${period}`,
            crosshairMarkerVisible: true,
            priceLineVisible: false,
          });
        });
        chartInstanceRef.current = chart;
        candleSeriesRef.current = candleSeries;

        const fetchChartData = async () => {
          try {
            const days = chartInterval === 'week' ? 365 : chartInterval === 'day' ? 60 : 5;
            const response = await fetch(`/api/nifty-chart?symbol=${chartSymbol}&interval=${chartInterval}&days=${days}`);
            const data = await response.json();
            if (data.candles && data.candles.length > 0) {
              candleSeries.setData(data.candles);
              emaPeriods.forEach((period, idx) => {
                const emaData = calculateEMA(data.candles, period);
                if (emaData.length > 0) emaSeriesArr[idx].setData(emaData);
              });
              chart.timeScale().fitContent();
            }
          } catch (error) {
            console.error('Failed to fetch chart data:', error);
          }
        };
        await fetchChartData();
        if (chartInterval === '5minute' || chartInterval === '15minute') {
          refreshInterval = setInterval(fetchChartData, 60000);
        }
        resizeObserver = new ResizeObserver(() => {
          chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        });
        resizeObserver.observe(el);
      };

      initChart();
      return () => {
        if (refreshInterval) clearInterval(refreshInterval);
        if (resizeObserver) resizeObserver.disconnect();
        if (chart) chart.remove();
      };
    }, [chartSymbol, chartInterval, emaPeriods]);

    // Helper: bias to emoji
    const biasEmoji = (bias) => {
      if (!bias) return '🟡';
      if (bias.includes('bullish')) return '🟢';
      if (bias.includes('bearish')) return '🔴';
      return '🟡';
    };

    return (
      <div className="min-h-screen bg-[#0a1628] text-slate-100">
        {/* HEADER */}
        <header className="border-b border-blue-800/50 bg-[#0d1d35]/90 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-7 h-7 text-blue-400" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                Trading Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={e => {
                  e.currentTarget.classList.add('animate-click-scale');
                  setTimeout(() => {
                    e.currentTarget.classList.remove('animate-click-scale');
                  }, 300);
                  openKiteSettings();
                }}
                className={`relative w-9 h-9 flex items-center justify-center rounded-full border-0 focus:outline-none transition-transform duration-300 ${
                  kiteAuth.isLoggedIn ? 'bg-green-500 shadow-[0_0_8px_2px_rgba(34,197,94,0.3)]' :
                  kiteAuth.checking ? 'bg-slate-500' :
                  'bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.3)]'
                }`}
                title={kiteAuth.checking ? 'Checking Kite...' : kiteAuth.isLoggedIn ? 'Kite Connected' : 'Kite Disconnected'}
                style={{
                  boxShadow: kiteAuth.isLoggedIn
                    ? '0 0 8px 2px rgba(34,197,94,0.3)'
                    : kiteAuth.checking
                    ? '0 0 4px 1px rgba(100,116,139,0.2)'
                    : '0 0 8px 2px rgba(239,68,68,0.3)',
                  transition: 'box-shadow 0.3s, background-color 0.3s, transform 0.3s',
                }}
              >
                <span
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-lg font-extrabold select-none transition-colors duration-300 ${
                    kiteAuth.isLoggedIn ? 'text-white drop-shadow-[0_0_4px_rgba(34,197,94,0.7)]' :
                    kiteAuth.checking ? 'text-slate-200' :
                    'text-white drop-shadow-[0_0_4px_rgba(239,68,68,0.7)]'
                  }`}
                  style={{
                    fontFamily: 'monospace',
                  }}
                >K</span>
                {/* Rotating ring animation */}
                <span
                  className={`absolute w-9 h-9 rounded-full border-2 pointer-events-none ${
                    kiteAuth.isLoggedIn ? 'border-green-300 animate-rotate-cw' :
                    kiteAuth.checking ? 'border-slate-300' :
                    'border-red-300 animate-rotate-ccw'
                  }`}
                  style={{
                    opacity: 0.7,
                  }}
                ></span>
                <style jsx>{`
                  @keyframes click-scale {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.12); }
                    100% { transform: scale(1); }
                  }
                  .animate-click-scale { animation: click-scale 0.3s; }
                  @keyframes rotate-cw {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                  @keyframes rotate-ccw {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(-360deg); }
                  }
                  .animate-rotate-cw { animation: rotate-cw 1.2s linear infinite; }
                  .animate-rotate-ccw { animation: rotate-ccw 1.2s linear infinite; }
                `}</style>
              </button>
              <Link href="/orders" className="px-4 py-2 text-sm rounded-lg border border-purple-600/50 bg-purple-900/40 hover:bg-purple-800/50 text-purple-200 transition-colors">
                🛒 Orders
              </Link>
              <Link href="/terminal" className="px-4 py-2 text-sm rounded-lg border border-blue-500/50 bg-blue-900/40 hover:bg-blue-800/50 text-blue-200 transition-colors">
                ⚡ Terminal
              </Link>
              <Link href="/trades/pre-market" className="px-4 py-2 text-sm rounded-lg border border-yellow-600/50 bg-yellow-900/40 hover:bg-yellow-800/50 text-yellow-200 transition-colors">
                🌅 Pre-Market
              </Link>
              <Link href="/" className="px-4 py-2 text-sm rounded-lg border border-blue-600/50 bg-blue-900/40 hover:bg-blue-800/50 text-blue-200 transition-colors">
                Back Home
              </Link>
            </div>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="container mx-auto px-4 py-6">

          {commentary && (
            <div className="mb-4 bg-gradient-to-r from-purple-900/50 via-blue-900/50 to-purple-900/50 border border-purple-700/50 rounded-xl backdrop-blur-sm overflow-hidden">
              {/* Collapsible Header */}
              <button
                onClick={() => setCommentaryCollapsed(!commentaryCollapsed)}
                className="w-full flex items-center justify-between p-4 hover:bg-blue-900/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1.5 rounded-lg font-semibold text-sm flex items-center gap-2 ${
                    commentary.bias === 'BULLISH' ? 'bg-green-900/50 text-green-300 border border-green-700/50' :
                    commentary.bias === 'BEARISH' ? 'bg-red-900/50 text-red-300 border border-red-700/50' :
                    'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50'
                  }`}>
                    <span className="text-lg">{commentary.stateEmoji}</span>
                    <span>{commentary.state}</span>
                  </div>
                  <span className="text-lg">{commentary.biasEmoji}</span>
                  <h3 className="text-base font-bold text-white">
                    {commentary.headline}
                  </h3>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    commentary.bias === 'BULLISH' ? 'text-green-400' :
                    commentary.bias === 'BEARISH' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {commentary.bias}
                  </span>
                  {commentaryCollapsed ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </button>

              {/* Collapsible Content */}
              {!commentaryCollapsed && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-3">
                    {marketData?.indices?.niftyPreviousClose && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Watch Level:</span>
                        <span className="font-mono font-semibold text-blue-300">
                          {marketData.indices.niftyPreviousClose}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-start gap-2 bg-cyan-900/20 border border-cyan-700/30 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span className="text-cyan-300 text-sm font-medium">
                      {commentary.action}
                    </span>
                  </div>

                  {/* Breadth + Bias trail row */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                    {/* Advance / Decline */}
                    {commentary.advances !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Breadth:</span>
                        <span className="font-mono font-semibold text-green-400">{commentary.advances}↑</span>
                        <span className="font-mono font-semibold text-red-400">{commentary.declines}↓</span>
                        {commentary.declines > 0 && (
                          <span className="text-slate-500">({(commentary.advances / commentary.declines).toFixed(1)}:1)</span>
                        )}
                      </div>
                    )}

                    {/* Intraday bias narrative */}
                    {commentary.biasHistory?.length > 0 && (() => {
                      const narrative = getBiasNarrative(commentary.biasHistory, commentary.reversal);
                      const current = commentary.biasHistory[0];
                      // If in a high-confidence reversal zone, tint toward the reversal direction
                      const revDir = commentary.reversal?.reversalZone && commentary.reversal?.confidence === 'HIGH'
                        ? commentary.reversal.direction : null;
                      const effectiveBias = revDir || current?.bias;
                      const color = effectiveBias === 'BULLISH' ? 'text-green-300'
                                  : effectiveBias === 'BEARISH' ? 'text-red-300'
                                  : 'text-yellow-300';
                      return narrative ? (
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-slate-400 flex-shrink-0">Intraday bias:</span>
                          <span className={`font-medium ${color}`}>{narrative}</span>
                        </div>
                      ) : null;
                    })()}

                    {/* H/L proximity alert */}
                    {marketData?.indices && (() => {
                      const alerts = getNiftyLevelAlerts(marketData.indices);
                      if (!alerts.length) return null;
                      return (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {alerts.map((a, i) => (
                            <span key={i} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${a.type === 'resistance' ? 'bg-amber-900/40 text-amber-300' : 'bg-sky-900/40 text-sky-300'}`}>
                              ⚡ Near {a.label} ({parseFloat(a.val).toFixed(0)})
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top Market Data Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-1 mb-4">
            {/* Market Indices */}
            <div className="bg-[#112240] border border-blue-800/40 rounded-lg p-1.5 lg:p-2 flex flex-col justify-center min-h-14 lg:min-h-16">
              <h4 className="text-blue-300 text-[10px] font-semibold mb-1 lg:mb-1.5 text-center">Market Indices</h4>
              <div className="space-y-0.5 lg:space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">Nifty 50</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-100 text-[9px] lg:text-xs font-mono font-medium">{marketData?.indices?.nifty || '---'}</span>
                    {marketData?.indices?.niftyChange && (
                      <span className={`text-[8px] font-mono ${parseFloat(marketData.indices.niftyChange) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {parseFloat(marketData.indices.niftyChange) >= 0 ? '+' : ''}{parseFloat(marketData.indices.niftyChange).toFixed(2)}
                      </span>
                    )}
                    {marketData?.indices?.niftyChangePercent && (
                      <span className={`text-[8px] font-mono ${parseFloat(marketData.indices.niftyChangePercent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ({parseFloat(marketData.indices.niftyChangePercent) >= 0 ? '+' : ''}{parseFloat(marketData.indices.niftyChangePercent).toFixed(2)}%)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">Bank Nifty</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-100 text-[9px] lg:text-xs font-mono font-medium">{marketData?.indices?.bankNifty || '---'}</span>
                    {marketData?.indices?.bankNiftyChange && (
                      <span className={`text-[8px] font-mono ${parseFloat(marketData.indices.bankNiftyChange) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {parseFloat(marketData.indices.bankNiftyChange) >= 0 ? '+' : ''}{parseFloat(marketData.indices.bankNiftyChange).toFixed(2)}
                      </span>
                    )}
                    {marketData?.indices?.bankNiftyChangePercent && (
                      <span className={`text-[8px] font-mono ${parseFloat(marketData.indices.bankNiftyChangePercent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ({parseFloat(marketData.indices.bankNiftyChangePercent) >= 0 ? '+' : ''}{parseFloat(marketData.indices.bankNiftyChangePercent).toFixed(2)}%)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">Sensex</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-100 text-[9px] lg:text-xs font-mono font-medium">{marketData?.indices?.sensex || '---'}</span>
                    {marketData?.indices?.sensexChange && (
                      <span className={`text-[8px] font-mono ${parseFloat(marketData.indices.sensexChange) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {parseFloat(marketData.indices.sensexChange) >= 0 ? '+' : ''}{parseFloat(marketData.indices.sensexChange).toFixed(2)}
                      </span>
                    )}
                    {marketData?.indices?.sensexChangePercent && (
                      <span className={`text-[8px] font-mono ${parseFloat(marketData.indices.sensexChangePercent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ({parseFloat(marketData.indices.sensexChangePercent) >= 0 ? '+' : ''}{parseFloat(marketData.indices.sensexChangePercent).toFixed(2)}%)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">India VIX</span>
                  <div className="flex items-center gap-1">
                    <span className="text-amber-400 text-[9px] lg:text-xs font-mono font-medium">{marketData?.indices?.vix || '---'}</span>
                    {marketData?.indices?.vixChange && (
                      <span className={`text-[8px] font-mono ${parseFloat(marketData.indices.vixChange) >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {parseFloat(marketData.indices.vixChange) >= 0 ? '+' : ''}{parseFloat(marketData.indices.vixChange).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Global Indices */}
            <div className="bg-[#112240] border border-blue-800/40 rounded-lg p-1.5 lg:p-2 flex flex-col justify-center min-h-14 lg:min-h-16">
              <h4 className="text-blue-300 text-[10px] font-semibold mb-1 lg:mb-1.5 text-center">Global Indices</h4>
              <div className="space-y-0.5 lg:space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">DOW</span>
                  <span className="text-slate-100 text-[9px] lg:text-xs font-mono font-medium">{marketData?.global?.dow || '---'}</span>
                  {marketData?.global?.dowChange && (
                    <span className={`text-[8px] font-mono ${parseFloat(marketData.global.dowChange) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {parseFloat(marketData.global.dowChange) >= 0 ? '+' : ''}{parseFloat(marketData.global.dowChange).toFixed(2)}
                    </span>
                  )}
                  {marketData?.global?.dowChangePercent && (
                    <span className={`text-[8px] font-mono ${parseFloat(marketData.global.dowChangePercent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ({parseFloat(marketData.global.dowChangePercent) >= 0 ? '+' : ''}{parseFloat(marketData.global.dowChangePercent).toFixed(2)}%)
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">GIFT Nifty</span>
                  <span className="text-slate-100 text-[9px] lg:text-xs font-mono font-medium">{marketData?.indices?.giftNifty || '---'}</span>
                  {marketData?.indices?.giftNiftyChange && (
                    <span className={`text-[8px] font-mono ${parseFloat(marketData.indices.giftNiftyChange) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {parseFloat(marketData.indices.giftNiftyChange) >= 0 ? '+' : ''}{parseFloat(marketData.indices.giftNiftyChange).toFixed(2)}
                    </span>
                  )}
                  {marketData?.indices?.giftNiftyChangePercent && (
                    <span className={`text-[8px] font-mono ${parseFloat(marketData.indices.giftNiftyChangePercent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ({parseFloat(marketData.indices.giftNiftyChangePercent) >= 0 ? '+' : ''}{parseFloat(marketData.indices.giftNiftyChangePercent).toFixed(2)}%)
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">NASDAQ</span>
                  <span className="text-slate-100 text-[9px] lg:text-xs font-mono font-medium">{marketData?.global?.nasdaq || '---'}</span>
                  {marketData?.global?.nasdaqChange && (
                    <span className={`text-[8px] font-mono ${parseFloat(marketData.global.nasdaqChange) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {parseFloat(marketData.global.nasdaqChange) >= 0 ? '+' : ''}{parseFloat(marketData.global.nasdaqChange).toFixed(2)}
                    </span>
                  )}
                  {marketData?.global?.nasdaqChangePercent && (
                    <span className={`text-[8px] font-mono ${parseFloat(marketData.global.nasdaqChangePercent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ({parseFloat(marketData.global.nasdaqChangePercent) >= 0 ? '+' : ''}{parseFloat(marketData.global.nasdaqChangePercent).toFixed(2)}%)
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">DAX</span>
                  <span className="text-slate-100 text-[9px] lg:text-xs font-mono font-medium">{marketData?.global?.dax || '---'}</span>
                  {marketData?.global?.daxChange && (
                    <span className={`text-[8px] font-mono ${parseFloat(marketData.global.daxChange) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {parseFloat(marketData.global.daxChange) >= 0 ? '+' : ''}{parseFloat(marketData.global.daxChange).toFixed(2)}
                    </span>
                  )}
                  {marketData?.global?.daxChangePercent && (
                    <span className={`text-[8px] font-mono ${parseFloat(marketData.global.daxChangePercent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ({parseFloat(marketData.global.daxChangePercent) >= 0 ? '+' : ''}{parseFloat(marketData.global.daxChangePercent).toFixed(2)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Market Sentiment */}
            <div className="bg-[#112240] border border-blue-800/40 rounded-lg p-1.5 lg:p-2 flex flex-col justify-center min-h-14 lg:min-h-16">
              <h4 className="text-blue-300 text-[10px] font-semibold mb-1 lg:mb-1.5 text-center">Market Sentiment</h4>
              <div className="space-y-0.5 lg:space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">Nifty Bias</span>
                  <span className={`text-[9px] lg:text-xs font-mono font-medium ${marketData?.sentiment?.bias === 'Bullish' ? 'text-emerald-400' : marketData?.sentiment?.bias === 'Bearish' ? 'text-red-400' : 'text-slate-300'}`}>
                    {marketData?.sentiment?.bias || 'Neutral'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">Adv/Decline</span>
                  <span className="text-[9px] lg:text-xs font-mono font-medium">
                    {marketData?.sentiment?.advances > 0 || marketData?.sentiment?.declines > 0 ? (
                      <>
                        <span className="text-emerald-400">{marketData.sentiment.advances}↑</span>
                        <span className="text-slate-500 mx-0.5">/</span>
                        <span className="text-red-400">{marketData.sentiment.declines}↓</span>
                      </>
                    ) : (
                      <span className="text-slate-100">---</span>
                    )}
                  </span>
                </div>


                <div className="bg-slate-800/50 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-slate-400 text-[9px]">Market Activity</div>
                    {optionChainData?.marketActivity?.emoji && (
                      <span className="text-sm">{optionChainData.marketActivity.emoji}</span>
                    )}
                  </div>
                  <div className="text-white font-bold text-[10px] mb-1">
                    {optionChainData?.marketActivity?.activity || 'Loading...'}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    PCR: {optionChainData?.pcr?.toFixed(2) || '---'}
                  </div>
                </div>

              </div>
            </div>

            {/* Nifty Range */}
            {(() => {
              const idx = marketData?.indices;
              const price = parseFloat(idx?.nifty);
              const alerts = idx ? getNiftyLevelAlerts(idx) : [];
              const nearLabel = alerts.length > 0
                ? alerts.map(a => `Near ${a.label}`).join(' · ')
                : null;
              const fmt = v => v && !isNaN(v) ? parseFloat(v).toFixed(0) : '---';
              const isNearHigh = (key) => {
                const v = parseFloat(idx?.[key]);
                return price && v && !isNaN(v) && Math.abs(price - v) <= price * 0.003;
              };
              return (
                <div className="bg-[#112240] border border-blue-800/40 rounded-lg p-1.5 lg:p-2 flex flex-col justify-center min-h-14 lg:min-h-16">
                  <h4 className="text-blue-300 text-[10px] font-semibold mb-1 lg:mb-1.5 text-center">Nifty Range</h4>
                  <div className="space-y-1">
                    <div>
                      <div className="text-slate-500 text-[8px] mb-0.5">Daily</div>
                      <div className="flex justify-between items-center">
                        <span className={`text-xs font-mono font-semibold ${isNearHigh('niftyHigh') ? 'text-amber-300 animate-pulse' : 'text-emerald-400'}`}>{fmt(idx?.niftyHigh)}</span>
                        <span className="text-slate-600 text-[8px]">H/L</span>
                        <span className={`text-xs font-mono font-semibold ${isNearHigh('niftyLow') ? 'text-sky-300 animate-pulse' : 'text-red-400'}`}>{fmt(idx?.niftyLow)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[8px] mb-0.5">Weekly</div>
                      <div className="flex justify-between items-center">
                        <span className={`text-xs font-mono font-semibold ${isNearHigh('niftyWeeklyHigh') ? 'text-amber-300 animate-pulse' : 'text-emerald-600'}`}>{fmt(idx?.niftyWeeklyHigh)}</span>
                        <span className="text-slate-600 text-[8px]">H/L</span>
                        <span className={`text-xs font-mono font-semibold ${isNearHigh('niftyWeeklyLow') ? 'text-sky-300 animate-pulse' : 'text-red-700'}`}>{fmt(idx?.niftyWeeklyLow)}</span>
                      </div>
                    </div>
                    {nearLabel && (
                      <div className="text-[8px] text-amber-400 font-medium text-center mt-0.5">⚡ {nearLabel}</div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Commodities */}
            <div className="bg-[#112240] border border-blue-800/40 rounded-lg p-1.5 lg:p-2 flex flex-col justify-center min-h-14 lg:min-h-16">
              <h4 className="text-blue-300 text-[10px] font-semibold mb-1 lg:mb-1.5 text-center">Commodities</h4>
              <div className="space-y-0.5 lg:space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">Crude Oil</span>
                  <span className={`text-[9px] lg:text-xs font-mono font-medium ${(marketData?.commodities?.crudeChange ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {marketData?.commodities?.crude || '---'} {marketData?.commodities?.crudeChange != null && (marketData.commodities.crudeChange >= 0 ? '▲' : '▼')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">Silver</span>
                  <span className={`text-[9px] lg:text-xs font-mono font-medium ${(marketData?.commodities?.silverChange ?? 0) >= 0 ? 'text-slate-100' : 'text-red-400'}`}>
                    {marketData?.commodities?.silver || '---'} {marketData?.commodities?.silverChange != null && (marketData.commodities.silverChange >= 0 ? '▲' : '▼')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">Gold</span>
                  <span className={`text-[9px] lg:text-xs font-mono font-medium ${(marketData?.commodities?.goldChange ?? 0) >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {marketData?.commodities?.gold || '---'} {marketData?.commodities?.goldChange != null && (marketData.commodities.goldChange >= 0 ? '▲' : '▼')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">Nat. Gas</span>
                  <span className={`text-[9px] lg:text-xs font-mono font-medium ${(marketData?.commodities?.natGasChange ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {marketData?.commodities?.natGas || '---'} {marketData?.commodities?.natGasChange != null && (marketData.commodities.natGasChange >= 0 ? '▲' : '▼')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Main 3-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-4">

            {/* LEFT COLUMN */}
            <div className="lg:col-span-2 space-y-3">

              {/* Scanners */}
              <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl p-3">
                <h2 className="text-sm font-semibold mb-2 text-blue-300">Scanners</h2>
                <ul className="space-y-2">
                  <li>
                    <Link href="/stock-updates/scanner/bullish-bo-15min" className="flex items-center justify-between rounded-lg px-2 py-2 bg-emerald-900/30 hover:bg-emerald-800/40 border border-emerald-700/40 hover:border-emerald-600/60 transition-all text-xs text-slate-200">
                      <span className="font-medium">Bullish BO</span>
                      <span className="text-emerald-400">→</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/stock-updates/scanner/bearish-bo-15min" className="flex items-center justify-between rounded-lg px-2 py-2 bg-red-900/30 hover:bg-red-800/40 border border-red-700/40 hover:border-red-600/60 transition-all text-xs text-slate-200">
                      <span className="font-medium">Bearish BO</span>
                      <span className="text-red-400">→</span>
                    </Link>
                  </li>
                </ul>
              </div>

              {/* AI Sentiment Widget */}
              <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-blue-300">AI Sentiment</h2>
                  <button
                    onClick={async () => {
                      setSentimentLoading(true);
                      try {
                        const pcr = optionChainData?.pcr;
                        const url = pcr ? `/api/sentiment?pcr=${pcr}&refresh=1` : '/api/sentiment?refresh=1';
                        const response = await fetch(url);
                        const data = await response.json();
                        setSentimentData(data);
                      } catch (error) {
                        console.error('Error refreshing sentiment:', error);
                      } finally {
                        setSentimentLoading(false);
                      }
                    }}
                    className="p-1 hover:bg-blue-800/40 rounded transition-colors"
                    title="Refresh sentiment"
                  >
                    <RefreshCw className={`w-3 h-3 text-blue-400 ${sentimentLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {sentimentData ? (
                  <div className="space-y-2 text-xs">

                    {/* Overall Score */}
                    <div className="text-center py-2 border-b border-blue-800/40">
                      <div className={`text-2xl font-bold ${
                        sentimentData.overall?.score >= 60 ? 'text-green-400' :
                        sentimentData.overall?.score <= 40 ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {sentimentData.overall?.score || '—'}
                      </div>
                      <div className={`text-[10px] uppercase tracking-wider ${
                        sentimentData.overall?.mood?.includes('bullish') ? 'text-green-500' :
                        sentimentData.overall?.mood?.includes('bearish') ? 'text-red-500' : 'text-yellow-500'
                      }`}>
                        {sentimentData.overall?.mood?.replace(/_/g, ' ') || 'Loading...'}
                      </div>
                    </div>

                    {/* Daily vs Intraday Timeframes */}
                    {sentimentData.timeframes && (
                      <div className="bg-slate-900/50 rounded-lg p-2 border border-blue-800/30">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div className="text-center">
                            <div className="text-[9px] text-slate-500 uppercase mb-1">Daily</div>
                            <div className="text-lg">{biasEmoji(sentimentData.timeframes.daily?.bias)}</div>
                            <div className={`text-[9px] font-mono mt-0.5 ${
                              sentimentData.timeframes.daily?.score >= 60 ? 'text-green-400' :
                              sentimentData.timeframes.daily?.score <= 40 ? 'text-red-400' : 'text-yellow-400'
                            }`}>
                              {sentimentData.timeframes.daily?.score}
                            </div>
                            <div className="text-[8px] text-slate-500 capitalize">
                              {sentimentData.timeframes.daily?.bias?.replace(/_/g, ' ')}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-[9px] text-slate-500 uppercase mb-1">Intraday</div>
                            <div className="text-lg">{biasEmoji(sentimentData.timeframes.intraday?.bias)}</div>
                            <div className={`text-[9px] font-mono mt-0.5 ${
                              sentimentData.timeframes.intraday?.score >= 60 ? 'text-green-400' :
                              sentimentData.timeframes.intraday?.score <= 40 ? 'text-red-400' : 'text-yellow-400'
                            }`}>
                              {sentimentData.timeframes.intraday?.score}
                            </div>
                            <div className="text-[8px] text-slate-500 capitalize">
                              {sentimentData.timeframes.intraday?.bias?.replace(/_/g, ' ')}
                            </div>
                          </div>
                        </div>

                        {/* Divergence Warning */}
                        {sentimentData.timeframes.divergence && (
                          <div className="bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1 flex items-center gap-1.5 mb-2">
                            <span className="text-amber-400">⚠</span>
                            <span className="text-amber-300 text-[10px] font-medium">Divergence — Caution</span>
                          </div>
                        )}

                        {/* Intraday Signals collapsible */}
                        {sentimentData.timeframes.intraday?.signals?.length > 0 && (
                          <details className="mt-1">
                            <summary className="text-[9px] text-slate-500 cursor-pointer hover:text-slate-400 select-none">
                              Intraday signals ▾
                            </summary>
                            <div className="mt-1.5 space-y-0.5">
                              {sentimentData.timeframes.intraday.signals.map((sig, i) => (
                                <div key={i} className="flex items-center justify-between px-1">
                                  <span className="text-[9px] text-slate-400">{sig.factor}</span>
                                  <span className={`text-[9px] font-medium ${
                                    sig.signal === 'bullish' ? 'text-green-400' :
                                    sig.signal === 'bearish' ? 'text-red-400' : 'text-slate-400'
                                  }`}>
                                    {sig.detail}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}

                    {/* Sentiment Factors */}
                    {sentimentData.overall?.factors?.map((factor, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1 border-b border-blue-800/30">
                        <span className="text-slate-400 flex items-center gap-1">
                          {factor.name}
                          <span className="text-[9px] text-slate-500">({factor.weight}%)</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-[10px] ${
                            factor.score >= 60 ? 'text-green-400' :
                            factor.score <= 40 ? 'text-red-400' : 'text-yellow-400'
                          }`}>
                            {factor.score}
                          </span>
                          <span className="text-slate-500 text-[10px] capitalize">{factor.detail}</span>
                        </div>
                      </div>
                    ))}

                    {/* FII/DII */}
                    {sentimentData.fiiDii && (
                      <div className="pt-1">
                        <div className="text-[10px] text-slate-500 mb-1">FII/DII Flow (₹ Cr)</div>
                        <div className="grid grid-cols-2 gap-1 text-[10px]">
                          <div className="bg-slate-800/50 rounded px-2 py-1">
                            <span className="text-slate-400">FII: </span>
                            <span className={sentimentData.fiiDii.fii.net >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {sentimentData.fiiDii.fii.net >= 0 ? '+' : ''}{Math.round(sentimentData.fiiDii.fii.net)}
                            </span>
                          </div>
                          <div className="bg-slate-800/50 rounded px-2 py-1">
                            <span className="text-slate-400">DII: </span>
                            <span className={sentimentData.fiiDii.dii.net >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {sentimentData.fiiDii.dii.net >= 0 ? '+' : ''}{Math.round(sentimentData.fiiDii.dii.net)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TradingView Technical */}
                    {sentimentData.indices?.nifty && (
                      <div className="pt-1">
                        <div className="text-[10px] text-slate-500 mb-1">Technical Rating</div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">NIFTY:</span>
                            <span className={`font-medium px-1.5 py-0.5 rounded text-[10px] ${
                              sentimentData.indices.nifty.overall?.includes('buy') ? 'bg-green-900/50 text-green-400' :
                              sentimentData.indices.nifty.overall?.includes('sell') ? 'bg-red-900/50 text-red-400' :
                              'bg-yellow-900/50 text-yellow-400'
                            }`}>
                              {sentimentData.indices.nifty.overall?.replace(/_/g, ' ').toUpperCase() || '—'}
                            </span>
                          </div>
                          <span className="text-slate-500 text-[10px]">
                            RSI: {sentimentData.indices.nifty.rsi?.toFixed(0) || '—'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Gauge */}
                    <div className="pt-2">
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                        <span>Fear</span>
                        <span>Neutral</span>
                        <span>Greed</span>
                      </div>
                      <div className="h-2 bg-gradient-to-r from-red-600 via-yellow-500 to-green-600 rounded-full relative">
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-slate-800 shadow-lg transition-all duration-500"
                          style={{ left: `${Math.max(5, Math.min(95, sentimentData.overall?.score || 50))}%` }}
                        />
                      </div>
                    </div>

                    {/* Timestamp */}
                    {sentimentData.timestamp && (
                      <div className="text-[9px] text-slate-600 text-center pt-1">
                        Updated: {new Date(sentimentData.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-500 text-xs">
                    {sentimentLoading ? 'Loading sentiment...' : 'No data available'}
                  </div>
                )}
              </div>
            </div>

            {/* CENTER COLUMN: Chart */}
            <div className="lg:col-span-8">
              <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl overflow-hidden h-full flex flex-col min-h-[500px]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-blue-800/40">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-blue-300">Market Chart</h2>
                    <select
                      className="bg-[#0a1628] border border-blue-700/50 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                      value={chartSymbol}
                      onChange={(e) => setChartSymbol(e.target.value)}
                    >
                      <option value="NIFTY">NIFTY 50</option>
                      <option value="BANKNIFTY">BANK NIFTY</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-[#0a1628] rounded-lg p-0.5">
                      {[{ value: '5minute', label: '5m' }, { value: '15minute', label: '15m' }, { value: 'day', label: 'D' }, { value: 'week', label: 'W' }].map((int) => (
                        <button
                          key={int.value}
                          onClick={() => setChartInterval(int.value)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${chartInterval === int.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          {int.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex bg-[#0a1628] rounded-lg p-0.5">
                      {[9, 21, 50, 200].map((period) => (
                        <button
                          key={period}
                          onClick={() => {
                            setEmaPeriods((prev) =>
                              prev.includes(period)
                                ? prev.filter((p) => p !== period)
                                : [...prev, period]
                            );
                          }}
                          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${emaPeriods.includes(period) ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          {period}
                        </button>
                      ))}
                      <span className="px-1.5 py-1 text-[10px] text-amber-400 font-medium">EMA</span>
                    </div>
                    <a
                      href={`https://www.tradingview.com/chart/?symbol=NSE:${chartSymbol === 'BANKNIFTY' ? 'BANKNIFTY' : 'NIFTY'}&interval=${chartInterval === 'day' ? 'D' : chartInterval === 'week' ? 'W' : chartInterval.replace('minute', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      TradingView
                    </a>
                  </div>
                </div>
                <div className="flex-1" ref={chartRef} key={`${chartSymbol}-${chartInterval}`} />
              </div>
            </div>

            {/* RIGHT COLUMN: Sectors */}
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl p-3">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-sm font-semibold text-blue-300">Sector Performance</h2>
                  <span className="text-[10px] text-slate-400">
                    {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} | vs Prev Close
                  </span>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {sectorData.length > 0 ? (
                    sectorData.map((sector) => {
                      const sectorValue = sector.value ?? 0;
                      const absValue = Math.abs(sectorValue);
                      const barWidth = Math.min((absValue / 3) * 100, 100);
                      const tvSymbol = sector.tvSymbol || sector.symbol?.replace(/ /g, '') || sector.name?.toUpperCase().replace(/ /g, '');
                      return (
                        <a
                          key={sector.name}
                          href={`https://www.tradingview.com/chart/?symbol=NSE:${tvSymbol}&interval=15`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 group cursor-pointer hover:bg-[#0a1628]/50 rounded px-1 py-0.5"
                        >
                          <span className="text-[10px] w-16 text-slate-300 truncate">{sector.name}</span>
                          <div className="flex-1 h-4 bg-[#0a1628] rounded overflow-hidden">
                            <div
                              className={`h-full ${sectorValue >= 0 ? 'bg-gradient-to-r from-emerald-600 to-emerald-500' : 'bg-gradient-to-r from-red-600 to-red-500'} transition-all duration-500`}
                              style={{ width: `${Math.max(barWidth, 5)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] w-12 text-right font-mono font-semibold ${sectorValue >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {sectorValue >= 0 ? '+' : ''}{sectorValue.toFixed(2)}%
                          </span>
                        </a>
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-blue-800/40 bg-[#0a1628] px-2 py-3 text-xs text-slate-400 text-center">
                      {sectorLoading ? 'Loading sectors...' : (sectorError || 'No sector data available')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: News + Options */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

            {/* News & Events */}
            <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-blue-300 flex items-center gap-2">
                  <span className="w-1 h-5 bg-blue-500 rounded"></span>
                  Market Events & News
                </h2>
                <button
                  onClick={async () => {
                    setNewsLoading(true);
                    try {
                      const response = await fetch('/api/market-events?refresh=1');
                      const data = await response.json();
                      if (data.news) setNewsData(data.news);
                      if (data.events) setEventsData(data.events);
                    } catch (error) {
                      console.error('Error refreshing:', error);
                    } finally {
                      setNewsLoading(false);
                    }
                  }}
                  className="p-1.5 hover:bg-blue-800/40 rounded transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 text-blue-400 ${newsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {newsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  {eventsData.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                        Upcoming Events
                      </h3>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {eventsData.slice(0, 6).map((event, idx) => (
                          <div key={idx} className={`flex items-center justify-between text-xs p-2 rounded ${event.urgent ? 'bg-red-900/30 border border-red-700/50' : 'bg-slate-800/50'}`}>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                event.category === 'expiry' ? 'bg-orange-900/50 text-orange-400' :
                                event.category === 'results' ? 'bg-blue-900/50 text-blue-400' :
                                event.category === 'dividend' ? 'bg-green-900/50 text-green-400' :
                                event.category === 'holiday' ? 'bg-purple-900/50 text-purple-400' :
                                event.category === 'regulatory' ? 'bg-cyan-900/50 text-cyan-400' :
                                'bg-slate-700 text-slate-400'
                              }`}>
                                {event.category?.toUpperCase() || 'EVENT'}
                              </span>
                              <span className={event.urgent ? 'text-red-300 font-medium' : 'text-slate-300'}>
                                {event.subject?.slice(0, 50)}{event.subject?.length > 50 ? '...' : ''}
                              </span>
                            </div>
                            <span className={`text-[10px] font-mono ${event.urgent ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                              {event.symbol || (event.daysAway !== undefined ? (event.daysAway === 0 ? 'TODAY' : `${event.daysAway}d`) : new Date(event.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {newsData.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                        Latest News (24h)
                      </h3>
                      <ul className="space-y-2 max-h-40 overflow-y-auto">
                        {newsData.map((item, index) => (
                          <li key={index} className="flex items-start gap-2 text-xs">
                            <span className="text-slate-500 font-mono text-[10px] mt-0.5 min-w-[32px]">
                              {item.hoursAgo === 0 ? 'now' : `${item.hoursAgo}h`}
                            </span>
                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-blue-300 transition-colors line-clamp-2 flex-1">
                              {item.title}
                              <span className="text-slate-600 text-[10px] ml-1">[{item.source}]</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {eventsData.length === 0 && newsData.length === 0 && (
                    <div className="text-slate-400 text-sm py-4 text-center">No events or news available</div>
                  )}
                </div>
              )}
            </div>
            
            {/* Options Analysis */}
            <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-blue-300 flex items-center gap-2 flex-wrap">
                  <span className="w-1 h-5 bg-blue-500 rounded flex-shrink-0"></span>
                  Options Analysis
                  {optionChainData?.marketActivity?.activity && optionChainData.marketActivity.activity !== 'Unknown' && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      ['Long Buildup', 'Short Covering'].includes(optionChainData.marketActivity.activity)
                        ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                        : ['Short Buildup', 'Long Unwinding'].includes(optionChainData.marketActivity.activity)
                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                        : optionChainData.marketActivity.activity === 'Consolidation'
                        ? 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                        : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                    }`}>
                      {optionChainData.marketActivity.emoji} {optionChainData.marketActivity.activity}
                    </span>
                  )}
                </h2>
                <div className="flex gap-2">
                  <div className="flex bg-[#0a1628] rounded-lg p-0.5">
                    {['NIFTY', 'BANKNIFTY'].map((u) => (
                      <button
                        key={u}
                        onClick={() => setOptionUnderlying(u)}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${optionUnderlying === u ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        {u === 'BANKNIFTY' ? 'Bank Nifty' : 'Nifty'}
                      </button>
                    ))}
                  </div>
                  <div className="flex bg-[#0a1628] rounded-lg p-0.5">
                    {['weekly', 'monthly'].map((e) => {
                      const isDisabled = optionUnderlying === 'BANKNIFTY' && e === 'weekly';
                      return (
                        <button
                          key={e}
                          onClick={() => !isDisabled && setOptionExpiry(e)}
                          className={`px-3 py-1 text-xs rounded-md transition-colors ${optionExpiry === e ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'} ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                          disabled={isDisabled}
                        >
                          {e === 'weekly' ? 'Weekly' : 'Monthly'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {optionLoading ? (
                <div className="text-slate-400 text-center py-8">Loading options data...</div>
              ) : optionChainData?.error ? (
                <div className="text-red-400 text-center py-4">{optionChainData.error}</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-[#0a1628] rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Spot / ATM</div>
                      <div className="text-lg font-mono text-slate-200 mt-1">{parseFloat(optionChainData?.spotPrice || 0).toLocaleString()}</div>
                      <div className="text-xs text-slate-400">ATM: {optionChainData?.atmStrike?.toLocaleString()}</div>
                    </div>
                    <div className="bg-[#0a1628] rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">PCR</div>
                      <div className={`text-lg font-mono mt-1 ${optionChainData?.pcr > 1.2 ? 'text-green-400' : optionChainData?.pcr < 0.8 ? 'text-red-400' : 'text-yellow-400'}`}>
                        {optionChainData?.pcr?.toFixed(2) || '—'}
                      </div>
                      <div className="text-xs text-slate-400">{optionChainData?.pcr > 1.2 ? 'Bullish' : optionChainData?.pcr < 0.8 ? 'Bearish' : 'Neutral'}</div>
                    </div>
                    <div className="bg-[#0a1628] rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Max Pain</div>
                      <div className="text-lg font-mono text-orange-400 mt-1">{optionChainData?.maxPain?.toLocaleString() || '—'}</div>
                      <div className="text-xs text-slate-400">
                        {optionChainData?.maxPain && optionChainData?.spotPrice
                          ? `${((optionChainData.maxPain - parseFloat(optionChainData.spotPrice)) / parseFloat(optionChainData.spotPrice) * 100).toFixed(1)}% from spot`
                          : '—'}
                      </div>
                    </div>
                    <div className="bg-[#0a1628] rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Expiry</div>
                      <div className="text-lg font-mono text-slate-200 mt-1">
                        {optionChainData?.expiry ? new Date(optionChainData.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                      </div>
                      <div className="text-xs text-slate-400 capitalize">{optionChainData?.expiryType || '—'}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0a1628] rounded-lg p-3">
                      <div className="text-[10px] text-red-400 uppercase tracking-wider mb-2">Resistance (Call OI)</div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-red-400 font-medium">R1</span>
                          <span className="font-mono text-slate-200">
                            {optionChainData?.resistance?.toLocaleString() || '—'}
                            <span className="text-slate-500 text-xs ml-2">({(optionChainData?.resistanceOI / 100000).toFixed(1)}L)</span>
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-red-300">R2</span>
                          <span className="font-mono text-slate-300">
                            {optionChainData?.resistance2?.toLocaleString() || '—'}
                            <span className="text-slate-500 text-xs ml-2">({(optionChainData?.resistance2OI / 100000).toFixed(1)}L)</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-[#0a1628] rounded-lg p-3">
                      <div className="text-[10px] text-green-400 uppercase tracking-wider mb-2">Support (Put OI)</div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-green-400 font-medium">S1</span>
                          <span className="font-mono text-slate-200">
                            {optionChainData?.support?.toLocaleString() || '—'}
                            <span className="text-slate-500 text-xs ml-2">({(optionChainData?.supportOI / 100000).toFixed(1)}L)</span>
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-green-300">S2</span>
                          <span className="font-mono text-slate-300">
                            {optionChainData?.support2?.toLocaleString() || '—'}
                            <span className="text-slate-500 text-xs ml-2">({(optionChainData?.support2OI / 100000).toFixed(1)}L)</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0a1628] rounded-lg p-3 space-y-2.5">
                    {/* Activity + description narrative */}
                    {optionChainData?.marketActivity?.activity ? (
                      <p className="text-sm leading-relaxed">
                        <span className="mr-1">{optionChainData.marketActivity.emoji}</span>
                        <span className={`font-semibold ${
                          ['Long Buildup', 'Short Covering'].includes(optionChainData.marketActivity.activity) ? 'text-green-400'
                          : ['Short Buildup', 'Long Unwinding'].includes(optionChainData.marketActivity.activity) ? 'text-red-400'
                          : 'text-slate-300'
                        }`}>{optionChainData.marketActivity.activity}</span>
                        {optionChainData.marketActivity.description ? (
                          <span className="text-slate-400"> — {optionChainData.marketActivity.description}.</span>
                        ) : null}
                        {optionChainData.marketActivity.actionable ? (
                          <span className="text-blue-400"> {optionChainData.marketActivity.actionable}.</span>
                        ) : null}
                        {optionChainData?.marketActivity?.strength > 0 && (
                          <span className="ml-2 inline-flex items-center gap-0.5 align-middle">
                            {[...Array(Math.min(5, Math.ceil(optionChainData.marketActivity.strength / 2)))].map((_, i) => (
                              <span key={i} className="inline-block w-1 h-2.5 bg-blue-500/70 rounded-full"></span>
                            ))}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500">Analyzing market activity...</p>
                    )}

                    {/* Insights as flowing lines */}
                    {optionChainData?.actionableInsights?.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-blue-800/20">
                        {optionChainData.actionableInsights.slice(0, 3).map((insight, idx) => (
                          <p key={idx} className="text-xs leading-relaxed text-slate-300">
                            <span className="mr-1">{insight.emoji}</span>
                            <span className="text-slate-200 font-medium">{insight.message}</span>
                            <span className="text-slate-400"> — {insight.action}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between text-xs text-slate-400 pt-2 border-t border-blue-800/40">
                    <span>Total Call OI: <span className="text-red-400 font-mono">{(optionChainData?.totalCallOI / 100000).toFixed(1)}L</span></span>
                    <span>Total Put OI: <span className="text-green-400 font-mono">{(optionChainData?.totalPutOI / 100000).toFixed(1)}L</span></span>
                    <span className="text-slate-500">
                      Last updated: {optionChainData?.timestamp ? new Date(optionChainData.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
       

          </div>
        </main>
      </div>
    );
  }