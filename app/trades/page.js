  'use client';

  import React, { useState, useEffect, useRef, useCallback } from 'react';
  import Link from 'next/link';
  import { RefreshCw, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
  import Nav from '../components/Nav';
  import { usePageVisibility } from '@/app/hooks/usePageVisibility';
  import { playBullishFlip, playBearishFlip, playReversalAlert, playWarningPing, playReversalBuilding, playSentiment50Cross } from '../lib/sounds';

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
    let reversalTopSignals = '';
    let reversalDir = '';
    let reversalConf = '';
    if (reversal?.reversalZone) {
      const signalLabels = {
        NEAR_HIGH:                  'at day high',
        NEAR_LOW:                   'at day low',
        RSI_OVERSOLD_TURNING:       'RSI oversold turning',
        RSI_OVERBOUGHT_TURNING:     'RSI overbought turning',
        BEARISH_DIVERGENCE:         'RSI divergence',
        BULLISH_DIVERGENCE:         'RSI divergence',
        VOLUME_REVERSAL:            'volume spike',
        CLIMAX_VOLUME:              'climax volume',
        PUT_BUILDUP_AT_HIGH:        'put buildup',
        CALL_BUILDUP_AT_LOW:        'call buildup',
        SHORT_COVERING_RALLY:       'short covering',
        LONG_UNWINDING_AT_HIGH:     'long unwinding',
        SHORT_COVERING_AT_LOW:      'shorts covering',
        FRESH_PUT_WRITING_ON_DECLINE: 'fresh shorts',
        SUPPORT_TEST:               'at support',
        WEAK_RESISTANCE:            'weak resistance',
        STRONG_RESISTANCE:          'strong resistance',
        HAMMER:                     'hammer candle',
        SHOOTING_STAR:              'shooting star',
        BULLISH_ENGULFING:          'bullish engulfing',
        BEARISH_ENGULFING:          'bearish engulfing',
        RSI_VELOCITY_UP:            'RSI surging',
        RSI_VELOCITY_DOWN:          'RSI collapsing',
        MACD_BULLISH_CROSS:         'MACD bullish cross',
        MACD_BEARISH_CROSS:         'MACD bearish cross',
        MACD_BULLISH_PENDING:       'MACD turning up',
        MACD_BEARISH_PENDING:       'MACD turning down',
        PRICE_ACCELERATION_UP:      'price accelerating up',
        PRICE_ACCELERATION_DOWN:    'price accelerating down',
      };
      reversalTopSignals = (reversal.signals || [])
        .sort((a, b) => (b.strength === 'STRONG' ? 1 : 0) - (a.strength === 'STRONG' ? 1 : 0))
        .slice(0, 2)
        .map(s => signalLabels[s.type] || s.type)
        .filter(Boolean)
        .join(' + ');
      reversalDir  = biasLabel(reversal.direction);
      reversalConf = reversal.confidence;
      if (reversalConf === 'HIGH') {
        reversalSuffix = ` | ⚡ ${reversalDir} reversal zone${reversalTopSignals ? ` — ${reversalTopSignals}` : ''}`;
      } else if (reversalConf === 'MEDIUM') {
        reversalSuffix = ` | ⚠️ possible ${reversalDir.toLowerCase()} turn${reversalTopSignals ? ` — ${reversalTopSignals}` : ''}`;
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

      // ── Reconcile conflicting fragments: "X weakening | possible X turn" ──
      // When bias transitions TO Neutral AND the reversal detector fires in the
      // SAME direction as the prior bias, the naive output is contradictory:
      //   "bearish signal weakening | possible bearish turn"
      // These are actually one coherent story: prior trend stalled at a key level
      // and may reassert. Combine into a single clear sentence.
      if (to === 'NEUTRAL' && from !== 'NEUTRAL' && reversal?.reversalZone && reversal.direction === from) {
        const icon = reversalConf === 'HIGH' ? '⚡' : '⚠️';
        const sigs = reversalTopSignals ? ` (${reversalTopSignals})` : '';
        return `${prev.time} ${biasLabel(from)} → ${c.time} Neutral — momentum stalling${sigs}. ${icon} ${biasLabel(from).toLowerCase()} trend may reassert`;
      }

      const notes = {
        'BEARISH→BULLISH': 'reversal — bears capitulating',
        'BULLISH→BEARISH': 'reversal — bulls fading',
        'BEARISH→NEUTRAL': 'bearish momentum fading',
        'BULLISH→NEUTRAL': 'bullish momentum fading',
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

  // Category colors for key levels bar
  const LEVEL_CATEGORY_COLOR = {
    pd:      'text-sky-300',
    pivot:   'text-violet-300',
    weekly:  'text-amber-300',
    monthly: 'text-orange-300',
    ema:     'text-emerald-300',
    today:   'text-slate-300',
    or:      'text-pink-300',
  };

  const LEVEL_FULL_NAME = {
    PDH: 'Previous Day High', PDL: 'Previous Day Low', PDC: 'Previous Day Close',
    PP: 'Pivot Point', R1: 'Resistance 1', S1: 'Support 1',
    WkH: 'Weekly High', WkL: 'Weekly Low',
    MoH: 'Monthly High', MoL: 'Monthly Low',
    EMA9: 'EMA 9', EMA21: 'EMA 21', EMA50: 'EMA 50', EMA200: 'EMA 200',
    TdH: "Today's High", TdL: "Today's Low",
    ORH: 'Opening Range High', ORL: 'Opening Range Low',
  };

  function KeyLevelsBar({ levels, spot }) {
    if (!levels?.length) return null;

    // Nearest resistance above and nearest support below define the current zone
    const nearestCeiling = levels.find(l => l.dist !== null && l.dist > 0.5);
    const nearestFloor   = levels.find(l => l.dist !== null && l.dist < -0.5);

    return (
      <div className="px-3 py-2 border-b border-blue-800/40 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1.5 min-w-max">
          {levels.map((l) => {
            const dist = l.dist;
            const isNear = dist !== null && Math.abs(dist) <= 0.5;
            const isAbove = dist !== null && dist > 0;
            const isCeiling = nearestCeiling && l.label === nearestCeiling.label && !isNear;
            const isFloor   = nearestFloor   && l.label === nearestFloor.label   && !isNear;
            const priceColor = isNear
              ? 'text-amber-400'
              : isAbove
                ? 'text-emerald-400'
                : 'text-red-400';
            const labelColor = LEVEL_CATEGORY_COLOR[l.category] || 'text-slate-400';
            const bg = isNear
              ? 'bg-amber-500/10 border border-amber-500/30 animate-pulse'
              : isCeiling
                ? 'bg-rose-950/40 border border-rose-700/50'
                : isFloor
                  ? 'bg-sky-950/40 border border-sky-700/50'
                  : 'bg-[#0a1628] border border-blue-800/20';
            const fullName = LEVEL_FULL_NAME[l.label] || l.label;
            const zoneTag = isCeiling ? ' — zone ceiling' : isFloor ? ' — zone floor' : '';
            const tooltipText = `${fullName}: ₹${l.price.toLocaleString('en-IN')}${dist !== null ? ` (${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%)` : ''}${zoneTag}`;

            return (
              <div
                key={l.label}
                className={`flex flex-col items-center px-2 py-1 rounded-md ${bg} min-w-[52px]`}
                title={tooltipText}
              >
                <span className={`text-[9px] font-semibold leading-none ${labelColor}`}>{l.label}</span>
                <span className={`text-[10px] font-mono font-medium leading-tight mt-0.5 ${priceColor}`}>
                  {l.price >= 10000
                    ? l.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                    : l.price.toFixed(1)}
                </span>
                {dist !== null && (
                  <span className={`text-[8px] leading-none mt-0.5 ${isNear ? 'text-amber-400' : isCeiling ? 'text-rose-500' : isFloor ? 'text-sky-500' : 'text-slate-500'}`}>
                    {dist >= 0 ? '+' : ''}{dist.toFixed(1)}%
                  </span>
                )}
                {(isCeiling || isFloor) && (
                  <span className={`text-[7px] leading-none mt-0.5 font-bold ${isCeiling ? 'text-rose-600' : 'text-sky-600'}`}>
                    {isCeiling ? '▲ RES' : '▼ SUP'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  export default function TradesPage() {
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
    const prevSentimentHistoryRef = useRef([]);
    const [kiteAuth, setKiteAuth] = useState({ isLoggedIn: false, checking: true });
    const [userRole, setUserRole] = useState(null);
    const isMarketHours = () => {
      const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      return mins >= 555 && mins <= 960; // 9:15 AM – 4:00 PM IST
    };
    const isVisible = usePageVisibility();
    const [commentary, setCommentary] = useState(null);
    const [commentaryLoading, setCommentaryLoading] = useState(true);
    const [commentaryRefreshedAt, setCommentaryRefreshedAt] = useState(null);
    const [niftyRegime, setNiftyRegime] = useState(null);
    const [dailyBias, setDailyBias] = useState(null);
    const [fifteenMinBias, setFifteenMinBias] = useState(null);
    const [commentaryCollapsed, setCommentaryCollapsed] = useState(true);
    const prevCommentaryRef = useRef(null);
    const soundEnabledRef   = useRef(false); // only alert after first load
    // Key levels bar — follows chartSymbol
    const [keyLevels, setKeyLevels] = useState(null);
    // Nifty-only levels — always NIFTY, used in commentary station alerts
    const [niftyLevels, setNiftyLevels] = useState(null);

    // Layout state
    const [marketContextCollapsed, setMarketContextCollapsed] = useState(() => {
      const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const mins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
      return !(mins >= 480 && mins < 555); // expanded 8:00–9:15 IST, collapsed otherwise
    });

    // Chart state
    const [chartSymbol, setChartSymbol] = useState('NIFTY');
    const [chartInterval, setChartInterval] = useState('15minute');
    const [emaPeriods, setEmaPeriods] = useState([9,21]);
    const [showVwap, setShowVwap] = useState(true);
    const [showZoneLines, setShowZoneLines] = useState(true);
    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const candleSeriesRef = useRef(null);
    const vwapSeriesRef = useRef(null);
    const zoneLineRefs = useRef({ ceiling: null, floor: null });
    const keyLevelsForZoneRef = useRef(null);
    const showZoneLinesRef = useRef(true);
    const drawZoneLinesRef = useRef(null);

    // Check Kite auth status
    useEffect(() => {
      fetch('/api/auth/me').then(r => r.json()).then(d => setUserRole(d.user?.role || 'user')).catch(() => {});
      const checkKiteAuth = async () => {
        try {
          const res = await fetch('/api/kite-config');
          if (res.status === 401) { setKiteAuth({ isLoggedIn: false, checking: false }); return; }
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

    // Fetch key levels — re-fetch when chart symbol changes
    useEffect(() => {
      const fetchKeyLevels = async () => {
        try {
          const res = await fetch(`/api/key-levels?symbol=${chartSymbol}`);
          const data = await res.json();
          if (data.levels) setKeyLevels(data);
        } catch { /* ignore */ }
      };
      setKeyLevels(null); // clear stale data immediately on symbol switch
      fetchKeyLevels();
      const interval = setInterval(fetchKeyLevels, 300000); // refresh every 5 min
      return () => clearInterval(interval);
    }, [chartSymbol]);

    // Always fetch NIFTY levels for commentary station alerts (independent of chart symbol)
    useEffect(() => {
      const fetchNiftyLevels = async () => {
        try {
          const res = await fetch('/api/key-levels?symbol=NIFTY');
          const data = await res.json();
          if (data.levels) setNiftyLevels(data);
        } catch { /* ignore */ }
      };
      fetchNiftyLevels();
      const interval = setInterval(fetchNiftyLevels, 300000);
      return () => clearInterval(interval);
    }, []);

    // Zone lines on chart — drawn imperatively on candleSeries
    const drawZoneLines = useCallback((kl, show) => {
      const cs = candleSeriesRef.current;
      const refs = zoneLineRefs.current;
      if (refs.ceiling) { try { cs?.removePriceLine(refs.ceiling); } catch {} refs.ceiling = null; }
      if (refs.floor)   { try { cs?.removePriceLine(refs.floor);   } catch {} refs.floor   = null; }
      if (!show || !cs || !kl?.levels?.length) return;
      const ceiling = kl.levels.find(l => l.dist > 0.5);
      const floor   = kl.levels.find(l => l.dist < -0.5);
      const fullName = LEVEL_FULL_NAME;
      if (ceiling) refs.ceiling = cs.createPriceLine({ price: ceiling.price, color: 'rgba(251,113,133,0.85)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `▲ ${fullName[ceiling.label] || ceiling.label}` });
      if (floor)   refs.floor   = cs.createPriceLine({ price: floor.price,   color: 'rgba(125,211,252,0.85)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `▼ ${fullName[floor.label]   || floor.label}` });
    }, []);

    useEffect(() => { drawZoneLinesRef.current = drawZoneLines; }, [drawZoneLines]);

    useEffect(() => {
      keyLevelsForZoneRef.current = keyLevels;
      showZoneLinesRef.current = showZoneLines;
      drawZoneLines(keyLevels, showZoneLines);
    }, [keyLevels, showZoneLines, drawZoneLines]);

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

    // Fetch commentary (used by both interval and manual refresh button)
    const fetchCommentaryNow = useCallback(async (forceRefresh = false) => {
      setCommentaryLoading(true);
      try {
        const response = await fetch(`/api/market-commentary${forceRefresh ? '?refresh=1' : ''}`);
        const data = await response.json();
        const next = data.commentary;
        prevCommentaryRef.current = next;
        soundEnabledRef.current   = true;
        setCommentary(next);
        setCommentaryRefreshedAt(new Date());
        if (data.dailyBias)      setDailyBias(data.dailyBias);
        if (data.fifteenMinBias) setFifteenMinBias(data.fifteenMinBias);
      } catch (error) {
        console.error('Failed to fetch commentary:', error);
      } finally {
        setCommentaryLoading(false);
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch option chain data
    const fetchOptionChain = useCallback(async (forceRefresh = false) => {
      setOptionLoading(true);
      try {
        const url = `/api/option-chain?underlying=${optionUnderlying}&expiry=${optionExpiry}${forceRefresh ? '&refresh=1' : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        setOptionChainData(data);
        // If OI is zero during market hours, auto-retry once after 15s (stale cache / OI delay at open)
        if (isMarketHours() && data && !forceRefresh && (data.totalCallOI === 0 || data.totalPutOI === 0)) {
          setTimeout(() => fetchOptionChain(true), 15000);
        }
      } catch (error) {
        console.error('Failed to fetch option chain:', error);
      } finally {
        setOptionLoading(false);
      }
    }, [optionUnderlying, optionExpiry]);

    useEffect(() => {
      fetchOptionChain();
      const interval = setInterval(() => { if (isMarketHours() && isVisible) fetchOptionChain(); }, 60000);
      return () => clearInterval(interval);
    }, [optionUnderlying, optionExpiry, fetchOptionChain]);

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
          const next = data.commentary;
          const prev = prevCommentaryRef.current;

          if (soundEnabledRef.current && next && prev) {
            const biasChanged  = next.bias !== prev.bias
            const newReversal  = next.reversal?.reversalZone && !prev.reversal?.reversalZone
            const highConf     = next.reversal?.confidence === 'HIGH'
            const prevWarnings = (prev.warnings || []).length
            const nextWarnings = (next.warnings || []).length

            if (biasChanged) {
              if (next.bias === 'BULLISH') playBullishFlip()
              else if (next.bias === 'BEARISH') playBearishFlip()
            } else if (newReversal && highConf) {
              playReversalAlert()
            } else if (newReversal && !highConf) {
              playReversalBuilding()
            } else if (nextWarnings > prevWarnings) {
              playWarningPing()
            }
          }

          prevCommentaryRef.current = next
          soundEnabledRef.current   = true
          setCommentary(next);
          setCommentaryRefreshedAt(new Date());
          if (data.dailyBias)       setDailyBias(data.dailyBias);
          if (data.fifteenMinBias)  setFifteenMinBias(data.fifteenMinBias);
        } catch (error) {
          console.error('Failed to fetch commentary:', error);
        } finally {
          setCommentaryLoading(false);
        }
      };
      
      // Fetch NIFTY intraday regime
      const fetchRegime = async () => {
        try {
          const r = await fetch('/api/market-regime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'NIFTY', type: 'intraday' }) });
          const d = await r.json();
          if (d.regime && d.regime !== 'INITIALIZING' && !d.error) setNiftyRegime(d);
        } catch {}
      };

      // Always fetch on mount so summary section is always populated
      fetchCommentary();
      fetchRegime();

      // Refresh every 3 min during 1:30–3:30 PM IST (high short-covering activity window), 5 min otherwise
      const getCommentaryInterval = () => {
        const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
        return (mins >= 810 && mins <= 930) ? 3 * 60 * 1000 : 5 * 60 * 1000;
      };
      let commentaryTimer;
      const scheduleCommentary = () => {
        commentaryTimer = setTimeout(() => {
          if (isMarketHours() && isVisible) { fetchCommentary(); fetchRegime(); }
          scheduleCommentary();
        }, getCommentaryInterval());
      };
      scheduleCommentary();

      return () => clearTimeout(commentaryTimer);
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

          // Sound alert when intraday sentiment crosses 50 for the first time in last 5 candles
          const history = data.intradayHistory || [];
          const prev = prevSentimentHistoryRef.current;
          if (history.length >= 2 && prev.length > 0) {
            const last5 = history.slice(-5);
            const newest = last5[last5.length - 1]?.score;
            const prior  = last5[last5.length - 2]?.score;
            if (newest != null && prior != null) {
              const crossedUp   = prior < 50 && newest >= 50;
              const crossedDown = prior >= 50 && newest < 50;
              if (crossedUp || crossedDown) {
                // Ensure no prior crossing in the same direction within the last 5 candles
                let alreadyCrossed = false;
                for (let i = 0; i < last5.length - 2; i++) {
                  const a = last5[i]?.score, b = last5[i + 1]?.score;
                  if (a == null || b == null) continue;
                  if (crossedUp   && a < 50 && b >= 50) { alreadyCrossed = true; break; }
                  if (crossedDown && a >= 50 && b < 50) { alreadyCrossed = true; break; }
                }
                if (!alreadyCrossed) playSentiment50Cross(crossedUp ? 'UP' : 'DOWN');
              }
            }
          }
          prevSentimentHistoryRef.current = history;

        } catch (error) {
          console.error('Error fetching sentiment:', error);
        } finally {
          setSentimentLoading(false);
        }
      };
      fetchSentiment();
      const interval = setInterval(() => { if (isMarketHours() && isVisible) fetchSentiment(); }, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }, [optionChainData?.pcr]);

    // Compute VWAP for a set of candles (use vol=1 for indices that return 0 volume)
    const computeVWAP = (candles) => {
      let cumTPV = 0, cumVol = 0;
      return candles.map(c => {
        const tp  = (c.high + c.low + c.close) / 3;
        const vol = c.volume > 0 ? c.volume : 1;
        cumTPV += tp * vol;
        cumVol += vol;
        return { time: c.time, value: parseFloat((cumTPV / cumVol).toFixed(2)) };
      });
    };

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
        // Add VWAP line series (only visible for intraday intervals)
        const isIntraday = chartInterval === '5minute' || chartInterval === '15minute';
        const vwapSeries = chart.addLineSeries({
          color: '#a78bfa',
          lineWidth: 2,
          lineStyle: 0,
          title: 'VWAP',
          crosshairMarkerVisible: false,
          priceLineVisible: false,
          lastValueVisible: true,
          visible: isIntraday,
        });
        vwapSeriesRef.current = vwapSeries;
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
              // VWAP: compute on today's candles only (per-session reset)
              if (vwapSeriesRef.current) {
                const IST_OFFSET_S = 5.5 * 3600;
                const todayIST = new Date(Date.now() + IST_OFFSET_S * 1000).toISOString().slice(0, 10);
                const todayCandles = (chartInterval === '5minute' || chartInterval === '15minute')
                  ? data.candles.filter(c => new Date(c.time * 1000 + IST_OFFSET_S * 1000).toISOString().slice(0, 10) === todayIST)
                  : data.candles;
                const vwapData = computeVWAP(todayCandles.length ? todayCandles : data.candles);
                vwapSeriesRef.current.setData(vwapData);
              }
              chart.timeScale().fitContent();
            }
          } catch (error) {
            console.error('Failed to fetch chart data:', error);
          }
        };
        await fetchChartData();
        // Draw zone lines now that candleSeries exists (handles case where keyLevels arrived before chart init)
        drawZoneLinesRef.current?.(keyLevelsForZoneRef.current, showZoneLinesRef.current);
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
      <div className="min-h-screen bg-[#060b14] text-slate-100">
        <Nav />

        {/* Sub-bar: Kite status + quick links */}
        <div className="border-b border-white/5 bg-[#060b14]">
          <div className="max-w-[1400px] mx-auto px-6 py-2.5 flex items-center justify-between">
            {/* Kite status — admin only */}
            {userRole === 'admin' ? (
              <button
                onClick={openKiteSettings}
                className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
                title={kiteAuth.checking ? 'Checking...' : kiteAuth.isLoggedIn ? 'Kite Connected — click to manage' : 'Kite Disconnected — click to connect'}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  kiteAuth.isLoggedIn ? 'bg-emerald-400' :
                  kiteAuth.checking  ? 'bg-slate-500' :
                  'bg-rose-500'
                }`} />
                <span className={`font-medium ${
                  kiteAuth.isLoggedIn ? 'text-emerald-400' :
                  kiteAuth.checking  ? 'text-slate-500' :
                  'text-rose-400'
                }`}>
                  {kiteAuth.checking ? 'Checking…' : kiteAuth.isLoggedIn ? 'Kite Connected' : 'Kite Disconnected'}
                </span>
              </button>
            ) : <div />}

            {/* Live ticker — Nifty · BankNifty · VIX */}
            {marketData?.indices && (
              <div className="flex items-center gap-4">
                {/* NIFTY */}
                {marketData.indices.nifty && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 font-medium">NIFTY</span>
                    <span className="text-sm font-mono font-bold text-white tabular-nums">
                      {parseFloat(marketData.indices.nifty).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {marketData.indices.niftyChangePercent && (
                      <span className={`text-xs font-semibold tabular-nums ${parseFloat(marketData.indices.niftyChangePercent) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {parseFloat(marketData.indices.niftyChangePercent) >= 0 ? '+' : ''}{parseFloat(marketData.indices.niftyChangePercent).toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
                {/* BankNifty */}
                {marketData.indices.bankNifty && (
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 font-medium">BANK</span>
                    <span className="text-xs font-mono font-semibold text-slate-200 tabular-nums">
                      {parseFloat(marketData.indices.bankNifty).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {marketData.indices.bankNiftyChangePercent && (
                      <span className={`text-[11px] font-semibold tabular-nums ${parseFloat(marketData.indices.bankNiftyChangePercent) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {parseFloat(marketData.indices.bankNiftyChangePercent) >= 0 ? '+' : ''}{parseFloat(marketData.indices.bankNiftyChangePercent).toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
                {/* VIX */}
                {marketData.indices.vix && (
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 font-medium">VIX</span>
                    <span className={`text-xs font-mono font-semibold tabular-nums ${parseFloat(marketData.indices.vix) > 18 ? 'text-rose-400' : parseFloat(marketData.indices.vix) > 13 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {parseFloat(marketData.indices.vix).toFixed(2)}
                    </span>
                    {marketData.indices.vixChange && (
                      <span className={`text-[10px] tabular-nums ${parseFloat(marketData.indices.vixChange) >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {parseFloat(marketData.indices.vixChange) >= 0 ? '+' : ''}{parseFloat(marketData.indices.vixChange).toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Quick links */}
            <div className="flex items-center gap-1">
              {[
                { href: '/terminal',       label: 'Terminal'    },
                { href: '/trades/pre-market', label: 'Pre-Market' },
              ].map(l => (
                <Link key={l.href} href={l.href}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white border border-transparent hover:border-white/10 rounded-lg transition-all">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <main className="max-w-[1400px] mx-auto px-6 py-6">

          {/* NEW: glow commentary border when price approaching a key level */}
          {(() => {
            const isApproaching = niftyLevels?.levels?.some(l => l.dist !== null && Math.abs(l.dist) <= 0.5);
            return (
          <div className={`mb-4 rounded-xl backdrop-blur-sm overflow-hidden transition-all duration-500 ${
            isApproaching
              ? 'bg-gradient-to-r from-amber-900/40 via-blue-900/50 to-amber-900/40 border border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
              : 'bg-gradient-to-r from-purple-900/50 via-blue-900/50 to-purple-900/50 border border-purple-700/50'
          }`}>
          {/* OLD: <div className="mb-4 bg-gradient-to-r from-purple-900/50 via-blue-900/50 to-purple-900/50 border border-purple-700/50 rounded-xl backdrop-blur-sm overflow-hidden"> */}
            {commentaryLoading && !commentary ? (
              /* Loading skeleton */
              <div className="p-4 flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 border-purple-400/40 border-t-purple-400 animate-spin flex-shrink-0" />
                <span className="text-sm text-slate-400">Loading market summary…</span>
              </div>
            ) : !commentary ? (
              /* Market closed / no data */
              <div className="p-4 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" />
                <span className="text-sm text-slate-400">Market closed — summary available during trading hours (9:15 AM – 4:00 PM IST)</span>
                {niftyRegime && (() => {
                  const REGIME_STYLE = {
                    TREND_DAY_UP: { text: 'text-green-400', label: 'Trend Up' }, TREND_DAY_DOWN: { text: 'text-red-400', label: 'Trend Down' },
                    RANGE_DAY: { text: 'text-yellow-400', label: 'Range Day' }, TRAP_DAY: { text: 'text-amber-400', label: 'Trap Day' },
                  };
                  const s = REGIME_STYLE[niftyRegime.regime] ?? { text: 'text-slate-400', label: niftyRegime.regime };
                  return <span className={`ml-auto text-xs font-semibold ${s.text}`}>Last regime: {s.label}</span>;
                })()}
              </div>
            ) : (
              <div>{/* commentary content starts */}
              {/* Collapsible Header */}
              <div
                onClick={() => setCommentaryCollapsed(!commentaryCollapsed)}
                className="w-full flex items-center justify-between p-4 hover:bg-blue-900/20 transition-colors cursor-pointer"
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
                  {!isMarketHours() && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 border border-slate-600/50">
                      Markets Closed
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    commentary.bias === 'BULLISH' ? 'text-green-400' :
                    commentary.bias === 'BEARISH' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {commentary.bias}
                  </span>
                  {commentaryRefreshedAt && !commentaryLoading && (
                    <span className="text-[10px] text-slate-600 tabular-nums">
                      {commentaryRefreshedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); fetchCommentaryNow(true); }}
                    disabled={commentaryLoading}
                    className="p-1 hover:bg-blue-900/40 rounded transition-colors disabled:opacity-40"
                    title="Refresh commentary"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${commentaryLoading ? 'animate-spin' : ''}`} />
                  </button>
                  {commentaryCollapsed ? (
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className="text-[10px] font-medium">expand</span>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  ) : (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Collapsible Content */}
              {!commentaryCollapsed && (
                <div className="px-4 pb-4">
                  {/* Confluent S/R levels */}
                  {(commentary.srLevels?.support || commentary.srLevels?.resistance) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs">
                      {commentary.srLevels.support && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">Support:</span>
                          <span className={`font-mono font-semibold ${commentary.srLevels.support.strong ? 'text-sky-300' : 'text-sky-500'}`}>
                            {commentary.srLevels.support.price}
                          </span>
                          <span className="text-slate-500">{commentary.srLevels.support.label}</span>
                          {commentary.srLevels.support.strong && <span className="text-[10px] px-1 py-0.5 rounded bg-sky-900/40 text-sky-400">strong</span>}
                        </div>
                      )}
                      {commentary.srLevels.resistance && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">Resistance:</span>
                          <span className={`font-mono font-semibold ${commentary.srLevels.resistance.strong ? 'text-amber-300' : 'text-amber-500'}`}>
                            {commentary.srLevels.resistance.price}
                          </span>
                          <span className="text-slate-500">{commentary.srLevels.resistance.label}</span>
                          {commentary.srLevels.resistance.strong && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-900/40 text-amber-400">strong</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Two-column layout: left = commentary feed, right = signal panel */}
                  <div className="mt-2 flex gap-4">

                    {/* LEFT: text commentary feed */}
                    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                      {/* Current action — top line, prominent */}
                      <p className="text-cyan-300 text-sm font-medium leading-snug">
                        {commentary.action}
                      </p>
                      {/* Last 2 biasHistory entries — session trail */}
                      {commentary.biasHistory?.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                          {commentary.biasHistory.slice(0, 2).map((h, i) => {
                            const label = h.state || h.bias || '';
                            return (
                              <span key={i} className="text-sm font-medium text-cyan-300 leading-snug truncate">
                                {h.time && <span className="mr-1">{h.time}</span>}{label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {commentaryRefreshedAt && (
                        <span className="text-[10px] text-slate-600">
                          updated {commentaryRefreshedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                      )}
                    </div>

                    {/* RIGHT: signal panel */}
                    <div className="border-l border-blue-800/40 pl-4 flex flex-col gap-1.5 min-w-[220px]">
                      {/* 5m Regime */}
                      {niftyRegime && (() => {
                        const REGIME_STYLE = {
                          TREND_DAY_UP:     { dot: 'bg-green-400',   text: 'text-green-300',   label: 'Trend Up'      },
                          TREND_DAY_DOWN:   { dot: 'bg-red-400',     text: 'text-red-300',     label: 'Trend Down'    },
                          RANGE_DAY:        { dot: 'bg-yellow-400',  text: 'text-yellow-300',  label: 'Range Day'     },
                          BREAKOUT_DAY:     { dot: 'bg-blue-400',    text: 'text-blue-300',    label: 'Breakout'      },
                          SHORT_SQUEEZE:    { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Short Squeeze' },
                          LONG_LIQUIDATION: { dot: 'bg-orange-400',  text: 'text-orange-300',  label: 'Long Liq.'     },
                          TRAP_DAY:         { dot: 'bg-amber-400',   text: 'text-amber-300',   label: 'Trap Day'      },
                          LOW_VOL_DRIFT:    { dot: 'bg-slate-400',   text: 'text-slate-300',   label: 'Low Vol Drift' },
                        };
                        const CONF_COLOR = { HIGH: 'text-emerald-400', MEDIUM: 'text-amber-400', LOW: 'text-slate-500' };
                        const style = REGIME_STYLE[niftyRegime.regime] ?? { dot: 'bg-slate-400', text: 'text-slate-300', label: niftyRegime.regime };
                        return (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-500 w-8 flex-shrink-0">5m</span>
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                            <span className={`font-semibold ${style.text}`}>{style.label}</span>
                            <span className={`text-[10px] font-bold ${CONF_COLOR[niftyRegime.confidence]}`}>{niftyRegime.confidence}</span>
                            {niftyRegime.vwapPosition && niftyRegime.vwapPosition !== 'UNKNOWN' && (
                              <span className={`text-[10px] px-1 py-0.5 rounded ${niftyRegime.vwapPosition === 'ABOVE' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                                {niftyRegime.vwapPosition === 'ABOVE' ? '▲' : '▼'} VWAP
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* 15m Regime */}
                      {fifteenMinBias && (() => {
                        const bDot  = b => b === 'BULLISH' ? 'bg-green-400' : b === 'BEARISH' ? 'bg-red-400' : 'bg-yellow-400';
                        const bText = b => b === 'BULLISH' ? 'text-green-300' : b === 'BEARISH' ? 'text-red-300' : 'text-yellow-300';
                        const CONF_COLOR = { HIGH: 'text-emerald-400', MEDIUM: 'text-amber-400', LOW: 'text-slate-500' };
                        return (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-500 w-8 flex-shrink-0">15m</span>
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${bDot(fifteenMinBias.bias)}`} />
                            <span className={`font-semibold ${bText(fifteenMinBias.bias)}`}>{fifteenMinBias.label}</span>
                            <span className={`text-[10px] font-bold ${CONF_COLOR[fifteenMinBias.confidence]}`}>{fifteenMinBias.confidence}</span>
                            {fifteenMinBias.vwapPosition && fifteenMinBias.vwapPosition !== 'UNKNOWN' && (
                              <span className={`text-[10px] px-1 py-0.5 rounded ${fifteenMinBias.vwapPosition === 'ABOVE' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                                {fifteenMinBias.vwapPosition === 'ABOVE' ? '▲' : '▼'} VWAP
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Synthesis */}
                      {fifteenMinBias && niftyRegime && (() => {
                        const fb = fifteenMinBias.bias;
                        const r  = niftyRegime.regime;
                        const isBullishDay = r === 'TREND_DAY_UP' || r === 'SHORT_SQUEEZE';
                        const isBearishDay = r === 'TREND_DAY_DOWN' || r === 'LONG_LIQUIDATION';
                        let msg = null;
                        if (isBullishDay && fb === 'BULLISH')   msg = 'Aligned — ride momentum, trail stops';
                        else if (isBullishDay && fb === 'BEARISH') msg = '5m bullish, 15m pullback — wait for dip entry';
                        else if (isBullishDay && fb === 'NEUTRAL') msg = '5m bullish, 15m consolidating — look for 15m break';
                        else if (isBearishDay && fb === 'BEARISH') msg = 'Aligned — sell bounces, trail stops';
                        else if (isBearishDay && fb === 'BULLISH') msg = '5m bearish, 15m bouncing — sell into strength';
                        if (!msg) return null;
                        return (
                          <div className="flex items-start gap-1 text-[10px] text-slate-400 pt-0.5 border-t border-blue-800/30">
                            <span className="text-amber-400 flex-shrink-0 mt-px">→</span>
                            <span>{msg}</span>
                          </div>
                        );
                      })()}

                      {/* Station proximity alerts — always NIFTY, independent of chart symbol */}
                      {niftyLevels?.levels?.length > 0 && niftyLevels.spot && (() => {
                        const spot = niftyLevels.spot;
                        const levels = niftyLevels.levels;

                        // Levels within 0.5% = "approaching station"
                        const approaching = levels.filter(l => Math.abs(l.dist) <= 0.5);

                        // Nearest resistance above and support below
                        const above = levels.filter(l => l.dist > 0.5).sort((a, b) => a.dist - b.dist)[0];
                        const below = levels.filter(l => l.dist < -0.5).sort((a, b) => b.dist - a.dist)[0];

                        const fullName = LEVEL_FULL_NAME;

                        return (
                          <div className="flex flex-col gap-1 pt-0.5 border-t border-blue-800/30">
                            {/* Approaching alerts */}
                            {approaching.map(l => (
                              <div key={l.label} className="flex items-center gap-1.5 animate-pulse">
                                <span className="text-amber-400 text-[11px]">⚡</span>
                                <span className="text-[10px] font-semibold text-amber-300">
                                  Approaching {fullName[l.label] || l.label}
                                </span>
                                <span className="text-[10px] font-mono text-amber-400">
                                  ₹{l.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </span>
                                <span className="text-[9px] text-amber-600">
                                  ({l.dist >= 0 ? '+' : ''}{l.dist.toFixed(2)}%)
                                </span>
                              </div>
                            ))}
                            {/* Next stations */}
                            <div className="flex items-center gap-2 text-[9px] text-slate-500">
                              {below && (
                                <span>
                                  ↓ <span className="text-sky-500 font-medium">{fullName[below.label] || below.label}</span>
                                  {' '}
                                  <span className="font-mono text-sky-600">₹{below.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                  <span className="text-slate-600"> ({below.dist.toFixed(1)}%)</span>
                                </span>
                              )}
                              {above && (
                                <span>
                                  ↑ <span className="text-rose-500 font-medium">{fullName[above.label] || above.label}</span>
                                  {' '}
                                  <span className="font-mono text-rose-600">₹{above.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                  <span className="text-slate-600"> (+{above.dist.toFixed(1)}%)</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}  {/* end commentary content / ternary */}
          </div>
            ); // end IIFE return
          })()} {/* end approaching glow IIFE */}

          {/* Top Market Data Grid — collapsible "Market Context" */}
          {/* OLD: always visible grid */}
          <div className="mb-4">
            <button
              onClick={() => setMarketContextCollapsed(v => !v)}
              className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 hover:text-slate-300 transition-colors mb-1.5 w-full"
            >
              <span>Market Context</span>
              <span className="text-[9px]">{marketContextCollapsed ? '↓ show' : '↑ hide'}</span>
              <span className="flex-1 border-t border-white/5 ml-1" />
            </button>
            {!marketContextCollapsed && <div className="grid grid-cols-2 lg:grid-cols-4 gap-1">
            {/* Market Indices card removed — Nifty/BankNifty/VIX now in sub-bar ticker */}
            {false && <div className="bg-[#112240] border border-blue-800/40 rounded-lg p-1.5 lg:p-2 flex flex-col justify-center min-h-14 lg:min-h-16">
              <h4 className="text-blue-300 text-[10px] font-semibold mb-1 lg:mb-1.5 text-center">Market Indices</h4>
              <div className="space-y-0.5 lg:space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[9px]">Nifty 50</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-100 text-[9px] lg:text-xs font-mono font-medium">{marketData?.indices?.nifty || '---'}</span>
                    {(() => {
                      const chg = parseFloat(marketData?.indices?.niftyChange);
                      const pct = parseFloat(marketData?.indices?.niftyChangePercent);
                      const gift = parseFloat(marketData?.indices?.giftNifty);
                      const prev = parseFloat(marketData?.indices?.niftyPrevClose);
                      // When market is closed, niftyChange is 0 — show GIFT Nifty implied gap instead
                      if ((isNaN(chg) || chg === 0) && gift > 0 && prev > 0) {
                        const impliedChg = gift - prev;
                        const impliedPct = (impliedChg / prev) * 100;
                        return (
                          <>
                            <span className={`text-[8px] font-mono ${impliedChg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {impliedChg >= 0 ? '+' : ''}{impliedChg.toFixed(0)}
                            </span>
                            <span className={`text-[8px] font-mono ${impliedPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              ({impliedPct >= 0 ? '+' : ''}{impliedPct.toFixed(2)}%)*
                            </span>
                          </>
                        );
                      }
                      return (chg !== 0 && !isNaN(chg)) ? (
                        <>
                          <span className={`text-[8px] font-mono ${chg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {chg >= 0 ? '+' : ''}{chg.toFixed(2)}
                          </span>
                          {!isNaN(pct) && (
                            <span className={`text-[8px] font-mono ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                            </span>
                          )}
                        </>
                      ) : null;
                    })()}
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
            </div>}

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
                  <span className="text-slate-400 text-[9px]">Daily Trend</span>
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
                    PCR: {(optionChainData && (optionChainData.totalCallOI === 0 || optionChainData.totalPutOI === 0)) ? 'N/A' : optionChainData?.pcr > 0 ? optionChainData.pcr.toFixed(2) : '---'}
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
                        <span className={`text-sm font-mono font-semibold ${isNearHigh('niftyHigh') ? 'text-amber-300 animate-pulse' : 'text-emerald-400'}`}>{fmt(idx?.niftyHigh)}</span>
                        <span className="text-slate-600 text-[8px]">H/L</span>
                        <span className={`text-sm font-mono font-semibold ${isNearHigh('niftyLow') ? 'text-sky-300 animate-pulse' : 'text-red-400'}`}>{fmt(idx?.niftyLow)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[8px] mb-0.5">Weekly</div>
                      <div className="flex justify-between items-center">
                        <span className={`text-sm font-mono font-semibold ${isNearHigh('niftyWeeklyHigh') ? 'text-amber-300 animate-pulse' : 'text-emerald-600'}`}>{fmt(idx?.niftyWeeklyHigh)}</span>
                        <span className="text-slate-600 text-[8px]">H/L</span>
                        <span className={`text-sm font-mono font-semibold ${isNearHigh('niftyWeeklyLow') ? 'text-sky-300 animate-pulse' : 'text-red-700'}`}>{fmt(idx?.niftyWeeklyLow)}</span>
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
          </div>}  {/* closes grid + !marketContextCollapsed expression */}
        </div> {/* end Market Context collapsible wrapper */}

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
                  <h2 className="text-sm font-semibold text-blue-300">Bias Gauge</h2>
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

                    {/* Intraday sentiment sparkline — last 10 periods, centered at 50 */}
                    {sentimentData.timeframes?.intraday?.score != null && (() => {
                      const score = sentimentData.timeframes.intraday.score;
                      const color = score >= 60 ? '#34d399' : score <= 40 ? '#f87171' : '#fbbf24';
                      const history = sentimentData.intradayHistory || [];
                      // Build points: use history if available, else single current value
                      const pts = history.length >= 2
                        ? history.slice(-10)
                        : [{ score: 50 }, { score }];

                      const W = 200, H = 56, pad = 6;
                      const iW = W - pad * 2, iH = H - pad * 2;
                      const toY = (s) => pad + iH * (1 - Math.max(0, Math.min(100, s)) / 100);
                      const centerY = toY(50);

                      const coords = pts.map((p, i) => ({
                        x: pad + (pts.length === 1 ? iW / 2 : (i / (pts.length - 1)) * iW),
                        y: toY(p.score),
                      }));

                      // Smooth cubic bezier through all points (monotone-style tension 0.4)
                      const smoothPath = (pts) => {
                        if (pts.length < 2) return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                        let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
                        for (let i = 1; i < pts.length; i++) {
                          const cp = (pts[i].x - pts[i - 1].x) * 0.4;
                          d += ` C${(pts[i-1].x + cp).toFixed(1)},${pts[i-1].y.toFixed(1)} ${(pts[i].x - cp).toFixed(1)},${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
                        }
                        return d;
                      };
                      const linePath = smoothPath(coords);
                      const areaPath = `${linePath} L${coords[coords.length-1].x.toFixed(1)},${H} L${coords[0].x.toFixed(1)},${H} Z`;
                      const last = coords[coords.length - 1];

                      return (
                        <div className="pb-2 border-b border-blue-800/40">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Intraday Trend</span>
                            <span className="text-[9px] font-mono" style={{ color }}>{score}</span>
                          </div>
                          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '52px', display: 'block' }}>
                            <defs>
                              <linearGradient id="sGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                              </linearGradient>
                            </defs>
                            {/* Center line at 50 */}
                            <line x1={pad} y1={centerY} x2={W - pad - 14} y2={centerY} stroke="#64748b" strokeWidth="0.8" strokeDasharray="3 3" />
                            <text x={W - pad - 12} y={centerY + 2.5} fill="#94a3b8" fontSize="7" textAnchor="start">50</text>
                            {/* Area fill */}
                            <path d={areaPath} fill="url(#sGrad)" />
                            {/* Line */}
                            <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                            {/* Latest dot */}
                            <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
                          </svg>
                          <div className="flex justify-between mt-0.5">
                            <span className="text-[8px] text-slate-600">{pts.length > 1 ? `${pts.length} periods` : 'Current'}</span>
                            <span className="text-[8px] text-slate-600">{score >= 60 ? 'Bullish' : score <= 40 ? 'Bearish' : 'Neutral'}</span>
                          </div>
                        </div>
                      );
                    })()}

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
                      <div className="flex items-center justify-between pt-2 border-t border-blue-800/30 mt-1">
                        <span className="text-[9px] text-slate-500">Last computed</span>
                        <span className="text-[9px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">
                          {new Date(sentimentData.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
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
              {/* OLD: min-h-[500px] */}
              <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl overflow-hidden h-full flex flex-col min-h-[640px]">
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
                    {(chartInterval === '5minute' || chartInterval === '15minute') && (
                      <button
                        onClick={() => {
                          const next = !showVwap;
                          setShowVwap(next);
                          if (vwapSeriesRef.current) vwapSeriesRef.current.applyOptions({ visible: next });
                        }}
                        className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${showVwap ? 'bg-violet-600 text-white' : 'bg-[#0a1628] text-slate-400 hover:text-slate-200'}`}
                      >
                        VWAP
                      </button>
                    )}
                    <button
                      onClick={() => setShowZoneLines(v => !v)}
                      className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${showZoneLines ? 'bg-sky-700 text-white' : 'bg-[#0a1628] text-slate-400 hover:text-slate-200'}`}
                      title="Toggle zone ceiling / floor lines"
                    >
                      Zone
                    </button>
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
                {/* Key Levels Bar */}
                {keyLevels?.levels && (
                  <KeyLevelsBar levels={keyLevels.levels} spot={keyLevels.spot} />
                )}
                <div className="flex-1" ref={chartRef} key={`${chartSymbol}-${chartInterval}`} />
              </div>
            </div>

            {/* RIGHT COLUMN: Sectors */}
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl p-3">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-blue-300">Sectors</h2>
                  <span className="text-[10px] text-slate-500">vs Prev Close</span>
                </div>
                <div className="space-y-1 max-h-[420px] overflow-y-auto pr-0.5">
                  {sectorData.length > 0 ? (
                    [...sectorData].sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0)).map((sector) => {
                      const v = sector.value ?? 0;
                      const pos = v >= 0;
                      const intensity = Math.min(Math.abs(v) / 2.5, 1);
                      const barPct = Math.min((Math.abs(v) / 3) * 100, 100);
                      const tvSymbol = sector.tvSymbol || sector.symbol?.replace(/ /g, '') || sector.name?.toUpperCase().replace(/ /g, '');
                      return (
                        <a
                          key={sector.name}
                          href={`https://www.tradingview.com/chart/?symbol=NSE:${tvSymbol}&interval=15`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border transition-all cursor-pointer ${
                            pos
                              ? 'bg-emerald-950/40 border-emerald-800/20 hover:border-emerald-600/50 hover:bg-emerald-950/60'
                              : 'bg-red-950/40 border-red-900/20 hover:border-red-700/50 hover:bg-red-950/60'
                          }`}
                        >
                          {/* Accent bar */}
                          <div
                            className={`w-0.5 h-5 rounded-full flex-shrink-0 ${pos ? 'bg-emerald-400' : 'bg-red-400'}`}
                            style={{ opacity: 0.35 + intensity * 0.65 }}
                          />
                          {/* Name */}
                          <span className="text-[11px] text-slate-200 flex-1 truncate font-medium leading-none">{sector.name}</span>
                          {/* Mini bar */}
                          <div className="w-10 h-1 bg-white/5 rounded-full overflow-hidden flex-shrink-0">
                            <div
                              className={`h-full rounded-full ${pos ? 'bg-emerald-400' : 'bg-red-400'}`}
                              style={{ width: `${Math.max(barPct, 6)}%`, opacity: 0.45 + intensity * 0.55 }}
                            />
                          </div>
                          {/* Percentage */}
                          <span className={`text-[11px] font-mono font-bold w-11 text-right flex-shrink-0 ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pos ? '+' : ''}{v.toFixed(2)}%
                          </span>
                        </a>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      {sectorLoading ? 'Loading...' : (sectorError || 'No data')}
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
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => fetchOptionChain(true)}
                    disabled={optionLoading}
                    title="Force refresh OI data"
                    className="p-1.5 hover:bg-blue-800/40 rounded transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${optionLoading ? 'animate-spin' : ''}`} />
                  </button>
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
                      {(optionChainData && (optionChainData.totalCallOI === 0 || optionChainData.totalPutOI === 0)) ? (
                        <>
                          <div className="text-lg font-mono mt-1 text-slate-500">N/A</div>
                          <div className="text-xs text-slate-500">
                            {optionChainData.offMarketHours ? 'Market Closed' : 'OI Unavailable — retrying'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={`text-lg font-mono mt-1 ${optionChainData?.pcr > 1.2 ? 'text-green-400' : optionChainData?.pcr < 0.8 ? 'text-red-400' : 'text-yellow-400'}`}>
                            {optionChainData?.pcr?.toFixed(2) || '—'}
                          </div>
                          <div className="text-xs text-slate-400">{optionChainData?.pcr > 1.2 ? 'Bullish' : optionChainData?.pcr < 0.8 ? 'Bearish' : 'Neutral'}</div>
                        </>
                      )}
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
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Expiry / DTE</div>
                      <div className="text-lg font-mono text-slate-200 mt-1">
                        {optionChainData?.expiry ? new Date(optionChainData.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {optionChainData?.expiry
                          ? (() => { const d = Math.ceil((new Date(optionChainData.expiry) - new Date()) / 86400000); return `${d}d left · ${optionChainData?.expiryType || ''}`; })()
                          : '—'}
                      </div>
                    </div>
                  </div>

                  {/* ATM Premiums + Straddle */}
                  {optionChainData?.atmStrike && optionChainData?.optionChain?.length > 0 && (() => {
                    const atm = optionChainData.atmStrike;
                    const atmCE = optionChainData.optionChain.find(o => o.strike === atm && o.type === 'CE');
                    const atmPE = optionChainData.optionChain.find(o => o.strike === atm && o.type === 'PE');
                    if (!atmCE && !atmPE) return null;
                    const straddle = (atmCE?.ltp || 0) + (atmPE?.ltp || 0);
                    return (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-[#0a1628] rounded-lg p-3 border-l-2 border-red-500/40">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{atm} CE (ATM Call)</div>
                          <div className="text-lg font-mono text-red-400 mt-1">₹{atmCE?.ltp?.toFixed(2) || '—'}</div>
                          <div className="text-xs text-slate-500">Premium</div>
                        </div>
                        <div className="bg-[#0a1628] rounded-lg p-3 border-l-2 border-green-500/40">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{atm} PE (ATM Put)</div>
                          <div className="text-lg font-mono text-green-400 mt-1">₹{atmPE?.ltp?.toFixed(2) || '—'}</div>
                          <div className="text-xs text-slate-500">Premium</div>
                        </div>
                        <div className="bg-[#0a1628] rounded-lg p-3">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Straddle Value</div>
                          <div className="text-lg font-mono text-amber-400 mt-1">₹{straddle.toFixed(2)}</div>
                          <div className="text-xs text-slate-500">Expected move ±</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* OI Distribution — mini bar chart per strike */}
                  {(() => {
                    const chain = optionChainData?.optionChain;
                    if (!chain?.length) return null;
                    const atm = optionChainData.atmStrike;
                    const gap = optionUnderlying === 'BANKNIFTY' ? 100 : 50;
                    // Build rows for ATM ± 4 strikes, sorted high → low
                    const rows = [];
                    for (let i = 4; i >= -4; i--) {
                      const strike = atm + i * gap;
                      const ce = chain.find(o => o.strike === strike && o.type === 'CE');
                      const pe = chain.find(o => o.strike === strike && o.type === 'PE');
                      rows.push({ strike, cOI: ce?.oi || 0, pOI: pe?.oi || 0, isATM: i === 0 });
                    }
                    // Scale to 90th-percentile OI so one huge wall doesn't squash the rest
                    const allOIs = rows.flatMap(r => [r.cOI, r.pOI]).filter(v => v > 0).sort((a, b) => a - b);
                    const p90 = allOIs[Math.floor(allOIs.length * 0.9)] || 1;
                    const pct = v => Math.min(100, Math.round((v / p90) * 100));
                    return (
                      <div className="bg-[#0a1628] rounded-lg p-3">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                          <span className="text-green-400">← Put OI</span>
                          <span>Strike</span>
                          <span className="text-red-400">Call OI →</span>
                        </div>
                        <div className="space-y-px">
                          {rows.map(({ strike, cOI, pOI, isATM }) => {
                            const putPct = pct(pOI);
                            const callPct = pct(cOI);
                            const isS1 = strike === optionChainData?.support;
                            const isR1 = strike === optionChainData?.resistance;
                            return (
                              <div key={strike} className={`flex items-center gap-1 h-6 px-1 rounded ${isATM ? 'bg-blue-500/10 ring-1 ring-blue-500/20' : ''}`}>
                                {/* Put OI bar — grows left from center */}
                                <div className="flex-1 flex justify-end items-center gap-1.5">
                                  <span className="text-[9px] text-slate-600 font-mono w-8 text-right tabular-nums">{pOI > 0 ? (pOI/100000).toFixed(1)+'L' : ''}</span>
                                  <div className="w-20 h-3 flex justify-end rounded-sm overflow-hidden">
                                    <div className={`h-full rounded-l ${isS1 ? 'bg-green-400/70' : 'bg-green-500/35'}`} style={{ width: `${putPct}%` }} />
                                  </div>
                                </div>
                                {/* Strike label */}
                                <div className="w-16 flex-shrink-0 text-center">
                                  <span className={`text-xs font-mono ${isATM ? 'text-blue-300 font-bold' : isS1 ? 'text-green-400' : isR1 ? 'text-red-400' : 'text-slate-400'}`}>
                                    {strike.toLocaleString()}
                                  </span>
                                  {isATM && <span className="text-[8px] text-blue-500 ml-0.5">ATM</span>}
                                  {isS1 && !isATM && <span className="text-[8px] text-green-500 ml-0.5">S1</span>}
                                  {isR1 && !isATM && <span className="text-[8px] text-red-500 ml-0.5">R1</span>}
                                </div>
                                {/* Call OI bar — grows right from center */}
                                <div className="flex-1 flex items-center gap-1.5">
                                  <div className="w-20 h-3 rounded-sm overflow-hidden">
                                    <div className={`h-full rounded-r ${isR1 ? 'bg-red-400/70' : 'bg-red-500/35'}`} style={{ width: `${callPct}%` }} />
                                  </div>
                                  <span className="text-[9px] text-slate-600 font-mono w-8 tabular-nums">{cOI > 0 ? (cOI/100000).toFixed(1)+'L' : ''}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* S/R summary */}
                        <div className="mt-2 pt-2 border-t border-slate-800/40 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-red-400 font-medium">R1 {optionChainData?.resistance?.toLocaleString()}</span>
                            <span className="text-slate-500">{(optionChainData?.resistanceOI/100000).toFixed(1)}L</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-green-400 font-medium">S1 {optionChainData?.support?.toLocaleString()}</span>
                            <span className="text-slate-500">{(optionChainData?.supportOI/100000).toFixed(1)}L</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-red-300">R2 {optionChainData?.resistance2?.toLocaleString()}</span>
                            <span className="text-slate-500">{(optionChainData?.resistance2OI/100000).toFixed(1)}L</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-green-300">S2 {optionChainData?.support2?.toLocaleString()}</span>
                            <span className="text-slate-500">{(optionChainData?.support2OI/100000).toFixed(1)}L</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

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

                    {/* Synthesized insights */}
                    {optionChainData?.actionableInsights?.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-blue-800/20">
                        {optionChainData.actionableInsights.slice(0, 3).map((insight, idx) => (
                          <p key={idx} className={`text-xs leading-relaxed ${insight.type === 'setup' ? 'text-amber-300 font-medium' : 'text-slate-300'}`}>
                            <span className="mr-1">{insight.emoji}</span>
                            {insight.message}
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
                  <div className="text-[9px] text-slate-600 pt-1">
                    OI data reflects NSE end-of-day positions — intraday OI changes may lag by 5–15 min
                  </div>
                </div>
              )}
            </div>
       

          </div>
        </main>
      </div>
    );
  }