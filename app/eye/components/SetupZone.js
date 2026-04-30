'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Zap, X, ChevronDown, ChevronUp, Clock } from 'lucide-react';

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
  const isBull = setup.direction === 'bull';
  const accent = isBull ? 'emerald' : 'rose';
  return (
    <div className={`rounded-xl border border-${accent}-500/30 bg-${accent}-500/[0.03] backdrop-blur-md px-4 py-3.5 space-y-2 shadow-lg relative overflow-hidden`}>
      <div className={`absolute top-0 left-0 w-1 h-full bg-${accent}-500/40`} />
      <div className="flex items-center gap-2.5">
        <div className={`p-1 rounded-full bg-${accent}-500/20`}>
          <Zap size={13} className={`text-${accent}-400`} />
        </div>
        <span className={`text-[13px] font-black tracking-tight text-${accent}-300 uppercase`}>{setup.optType} Execution Live</span>
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06] ml-auto">
          <Clock size={10} className="text-slate-500" />
          <span className="text-[10px] font-mono font-bold text-slate-400 tabular-nums">{istTime(setup.candleTime)}</span>
        </div>
      </div>
      {placedResult?.symbol && (
        <p className="text-[11px] font-bold font-mono text-slate-100/90 tracking-tight pl-0.5">{placedResult.symbol}</p>
      )}
      {placedResult?.entryLimit && (
        <div className="flex gap-5 text-[10px] font-bold font-mono text-slate-500 pl-0.5 pt-1">
          <div className="flex flex-col gap-0.5">
            <span className="uppercase text-[8px] tracking-widest text-slate-600">Entry</span>
            <span className="text-slate-100 text-[12px] tabular-nums">₹{placedResult.entryLimit}</span>
          </div>
          {placedResult.slTrigger && (
            <div className="flex flex-col gap-0.5">
              <span className="uppercase text-[8px] tracking-widest text-rose-500/60">Protection</span>
              <span className="text-rose-400 text-[12px] tabular-nums">₹{placedResult.slTrigger}</span>
            </div>
          )}
        </div>
      )}
      {placedResult?.slError && (
        <p className="text-[10px] font-bold text-amber-500/80 pl-0.5 mt-1 animate-pulse">⚠️ {placedResult.slError}</p>
      )}
    </div>
  );
}

