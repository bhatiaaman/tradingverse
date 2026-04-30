'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, Eye, RefreshCw, Wifi, WifiOff, ChevronDown, ChevronUp, X } from 'lucide-react';
import SetupZone        from './SetupZone';
import DomPressureStrip from './DomPressureStrip';

// ── Bias verdict styles ───────────────────────────────────────────────────────
const BIAS_STYLE = {
  'Strong Bullish': { text: 'text-emerald-300', score: 'text-emerald-300', dot: 'bg-emerald-400', bar: ['#065f46','#34d399'] },
  'Bullish':        { text: 'text-emerald-400', score: 'text-emerald-400', dot: 'bg-emerald-500', bar: ['#065f46','#10b981'] },
  'Neutral':        { text: 'text-slate-300',   score: 'text-slate-400',   dot: 'bg-slate-500',  bar: ['#334155','#64748b'] },
  'Bearish':        { text: 'text-rose-400',    score: 'text-rose-400',   dot: 'bg-rose-500',   bar: ['#9f1239','#fb7185'] },
  'Strong Bearish': { text: 'text-rose-300',    score: 'text-rose-300',   dot: 'bg-rose-400',   bar: ['#881337','#f43f5e'] },
};
const CONF_BADGE = {
  high:   'bg-amber-950 border-amber-700/50 text-amber-300',
  medium: 'bg-slate-800 border-slate-600/50 text-slate-300',
  low:    'bg-slate-900 border-slate-700/40 text-slate-500',
};
const ENGINE_META = {
  structure:  { label: 'Structure',   tip: 'Candle patterns, VWAP position & EMA stacking. Score > 0 = bullish structure; < 0 = bearish.' },
  dom:        { label: 'DOM',         tip: 'Live bid-ask imbalance from the order book. Score 7–10 = buyers dominant; 0–3 = sellers dominant.' },
  momentum:   { label: 'Momentum',    tip: 'RSI, ADX trend strength & candle body size. High ADX + bullish RSI = strong directional momentum.' },
  options:    { label: 'Options',     tip: 'Put-Call Ratio & max OI walls. PCR < 0.8 = bullish positioning; > 1.3 = bears loading puts.' },
  indicators: { label: 'Indicators',  tip: 'Technical indicator consensus — RSI, EMA crossings & candle confirmation. Supports or questions structure.' },
};

// ── Verdict bar (center-origin) ───────────────────────────────────────────────
function VerdictBar({ score, conflict, height = 'h-2.5' }) {
  const pct  = Math.min(50, Math.abs(score ?? 0) * 5);
  const bull = (score ?? 0) >= 0;
  const grad = conflict
    ? 'linear-gradient(to right,#92400e,#f59e0b)'
    : bull ? 'linear-gradient(to right,#065f46,#34d399)'
           : 'linear-gradient(to right,#9f1239,#fb7185)';
  return (
    <div className={`relative w-full bg-white/[0.06] rounded-full overflow-hidden ${height}`}>
      <div className="absolute inset-y-0 w-px bg-slate-600/40" style={{ left: '50%' }} />
      {score !== 0 && (
        <div className="absolute inset-y-0 transition-all duration-700" style={{
          background: grad,
          ...(bull ? { left: '50%', width: `${pct}%` } : { right: `${50-pct}%`, width: `${pct}%` }),
        }} />
      )}
    </div>
  );
}

