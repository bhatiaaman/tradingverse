'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, Eye, RefreshCw, Wifi, WifiOff, ChevronDown, ChevronUp, X } from 'lucide-react';
import SetupZone        from './SetupZone';
import DomPressureStrip from './DomPressureStrip';
import BiasArbitration  from './BiasArbitration';

// ── Colour maps ───────────────────────────────────────────────────────────────
const STATE_COLORS = {
  BUILDING_LONG:       { bg: 'bg-emerald-950', border: 'border-emerald-700', text: 'text-emerald-300', badge: 'bg-emerald-900 text-emerald-200' },
  CONFIRMED_LONG:      { bg: 'bg-emerald-950', border: 'border-emerald-500', text: 'text-emerald-200', badge: 'bg-emerald-700 text-emerald-100' },
  CONTINUING_LONG:     { bg: 'bg-emerald-950', border: 'border-emerald-500', text: 'text-emerald-200', badge: 'bg-emerald-700 text-emerald-100' },
  PULLBACK_LONG:       { bg: 'bg-amber-950',   border: 'border-amber-600',   text: 'text-amber-300',   badge: 'bg-amber-900 text-amber-100' },
  DEEP_PULLBACK_LONG:  { bg: 'bg-amber-950',   border: 'border-amber-500',   text: 'text-amber-200',   badge: 'bg-amber-800 text-amber-100' },
  EXHAUSTED_LONG:      { bg: 'bg-yellow-950',  border: 'border-yellow-600',  text: 'text-yellow-300',  badge: 'bg-yellow-900 text-yellow-100' },
  BUILDING_SHORT:      { bg: 'bg-rose-950',    border: 'border-rose-700',    text: 'text-rose-300',    badge: 'bg-rose-900 text-rose-200' },
  CONFIRMED_SHORT:     { bg: 'bg-rose-950',    border: 'border-rose-500',    text: 'text-rose-200',    badge: 'bg-rose-700 text-rose-100' },
  CONTINUING_SHORT:    { bg: 'bg-rose-950',    border: 'border-rose-500',    text: 'text-rose-200',    badge: 'bg-rose-700 text-rose-100' },
  PULLBACK_SHORT:      { bg: 'bg-amber-950',   border: 'border-amber-600',   text: 'text-amber-300',   badge: 'bg-amber-900 text-amber-100' },
  DEEP_PULLBACK_SHORT: { bg: 'bg-amber-950',   border: 'border-amber-500',   text: 'text-amber-200',   badge: 'bg-amber-800 text-amber-100' },
  EXHAUSTED_SHORT:     { bg: 'bg-yellow-950',  border: 'border-yellow-600',  text: 'text-yellow-300',  badge: 'bg-yellow-900 text-yellow-100' },
  INVALIDATED:         { bg: 'bg-slate-900',   border: 'border-slate-600',   text: 'text-slate-300',   badge: 'bg-slate-700 text-slate-200' },
  TRAPPED_LONG:        { bg: 'bg-orange-950',  border: 'border-orange-600',  text: 'text-orange-300',  badge: 'bg-orange-900 text-orange-100' },
  TRAPPED_SHORT:       { bg: 'bg-orange-950',  border: 'border-orange-600',  text: 'text-orange-300',  badge: 'bg-orange-900 text-orange-100' },
  RANGING:             { bg: 'bg-slate-900',   border: 'border-slate-600',   text: 'text-slate-300',   badge: 'bg-slate-700 text-slate-200' },
  NEUTRAL:             { bg: 'bg-slate-900',   border: 'border-slate-700',   text: 'text-slate-400',   badge: 'bg-slate-800 text-slate-300' },
};

const QUALIFIER_COLOR = {
  strengthening: 'text-emerald-400',
  weakening:     'text-rose-400',
  stretched:     'text-amber-400',
  holding:       'text-slate-400',
  neutral:       'text-slate-500',
};