// ── Active setup card ─────────────────────────────────────────────────────────
function SetupCard({ setup, onPlace, onSkip, placing, underlying }) {
  const defaultQty = underlying === 'SENSEX' ? 20 : 65;
  const lotStep    = underlying === 'SENSEX' ? 20 : 65;
  const [qty,     setQty]     = useState(defaultQty);
  const [confirm, setConfirm] = useState(false);
  const isBull    = setup.direction === 'bull';
  const typeLabel = TYPE_LABEL[setup.type] ?? setup.type;

  const btnGrad = isBull
    ? 'linear-gradient(135deg, #065f46 0%, #10b981 100%)'
    : 'linear-gradient(135deg, #9f1239 0%, #f43f5e 100%)';

  return (
    <div className={`rounded-xl border ${isBull ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : 'border-rose-500/30 bg-rose-500/[0.03]'} backdrop-blur-md px-4 py-4 space-y-4 shadow-xl relative overflow-hidden`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${isBull ? 'bg-emerald-500/40' : 'bg-rose-500/40'}`} />

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`p-1.5 rounded-lg ${isBull ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
            {isBull ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-rose-400" />}
          </div>
          <div className="flex flex-col">
            <span className={`text-[13px] font-black tracking-tight leading-none ${isBull ? 'text-emerald-300' : 'text-rose-300'} uppercase`}>
              {setup.optType} Signal · {typeLabel}
            </span>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Found at {istTime(setup.candleTime)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {setup.confidence === 'high' && (
            <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-black tracking-widest">HIGH</span>
          )}
          <button onClick={onSkip} className="p-1 rounded-md text-slate-600 hover:text-slate-100 hover:bg-white/[0.05] transition-all">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Levels grid */}
      <div className="grid grid-cols-3 gap-3 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
        <div className="space-y-1">
          <div className="text-[9px] font-black text-slate-600 uppercase tracking-wider">{underlying} Spot</div>
          <div className="text-slate-100 font-black text-base tabular-nums leading-none tracking-tight">{fmt(setup.niftyPrice, 0)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Target</div>
          <div className="text-emerald-400 font-black text-base tabular-nums leading-none tracking-tight">+{setup.targetPts}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[9px] font-black text-rose-600 uppercase tracking-wider">Stop Loss</div>
          <div className="text-rose-400 font-black text-base tabular-nums leading-none tracking-tight">-{setup.slPts}</div>
        </div>
      </div>

      {/* ATM strike + session context */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
          <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-tight">
            Strike <span className="text-slate-200">{setup.strike} {setup.optType}</span>
          </span>
        </div>
        {setup.volumeSpike && (
          <span className="text-[9px] font-black text-indigo-400/90 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">⚡ Vol Spike</span>
        )}
      </div>

      {/* DOM verdict */}
      {setup.domVerdict && setup.domVerdict.level !== 'no-data' && (() => {
        const v = setup.domVerdict;
        const vStyle = {
          go:      { bg: 'bg-emerald-500/5 border-emerald-500/20', title: 'text-emerald-400', bar: 'bg-emerald-500/30' },
          wait:    { bg: 'bg-amber-500/5 border-amber-500/20',     title: 'text-amber-400',   bar: 'bg-amber-500/30' },
          caution: { bg: 'bg-amber-500/5 border-amber-500/20',     title: 'text-amber-500',   bar: 'bg-amber-500/30' },
          avoid:   { bg: 'bg-rose-500/5 border-rose-500/20',       title: 'text-rose-400',    bar: 'bg-rose-500/30' },
        }[v.level] ?? { bg: 'bg-slate-800/10 border-slate-700/20', title: 'text-slate-500',  bar: 'bg-slate-700/20' };

        return (
          <div className={`relative rounded-xl border p-3 space-y-2 overflow-hidden shadow-inner ${vStyle.bg}`}>
            <div className="absolute top-0 left-0 w-1 h-full shadow-sm" style={{ backgroundColor: vStyle.bar }} />
            <div className="flex items-center justify-between">
              <p className={`text-[11px] font-black leading-tight uppercase tracking-tight ${vStyle.title}`}>
                {v.icon} {v.message}
              </p>
              {v.confidence && (
                <span className="text-[9px] font-black px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-slate-400 uppercase tracking-widest">{v.confidence}</span>
              )}
            </div>
            <p className="text-[10px] font-bold text-slate-300 leading-snug tracking-tight">
              {v.action || v.meaning}
            </p>
            {v.invalidation && (
              <p className="text-[9px] font-bold text-amber-500/60 leading-tight">❗ {v.invalidation}</p>
            )}
          </div>
        );
      })()}

      {/* Qty + Place button */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex flex-col gap-0.5">
           <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest pl-1">Size</span>
           <input
            type="number"
            value={qty}
            min={lotStep} step={lotStep}
            onChange={e => setQty(Math.max(lotStep, parseInt(e.target.value) || lotStep))}
            className="w-16 bg-white/[0.03] border border-white/[0.06] text-white text-xs font-black font-mono rounded-lg px-2 py-1.5 text-right focus:outline-none focus:border-indigo-500/50 transition-all"
          />
        </div>
        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            className="flex-1 h-[38px] rounded-xl text-xs font-black text-white uppercase tracking-widest transition-all duration-300 shadow-lg active:scale-95 hover:brightness-110"
            style={{ background: btnGrad }}
          >
            Execute {setup.optType}
          </button>
        ) : (
          <div className="flex-1 flex gap-2 h-[38px]">
            <button
              onClick={() => { onPlace({ ...setup, qty }); setConfirm(false); }}
              disabled={placing}
              className="flex-1 rounded-xl text-[10px] font-black text-white uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50"
              style={{ background: placing ? '#334155' : btnGrad }}
            >
              {placing ? 'Transmitting…' : 'Confirm Order'}
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="px-4 rounded-xl text-[10px] font-black bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] text-slate-400 uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── History row ───────────────────────────────────────────────────────────────
function HistoryRow({ entry }) {
  const isBull = entry.direction === 'bull';
  return (
    <div className="flex items-center gap-2 text-[10px] font-mono py-1">
      <span className={isBull ? 'text-emerald-500' : 'text-rose-500'}>
        {isBull ? '▲' : '▼'}
      </span>
      <span className="text-slate-400">{entry.optType}</span>
      <span className="text-slate-500">{TYPE_LABEL[entry.type] ?? entry.type}</span>
      <span className={entry.confidence === 'high' ? 'text-amber-400/80' : 'text-slate-600'}>
        {entry.confidence === 'high' ? 'HIGH' : 'MED'}
      </span>
      <span className="ml-auto text-slate-600 tabular-nums">{istTime(entry.candleTime)}</span>
      <span className={
        entry.status === 'placed' ? 'text-emerald-600' : 'text-slate-700'
      }>
        {entry.status === 'placed' ? '✓' : '○'}
      </span>
    </div>
  );
}

// ── SetupZone ─────────────────────────────────────────────────────────────────
export default function SetupZone({
  setup, sessionPhase, placed, placedResult, placing,
  onPlace, onSkip, history, underlying, orHigh, orLow,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const sessInfo = SESSION_INFO[sessionPhase] ?? SESSION_INFO.closed;

  return (
    <div className="border-t border-white/[0.04]">

      {/* Header */}
      <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
        <span className="text-[9px] font-mono font-semibold text-slate-500 uppercase tracking-[0.15em]">
          Setups
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sessInfo.dot}`} />
          <span className={`text-[10px] font-mono ${sessInfo.color}`}>{sessInfo.label}</span>
        </div>
      </div>

      {/* OR range display */}
      {orHigh != null && orLow != null && (
        <div className="px-3 pb-1.5">
          <span className="text-[10px] font-mono text-slate-600">
            OR: <span className="text-slate-500 tabular-nums">{fmt(orLow, 0)}</span>
            <span className="text-slate-700"> – </span>
            <span className="text-slate-500 tabular-nums">{fmt(orHigh, 0)}</span>
          </span>
        </div>
      )}

      {/* Active setup / placed / placeholder */}
      <div className="px-3 pb-3">
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
          <div className="relative rounded-xl border border-dashed border-slate-800 bg-white/[0.01] p-4 flex flex-col items-center justify-center text-center space-y-2 group">
            <div className="p-2 rounded-full bg-slate-800/30 group-hover:bg-slate-800/50 transition-colors">
              <Eye size={16} className="text-slate-600" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Awaiting Setup</p>
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter leading-tight max-w-[200px]">
                Scanning VWAP, Momentum, Power Candles, and ATR Expansion zones in real-time.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Signal history */}
      {history.length > 0 && (
        <div className="border-t border-white/[0.04]">
          <button
            onClick={() => setHistoryOpen(p => !p)}
            className="w-full px-3 py-1.5 flex items-center justify-between text-[10px] font-mono text-slate-600 hover:text-slate-400 transition-colors"
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