// ── State: text + badge only (bg/border now handled by glow system) ───────────
const STATE_COLORS = {
  BUILDING_LONG:       { text: 'text-emerald-300', badge: 'bg-emerald-900/60 text-emerald-200' },
  CONFIRMED_LONG:      { text: 'text-emerald-300', badge: 'bg-emerald-800/70 text-emerald-100' },
  CONTINUING_LONG:     { text: 'text-emerald-300', badge: 'bg-emerald-800/70 text-emerald-100' },
  PULLBACK_LONG:       { text: 'text-amber-300',   badge: 'bg-amber-900/60 text-amber-100'    },
  DEEP_PULLBACK_LONG:  { text: 'text-amber-300',   badge: 'bg-amber-800/60 text-amber-100'    },
  EXHAUSTED_LONG:      { text: 'text-yellow-300',  badge: 'bg-yellow-900/60 text-yellow-100'  },
  BUILDING_SHORT:      { text: 'text-rose-300',    badge: 'bg-rose-900/60 text-rose-200'      },
  CONFIRMED_SHORT:     { text: 'text-rose-300',    badge: 'bg-rose-800/70 text-rose-100'      },
  CONTINUING_SHORT:    { text: 'text-rose-300',    badge: 'bg-rose-800/70 text-rose-100'      },
  PULLBACK_SHORT:      { text: 'text-amber-300',   badge: 'bg-amber-900/60 text-amber-100'    },
  DEEP_PULLBACK_SHORT: { text: 'text-amber-300',   badge: 'bg-amber-800/60 text-amber-100'    },
  EXHAUSTED_SHORT:     { text: 'text-yellow-300',  badge: 'bg-yellow-900/60 text-yellow-100'  },
  INVALIDATED:         { text: 'text-slate-300',   badge: 'bg-slate-700/60 text-slate-200'    },
  TRAPPED_LONG:        { text: 'text-orange-300',  badge: 'bg-orange-900/60 text-orange-100'  },
  TRAPPED_SHORT:       { text: 'text-orange-300',  badge: 'bg-orange-900/60 text-orange-100'  },
  RANGING:             { text: 'text-slate-300',   badge: 'bg-slate-700/60 text-slate-200'    },
  NEUTRAL:             { text: 'text-slate-400',   badge: 'bg-slate-800/60 text-slate-300'    },
};

// ── Radial glow bloom per state ───────────────────────────────────────────────
// Charcoal base (#131722) + obsidian-style bloom from top center.
const STATE_GLOW = {
  BUILDING_LONG:       'radial-gradient(ellipse 90% 45% at 50% 0%, rgba(16,185,129,0.13) 0%, transparent 100%)',
  CONFIRMED_LONG:      'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(16,185,129,0.18) 0%, transparent 100%)',
  CONTINUING_LONG:     'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(16,185,129,0.16) 0%, transparent 100%)',
  PULLBACK_LONG:       'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(245,158,11,0.13) 0%, transparent 100%)',
  DEEP_PULLBACK_LONG:  'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(245,158,11,0.14) 0%, transparent 100%)',
  EXHAUSTED_LONG:      'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(234,179,8,0.12) 0%, transparent 100%)',
  BUILDING_SHORT:      'radial-gradient(ellipse 90% 45% at 50% 0%, rgba(244,63,94,0.13) 0%, transparent 100%)',
  CONFIRMED_SHORT:     'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(244,63,94,0.18) 0%, transparent 100%)',
  CONTINUING_SHORT:    'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(244,63,94,0.16) 0%, transparent 100%)',
  PULLBACK_SHORT:      'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(245,158,11,0.13) 0%, transparent 100%)',
  DEEP_PULLBACK_SHORT: 'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(245,158,11,0.14) 0%, transparent 100%)',
  EXHAUSTED_SHORT:     'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(234,179,8,0.12) 0%, transparent 100%)',
  INVALIDATED:         'none',
  TRAPPED_LONG:        'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(249,115,22,0.13) 0%, transparent 100%)',
  TRAPPED_SHORT:       'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(249,115,22,0.13) 0%, transparent 100%)',
  RANGING:             'none',
  NEUTRAL:             'none',
};

