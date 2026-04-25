'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Zap, X, ChevronDown, ChevronUp, Clock } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, dec = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: dec });
}

function istTime(candleTime) {
  if (!candleTime) return '—';
  const d = new Date((candleTime + 19800) * 1000);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

const SESSION_INFO = {
  opening:      { label: 'Opening range — setups begin at 9:30', color: 'text-amber-400',  dot: 'bg-amber-400'  },
  primary:      { label: 'Primary window active',                 color: 'text-emerald-400', dot: 'bg-emerald-400' },
  lull:         { label: 'Midday lull — selective signals',       color: 'text-slate-400',  dot: 'bg-slate-400'  },
  secondary:    { label: 'Secondary window active',               color: 'text-emerald-400', dot: 'bg-emerald-400' },
  close:        { label: 'Square-off zone — setups paused',       color: 'text-rose-400',   dot: 'bg-rose-400'   },
  closed:       { label: 'Market closed',                         color: 'text-slate-600',  dot: 'bg-slate-600'  },
  waiting:      { label: 'Waiting for market open…',             color: 'text-slate-600',  dot: 'bg-slate-700'  },
  disconnected: { label: 'Kite disconnected',                     color: 'text-rose-400',   dot: 'bg-rose-400'   },
};

const TYPE_LABEL = {
  VWAP_CROSS:      'VWAP Cross',
  PULLBACK_RESUME: 'Pullback Resume',
  POWER_CANDLE:    'Power Candle',
  ATR_EXPANSION:   'ATR Expansion',
  MOMENTUM_DRIVE:  'Momentum Drive',
  ORB:             'OR Breakout',
};

// ── Placed result card ────────────────────────────────────────────────────────
function PlacedCard({ setup, placedResult }) {
  const isBull  = setup.direction === 'bull';
  const accent  = isBull ? 'emerald' : 'rose';
  return (
    <div className={`rounded-lg border border-${accent}-600/50 bg-${accent}-950/60 px-3 py-2.5 space-y-1`}>
      <div className="flex items-center gap-2">
        <Zap size={12} className={`text-${accent}-400`} />
        <span className={`text-xs font-bold text-${accent}-300`}>{setup.optType} order placed</span>
        <span className="text-[10px] font-mono text-slate-500 ml-auto">{istTime(setup.candleTime)}</span>
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

// ── Active setup card ─────────────────────────────────────────────────────────
function SetupCard({ setup, onPlace, onSkip, placing, underlying }) {
  const defaultQty = underlying === 'SENSEX' ? 20 : 65;
  const lotStep    = underlying === 'SENSEX' ? 20 : 65;
  const [qty, setQty] = useState(defaultQty);
  const isBull  = setup.direction === 'bull';
  const accent  = isBull ? 'emerald' : 'rose';
  const typeLabel = TYPE_LABEL[setup.type] ?? setup.type;

  return (
    <div className={`rounded-lg border border-${accent}-600/40 bg-${accent}-950/40 px-3 py-2.5 space-y-2`}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isBull
            ? <TrendingUp  size={12} className="text-emerald-400" />
            : <TrendingDown size={12} className="text-rose-400" />}
          <span className={`text-xs font-bold text-${accent}-300`}>{setup.optType} — {typeLabel}</span>
          {setup.confidence === 'high' && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-900/60 text-amber-300 font-mono">HIGH</span>
          )}
          {setup.volumeSpike && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-violet-900/60 text-violet-300 font-mono">⚡ Vol</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-600">{istTime(setup.candleTime)}</span>
          <button onClick={onSkip} className="text-slate-600 hover:text-slate-400">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Levels */}
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        <div className="space-y-0.5">
          <div className="text-slate-500">{underlying}</div>
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

      {/* ATM strike + session */}
      <div className="text-[10px] font-mono text-slate-500">
        ATM {setup.strike} {setup.optType}
        {setup.sessionPhase && (
          <span className="ml-1 text-slate-600">
            · {setup.sessionPhase === 'primary' ? 'Primary' : setup.sessionPhase === 'secondary' ? 'Secondary' : setup.sessionPhase}
          </span>
        )}
      </div>

      {/* ORB context */}
      {setup.type === 'ORB' && setup.orHigh != null && (
        <div className="text-[10px] font-mono text-indigo-400/80 bg-indigo-900/20 rounded px-2 py-1">
          Opening range {fmt(setup.orLow, 0)} – {fmt(setup.orHigh, 0)}
          <span className="text-slate-500 ml-1">· breakout above/below range</span>
        </div>
      )}

      {/* ATR expansion zone */}
      {setup.type === 'ATR_EXPANSION' && setup.atrExpansionHigh != null && (
        <div className="text-[10px] font-mono text-violet-400/80 bg-violet-900/20 rounded px-2 py-1">
          Expansion zone {fmt(setup.atrExpansionLow, 0)} – {fmt(setup.atrExpansionHigh, 0)}
          <span className="text-slate-500 ml-1">· momentum or wait for pullback</span>
        </div>
      )}

      {/* DOM verdict */}
      {setup.domVerdict && setup.domVerdict.level !== 'no-data' && (
        <div className={`rounded px-2 py-1.5 space-y-0.5 ${
          setup.domVerdict.level === 'go'      ? 'bg-emerald-900/25 border border-emerald-800/40' :
          setup.domVerdict.level === 'wait'    ? 'bg-amber-900/25 border border-amber-800/40' :
          setup.domVerdict.level === 'caution' ? 'bg-amber-900/20 border border-amber-900/30' :
          setup.domVerdict.level === 'avoid'   ? 'bg-rose-900/25 border border-rose-800/40' :
          'bg-slate-800/40 border border-slate-700/30'
        }`}>
          <div className={`text-[10px] font-semibold font-mono ${
            setup.domVerdict.level === 'go'      ? 'text-emerald-300' :
            setup.domVerdict.level === 'wait'    ? 'text-amber-300' :
            setup.domVerdict.level === 'caution' ? 'text-amber-400' :
            setup.domVerdict.level === 'avoid'   ? 'text-rose-300' :
            'text-slate-500'
          }`}>
            {setup.domVerdict.icon} {setup.domVerdict.message}
          </div>
          {setup.domVerdict.detail && (
            <div className="text-[9px] font-mono text-slate-500">{setup.domVerdict.detail}</div>
          )}
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
          className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-50
            ${isBull ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-rose-700 hover:bg-rose-600 text-white'}`}
        >
          {placing ? 'Placing…' : `BUY ${setup.optType}`}
        </button>
      </div>
    </div>
  );
}

// ── History row ───────────────────────────────────────────────────────────────
function HistoryRow({ entry }) {
  const isBull = entry.direction === 'bull';
  return (
    <div className="flex items-center gap-2 text-[10px] font-mono py-0.5">
      <span className={isBull ? 'text-emerald-500' : 'text-rose-500'}>
        {isBull ? '▲' : '▼'}
      </span>
      <span className="text-slate-400">{entry.optType}</span>
      <span className="text-slate-500">{TYPE_LABEL[entry.type] ?? entry.type}</span>
      <span className={entry.confidence === 'high' ? 'text-amber-400/80' : 'text-slate-600'}>
        {entry.confidence === 'high' ? 'HIGH' : 'MED'}
      </span>
      <span className="ml-auto text-slate-600">{istTime(entry.candleTime)}</span>
      <span className={
        entry.status === 'placed' ? 'text-emerald-600' :
        entry.status === 'skipped' ? 'text-slate-700' : 'text-slate-700'
      }>
        {entry.status === 'placed' ? '✓' : '○'}
      </span>
    </div>
  );
}

// ── SetupZone (main export) ───────────────────────────────────────────────────
export default function SetupZone({
  setup, sessionPhase, placed, placedResult, placing,
  onPlace, onSkip, history, underlying, orHigh, orLow,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const sessInfo = SESSION_INFO[sessionPhase] ?? SESSION_INFO.closed;
  const hasSignal = setup || (placed && placedResult);

  return (
    <div className="border-t border-slate-700/40">
      {/* ── Header: label + session status ─────────────────────────────────── */}
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wide">
          Setups
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${sessInfo.dot}`} />
          <span className={`text-[10px] font-mono ${sessInfo.color}`}>{sessInfo.label}</span>
        </div>
      </div>

      {/* ── OR range display (when valid) ──────────────────────────────────── */}
      {orHigh != null && orLow != null && (
        <div className="px-3 pb-1">
          <span className="text-[10px] font-mono text-slate-600">
            OR: <span className="text-slate-500">{fmt(orLow, 0)}</span>
            <span className="text-slate-600"> – </span>
            <span className="text-slate-500">{fmt(orHigh, 0)}</span>
          </span>
        </div>
      )}

      {/* ── Active setup or placeholder ─────────────────────────────────────── */}
      <div className="px-3 pb-2">
        {placed && placedResult ? (
          <PlacedCard setup={setup ?? {}} placedResult={placedResult} />
        ) : setup ? (
          <SetupCard
            setup={setup}
            onPlace={onPlace}
            onSkip={onSkip}
            placing={placing}
            underlying={underlying}
          />
        ) : (
          <p className="text-[10px] text-slate-700 font-mono">
            Watching · VWAP Cross · Momentum Drive · Power Candle · Pullback Resume · ATR Expansion · ORB
          </p>
        )}
      </div>

      {/* ── Signal history ──────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="border-t border-slate-800/60">
          <button
            onClick={() => setHistoryOpen(p => !p)}
            className="w-full px-3 py-1 flex items-center justify-between text-[10px] font-mono text-slate-600 hover:text-slate-400 transition-colors"
          >
            <span className="flex items-center gap-1">
              <Clock size={9} />
              History ({history.length})
            </span>
            {historyOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {historyOpen && (
            <div className="px-3 pb-2 divide-y divide-slate-800/40">
              {history.map((h, i) => <HistoryRow key={i} entry={h} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
