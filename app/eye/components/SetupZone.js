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
    <div className={`rounded-lg border border-${accent}-700/40 bg-${accent}-950/50 px-3 py-2.5 space-y-1.5`}>
      <div className="flex items-center gap-2">
        <Zap size={12} className={`text-${accent}-400`} />
        <span className={`text-xs font-bold text-${accent}-300`}>{setup.optType} order placed</span>
        <span className="text-[10px] font-mono text-slate-500 ml-auto tabular-nums">{istTime(setup.candleTime)}</span>
      </div>
      {placedResult?.symbol && (
        <p className="text-[11px] font-mono text-slate-300">{placedResult.symbol}</p>
      )}
      {placedResult?.entryLimit && (
        <div className="flex gap-4 text-[10px] font-mono text-slate-400">
          <span>Entry <span className="text-slate-200 font-bold tabular-nums">₹{placedResult.entryLimit}</span></span>
          {placedResult.slTrigger && <span>SL <span className="text-rose-300 font-bold tabular-nums">₹{placedResult.slTrigger}</span></span>}
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
  const [qty,     setQty]     = useState(defaultQty);
  const [confirm, setConfirm] = useState(false);
  const isBull    = setup.direction === 'bull';
  const typeLabel = TYPE_LABEL[setup.type] ?? setup.type;

  // Gradient button styles via inline style to avoid Tailwind JIT limitations
  const btnGrad = isBull
    ? 'linear-gradient(135deg, #065f46 0%, #059669 100%)'
    : 'linear-gradient(135deg, #9f1239 0%, #e11d48 100%)';
  const btnGradHover = isBull
    ? 'linear-gradient(135deg, #059669 0%, #34d399 100%)'
    : 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)';

  return (
    <div className={`rounded-lg border ${isBull ? 'border-emerald-700/40 bg-emerald-950/30' : 'border-rose-700/40 bg-rose-950/30'} px-3 py-2.5 space-y-2.5`}>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isBull
            ? <TrendingUp  size={12} className="text-emerald-400" />
            : <TrendingDown size={12} className="text-rose-400"   />}
          <span className={`text-xs font-bold ${isBull ? 'text-emerald-300' : 'text-rose-300'}`}>
            {setup.optType} — {typeLabel}
          </span>
          {setup.confidence === 'high' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-950 border border-amber-700/50 text-amber-300 font-mono font-bold">HIGH</span>
          )}
          {setup.volumeSpike && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-950 border border-violet-700/50 text-violet-300 font-mono">⚡ Vol</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-600 tabular-nums">{istTime(setup.candleTime)}</span>
          <button onClick={onSkip} className="text-slate-700 hover:text-slate-400 transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Levels grid */}
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        <div className="space-y-1">
          <div className="text-slate-600 uppercase tracking-[0.1em]">{underlying}</div>
          <div className="text-slate-100 font-bold text-[13px] tabular-nums">{fmt(setup.niftyPrice, 0)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-emerald-600 uppercase tracking-[0.1em]">Target +{setup.targetPts}</div>
          <div className="text-emerald-300 font-bold text-[13px] tabular-nums">{fmt(setup.niftyTarget, 0)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-rose-600 uppercase tracking-[0.1em]">SL -{setup.slPts}</div>
          <div className="text-rose-300 font-bold text-[13px] tabular-nums">{fmt(setup.niftySl, 0)}</div>
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
        <div className="text-[10px] font-mono text-indigo-400/80 bg-indigo-950/40 border border-indigo-800/30 rounded-lg px-2.5 py-1.5">
          Opening range <span className="tabular-nums">{fmt(setup.orLow, 0)}</span>
          <span className="text-slate-600"> – </span>
          <span className="tabular-nums">{fmt(setup.orHigh, 0)}</span>
          <span className="text-slate-600 ml-1">· breakout above/below range</span>
        </div>
      )}

      {/* ATR expansion zone */}
      {setup.type === 'ATR_EXPANSION' && setup.atrExpansionHigh != null && (
        <div className="text-[10px] font-mono text-violet-400/80 bg-violet-950/40 border border-violet-800/30 rounded-lg px-2.5 py-1.5">
          Expansion zone <span className="tabular-nums">{fmt(setup.atrExpansionLow, 0)}</span>
          <span className="text-slate-600"> – </span>
          <span className="tabular-nums">{fmt(setup.atrExpansionHigh, 0)}</span>
          <span className="text-slate-600 ml-1">· momentum or wait for pullback</span>
        </div>
      )}

      {/* DOM verdict */}
      {setup.domVerdict && setup.domVerdict.level !== 'no-data' && (() => {
        const v = setup.domVerdict;
        const levelStyle = {
          go:      { bg: 'bg-emerald-950/40 border-emerald-800/40', title: 'text-emerald-300' },
          wait:    { bg: 'bg-amber-950/40 border-amber-800/40',     title: 'text-amber-300'   },
          caution: { bg: 'bg-amber-950/30 border-amber-900/30',     title: 'text-amber-400'   },
          avoid:   { bg: 'bg-rose-950/40 border-rose-800/40',       title: 'text-rose-300'    },
        }[v.level] ?? { bg: 'bg-slate-800/40 border-slate-700/30', title: 'text-slate-500' };

        return (
          <div className={`rounded-lg border px-2.5 py-2 space-y-1.5 ${levelStyle.bg}`}>
            <div className="flex items-start justify-between gap-2">
              <p className={`text-[10px] font-semibold font-mono leading-snug ${levelStyle.title}`}>
                {v.icon} {v.message}
              </p>
              {v.confidence && (
                <span className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded-full border font-bold ${
                  v.confidence === 'high'   ? 'bg-amber-950 border-amber-700/50 text-amber-300' :
                  v.confidence === 'medium' ? 'bg-slate-800 border-slate-600/50 text-slate-300' :
                  'bg-slate-900 border-slate-700/40 text-slate-500'
                }`}>{v.confidence.toUpperCase()}</span>
              )}
            </div>
            {(v.bias || v.context) && (
              <div className="flex items-center gap-2 text-[9px] font-mono">
                {v.bias    && <span className="text-slate-400">{v.bias}</span>}
                {v.bias && v.context && <span className="text-slate-700">·</span>}
                {v.context && <span className="text-slate-500">{v.context}</span>}
              </div>
            )}
            <div className="space-y-0.5 text-[9px] font-mono text-slate-500">
              {v.meaning     && <p><span className="text-slate-600">Meaning  </span>{v.meaning}</p>}
              {v.implication && <p><span className="text-slate-600">→ </span>{v.implication}</p>}
              {v.action      && <p><span className="text-slate-600">Action   </span>{v.action}</p>}
            </div>
            {v.invalidation && (
              <p className="text-[9px] font-mono text-amber-600/80">❗ {v.invalidation}</p>
            )}
          </div>
        );
      })()}

      {/* Qty + Place button */}
      <div className="flex items-center gap-2 pt-0.5">
        <span className="text-[10px] text-slate-500 shrink-0 font-mono">Qty</span>
        <input
          type="number"
          value={qty}
          min={lotStep} step={lotStep}
          onChange={e => setQty(Math.max(lotStep, parseInt(e.target.value) || lotStep))}
          className="w-16 bg-[#1c2030] border border-white/[0.08] text-slate-200 text-xs font-mono rounded-lg px-2 py-1 text-right focus:outline-none focus:border-slate-500"
        />
        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            className="flex-1 py-2 rounded-lg text-xs font-bold text-white transition-all duration-200 shadow-md active:scale-[0.98]"
            style={{ background: btnGrad }}
            onMouseEnter={e => e.currentTarget.style.background = btnGradHover}
            onMouseLeave={e => e.currentTarget.style.background = btnGrad}
          >
            BUY {setup.optType}
          </button>
        ) : (
          <div className="flex-1 flex gap-1">
            <button
              onClick={() => { onPlace({ ...setup, qty }); setConfirm(false); }}
              disabled={placing}
              className="flex-1 py-2 rounded-lg text-xs font-bold text-white transition-all shadow-md disabled:opacity-50 active:scale-[0.98]"
              style={{ background: placing ? '#374151' : btnGrad }}
            >
              {placing ? 'Placing…' : 'Confirm · risk noted'}
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="px-3 py-2 rounded-lg text-xs bg-[#1c2030] hover:bg-[#252b3b] text-slate-400 transition-colors"
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
      <div className="px-3 pb-2.5">
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
          <p className="text-[10px] text-slate-700 font-mono leading-relaxed">
            Watching · VWAP Cross · Momentum Drive · Power Candle · Pullback Resume · ATR Expansion · ORB
          </p>
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