// ── Thin top accent strip per state ──────────────────────────────────────────
const STATE_ACCENT_COLOR = {
  BUILDING_LONG:       '#059669',
  CONFIRMED_LONG:      '#10b981',
  CONTINUING_LONG:     '#10b981',
  PULLBACK_LONG:       '#f59e0b',
  DEEP_PULLBACK_LONG:  '#d97706',
  EXHAUSTED_LONG:      '#ca8a04',
  BUILDING_SHORT:      '#e11d48',
  CONFIRMED_SHORT:     '#f43f5e',
  CONTINUING_SHORT:    '#f43f5e',
  PULLBACK_SHORT:      '#f59e0b',
  DEEP_PULLBACK_SHORT: '#d97706',
  EXHAUSTED_SHORT:     '#ca8a04',
  INVALIDATED:         '#475569',
  TRAPPED_LONG:        '#f97316',
  TRAPPED_SHORT:       '#f97316',
  RANGING:             '#334155',
  NEUTRAL:             '#1e293b',
};

const QUALIFIER_COLOR = {
  strengthening: 'text-emerald-400',
  weakening:     'text-rose-400',
  stretched:     'text-amber-400',
  holding:       'text-slate-400',
  neutral:       'text-slate-500',
};

const SESSION_BADGE = {
  opening:      { label: 'Opening',      title: 'Opening Range',      color: 'bg-amber-950/80 border border-amber-800/40 text-amber-300' },
  primary:      { label: 'Primary',      title: 'Primary Window',     color: 'bg-emerald-950/80 border border-emerald-800/40 text-emerald-300' },
  lull:         { label: 'Lull',         title: 'Midday Lull',        color: 'bg-slate-800/80 border border-slate-700/40 text-slate-400' },
  secondary:    { label: 'Secondary',    title: 'Secondary Window',   color: 'bg-emerald-950/80 border border-emerald-800/40 text-emerald-300' },
  close:        { label: 'Square-off',   title: 'Square-off Zone',    color: 'bg-rose-950/80 border border-rose-800/40 text-rose-300' },
  closed:       { label: 'Closed',       title: 'Market Closed',      color: 'bg-slate-800/80 border border-slate-700/40 text-slate-500' },
  waiting:      { label: 'Waiting…',     title: 'Waiting for open',   color: 'bg-slate-800/80 border border-slate-700/40 text-slate-500' },
  disconnected: { label: 'Disconnected', title: 'Kite Disconnected',  color: 'bg-rose-950/80 border border-rose-800/40 text-rose-400' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function stateLabel(state) {
  return (state ?? 'NEUTRAL')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function marketStateDescription(state, biasAlign) {
  const s      = state ?? 'NEUTRAL';
  const isLong  = s.includes('LONG');
  const isShort = s.includes('SHORT');
  const aligned = biasAlign?.aligned;
  const counter = biasAlign?.counter;

  const htfBull = (isLong && aligned) || (isShort && counter);
  const htfBear = (isShort && aligned) || (isLong && counter);
  const trend   = htfBull ? 'Uptrend' : htfBear ? 'Downtrend' : null;

  let phase;
  if      (s === 'CONFIRMED_LONG'  || s === 'BUILDING_LONG'  || s === 'CONTINUING_LONG')
    phase = htfBull ? 'Momentum Phase'    : 'Counter Rally';
  else if (s === 'PULLBACK_LONG')
    phase = htfBull ? 'Pullback'          : 'Dead-cat Bounce';
  else if (s === 'DEEP_PULLBACK_LONG')
    phase = htfBull ? 'Deep Pullback'     : 'Failed Rally';
  else if (s === 'EXHAUSTED_LONG')
    phase = 'Bullish Exhaustion';
  else if (s === 'CONFIRMED_SHORT' || s === 'BUILDING_SHORT' || s === 'CONTINUING_SHORT')
    phase = htfBear ? 'Momentum Phase'    : 'Counter Sell';
  else if (s === 'PULLBACK_SHORT')
    phase = htfBear ? 'Bounce / Pullback' : 'Failed Breakdown';
  else if (s === 'DEEP_PULLBACK_SHORT')
    phase = htfBear ? 'Deep Bounce'       : 'Failed Breakdown';
  else if (s === 'EXHAUSTED_SHORT')
    phase = 'Bearish Exhaustion';
  else if (s === 'TRAPPED_LONG')  phase = 'Long Squeeze';
  else if (s === 'TRAPPED_SHORT') phase = 'Short Squeeze';
  else if (s === 'RANGING')       phase = 'Range Bound';
  else return stateLabel(s);

  return trend ? `${trend} · ${phase}` : phase;
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

// ── Settings schema ───────────────────────────────────────────────────────────
const SETTINGS_SCHEMA = [
  { key: 'activeTf',               label: 'Chart TF',               type: 'select', options: [{ v: '5minute', l: '5m → 15m bias' }, { v: '15minute', l: '15m → 1hr bias' }] },
  { key: 'adxStrong',              label: 'ADX strong trend',        type: 'number', min: 15, max: 40 },
  { key: 'adxForming',             label: 'ADX trend forming',       type: 'number', min: 10, max: 30 },
  { key: 'rsiBull',                label: 'RSI bull zone (above)',   type: 'number', min: 50, max: 80 },
  { key: 'rsiBear',                label: 'RSI bear zone (below)',   type: 'number', min: 20, max: 50 },
  { key: 'candleStrengthImpulsive',label: 'Candle strength impulse', type: 'number', min: 0.5, max: 3, step: 0.1 },
  { key: 'confirmationCandles',    label: 'Confirmation candles',    type: 'number', min: 1, max: 4 },
  { key: 'scoreSmoothing',         label: 'Score smoothing (EMA)',   type: 'number', min: 1, max: 5 },
  { key: 'staleGuardCandles',      label: 'Stale guard candles',     type: 'number', min: 4, max: 20 },
  { key: 'buildingThreshold',      label: 'Building threshold',      type: 'number', min: 40, max: 70 },
  { key: 'confirmedThreshold',     label: 'Confirmed threshold',     type: 'number', min: 50, max: 80 },
  { key: 'optionsOverlay',         label: 'Options overlay',         type: 'boolean' },
  { key: 'sessionGateOpening',     label: 'Opening session gate',    type: 'select', options: [{ v: 'suppress', l: 'Suppress' }, { v: 'warn', l: 'Warn only' }, { v: 'allow', l: 'Allow' }] },
  { key: 'sessionGateLull',        label: 'Lull session gate',       type: 'select', options: [{ v: 'suppress', l: 'Suppress' }, { v: 'warn', l: 'Warn only' }, { v: 'allow', l: 'Allow' }] },
];

// ── Settings flyout ───────────────────────────────────────────────────────────
function SettingsFlyout({ settings, onClose, onSave }) {
  const [local,  setLocal]  = useState(settings ?? {});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#0e1218]/97 backdrop-blur-sm rounded-xl overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-5">
        <div className="space-y-0.5">
          <span className="text-sm font-semibold text-white">Third Eye Settings</span>
          <p className="text-[10px] font-mono text-slate-500">Engine parameters</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3">
        {SETTINGS_SCHEMA.map(({ key, label, type, options, min, max, step }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400 flex-1">{label}</span>
            {type === 'boolean' ? (
              <button
                onClick={() => setLocal(p => ({ ...p, [key]: !p[key] }))}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border transition-colors ${
                  local[key]
                    ? 'bg-emerald-950 border-emerald-700/50 text-emerald-300'
                    : 'bg-[#1c2030] border-slate-600/40 text-slate-500'
                }`}
              >
                {local[key] ? 'ON' : 'OFF'}
              </button>
            ) : type === 'select' ? (
              <select
                value={local[key] ?? ''}
                onChange={e => setLocal(p => ({ ...p, [key]: e.target.value }))}
                className="bg-[#1c2030] border border-slate-600/40 text-slate-200 text-xs rounded-lg px-2 py-0.5 focus:outline-none focus:border-slate-500"
              >
                {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            ) : (
              <input
                type="number"
                value={local[key] ?? ''}
                min={min} max={max} step={step ?? 1}
                onChange={e => setLocal(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                className="bg-[#1c2030] border border-slate-600/40 text-slate-200 text-xs rounded-lg px-2 py-0.5 w-20 text-right focus:outline-none focus:border-slate-500"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50 transition-all"
          style={{ background: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 100%)' }}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-[#1c2030] hover:bg-[#252b3b] text-slate-300 text-xs rounded-lg transition-colors"
        >
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
  const [showSettings,   setShowSettings]   = useState(false);
  const [showBreakdown,  setShowBreakdown]  = useState(false);
  const [domData,        setDomData]        = useState(null);
  const [tf,            setTf]            = useState('5minute');
  const [underlying,    setUnderlying]    = useState('NIFTY');
  const [scanError,     setScanError]     = useState(null);
  const [scalpSetup,    setScalpSetup]    = useState(null);
  const [placing,       setPlacing]       = useState(false);
  const [placed,        setPlaced]        = useState(false);
  const [placedResult,  setPlacedResult]  = useState(null);
  const [skippedCandle, setSkippedCandle] = useState(null);
  const [setupHistory,  setSetupHistory]  = useState([]);
  const [scoreTrend,    setScoreTrend]    = useState(null);

  const [smoothedDomScore, setSmoothedDomScore] = useState(null);
  const domScoreHistRef  = useRef([]);          // rolling window of last 4 signed DOM scores

  const scanTimer        = useRef(null);
  const tickTimer        = useRef(null);
  const prevScalpRef     = useRef(null);
  const prevArbScoreRef  = useRef(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res  = await fetch('/api/third-eye/settings');
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data.settings);
      if (data.settings?.activeTf) setTf(data.settings.activeTf);
    } catch { /* silent */ }
  }, []);

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

      const newScore = data.biasArbitration?.finalScore ?? null;
      if (newScore != null && prevArbScoreRef.current != null) {
        const diff = newScore - prevArbScoreRef.current;
        setScoreTrend(diff > 0.4 ? 'up' : diff < -0.4 ? 'down' : 'flat');
      }
      prevArbScoreRef.current = newScore;

      if (data.scalpSetup) {
        const newTime = data.scalpSetup.candleTime;
        if (prevScalpRef.current !== newTime) {
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
      } else {
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

  const runTick = useCallback(async (activeUnderlying) => {
    try {
      const res = await fetch(`/api/third-eye/tick?underlying=${activeUnderlying}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.ltp) setLtp(data);
    } catch { /* silent */ }
  }, []);

  const isDevMode = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('dev');

  function isTradingWindow() {
    if (isDevMode) return true;
    const ist  = new Date(Date.now() + 5.5 * 3600 * 1000);
    const day  = ist.getUTCDay();
    if (day === 0 || day === 6) return false;
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return mins >= 540 && mins < 960;
  }

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  useEffect(() => {
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

  const handleSkip = useCallback(() => {
    setSkippedCandle(scalpSetup?.candleTime ?? null);
    setScalpSetup(null);
    setPlaced(false);
    setPlacedResult(null);
  }, [scalpSetup]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const state      = scanData?.state ?? 'NEUTRAL';
  const colors     = STATE_COLORS[state] ?? STATE_COLORS.NEUTRAL;
  const glow       = STATE_GLOW[state]   ?? 'none';
  const accentColor = STATE_ACCENT_COLOR[state] ?? '#1e293b';
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

  const biasArb   = scanData?.biasArbitration ?? null;
  const biasStyle = BIAS_STYLE[biasArb?.biasLabel ?? 'Neutral'] ?? BIAS_STYLE.Neutral;
  const confBadge = CONF_BADGE[biasArb?.confidence ?? 'low'] ?? CONF_BADGE.low;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="relative rounded-xl border border-slate-700/25 bg-[#131722] text-sm overflow-hidden flex flex-col">

      {/* ── Obsidian state glow bloom (absolute, behind content) ────────────── */}
      <div
        className="absolute top-0 left-0 right-0 h-48 pointer-events-none z-0 transition-all duration-1000"
        style={{ background: glow }}
      />

      {/* ── Top accent strip ────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 h-[2.5px] z-10 transition-all duration-700"
        style={{ background: `linear-gradient(to right, transparent 0%, ${accentColor}cc 30%, ${accentColor} 50%, ${accentColor}cc 70%, transparent 100%)` }}
      />

      {/* ── Settings overlay ────────────────────────────────────────────────── */}
      {showSettings && settings && (
        <SettingsFlyout
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
        />
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-between px-3 py-2.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-2 flex-wrap">
          <Eye size={13} className={`${colors.text} opacity-80`} />
          <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-slate-400 uppercase">
            Third Eye
          </span>
          {/* Underlying toggle */}
          <div className="flex items-center rounded-lg overflow-hidden border border-slate-700/40 text-[10px] font-mono">
            <button
              onClick={() => setUnderlying('NIFTY')}
              className={`px-2.5 py-0.5 transition-colors ${underlying === 'NIFTY' ? 'bg-indigo-600/80 text-white' : 'bg-[#1c2030]/60 text-slate-500 hover:text-slate-300'}`}
            >NIFTY</button>
            <button
              onClick={() => setUnderlying('SENSEX')}
              className={`px-2.5 py-0.5 transition-colors ${underlying === 'SENSEX' ? 'bg-indigo-600/80 text-white' : 'bg-[#1c2030]/60 text-slate-500 hover:text-slate-300'}`}
            >SENSEX</button>
          </div>
          {/* Session badge */}
          <span
            className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold ${sessBadge.color}`}
            title={sessBadge.title}
          >
            {sessBadge.label}
          </span>
          {/* TF toggle — clickable, saves a trip to settings */}
          <div className="flex items-center rounded-lg overflow-hidden border border-slate-700/40 text-[10px] font-mono">
            <button
              onClick={() => { setTf('5minute'); saveSettings({ ...settings, activeTf: '5minute' }); }}
              className={`px-2 py-0.5 transition-colors ${tf === '5minute' ? 'bg-indigo-600/80 text-white' : 'bg-[#1c2030]/60 text-slate-500 hover:text-slate-300'}`}
              title="5-minute candles, 15-minute trend bias"
            >5m</button>
            <button
              onClick={() => { setTf('15minute'); saveSettings({ ...settings, activeTf: '15minute' }); }}
              className={`px-2 py-0.5 transition-colors ${tf === '15minute' ? 'bg-indigo-600/80 text-white' : 'bg-[#1c2030]/60 text-slate-500 hover:text-slate-300'}`}
              title="15-minute candles, 1-hour trend bias"
            >15m</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scanData?.marketHours !== undefined && (
            scanData.marketHours
              ? <Wifi size={11} className="text-emerald-500/60" />
              : <WifiOff size={11} className="text-slate-700" />
          )}
          {loading && <RefreshCw size={11} className="text-slate-600 animate-spin" />}
          <button
            onClick={() => setShowSettings(true)}
            className="text-slate-600 hover:text-slate-300 transition-colors"
            title="Third Eye Settings"
          >
            <Settings size={12} />
          </button>
        </div>
      </div>

      {/* ── Tier 1: Aggregated Verdict Hero ──────────────────────────────────── */}
      <div className="relative z-10 px-4 py-4 border-b border-white/[0.04] space-y-3">

        {/* Row 1: Verdict label + live price */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm ${biasArb?.conflict ? 'bg-amber-400 animate-pulse' : (biasStyle.dot ?? 'bg-slate-500')}`} />
              <span className={`text-lg font-bold leading-none tracking-tight ${biasArb?.conflict ? 'text-amber-300' : biasStyle.text}`}>
                {biasArb?.conflict ? 'Mixed Signals' : (biasArb?.biasLabel ?? stateLabel(state))}
              </span>
              {scoreTrend && scoreTrend !== 'flat' && (
                <span className={`text-sm font-bold leading-none ${scoreTrend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {scoreTrend === 'up' ? '↑' : '↓'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap pl-0.5">
              <span className="text-[11px] text-slate-400 leading-none">
                {marketStateDescription(state, biasAlign)}
              </span>
              {scanData?.qualifier && scanData.qualifier !== 'neutral' && (
                <span className={`text-[10px] font-semibold ${qualColor}`}>· {scanData.qualifier}</span>
              )}
            </div>
          </div>
          {ltpDisplay && (
            <div className="text-right shrink-0">
              <span className="text-xl font-bold tabular-nums text-white leading-none">
                {fmt(ltpDisplay, 1)}
              </span>
            </div>
          )}
        </div>

        {/* Row 2: Score bar + score number + confidence */}
        {biasArb && (
          <div className="flex items-center gap-3">
            <VerdictBar score={biasArb.finalScore} conflict={biasArb.conflict} height="h-2" />
            <span className={`text-sm font-bold shrink-0 w-9 text-right tabular-nums ${biasArb.conflict ? 'text-amber-400' : biasStyle.score}`}>
              {biasArb.finalScore > 0 ? '+' : ''}{biasArb.finalScore}
            </span>
            <span className={`text-[9px] font-semibold px-2.5 py-0.5 rounded-full border shrink-0 tracking-wide ${confBadge}`}>
              {(biasArb.confidence ?? 'low').toUpperCase()}
            </span>
          </div>
        )}

        {/* Row 3: Meta chips — session · HTF alignment · time · VWAP */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${sessBadge.color}`} title={sessBadge.title}>
            {sessBadge.label}
          </span>
          {biasAlign && state !== 'NEUTRAL' && state !== 'RANGING' && (
            <span
              title={biasAlign.aligned ? 'Higher timeframe aligned — trade with the trend.' : biasAlign.counter ? 'Higher timeframe opposing — counter-trend, be cautious.' : 'Higher timeframe neutral.'}
              className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${
                biasAlign.aligned ? 'bg-emerald-950/60 border-emerald-800/40 text-emerald-300' :
                biasAlign.counter ? 'bg-rose-950/60 border-rose-800/40 text-rose-300' :
                'bg-slate-800/60 border-slate-700/40 text-slate-400'
              }`}
            >
              {biasTf} {biasAlign.label}
            </span>
          )}
          {scanData?.candlesInState != null && (
            <span className="text-[9px] text-slate-500" title="How long the engine has been in this state.">
              {elapsed(scanData.candlesInState, tf)} in state
            </span>
          )}
          {vwapVal && (
            <span className="text-[9px] text-slate-500" title="Volume Weighted Average Price">
              VWAP <span className="text-slate-300 tabular-nums font-medium">{fmt(vwapVal, 0)}</span>
            </span>
          )}
        </div>

        {/* Row 4: Commentary */}
        {commentary && (commentary.headline || commentary.watch || commentary.risk) && (
          <div className="space-y-1.5 pt-0.5 border-t border-white/[0.04]">
            {commentary.headline && (
              <p className="text-[12px] font-semibold text-white/90 leading-snug">
                {commentary.headline}
              </p>
            )}
            {commentary.watch && (
              <p className="text-[11px] text-slate-400 leading-snug flex gap-1.5">
                <span className="text-sky-400 shrink-0 mt-px">→</span>
                <span>{commentary.watch}</span>
              </p>
            )}
            {commentary.risk && (
              <p className="text-[11px] text-slate-500 leading-snug flex gap-1.5">
                <span className="text-rose-400/60 shrink-0 mt-px">✕</span>
                <span>{commentary.risk}</span>
              </p>
            )}
          </div>
        )}

        {/* Row 5: DOM alert — invalidation / wall note */}
        {(domData?.invalidation || domData?.wallNote) && (
          <div className="flex items-start gap-2 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-3 py-2">
            <span className="text-amber-400/80 text-[11px] shrink-0 mt-px">⚠</span>
            <span className="text-[11px] text-amber-200/70 leading-relaxed">
              {domData.invalidation ?? domData.wallNote}
            </span>
          </div>
        )}
      </div>

      {/* ── Tier 2: Bias Breakdown (collapsible) ─────────────────────────────── */}
      <div className="relative z-10 border-b border-white/[0.04]">
        <button
          onClick={() => setShowBreakdown(p => !p)}
          className="w-full px-4 py-2 flex items-center justify-between text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          <span className="font-medium tracking-wide">
            Bias Breakdown
            {biasArb?.agreementNote && <span className="ml-1.5 text-slate-600">· {biasArb.agreementNote}</span>}
          </span>
          {showBreakdown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {showBreakdown && biasArb?.engines && (
          <div className="px-4 pb-4 space-y-2.5">
            {Object.entries(biasArb.engines).map(([key, eng]) => {
              const meta  = ENGINE_META[key] ?? { label: key, tip: '' };
              const score = eng.available ? eng.score : 0;
              const bull  = score >= 0;
              const pct   = Math.min(50, Math.abs(score) * 5);
              const grad  = !eng.available ? null
                : bull ? 'linear-gradient(to right,#065f46,#34d399)'
                       : 'linear-gradient(to right,#9f1239,#fb7185)';
              const engStyle = BIAS_STYLE[eng.label] ?? BIAS_STYLE.Neutral;
              return (
                <div key={key} className="flex items-center gap-3" title={meta.tip}>
                  <span className="text-[10px] text-slate-400 w-16 shrink-0">{meta.label}</span>
                  <div className="relative flex-1 bg-white/[0.05] rounded-full overflow-hidden h-[5px]">
                    <div className="absolute inset-y-0 w-px bg-slate-600/30" style={{ left: '50%' }} />
                    {score !== 0 && grad && (
                      <div className="absolute inset-y-0 transition-all duration-700" style={{
                        background: grad,
                        ...(bull ? { left: '50%', width: `${pct}%` } : { right: `${50-pct}%`, width: `${pct}%` }),
                      }} />
                    )}
                  </div>
                  <span className={`text-[10px] font-medium w-8 text-right shrink-0 tabular-nums ${eng.available ? engStyle.score : 'text-slate-700'}`}>
                    {eng.available ? (score > 0 ? '+' : '') + score : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── DOM data (headless — supplies domData via onData callback) ─────────── */}
      <DomPressureStrip underlying={underlying} devMode={isDevMode} onData={data => {
        setDomData(data);
        if (data?.available && data.score != null) {
          const signed = data.direction === 'bull' ? data.score
                       : data.direction === 'bear' ? -data.score : 0;
          const hist = domScoreHistRef.current;
          hist.push(signed);
          if (hist.length > 4) hist.shift();
          const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
          setSmoothedDomScore(parseFloat(avg.toFixed(1)));
        }
      }} headless={true} />


      {/* ── Setup Zone ──────────────────────────────────────────────────────── */}
      <div className="relative z-10">
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
      </div>

      {/* ── Outside trading window ───────────────────────────────────────────── */}
      {!loading && !scanData && !scanError && !isTradingWindow() && (
        <div className="relative z-10 px-3 py-5 text-center space-y-1.5">
          <p className="text-xs text-slate-500 font-semibold">Third Eye is dormant</p>
          <p className="text-[10px] font-mono text-slate-700">Active 9:00 – 16:00 IST, Mon–Fri</p>
        </div>
      )}

      {/* ── Scan error ──────────────────────────────────────────────────────── */}
      {scanError && (
        <div className="relative z-10 px-3 py-2 border-t border-rose-900/20 bg-rose-950/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <WifiOff size={10} className="text-rose-500 flex-shrink-0" />
            <span className="text-[11px] text-rose-400 font-mono truncate">{scanError.message}</span>
          </div>
          {scanError.isAuth && (
            <a
              href="/settings"
              className="text-[10px] text-indigo-400 hover:text-indigo-200 whitespace-nowrap font-mono underline flex-shrink-0 transition-colors"
            >
              Reconnect →
            </a>
          )}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      {lastScan && (
        <div className="relative z-10 px-3 py-1.5 text-[9px] font-mono text-slate-700 border-t border-white/[0.03] flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-slate-700 inline-block" />
          Updated {lastScan.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      )}
    </div>
  );
}
