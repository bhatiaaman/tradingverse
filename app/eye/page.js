  'use client';

  import React, { useState, useEffect, useRef, useCallback } from 'react';
  import Link from 'next/link';
  import { RefreshCw, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
  import Nav from '../components/Nav';
  import OptionsAnalysisPanel from '../components/OptionsAnalysisPanel';

  import { playBullishFlip, playBearishFlip, playReversalAlert, playWarningPing, playReversalBuilding, playSentiment50Cross, playShortCoveringAlert } from '../lib/sounds';
  // ── Extracted components (Phase 5 split) ───────────────────────────────────
  import KeyLevelsBar from './components/KeyLevelsBar';
  import ShortCoveringBanner from './components/ShortCoveringBanner';
  import PositionConflictBanner from './components/PositionConflictBanner';
  // import SetupEyePanel from './components/SetupEyePanel'; // hidden — replaced by ThirdEyePanel
  import ThirdEyePanel from './components/ThirdEyePanel';
  import { usePageVisibility } from '@/app/hooks/usePageVisibility';

  // ── Determine directional bias of an open position ────────────────────────
  // Options: short PE = bullish, short CE = bearish, long PE = bearish, long CE = bullish
  // Equity/futures: positive qty = bull, negative qty = bear
  function positionDir(p) {
    const sym = p.tradingsymbol || '';
    if (sym.endsWith('PE')) return p.quantity < 0 ? 'bull' : 'bear';
    if (sym.endsWith('CE')) return p.quantity > 0 ? 'bull' : 'bear';
    return p.quantity >= 0 ? 'bull' : 'bear';
  }

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

  // LEVEL_FULL_NAME: kept here for chart zone rendering (lines ~1344, ~1418)
  // LEVEL_CATEGORY_COLOR moved to ./components/KeyLevelsBar.js
  const LEVEL_FULL_NAME = {
    PDH: 'Previous Day High', PDL: 'Previous Day Low', PDC: 'Previous Day Close',
    PP: 'Pivot Point', R1: 'Resistance 1', S1: 'Support 1',
    WkH: 'Weekly High', WkL: 'Weekly Low',
    MoH: 'Monthly High', MoL: 'Monthly Low',
    EMA9: 'EMA 9', EMA21: 'EMA 21', EMA50: 'EMA 50', EMA200: 'EMA 200',
    TdH: "Today's High", TdL: "Today's Low",
    ORH: 'Opening Range High', ORL: 'Opening Range Low',
  };

  export default function EyePage() {
    const isVisible = usePageVisibility();
    const isVisibleRef = useRef(isVisible);
    useEffect(() => { isVisibleRef.current = isVisible; }, [isVisible]);

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

    const [commentary, setCommentary] = useState(null);
    const [commentaryLoading, setCommentaryLoading] = useState(true);
    const [commentaryRefreshedAt, setCommentaryRefreshedAt] = useState(null);
    const [commentaryLastUpdated, setCommentaryLastUpdated] = useState(null);
    const [niftyRegime, setNiftyRegime] = useState(null);
    const [dailyBias, setDailyBias] = useState(null);
    const [fifteenMinBias, setFifteenMinBias] = useState(null);
    const [commentaryCollapsed, setCommentaryCollapsed] = useState(true);
    const prevCommentaryRef = useRef(null);
    const soundEnabledRef   = useRef(false); // only alert after first load
    // Track last directional entry direction so we can label Cont. correctly
    const lastEntryDirRef   = useRef(null); // 'bull' | 'bear' | null
    const biasRef           = useRef('neutral'); // persistent directional bias: 'bull' | 'bear' | 'neutral'
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
    const [chartInterval, setChartInterval] = useState('5minute');
    const [emaPeriods, setEmaPeriods] = useState([9,21]);
    const [showEmaConfig, setShowEmaConfig] = useState(false);
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

    // ── Intelligence alert helpers (derived from state, safe to compute here) ──
    const latestPowerCandle = powerCandles.length > 0 ? powerCandles[powerCandles.length - 1] : null;
    const isPowerCandleActive = latestPowerCandle && powerCandleDismissed !== latestPowerCandle.time;

    const candleDataRef = useRef([]);

    // Short Covering setup state
    const [scData,          setScData]          = useState(null);
    const [scLastUpdated,   setScLastUpdated]   = useState(null);
    const [scDismissed,     setScDismissed]     = useState(false);
    const [scConfirming,    setScConfirming]    = useState(false);
    const [scPlacing,       setScPlacing]       = useState(false);
    const [scOrderResult,   setScOrderResult]   = useState(null);
    const scPrevActiveRef   = useRef(false);
    const scNotifSentRef    = useRef(false); // prevent repeat notifications on same activation
    const scOrderTimerRef   = useRef(null);

    // Position alert state — fetched every 30s, shown when bias conflicts with open positions
    const [openPositions,     setOpenPositions]     = useState([]);
    const [positionAlert,     setPositionAlert]     = useState(null); // { bias, conflicting: [...] }
    const [positionAlertDismissedBias, setPositionAlertDismissedBias] = useState(null); // bias at dismiss time
    const [exitingSymbol,     setExitingSymbol]     = useState(null);
    const [exitResult,        setExitResult]        = useState(null);

    // Setup Eye state
    const [setupEyeData, setSetupEyeData] = useState(null);
    const [setupEyeLog, setSetupEyeLog]   = useState([]);   // rolling candle log
    const [scanStatus, setScanStatus]     = useState(null); // { lastTime, pushed, errors }
    const [setupEyeEnv, setSetupEyeEnv]   = useState('medium');
    const [setupEyeOpen, setSetupEyeOpen] = useState(true);
    const [setupEyePlacing, setSetupEyePlacing] = useState(null);  // entry.time being placed
    const [setupEyePlaced,  setSetupEyePlaced]  = useState({});    // { [entry.time]: result }
    const [setupEyeMode,    setSetupEyeMode]    = useState('semi'); // 'semi' | 'auto' (auto = coming soon)
    const [activeTrade,     setActiveTrade]     = useState(null);   // placed trade object
    const [tradeLTP,        setTradeLTP]        = useState(null);   // live option LTP
    const [semiAutoQty,     setSemiAutoQty]     = useState(65);     // user-editable qty for semi-auto orders
    const [tradeExiting,    setTradeExiting]    = useState(false);
    const [tradeExited,     setTradeExited]     = useState(null);   // exit result
    const [setupEyeLive,    setSetupEyeLive]    = useState(null);   // current forming candle (updates every 30s)
    const [setupEyeTestMode, setSetupEyeTestMode] = useState(false); // Ctrl+Shift+T toggles test card
    const [leftTab, setLeftTab]           = useState('sectors');
    const setupEyeEnvRef      = useRef('medium');
    const setupConfigRef      = useRef({});
    const lastCandleTimeRef   = useRef(''); // 'HH:MM' of last logged candle
    // Cooldown for system log: { "symbol|tf|setupId": lastLoggedEpochMs }
    // Prevents the same setup on the same level from flooding the log on every candle.
    // Counts consecutive "no setup" candles in the same bias — drives consolidation commentary.
    const quietCandleCountRef = useRef(0);

    // ── Server-side bias state (Phase 1 rebuild) ──────────────────────────────
    // Source of truth for bias — lives in Redis, persists across page refreshes.
    // biasRef is kept as a fallback for position-conflict check compatibility.
    const [serverBiasState, setServerBiasState] = useState(null); // { bias, since, pendingFlip }
    const [liveTick, setLiveTick] = useState(null); // { ltp, change, vwapDist, aboveVwap } from 10s tick

    // Restore Setup Eye log from Redis on mount → now handled by /api/setup-eye/scan.
    // Keeps backward compat: also loads from /api/setup-eye/log for immediate display
    // while scan initializes.
    useEffect(() => {
      fetch('/api/setup-eye/log')
        .then(r => r.json())
        .then(d => {
          if (!d.entries?.length) return;
          const ist    = new Date(Date.now() + 5.5 * 3600 * 1000);
          const nowStr = `${String(ist.getUTCHours()).padStart(2,'0')}:${String(ist.getUTCMinutes()).padStart(2,'0')}`;
          const todayEntries = d.entries.filter(e => e.time && e.time <= nowStr);
          if (!todayEntries.length) return;
          setSetupEyeLog(todayEntries);
          if (todayEntries[0]?.time) lastCandleTimeRef.current = todayEntries[0].time;
        })
        .catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Server-side scan polling (primary bias + log source) ─────────────────
    // Polls /api/setup-eye/scan every 30s during market hours.
    // Writes bias to serverBiasState (and syncs biasRef for backward compat).
    // Log from server overwrites client log (server is source of truth).
    useEffect(() => {
      let scanTimer;

      const runScan = async () => {
        if (!isMarketHours() || !isVisibleRef.current) return;
        try {
          const res = await fetch('/api/setup-eye/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol:   chartSymbol,
              interval: chartInterval,
              env:      setupEyeEnvRef.current,
              cfg:      setupConfigRef.current,
            }),
          });
          if (!res.ok) return;
          const data = await res.json();

          // Update server bias state
          if (data.biasState) {
            setServerBiasState(data.biasState);
            // Sync biasRef for position-conflict check compatibility
            const bias = data.biasState.bias?.toLowerCase();
            biasRef.current = bias === 'bull' ? 'bull' : bias === 'bear' ? 'bear' : 'neutral';
          }

          // Update log from server (authoritative)
          if (data.log?.length) {
            setSetupEyeLog(data.log);
            if (data.log[0]?.time) lastCandleTimeRef.current = data.log[0].time;
          }

          // Update live card from server
          if (data.live) {
            setSetupEyeLive(data.live);
          }

          if (data.scanStatus) setScanStatus(data.scanStatus);

          // Position conflict check when bias changes
          if (data.biasState?.bias && data.biasState.bias !== 'NEUTRAL') {
            checkPositionsAgainstBias();
          }
        } catch { /* scan errors are non-fatal */ }
      };

      // Run immediately then on interval
      runScan();
      const SCAN_MS = chartInterval === '15minute' ? 60_000 : 30_000;
      const interval = setInterval(runScan, SCAN_MS);

      return () => clearInterval(interval);
    }, [chartSymbol, chartInterval]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── 15s live tick polling ─────────────────────────────────────────────────
    // Updates spot LTP on the live card — lightweight, no scan.
    // Slowed from 10s and guarded by visibility — /api/quotes is shared with
    // the chart LTP tick, so reducing concurrent callers cuts Kite API pressure.
    useEffect(() => {
      const runTick = async () => {
        if (!isMarketHours() || !isVisibleRef.current) return;
        try {
          const res  = await fetch(`/api/setup-eye/tick?symbol=${chartSymbol}`);
          if (!res.ok) return;
          const data = await res.json();
          setLiveTick(data);
        } catch { /* silent */ }
      };
      runTick();
      const iv = setInterval(runTick, 15_000);
      return () => clearInterval(iv);
    }, [chartSymbol]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch open positions and check against current bias
    const checkPositionsAgainstBias = async () => {
      try {
        const res  = await fetch('/api/kite-positions');
        const data = await res.json();
        if (!data.success || !data.positions?.length) { setOpenPositions([]); setPositionAlert(null); return; }
        setOpenPositions(data.positions);
        const bias = biasRef.current;
        if (bias === 'neutral') { setPositionAlert(null); return; }
        // Find positions conflicting with current bias
        // Options: short PE = bullish, short CE = bearish, long PE = bearish, long CE = bullish
        // Equity/futures: positive qty = bullish, negative qty = bearish
        const conflicting = data.positions.filter(p => positionDir(p) !== bias);
        if (!conflicting.length) { setPositionAlert(null); return; }
        // Only show if not already dismissed for this exact bias direction
        setPositionAlert({ bias, conflicting });
      } catch { /* silent */ }
    };

    useEffect(() => {
      checkPositionsAgainstBias();
      const interval = setInterval(checkPositionsAgainstBias, 30_000);
      return () => clearInterval(interval);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Browser notification permission ──────────────────────────────────────
    const [notifPermission, setNotifPermission] = useState('default'); // 'default' | 'granted' | 'denied'
    useEffect(() => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotifPermission(Notification.permission);
      }
    }, []);
    const requestNotifPermission = async () => {
      try {
        const result = await Notification.requestPermission();
        setNotifPermission(result);
      } catch {}
    };

    // ── Short Covering: poll + sound + browser notification ──────────────────
    useEffect(() => {
      const fetchSC = async (isSilent = false) => {
        if (!isVisibleRef.current) return;
        try {
          const nPrice = marketData?.indices?.nifty;
          const url = `/api/short-covering${isSilent ? '' : '?refresh=1'}${nPrice ? `&spot=${nPrice}` : ''}`;
          const r = await fetch(url);
          const d = await r.json();
          if (!d.error) {
            setScData(d);
            setScLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            const wasActive = scPrevActiveRef.current;
            const isActive  = d.active === true;
            // Transition: inactive → active
            if (isActive && !wasActive) {
              scNotifSentRef.current = false; // reset so notification fires
            }
            if (isActive && !scNotifSentRef.current) {
              setScDismissed(false); // re-show card when a new signal fires
              try { playShortCoveringAlert(); } catch {}
              try {
                if (typeof window !== 'undefined' && 'Notification' in window) {
                  const grant = Notification.permission === 'granted'
                    ? 'granted'
                    : await Notification.requestPermission();
                  if (grant === 'granted') {
                    const trade = d.trade;
                    const body  = trade
                      ? `Score ${d.score}/${d.maxScore} · NIFTY ${trade.strike} CE ₹${trade.entryLtp} · SL ₹${trade.sl?.cePremium}`
                      : `Score ${d.score}/${d.maxScore} · Spot ${d.context?.spot?.toFixed(0)}`;
                    new Notification('⚡ Short Covering Active', { body, icon: '/favicon.ico' });
                    scNotifSentRef.current = true;
                  }
                }
              } catch {}
            }
            if (!isActive) scNotifSentRef.current = false;
            scPrevActiveRef.current = isActive;
          }
        } catch { /* silent */ }
      };
      fetchSC();
      const iv = setInterval(() => {
        const ist  = new Date(Date.now() + 5.5 * 3600 * 1000);
        const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
        const day  = ist.getUTCDay();
        if (day !== 0 && day !== 6 && mins >= 555 && mins <= 930) fetchSC(true);
      }, 60_000);
      return () => clearInterval(iv);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // SC order result auto-clear
    useEffect(() => {
      if (scOrderResult) {
        clearTimeout(scOrderTimerRef.current);
        scOrderTimerRef.current = setTimeout(() => setScOrderResult(null), 8000);
      }
      return () => clearTimeout(scOrderTimerRef.current);
    }, [scOrderResult]);

    const handleScPlaceOrder = async () => {
      if (!scData?.trade) return;
      setScPlacing(true);
      try {
        const r = await fetch('/api/place-order', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tradingsymbol:    scData.trade.symbol,
            exchange:         'NFO',
            transaction_type: 'BUY',
            order_type:       'MARKET',
            product:          'MIS',
            quantity:         65,
          }),
        });
        const result = await r.json();
        if (!r.ok || result.error) throw new Error(result.error || 'Order failed');
        setScOrderResult({ ok: true,  msg: `Placed · ID ${result.order_id}` });
        setScConfirming(false);
      } catch (e) {
        setScOrderResult({ ok: false, msg: e.message });
      } finally {
        setScPlacing(false);
      }
    };

    // Load setup config on mount
    useEffect(() => {
      fetch('/api/eye-settings')
        .then(r => r.json())
        .then(d => { if (d.config) setupConfigRef.current = d.config; })
        .catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      // 60s is sufficient — Kite token is valid all day; window message handles instant transitions
      const pollInterval = setInterval(checkKiteAuth, 60_000);
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
      const interval = setInterval(() => { if (isMarketHours() && isVisibleRef.current) fetchMarketData(); }, 60000);
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

    // Keep setupEyeEnvRef in sync (used by fetchData closure)
    useEffect(() => { setupEyeEnvRef.current = setupEyeEnv; }, [setupEyeEnv]);

    // Poll live LTP for active trade every 30s
    useEffect(() => {
      if (!activeTrade) return;
      const poll = async () => {
        try {
          const res  = await fetch(`/api/setup-eye/ltp?instrument=NFO:${activeTrade.symbol}`);
          const data = await res.json();
          if (data.ltp) setTradeLTP(data.ltp);
        } catch { /* ignore */ }
      };
      poll();
      const id = setInterval(poll, 30000);
      return () => clearInterval(id);
    }, [activeTrade?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

    // Ctrl+Shift+T — toggle Setup Eye test mode (injects a fake semi-auto card)
    useEffect(() => {
      const onKey = (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'T') setSetupEyeTestMode(p => !p);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Live LTP tick — update last chart candle every 10s (intraday only)
    // Slowed from 5s: reduces /api/quotes load when multiple tabs are open.
    // Skips when tab is hidden — no point updating a chart nobody is watching.
    useEffect(() => {
      const intraday = chartInterval === '5minute' || chartInterval === '15minute';
      if (!intraday) return;
      const tick = async () => {
        if (!isVisibleRef.current) return; // skip when tab is in background
        try {
          const res  = await fetch(`/api/quotes?symbols=${chartSymbol}`);
          const data = await res.json();
          const ltp  = data.quotes?.[0]?.ltp;
          if (ltp && customChartRef.current) customChartRef.current.updateTick(ltp);
        } catch { /* ignore */ }
      };
      const id = setInterval(tick, 10_000);
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
      const interval = setInterval(() => { if (isMarketHours()) fetchSectorData(); }, 300000);
      return () => clearInterval(interval);
    }, []);

    // Monotonic counter — each call to fetchCommentaryNow gets a unique ID.
    // If a newer call completes first, older responses are silently dropped.
    const commentaryFetchIdRef = useRef(0);

    // Fetch commentary (used by both interval and manual refresh button)
    const fetchCommentaryNow = useCallback(async (forceRefresh = false) => {
      if (!isVisibleRef.current && !forceRefresh) return;
      const myId = ++commentaryFetchIdRef.current;
      setCommentaryLoading(true);
      try {
        const params = new URLSearchParams({ interval: chartInterval });
        if (forceRefresh) params.set('refresh', '1');
        const response = await fetch(`/api/market-commentary?${params}`);
        const data = await response.json();

        // Drop this response if a newer fetch already committed
        if (myId < commentaryFetchIdRef.current) return;

        if (data.error) console.error('[commentary] server error:', data.error);

        const next = data.commentary;
        const prev = prevCommentaryRef.current;

        // Only update if this response is newer than what we already have
        if (next?.timestamp && prev?.timestamp) {
          if (new Date(next.timestamp) <= new Date(prev.timestamp) && !forceRefresh) return;
        }

        if (soundEnabledRef.current && next && prev) {
          const biasChanged  = next.bias !== prev.bias;
          const newReversal  = next.reversal?.reversalZone && !prev.reversal?.reversalZone;
          const highConf     = next.reversal?.confidence === 'HIGH';
          const prevWarnings = (prev.warnings || []).length;
          const nextWarnings = (next.warnings || []).length;
          if (biasChanged) {
            if (next.bias === 'BULLISH') playBullishFlip();
            else if (next.bias === 'BEARISH') playBearishFlip();
          } else if (newReversal && highConf) {
            playReversalAlert();
          } else if (newReversal && !highConf) {
            playReversalBuilding();
          } else if (nextWarnings > prevWarnings) {
            playWarningPing();
          }
        }

        prevCommentaryRef.current = next;
        soundEnabledRef.current   = true;
        setCommentary(next);
        setCommentaryRefreshedAt(new Date());
        setCommentaryLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        if (data.dailyBias)      setDailyBias(data.dailyBias);
        if (data.fifteenMinBias) setFifteenMinBias(data.fifteenMinBias);
      } catch (error) {
        console.error('Failed to fetch commentary:', error);
      } finally {
        if (myId === commentaryFetchIdRef.current) setCommentaryLoading(false);
      }
    }, [chartInterval]); // re-fetch when TF changes

    // Refresh summary panel immediately when switching back to this tab
    // (placed here so fetchCommentaryNow is already declared — avoids TDZ)
    const prevVisibleRef = useRef(false);
    useEffect(() => {
      if (isVisible && !prevVisibleRef.current && isMarketHours()) {
        fetchCommentaryNow();
      }
      prevVisibleRef.current = isVisible;
    }, [isVisible, fetchCommentaryNow]);

    // Fetch option chain data
    const fetchOptionChain = useCallback(async (forceRefresh = false) => {
      if (!isVisibleRef.current && !forceRefresh) return;
      setOptionLoading(true);
      try {
        const livePrice = marketData?.indices?.[optionUnderlying.toLowerCase()];
        const url = `/api/option-chain?underlying=${optionUnderlying}&expiry=${optionExpiry}${forceRefresh ? '&refresh=1' : ''}${livePrice ? `&spot=${livePrice}` : ''}`;
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
      const interval = setInterval(() => { if (isMarketHours()) fetchOptionChain(); }, 60000);
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

    // Commentary polling — re-runs when chartInterval changes (fetchCommentaryNow depends on it)
    useEffect(() => {
      // Fetch NIFTY intraday regime
      const fetchRegime = async () => {
        try {
          const r = await fetch('/api/market-regime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'NIFTY', type: 'intraday' }) });
          const d = await r.json();
          if (d.regime && d.regime !== 'INITIALIZING' && !d.error) setNiftyRegime(d);
        } catch {}
      };

      // Only fetch during market hours — outside hours clear stale state and show closed message
      if (isMarketHours()) { fetchCommentaryNow(); fetchRegime(); }
      else { setCommentary(null); setCommentaryLoading(false); }

      // Refresh every 60s (was 3-5m)
      let commentaryTimer;
      const scheduleCommentary = () => {
        commentaryTimer = setTimeout(() => {
          if (isMarketHours()) { fetchCommentaryNow(); fetchRegime(); }
          else if (!isMarketHours()) { setCommentary(null); setCommentaryLoading(false); }
          scheduleCommentary();
        }, 60_000);
      };
      scheduleCommentary();

      return () => clearTimeout(commentaryTimer);
    }, [fetchCommentaryNow]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch sentiment data
    useEffect(() => {
      const fetchSentiment = async () => {
        if (!isVisibleRef.current) return;
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
      const interval = setInterval(() => { if (isMarketHours()) fetchSentiment(); }, 60_000);
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

      if (!atr) return [];
      // avgVol may be 0 for index instruments (Nifty) — volume check is optional
      const hasVol = avgVol > 0;

      const results = [];
      const start   = Math.max(0, candles.length - lookback);
      for (let i = start; i < candles.length; i++) {
        const c        = candles[i];
        const body     = Math.abs(c.close - c.open);
        const range    = c.high - c.low;
        const bodyRatio = range > 0 ? body / range : 0;
        const volMult    = hasVol ? (c.volume || 0) / avgVol : null;
        const rangeMult  = range / atr;
        const upperWick  = range > 0 ? (c.close >= c.open ? c.high - c.close : c.high - c.open) / range : 1;
        const lowerWick  = range > 0 ? (c.close >= c.open ? c.open - c.low  : c.close - c.low) / range : 1;

        const passesVol  = !hasVol || volMult >= 1.5;
        if (bodyRatio >= 0.75 && upperWick <= 0.12 && lowerWick <= 0.12 && rangeMult >= 1.5 && passesVol) {
          results.push({
            time:      c.time,
            direction: c.close >= c.open ? 'bull' : 'bear',
            volMult:   volMult != null ? Math.round(volMult  * 10) / 10 : null,
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

      // Reset bias and entry tracking whenever symbol/interval changes
      biasRef.current         = 'neutral';
      lastEntryDirRef.current = null;

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
            emaPeriods.forEach((period) => {
              const emaData = calculateEMA(data.candles, period);
              chart.setLine(`ema${period}`, { data: emaData, color: EMA_COLORS[period] ?? '#f59e0b', width: 1.5 });
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

            // Setup Eye scan — only meaningful during live market hours
            if (!isMarketHours()) {
              setSetupEyeData(null);
              setSetupEyeLive(null);
            }
            if (!isMarketHours()) return; // skip scan + live card outside hours

            try {
              const { runSetupEye } = await import('@/app/lib/setupEye.js');
              const vwapForHE  = customVwapDataRef.current;
              const rsiVal     = rsiData[rsiData.length - 1]?.value ?? null;
              const heResult   = runSetupEye(data.candles, vwapForHE, rsiVal, setupEyeEnvRef.current, setupConfigRef.current);
              setSetupEyeData(heResult);

              // Always update live card (current forming candle) — runs every 30s
              {
                const liveCandle = data.candles[data.candles.length - 1];
                const ld = new Date((liveCandle.time + 19800) * 1000);
                const lhh = String(ld.getUTCHours()).padStart(2, '0');
                const lmm = String(ld.getUTCMinutes()).padStart(2, '0');
                const now = new Date(Date.now() + 19800 * 1000);
                const nhh = String(now.getUTCHours()).padStart(2, '0');
                const nmm = String(now.getUTCMinutes()).padStart(2, '0');
                setSetupEyeLive({
                  time:        `${lhh}:${lmm}`,   // candle open time
                  updatedAt:   `${nhh}:${nmm}`,    // wall-clock refresh time
                  topSetup:    heResult.strongSetups?.[0] ?? heResult.watchList?.[0] ?? null,
                  context:     heResult.context,
                  candle:      { open: liveCandle.open, high: liveCandle.high, low: liveCandle.low, close: liveCandle.close },
                  rawPatterns: heResult.rawPatterns ?? [],
                  isLive:      true,
                });
              }

              // ── Rolling log: process ALL sealed candles newer than last logged time.
              // Handles both the normal case (1 new candle per poll) and backfill
              // (user returns after 30 min away — processes all missed candles in order).
              if (data.candles.length >= 2) {
                const candleTimeStr = (c) => {
                  const d = new Date((c.time + 19800) * 1000);
                  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
                };

                // Only process candles from TODAY's IST date — prevents yesterday's
                // closing candles (15:xx WRAP UP) from polluting the log on next-day load.
                const todayISTDate = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
                const allSealed = data.candles.slice(0, -1).filter(c => {
                  const candleDateIST = new Date(c.time * 1000 + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
                  return candleDateIST === todayISTDate;
                });
                const lastLogged = lastCandleTimeRef.current;

                // Candles not yet in the log, in chronological order. Cap at 12 (log size).
                const toProcess = allSealed
                  .filter(c => candleTimeStr(c) > lastLogged)
                  .slice(-12);

                if (toProcess.length > 0) {
                  // NOTE: ref is updated per-candle inside the loop (after success or failure)
                  // to avoid advancing past candles that threw an exception before they were logged.

                  const newEntries = [];

                  for (const targetCandle of toProcess) {
                    const timeStr = candleTimeStr(targetCandle);
                    try {
                      const candleIdx    = data.candles.indexOf(targetCandle);
                      const candlesUpTo  = data.candles.slice(0, candleIdx + 1);
                      if (candlesUpTo.length < 3) { lastCandleTimeRef.current = timeStr; continue; }

                      const rsiVal = rsiData[candleIdx]?.value ?? null;
                      const result = runSetupEye(candlesUpTo, vwapForHE, rsiVal, setupEyeEnvRef.current, setupConfigRef.current);
                      const topSetup = result.strongSetups?.[0] ?? result.watchList?.[0] ?? null;

                      const entry = {
                        time:        timeStr,
                        topSetup,
                        context:     result.context,
                        candle:      { open: targetCandle.open, high: targetCandle.high, low: targetCandle.low, close: targetCandle.close },
                        rawPatterns: result.rawPatterns ?? [],
                      };

                      // Compute frozen narrative — bias evolves in order through backfilled candles
                      const nObj = runBuildNarrative(entry, biasRef.current, lastEntryDirRef.current);
                      biasRef.current         = nObj.nextBias;
                      lastEntryDirRef.current = nObj.nextDir;
                      entry.narrative         = nObj.narrative;

                      if (nObj.alertUI) {
                        setPositionAlertDismissedBias(null);
                        setTimeout(checkPositionsAgainstBias, 0);
                      }

                      // Third Eye scalp setups are logged server-side in /api/third-eye/scan

                      newEntries.push(entry);
                      lastCandleTimeRef.current = timeStr; // advance ref only after successful processing
                    } catch (candleErr) {
                      console.error('[Setup Eye] candle processing error at', timeStr, candleErr);
                      lastCandleTimeRef.current = timeStr; // advance past failed candle to avoid infinite retry
                    }
                  }

                  setScanStatus({ lastTime: lastCandleTimeRef.current, pushed: newEntries.length, total: toProcess.length });

                  if (newEntries.length > 0) {
                    setSetupEyeLog(prev => {
                      // newEntries is oldest-first; prepend newest-first to log
                      const merged = [...[...newEntries].reverse(), ...prev];
                      // Deduplicate by time
                      const seen = new Set();
                      const deduped = merged.filter(e => {
                        if (seen.has(e.time)) return false;
                        seen.add(e.time); return true;
                      }).slice(0, 12);
                      fetch('/api/setup-eye/log', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ entries: deduped }),
                      }).catch(() => {});
                      return deduped;
                    });
                  }
                }
              }
            } catch (heErr) {
              console.error('[Setup Eye] scan error:', heErr);
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

    // Stable per-period EMA colors
    const EMA_COLORS = { 9: '#f59e0b', 21: '#3b82f6', 50: '#10b981', 100: '#f97316', 169: '#ec4899', 200: '#ef4444' };
    const ALL_EMA_PERIODS = [9, 21, 50, 100, 169, 200];

    // Sync EMA lines when emaPeriods toggle changes (no chart rebuild)
    useEffect(() => {
      const chart = customChartRef.current;
      if (!chart) return;
      const candles = candleDataRef.current;
      if (!candles?.length) return;
      ALL_EMA_PERIODS.forEach((period) => {
        if (emaPeriods.includes(period)) {
          const emaData = calculateEMA(candles, period);
          chart.setLine(`ema${period}`, { data: emaData, color: EMA_COLORS[period], width: 1.5 });
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

    // Setup Eye: semi-auto order placement for S3/S6 on Nifty
    // Build semi-auto IDs from saved config — any setup with semiAuto:true
    // maps to its bull+bear variant IDs (e.g. s21 → s21_vwap_reclaim_bull/bear)
    const cfg = setupConfigRef.current;
    const SEMI_AUTO_IDS = Object.entries(cfg)
      .filter(([, v]) => v?.semiAuto === true && v?.enabled !== false)
      .flatMap(([id]) => [`${id}_bull`, `${id}_bear`,
                          `${id}_vwap_reclaim_bull`, `${id}_vwap_reclaim_bear`,
                          `${id}_ema_cross_bull`, `${id}_ema_cross_bear`,
                          `${id}_orb_bull`, `${id}_orb_bear`,
                          `${id}_engulf_bull`, `${id}_engulf_bear`,
                          `${id}_bb_bull`, `${id}_bb_bear`,
                          `${id}_flag_bull`, `${id}_flag_bear`]);

    const placeSetupEyeOrder = async (entry) => {
      // Test mode: simulate placement without hitting the API
      if (entry.isTest) {
        setSetupEyePlaced(prev => ({ ...prev, [entry.time]: { ok: true, symbol: 'NIFTY25APR22000CE [TEST]', limitPrice: 120, strike: 22000, optionType: 'CE' } }));
        setActiveTrade({ symbol: 'NIFTY25APR22000CE [TEST]', strike: 22000, optionType: 'CE', limitPrice: 120, qty: 65, direction: 'bull', setupName: 'ORB Breakout [TEST]', slLevel: 21950, entryClose: 22020 });
        setTradeLTP(120);
        setTradeExited(null);
        return;
      }
      setSetupEyePlacing(entry.time);
      try {
        const res  = await fetch('/api/setup-eye/place', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            niftyPrice: entry.candle.close,
            direction:  entry.topSetup.pattern.direction,
            qty:        semiAutoQty,
            niftySl:    entry.topSetup.pattern.sl ?? null,
          }),
        });
        const data = await res.json();
        setSetupEyePlaced(prev => ({ ...prev, [entry.time]: data }));
        if (data.ok) {
          setActiveTrade({
            symbol:     data.symbol,
            strike:     data.strike,
            optionType: data.optionType,
            limitPrice: data.entryLimit ?? data.limitPrice,
            qty:        semiAutoQty,
            direction:  entry.topSetup.pattern.direction,
            setupName:  entry.topSetup.pattern.name,
            slLevel:    entry.topSetup.pattern.sl ?? null,
            entryClose: entry.candle.close,
          });
          setTradeLTP(data.limitPrice);
          setTradeExited(null);
        }
      } catch (err) {
        setSetupEyePlaced(prev => ({ ...prev, [entry.time]: { error: err.message } }));
      } finally {
        setSetupEyePlacing(null);
      }
    };

    const exitSetupEyeTrade = async () => {
      if (!activeTrade) return;
      // Test mode: simulate exit without hitting the API
      if (activeTrade.symbol.includes('[TEST]')) {
        setTradeExited({ ok: true, orderId: 'TEST-EXIT-000' });
        setActiveTrade(null);
        return;
      }
      setTradeExiting(true);
      try {
        const res  = await fetch('/api/setup-eye/exit', {
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
                             's11_ib_bull','s11_ib_bear','s18_bb_bull','s18_bb_bear',
                             's19_flag_bull','s19_flag_bear']);

    // Compute ATM strike + weekly/monthly label from a Nifty price (client-side, mirrors place/route.js)
    function getAtmInfo(niftyPrice) {
      const strike = Math.round(niftyPrice / 50) * 50;
      const istMs  = Date.now() + 5.5 * 60 * 60 * 1000;
      const ist    = new Date(istMs);
      const day    = ist.getUTCDay();
      let daysToTue = (2 - day + 7) % 7;
      if (daysToTue === 0) {
        const h = ist.getUTCHours(), m = ist.getUTCMinutes();
        if (h > 15 || (h === 15 && m >= 20)) daysToTue = 7;
      }
      const expIst  = new Date(istMs + daysToTue * 86400000);
      const expYear = expIst.getUTCFullYear();
      const expMonth = expIst.getUTCMonth();
      const expDay  = expIst.getUTCDate();
      // Last Tuesday of the month
      let lastTue = new Date(Date.UTC(expYear, expMonth + 1, 0));
      while (lastTue.getUTCDay() !== 2) lastTue.setUTCDate(lastTue.getUTCDate() - 1);
      const isMonthly = lastTue.getUTCDate() === expDay;
      const dd = String(expDay).padStart(2, '0');
      const mm = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][expMonth];
      return { strike, isMonthly, expiryLabel: isMonthly ? `${dd} ${mm} Monthly` : `${dd} ${mm} Weekly` };
    }

    // Setup Eye: bias-persistent, trader inner-monologue narrative builder.
    // Speaks as an experienced trader watching the screen — position-aware, continuous,
    // action-oriented. NOT a pattern scanner announcement. Tracks quiet candle count
    // to distinguish "1st candle after entry" vs "3 candles consolidating".
    // Returns: { narrative, nextBias, nextDir, alertUI }
    const runBuildNarrative = (entry, sysBias, sysLastDir) => {
      const { topSetup: s, context: c, candle, rawPatterns = [] } = entry;
      let nextBias = sysBias;
      let nextDir  = sysLastDir;
      let alertUI  = false;

      const ret = (narrObj) => ({ narrative: narrObj, nextBias, nextDir, alertUI });

      const isSpotIndexChart = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX']
        .includes(String(chartSymbol || '').toUpperCase());

      // VWAP proximity helpers
      const atVwap      = c.vwap?.atVwap;
      const nearVwap    = c.vwap && c.vwap.distPct != null && c.vwap.distPct <= 0.25;
      const vwapPct     = c.vwap?.distPct != null ? c.vwap.distPct.toFixed(1) : null;
      const aboveVwap   = c.vwap?.above;
      const vwapHint    = atVwap ? 'right at VWAP' : nearVwap ? `near VWAP (${vwapPct}% away)` : null;

      // ── Reality check: auto-reset stale bias when market context clearly contradicts it ──
      // A human observer drops a bearish bias the moment price is in an uptrend above VWAP,
      // and drops a bullish bias when price is in a downtrend below VWAP.
      let effectiveBias = sysBias;
      if (sysBias === 'bear' && c.trend === 'uptrend' && aboveVwap === true) {
        effectiveBias = 'neutral';
        nextBias = 'neutral';
        nextDir  = null;
      } else if (sysBias === 'bull' && c.trend === 'downtrend' && aboveVwap === false) {
        effectiveBias = 'neutral';
        nextBias = 'neutral';
        nextDir  = null;
      }

      const inLong  = effectiveBias === 'bull';
      const inShort = effectiveBias === 'bear';
      const flat    = effectiveBias === 'neutral';

      // ── Opening / closing session gates ─────────────────────────────────
      if (c.sessionTime === 'opening') {
        quietCandleCountRef.current = 0;
        const posNote = inLong ? ' Long from yesterday — watching open.' : inShort ? ' Short from yesterday — watching open.' : '';
        return ret({ type: 'wait', action: 'WAIT', headline: 'First candle still forming — standing aside', reason: `Don\'t act on the first candle.${posNote} Wait for it to close cleanly.` });
      }
      if (c.sessionTime === 'closing') {
        return ret({ type: 'caution', action: 'WRAP UP', headline: 'Last 30 minutes — start wrapping up', reason: inLong || inShort ? 'Trail stop tight or close out. No new entries this late.' : 'Stay out. Don\'t open fresh positions in the last half hour.' });
      }

      // ── CHoCH / Wyckoff: hard structure flip ─────────────────────────────
      if (s) {
        const id = s.pattern.id;
        if (id === 's13_choch_bull' || id === 's16_spring') {
          const wasShort = inShort;
          nextBias = 'bull'; nextDir = null; alertUI = true;
          quietCandleCountRef.current = 0;
          return ret({
            type: 'exit', direction: 'bull', action: wasShort ? 'CLOSE SHORT' : 'FLIP LONG',
            headline: wasShort
              ? 'That move just broke structure to the upside — close the short'
              : 'Structure shifted bullish — looking for a long entry',
            reason: wasShort
              ? `${s.pattern.name}. The downtrend is broken. Take the loss, reassess. Bias now bullish.`
              : `${s.pattern.name}. Clean change of character. Waiting for a pullback to enter long.`,
          });
        }
        if (id === 's13_choch_bear' || id === 's16_upthrust') {
          const wasLong = inLong;
          nextBias = 'bear'; nextDir = null; alertUI = true;
          quietCandleCountRef.current = 0;
          return ret({
            type: 'exit', direction: 'bear', action: wasLong ? 'CLOSE LONG' : 'FLIP SHORT',
            headline: wasLong
              ? 'Uptrend structure just broke — close the long'
              : 'Structure shifted bearish — looking for a short entry',
            reason: wasLong
              ? `${s.pattern.name}. Bulls couldn\'t hold it. Exit the long, bias now bearish.`
              : `${s.pattern.name}. Trend rolling over. Waiting for a bounce to get short.`,
          });
        }
      }

      // ── Confirmed counter-trend BOS: hard exit ────────────────────────────
      if (c.bos && !c.bos.freshBreak) {
        if (c.bos.type === 'bear' && inLong) {
          nextBias = 'neutral'; nextDir = null;
          quietCandleCountRef.current = 0;
          return ret({ type: 'exit', direction: 'bear', action: 'CLOSE LONG',
            headline: 'Swing low taken out and held — the uptrend is broken',
            reason: `That\'s a confirmed BOS to the downside. Long bias is gone. Exiting. Waiting to see what happens next.` });
        }
        if (c.bos.type === 'bull' && inShort) {
          nextBias = 'neutral'; nextDir = null;
          quietCandleCountRef.current = 0;
          return ret({ type: 'exit', direction: 'bull', action: 'CLOSE SHORT',
            headline: 'Swing high broken and closed above — downtrend is over',
            reason: `Reversal confirmed. Covering shorts. Not chasing a long yet — need to see the next move first.` });
        }
      }

      // ── Fresh BOS against bias: heads up, don't exit yet ─────────────────
      if (c.bos?.freshBreak) {
        if (c.bos.type === 'bear' && inLong) {
          return ret({ type: 'watch', direction: 'bear', action: 'HEADS UP',
            headline: 'Just broke below a swing low — could be a trap',
            reason: `One candle. Not acting yet. If next candle closes below too, that\'s a real break. Tightening stop.` });
        }
        if (c.bos.type === 'bull' && inShort) {
          return ret({ type: 'watch', direction: 'bull', action: 'HEADS UP',
            headline: 'Pushed above a swing high — watching if it holds',
            reason: `Could just be a stop hunt. Watching next candle. Short bias still intact until confirmed.` });
        }
      }

      // ── Strong setup (score ≥ 6) ─────────────────────────────────────────
      if (s && s.score >= 6) {
        const dir  = s.pattern.direction;
        const id   = s.pattern.id;
        const trendAligned = (c.trend === 'uptrend' && dir === 'bull') ||
                             (c.trend === 'downtrend' && dir === 'bear') ||
                             c.trend === 'ranging';
        const vwapAligned  = c.vwap ? (dir === 'bull' ? aboveVwap : !aboveVwap) : null;
        const biasAligned  = sysBias === dir || flat;

        // Counter-bias strong setup
        if (!biasAligned) {
          const posLabel = inLong ? 'long' : 'short';
          if (s.score >= 8) {
            return ret({
              type: 'caution', direction: dir,
              action: dir === 'bull' ? 'TIGHTEN STOP' : 'TIGHTEN STOP',
              headline: dir === 'bull'
                ? `Strong bounce — ${inShort ? 'be careful with that short' : 'bulls are pushing hard'}`
                : `Hard selloff — ${inLong ? 'be careful with that long' : 'bears taking control'}`,
              reason: `${s.pattern.name} · score ${s.score}/10. Too strong to ignore${vwapHint ? `, happening ${vwapHint}` : ''}. Trail the stop on that ${posLabel} — don\'t add, don\'t flip yet.`,
            });
          }
          return ret({
            type: 'caution', direction: dir,
            action: 'STAY PATIENT',
            headline: dir === 'bull'
              ? `Bounce attempt — but I\'m still ${inShort ? 'short' : 'neutral'}, not chasing`
              : `Pullback forming — but I\'m still ${inLong ? 'long' : 'neutral'}, not flipping`,
            reason: `${s.pattern.name}${vwapHint ? ` ${vwapHint}` : ''}. Doesn\'t change my view yet. Need a structural shift before acting.`,
          });
        }

        if (flat) nextBias = dir;

        if (!trendAligned && vwapAligned === false) {
          return ret({
            type: 'caution', direction: dir,
            action: dir === 'bull' ? 'WAIT — VWAP' : 'WAIT — VWAP',
            headline: dir === 'bull'
              ? 'Setup there but price is below VWAP — not ideal'
              : 'Setup there but price is above VWAP — not ideal',
            reason: `${s.pattern.name}. ${dir === 'bull' ? 'Want to see VWAP reclaimed before going long.' : 'Need VWAP to break before shorting.'}${vwapPct ? ` ${vwapPct}% away.` : ''}`,
          });
        }

        const hasPriorEntry = sysLastDir === dir;
        const isFirstEntry  = !hasPriorEntry;
        quietCandleCountRef.current = 0;
        nextDir = dir;

        // Build concise context — just the 1-2 most meaningful facts
        const ctxParts = [];
        if (vwapHint) ctxParts.push(vwapHint);
        const isStructureSetup = id === 's9_sr_flip' || id === 's1_bos_ob_retest';
        if (!isStructureSetup && c.orderBlock) ctxParts.push('order block nearby');
        if (!isSpotIndexChart && c.volume?.mult >= 1.5) ctxParts.push(`${c.volume.mult}× volume`);
        if (dir === 'bull' && c.rsi != null && c.rsi < 35) ctxParts.push(`RSI oversold (${Math.round(c.rsi)})`);
        if (dir === 'bear' && c.rsi != null && c.rsi > 65) ctxParts.push(`RSI overbought (${Math.round(c.rsi)})`);
        if (trendAligned && c.trend !== 'ranging') ctxParts.push(`${c.trend}`);
        const ctxStr = ctxParts.length ? ` — ${ctxParts.join(', ')}` : '';

        if (isFirstEntry) {
          return ret({
            type: 'entry', subType: 'fresh', direction: dir,
            action: dir === 'bull' ? 'TAKE LONG' : 'TAKE SHORT',
            headline: dir === 'bull'
              ? `Taking long — setup confirmed${flat ? '' : ', bias already bullish'}`
              : `Taking short — setup confirmed${flat ? '' : ', bias already bearish'}`,
            reason: `${s.pattern.name}${ctxStr}. Score ${s.score}/10. Let\'s see if it follows through.`,
          });
        } else {
          return ret({
            type: 'entry', subType: 'cont', direction: dir,
            action: dir === 'bull' ? 'STAY LONG' : 'STAY SHORT',
            headline: dir === 'bull'
              ? 'Another long setup — bias is holding, adding confidence'
              : 'Another short setup — bias holding, confirming the move',
            reason: `${s.pattern.name}${ctxStr}. Score ${s.score}/10. This one\'s reinforcing the position.`,
          });
        }
      }

      // ── Watch-level setup (score 3–5) ─────────────────────────────────────
      if (s && s.score >= 3) {
        const dir = s.pattern.direction;
        const biasNote = inLong ? 'long' : inShort ? 'short' : null;

        if (sysBias !== 'neutral' && dir !== sysBias) {
          // Counter-bias weak signal — warn but hold
          quietCandleCountRef.current++;
          const qc = quietCandleCountRef.current;
          return ret({
            type: 'watch', direction: dir, action: 'WATCH',
            headline: dir === 'bull'
              ? `Reversal attempting${vwapHint ? ` — ${vwapHint}` : ''} — be careful${inShort ? ' with that short' : ''}`
              : `Pullback showing — watch if it holds${inLong ? ', don\'t panic out' : ''}`,
            reason: `${s.pattern.name} (score ${s.score}) — not strong enough to act on. ${qc >= 2 ? `${qc} candles now without follow-through.` : 'Watching next candle.'} ${biasNote ? `Keeping ${biasNote} for now.` : ''}`,
          });
        }
        if (flat) nextBias = dir;
        quietCandleCountRef.current = 0;
        return ret({
          type: 'watch', direction: dir, action: 'WATCHING',
          headline: dir === 'bull'
            ? (inLong ? 'Another long signal forming — supporting the bias' : 'Possible long setting up, not in yet')
            : dir === 'bear'
              ? (inShort ? 'Another short signal forming — supporting the bias' : 'Possible short setting up, not in yet')
              : 'Setup forming — waiting for confirmation',
          reason: `${s.pattern.name}${vwapHint ? ` ${vwapHint}` : ''} — score ${s.score}/10, needs one more candle to confirm.`,
        });
      }

      // ── No setup ──────────────────────────────────────────────────────────
      quietCandleCountRef.current++;
      const qc      = quietCandleCountRef.current;
      const isBull  = candle.close > candle.open;
      const cRange  = candle.high - candle.low;
      const cBody   = Math.abs(candle.close - candle.open);
      const bodyRatio = cRange > 0 ? cBody / cRange : 0;
      const atr       = c.atr14;
      const upperWick = cRange > 0 ? (candle.close >= candle.open ? candle.high - candle.close : candle.high - candle.open) / cRange : 1;
      const lowerWick = cRange > 0 ? (candle.close >= candle.open ? candle.open - candle.low  : candle.close - candle.low) / cRange : 1;
      const isPower   = bodyRatio >= 0.75 && upperWick <= 0.12 && lowerWick <= 0.12 && atr != null && cRange >= atr * 1.5;

      // Power candle — even without a setup tag
      if (isPower) {
        const dir = isBull ? 'bull' : 'bear';
        const biasAligned = sysBias === dir || flat;
        if (flat) nextBias = dir;
        quietCandleCountRef.current = 0;
        const atrMult = (cRange / atr).toFixed(1);
        if (biasAligned) {
          return ret({
            type: 'watch', direction: dir,
            action: isBull ? 'STRONG MOVE' : 'STRONG MOVE',
            headline: isBull
              ? 'Strong bull candle — momentum is there, watching for entry'
              : 'Strong bear candle — momentum is there, watching for entry',
            reason: `${(Math.abs((candle.close - candle.open) / candle.open * 100)).toFixed(2)}% body, ${atrMult}× ATR${vwapHint ? `, ${vwapHint}` : ''}. ${isBull ? 'Dips close to here are worth watching.' : 'Rallies back here are worth watching.'}`,
          });
        } else {
          return ret({
            type: 'caution', direction: dir,
            action: 'HEADS UP',
            headline: isBull
              ? `Strong bull candle against my ${inShort ? 'short' : 'view'} — keeping an eye on this`
              : `Strong bear candle against my ${inLong ? 'long' : 'view'} — keeping an eye on this`,
            reason: `${atrMult}× ATR candle. Not flipping yet but not ignoring it either. Trail stop${inLong || inShort ? ' on position' : ''}.`,
          });
        }
      }

      // Volume climax
      if (c.volume.context === 'climax') {
        return ret({ type: 'watch', action: 'VOLUME SPIKE',
          headline: isBull
            ? `Big volume on that up candle${vwapHint ? ` — ${vwapHint}` : ''} — possible exhaustion`
            : `Heavy selling volume${vwapHint ? ` — ${vwapHint}` : ''} — could be a washout`,
          reason: `${c.volume.mult}× normal volume with wicks. Often signals a turn coming. ${inLong || inShort ? 'Not exiting yet but watching closely.' : 'Waiting to see the reaction.'}` });
      }

      // VWAP approach while in a position — specific commentary
      if ((inLong || inShort) && nearVwap) {
        // "approaching": price is moving toward VWAP from the wrong side for the position
        // inLong + below VWAP = pulled back below VWAP (bad)
        // inShort + above VWAP = price recovered above VWAP (bad for short)
        const approaching = inLong ? !aboveVwap : aboveVwap;
        if (approaching) {
          return ret({ type: 'caution', action: 'VWAP WATCH',
            headline: inShort
              ? `Price recovered above VWAP — short is at risk near VWAP`
              : `Pulled back below VWAP — hold tight, this is the test`,
            reason: `${vwapHint}. ${inShort ? 'Price is now above VWAP — that\'s a concern for the short. Watch if it holds above next candle.' : 'If this holds VWAP as support, the long is fine. If it breaks, reassess.'}` });
        }
        // Just crossed VWAP
        const crossedFavorably = (inShort && !aboveVwap) || (inLong && aboveVwap);
        if (crossedFavorably) {
          return ret({ type: 'watch', action: 'VWAP CLEARED',
            headline: inShort
              ? 'Broke below VWAP — short working, stay with it'
              : 'Reclaimed VWAP — long holding, good sign',
            reason: `${vwapHint}. That was the key level. ${inShort ? 'Bears in control now, ride it.' : 'Bulls back in control. Keep the long.'}` });
        }
      }

      // Quiet candles while in a position
      if (inLong) {
        if (qc === 1) {
          return ret({ type: 'quiet', action: 'IN LONG',
            headline: isBull ? 'First candle after entry — moving in the right direction' : 'First candle after entry — minor pullback, not worried',
            reason: `${c.volume.context === 'dryup' ? 'Low volume — market just digesting.' : `Vol ${c.volume.mult}×.`} Keeping the long. Let it breathe.` });
        }
        if (qc <= 3) {
          const note = isBull ? 'grinding higher quietly' : 'little dip, not unusual';
          return ret({ type: 'quiet', action: 'HOLD LONG',
            headline: `${qc} candles since entry — ${note}, staying in`,
            reason: `${c.volume.context === 'dryup' ? 'Volume drying up — consolidation.' : `Vol ${c.volume.mult}×.`} No reason to exit. Waiting for the move to develop.` });
        }
        return ret({ type: 'quiet', action: 'HOLD LONG',
          headline: `${qc} candles consolidating — longs on, observing`,
          reason: `Market pausing. ${c.volume.context === 'dryup' ? 'Volume dry — typical consolidation before next leg.' : `Vol ${c.volume.mult}×.`} Stop is on. No action needed right now.` });
      }

      if (inShort) {
        if (qc === 1) {
          return ret({ type: 'quiet', action: 'IN SHORT',
            headline: !isBull ? 'First candle after entry — moving in the right direction' : 'First candle after entry — tiny bounce, not worried yet',
            reason: `${c.volume.context === 'dryup' ? 'Low volume — just settling.' : `Vol ${c.volume.mult}×.`} Keeping the short. Give it room.` });
        }
        if (qc <= 3) {
          const note = !isBull ? 'grinding lower, good' : 'small bounce, staying patient';
          return ret({ type: 'quiet', action: 'HOLD SHORT',
            headline: `${qc} candles since entry — ${note}`,
            reason: `${c.volume.context === 'dryup' ? 'Volume drying up.' : `Vol ${c.volume.mult}×.`} Short is working. No action — let it run.` });
        }
        return ret({ type: 'quiet', action: 'HOLD SHORT',
          headline: `${qc} candles consolidating — shorts on, let it breathe`,
          reason: `Market pausing. ${c.volume.context === 'dryup' ? 'Volume dry — usual before next leg down.' : `Vol ${c.volume.mult}×.`} Stop is in. Just observing.` });
      }

      // Flat — no position, no setup

      // RSI extreme while flat AND price is right at VWAP (≤0.15%) — worth flagging
      if (flat && atVwap) {
        if (c.rsi != null && c.rsi <= 35) {
          return ret({ type: 'watch', action: 'WATCH',
            headline: 'RSI oversold at VWAP — possible bounce zone',
            reason: `RSI ${Math.round(c.rsi)} deeply oversold, price right at VWAP. No entry yet — wait for a bullish candle to confirm before considering a long.` });
        }
        if (c.rsi != null && c.rsi >= 65) {
          return ret({ type: 'watch', action: 'WATCH',
            headline: 'RSI overbought at VWAP — possible rejection zone',
            reason: `RSI ${Math.round(c.rsi)} stretched, price right at VWAP. No short yet — wait for a bearish candle to confirm before considering a short.` });
        }
      }

      if (c.volume.context === 'dryup') {
        return ret({ type: 'quiet', action: 'FLAT',
          headline: 'Volume dried up — nothing happening, staying out',
          reason: `Low participation${vwapHint ? `, price ${vwapHint}` : ''}${c.rsi != null ? ` · RSI ${Math.round(c.rsi)}` : ''}. Market digesting. Waiting for a setup.` });
      }

      // Describe where price IS (intraday VWAP context) rather than multi-day trend label
      const vwapCtx  = aboveVwap ? 'above VWAP' : c.vwap ? 'below VWAP' : null;
      const rsiCtx   = c.rsi != null ? ` · RSI ${Math.round(c.rsi)}` : '';
      const volCtx   = c.volume.context === 'high' ? ` · vol ${c.volume.mult}×` : '';
      const headline = vwapCtx
        ? `${isBull ? 'Up' : 'Down'} candle, ${vwapCtx} — no setup yet`
        : `${isBull ? 'Up' : 'Down'} candle — no clear setup`;
      const reason   = `${vwapHint ? `Price ${vwapHint}` : (vwapCtx ?? 'No VWAP data')}${rsiCtx}${volCtx}. ${
        c.trend === 'ranging' ? 'Market ranging.' : c.trend === 'uptrend'
          ? (aboveVwap ? 'Uptrend, price holding above VWAP.' : 'Uptrend but below VWAP — soft.')
          : (aboveVwap ? 'Longer-term trend down but price above VWAP today — mixed.' : 'Trend down, price below VWAP.')
      } Waiting for a setup.`;
      return ret({ type: 'quiet', action: 'FLAT — WAITING', headline, reason });
    };

    // Exit a conflicting position via market order
    const exitConflictingPosition = async (position) => {
      setExitingSymbol(position.tradingsymbol);
      setExitResult(null);
      try {
        const qty = Math.abs(position.quantity);
        const res = await fetch('/api/setup-eye/exit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: position.tradingsymbol, qty }),
        });
        const data = await res.json();
        if (data.ok) {
          setExitResult({ ok: true, symbol: position.tradingsymbol });
          // Refresh positions after exit
          setTimeout(checkPositionsAgainstBias, 2000);
        } else {
          setExitResult({ ok: false, error: data.error || 'Exit failed' });
        }
      } catch (e) {
        setExitResult({ ok: false, error: e.message });
      } finally {
        setExitingSymbol(null);
      }
    };

    return (
      <div className="min-h-screen bg-[#060b14] text-slate-100">
        <Nav />

        {/* ── Short Covering Setup Card ─────────────────────────────────────── */}
        <ShortCoveringBanner
          scData={scData}
          scDismissed={scDismissed}
          setScDismissed={setScDismissed}
          scConfirming={scConfirming}
          setScConfirming={setScConfirming}
          scPlacing={scPlacing}
          scOrderResult={scOrderResult}
          kiteAuth={kiteAuth}
          onPlaceScOrder={handleScPlaceOrder}
        />

        {/* ── Position Conflict Banner ───────────────────────────────────────── */}
        <PositionConflictBanner
          positionAlert={positionAlert}
          positionAlertDismissedBias={positionAlertDismissedBias}
          setPositionAlertDismissedBias={setPositionAlertDismissedBias}
          exitingSymbol={exitingSymbol}
          exitResult={exitResult}
          onExitPosition={exitConflictingPosition}
        />

        {/* Sub-bar: Kite status + quick links */}
        <div className="border-b border-white/5 bg-[#060b14]">
          <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between">
            {/* Notification permission button — shown until granted */}
            {notifPermission !== 'granted' && (
              notifPermission === 'denied' ? (
                <a
                  href="chrome://settings/content/notifications"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-slate-600/50 bg-slate-800/60 text-slate-500 hover:text-slate-400 transition-colors"
                  title="Notifications blocked — open Chrome settings to allow"
                  onClick={e => { e.preventDefault(); window.open('chrome://settings/content/notifications'); }}
                >
                  🔔 Notifications blocked
                </a>
              ) : (
                <button
                  onClick={requestNotifPermission}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                  title="Allow browser notifications for SC alerts"
                >
                  🔔 Enable alerts
                </button>
              )
            )}

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
                { href: '/terminal',          label: 'Terminal'    },
                { href: '/trades/pre-market', label: 'Pre-Market' },
                { href: '/trades/journal',    label: 'Journal'    },
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
              /* No commentary — distinguish truly closed vs no-data-yet */
              <div className="p-4 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" />
                {isMarketHours()
                  ? <span className="text-sm text-slate-400">Fetching market summary…</span>
                  : <span className="text-sm text-slate-400">Market closed — summary available during trading hours (9:15 AM – 4:00 PM IST)</span>
                }
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
                  {commentaryLastUpdated && !commentaryLoading && (
                    <span className="hidden sm:flex items-center gap-1.5 text-[10px] text-slate-500 tabular-nums">
                      <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse-slow" />
                      {commentaryLastUpdated}
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
                const IST_OFFSET_MS = 5.5 * 3600 * 1000;
                const candleDateIST = new Date(pc.time * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10);
                const todayIST      = new Date(Date.now()   + IST_OFFSET_MS).toISOString().slice(0, 10);
                if (candleDateIST !== todayIST) return null;
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
                        {isBull ? 'Bullish' : 'Bearish'} power candle — {pc.volMult != null ? `Vol ${pc.volMult}× avg, ` : ''}Range {pc.rangeMult}× ATR.
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
                        <span className="text-[9px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse-slow" />
                          {new Date(sentimentData.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
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
                      <option value="SENSEX">SENSEX</option>
                      <option value="NIFTYFUT">NIFTY FUT</option>
                      <option value="BANKNIFTYFUT">BANKNIFTY FUT</option>
                      <option value="SENSEXFUT">SENSEX FUT</option>
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
                        <div className="absolute top-full left-0 mt-1 z-50 bg-[#0d1f38] border border-blue-800/50 rounded-xl shadow-2xl p-3 w-56">
                          {/* Overlays */}
                          <div className="mb-2.5">
                            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5">Overlays</div>
                            <div className="flex flex-col gap-1.5">
                              {/* EMA row with gear */}
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <div
                                    onClick={() => setEmaPeriods(prev => prev.length > 0 ? [] : [9, 21])}
                                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors cursor-pointer ${emaPeriods.length > 0 ? 'bg-blue-600 border-blue-500' : 'bg-transparent border-slate-600'}`}
                                  >
                                    {emaPeriods.length > 0 && (
                                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-slate-200">EMA</div>
                                    <div className="text-[10px] text-slate-500 truncate">
                                      {emaPeriods.length > 0 ? emaPeriods.sort((a,b)=>a-b).join(', ') : 'none active'}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => setShowEmaConfig(v => !v)}
                                    className={`p-1 rounded transition-colors ${showEmaConfig ? 'text-amber-400 bg-amber-900/30' : 'text-slate-500 hover:text-slate-300'}`}
                                    title="Configure EMA periods"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                  </button>
                                </div>
                                {/* EMA config sub-panel */}
                                {showEmaConfig && (
                                  <div className="mt-2 ml-6 p-2 bg-black/30 rounded-lg border border-white/10">
                                    <div className="text-[10px] text-amber-400 font-semibold mb-1.5">Select periods</div>
                                    <div className="grid grid-cols-3 gap-1">
                                      {[9, 21, 50, 100, 169, 200].map((period) => {
                                        const active = emaPeriods.includes(period);
                                        return (
                                          <button
                                            key={period}
                                            onClick={() => setEmaPeriods(prev => active ? prev.filter(p => p !== period) : [...prev, period])}
                                            className="flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] font-mono font-medium transition-colors"
                                            style={active ? { color: EMA_COLORS[period], backgroundColor: EMA_COLORS[period] + '22', border: `1px solid ${EMA_COLORS[period]}55` } : { color: '#64748b', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                                          >
                                            {active && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: EMA_COLORS[period] }} />}
                                            {period}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                              {/* Other overlays */}
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
                      href={`https://www.tradingview.com/chart/?symbol=${chartSymbol === 'BANKNIFTYFUT' ? 'NSE:BANKNIFTY1!' : chartSymbol === 'NIFTYFUT' ? 'NSE:NIFTY1!' : chartSymbol === 'SENSEXFUT' ? 'BSE:SENSEX1!' : chartSymbol === 'BANKNIFTY' ? 'NSE:BANKNIFTY' : chartSymbol === 'SENSEX' ? 'BSE:SENSEX' : 'NSE:NIFTY'}&interval=${chartInterval === 'day' ? 'D' : chartInterval === 'week' ? 'W' : chartInterval.replace('minute', '')}`}
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
                  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
                  const candleDateIST = new Date(pc.time * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10);
                  const todayIST      = new Date(Date.now()   + IST_OFFSET_MS).toISOString().slice(0, 10);
                  if (candleDateIST !== todayIST) return null;
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
                        {pc.volMult != null ? `Vol ${pc.volMult}× avg · ` : ''}Range {pc.rangeMult}× ATR
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
                          {emaPeriods.map((period) => {
                            const val = hoverLineValues[`ema${period}`];
                            return val != null ? (
                              <span key={period} style={{ color: EMA_COLORS[period] ?? '#f59e0b' }}>EMA{period} {val.toFixed(2)}</span>
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
              <ThirdEyePanel />

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
            <OptionsAnalysisPanel
              chainData={optionChainData}
              scData={scData}
              scLastUpdated={scLastUpdated}
              loading={optionLoading}
              underlying={optionUnderlying}
              expiry={optionExpiry}
              onRefresh={() => fetchOptionChain(true)}
              onUnderlyingChange={setOptionUnderlying}
              onExpiryChange={setOptionExpiry}
            />
       

          </div>
        </main>
      </div>
    );
  }