'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, Eye, RefreshCw, Wifi, WifiOff, ChevronDown, ChevronUp, X, TrendingUp, TrendingDown, Zap } from 'lucide-react';

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
  opening:   { label: 'Opening Range', color: 'bg-amber-900 text-amber-200' },
  primary:   { label: 'Primary Window', color: 'bg-emerald-900 text-emerald-200' },
  lull:      { label: 'Midday Lull', color: 'bg-slate-700 text-slate-300' },
  secondary: { label: 'Secondary Window', color: 'bg-emerald-900 text-emerald-200' },
  close:     { label: 'Square-off Zone', color: 'bg-rose-900 text-rose-200' },
  closed:    { label: 'Market Closed', color: 'bg-slate-800 text-slate-400' },
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

// ── Scalp trade card ──────────────────────────────────────────────────────────
function ScalpCard({ setup, onPlace, onSkip, placing, placed, placedResult, underlying }) {
  const defaultQty = underlying === 'SENSEX' ? 10 : 75;
  const lotStep    = underlying === 'SENSEX' ? 10 : 25;
  const [qty, setQty] = useState(defaultQty);
  const isBull  = setup.direction === 'bull';
  const accent  = isBull ? 'emerald' : 'rose';
  const typeLabel = { VWAP_CROSS: 'VWAP Cross', POWER_CANDLE: 'Power Candle', PULLBACK_RESUME: 'Pullback Resume', ATR_EXPANSION: 'ATR Expansion' }[setup.type] ?? setup.type;

  if (placed) {
    return (
      <div className={`rounded-lg border border-${accent}-600/50 bg-${accent}-950/60 px-3 py-2.5 space-y-1`}>
        <div className="flex items-center gap-2">
          <Zap size={12} className={`text-${accent}-400`} />
          <span className={`text-xs font-bold text-${accent}-300`}>
            {setup.optType} order placed
          </span>
        </div>
        {placedResult?.symbol && (
          <p className="text-[11px] font-mono text-slate-300">{placedResult.symbol}</p>
        )}
        {placedResult?.entryLimit && (
          <div className="flex gap-4 text-[10px] font-mono text-slate-400">
            <span>Entry ₹{placedResult.entryLimit}</span>
            {placedResult.slTrigger && <span>SL ₹{placedResult.slTrigger}</span>}
          </div>
        )}
        {placedResult?.slError && (
          <p className="text-[10px] text-amber-400">{placedResult.slError}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-${accent}-600/40 bg-${accent}-950/50 px-3 py-2.5 space-y-2`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBull
            ? <TrendingUp  size={12} className="text-emerald-400" />
            : <TrendingDown size={12} className="text-rose-400" />}
          <span className={`text-xs font-bold text-${accent}-300`}>
            {setup.optType} Scalp
          </span>
          <span className="text-[10px] font-mono text-slate-500">· {typeLabel}</span>
          {setup.confidence === 'high' && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-900/60 text-amber-300 font-mono">HIGH</span>
          )}
          {setup.volumeSpike && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-violet-900/60 text-violet-300 font-mono">⚡ Vol</span>
          )}
        </div>
        <button onClick={onSkip} className="text-slate-600 hover:text-slate-400">
          <X size={12} />
        </button>
      </div>

      {/* Levels grid */}
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        <div className="space-y-0.5">
          <div className="text-slate-500">{underlying ?? 'Nifty'}</div>
          <div className="text-slate-200 font-bold">{fmt(setup.niftyPrice, 0)}</div>
        </div>
        <div className="space-y-0.5">
          <div className="text-emerald-500">Target +{setup.targetPts}</div>
          <div className="text-emerald-300 font-bold">{fmt(setup.niftyTarget, 0)}</div>
        </div>
        <div className="space-y-0.5">
          <div className="text-rose-500">SL -{setup.slPts}</div>
          <div className="text-rose-300 font-bold">{fmt(setup.niftySl, 0)}</div>
        </div>
      </div>

      {/* ATM strike */}
      <div className="text-[10px] font-mono text-slate-500">
        ATM {setup.strike} {setup.optType} · {setup.sessionPhase === 'primary' ? 'Primary window' : 'Secondary window'}
      </div>

      {/* ATR expansion zone — only for ATR_EXPANSION setups */}
      {setup.type === 'ATR_EXPANSION' && setup.atrExpansionHigh != null && (
        <div className="text-[10px] font-mono text-violet-400/80 bg-violet-900/20 rounded px-2 py-1">
          Expansion zone {fmt(setup.atrExpansionLow, 0)} – {fmt(setup.atrExpansionHigh, 0)}
          <span className="text-slate-500 ml-1">· wait for pullback or enter on momentum</span>
        </div>
      )}

      {/* Qty + Place */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 shrink-0">Qty</span>
        <input
          type="number"
          value={qty}
          min={lotStep} step={lotStep}
          onChange={e => setQty(Math.max(lotStep, parseInt(e.target.value) || lotStep))}
          className="w-16 bg-slate-800 border border-slate-600 text-slate-200 text-xs font-mono rounded px-2 py-0.5 text-right"
        />
        <button
          onClick={() => onPlace({ ...setup, qty })}
          disabled={placing}
          className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors
            ${isBull
              ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
              : 'bg-rose-700   hover:bg-rose-600   text-white'}
            disabled:opacity-50`}
        >
          {placing ? 'Placing…' : `BUY ${setup.optType}`}
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
  const [error,         setError]         = useState(null);
  // Scalp trade state
  const [scalpSetup,    setScalpSetup]    = useState(null);
  const [placing,       setPlacing]       = useState(false);
  const [placed,        setPlaced]        = useState(false);
  const [placedResult,  setPlacedResult]  = useState(null);
  const [skippedCandle, setSkippedCandle] = useState(null); // candleTime of dismissed setup

  const scanTimer = useRef(null);
  const tickTimer = useRef(null);

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
  const runScan = useCallback(async (activeTf, activeUnderlying) => {
    try {
      const res = await fetch('/api/third-eye/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tf: activeTf, underlying: activeUnderlying }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error ?? 'Scan failed');
        return;
      }
      const data = await res.json();
      setScanData(data);
      setLastScan(new Date());
      setError(null);
      setLoading(false);

      // Scalp setup: show card if new signal fired and user hasn't skipped this candle
      if (data.scalpSetup) {
        setScalpSetup(prev => {
          // Already showing a placed result for this candle — don't overwrite
          if (placed && placedResult) return prev;
          return data.scalpSetup;
        });
        // Clear placed state if a new candle's signal arrives
        setPlaced(false);
        setPlacedResult(null);
      } else {
        // No setup from server — clear if candle has changed
        setScalpSetup(null);
      }
    } catch (err) {
      setError(err.message);
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
  function isTradingWindow() {
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

    if (!isTradingWindow()) {
      setLoading(false);
      return;
    }

    // Initial scan
    runScan(tf, underlying);
    runTick(underlying);

    // 30s scan interval
    scanTimer.current = setInterval(() => {
      if (isTradingWindow()) runScan(tf, underlying);
      else {
        clearInterval(scanTimer.current);
        clearInterval(tickTimer.current);
      }
    }, 30_000);
    // 10s tick interval
    tickTimer.current = setInterval(() => {
      if (isTradingWindow()) runTick(underlying);
    }, 10_000);

    return () => {
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
  const sessionPh  = features?.sessionPhase ?? 'closed';
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

      {/* ── Scalp trade card ─────────────────────────────────────────────── */}
      {(scalpSetup || (placed && placedResult)) && (
        <div className="px-3 py-2 border-b border-slate-700/30">
          <ScalpCard
            setup={scalpSetup ?? { ...placedResult, optType: placedResult?.optionType }}
            onPlace={handlePlace}
            onSkip={handleSkip}
            placing={placing}
            placed={placed}
            placedResult={placedResult}
            underlying={underlying}
          />
        </div>
      )}

      {/* ── Zone 4: Options overlay ───────────────────────────────────────── */}
      {optCtx?.available !== false && (optCtx?.pcrInfo || optCtx?.callWall) && (
        <div className="px-3 py-2 space-y-1">
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

          {/* OI walls */}
          {(optCtx?.callWall || optCtx?.putWall) && (
            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
              {optCtx?.callWall && <span>Call wall <span className="text-rose-400">{fmt(optCtx.callWall)}</span></span>}
              {optCtx?.putWall  && <span>Put wall <span className="text-emerald-400">{fmt(optCtx.putWall)}</span></span>}
              {optCtx?.maxPain  && <span>Max pain <span className="text-amber-400">{fmt(optCtx.maxPain)}</span></span>}
            </div>
          )}

          {/* Wall proximity alerts */}
          {commentary?.optionsLines?.map((line, i) => (
            <p key={i} className="text-[10px] text-amber-300">{line}</p>
          ))}

          {/* Activity label */}
          {optCtx?.activityLabel && (
            <p className="text-[10px] text-slate-400 font-mono">{optCtx.activityLabel}</p>
          )}
        </div>
      )}

      {/* ── Outside trading window ───────────────────────────────────────── */}
      {!loading && !scanData && !error && !isTradingWindow() && (
        <div className="px-3 py-4 text-center space-y-1">
          <p className="text-xs text-slate-500">Third Eye is dormant</p>
          <p className="text-[10px] font-mono text-slate-600">Active 9:00 – 16:00 IST, Mon–Fri</p>
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && (
        <div className="px-3 py-2 text-[11px] text-rose-400 font-mono border-t border-slate-700/30">
          {error}
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
