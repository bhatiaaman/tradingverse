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

    // ── Restore Pride Cleanup: Consolidate intelligence alerts ────────────────
    const latestPowerCandle = powerCandles.length > 0 ? powerCandles[powerCandles.length - 1] : null;
    const isPowerCandleActive = latestPowerCandle && powerCandleDismissed !== latestPowerCandle.time;

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

    // Third Eye state
    const [thirdEyeData, setThirdEyeData] = useState(null);
    const [thirdEyeLog, setThirdEyeLog]   = useState([]);   // rolling candle log
    const [scanStatus, setScanStatus]     = useState(null); // { lastTime, pushed, errors }
    const [thirdEyeEnv, setThirdEyeEnv]   = useState('medium');
    const [thirdEyeOpen, setThirdEyeOpen] = useState(true);
    const [thirdEyePlacing, setThirdEyePlacing] = useState(null);  // entry.time being placed
    const [thirdEyePlaced,  setThirdEyePlaced]  = useState({});    // { [entry.time]: result }
    const [thirdEyeMode,    setThirdEyeMode]    = useState('semi'); // 'semi' | 'auto' (auto = coming soon)
    const [activeTrade,     setActiveTrade]     = useState(null);   // placed trade object
    const [tradeLTP,        setTradeLTP]        = useState(null);   // live option LTP
    const [semiAutoQty,     setSemiAutoQty]     = useState(65);     // user-editable qty for semi-auto orders
    const [tradeExiting,    setTradeExiting]    = useState(false);
    const [tradeExited,     setTradeExited]     = useState(null);   // exit result
    const [thirdEyeLive,    setThirdEyeLive]    = useState(null);   // current forming candle (updates every 30s)
    const [thirdEyeTestMode, setThirdEyeTestMode] = useState(false); // Ctrl+Shift+T toggles test card
    const [leftTab, setLeftTab]           = useState('sectors');
    const thirdEyeEnvRef      = useRef('medium');
    const setupConfigRef      = useRef({});
    const lastCandleTimeRef   = useRef(''); // 'HH:MM' of last logged candle
    // Cooldown for system log: { "symbol|tf|setupId": lastLoggedEpochMs }
    // Prevents the same setup on the same level from flooding the log on every candle.
    const lastSetupLogRef     = useRef({});
    // Counts consecutive "no setup" candles in the same bias — drives consolidation commentary.
    const quietCandleCountRef = useRef(0);

    // ── Server-side bias state (Phase 1 rebuild) ──────────────────────────────
    // Source of truth for bias — lives in Redis, persists across page refreshes.
    // biasRef is kept as a fallback for position-conflict check compatibility.
    const [serverBiasState, setServerBiasState] = useState(null); // { bias, since, pendingFlip }
    const [liveTick, setLiveTick] = useState(null); // { ltp, change, vwapDist, aboveVwap } from 10s tick

    // Restore Third Eye log from Redis on mount → now handled by /api/third-eye/scan.
    // Keeps backward compat: also loads from /api/third-eye/log for immediate display
    // while scan initializes.
    useEffect(() => {
      fetch('/api/third-eye/log')
        .then(r => r.json())
        .then(d => {
          if (!d.entries?.length) return;
          const ist    = new Date(Date.now() + 5.5 * 3600 * 1000);
          const nowStr = `${String(ist.getUTCHours()).padStart(2,'0')}:${String(ist.getUTCMinutes()).padStart(2,'0')}`;
          const todayEntries = d.entries.filter(e => e.time && e.time <= nowStr);
          if (!todayEntries.length) return;
          setThirdEyeLog(todayEntries);
          if (todayEntries[0]?.time) lastCandleTimeRef.current = todayEntries[0].time;
        })
        .catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Server-side scan polling (primary bias + log source) ─────────────────
    // Polls /api/third-eye/scan every 30s during market hours.
    // Writes bias to serverBiasState (and syncs biasRef for backward compat).
    // Log from server overwrites client log (server is source of truth).
    useEffect(() => {
      let scanTimer;

      const runScan = async () => {
        if (!isMarketHours()) return;
        try {
          const res = await fetch('/api/third-eye/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol:   chartSymbol,
              interval: chartInterval,
              env:      thirdEyeEnvRef.current,
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
            setThirdEyeLog(data.log);
            if (data.log[0]?.time) lastCandleTimeRef.current = data.log[0].time;
          }

          // Update live card from server
          if (data.live) {
            setThirdEyeLive(data.live);
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
          const res  = await fetch(`/api/third-eye/tick?symbol=${chartSymbol}`);
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
        try {
          const r = await fetch(`/api/short-covering${isSilent ? '' : '?refresh=1'}`);
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
            quantity:         75,
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

    // Fetch commentary (used by both interval and manual refresh button)
    const fetchCommentaryNow = useCallback(async (forceRefresh = false) => {
      setCommentaryLoading(true);
      try {
        const params = new URLSearchParams({ interval: chartInterval });
        if (forceRefresh) params.set('refresh', '1');
        const response = await fetch(`/api/market-commentary?${params}`);
        const data = await response.json();
        const next = data.commentary;
        const prev = prevCommentaryRef.current;

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
        setCommentaryLoading(false);
      }
    }, [chartInterval]); // re-fetch when TF changes

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

            // Third Eye scan — only meaningful during live market hours
            if (!isMarketHours()) {
              setThirdEyeData(null);
              setThirdEyeLive(null);
            }
            if (!isMarketHours()) return; // skip scan + live card outside hours

            try {
              const { runThirdEye } = await import('@/app/lib/thirdEye.js');
              const vwapForHE  = customVwapDataRef.current;
              const rsiVal     = rsiData[rsiData.length - 1]?.value ?? null;
              const heResult   = runThirdEye(data.candles, vwapForHE, rsiVal, thirdEyeEnvRef.current, setupConfigRef.current);
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
                      const result = runThirdEye(candlesUpTo, vwapForHE, rsiVal, thirdEyeEnvRef.current, setupConfigRef.current);
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

                      // Push strong setups to permanent system log (with cooldown)
                      if (topSetup?.score >= 6 && topSetup?.pattern?.name) {
                        const cooldownKey = `${chartSymbol}|${chartInterval}|${topSetup.pattern.id}`;
                        const intervalMs  = (chartInterval === '15minute' ? 15 : chartInterval === '3minute' ? 3 : 5) * 60 * 1000;
                        const cooldownMs  = intervalMs * 8;
                        const lastLoggedMs  = lastSetupLogRef.current[cooldownKey] ?? 0;
                        const nowMs         = Date.now();
                        if (nowMs - lastLoggedMs >= cooldownMs) {
                          lastSetupLogRef.current[cooldownKey] = nowMs;
                          fetch('/api/logs', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              category: 'setup', message: topSetup.pattern.name,
                              data: { symbol: chartSymbol, timeframe: chartInterval,
                                setupName: topSetup.pattern.name, setupId: topSetup.pattern.id,
                                direction: topSetup.pattern.direction, strength: topSetup.score,
                                sl: topSetup.pattern.sl }
                            })
                          }).catch(e => console.error('Failed to log setup:', e));
                        }
                      }

                      newEntries.push(entry);
                      lastCandleTimeRef.current = timeStr; // advance ref only after successful processing
                    } catch (candleErr) {
                      console.error('[Third Eye] candle processing error at', timeStr, candleErr);
                      lastCandleTimeRef.current = timeStr; // advance past failed candle to avoid infinite retry
                    }
                  }

                  setScanStatus({ lastTime: lastCandleTimeRef.current, pushed: newEntries.length, total: toProcess.length });

                  if (newEntries.length > 0) {
                    setThirdEyeLog(prev => {
                      // newEntries is oldest-first; prepend newest-first to log
                      const merged = [...[...newEntries].reverse(), ...prev];
                      // Deduplicate by time
                      const seen = new Set();
                      const deduped = merged.filter(e => {
                        if (seen.has(e.time)) return false;
                        seen.add(e.time); return true;
                      }).slice(0, 12);
                      fetch('/api/third-eye/log', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ entries: deduped }),
                      }).catch(() => {});
                      return deduped;
                    });
                  }
                }
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
            qty:        semiAutoQty,
            niftySl:    entry.topSetup.pattern.sl ?? null,
          }),
        });
        const data = await res.json();
        setThirdEyePlaced(prev => ({ ...prev, [entry.time]: data }));
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

    // Third Eye: bias-persistent, trader inner-monologue narrative builder.
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
        const res = await fetch('/api/third-eye/exit', {
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
      <div className="flex flex-col h-screen overflow-hidden bg-[#020817] text-slate-100 font-sans">
        <Nav kiteAuth={kiteAuth} userRole={userRole} />

        {/* ── Context Banners ─────────────────────────────────────────────── */}
        <div className="flex flex-col min-h-max border-b border-blue-900/30">
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
          <PositionConflictBanner
            positionAlert={positionAlert}
            positionAlertDismissedBias={positionAlertDismissedBias}
            setPositionAlertDismissedBias={setPositionAlertDismissedBias}
            exitingSymbol={exitingSymbol}
            exitResult={exitResult}
            onExitPosition={exitConflictingPosition}
          />
          {isPowerCandleActive && latestPowerCandle && (
            <div className={`relative flex items-center justify-between gap-3 px-4 py-3 border-b ${latestPowerCandle.direction === 'bull' ? 'bg-amber-500/15 border-amber-500/30' : 'bg-red-500/15 border-red-500/30'}`}>
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${latestPowerCandle.direction === 'bull' ? 'bg-amber-400' : 'bg-red-400'}`} />
                  <span className={`relative inline-flex h-full w-full rounded-full ${latestPowerCandle.direction === 'bull' ? 'bg-amber-400' : 'bg-red-400'}`} />
                </span>
                <div>
                  <div className={`text-xs font-black tracking-widest ${latestPowerCandle.direction === 'bull' ? 'text-amber-300' : 'text-red-300'}`}>⚡ REGIME SHIFT: {latestPowerCandle.direction?.toUpperCase()} POWER CANDLE</div>
                  <div className="text-[11px] text-slate-200 mt-0.5">Expansion {latestPowerCandle.rangeMult}x ATR. Reassess aggressive positions.</div>
                </div>
              </div>
              <button onClick={() => setPowerCandleDismissed(latestPowerCandle.time)} className="px-2 py-1 text-[10px] font-bold uppercase tracking-tight rounded bg-white/5 hover:bg-white/10 text-white/60">Dismiss</button>
            </div>
          )}
        </div>

        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 overflow-y-auto bg-[#020817] custom-scrollbar">
            <div className="max-w-[1600px] mx-auto p-4 sm:p-6 pb-20">
              
              {/* 1. Intelligence Section */}
              <div className="mb-6 rounded-xl border border-blue-800/20 bg-blue-900/10 p-4">
                {!commentary ? (
                  <div className="text-slate-500 text-sm">Intelligence offline — waiting for data</div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-sm font-bold text-slate-200">{commentary.headline}</span>
                       <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${commentary.bias === 'BULLISH' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{commentary.bias}</div>
                    </div>
                    <p className="text-cyan-300 text-sm">{commentary.action}</p>
                  </div>
                )}
              </div>

              {/* 2. Market Context Section */}
              <div className="mb-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="bg-[#112240] border border-blue-800/40 rounded-lg p-3">
                    <div className="text-[10px] text-blue-300 font-semibold mb-1">Nifty 50</div>
                    <div className="text-sm font-mono text-slate-100">{marketData?.indices?.nifty || '---'}</div>
                  </div>
                  <div className="bg-[#112240] border border-blue-800/40 rounded-lg p-3">
                    <div className="text-[10px] text-blue-300 font-semibold mb-1">Global Sentiment</div>
                    <div className="text-sm text-green-400">{marketData?.indices?.niftyChangePercent || '0.00'}%</div>
                  </div>
                  <div className="bg-[#112240] border border-blue-800/40 rounded-lg p-3">
                    <div className="text-[10px] text-blue-300 font-semibold mb-1">Adv / Dec</div>
                    <div className="text-sm text-slate-300">{marketData?.sentiment?.advances} / {marketData?.sentiment?.declines}</div>
                  </div>
                  <div className="bg-[#112240] border border-blue-800/40 rounded-lg p-3">
                    <div className="text-[10px] text-blue-300 font-semibold mb-1">India VIX</div>
                    <div className="text-sm text-amber-400">{marketData?.indices?.vix || '---'}</div>
                  </div>
                </div>
              </div>

              {/* 3. Main Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
                {/* Left */}
                <div className="lg:col-span-2 space-y-3">
                  <div className="bg-[#112240] border border-blue-800/40 rounded-xl p-3">
                    <h2 className="text-xs font-bold text-blue-300 mb-2 uppercase">Scanners</h2>
                    <Link href="/stock-updates/scanner/bullish-bo-15min" className="block p-2 text-xs text-slate-300 hover:text-white hover:bg-white/5 rounded transition-colors">Bullish Breakout</Link>
                    <Link href="/stock-updates/scanner/bearish-bo-15min" className="block p-2 text-xs text-slate-300 hover:text-white hover:bg-white/5 rounded transition-colors">Bearish Breakout</Link>
                  </div>
                </div>
                {/* Center */}
                <div className="lg:col-span-7">
                  <div className="bg-[#112240] border border-blue-800/40 rounded-xl overflow-hidden min-h-[500px] flex flex-col">
                    <div className="p-4 border-b border-blue-800/40 text-sm font-bold text-blue-300">Market Chart: {chartSymbol}</div>
                    <div className="flex-1 relative" ref={customChartCtnRef}>
                       {hoverOHLC && (
                        <div className="absolute top-2 left-2 z-10 text-[10px] font-mono bg-black/80 rounded px-2 py-1 text-slate-300">
                          {hoverOHLC.close.toFixed(0)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* Right */}
                <div className="lg:col-span-3">
                  <ThirdEyePanel
                    thirdEyeData={thirdEyeData}
                    thirdEyeOpen={thirdEyeOpen}
                    setThirdEyeOpen={setThirdEyeOpen}
                    thirdEyeLog={thirdEyeLog}
                    thirdEyeLive={thirdEyeLive}
                    thirdEyeMode={thirdEyeMode}
                    setThirdEyeMode={setThirdEyeMode}
                    thirdEyeEnv={thirdEyeEnv}
                    setThirdEyeEnv={setThirdEyeEnv}
                    thirdEyeTestMode={thirdEyeTestMode}
                    serverBiasState={serverBiasState}
                    liveTick={liveTick}
                    activeTrade={activeTrade}
                    tradeLTP={tradeLTP}
                    tradeExiting={tradeExiting}
                    tradeExited={tradeExited}
                    thirdEyePlaced={thirdEyePlaced}
                    thirdEyePlacing={thirdEyePlacing}
                    scanStatus={scanStatus}
                    openPositions={openPositions}
                    semiAutoQty={semiAutoQty}
                    setSemiAutoQty={setSemiAutoQty}
                    chartSymbol={chartSymbol}
                    SEMI_AUTO_IDS={SEMI_AUTO_IDS}
                    getAtmInfo={getAtmInfo}
                    isMarketHours={isMarketHours}
                    positionDir={positionDir}
                    onPlaceThirdEyeOrder={placeThirdEyeOrder}
                    onExitThirdEyeTrade={exitThirdEyeTrade}
                  />
                </div>
              </div>

              {/* 4. Bottom Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-[#112240] border border-blue-800/40 rounded-xl p-4">
                  <h2 className="text-sm font-bold text-blue-300 mb-3">Market Headlines</h2>
                  <div className="space-y-2 max-h-48 overflow-y-auto text-xs text-slate-400">
                    {newsData.length > 0 ? newsData.slice(0, 5).map((n, i) => (
                      <div key={i} className="border-b border-white/5 pb-2 last:border-0">{n.title}</div>
                    )) : <div>Loading news...</div>}
                  </div>
                </div>
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

            </div>
          </main>
        </div>
      </div>
    );
  }