const SESSION_BADGE = {
  opening:      { label: 'Opening Range',    color: 'bg-amber-900 text-amber-200' },
  primary:      { label: 'Primary Window',   color: 'bg-emerald-900 text-emerald-200' },
  lull:         { label: 'Midday Lull',      color: 'bg-slate-700 text-slate-300' },
  secondary:    { label: 'Secondary Window', color: 'bg-emerald-900 text-emerald-200' },
  close:        { label: 'Square-off Zone',  color: 'bg-rose-900 text-rose-200' },
  closed:       { label: 'Market Closed',    color: 'bg-slate-800 text-slate-400' },
  waiting:      { label: 'Waiting for open…',color: 'bg-slate-800 text-slate-500' },
  disconnected: { label: 'Kite Disconnected',color: 'bg-rose-950 text-rose-400' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function stateLabel(state) {
  return (state ?? 'NEUTRAL')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function fmt(n, dec = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: dec });
}

function elapsed(candlesInState, tf) {
  if (!candlesInState) return '';
  const mins = tf === '15minute' ? candlesInState * 15 : candlesInState * 5;
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function scoreBarWidth(score) {
  return `${Math.max(2, Math.min(100, score ?? 0))}%`;
}

// ── Settings schema ───────────────────────────────────────────────────────────
const SETTINGS_SCHEMA = [
  { key: 'activeTf',               label: 'Chart TF',              type: 'select', options: [{ v: '5minute', l: '5m → 15m bias' }, { v: '15minute', l: '15m → 1hr bias' }] },
  { key: 'adxStrong',              label: 'ADX strong trend',       type: 'number', min: 15, max: 40 },
  { key: 'adxForming',             label: 'ADX trend forming',      type: 'number', min: 10, max: 30 },
  { key: 'rsiBull',                label: 'RSI bull zone (above)',  type: 'number', min: 50, max: 80 },
  { key: 'rsiBear',                label: 'RSI bear zone (below)',  type: 'number', min: 20, max: 50 },
  { key: 'candleStrengthImpulsive',label: 'Candle strength impulse',type: 'number', min: 0.5, max: 3, step: 0.1 },
  { key: 'confirmationCandles',    label: 'Confirmation candles',   type: 'number', min: 1, max: 4 },
  { key: 'scoreSmoothing',         label: 'Score smoothing (EMA)',  type: 'number', min: 1, max: 5 },
  { key: 'staleGuardCandles',      label: 'Stale guard candles',    type: 'number', min: 4, max: 20 },
  { key: 'buildingThreshold',      label: 'Building threshold',     type: 'number', min: 40, max: 70 },
  { key: 'confirmedThreshold',     label: 'Confirmed threshold',    type: 'number', min: 50, max: 80 },
  { key: 'optionsOverlay',         label: 'Options overlay',        type: 'boolean' },
  { key: 'sessionGateOpening',     label: 'Opening session gate',   type: 'select', options: [{ v: 'suppress', l: 'Suppress' }, { v: 'warn', l: 'Warn only' }, { v: 'allow', l: 'Allow' }] },
  { key: 'sessionGateLull',        label: 'Lull session gate',      type: 'select', options: [{ v: 'suppress', l: 'Suppress' }, { v: 'warn', l: 'Warn only' }, { v: 'allow', l: 'Allow' }] },
];

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, score, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-slate-400 w-10">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-700 ${color}`}
          style={{ width: scoreBarWidth(score) }}
        />
      </div>
      <span className="text-xs font-mono font-bold w-7 text-right text-slate-200">
        {score ?? '—'}
      </span>
    </div>
  );
}

