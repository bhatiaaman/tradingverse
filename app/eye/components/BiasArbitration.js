'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const ENGINE_LABEL = {
  dom:        'DOM',
  structure:  'Structure',
  momentum:   'Momentum',
  options:    'Options',
  indicators: 'Indicators',
};

const BIAS_STYLE = {
  'Strong Bullish': { text: 'text-emerald-300', score: 'text-emerald-300', dot: 'bg-emerald-400', grad: ['#065f46', '#34d399'] },
  'Bullish':        { text: 'text-emerald-400', score: 'text-emerald-400', dot: 'bg-emerald-500', grad: ['#065f46', '#10b981'] },
  'Neutral':        { text: 'text-slate-400',   score: 'text-slate-400',   dot: 'bg-slate-500',  grad: ['#334155', '#64748b'] },
  'Bearish':        { text: 'text-rose-400',     score: 'text-rose-400',   dot: 'bg-rose-500',   grad: ['#9f1239', '#fb7185'] },
  'Strong Bearish': { text: 'text-rose-300',     score: 'text-rose-300',   dot: 'bg-rose-400',   grad: ['#881337', '#f43f5e'] },
};

const CONF_BADGE = {
  high:   { cls: 'bg-amber-950 border-amber-700/50 text-amber-300' },
  medium: { cls: 'bg-slate-800 border-slate-600/50 text-slate-300' },
  low:    { cls: 'bg-slate-900 border-slate-700/40 text-slate-500' },
};

// Center-origin bar — gradient via inline styles to avoid Tailwind JIT issues
function CenterBar({ score, isBull, conflict = false, height = 'h-2' }) {
  const pct = Math.min(50, Math.abs(score) * 5);
  const grad = conflict
    ? 'linear-gradient(to right, #92400e, #f59e0b)'
    : isBull
      ? 'linear-gradient(to right, #065f46, #34d399)'
      : 'linear-gradient(to right, #9f1239, #fb7185)';
  return (
    <div className={`relative w-full bg-white/[0.06] rounded-full overflow-hidden ${height}`}>
      <div className="absolute inset-y-0 w-px bg-slate-600/40" style={{ left: '50%' }} />
      {score !== 0 && (
        <div
          className="absolute inset-y-0 transition-all duration-700"
          style={{
            background: grad,
            ...(isBull
              ? { left: '50%', width: `${pct}%` }
              : { right: `${50 - pct}%`, width: `${pct}%` }),
          }}
        />
      )}
    </div>
  );
}

export default function BiasArbitration({ data, trend }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;

  const { finalScore, biasLabel, confidence, conflict, engines, agreementNote } = data;
  const style   = BIAS_STYLE[biasLabel] ?? BIAS_STYLE.Neutral;
  const isBull  = finalScore >= 0;
  const badge   = CONF_BADGE[confidence] ?? CONF_BADGE.low;

  return (
    <div className="border-t border-white/[0.04] px-3 py-2.5 space-y-2">

      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${conflict ? 'bg-amber-400 animate-pulse' : style.dot}`} />
          <span className="text-[9px] font-mono font-semibold text-slate-400 uppercase tracking-[0.15em]">
            Bias Consensus
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border font-bold ${badge.cls}`}>
            {confidence.toUpperCase()}
          </span>
          {trend && trend !== 'flat' && (
            <span className={`text-[11px] font-bold leading-none ${trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {trend === 'up' ? '↑' : '↓'}
            </span>
          )}
          <button
            onClick={() => setOpen(p => !p)}
            className="text-slate-700 hover:text-slate-400 transition-colors"
          >
            {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
      </div>

      {/* Bias label + center bar + score */}
      <div className="flex items-center gap-2.5">
        <span className={`text-xs font-bold font-mono shrink-0 min-w-[90px] ${conflict ? 'text-amber-400' : style.text}`}>
          {conflict ? 'Mixed Signals' : biasLabel}
        </span>
        <CenterBar score={finalScore} isBull={isBull} conflict={conflict} height="h-2" />
        <span className={`text-[11px] font-mono font-bold shrink-0 w-8 text-right tabular-nums ${conflict ? 'text-amber-400' : style.score}`}>
          {finalScore > 0 ? '+' : ''}{finalScore}
        </span>
      </div>

      {/* Agreement note */}
      <p className="text-[10px] font-mono text-slate-400 leading-relaxed">{agreementNote}</p>

      {/* Collapsible engine breakdown */}
      {open && engines && (
        <div className="pt-2 space-y-2 border-t border-white/[0.04]">
          {Object.entries(engines).map(([key, eng]) => {
            const es    = BIAS_STYLE[eng.label] ?? BIAS_STYLE.Neutral;
            const eBull = eng.score >= 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-400 w-16 shrink-0">
                  {ENGINE_LABEL[key]}
                </span>
                <CenterBar
                  score={eng.available ? eng.score : 0}
                  isBull={eBull}
                  height="h-1.5"
                />
                <span className={`text-[9px] font-mono w-9 text-right shrink-0 tabular-nums font-semibold ${eng.available ? es.score : 'text-slate-600'}`}>
                  {eng.available ? (eng.score > 0 ? '+' : '') + eng.score : 'n/a'}
                </span>
                <span className="text-[9px] font-mono text-slate-500 w-6 text-right shrink-0 tabular-nums">
                  {Math.round(eng.weight * 100)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
