'use client';
// ─── IntelligencePill ─────────────────────────────────────────────────────────
// Persistent bottom-left pill on the chart.
// Collapsed: ● Regime  |  ● Zone context  [risk score]
// Expanded:  regime · zone structure · agent verdicts · market context
// Direction-agnostic — shows market facts, not order intent.

import { useState } from 'react';

const SCORE_BANDS = [
  { max: 30,  label: 'Clean',     color: 'text-emerald-400' },
  { max: 60,  label: 'Caution',   color: 'text-amber-400'   },
  { max: 100, label: 'High Risk', color: 'text-orange-400'  },
  { max: Infinity, label: 'Danger', color: 'text-red-400'   },
];
function scoreBand(score) {
  return SCORE_BANDS.find(b => score <= b.max) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

const VERDICT_DOT = { clear: 'bg-emerald-400', caution: 'bg-amber-400', warning: 'bg-orange-400', danger: 'bg-red-500' };
const CONF_COLOR  = { HIGH: 'text-emerald-400', MEDIUM: 'text-amber-400', LOW: 'text-slate-400' };

const REGIME_STYLE = {
  TREND_DAY_UP:     { text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Trend Up'       },
  TREND_DAY_DOWN:   { text: 'text-red-400',     dot: 'bg-red-400',     label: 'Trend Down'     },
  SHORT_SQUEEZE:    { text: 'text-emerald-300', dot: 'bg-emerald-300', label: 'Short Squeeze'  },
  LONG_LIQUIDATION: { text: 'text-red-300',     dot: 'bg-red-300',     label: 'Long Liq.'      },
  RANGE_DAY:        { text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'Range'           },
  TRAP_DAY:         { text: 'text-amber-300',   dot: 'bg-amber-300',   label: 'Trap'            },
  BREAKOUT_DAY:     { text: 'text-sky-400',     dot: 'bg-sky-400',     label: 'Breakout'        },
  LOW_VOL_DRIFT:    { text: 'text-slate-400',   dot: 'bg-slate-400',   label: 'Low Vol'         },
};

// ── Zone context — direction-agnostic market structure facts ─────────────────
const RES = { dot: 'bg-red-400',      text: 'text-red-400',      border: 'border-red-500/30'      };
const SUP = { dot: 'bg-emerald-400',  text: 'text-emerald-400',  border: 'border-emerald-500/30'  };
const AMB = { dot: 'bg-amber-400',    text: 'text-amber-400',    border: 'border-amber-500/30'    };
const SLT = { dot: 'bg-slate-400',    text: 'text-slate-400',    border: 'border-slate-500/30'    };

function getZoneContext(station) {
  const zoneState = station?.zoneState;
  const zone      = station?.nearestStation;

  if (!zoneState || !zone) return { ...SLT, label: 'Open Space', sub: 'No zones detected nearby', desc: 'Station agent has not detected any S/R zones within range.' };

  const price = `₹${zone.price.toFixed(0)}`;
  const dist  = zone.distance != null ? `${zone.distance.toFixed(1)}%` : null;
  const isRes = zone.type === 'RESISTANCE';

  if (zone.distance > 2) return { ...SLT, label: 'Open Space', sub: dist ? `Next zone ${dist} away` : null, desc: `Nearest zone at ${price} is ${dist} away — price is in open space with no nearby structure.` };

  switch (zoneState) {
    case 'INSIDE_ZONE':
      return { ...AMB, label: 'Inside Zone', sub: `${isRes ? 'Resistance' : 'Support'} ${price}`, desc: `Price is inside a ${isRes ? 'resistance' : 'support'} zone at ${price}. Structure is unclear — wait for a confirmed break in either direction.` };
    case 'REJECTION':
      return {
        ...(isRes ? RES : SUP),
        label: isRes ? 'Rejection at Resistance' : 'Bounce at Support',
        sub: `${price} · ${dist}`,
        desc: isRes
          ? `Price wicked into resistance at ${price} and rejected — sellers defending the zone. Watch for continuation lower.`
          : `Price wicked into support at ${price} and bounced — buyers defending the zone. Watch for continuation higher.`,
      };
    case 'FAILED_BREAK':
      return { ...AMB, label: isRes ? 'Failed Breakout' : 'Failed Breakdown', sub: `at ${price}`, desc: `Price briefly broke ${isRes ? 'above resistance' : 'below support'} at ${price} but reversed back inside — the break did not hold. Zone is still intact.` };
    case 'BREAK_RETEST':
      return {
        ...(isRes ? SUP : RES),
        label: isRes ? 'Resistance → Support' : 'Support → Resistance',
        sub: `Retesting ${price}`,
        desc: isRes
          ? `Prior resistance at ${price} was broken and is being retested as support — classic flip. Bulls look for hold here.`
          : `Prior support at ${price} was broken and is being retested as resistance — classic flip. Bears look for rejection here.`,
      };
    case 'BROKEN':
      return {
        ...(isRes ? SUP : RES),
        label: isRes ? 'Resistance Broken' : 'Support Broken',
        sub: `${price} · ${dist} away`,
        desc: isRes
          ? `Resistance at ${price} has been broken — price is now above. Watch for retest or continuation higher.`
          : `Support at ${price} has been broken — price is now below. Watch for retest or continuation lower.`,
      };
    case 'AT_ZONE':
      return { ...(isRes ? RES : SUP), label: isRes ? 'At Resistance' : 'At Support', sub: `${price} · q${zone.quality ?? '?'}/10`, desc: isRes ? `Price is at resistance ${price} (quality ${zone.quality}/10). Watch for rejection or breakout.` : `Price is at support ${price} (quality ${zone.quality}/10). Watch for bounce or breakdown.` };
    case 'APPROACHING':
    default:
      return { ...(isRes ? RES : SUP), label: isRes ? 'Nearing Resistance' : 'Nearing Support', sub: `${price} · ${dist}`, desc: isRes ? `Price approaching resistance at ${price}, ${dist} above.` : `Price approaching support at ${price}, ${dist} below.` };
  }
}

function AgentRow({ label, agent }) {
  if (!agent || agent.unavailable) return null;
  const dot = VERDICT_DOT[agent.verdict] ?? 'bg-slate-400';
  const topBehavior = agent.behaviors?.find(b => b.severity === 'danger' || b.severity === 'warning') ?? agent.behaviors?.[0];
  return (
    <div className="flex items-start gap-2 py-1 border-b border-white/[0.05] last:border-0">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${dot}`} />
      <div className="min-w-0">
        <span className="text-[10px] font-semibold text-slate-300">{label}</span>
        {topBehavior && <p className="text-[10px] text-slate-500 truncate">{topBehavior.title}</p>}
      </div>
      <span className="ml-auto text-[10px] text-slate-500 flex-shrink-0">{agent.riskScore ?? 0}</span>
    </div>
  );
}

export default function IntelligencePill({ intelligence, bottomOffset = 16 }) {
  const [expanded, setExpanded] = useState(false);
  const [scoreHover, setScoreHover] = useState(false);

  if (!intelligence) return null;

  const { riskScore, agents, regime, niftyContext } = intelligence;
  const band        = scoreBand(riskScore ?? 0);
  const regimeKey   = regime?.regime;
  const regimeStyle = regimeKey && regimeKey !== 'INITIALIZING'
    ? (REGIME_STYLE[regimeKey] ?? { text: 'text-slate-400', dot: 'bg-slate-400', label: regimeKey })
    : { text: 'text-slate-500', dot: 'bg-slate-600', label: 'No Regime' };

  const zone = getZoneContext(agents?.station);

  return (
    <div className="absolute left-14 z-20 select-none" style={{ bottom: bottomOffset }}>

      {/* ── Expanded card ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="mb-1.5 w-64 bg-[#0a0e1a]/95 border border-white/[0.10] rounded-xl shadow-2xl p-3 backdrop-blur-sm">

          {/* Regime */}
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/[0.06]">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Regime</span>
            <span className={`text-[10px] font-semibold ml-auto ${regimeStyle.text}`}>{regimeStyle.label}</span>
            {regime?.confidence && (
              <span className={`text-[10px] font-bold ${CONF_COLOR[regime.confidence] ?? 'text-slate-400'}`}>{regime.confidence}</span>
            )}
          </div>

          {/* Zone structure */}
          <div className="mb-2 pb-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${zone.dot}`} />
              <span className={`text-[11px] font-semibold ${zone.text}`}>{zone.label}</span>
              {zone.sub && <span className="text-[10px] text-slate-500 ml-auto">{zone.sub}</span>}
            </div>
            {zone.desc && <p className="text-[10px] text-slate-400 pl-3 leading-relaxed">{zone.desc}</p>}
          </div>

          {/* Agent verdicts */}
          <div className="mb-2 pb-1 border-b border-white/[0.06]">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Agent Analysis</p>
            <AgentRow label="Behavioral"   agent={agents?.behavioral} />
            <AgentRow label="Structure"    agent={agents?.structure}  />
            <AgentRow label="Pattern"      agent={agents?.pattern}    />
            <AgentRow label="Station S/R"  agent={agents?.station}    />
            {agents?.oi && <AgentRow label="Open Interest" agent={agents.oi} />}
          </div>

          {/* Market context */}
          {niftyContext?.sentiment && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-slate-500">Market bias</span>
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

      {/* ── Collapsed pill ─────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-[#0a0e1a]/90 hover:bg-[#0a0e1a] transition-colors shadow-lg ${zone.border}`}
      >
        {/* Regime */}
        {regimeStyle && (
          <>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${regimeStyle.dot}`} />
            <span className={`text-[11px] font-semibold ${regimeStyle.text}`}>{regimeStyle.label}</span>
            <span className="w-px h-3 bg-white/20 flex-shrink-0" />
          </>
        )}

        {/* Zone context */}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${zone.dot}`} />
        <span className={`text-[11px] font-semibold ${zone.text}`}>{zone.label}</span>
        {zone.sub && <span className="text-[10px] text-slate-500">{zone.sub}</span>}

        {/* Risk score */}
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