// ── Settings flyout ───────────────────────────────────────────────────────────
function SettingsFlyout({ settings, onClose, onSave }) {
  const [local, setLocal] = useState(settings ?? {});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-sm rounded-xl overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-white">Third Eye Settings</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3">
        {SETTINGS_SCHEMA.map(({ key, label, type, options, min, max, step }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-300 flex-1">{label}</span>
            {type === 'boolean' ? (
              <button
                onClick={() => setLocal(p => ({ ...p, [key]: !p[key] }))}
                className={`px-2 py-0.5 rounded text-xs font-mono ${local[key] ? 'bg-emerald-800 text-emerald-200' : 'bg-slate-700 text-slate-400'}`}
              >
                {local[key] ? 'ON' : 'OFF'}
              </button>
            ) : type === 'select' ? (
              <select
                value={local[key] ?? ''}
                onChange={e => setLocal(p => ({ ...p, [key]: e.target.value }))}
                className="bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded px-2 py-0.5"
              >
                {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            ) : (
              <input
                type="number"
                value={local[key] ?? ''}
                min={min} max={max} step={step ?? 1}
                onChange={e => setLocal(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                className="bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded px-2 py-0.5 w-20 text-right"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-semibold py-1.5 rounded disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onClose} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ThirdEyePanel() {
  const [scanData,      setScanData]      = useState(null);
  const [ltp,           setLtp]           = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [lastScan,      setLastScan]      = useState(null);
  const [settings,      setSettings]      = useState(null);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showCommentary,setShowCommentary]= useState(true);
  const [tf,            setTf]            = useState('5minute');
  const [underlying,    setUnderlying]    = useState('NIFTY'); // 'NIFTY' | 'SENSEX'
  // scanError: null | { message: string, isAuth: boolean }
  const [scanError,     setScanError]     = useState(null);
  // Scalp trade state
  const [scalpSetup,    setScalpSetup]    = useState(null);
  const [placing,       setPlacing]       = useState(false);
  const [placed,        setPlaced]        = useState(false);
  const [placedResult,  setPlacedResult]  = useState(null);
  const [skippedCandle, setSkippedCandle] = useState(null);
  const [setupHistory,  setSetupHistory]  = useState([]); // last 5 fired signals

  const scanTimer      = useRef(null);
  const tickTimer      = useRef(null);
  const prevScalpRef   = useRef(null); // tracks last seen candleTime for history dedup

  // ── Fetch settings ──────────────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    try {
      const res  = await fetch('/api/third-eye/settings');
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data.settings);
      if (data.settings?.activeTf) setTf(data.settings.activeTf);
    } catch { /* silent */ }
  }, []);

  // ── Save settings ───────────────────────────────────────────────────────────
  const saveSettings = useCallback(async (newSettings) => {
    try {
      const res = await fetch('/api/third-eye/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data.settings);
      if (data.settings?.activeTf) setTf(data.settings.activeTf);
    } catch { /* silent */ }
  }, []);

  // ── Scan ────────────────────────────────────────────────────────────────────
  const AUTH_RE = /token|expired|reconnect|credential|unauthori[sz]ed|invalid.*access/i;

  const runScan = useCallback(async (activeTf, activeUnderlying) => {
    try {
      const devMode = typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('dev');
      const res = await fetch('/api/third-eye/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tf: activeTf, underlying: activeUnderlying, ...(devMode && { devMode: true }) }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        const msg = e.error ?? 'Scan failed';
        setScanError({ message: msg, isAuth: res.status === 401 || res.status === 503 || AUTH_RE.test(msg) });
        setLoading(false);
        return;
      }
      const data = await res.json();
      // A 200 can carry an error field (e.g. stale token → "No candle data").
      // Don't overwrite last good scanData — preserve scores/state while error shows.
      if (data.error) {
        const msg = data.error;
        setScanError({ message: msg, isAuth: AUTH_RE.test(msg) });
        setLoading(false);
        return;
      }
      setScanData(data);
      setLastScan(new Date());
      setScanError(null);
      setLoading(false);

      // Scalp setup: track history when candleTime changes, then update card
      if (data.scalpSetup) {
        const newTime = data.scalpSetup.candleTime;
        if (prevScalpRef.current !== newTime) {
          // New candle fired a signal — archive the previous one
          setScalpSetup(prev => {
            if (prev) {
              setSetupHistory(h =>
                [{ ...prev, status: placed ? 'placed' : 'skipped' }, ...h].slice(0, 5)
              );
            }
            return data.scalpSetup;
          });
          prevScalpRef.current = newTime;
          setPlaced(false);
          setPlacedResult(null);
        }
        // Same candle still active — don't overwrite (preserves placed state)
      } else {
        // Server sees no setup — if we had one and it's now gone, archive it
        if (prevScalpRef.current != null) {
          setScalpSetup(prev => {
            if (prev && !placed) {
              setSetupHistory(h => [{ ...prev, status: 'expired' }, ...h].slice(0, 5));
            }
            return null;
          });
          prevScalpRef.current = null;
        }
      }
    } catch (err) {
      const msg = err.message ?? 'Network error';
      setScanError({ message: msg, isAuth: AUTH_RE.test(msg) });
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skippedCandle]);

  // ── Tick ────────────────────────────────────────────────────────────────────
  const runTick = useCallback(async (activeUnderlying) => {
    try {
      const res = await fetch(`/api/third-eye/tick?underlying=${activeUnderlying}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.ltp) setLtp(data);
    } catch { /* silent */ }
  }, []);

  // ── Polling setup ───────────────────────────────────────────────────────────
  // ── Trading window check (9:00–16:00 IST, Mon–Fri) ────────────────────────
  const isDevMode = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('dev');

  function isTradingWindow() {
    if (isDevMode) return true;
    const ist  = new Date(Date.now() + 5.5 * 3600 * 1000);
    const day  = ist.getUTCDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return mins >= 540 && mins < 960; // 09:00–16:00
  }

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    // Reset display state when underlying switches
    setScanData(null);
    setLtp(null);
    setScalpSetup(null);
    setPlaced(false);
    setPlacedResult(null);
    setLoading(true);

    let wakeupTimer = null;

    function startPolling() {
      setLoading(true);
      runScan(tf, underlying);
      runTick(underlying);

      scanTimer.current = setInterval(() => {
        if (isTradingWindow()) runScan(tf, underlying);
        else {
          clearInterval(scanTimer.current);
          clearInterval(tickTimer.current);
        }
      }, isDevMode ? 15_000 : 45_000);

      tickTimer.current = setInterval(() => {
        if (isTradingWindow()) runTick(underlying);
      }, 10_000);
    }

    if (isTradingWindow()) {
      startPolling();
    } else {
      setLoading(false);
      // Check every 60s — start polling automatically when market opens
      wakeupTimer = setInterval(() => {
        if (isTradingWindow()) {
          clearInterval(wakeupTimer);
          wakeupTimer = null;
          startPolling();
        }
      }, 60_000);
    }

    return () => {
      if (wakeupTimer) clearInterval(wakeupTimer);
      clearInterval(scanTimer.current);
      clearInterval(tickTimer.current);
    };
  }, [tf, underlying, runScan, runTick]);

  // ── Place scalp order ───────────────────────────────────────────────────────
  const handlePlace = useCallback(async (setup) => {
    setPlacing(true);
    try {
      const res = await fetch('/api/setup-eye/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niftyPrice: setup.niftyPrice,
          direction:  setup.direction,
          qty:        setup.qty,
          niftySl:    setup.niftySl,
          underlying,
        }),
      });
      const data = await res.json();
      setPlacedResult(data);
      setPlaced(true);
    } catch (err) {
      setPlacedResult({ error: err.message });
      setPlaced(true);
    } finally {
      setPlacing(false);
    }
  }, []);

  // ── Skip setup ──────────────────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    setSkippedCandle(scalpSetup?.candleTime ?? null);
    setScalpSetup(null);
    setPlaced(false);
    setPlacedResult(null);
  }, [scalpSetup]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const state      = scanData?.state ?? 'NEUTRAL';
  const colors     = STATE_COLORS[state] ?? STATE_COLORS.NEUTRAL;
  const commentary = scanData?.commentary;
  const features   = scanData?.features;
  const keyLevels  = scanData?.keyLevels;
  const biasAlign  = scanData?.biasAlignment;
  const optCtx     = scanData?.optionsCtx;
  const biasTf     = scanData?.biasTfLabel ?? '15m';
  const sessionPh  = features?.sessionPhase
    ?? (scanError?.isAuth ? 'disconnected' : scanData?.features ? 'closed' : 'waiting');
  const sessBadge  = SESSION_BADGE[sessionPh] ?? SESSION_BADGE.closed;
  const qualColor  = QUALIFIER_COLOR[scanData?.qualifier] ?? QUALIFIER_COLOR.neutral;

  const ltpDisplay = ltp?.ltp ?? features?.close;
  const vwapVal    = keyLevels?.vwap ?? features?.vwap;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={`relative rounded-xl border ${colors.border} ${colors.bg} text-sm overflow-hidden flex flex-col`}>

      {/* ── Settings overlay ─────────────────────────────────────────────── */}
      {showSettings && settings && (
        <SettingsFlyout
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
        />
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <div className="flex items-center gap-2 flex-wrap">
          <Eye size={14} className={colors.text} />
          <span className={`text-xs font-bold tracking-wide ${colors.text}`}>THIRD EYE</span>
          {/* Nifty / Sensex toggle */}
          <div className="flex items-center rounded overflow-hidden border border-slate-700 text-[10px] font-mono">
            <button
              onClick={() => setUnderlying('NIFTY')}
              className={`px-2 py-0.5 transition-colors ${underlying === 'NIFTY' ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
            >NIFTY</button>
            <button
              onClick={() => setUnderlying('SENSEX')}
              className={`px-2 py-0.5 transition-colors ${underlying === 'SENSEX' ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
            >SENSEX</button>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${sessBadge.color}`}>
            {sessBadge.label}
          </span>
          {/* TF badge */}
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-800 text-slate-400">
            {tf === '5minute' ? '5m/15m' : '15m/1hr'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          {scanData?.marketHours !== undefined && (
            scanData.marketHours
              ? <Wifi size={12} className="text-emerald-400" />
              : <WifiOff size={12} className="text-slate-600" />
          )}
          {loading && <RefreshCw size={12} className="text-slate-500 animate-spin" />}
          <button
            onClick={() => setShowSettings(true)}
            className="text-slate-500 hover:text-slate-200 transition-colors"
            title="Third Eye Settings"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* ── Zone 1: Intent meter ─────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-slate-700/30 space-y-1.5">
        <ScoreBar label="LONG"  score={scanData?.longScore}  color="bg-emerald-500" />
        <ScoreBar label="SHORT" score={scanData?.shortScore} color="bg-rose-500" />
      </div>

      {/* ── Zone 2: State + alignment ─────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-slate-700/30 space-y-1">
        {/* State + qualifier */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold uppercase tracking-wide ${colors.text}`}>
            {stateLabel(state)}
          </span>
          {scanData?.qualifier && scanData.qualifier !== 'neutral' && (
            <span className={`text-[10px] font-mono ${qualColor}`}>
              · {scanData.qualifier}
            </span>
          )}
        </div>

        {/* Duration + time */}
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
          {scanData?.candlesInState != null && (
            <span>{scanData.candlesInState} candles · {elapsed(scanData.candlesInState, tf)}</span>
          )}
          {ltpDisplay && (
            <span className="text-slate-300 font-bold">{fmt(ltpDisplay, 1)}</span>
          )}
          {vwapVal && (
            <span>VWAP {fmt(vwapVal, 0)}</span>
          )}
        </div>

        {/* TF alignment */}
        {biasAlign && state !== 'NEUTRAL' && state !== 'RANGING' && (
          <div className={`text-[10px] font-mono ${biasAlign.aligned ? 'text-emerald-400' : biasAlign.counter ? 'text-rose-400' : 'text-slate-500'}`}>
            {biasTf} {biasAlign.label}
          </div>
        )}

        {/* ADX + RSI mini indicators */}
        {features && (
          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 pt-0.5">
            {features.adx != null && (
              <span className={features.adx >= 25 ? 'text-indigo-400' : features.adx >= 20 ? 'text-slate-400' : 'text-slate-600'}>
                ADX {features.adx}{features.adxRising ? '↑' : ''}
              </span>
            )}
            {features.rsi != null && (
              <span className={features.rsi >= 60 ? 'text-emerald-400' : features.rsi <= 40 ? 'text-rose-400' : 'text-slate-500'}>
                RSI {features.rsi}
              </span>
            )}
            {features.candleStrength != null && (
              <span className={features.candleStrength >= 1.2 ? 'text-amber-400' : 'text-slate-600'}>
                CS {features.candleStrength.toFixed(1)}
              </span>
            )}
            {features.direction && (
              <span className={features.direction === 'bull' ? 'text-emerald-500' : features.direction === 'bear' ? 'text-rose-500' : 'text-slate-600'}>
                {features.direction === 'bull' ? '▲' : features.direction === 'bear' ? '▼' : '—'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Zone 3: Commentary ────────────────────────────────────────────── */}
      {commentary && (
        <div className="px-3 py-2 space-y-2 border-b border-slate-700/30">
          {/* Toggle */}
          <button
            className="flex items-center justify-between w-full"
            onClick={() => setShowCommentary(p => !p)}
          >
            <span className={`text-xs font-semibold ${colors.text}`}>{commentary.headline}</span>
            {showCommentary
              ? <ChevronUp size={12} className="text-slate-500 shrink-0" />
              : <ChevronDown size={12} className="text-slate-500 shrink-0" />}
          </button>

          {showCommentary && (
            <div className="space-y-2">
              {/* Context */}
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {commentary.context}
              </p>

              {/* Watch */}
              {commentary.watch && (
                <div className="flex gap-1.5 items-start">
                  <span className="text-[10px] font-semibold text-indigo-400 shrink-0 mt-0.5">WATCH</span>
                  <span className="text-[11px] text-slate-300 leading-relaxed">{commentary.watch}</span>
                </div>
              )}

              {/* Risk */}
              {commentary.risk && (
                <div className="flex gap-1.5 items-start">
                  <span className="text-[10px] font-semibold text-rose-400 shrink-0 mt-0.5">RISK</span>
                  <span className="text-[11px] text-slate-300 leading-relaxed">{commentary.risk}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Zone 4: Options overlay ───────────────────────────────────────── */}
      {optCtx?.available !== false && (optCtx?.pcrInfo || optCtx?.callWall) && (
        <div className="px-3 py-2 border-b border-slate-700/30 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {optCtx?.pcrInfo?.label && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                optCtx.pcrInfo.bias === 'bullish' ? 'bg-emerald-900/60 text-emerald-300' :
                optCtx.pcrInfo.bias === 'bearish' ? 'bg-rose-900/60 text-rose-300' :
                'bg-slate-800 text-slate-400'}`}>
                PCR {optCtx.pcrInfo.label}
              </span>
            )}
            {optCtx?.isExpiryDay && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300">
                Expiry Day
              </span>
            )}
          </div>
          {(optCtx?.callWall || optCtx?.putWall) && (
            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
              {optCtx?.callWall && <span>Call wall <span className="text-rose-400">{fmt(optCtx.callWall)}</span></span>}
              {optCtx?.putWall  && <span>Put wall <span className="text-emerald-400">{fmt(optCtx.putWall)}</span></span>}
              {optCtx?.maxPain  && <span>Max pain <span className="text-amber-400">{fmt(optCtx.maxPain)}</span></span>}
            </div>
          )}
          {commentary?.optionsLines?.map((line, i) => (
            <p key={i} className="text-[10px] text-amber-300">{line}</p>
          ))}
          {optCtx?.activityLabel && (
            <p className="text-[10px] text-slate-400 font-mono">{optCtx.activityLabel}</p>
          )}
        </div>
      )}

      {/* ── Zone 5: Bias Arbitration ──────────────────────────────────── */}
      <BiasArbitration data={scanData?.biasArbitration ?? null} />

      {/* ── Zone 6: Live market pressure (always-on DOM strip) ──────────── */}
      <DomPressureStrip underlying={underlying} devMode={isDevMode} />

      {/* ── Zone 6: Setups ────────────────────────────────────────────────── */}
      <SetupZone
        setup={scalpSetup}
        sessionPhase={sessionPh}
        placed={placed}
        placedResult={placedResult}
        placing={placing}
        onPlace={handlePlace}
        onSkip={handleSkip}
        history={setupHistory}
        underlying={underlying}
        orHigh={scanData?.orHigh ?? null}
        orLow={scanData?.orLow ?? null}
      />

      {/* ── Outside trading window ───────────────────────────────────────── */}
      {!loading && !scanData && !scanError && !isTradingWindow() && (
        <div className="px-3 py-4 text-center space-y-1">
          <p className="text-xs text-slate-500">Third Eye is dormant</p>
          <p className="text-[10px] font-mono text-slate-600">Active 9:00 – 16:00 IST, Mon–Fri</p>
        </div>
      )}

      {/* ── Scan error ────────────────────────────────────────────────────── */}
      {scanError && (
        <div className="px-3 py-2 border-t border-rose-900/40 bg-rose-950/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <WifiOff size={11} className="text-rose-400 flex-shrink-0" />
            <span className="text-[11px] text-rose-300 font-mono truncate">{scanError.message}</span>
          </div>
          {scanError.isAuth && (
            <a
              href="/settings"
              className="text-[10px] text-indigo-400 hover:text-indigo-200 whitespace-nowrap font-mono underline flex-shrink-0"
            >
              Reconnect Kite →
            </a>
          )}
        </div>
      )}

      {/* ── Footer: last updated ──────────────────────────────────────────── */}
      {lastScan && (
        <div className="px-3 py-1 text-[10px] font-mono text-slate-600 border-t border-slate-800/50">
          Updated {lastScan.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      )}
    </div>
  );
}
