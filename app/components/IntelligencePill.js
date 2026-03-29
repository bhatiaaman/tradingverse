'use client';
// ─── IntelligencePill ─────────────────────────────────────────────────────────
// Persistent bottom-left pill on the chart. Fully direction-agnostic.
// Collapsed: ● Regime  |  ● Zone context
// Expanded:  Regime · Zone · Market environment (VIX, sentiment, OI)

import { useState } from 'react';

const REGIME_STYLE = {
  TREND_DAY_UP:     { text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Trend Up'      },
  TREND_DAY_DOWN:   { text: 'text-red-400',     dot: 'bg-red-400',     label: 'Trend Down'    },
  SHORT_SQUEEZE:    { text: 'text-emerald-300', dot: 'bg-emerald-300', label: 'Short Squeeze' },
  LONG_LIQUIDATION: { text: 'text-red-300',     dot: 'bg-red-300',     label: 'Long Liq.'     },
  RANGE_DAY:        { text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'Range'          },
  TRAP_DAY:         { text: 'text-amber-300',   dot: 'bg-amber-300',   label: 'Trap'           },
  BREAKOUT_DAY:     { text: 'text-sky-400',     dot: 'bg-sky-400',     label: 'Breakout'       },
  LOW_VOL_DRIFT:    { text: 'text-slate-400',   dot: 'bg-slate-400',   label: 'Low Vol'        },
};

// Zone context — direction-agnostic market structure facts
const RES = { dot: 'bg-red-400',     text: 'text-red-400',     border: 'border-red-500/30'     };
const SUP = { dot: 'bg-emerald-400', text: 'text-emerald-400', border: 'border-emerald-500/30' };
const AMB = { dot: 'bg-amber-400',   text: 'text-amber-400',   border: 'border-amber-500/30'   };
const SLT = { dot: 'bg-slate-400',   text: 'text-slate-400',   border: 'border-slate-500/30'   };

function getZoneContext(station) {
  const zoneState = station?.zoneState;
  const zone      = station?.nearestStation;
  if (!zoneState || !zone) return { ...SLT, label: 'Open Space', sub: null, desc: 'No S/R zones detected nearby.' };

  const price = `₹${zone.price.toFixed(0)}`;
  const dist  = zone.distance != null ? `${zone.distance.toFixed(1)}%` : null;
  const isRes = zone.type === 'RESISTANCE';

  if (zone.distance > 2) return { ...SLT, label: 'Open Space', sub: dist ? `Next zone ${dist}` : null, desc: `Nearest zone at ${price} is ${dist} away — no nearby structure.` };

  switch (zoneState) {
    case 'INSIDE_ZONE':
      return { ...AMB, label: 'Inside Zone', sub: `${isRes ? 'Resistance' : 'Support'} ${price}`, desc: `Price is inside a ${isRes ? 'resistance' : 'support'} zone at ${price}. Wait for a confirmed break in either direction.` };
    case 'REJECTION':
      return { ...(isRes ? RES : SUP), label: isRes ? 'Rejection at Resistance' : 'Bounce at Support', sub: `${price} · ${dist}`, desc: isRes ? `Sellers defending resistance at ${price}. Watch for continuation lower.` : `Buyers defending support at ${price}. Watch for continuation higher.` };
    case 'FAILED_BREAK':
      return { ...AMB, label: isRes ? 'Failed Breakout' : 'Failed Breakdown', sub: `at ${price}`, desc: `Price briefly broke ${isRes ? 'above resistance' : 'below support'} at ${price} but reversed — zone is still intact.` };
    case 'BREAK_RETEST':
      return { ...(isRes ? SUP : RES), label: isRes ? 'Resistance → Support' : 'Support → Resistance', sub: `Retesting ${price}`, desc: isRes ? `Prior resistance at ${price} broken — retesting as support. Bulls watch for hold.` : `Prior support at ${price} broken — retesting as resistance. Bears watch for rejection.` };
    case 'BROKEN':
      return { ...(isRes ? SUP : RES), label: isRes ? 'Resistance Broken' : 'Support Broken', sub: `${price} · ${dist} away`, desc: isRes ? `Resistance at ${price} broken — price above. Watch for retest or continuation.` : `Support at ${price} broken — price below. Watch for retest or continuation.` };
    case 'AT_ZONE':
      return { ...(isRes ? RES : SUP), label: isRes ? 'At Resistance' : 'At Support', sub: `${price} · q${zone.quality ?? '?'}/10`, desc: isRes ? `Price at resistance ${price} (quality ${zone.quality}/10). Watch for rejection or breakout.` : `Price at support ${price} (quality ${zone.quality}/10). Watch for bounce or breakdown.` };
    case 'APPROACHING': default:
      return { ...(isRes ? RES : SUP), label: isRes ? 'Nearing Resistance' : 'Nearing Support', sub: `${price} · ${dist}`, desc: isRes ? `Approaching resistance at ${price}, ${dist} above.` : `Approaching support at ${price}, ${dist} below.` };
  }
}

// VIX classification
function vixLabel(vix) {
  if (vix == null) return null;
  if (vix < 13)  return { label: 'Calm',     color: 'text-emerald-400' };
  if (vix < 18)  return { label: 'Normal',   color: 'text-slate-400'   };
  if (vix < 25)  return { label: 'Elevated', color: 'text-amber-400'   };
  return              { label: 'High',      color: 'text-red-400'      };
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.05] last:border-0 text-[10px]">
      <span className="text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export default function IntelligencePill({ intelligence, bottomOffset = 16 }) {
  const [expanded, setExpanded] = useState(false);

  if (!intelligence) return null;

  const { agents, regime, sentiment, vix: rawVix, sector, niftyContext } = intelligence;

  const regimeKey   = regime?.regime;
  const regimeStyle = regimeKey && regimeKey !== 'INITIALIZING'
    ? (REGIME_STYLE[regimeKey] ?? { text: 'text-slate-400', dot: 'bg-slate-400', label: regimeKey })
    : { text: 'text-slate-500', dot: 'bg-slate-600', label: 'No Regime' };

  const zone = getZoneContext(agents?.station);

  // Use niftyContext VIX if available (always NIFTY VIX regardless of symbol), else fall back
  const vix    = niftyContext?.vix ?? rawVix;
  const vixCls = vixLabel(vix);

  // Intraday bias — from sentiment (direction-agnostic market lean)
  const intradayBias = sentiment?.intradayBias ?? niftyContext?.sentiment?.intradayBias;
  const biasCls = intradayBias === 'BULLISH' ? 'text-emerald-400' : intradayBias === 'BEARISH' ? 'text-red-400' : 'text-slate-400';

  // OI data (only for indices)
  const oi = agents?.oi;

  return (
    <div className="absolute left-14 z-20 select-none" style={{ bottom: bottomOffset }}>

      {/* ── Expanded card ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="mb-1.5 w-60 bg-[#0a0e1a]/95 border border-white/[0.10] rounded-xl shadow-2xl p-3 backdrop-blur-sm">

          {/* Regime */}
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/[0.06]">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Regime</span>
            <span className={`text-[10px] font-semibold ml-auto ${regimeStyle.text}`}>{regimeStyle.label}</span>
            {regime?.confidence && (
              <span className={`text-[10px] font-bold text-slate-500`}>{regime.confidence}</span>
            )}
          </div>

          {/* Zone structure */}
          <div className="mb-2 pb-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${zone.dot}`} />
              <span className={`text-[10px] font-semibold ${zone.text}`}>{zone.label}</span>
              {zone.sub && <span className="text-[10px] text-slate-500 ml-auto">{zone.sub}</span>}
            </div>
            {zone.desc && <p className="text-[10px] text-slate-400 pl-3 leading-relaxed">{zone.desc}</p>}
          </div>

          {/* Market environment — direction-agnostic */}
          <div className="mb-1 pb-1">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Market Environment</p>

            {vix != null && (
              <Row label="VIX">
                <span className={vixCls?.color}>{vix.toFixed(1)}</span>
                {vixCls && <span className="text-slate-500 ml-1">· {vixCls.label}</span>}
              </Row>
            )}

            {intradayBias && (
              <Row label="Intraday bias">
                <span className={biasCls}>{intradayBias}</span>
              </Row>
            )}

            {sector?.name && sector.change != null && (
              <Row label={sector.name}>
                <span className={sector.change >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
                </span>
              </Row>
            )}

            {/* OI snapshot — indices only */}
            {oi?.pcr != null && (
              <Row label="PCR">
                <span className={oi.pcr > 1.2 ? 'text-emerald-400' : oi.pcr < 0.8 ? 'text-red-400' : 'text-slate-300'}>
                  {oi.pcr.toFixed(2)}
                </span>
                <span className="text-slate-500 ml-1">· {oi.pcr > 1.2 ? 'Put heavy' : oi.pcr < 0.8 ? 'Call heavy' : 'Balanced'}</span>
              </Row>
            )}
            {oi?.maxPain != null && (
              <Row label="Max pain"><span className="text-slate-300">₹{oi.maxPain.toLocaleString()}</span></Row>
            )}
            {oi?.marketActivity?.activity && oi.marketActivity.activity !== 'Initializing' && (
              <Row label="OI activity"><span className="text-slate-300">{oi.marketActivity.activity}</span></Row>
            )}
          </div>
        </div>
      )}

      {/* ── Collapsed pill ─────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-[#0a0e1a]/90 hover:bg-[#0a0e1a] transition-colors shadow-lg ${zone.border}`}
      >
        {/* Regime */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${regimeStyle.dot}`} />
        <span className={`text-[11px] font-semibold ${regimeStyle.text}`}>{regimeStyle.label}</span>
        <span className="w-px h-3 bg-white/20 flex-shrink-0" />

        {/* Zone context */}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${zone.dot}`} />
        <span className={`text-[11px] font-semibold ${zone.text}`}>{zone.label}</span>
        {zone.sub && <span className="text-[10px] text-slate-500">{zone.sub}</span>}
      </button>
    </div>
  );
}
