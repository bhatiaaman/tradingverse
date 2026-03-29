'use client';
// ─── IntelligencePill ─────────────────────────────────────────────────────────
// Persistent bottom-left pill on the chart.
// Collapsed: ● Scenario Label · CONFIDENCE  [score]
// Expanded:  full card — regime, scenario, per-agent verdicts, NIFTY context

import { useState } from 'react';

// Score band labels shown on hover
const SCORE_BANDS = [
  { max: 30,  label: 'Clean',     color: 'text-emerald-400' },
  { max: 60,  label: 'Caution',   color: 'text-amber-400'   },
  { max: 100, label: 'High Risk', color: 'text-orange-400'  },
  { max: Infinity, label: 'Danger', color: 'text-red-400'   },
];

function scoreBand(score) {
  return SCORE_BANDS.find(b => score <= b.max) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

const SCENARIO_COLORS = {
  green: { dot: 'bg-emerald-400', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  red:   { dot: 'bg-red-400',     text: 'text-red-400',     border: 'border-red-500/30'     },
  yellow:{ dot: 'bg-amber-400',   text: 'text-amber-400',   border: 'border-amber-500/30'   },
  slate: { dot: 'bg-slate-400',   text: 'text-slate-400',   border: 'border-slate-500/30'   },
};

const VERDICT_DOT = { clear: 'bg-emerald-400', caution: 'bg-amber-400', warning: 'bg-orange-400', danger: 'bg-red-500' };
const CONF_COLOR  = { HIGH: 'text-emerald-400', MEDIUM: 'text-amber-400', LOW: 'text-slate-400' };

function AgentRow({ label, agent }) {
  if (!agent || agent.unavailable) return null;
  const dot = VERDICT_DOT[agent.verdict] ?? 'bg-slate-400';
  const topBehavior = agent.behaviors?.find(b => b.severity === 'danger' || b.severity === 'warning')
    ?? agent.behaviors?.[0];
  return (
    <div className="flex items-start gap-2 py-1 border-b border-white/[0.05] last:border-0">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${dot}`} />
      <div className="min-w-0">
        <span className="text-[10px] font-semibold text-slate-300">{label}</span>
        {topBehavior && (
          <p className="text-[10px] text-slate-500 truncate">{topBehavior.title}</p>
        )}
      </div>
      <span className="ml-auto text-[10px] text-slate-500 flex-shrink-0">{agent.riskScore ?? 0}</span>
    </div>
  );
}

export default function IntelligencePill({ intelligence, bottomOffset = 16 }) {
  const [expanded, setExpanded] = useState(false);
  const [scoreHover, setScoreHover] = useState(false);

  if (!intelligence?.scenario) return null;

  const { scenario, riskScore, agents, regime, niftyContext } = intelligence;
  const isUnclear = !scenario.label || scenario.scenario === 'UNCLEAR';
  const colors    = SCENARIO_COLORS[scenario.color] ?? SCENARIO_COLORS.slate;
  const band      = scoreBand(riskScore ?? 0);
  const confCls   = CONF_COLOR[scenario.confidence] ?? 'text-slate-400';

  return (
    <div
      className="absolute left-3 z-20 select-none"
      style={{ bottom: bottomOffset }}
    >
      {/* ── Expanded card ─────────────────────────────────────────────── */}
      {expanded && (
        <div className="mb-1.5 w-64 bg-[#0a0e1a]/95 border border-white/[0.10] rounded-xl shadow-2xl p-3 backdrop-blur-sm">

          {/* Regime row */}
          {regime?.regime && regime.regime !== 'INITIALIZING' && (
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/[0.06]">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Regime</span>
              <span className="text-[10px] font-semibold text-white ml-auto">{regime.label ?? regime.regime}</span>
              {regime.confidence && (
                <span className={`text-[10px] font-bold ${CONF_COLOR[regime.confidence] ?? 'text-slate-400'}`}>
                  {regime.confidence}
                </span>
              )}
            </div>
          )}

          {/* Scenario summary */}
          <div className="mb-2 pb-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
              <span className={`text-[11px] font-semibold ${colors.text}`}>{scenario.label ?? scenario.scenario}</span>
              {scenario.confidence && (
                <span className={`text-[10px] font-bold ml-auto ${confCls}`}>{scenario.confidence}</span>
              )}
            </div>
            {scenario.summary && (
              <p className="text-[10px] text-slate-400 pl-3">{scenario.summary}</p>
            )}
          </div>

          {/* Agent verdicts */}
          <div className="mb-2 pb-1 border-b border-white/[0.06]">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Agent Analysis</p>
            <AgentRow label="Behavioral"  agent={agents?.behavioral} />
            <AgentRow label="Structure"   agent={agents?.structure}  />
            <AgentRow label="Pattern"     agent={agents?.pattern}    />
            <AgentRow label="Station S/R" agent={agents?.station}    />
            {agents?.oi && <AgentRow label="Open Interest" agent={agents.oi} />}
          </div>

          {/* NIFTY context */}
          {niftyContext?.sentiment && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-slate-500">Market</span>
              <span className={`font-semibold ml-auto ${
                niftyContext.sentiment.intradayBias === 'BULLISH' ? 'text-emerald-400' :
                niftyContext.sentiment.intradayBias === 'BEARISH' ? 'text-red-400' : 'text-slate-400'
              }`}>{niftyContext.sentiment.intradayBias}</span>
              {niftyContext.vix != null && (
                <span className="text-slate-500">VIX {niftyContext.vix.toFixed(1)}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Collapsed pill ────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-[#0a0e1a]/90 hover:bg-[#0a0e1a] transition-colors shadow-lg ${colors.border}`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
        {isUnclear ? (
          <span className="text-[11px] text-slate-400 font-medium">Analysing…</span>
        ) : (
          <>
            <span className={`text-[11px] font-semibold ${colors.text}`}>{scenario.label}</span>
            {scenario.confidence && (
              <span className={`text-[10px] font-bold ${confCls}`}>{scenario.confidence}</span>
            )}
          </>
        )}

        {/* Risk score badge */}
        <div
          className="relative ml-1"
          onMouseEnter={() => setScoreHover(true)}
          onMouseLeave={() => setScoreHover(false)}
        >
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.07] ${band.color}`}>
            {riskScore ?? 0}
          </span>
          {scoreHover && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap bg-[#1e293b] border border-white/10 rounded px-2 py-1 text-[10px] text-slate-300 shadow-xl z-30">
              Risk score: {riskScore} — <span className={band.color}>{band.label}</span>
              <div className="text-slate-500 mt-0.5">0–30 Clean · 31–60 Caution · 61+ High</div>
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
