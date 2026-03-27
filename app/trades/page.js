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
    const [showVolume, setShowVolume] = useState(true);
    const [showBOS, setShowBOS] = useState(true);
    const [showChartSettings, setShowChartSettings] = useState(false);
    const chartSettingsRef = useRef(null);
    const showBOSRef = useRef(true);
    const keyLevelsForZoneRef = useRef(null);
    const showZoneLinesRef = useRef(true);
    const customChartRef = useRef(null);      // our chart instance
    const customChartCtnRef = useRef(null);   // container div for our canvas
    const customVwapDataRef = useRef(null);   // cached vwap data for toggle
    const [hoverOHLC, setHoverOHLC] = useState(null);
    const [hoverLineValues, setHoverLineValues] = useState(null);
    const [showIndicators, setShowIndicators] = useState(false);
    const [rsiValue, setRsiValue] = useState(null);
    const [powerCandles, setPowerCandles] = useState([]);
    const [powerCandleDismissed, setPowerCandleDismissed] = useState(null); // dismissed candle time
    const candleDataRef = useRef([]);

    // Third Eye state
    const [thirdEyeData, setThirdEyeData] = useState(null);
    const [thirdEyeLog, setThirdEyeLog]   = useState([]);   // rolling candle log
    const [thirdEyeEnv, setThirdEyeEnv]   = useState('medium');
    const [thirdEyeOpen, setThirdEyeOpen] = useState(true);
    const [thirdEyePlacing, setThirdEyePlacing] = useState(null);  // entry.time being placed
    const [thirdEyePlaced,  setThirdEyePlaced]  = useState({});    // { [entry.time]: result }
    const [thirdEyeMode,    setThirdEyeMode]    = useState('semi'); // 'semi' | 'auto' (auto = coming soon)
    const [activeTrade,     setActiveTrade]     = useState(null);   // placed trade object
    const [tradeLTP,        setTradeLTP]        = useState(null);   // live option LTP
    const [tradeExiting,    setTradeExiting]    = useState(false);
    const [tradeExited,     setTradeExited]     = useState(null);   // exit result
    const [thirdEyeLive,    setThirdEyeLive]    = useState(null);   // current forming candle (updates every 30s)
    const [thirdEyeTestMode, setThirdEyeTestMode] = useState(false); // Ctrl+Shift+T toggles test card
    const [leftTab, setLeftTab]           = useState('sectors');
    const thirdEyeEnvRef      = useRef('medium');
    const lastCandleCountRef  = useRef(0);

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

    useEffect(() => {
      keyLevelsForZoneRef.current = keyLevels;
      showZoneLinesRef.current = showZoneLines;
    }, [keyLevels, showZoneLines]);

    // Keep showBOSRef in sync (used by fetchData closure)
    useEffect(() => { showBOSRef.current = showBOS; }, [showBOS]);

    // Keep thirdEyeEnvRef in sync (used by fetchData closure)
    useEffect(() => { thirdEyeEnvRef.current = thirdEyeEnv; }, [thirdEyeEnv]);

    // Poll live LTP for active trade every 30s
    useEffect(() => {
      if (!activeTrade) return;
      const poll = async () => {
        try {
          const res  = await fetch(`/api/third-eye/ltp?instrument=NFO:${activeTrade.symbol}`);
          const data = await res.json();
          if (data.ltp) setTradeLTP(data.ltp);
        } catch { /* ignore */ }
      };
      poll();
      const id = setInterval(poll, 30000);
      return () => clearInterval(id);
    }, [activeTrade?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

    // Ctrl+Shift+T — toggle Third Eye test mode (injects a fake semi-auto card)
    useEffect(() => {
      const onKey = (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'T') setThirdEyeTestMode(p => !p);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Live LTP tick — update last chart candle every 5s (intraday only)
    useEffect(() => {
      const intraday = chartInterval === '5minute' || chartInterval === '15minute';
      if (!intraday) return;
      const tick = async () => {
        try {
          const res  = await fetch(`/api/quotes?symbols=${chartSymbol}`);
          const data = await res.json();
          const ltp  = data.quotes?.[0]?.ltp;
          if (ltp && customChartRef.current) customChartRef.current.updateTick(ltp);
        } catch { /* ignore */ }
      };
      const id = setInterval(tick, 5000);
      return () => clearInterval(id);
    }, [chartSymbol, chartInterval]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close chart settings dropdown on outside click
    useEffect(() => {
      if (!showChartSettings) return;
      const handler = (e) => {
        if (chartSettingsRef.current && !chartSettingsRef.current.contains(e.target)) {
          setShowChartSettings(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [showChartSettings]);

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

    // ── Break of Structure (BOS) detector ────────────────────────────────────
    // Finds the most recent broken swing high (bullish BOS) and broken swing
    // low (bearish BOS). strength = number of bars on each side of pivot.
    const detectBOS = (candles, strength = 3) => {
      if (!candles || candles.length < strength * 2 + 5) return [];
      const result = [];
      for (let i = strength; i < candles.length - strength; i++) {
        let isHigh = true, isLow = true;
        for (let j = 1; j <= strength; j++) {
          if (candles[i - j].high >= candles[i].high || candles[i + j].high >= candles[i].high) isHigh = false;
          if (candles[i - j].low  <= candles[i].low  || candles[i + j].low  <= candles[i].low)  isLow  = false;
        }
        if (isHigh) {
          // Check if any later candle closed above this swing high
          for (let j = i + 1; j < candles.length; j++) {
            if (candles[j].close > candles[i].high) {
              result.push({ type: 'bull', price: candles[i].high, idx: i });
              break;
            }
          }
        }
        if (isLow) {
          // Check if any later candle closed below this swing low
          for (let j = i + 1; j < candles.length; j++) {
            if (candles[j].close < candles[i].low) {
              result.push({ type: 'bear', price: candles[i].low, idx: i });
              break;
            }
          }
        }
      }
      // Keep only most recent of each type
      const bulls = result.filter(r => r.type === 'bull');
      const bears = result.filter(r => r.type === 'bear');
      return [bulls[bulls.length - 1], bears[bears.length - 1]].filter(Boolean);
    };

    // ── Power candle detector ─────────────────────────────────────────────────
    // A "power candle" has: body > 1.5× ATR(14), volume > 1.5× 20-bar avg,
    // and a strong body (body ≥ 60% of range). Scans last 5 bars only.
    const detectPowerCandles = (candles, lookback = 5) => {
      if (!candles || candles.length < 21) return [];

      // ATR(14)
      const atrSlice = candles.slice(-15);
      let atrSum = 0;
      for (let i = 1; i < atrSlice.length; i++) {
        const c = atrSlice[i], p = atrSlice[i - 1];
        atrSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
      }
      const atr = atrSum / 14;

      // 20-bar average volume (excluding the most recent `lookback` bars to avoid self-reference)
      const volSlice = candles.slice(-20 - lookback, -lookback);
      const avgVol   = volSlice.reduce((s, c) => s + (c.volume || 0), 0) / volSlice.length;

      if (!atr || !avgVol) return [];

      const results = [];
      const start   = Math.max(0, candles.length - lookback);
      for (let i = start; i < candles.length; i++) {
        const c        = candles[i];
        const body     = Math.abs(c.close - c.open);
        const range    = c.high - c.low;
        const bodyRatio = range > 0 ? body / range : 0;
        const volMult   = (c.volume || 0) / avgVol;
        const rangeMult = range / atr;

        if (bodyRatio >= 0.6 && volMult >= 1.5 && rangeMult >= 1.5) {
          results.push({
            time:      c.time,
            direction: c.close >= c.open ? 'bull' : 'bear',
            volMult:   Math.round(volMult  * 10) / 10,
            rangeMult: Math.round(rangeMult * 10) / 10,
          });
        }
      }
      return results;
    };

    // RSI(14) from candle data
    const computeRSIData = (candles, period = 14) => {
      if (!candles || candles.length < period + 1) return [];
      const result = [];
      let avgGain = 0, avgLoss = 0;
      for (let i = 1; i <= period; i++) {
        const d = candles[i].close - candles[i - 1].close;
        if (d > 0) avgGain += d; else avgLoss -= d;
      }
      avgGain /= period; avgLoss /= period;
      result.push({ time: candles[period].time, value: avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)) });
      for (let i = period + 1; i < candles.length; i++) {
        const d = candles[i].close - candles[i - 1].close;
        avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
        result.push({ time: candles[i].time, value: avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)) });
      }
      return result;
    };

    // ADX(14) — returns { adx, plusDI, minusDI }
    const computeADXData = (candles, period = 14) => {
      if (!candles || candles.length < period * 3) return { adx: [], plusDI: [], minusDI: [] };
      const tr = [], pDM = [], mDM = [];
      for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        const up = h - candles[i - 1].high, dn = candles[i - 1].low - l;
        pDM.push(up > dn && up > 0 ? up : 0);
        mDM.push(dn > up && dn > 0 ? dn : 0);
      }
      const wilderSmooth = arr => {
        let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
        const out = [s];
        for (let i = period; i < arr.length; i++) { s = s - s / period + arr[i]; out.push(s); }
        return out;
      };
      const sTR = wilderSmooth(tr), sPDM = wilderSmooth(pDM), sMDM = wilderSmooth(mDM);
      const plusDIData = [], minusDIData = [], dxArr = [];
      for (let i = 0; i < sTR.length; i++) {
        const idx = i + period;
        if (idx >= candles.length) break;
        const pDI = sTR[i] === 0 ? 0 : (sPDM[i] / sTR[i]) * 100;
        const mDI = sTR[i] === 0 ? 0 : (sMDM[i] / sTR[i]) * 100;
        plusDIData.push({ time: candles[idx].time, value: parseFloat(pDI.toFixed(2)) });
        minusDIData.push({ time: candles[idx].time, value: parseFloat(mDI.toFixed(2)) });
        dxArr.push(pDI + mDI === 0 ? 0 : Math.abs(pDI - mDI) / (pDI + mDI) * 100);
      }
      const smoothDX = wilderSmooth(dxArr);
      const adxData = [];
      for (let i = 0; i < smoothDX.length; i++) {
        const idx = i + period * 2;
        if (idx >= candles.length) break;
        adxData.push({ time: candles[idx].time, value: parseFloat(smoothDX[i].toFixed(2)) });
      }
      return { adx: adxData, plusDI: plusDIData, minusDI: minusDIData };
    };

    // ── Custom chart (canvas module) ──────────────────────────────────────────
    useEffect(() => {
      const el = customChartCtnRef.current;
      if (!el) return;

      import('@/app/lib/chart/Chart.js').then(({ createChart }) => {
        if (customChartRef.current) { customChartRef.current.destroy(); customChartRef.current = null; }

        const chart = createChart(el, { interval: chartInterval });
        customChartRef.current = chart;

        chart.onCrosshairMove(info => {
          if (!info) { setHoverOHLC(null); setHoverLineValues(null); return; }
          setHoverOHLC({ open: info.bar.open, high: info.bar.high, low: info.bar.low, close: info.bar.close, volume: info.bar.volume ?? 0 });
          setHoverLineValues(info.lineValues ?? null);
        });

        let chartInitialised = false;

        const fetchData = async () => {
          try {
            const days = chartInterval === 'week' ? 365 : chartInterval === 'day' ? 60 : 5;
            const res  = await fetch(`/api/nifty-chart?symbol=${chartSymbol}&interval=${chartInterval}&days=${days}`);
            const data = await res.json();
            if (!data.candles?.length) return;

            candleDataRef.current = data.candles;
            // First load: fit all content into view.
            // Subsequent refreshes: preserve the user's pan/zoom, only update data.
            if (!chartInitialised) {
              chart.setCandles(data.candles);
              chartInitialised = true;
            } else {
              chart.updateCandles(data.candles);
            }

            // RSI value
            const rsiData = computeRSIData(data.candles);
            setRsiValue(rsiData[rsiData.length - 1]?.value ?? null);

            // Power candle detection
            const pc = detectPowerCandles(data.candles);
            setPowerCandles(pc);
            chart.setMarkers(pc);

            // EMA lines
            emaPeriods.forEach((period, idx) => {
              const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#a21caf'];
              const emaData = calculateEMA(data.candles, period);
              chart.setLine(`ema${period}`, { data: emaData, color: colors[idx % colors.length], width: 1.5 });
            });

            // VWAP (intraday only)
            const isIntraday = chartInterval === '5minute' || chartInterval === '15minute';
            if (isIntraday) {
              const IST_OFFSET_S = 5.5 * 3600;
              const todayIST = new Date(Date.now() + IST_OFFSET_S * 1000).toISOString().slice(0, 10);
              const todayCandles = data.candles.filter(c => new Date(c.time * 1000 + IST_OFFSET_S * 1000).toISOString().slice(0, 10) === todayIST);
              const vwapData = computeVWAP(todayCandles.length ? todayCandles : data.candles);
              customVwapDataRef.current = vwapData;
              if (showVwap) chart.setLine('vwap', { data: vwapData, color: '#a78bfa', width: 2 });
            } else {
              chart.clearLine('vwap');
            }

            // Third Eye scan (after VWAP is populated in the ref)
            try {
              const { runThirdEye } = await import('@/app/lib/thirdEye.js');
              const vwapForHE  = customVwapDataRef.current;
              const rsiVal     = rsiData[rsiData.length - 1]?.value ?? null;
              const heResult   = runThirdEye(data.candles, vwapForHE, rsiVal, thirdEyeEnvRef.current);
              setThirdEyeData(heResult);

              // Always update live card (current forming candle) — runs every 30s
              {
                const liveCandle = data.candles[data.candles.length - 1];
                const ld = new Date((liveCandle.time + 19800) * 1000);
                const lhh = String(ld.getUTCHours()).padStart(2, '0');
                const lmm = String(ld.getUTCMinutes()).padStart(2, '0');
                const now = new Date(Date.now() + 19800 * 1000);
                const nhh = String(now.getUTCHours()).padStart(2, '0');
                const nmm = String(now.getUTCMinutes()).padStart(2, '0');
                setThirdEyeLive({
                  time:        `${lhh}:${lmm}`,   // candle open time
                  updatedAt:   `${nhh}:${nmm}`,    // wall-clock refresh time
                  topSetup:    heResult.strongSetups?.[0] ?? heResult.watchList?.[0] ?? null,
                  context:     heResult.context,
                  candle:      { open: liveCandle.open, high: liveCandle.high, low: liveCandle.low, close: liveCandle.close },
                  rawPatterns: heResult.rawPatterns ?? [],
                  isLive:      true,
                });
              }

              // Append to rolling log only when a new candle has formed
              const newCount = data.candles.length;
              if (newCount > lastCandleCountRef.current) {
                lastCandleCountRef.current = newCount;
                const lastCandle = data.candles[data.candles.length - 1];
                // Format IST time from unix timestamp
                const d = new Date((lastCandle.time + 19800) * 1000); // +5:30 offset
                const hh = String(d.getUTCHours()).padStart(2, '0');
                const mm = String(d.getUTCMinutes()).padStart(2, '0');
                const entry = {
                  time:        `${hh}:${mm}`,
                  topSetup:    heResult.strongSetups?.[0] ?? heResult.watchList?.[0] ?? null,
                  context:     heResult.context,
                  candle:      { open: lastCandle.open, high: lastCandle.high, low: lastCandle.low, close: lastCandle.close },
                  rawPatterns: heResult.rawPatterns ?? [],
                };
                setThirdEyeLog(prev => [entry, ...prev].slice(0, 12));
              }
            } catch (heErr) {
              console.error('[Third Eye] scan error:', heErr);
            }

            // Zone lines
            const kl = keyLevelsForZoneRef.current;
            chart.clearZone('ceiling'); chart.clearZone('floor');
            if (showZoneLinesRef.current && kl?.levels?.length) {
              const ceiling = kl.levels.find(l => l.dist > 0.5);
              const floor   = kl.levels.find(l => l.dist < -0.5);
              const fullName = LEVEL_FULL_NAME;
              if (ceiling) chart.setZone({ id: 'ceiling', price: ceiling.price, color: 'rgba(251,113,133,0.85)', label: `▲ ${fullName[ceiling.label] || ceiling.label}`, style: 'dashed' });
              if (floor)   chart.setZone({ id: 'floor',   price: floor.price,   color: 'rgba(125,211,252,0.85)', label: `▼ ${fullName[floor.label]   || floor.label}`,   style: 'dashed' });
            }

            // BOS zones
            chart.clearZone('bos_bull'); chart.clearZone('bos_bear');
            if (showBOSRef.current) {
              const bosLevels = detectBOS(data.candles);
              for (const b of bosLevels) {
                chart.setZone({ id: `bos_${b.type}`, price: b.price, color: b.type === 'bull' ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.85)', label: b.type === 'bull' ? 'BOS ▲' : 'BOS ▼', style: 'solid', inline: true });
              }
            }
          } catch (err) {
            console.error('[custom chart] fetch error:', err);
          }
        };

        fetchData();

        const REFRESH_MS = {
          '5minute':  30_000,   // 30s — live candle updates feel responsive
          '15minute': 60_000,   // 60s — one update per minute is plenty
          'hour':     300_000,  // 5 min — hourly bar changes slowly
          'day':      1_800_000, // 30 min — daily bar only needs occasional refresh
        };
        const refreshMs = REFRESH_MS[chartInterval];
        const interval = refreshMs ? setInterval(fetchData, refreshMs) : null;

        return () => {
          clearInterval(interval);
          chart.destroy();
          customChartRef.current = null;
        };
      });
    }, [chartSymbol, chartInterval]);

    // Sync EMA lines when emaPeriods toggle changes (no chart rebuild)
    useEffect(() => {
      const chart = customChartRef.current;
      if (!chart) return;
      const candles = candleDataRef.current;
      if (!candles?.length) return;
      const allPeriods = [9, 21, 50, 200];
      const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#a21caf'];
      allPeriods.forEach((period, idx) => {
        if (emaPeriods.includes(period)) {
          const emaData = calculateEMA(candles, period);
          chart.setLine(`ema${period}`, { data: emaData, color: colors[idx % colors.length], width: 1.5 });
        } else {
          chart.clearLine(`ema${period}`);
        }
      });
    }, [emaPeriods]);

    // Sync VWAP visibility when toggle changes
    useEffect(() => {
      const chart = customChartRef.current;
      if (!chart) return;
      if (showVwap && customVwapDataRef.current) {
        chart.setLine('vwap', { data: customVwapDataRef.current, color: '#a78bfa', width: 2 });
      } else {
        chart.clearLine('vwap');
      }
    }, [showVwap]);

    // Sync zone lines when toggle or key levels change
    useEffect(() => {
      const chart = customChartRef.current;
      if (!chart) return;
      chart.clearZone('ceiling'); chart.clearZone('floor');
      if (showZoneLines && keyLevels?.levels?.length) {
        const ceiling = keyLevels.levels.find(l => l.dist > 0.5);
        const floor   = keyLevels.levels.find(l => l.dist < -0.5);
        if (ceiling) chart.setZone({ id: 'ceiling', price: ceiling.price, color: 'rgba(251,113,133,0.85)', label: `▲ ${LEVEL_FULL_NAME[ceiling.label] || ceiling.label}`, style: 'dashed' });
        if (floor)   chart.setZone({ id: 'floor',   price: floor.price,   color: 'rgba(125,211,252,0.85)', label: `▼ ${LEVEL_FULL_NAME[floor.label]   || floor.label}`,   style: 'dashed' });
      }
    }, [showZoneLines, keyLevels]);

    // Sync volume visibility when toggle changes
    useEffect(() => {
      const chart = customChartRef.current;
      if (!chart) return;
      chart.setShowVolume(showVolume);
    }, [showVolume]);

    // Sync BOS zones when toggle changes
    useEffect(() => {
      const chart = customChartRef.current;
      if (!chart) return;
      chart.clearZone('bos_bull'); chart.clearZone('bos_bear');
      if (showBOS && candleDataRef.current.length) {
        const bosLevels = detectBOS(candleDataRef.current);
        for (const b of bosLevels) {
          chart.setZone({ id: `bos_${b.type}`, price: b.price, color: b.type === 'bull' ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.85)', label: b.type === 'bull' ? 'BOS ▲' : 'BOS ▼', style: 'solid', inline: true });
        }
      }
    }, [showBOS]);

    // Helper: bias to emoji
    const biasEmoji = (bias) => {
      if (!bias) return '🟡';
      if (bias.includes('bullish')) return '🟢';
      if (bias.includes('bearish')) return '🔴';
      return '🟡';
    };

    // Third Eye: semi-auto order placement for S3/S6 on Nifty
    const SEMI_AUTO_IDS = ['s3_orb_bull','s3_orb_bear','s6_engulf_bull','s6_engulf_bear','s18_bb_bull','s18_bb_bear'];

    const placeThirdEyeOrder = async (entry) => {
      // Test mode: simulate placement without hitting the API
      if (entry.isTest) {
        setThirdEyePlaced(prev => ({ ...prev, [entry.time]: { ok: true, symbol: 'NIFTY25APR22000CE [TEST]', limitPrice: 120, strike: 22000, optionType: 'CE' } }));
        setActiveTrade({ symbol: 'NIFTY25APR22000CE [TEST]', strike: 22000, optionType: 'CE', limitPrice: 120, qty: 65, direction: 'bull', setupName: 'ORB Breakout [TEST]', slLevel: 21950, entryClose: 22020 });
        setTradeLTP(120);
        setTradeExited(null);
        return;
      }
      setThirdEyePlacing(entry.time);
      try {
        const res  = await fetch('/api/third-eye/place', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            niftyPrice: entry.candle.close,
            direction:  entry.topSetup.pattern.direction,
          }),
        });
        const data = await res.json();
        setThirdEyePlaced(prev => ({ ...prev, [entry.time]: data }));
        if (data.ok) {
          setActiveTrade({
            symbol:     data.symbol,
            strike:     data.strike,
            optionType: data.optionType,
            limitPrice: data.limitPrice,
            qty:        65,
            direction:  entry.topSetup.pattern.direction,
            setupName:  entry.topSetup.pattern.name,
            slLevel:    entry.topSetup.pattern.sl ?? null,
            entryClose: entry.candle.close,
          });
          setTradeLTP(data.limitPrice);
          setTradeExited(null);
        }
      } catch (err) {
        setThirdEyePlaced(prev => ({ ...prev, [entry.time]: { error: err.message } }));
      } finally {
        setThirdEyePlacing(null);
      }
    };

    const exitThirdEyeTrade = async () => {
      if (!activeTrade) return;
      // Test mode: simulate exit without hitting the API
      if (activeTrade.symbol.includes('[TEST]')) {
        setTradeExited({ ok: true, orderId: 'TEST-EXIT-000' });
        setActiveTrade(null);
        return;
      }
      setTradeExiting(true);
      try {
        const res  = await fetch('/api/third-eye/exit', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ symbol: activeTrade.symbol, qty: activeTrade.qty }),
        });
        const data = await res.json();
        setTradeExited(data);
        if (data.ok) setActiveTrade(null);
      } catch (err) {
        setTradeExited({ error: err.message });
      } finally {
        setTradeExiting(false);
      }
    };

    // Primary entry setups — strong initial move, not continuation
    const GO_IDS = new Set(['s3_orb_bull','s3_orb_bear','s6_engulf_bull','s6_engulf_bear',
                             's11_ib_bull','s11_ib_bear','s18_bb_bull','s18_bb_bear']);

    // Third Eye: plain-English narrative builder for each candle entry
    const buildNarrative = (entry) => {
      const { topSetup: s, context: c, candle, rawPatterns = [] } = entry;

      // Opening noise
      if (c.sessionTime === 'opening') {
        return { type: 'wait', action: 'WAIT', headline: 'Opening noise — stand aside', reason: 'First 15 min still forming. Wait for range to establish before taking trades.' };
      }
      // Closing caution
      if (c.sessionTime === 'closing') {
        return { type: 'caution', action: 'CAUTION', headline: 'Closing risk — reduce exposure', reason: 'Last 30 min. Avoid new entries, tighten stops on open positions.' };
      }

      // ── EXIT: structural reversal setups (CHoCH, Wyckoff) ─────────────────
      if (s) {
        const id = s.pattern.id;
        if (id === 's13_choch_bull' || id === 's16_spring') {
          return { type: 'exit', direction: 'bull', action: 'EXIT SHORT',
            headline: 'Structure flipped bullish — cover shorts',
            reason: `${s.pattern.name}. Downtrend structure broken. Exit shorts if holding. Potential long entry.` };
        }
        if (id === 's13_choch_bear' || id === 's16_upthrust') {
          return { type: 'exit', direction: 'bear', action: 'EXIT LONG',
            headline: 'Structure flipped bearish — exit longs',
            reason: `${s.pattern.name}. Uptrend structure broken. Exit longs if holding. Potential short entry.` };
        }
      }

      // ── EXIT / WATCH: BOS forms against prior trend ───────────────────────
      if (c.bos) {
        if (c.bos.type === 'bear' && c.trend === 'uptrend') {
          if (c.bos.freshBreak) {
            return { type: 'watch', direction: 'bear', action: 'BOS WATCH',
              headline: 'Bearish BOS formed — watch next candle',
              reason: `Swing low broken. ${c.bos.distPct}% below level. If next candle holds below, exit longs.` };
          }
          return { type: 'exit', direction: 'bear', action: 'EXIT LONG',
            headline: 'Exit longs — BOS confirmed',
            reason: `Bearish BOS held. Uptrend structure invalidated. ${c.bos.distPct}% from price. Exit longs if holding.` };
        }
        if (c.bos.type === 'bull' && c.trend === 'downtrend') {
          if (c.bos.freshBreak) {
            return { type: 'watch', direction: 'bull', action: 'BOS WATCH',
              headline: 'Bullish BOS formed — watch next candle',
              reason: `Swing high broken. ${c.bos.distPct}% above level. If next candle holds above, cover shorts.` };
          }
          return { type: 'exit', direction: 'bull', action: 'EXIT SHORT',
            headline: 'Cover shorts — BOS confirmed',
            reason: `Bullish BOS held. Downtrend structure invalidated. ${c.bos.distPct}% from price. Cover shorts if holding.` };
        }
      }

      // ── Strong setups (score ≥ 6) ──────────────────────────────────────────
      if (s && s.score >= 6) {
        const dir   = s.pattern.direction;
        const trend = c.trend;
        const id    = s.pattern.id;

        const trendAligned = (trend === 'uptrend'   && dir === 'bull') ||
                             (trend === 'downtrend' && dir === 'bear') ||
                             trend === 'ranging';
        const vwapAligned  = c.vwap
          ? (dir === 'bull' ? c.vwap.above : !c.vwap.above)
          : null;
        const allowEntry = trendAligned || vwapAligned === true;

        if (!allowEntry) {
          // Counter-trend + wrong side of VWAP → Careful (reversal building, not confirmed)
          const parts = [s.pattern.name];
          if (c.vwap) parts.push(dir === 'bull' ? 'below VWAP' : 'above VWAP');
          if (c.volume.mult >= 1.3) parts.push(`${c.volume.mult}× vol`);
          return {
            type: 'caution',
            direction: dir,
            action: dir === 'bull' ? 'LONG (Careful)' : 'SHORT (Careful)',
            headline: dir === 'bull'
              ? 'Reversal setup — wait for VWAP reclaim to go long'
              : 'Distribution setup — wait for VWAP break to go short',
            reason: `${parts.join(' · ')} — score ${s.score} but ${trend}. ${dir === 'bull' ? 'No long until VWAP reclaimed.' : 'No short until VWAP lost.'}`,
          };
        }

        // Fresh = primary initiating entry; Cont. = continuation/re-entry
        const subType = GO_IDS.has(id) ? 'fresh' : 'cont';
        const subLabel = subType === 'fresh' ? '(Fresh)' : '(Cont.)';

        const parts = [s.pattern.name];
        if (c.vwap?.atVwap) parts.push('at VWAP');
        else if (c.vwap && Math.abs(c.vwap.distPct) < 0.3) parts.push('near VWAP');
        if (c.bos) parts.push('near BOS');
        if (c.orderBlock) parts.push('in OB zone');
        if (c.volume.mult >= 1.5) parts.push(`${c.volume.mult}× volume`);
        if (dir === 'bull' && c.rsi != null && c.rsi < 35) parts.push(`RSI oversold ${Math.round(c.rsi)}`);
        if (dir === 'bear' && c.rsi != null && c.rsi > 65) parts.push(`RSI overbought ${Math.round(c.rsi)}`);
        if (trendAligned && trend !== 'ranging') parts.push('trend aligned');
        // Supporting candlestick pattern (if any aligns with setup direction)
        const supPat = rawPatterns.find(p => p.pattern.direction === dir || p.pattern.direction === 'neutral');
        if (supPat) parts.push(supPat.pattern.name);
        return {
          type: 'entry',
          subType,
          direction: dir,
          action: `${dir === 'bull' ? 'LONG' : 'SHORT'} ${subLabel}`,
          headline: `${dir === 'bull' ? 'Go long' : 'Go short'} ${subLabel} — score ${s.score}/10`,
          reason: parts.join(' · '),
        };
      }

      // Watch list (score 3–5)
      if (s && s.score >= 3) {
        const dir = s.pattern.direction;
        const parts = [s.pattern.name];
        if (c.vwap?.atVwap) parts.push('at VWAP');
        if (c.volume.mult >= 1.3) parts.push(`${c.volume.mult}× vol`);
        return {
          type: 'watch',
          direction: dir,
          action: 'WATCH',
          headline: `${dir === 'bull' ? '↑ Possible long' : dir === 'bear' ? '↓ Possible short' : 'Setup'} forming`,
          reason: `${parts.join(' · ')} — wait for confirmation`,
        };
      }

      // No setup — read the candle itself
      const chg    = ((candle.close - candle.open) / candle.open * 100).toFixed(2);
      const bull   = candle.close > candle.open;
      const patHint = rawPatterns[0] ? ` · ${rawPatterns[0].pattern.name}` : '';
      if (c.volume.context === 'climax') {
        return { type: 'watch', action: 'WATCH', headline: 'Volume climax — possible reversal ahead', reason: `${bull ? 'Bullish' : 'Bearish'} ${Math.abs(chg)}% on ${c.volume.mult}× volume${patHint}. Climax often precedes a turn.` };
      }
      if (c.volume.context === 'dryup') {
        return { type: 'quiet', action: 'WAIT', headline: 'Low conviction — volume dry-up', reason: `${bull ? 'Bullish' : 'Bearish'} candle ${Math.abs(chg)}% on ${c.volume.mult}× volume${patHint}. No strong participants.` };
      }
      const trendLabel = c.trend === 'uptrend' ? 'Uptrend intact' : c.trend === 'downtrend' ? 'Downtrend intact' : 'Market ranging';
      return { type: 'quiet', action: 'OBSERVE', headline: `${bull ? '▲' : '▼'} ${Math.abs(chg)}% — no setup`, reason: `${trendLabel}. Vol ${c.volume.mult}×${c.rsi != null ? ` · RSI ${Math.round(c.rsi)}` : ''}${patHint}.` };
    };

    return (
      <div className="min-h-screen bg-[#060b14] text-slate-100">
        <Nav />

        {/* Sub-bar: Kite status + quick links */}
        <div className="border-b border-white/5 bg-[#060b14]">
          <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between">
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
            <div className="hidden sm:flex items-center gap-1">
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
        <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6">

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
                className="w-full flex items-start sm:items-center justify-between p-3 sm:p-4 hover:bg-blue-900/20 transition-colors cursor-pointer gap-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className={`px-2.5 py-1 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-1.5 ${
                      commentary.bias === 'BULLISH' ? 'bg-green-900/50 text-green-300 border border-green-700/50' :
                      commentary.bias === 'BEARISH' ? 'bg-red-900/50 text-red-300 border border-red-700/50' :
                      'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50'
                    }`}>
                      <span>{commentary.stateEmoji}</span>
                      <span>{commentary.state}</span>
                    </div>
                    <span className="text-base sm:text-lg">{commentary.biasEmoji}</span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white leading-snug">
                    {commentary.headline}
                  </h3>
                </div>
                
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!isMarketHours() && (
                    <span className="hidden sm:inline text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 border border-slate-600/50">
                      Markets Closed
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                    commentary.bias === 'BULLISH' ? 'text-green-400' :
                    commentary.bias === 'BEARISH' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {commentary.bias}
                  </span>
                  {commentaryRefreshedAt && !commentaryLoading && (
                    <span className="hidden sm:inline text-[10px] text-slate-600 tabular-nums">
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

              {/* Power Candle — Regime Shift Alert (always visible, blinks until dismissed) */}
              {powerCandles.length > 0 && (() => {
                const pc = powerCandles[powerCandles.length - 1];
                if (powerCandleDismissed === pc.time) return null;
                const isBull = pc.direction === 'bull';
                return (
                  <div className={`relative flex items-start gap-2 px-3 py-2 border-t border-b ${isBull ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    {/* Pinging dot — grabs attention */}
                    <span className="relative flex-shrink-0 mt-0.5">
                      <span className={`absolute inline-flex h-2.5 w-2.5 rounded-full opacity-75 animate-ping ${isBull ? 'bg-amber-400' : 'bg-red-400'}`} />
                      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isBull ? 'bg-amber-400' : 'bg-red-400'}`} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-bold tracking-wide animate-pulse ${isBull ? 'text-amber-300' : 'text-red-300'}`}>
                        ⚡ REGIME SHIFT ALERT
                      </div>
                      <div className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                        {isBull ? 'Bullish' : 'Bearish'} power candle — Vol {pc.volMult}× avg, Range {pc.rangeMult}× ATR.
                        {' '}<span className="text-slate-400">Trend may be reversing. Reassess bias and position size.</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setPowerCandleDismissed(pc.time)}
                      className="flex-shrink-0 text-slate-500 hover:text-slate-300 text-xs leading-none mt-0.5 px-1"
                      title="Dismiss"
                    >✕</button>
                  </div>
                );
              })()}

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
                  <div className="mt-2 flex flex-col sm:flex-row gap-3 sm:gap-4">

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
                    <div className="border-t sm:border-t-0 sm:border-l border-blue-800/40 pt-2 sm:pt-0 sm:pl-4 flex flex-col gap-1.5 sm:min-w-[220px]">
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
            <div className="lg:col-span-2 space-y-3 order-2 lg:order-none">

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

              {/* Bias + Sectors Tabbed Widget */}
              <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl p-3">
                {/* Tab bar */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex w-full bg-white/[0.05] rounded-lg p-0.5 gap-0.5">
                    <button
                      onClick={() => setLeftTab('sectors')}
                      className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-all ${leftTab === 'sectors' ? 'bg-[#1e3a5f] text-blue-300 shadow' : 'text-slate-500 hover:text-slate-300'}`}
                    >Sectors</button>
                    <button
                      onClick={() => setLeftTab('bias')}
                      className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-all ${leftTab === 'bias' ? 'bg-[#1e3a5f] text-blue-300 shadow' : 'text-slate-500 hover:text-slate-300'}`}
                    >Bias</button>
                  </div>
                </div>

                {/* Sectors tab */}
                {leftTab === 'sectors' && (
                  <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-500">vs Prev Close</span>
                  </div>
                  <div className="space-y-1 max-h-[420px] overflow-y-auto pr-0.5">
                    {sectorData.length > 0 ? (
                      [...sectorData].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).map((sector) => {
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
                            <div
                              className={`w-0.5 h-5 rounded-full flex-shrink-0 ${pos ? 'bg-emerald-400' : 'bg-red-400'}`}
                              style={{ opacity: 0.35 + intensity * 0.65 }}
                            />
                            <span className="text-[11px] text-slate-200 flex-1 truncate font-medium leading-none">{sector.name}</span>
                            <div className="w-10 h-1 bg-white/5 rounded-full overflow-hidden flex-shrink-0">
                              <div
                                className={`h-full rounded-full ${pos ? 'bg-emerald-400' : 'bg-red-400'}`}
                                style={{ width: `${Math.max(barPct, 6)}%`, opacity: 0.45 + intensity * 0.55 }}
                              />
                            </div>
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
                  </>
                )}

                {/* Bias tab */}
                {leftTab === 'bias' && (<div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-blue-300">Bias Gauge</span>
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
                </div>)}
              </div>
            </div>

            {/* CENTER COLUMN: Chart */}
            <div className="lg:col-span-7 order-1 lg:order-none">
              {/* OLD: min-h-[500px] */}
              <div className="bg-[#112240] backdrop-blur border border-blue-800/40 rounded-xl overflow-hidden h-full flex flex-col min-h-[380px] sm:min-h-[640px]">
                <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b border-blue-800/40">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <h2 className="text-sm sm:text-lg font-semibold text-blue-300">Market Chart</h2>
                    <select
                      className="bg-[#0a1628] border border-blue-700/50 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                      value={chartSymbol}
                      onChange={(e) => setChartSymbol(e.target.value)}
                    >
                      <option value="NIFTY">NIFTY 50</option>
                      <option value="BANKNIFTY">BANK NIFTY</option>
                      <option value="NIFTYFUT">NIFTY FUT</option>
                      <option value="BANKNIFTYFUT">BANKNIFTY FUT</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    {/* Interval selector */}
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

                    {/* ⚙ Chart settings dropdown */}
                    <div className="relative" ref={chartSettingsRef}>
                      <button
                        onClick={() => setShowChartSettings(v => !v)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${showChartSettings ? 'bg-slate-700 border-slate-500 text-white' : 'bg-[#0a1628] border-white/10 text-slate-400 hover:text-white'}`}
                        title="Chart settings"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Indicators
                      </button>
                      {showChartSettings && (
                        <div className="absolute top-full left-0 mt-1 z-50 bg-[#0d1f38] border border-blue-800/50 rounded-xl shadow-2xl p-3 w-52">
                          {/* EMA Lines */}
                          <div className="mb-2.5">
                            <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-1.5">EMA Lines</div>
                            <div className="grid grid-cols-4 gap-1">
                              {[9, 21, 50, 200].map((period) => (
                                <label key={period} className="flex flex-col items-center gap-0.5 cursor-pointer group">
                                  <div
                                    onClick={() => setEmaPeriods(prev => prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period])}
                                    className={`w-full text-center py-1 text-xs font-medium rounded cursor-pointer transition-colors ${emaPeriods.includes(period) ? 'bg-amber-600/80 text-white' : 'bg-white/5 text-slate-500 hover:text-slate-300'}`}
                                  >
                                    {period}
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                          {/* Overlays */}
                          <div className="mb-2.5">
                            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5">Overlays</div>
                            <div className="flex flex-col gap-1.5">
                              {[
                                { id: 'vwap',  label: 'VWAP', sub: 'intraday only', val: showVwap,      set: setShowVwap,      disabled: chartInterval !== '5minute' && chartInterval !== '15minute' },
                                { id: 'zone',  label: 'Zone Lines', sub: 'S/R levels',  val: showZoneLines, set: setShowZoneLines },
                                { id: 'bos',   label: 'BOS',  sub: 'Break of Structure', val: showBOS,  set: setShowBOS },
                              ].map(({ id, label, sub, val, set, disabled }) => (
                                <label key={id} className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-40' : ''}`}>
                                  <div
                                    onClick={() => !disabled && set(v => !v)}
                                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${val && !disabled ? 'bg-blue-600 border-blue-500' : 'bg-transparent border-slate-600'}`}
                                  >
                                    {val && !disabled && (
                                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-xs text-slate-200">{label}</div>
                                    {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                          {/* Sub-panels */}
                          <div>
                            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5">Sub-panels</div>
                            <div className="flex flex-col gap-1.5">
                              {[
                                { id: 'vol', label: 'Volume',  sub: 'bars below candles', val: showVolume,     set: setShowVolume },
                                { id: 'rsi', label: 'RSI(14)', sub: 'value in header',    val: showIndicators, set: setShowIndicators },
                              ].map(({ id, label, sub, val, set }) => (
                                <label key={id} className="flex items-center gap-2 cursor-pointer">
                                  <div
                                    onClick={() => set(v => !v)}
                                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${val ? 'bg-blue-600 border-blue-500' : 'bg-transparent border-slate-600'}`}
                                  >
                                    {val && (
                                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-xs text-slate-200">{label}</div>
                                    {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* External links */}
                    <a
                      href="/options"
                      className="hidden sm:flex px-3 py-1.5 bg-violet-700 hover:bg-violet-600 text-white text-xs font-medium rounded-lg transition-colors items-center gap-1"
                      title="Options Analytics — IV, Greeks, Probabilities"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Options
                    </a>
                    <a
                      href={`https://www.tradingview.com/chart/?symbol=${chartSymbol === 'BANKNIFTYFUT' ? 'NSE:BANKNIFTY1!' : chartSymbol === 'NIFTYFUT' ? 'NSE:NIFTY1!' : chartSymbol === 'BANKNIFTY' ? 'NSE:BANKNIFTY' : 'NSE:NIFTY'}&interval=${chartInterval === 'day' ? 'D' : chartInterval === 'week' ? 'W' : chartInterval.replace('minute', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden sm:flex px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors items-center gap-1"
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
                {/* Power Candle Alert */}
                {powerCandles.length > 0 && (() => {
                  const pc = powerCandles[powerCandles.length - 1];
                  const isBull = pc.direction === 'bull';
                  return (
                    <div className={`flex items-center gap-2 px-3 py-1.5 text-xs border-b ${isBull ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                      <span className={`font-bold ${isBull ? 'text-amber-400' : 'text-red-400'}`}>
                        ⚡ Power Candle
                      </span>
                      <span className={`font-medium ${isBull ? 'text-amber-300' : 'text-red-300'}`}>
                        {isBull ? '▲ Bullish' : '▼ Bearish'}
                      </span>
                      <span className="text-slate-400">
                        Vol {pc.volMult}× avg · Range {pc.rangeMult}× ATR
                      </span>
                      <span className={`${isBull ? 'text-amber-200/60' : 'text-red-200/60'}`}>
                        · {isBull ? 'Possible bullish reversal or strong continuation — watch next candle' : 'Possible bearish reversal or strong continuation — watch next candle'}
                      </span>
                    </div>
                  );
                })()}
                <div className="flex-1 relative" ref={customChartCtnRef} key={`custom-${chartSymbol}-${chartInterval}`}>
                    {/* OHLC + line values overlay */}
                    <div className="absolute top-2 left-2 z-10 flex flex-col gap-0.5 pointer-events-none">
                      {hoverOHLC && (
                        <div className="flex items-center gap-2 text-[10px] font-mono bg-[#0a1628]/90 border border-blue-800/30 rounded px-2 py-1">
                          <span className="text-slate-400">O</span><span className="text-slate-200">{hoverOHLC.open.toFixed(2)}</span>
                          <span className="text-slate-400">H</span><span className="text-emerald-400">{hoverOHLC.high.toFixed(2)}</span>
                          <span className="text-slate-400">L</span><span className="text-red-400">{hoverOHLC.low.toFixed(2)}</span>
                          <span className="text-slate-400">C</span><span className={hoverOHLC.close >= hoverOHLC.open ? 'text-emerald-400' : 'text-red-400'}>{hoverOHLC.close.toFixed(2)}</span>
                          {hoverOHLC.volume > 0 && <><span className="text-slate-400">V</span><span className="text-slate-300">{hoverOHLC.volume >= 1e6 ? (hoverOHLC.volume / 1e6).toFixed(2) + 'M' : hoverOHLC.volume >= 1e3 ? (hoverOHLC.volume / 1e3).toFixed(1) + 'K' : hoverOHLC.volume}</span></>}
                        </div>
                      )}
                      {hoverLineValues && (
                        <div className="flex items-center gap-3 text-[10px] font-mono bg-[#0a1628]/90 border border-blue-800/30 rounded px-2 py-1">
                          {emaPeriods.map((period, idx) => {
                            const colors = ['#f59e0b','#3b82f6','#10b981','#ef4444','#a21caf'];
                            const val = hoverLineValues[`ema${period}`];
                            return val != null ? (
                              <span key={period} style={{ color: colors[idx % colors.length] }}>EMA{period} {val.toFixed(2)}</span>
                            ) : null;
                          })}
                          {showVwap && hoverLineValues['vwap'] != null && (
                            <span className="text-violet-400">VWAP {hoverLineValues['vwap'].toFixed(2)}</span>
                          )}
                        </div>
                      )}
                    </div>
                </div>
                {showIndicators && (
                  <div className="border-t border-blue-800/30">
                    <div className="flex items-center gap-3 px-3 py-1 text-[9px] bg-[#0c1a2e]/60">
                      <span className="text-indigo-400 font-medium">RSI(14)</span>
                      {rsiValue != null && (
                        <span className={`font-mono font-bold ${rsiValue >= 70 ? 'text-red-400' : rsiValue <= 30 ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {rsiValue.toFixed(1)}
                        </span>
                      )}
                      <span className="text-slate-600">· 70 overbought · 30 oversold</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Sectors + Third Eye */}
            <div className="lg:col-span-3 space-y-3 order-3 lg:order-none">

              {/* ── Third Eye ────────────────────────────────────────── */}
              <div className="bg-[#0d1829] border border-white/[0.06] rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <span className="text-base">👁</span>
                    <span className="text-sm font-bold text-white">Third Eye</span>
                    {thirdEyeData?.strongSetups?.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Mode toggle */}
                    <div className="flex items-center gap-0.5 border-r border-white/10 pr-2">
                      <button
                        onClick={() => setThirdEyeMode('semi')}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
                          thirdEyeMode === 'semi'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'text-slate-600 hover:text-slate-400'
                        }`}
                        title="Semi-Auto: action card shown, you confirm before order fires"
                      >
                        Semi
                      </button>
                      <button
                        disabled
                        className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide text-slate-700 cursor-not-allowed"
                        title="Auto mode — coming soon"
                      >
                        Auto
                      </button>
                    </div>
                    {/* Environment toggle */}
                    {['light', 'medium', 'tight'].map(env => (
                      <button
                        key={env}
                        onClick={() => setThirdEyeEnv(env)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
                          thirdEyeEnv === env
                            ? env === 'light'  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : env === 'medium' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'text-slate-600 hover:text-slate-400'
                        }`}
                      >
                        {env}
                      </button>
                    ))}
                    <button onClick={() => setThirdEyeOpen(o => !o)} className="ml-0.5 text-slate-600 hover:text-slate-400">
                      {thirdEyeOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {thirdEyeOpen && activeTrade && (
                  <div className={`mx-3 my-2 p-3 rounded-xl border ${activeTrade.direction === 'bull' ? 'bg-emerald-500/[0.06] border-emerald-500/20' : 'bg-rose-500/[0.06] border-rose-500/20'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider ${activeTrade.direction === 'bull' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'}`}>
                        ACTIVE · {activeTrade.optionType}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 truncate max-w-[130px]">{activeTrade.symbol}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 mb-2.5 text-center">
                      <div>
                        <p className="text-[9px] text-slate-600 mb-0.5">Entry</p>
                        <p className="text-[11px] font-mono text-white">₹{activeTrade.limitPrice}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-600 mb-0.5">LTP</p>
                        <p className={`text-[11px] font-mono ${!tradeLTP ? 'text-slate-500' : tradeLTP > activeTrade.limitPrice ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {tradeLTP ? `₹${tradeLTP}` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-600 mb-0.5">P&amp;L</p>
                        <p className={`text-[11px] font-mono ${!tradeLTP ? 'text-slate-500' : ((tradeLTP - activeTrade.limitPrice) * activeTrade.qty) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {tradeLTP ? `₹${((tradeLTP - activeTrade.limitPrice) * activeTrade.qty).toFixed(0)}` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-600 mb-0.5">SL Idx</p>
                        <p className="text-[11px] font-mono text-rose-400">{activeTrade.slLevel ? activeTrade.slLevel.toFixed(0) : '—'}</p>
                      </div>
                    </div>
                    {tradeExited ? (
                      <div className={`text-[10px] text-center py-1.5 rounded-lg border font-mono ${tradeExited.ok ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20'}`}>
                        {tradeExited.ok ? '✓ Exit order sent' : tradeExited.error || 'Exit failed'}
                      </div>
                    ) : (
                      <button
                        onClick={exitThirdEyeTrade}
                        disabled={tradeExiting}
                        className="w-full py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-all bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-50"
                      >
                        {tradeExiting ? 'Exiting…' : 'Exit Trade (Market)'}
                      </button>
                    )}
                  </div>
                )}

                {thirdEyeOpen && thirdEyeLive && (() => {
                  const ln = buildNarrative(thirdEyeLive);
                  const liveIsBull = thirdEyeLive.topSetup?.pattern?.direction === 'bull';
                  const liveClose  = thirdEyeLive.candle?.close;
                  const liveSl     = thirdEyeLive.topSetup?.pattern?.sl;
                  const liveScore  = thirdEyeLive.topSetup?.score;

                  // Stale signal detection: prior log was directional but raw patterns now contradict it
                  const lastLogDir   = thirdEyeLog[0]?.topSetup?.pattern?.direction;
                  const BULL_REVERSAL_IDS = new Set(['morning_star','hammer','bull_pin','bull_engulfing','tweezer_bottom']);
                  const BEAR_REVERSAL_IDS = new Set(['evening_star','shooting_star','bear_pin','bear_engulfing','tweezer_top']);
                  const liveHasBullReversal = thirdEyeLive.rawPatterns?.some(p => BULL_REVERSAL_IDS.has(p.pattern?.id));
                  const liveHasBearReversal = thirdEyeLive.rawPatterns?.some(p => BEAR_REVERSAL_IDS.has(p.pattern?.id));
                  const staleWarning =
                    (lastLogDir === 'bear' && liveHasBullReversal) ? '⚠ Prior short — bounce pattern forming, hold fire' :
                    (lastLogDir === 'bull' && liveHasBearReversal) ? '⚠ Prior long — rejection pattern forming, tighten stops' :
                    null;
                  return (
                    <div className="px-3 pt-2 pb-1">
                      <div className={`relative px-3 py-2.5 rounded-xl border ${
                        ln?.action?.startsWith('EXIT') ? 'bg-violet-500/[0.06] border-violet-500/25' :
                        ln?.action === 'BOS WATCH'     ? 'bg-yellow-500/[0.06] border-yellow-500/25' :
                        liveIsBull                     ? 'bg-emerald-500/[0.05] border-emerald-500/20' :
                        thirdEyeLive.topSetup          ? 'bg-rose-500/[0.05] border-rose-500/20' :
                                                         'bg-white/[0.02] border-white/[0.06]'
                      }`}>
                        {/* LIVE pulse dot */}
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-400"></span>
                          </span>
                          <span className="text-[9px] font-bold text-sky-400 tracking-wider">LIVE</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5 pr-12">
                          {ln && (
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider shrink-0 ${
                              ln.action === 'LONG (Fresh)'        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                              ln.action === 'LONG (Cont.)'     ? 'bg-teal-500/15 text-teal-300 border-teal-500/30' :
                              ln.action === 'LONG (Careful)'   ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' :
                              ln.action === 'SHORT (Fresh)'       ? 'bg-rose-500/15 text-rose-300 border-rose-500/30' :
                              ln.action === 'SHORT (Cont.)'    ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' :
                              ln.action === 'SHORT (Careful)'  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                              ln.action?.startsWith('EXIT')    ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' :
                              ln.action === 'BOS WATCH'        ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' :
                              ln.action === 'OBSERVE'          ? 'bg-slate-700/40 text-slate-500 border-slate-600/30' :
                                                                 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                            }`}>{ln.action ?? 'WATCH'}</span>
                          )}
                          {thirdEyeLive.topSetup?.pattern?.name && <span className="text-[10px] text-white font-medium truncate">{thirdEyeLive.topSetup.pattern.name}</span>}
                          {liveScore != null && <span className="text-[9px] text-slate-500 ml-auto shrink-0">{liveScore}/10</span>}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">{ln?.reason ?? 'No signal yet — monitoring price action'}</p>
                        {staleWarning && (
                          <p className="mt-1.5 text-[9px] text-amber-400/80 font-medium">{staleWarning}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono text-slate-600">
                          <span>C {liveClose?.toFixed(0) ?? '—'}</span>
                          {liveSl && <span className="text-rose-500/80">SL {liveSl.toFixed(0)}</span>}
                          <span className="ml-auto">
                            <span className="text-slate-700">{thirdEyeLive.time} candle · </span>
                            <span>upd {thirdEyeLive.updatedAt ?? thirdEyeLive.time}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {thirdEyeOpen && thirdEyeTestMode && (
                  <div className="mx-3 mb-1 px-2 py-1 rounded text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/20 font-bold tracking-wider text-center">
                    TEST MODE · Ctrl+Shift+T to exit
                  </div>
                )}

                {thirdEyeOpen && (() => {
                  const FAKE_TEST_ENTRY = {
                    time: '⚠ TEST', isTest: true,
                    topSetup: { pattern: { id: 's3_orb_bull', name: 'ORB Breakout [TEST]', direction: 'bull', strength: 5, sl: 21950 }, score: 8 },
                    context:  { sessionTime: 'midday', trend: 'uptrend', bos: null, vwap: { above: true, distPct: 0.2 }, volume: { mult: 1.8, context: 'high' }, rsi: 58 },
                    candle:   { open: 22000, high: 22050, low: 21980, close: 22020 },
                    rawPatterns: [],
                  };
                  const displayLog = thirdEyeTestMode ? [FAKE_TEST_ENTRY, ...thirdEyeLog] : thirdEyeLog;
                  return (
                  <div className="divide-y divide-white/[0.04] max-h-[560px] overflow-y-auto">
                    {displayLog.length === 0 ? (
                      <p className="px-4 py-6 text-slate-600 text-xs text-center">Waiting for next candle close…</p>
                    ) : displayLog.map((entry, i) => {
                      const n       = buildNarrative(entry);
                      const isFirst = i === 0;

                      // Semi-auto action card: S3/S6, score ≥ 6, Nifty chart, most recent candle only
                      const setupId    = entry.topSetup?.pattern?.id;
                      const isActionable = (
                        isFirst &&
                        (entry.isTest || chartSymbol === 'NIFTY') &&
                        (entry.topSetup?.score ?? 0) >= 6 &&
                        SEMI_AUTO_IDS.includes(setupId)
                      );

                      if (isActionable) {
                        const s         = entry.topSetup.pattern;
                        const isBull    = s.direction === 'bull';
                        const close     = entry.candle.close;
                        const sl        = s.sl;
                        const dist      = sl ? Math.abs(close - sl) : null;
                        const target    = sl ? (isBull ? close + 2 * dist : close - 2 * dist) : null;
                        const placed    = thirdEyePlaced[entry.time];
                        const placing   = thirdEyePlacing === entry.time;
                        return (
                          <div key={i} className={`px-4 py-3 bg-white/[0.03] border-l-2 ${isBull ? 'border-emerald-500/60' : 'border-rose-500/60'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider ${isBull ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'}`}>
                                  {isBull ? 'LONG' : 'SHORT'}
                                </span>
                                {entry.isTest && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/20 text-amber-300 border-amber-500/30 tracking-widest">TEST</span>}
                              </div>
                              <span className="text-[10px] text-slate-600 font-mono">{entry.isTest ? '—' : entry.time}</span>
                            </div>
                            <p className="text-[11px] font-semibold text-white mb-1">{s.name}</p>
                            <p className="text-[10px] text-slate-500 mb-2.5">Score {entry.topSetup.score} · ATM {isBull ? 'CE' : 'PE'} · 65 qty</p>
                            <div className="grid grid-cols-3 gap-1 mb-3 text-center">
                              <div>
                                <p className="text-[9px] text-slate-600 mb-0.5">Entry</p>
                                <p className="text-[11px] font-mono text-white">{close.toFixed(0)}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-600 mb-0.5">SL</p>
                                <p className="text-[11px] font-mono text-rose-400">{sl ? sl.toFixed(0) : '—'}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-600 mb-0.5">Target 2:1</p>
                                <p className="text-[11px] font-mono text-emerald-400">{target ? target.toFixed(0) : '—'}</p>
                              </div>
                            </div>
                            {placed ? (
                              placed.ok ? (
                                <div className="text-[10px] text-emerald-400 text-center py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 font-mono">
                                  ✓ {placed.symbol} @ ₹{placed.limitPrice}
                                </div>
                              ) : (
                                <div className="text-[10px] text-rose-400 text-center py-1.5 bg-rose-500/10 rounded-lg border border-rose-500/20">
                                  {placed.error || 'Order failed'}
                                </div>
                              )
                            ) : (
                              <button
                                onClick={() => placeThirdEyeOrder(entry)}
                                disabled={placing}
                                className={`w-full py-2 rounded-lg text-[11px] font-bold tracking-wide transition-all disabled:opacity-50 ${isBull ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'} text-white`}
                              >
                                {placing ? 'Placing…' : `Buy ATM ${isBull ? 'CE' : 'PE'} · 65 qty`}
                              </button>
                            )}
                          </div>
                        );
                      }

                      const isEntry  = n.type === 'entry';
                      const isExit   = n.type === 'exit';
                      const isCaut   = n.type === 'caution';
                      const nLong    = n.direction === 'bull';
                      const isGo     = n.subType === 'fresh';
                      const isCont   = n.subType === 'cont';

                      const isBosWatch = n.action === 'BOS WATCH';

                      const badgeStyle =
                        (isEntry && isGo   && nLong)  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                        (isEntry && isCont && nLong)  ? 'bg-teal-500/15 text-teal-300 border-teal-500/30' :
                        (isEntry && isGo   && !nLong) ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' :
                        (isEntry && isCont && !nLong) ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' :
                        isExit                        ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' :
                        isBosWatch                    ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' :
                        (isCaut && nLong)             ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                        isCaut                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        n.type === 'watch'            ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
                        'bg-slate-700/20 text-slate-600 border-slate-600/10';

                      const headlineStyle =
                        (isEntry && isGo   && nLong)  ? 'text-emerald-300' :
                        (isEntry && isCont && nLong)  ? 'text-teal-300' :
                        (isEntry && isGo   && !nLong) ? 'text-rose-300' :
                        (isEntry && isCont && !nLong) ? 'text-orange-300' :
                        isExit                        ? 'text-violet-300' :
                        isBosWatch                    ? 'text-yellow-300' :
                        isCaut                        ? 'text-amber-300' :
                        n.type === 'watch'            ? 'text-slate-400' :
                        'text-slate-500';
                      return (
                        <div key={i} className={`px-4 py-3 ${isFirst ? 'bg-white/[0.025]' : ''}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider ${badgeStyle}`}>
                              {n.action}
                            </span>
                            <span className="text-[10px] text-slate-600 font-mono">{entry.time}</span>
                          </div>
                          <p className={`text-[11px] font-semibold leading-snug mb-1 ${headlineStyle}`}>{n.headline}</p>
                          <p className="text-[10px] text-slate-500 leading-relaxed">{n.reason}</p>
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}
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