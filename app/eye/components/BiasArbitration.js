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
  'Strong Bullish': { text: 'text-emerald-300', bar: 'bg-emerald-500', dot: 'bg-emerald-400' },
  'Bullish':        { text: 'text-emerald-400', bar: 'bg-emerald-600', dot: 'bg-emerald-500' },
  'Neutral':        { text: 'text-slate-400',   bar: 'bg-slate-500',   dot: 'bg-slate-500'   },
  'Bearish':        { text: 'text-rose-400',     bar: 'bg-rose-600',    dot: 'bg-rose-500'    },
  'Strong Bearish': { text: 'text-rose-300',     bar: 'bg-rose-500',    dot: 'bg-rose-400'    },
};

const CONF_BADGE = {
  high:   'bg-amber-900/60 text-amber-300',
  medium: 'bg-slate-700/60 text-slate-300',
  low:    'bg-slate-800/60 text-slate-500',
};

// Center-origin bar: positive fills right of center, negative fills left of center
function CenterBar({ score, barClass, height = 'h-1.5' }) {
  const pct = Math.min(50, Math.abs(score) * 5); // max 50% of total width each side
  const isBull = score >= 0;
  return (
    <div className={`relative w-full bg-slate-800 rounded-full overflow-hidden ${height}`}>
      <div className="absolute inset-y-0 w-px bg-slate-600/60" style={{ left: '50%' }} />
      {score !== 0 && (
        <div
          className={`absolute inset-y-0 ${barClass} transition-all duration-700`}
          style={isBull
            ? { left: '50%',           width: `${pct}%` }
            : { right: `${50 - pct}%`, width: `${pct}%` }
          }
        />
      )}
    </div>
  );
}

export default function BiasArbitration({ data }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;

  const { finalScore, biasLabel, confidence, conflict, engines, agreementNote } = data;
  const style = BIAS_STYLE[biasLabel] ?? BIAS_STYLE.Neutral;

  return (
    <div className="border-t border-slate-700/40 px-3 py-2 space-y-1.5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${conflict ? 'bg-amber-400 animate-pulse' : style.dot}`} />
          <span className="text-[9px] font-mono font-semibold text-slate-500 uppercase tracking-wide">
            Bias Arbitration
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${CONF_BADGE[confidence] ?? CONF_BADGE.low}`}>
            {confidence.toUpperCase()}
          </span>
          <button onClick={() => setOpen(p => !p)} className="text-slate-600 hover:text-slate-400">
            {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
      </div>

      {/* Headline + score */}
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-mono font-bold shrink-0 ${conflict ? 'text-amber-400' : style.text}`}>
          {conflict ? 'Mixed Signals' : biasLabel}
        </span>
        <CenterBar score={finalScore} barClass={conflict ? 'bg-amber-500' : style.bar} />
        <span className="text-[10px] font-mono text-slate-400 shrink-0 w-8 text-right">
          {finalScore > 0 ? '+' : ''}{finalScore}
        </span>
      </div>

      {/* Agreement note */}
      <p className="text-[10px] font-mono text-slate-500 leading-snug">{agreementNote}</p>

      {/* Collapsible engine breakdown */}
      {open && engines && (
        <div className="pt-1.5 space-y-1.5 border-t border-slate-800/60">
          {Object.entries(engines).map(([key, eng]) => {
            const es = BIAS_STYLE[eng.label] ?? BIAS_STYLE.Neutral;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-500 w-16 shrink-0">
                  {ENGINE_LABEL[key]}
                </span>
                <CenterBar
                  score={eng.available ? eng.score : 0}
                  barClass={eng.available ? es.bar : 'bg-slate-700'}
                  height="h-1"
                />
                <span className={`text-[9px] font-mono w-9 text-right shrink-0 ${eng.available ? es.text : 'text-slate-600'}`}>
                  {eng.available ? (eng.score > 0 ? '+' : '') + eng.score : 'n/a'}
                </span>
                <span className="text-[9px] font-mono text-slate-700 w-6 text-right shrink-0">
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
