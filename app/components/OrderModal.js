'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, TrendingUp, TrendingDown, Loader2, RefreshCw, LogIn, Brain, AlertTriangle, Target, ChevronDown, BarChart2 } from 'lucide-react';
import { nseStrikeSteps } from '@/app/lib/nseStrikeSteps';
import { useProviderStatus } from '@/app/lib/use-provider-status';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario Card (dark-only, used inside OrderModal analysis tab)
// ─────────────────────────────────────────────────────────────────────────────
const SCENARIO_COLORS = {
  red:    { bg: 'bg-red-500/10',   border: 'border-red-500/30',   bar: 'bg-red-400',   badge: 'bg-red-500/15 text-red-400 border-red-500/35',   dot: 'bg-red-400'   },
  green:  { bg: 'bg-green-500/10', border: 'border-green-500/30', bar: 'bg-green-400', badge: 'bg-green-500/15 text-green-400 border-green-500/35', dot: 'bg-green-400' },
  yellow: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', bar: 'bg-amber-400', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/35', dot: 'bg-amber-400' },
  slate:  { bg: 'bg-slate-500/10', border: 'border-slate-700/50', bar: 'bg-slate-600', badge: 'bg-slate-700/50 text-slate-400 border-slate-600/40',  dot: 'bg-slate-500' },
};
const CONFIDENCE_STYLE = { HIGH: 'text-emerald-400', MEDIUM: 'text-amber-400', LOW: 'text-slate-500' };

function ScenarioCard({ scenarioResult }) {
  const [open, setOpen] = useState(true);
  if (!scenarioResult || scenarioResult.scenario === 'UNCLEAR') return null;
  const { label, color, confidence, summary, forSignals, againstSignals, scenario } = scenarioResult;
  const isMomentum = scenario === 'MOMENTUM_LONG' || scenario === 'MOMENTUM_SHORT';
  if (isMomentum && confidence === 'LOW' && forSignals.length === 0) return null;
  const palette = SCENARIO_COLORS[color] ?? SCENARIO_COLORS.slate;
  return (
    <div className={`rounded-xl border ${palette.border} overflow-hidden`}>
      <div className={`h-0.5 ${palette.bar}`} />
      <div className={palette.bg}>
        <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Target size={13} className="text-indigo-400 flex-shrink-0" />
            <div className="text-left">
              <div className="text-xs font-bold text-white leading-tight">{label}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{summary}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            <span className={`text-[10px] font-bold tracking-wide ${CONFIDENCE_STYLE[confidence]}`}>{confidence}</span>
            <ChevronDown size={11} className={`text-slate-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {open && (forSignals?.length > 0 || againstSignals?.length > 0) && (
          <div className="px-3 pb-2.5 space-y-1">
            {forSignals?.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px]">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1 flex-shrink-0" />
                <span className="text-slate-300">{s.label}</span>
              </div>
            ))}
            {againstSignals?.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px]">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1 flex-shrink-0" />
                <span className="text-slate-400">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict Card — intraday regime × scenario alignment (ported from terminal)
// Dark-only (modal is always dark)
// ─────────────────────────────────────────────────────────────────────────────
const MODAL_REGIME_META = {
  TREND_DAY_UP:     { label: 'Trend Day ↑',     dot: 'bg-green-400'   },
  TREND_DAY_DOWN:   { label: 'Trend Day ↓',     dot: 'bg-red-400'     },
  RANGE_DAY:        { label: 'Range Day',        dot: 'bg-amber-400'   },
  BREAKOUT_DAY:     { label: 'Breakout Day',     dot: 'bg-blue-400'    },
  SHORT_SQUEEZE:    { label: 'Short Squeeze',    dot: 'bg-emerald-400' },
  LONG_LIQUIDATION: { label: 'Long Liquidation', dot: 'bg-red-500'     },
  TRAP_DAY:         { label: 'Trap Day ⚠',       dot: 'bg-orange-400'  },
  LOW_VOL_DRIFT:    { label: 'Low Vol Drift',    dot: 'bg-slate-400'   },
  INITIALIZING:     { label: 'Starting…',        dot: 'bg-slate-500'   },
};

const MODAL_ALIGN_STATUS = {
  ALIGNED:  { border: 'border-green-500/40',  bg: 'bg-green-500/8',  text: 'text-green-400',  label: 'Aligned',   action: 'Go ahead',      icon: '✓' },
  CAUTION:  { border: 'border-amber-500/40',  bg: 'bg-amber-500/8',  text: 'text-amber-400',  label: 'Caution',   action: 'Reduce size',   icon: '⚠' },
  CONFLICT: { border: 'border-orange-500/40', bg: 'bg-orange-500/8', text: 'text-orange-400', label: 'Conflict',  action: 'Skip or halve', icon: '↕' },
  DANGER:   { border: 'border-red-500/40',    bg: 'bg-red-500/8',    text: 'text-red-400',    label: 'High Risk', action: 'Avoid',         icon: '⛔' },
  NEUTRAL:  { border: 'border-white/10',      bg: 'bg-white/[0.02]', text: 'text-slate-400',  label: 'Neutral',   action: 'Scalp only',    icon: '–' },
};

const BULLISH_SCENARIOS = ['MOMENTUM_LONG',  'MEAN_REVERSION_BUY',  'REJECTION_BUY',  'BREAK_RETEST_LONG',  'BREAKOUT_LONG'];
const BEARISH_SCENARIOS = ['MOMENTUM_SHORT', 'MEAN_REVERSION_SELL', 'REJECTION_SELL', 'BREAK_RETEST_SHORT', 'BREAKDOWN_SHORT'];

function computeRegimeAlignment(regime, scenario, transactionType) {
  if (!scenario || scenario === 'UNCLEAR') return null;
  if (scenario === 'INSIDE_ZONE') {
    if (regime === 'TRAP_DAY')    return { status: 'DANGER',  msg: 'Price stuck in a zone on a trap day — high fakeout risk both ways. Stay flat.' };
    if (regime === 'BREAKOUT_DAY') return { status: 'CAUTION', msg: 'Breakout day active — wait for the zone to break with volume. Do not anticipate.' };
    return { status: 'CAUTION', msg: 'No trade until price breaks and holds outside the zone. Premature entry has low edge.' };
  }
  // All remaining scenarios need a valid regime
  if (!regime) return null;
  const bullish  = BULLISH_SCENARIOS.includes(scenario) || scenario === 'OPEN_SPACE_LONG';
  const bearish  = BEARISH_SCENARIOS.includes(scenario) || scenario === 'OPEN_SPACE_SHORT';
  const breakout = ['BREAKOUT_LONG','BREAK_RETEST_LONG','BREAKDOWN_SHORT','BREAK_RETEST_SHORT'].includes(scenario);
  const meanRev  = ['MEAN_REVERSION_BUY','MEAN_REVERSION_SELL','REJECTION_BUY','REJECTION_SELL'].includes(scenario);

  if (scenario === 'COUNTER_TREND') {
    const isSelling = transactionType === 'SELL';
    const isBuying  = transactionType === 'BUY';
    if (regime === 'TREND_DAY_DOWN') {
      if (isSelling) return { status: 'CAUTION',  msg: 'Market is trending down — confirms short. But support zone nearby may slow the move. Use tight stop.' };
      if (isBuying)  return { status: 'CONFLICT', msg: 'Buying against a downtrend into a support zone — low edge. Avoid or use very tight stop.' };
    }
    if (regime === 'TREND_DAY_UP') {
      if (isBuying)  return { status: 'CAUTION',  msg: 'Market is trending up — confirms long. But resistance zone nearby may cap the move. Use tight stop.' };
      if (isSelling) return { status: 'CONFLICT', msg: 'Shorting against an uptrend into a resistance zone — low edge. Avoid or use very tight stop.' };
    }
    if (regime === 'TRAP_DAY')  return { status: 'DANGER',  msg: 'Trap day makes fakeouts likely — zone conflicts are especially dangerous. Avoid.' };
    if (regime === 'RANGE_DAY') return { status: 'ALIGNED', msg: 'Range day — zones tend to hold. Counter-trend trade fits well here.' };
    return { status: 'CAUTION', msg: 'Trade goes against the zone signal. Confirm the zone has broken before entering.' };
  }
  if (regime === 'TREND_DAY_UP')     { if (bullish) return { status: 'ALIGNED',  msg: 'Trend day up confirms your long. Proceed at normal size.' };     if (bearish) return { status: 'CONFLICT', msg: 'Selling into an up-trend day. Halve size or skip.' }; }
  if (regime === 'TREND_DAY_DOWN')   { if (bearish) return { status: 'ALIGNED',  msg: 'Trend day down confirms your short. Proceed at normal size.' };  if (bullish) return { status: 'CONFLICT', msg: 'Buying into a down-trend day. Halve size or skip.' }; }
  if (regime === 'TRAP_DAY')         { if (breakout) return { status: 'DANGER',  msg: 'Breakouts are failing today. Skip or use tiny size.' };            if (meanRev)  return { status: 'ALIGNED', msg: 'Fades and mean reversion are the play on trap days.' }; return { status: 'CAUTION', msg: 'Trap day raises risk on all setups. Keep size small.' }; }
  if (regime === 'RANGE_DAY')        { if (breakout) return { status: 'CAUTION', msg: 'Wait for OR break + volume confirmation before entering.' }; return { status: 'NEUTRAL', msg: 'Scalp only — tight stops, no runners, fade the extremes.' }; }
  if (regime === 'SHORT_SQUEEZE')    { if (bearish)  return { status: 'DANGER',  msg: 'Active short squeeze — covering pressure drives prices up. Do not short.' }; if (bullish) return { status: 'CAUTION', msg: 'Squeeze may be near exhaustion. Wait for pullback.' }; }
  if (regime === 'LONG_LIQUIDATION') { if (bullish)  return { status: 'DANGER',  msg: 'Forced selling underway — longs still exiting. Do not buy.' };               if (bearish) return { status: 'CAUTION', msg: 'Liquidation near exhaustion — risk of sharp bounce. Tight stop.' }; }
  if (regime === 'BREAKOUT_DAY')     { if (breakout) return { status: 'ALIGNED', msg: 'Session character supports directional breakouts. Normal size.' };            if (meanRev)  return { status: 'CONFLICT', msg: 'Breakout days extend — fades carry extra risk.' }; return { status: 'NEUTRAL', msg: 'Session favors momentum over mean reversion.' }; }
  if (regime === 'LOW_VOL_DRIFT')    { return { status: 'CAUTION', msg: 'Low volume — setups lack follow-through. Scalp only or sit out.' }; }
  return null;
}

function getModalSectorAlign(bias, isBullish, isBearish) {
  if (!bias || bias === 'NEUTRAL') return null;
  if (bias === 'BULLISH' && isBullish) return 'confirm';
  if (bias === 'BULLISH' && isBearish) return 'conflict';
  if (bias === 'BEARISH' && isBearish) return 'confirm';
  if (bias === 'BEARISH' && isBullish) return 'conflict';
  return 'neutral';
}

function modalConfluenceIcon(align) {
  if (align === 'confirm')  return { icon: '✓', cls: 'text-green-400' };
  if (align === 'conflict') return { icon: '✗', cls: 'text-red-400'   };
  return { icon: '–', cls: 'text-slate-500' };
}

function ModalVerdictCard({ regimeData, scenarioResult, symbol, isLoading, sector, transactionType }) {
  const key      = symbol?.toUpperCase() === 'BANKNIFTY' ? 'BANKNIFTY' : 'NIFTY';
  const rawRegime = regimeData?.[key];
  const regime   = rawRegime && !rawRegime.error && rawRegime.regime !== 'INITIALIZING' ? rawRegime : null;
  const scenario = scenarioResult?.scenario;

  // Still loading with nothing to show yet
  if (isLoading && !regime && !scenarioResult) return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 flex items-center gap-2">
      <Loader2 size={13} className="animate-spin text-slate-500" />
      <span className="text-xs text-slate-400">Analyzing setup…</span>
    </div>
  );

  // Nothing loaded at all
  if (!regime && !scenarioResult) return null;

  const alignment = regime && scenario && scenario !== 'UNCLEAR'
    ? computeRegimeAlignment(regime.regime, scenario, transactionType)
    : null;

  // No clear alignment — show scenario or regime info as fallback
  if (!alignment) {
    const hasScenario = scenarioResult && scenario && scenario !== 'UNCLEAR';
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 space-y-1">
        {regime && (
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${MODAL_REGIME_META[regime.regime]?.dot ?? 'bg-slate-400'}`} />
            <span className="text-xs font-semibold text-slate-300">{MODAL_REGIME_META[regime.regime]?.label ?? regime.regime}</span>
            <span className="text-[10px] text-slate-500 ml-auto">Market regime</span>
          </div>
        )}
        {hasScenario ? (
          <p className="text-[11px] text-slate-400">{scenarioResult.label} — <span className="text-slate-500">{scenarioResult.confidence} confidence</span></p>
        ) : (
          <p className="text-[11px] text-slate-500">
            {isLoading ? 'Running scenario analysis…' : 'No clear setup — wait for better entry.'}
          </p>
        )}
      </div>
    );
  }

  const st        = MODAL_ALIGN_STATUS[alignment.status] ?? MODAL_ALIGN_STATUS.NEUTRAL;
  const isBullish = BULLISH_SCENARIOS.includes(scenario);
  const isBearish = BEARISH_SCENARIOS.includes(scenario);
  const sectorAlign = getModalSectorAlign(sector?.bias, isBullish, isBearish);

  return (
    <div className={`rounded-xl border-2 ${st.border} ${st.bg} overflow-hidden`}>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-base leading-none">{st.icon}</span>
          <span className={`text-sm font-black tracking-tight ${st.text}`}>{st.action}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.border} ${st.text}`}>{st.label}</span>
        </div>
        <p className={`text-[11px] font-medium leading-relaxed ${st.text} opacity-80`}>{alignment.msg}</p>
      </div>
      <div className={`px-3 py-1.5 border-t ${st.border} flex items-center gap-2 text-[10px] text-slate-500`}>
        {regime && (
          <>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${MODAL_REGIME_META[regime.regime]?.dot ?? 'bg-slate-400'}`} />
            <span>{MODAL_REGIME_META[regime.regime]?.label ?? regime.regime}</span>
            <span className="opacity-40">×</span>
          </>
        )}
        <span>{scenarioResult?.label}</span>
        {scenarioResult?.tradeIntent && (
          <span className="ml-auto opacity-70">{scenarioResult.tradeIntent}</span>
        )}
      </div>
      {sectorAlign && sectorAlign !== 'neutral' && sector?.name && (
        <div className={`px-3 py-1.5 border-t ${st.border} flex items-center gap-2 text-[10px] text-slate-500`}>
          {(() => {
            const { icon, cls } = modalConfluenceIcon(sectorAlign);
            return (
              <span className="flex items-center gap-1.5">
                <span className={`font-bold ${cls}`}>{icon}</span>
                <span>{sector.name} — {sector.bias?.toLowerCase()}</span>
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// interpretDepth — pure JS rules that turn depth numbers into trade insights
// Returns array of { level: 'warn'|'caution'|'good'|'info', text }
// ─────────────────────────────────────────────────────────────────────────────
function interpretDepth(depth, transactionType, orderType) {
  if (!depth) return [];
  const { buy, sell, bestBid, bestAsk, spread, spreadPct, totalBuyQty, totalSellQty, buyPct } = depth;
  const insights = [];
  const isBuy  = transactionType === 'BUY';
  const isLimit = orderType === 'LIMIT' || orderType === 'SL';

  // ── 1. Spread assessment ────────────────────────────────────────────────────
  if (spreadPct != null) {
    if (spreadPct <= 0.3) {
      insights.push({ level: 'good', text: `Tight spread (${spreadPct}%) — liquid market, market order is fine.` });
    } else if (spreadPct <= 1) {
      insights.push({ level: 'info', text: `Moderate spread (${spreadPct}%) — limit order preferred to save ₹${spread} per unit.` });
    } else if (spreadPct <= 2) {
      insights.push({ level: 'caution', text: `Wide spread (${spreadPct}%) — use a limit order, market order costs ₹${spread} extra per unit.` });
    } else {
      insights.push({ level: 'warn', text: `Very wide spread (${spreadPct}%) — avoid market orders. ₹${spread} per unit lost to spread alone.` });
    }
  }

  // ── 2. Pressure vs trade direction ─────────────────────────────────────────
  if (buyPct != null && totalBuyQty + totalSellQty > 0) {
    const sellPct = 100 - buyPct;
    if (isBuy && buyPct >= 65)  insights.push({ level: 'good',    text: `Depth supports your BUY — buyers ${buyPct}% of visible depth.` });
    if (isBuy && sellPct >= 65) insights.push({ level: 'caution', text: `Sellers dominate depth (${sellPct}%) — depth works against your BUY, price may face resistance.` });
    if (!isBuy && sellPct >= 65) insights.push({ level: 'good',   text: `Depth supports your SELL — sellers ${sellPct}% of visible depth.` });
    if (!isBuy && buyPct >= 65)  insights.push({ level: 'caution', text: `Strong buy-side depth (${buyPct}%) — buyers may absorb your SELL, exit may be harder.` });
  }

  // ── 3. Price wall detection ─────────────────────────────────────────────────
  // A wall = single level with > 3× the average qty of the other levels
  const detectWall = (levels, side) => {
    const valid = levels.filter(l => l?.qty > 0);
    if (valid.length < 2) return null;
    const avg = valid.reduce((s, l) => s + l.qty, 0) / valid.length;
    const wall = valid.find(l => l.qty >= avg * 3);
    return wall ? { price: wall.price, qty: wall.qty, side } : null;
  };
  const sellWall = detectWall(sell, 'sell');
  const buyWall  = detectWall(buy,  'buy');

  const fmtQty = (q) => q >= 10000 ? `${(q / 1000).toFixed(1)}k` : q.toLocaleString('en-IN');
  const fmtPx  = (p) => `₹${p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (sellWall) {
    const msg = `Sell wall at ${fmtPx(sellWall.price)} (${fmtQty(sellWall.qty)} qty) — heavy resistance overhead, may cap upside.`;
    insights.push({ level: isBuy ? 'caution' : 'good', text: msg });
  }
  if (buyWall) {
    const msg = `Buy wall at ${fmtPx(buyWall.price)} (${fmtQty(buyWall.qty)} qty) — strong support below, downside limited near this level.`;
    insights.push({ level: isBuy ? 'good' : 'caution', text: msg });
  }

  // ── 4. Limit price suggestion ───────────────────────────────────────────────
  if (isLimit) {
    if (isBuy && bestAsk != null)
      insights.push({ level: 'info', text: `Best ask ${fmtPx(bestAsk)} — set limit at or above this for near-instant fill.` });
    if (!isBuy && bestBid != null)
      insights.push({ level: 'info', text: `Best bid ${fmtPx(bestBid)} — set limit at or below this for near-instant fill.` });
  }

  return insights;
}

// ─────────────────────────────────────────────────────────────────────────────
// DepthPanel — 5-level bid/ask order depth, shown in the Order tab
// ─────────────────────────────────────────────────────────────────────────────
function DepthPanel({ depth, loading, onRefresh, transactionType, orderType }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 flex items-center gap-2">
        <Loader2 size={12} className="animate-spin text-slate-500" />
        <span className="text-[11px] text-slate-500">Loading depth…</span>
      </div>
    );
  }
  if (!depth) return null;

  const { buy, sell, bestBid, bestAsk, spread, spreadPct, totalBuyQty, totalSellQty, buyPct } = depth;

  // Max qty across all levels for bar scaling
  const maxQty = Math.max(1, ...(buy ?? []).map(l => l?.qty ?? 0), ...(sell ?? []).map(l => l?.qty ?? 0));

  const fmtQty = (q) => q == null ? '—' : q >= 10000 ? `${(q / 1000).toFixed(1)}k` : q.toLocaleString('en-IN');
  const fmtPx  = (p) => p == null ? '—' : p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const spreadWide = spreadPct != null && spreadPct > 2;

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Depth</span>
          {spread != null && (
            <span className={`text-[10px] font-semibold ${spreadWide ? 'text-amber-400' : 'text-slate-500'}`}>
              Spread ₹{spread} ({spreadPct}%){spreadWide ? ' ⚠' : ''}
            </span>
          )}
        </div>
        <button type="button" onClick={onRefresh}
          className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors">
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_1fr] text-[9px] font-bold text-slate-600 uppercase tracking-wider px-3 py-1 border-b border-white/5">
        <span>Bid Qty</span>
        <span className="text-center">Price</span>
        <span className="text-right">Ask Qty</span>
      </div>

      {/* 5 levels */}
      {Array.from({ length: 5 }).map((_, i) => {
        const b = buy[i];
        const s = sell[i];
        const bPct = b ? Math.round((b.qty / maxQty) * 100) : 0;
        const sPct = s ? Math.round((s.qty / maxQty) * 100) : 0;
        return (
          <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center px-3 py-[3px] relative">
            {/* Bid bar (left, green, grows right→left) */}
            {b && <div className="absolute left-0 top-0 bottom-0 bg-emerald-500/10" style={{ width: `${bPct / 2}%` }} />}
            {/* Ask bar (right, red, grows left→right) */}
            {s && <div className="absolute right-0 top-0 bottom-0 bg-red-500/10" style={{ width: `${sPct / 2}%` }} />}

            <span className="relative text-[11px] font-mono text-emerald-400 tabular-nums z-10">
              {b ? fmtQty(b.qty) : <span className="text-slate-700">—</span>}
            </span>
            <span className={`relative text-[11px] font-mono tabular-nums z-10 px-2 ${
              i === 0 ? 'text-white font-semibold' : 'text-slate-400'
            }`}>
              {b?.price != null ? fmtPx(b.price) : s?.price != null ? fmtPx(s.price) : '—'}
            </span>
            <span className="relative text-[11px] font-mono text-red-400 tabular-nums text-right z-10">
              {s ? fmtQty(s.qty) : <span className="text-slate-700">—</span>}
            </span>
          </div>
        );
      })}

      {/* Imbalance bar */}
      <div className="px-3 pt-2 pb-2.5 border-t border-white/5 mt-0.5">
        <div className="flex items-center justify-between text-[9px] text-slate-500 mb-1">
          <span>Buy {fmtQty(totalBuyQty)}</span>
          <span className={`font-bold text-[10px] ${
            buyPct >= 60 ? 'text-emerald-400' : buyPct <= 40 ? 'text-red-400' : 'text-slate-400'
          }`}>
            {buyPct >= 60 ? `Buyers ${buyPct}% dominant` : buyPct <= 40 ? `Sellers ${100 - buyPct}% dominant` : 'Balanced'}
          </span>
          <span>Sell {fmtQty(totalSellQty)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-red-500/30 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500/80 transition-all duration-500"
            style={{ width: `${buyPct}%` }} />
        </div>
      </div>

      {/* Interpreted insights */}
      {(() => {
        const insights = interpretDepth(depth, transactionType, orderType);
        if (!insights.length) return null;
        const cfg = {
          good:    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-400', dot: 'bg-emerald-400' },
          caution: { bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   text: 'text-amber-400',   dot: 'bg-amber-400'   },
          warn:    { bg: 'bg-red-500/10',      border: 'border-red-500/25',     text: 'text-red-400',     dot: 'bg-red-400'     },
          info:    { bg: 'bg-slate-500/10',    border: 'border-slate-500/25',   text: 'text-slate-400',   dot: 'bg-slate-500'   },
        };
        return (
          <div className="border-t border-white/5 px-3 py-2 space-y-1.5">
            {insights.map((ins, i) => {
              const c = cfg[ins.level] ?? cfg.info;
              return (
                <div key={i} className={`flex items-start gap-2 rounded-lg px-2.5 py-2 border ${c.bg} ${c.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${c.dot}`} />
                  <span className={`text-[10px] leading-snug ${c.text}`}>{ins.text}</span>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

function BrokerStatusBadge() {
  const { status, loading } = useProviderStatus();

  const bgColor = loading ? 'bg-slate-700' : status?.connected ? 'bg-emerald-900/40' : 'bg-rose-900/40';
  const textColor = loading ? 'text-slate-400' : status?.connected ? 'text-emerald-400' : 'text-rose-400';
  const dotColor = loading ? 'bg-slate-500' : status?.connected ? 'bg-emerald-500' : 'bg-rose-500';
  const label = loading ? 'Checking' : status?.broker === 'paper' ? 'Paper' : 'Kite';

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${bgColor} ${textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
      {label}
    </div>
  );
}

export default function OrderModal({
  isOpen,
  onClose,
  symbol,
  price,
  defaultType = 'BUY',
  optionType = null,
  optionSymbol = null,
  optionExpiry = null,  // YYYY-MM-DD — explicit expiry from chart, skips server-side date calc
  optionExpiryType = null,  // 'weekly' or 'monthly' for NIFTY — passed from chart
  onOrderPlaced,
  intelligence = null,
}) {
  const [transactionType, setTransactionType] = useState(defaultType);
  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState(optionType ? 'NRML' : 'CNC');
  const [orderType, setOrderType] = useState('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [exchange, setExchange] = useState(optionType ? 'NFO' : 'NSE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [isSessionLoggedIn, setIsSessionLoggedIn] = useState(true); // optimistic
  const [userRole, setUserRole] = useState(null); // null=unknown, 'admin', 'user'
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [kiteApiKey, setKiteApiKey] = useState('');
  
  const [kiteOptionSymbol, setKiteOptionSymbol] = useState(null);
  const [optionLtp, setOptionLtp] = useState(null);
  const [strike, setStrike] = useState(null);
  const [expiryDay, setExpiryDay] = useState(null);
  const [lotSize, setLotSize] = useState(1);
  const [fetchingLtp, setFetchingLtp] = useState(false);

  // For NIFTY/BANKNIFTY expiry selection
  const [availableExpiries, setAvailableExpiries] = useState([]);
  const [selectedExpiryDate, setSelectedExpiryDate] = useState(null);
  const [loadingExpiries, setLoadingExpiries] = useState(false);

  const closeTimerRef = useRef(null); // tracked so we can cancel if modal reopens
  const [avgDownAlert, setAvgDownAlert] = useState(null); // Averaging down warning
  const [positions, setPositions] = useState([]);
  const [activeTab, setActiveTab] = useState('order');
  const [depth, setDepth]           = useState(null);
  const [depthLoading, setDepthLoading] = useState(false);
  const [deepIntelLoading, setDeepIntelLoading] = useState(false);
  const [deepIntelResult, setDeepIntelResult] = useState(null);
  const [regimeData, setRegimeData]   = useState(null);
  const [regimeLoading, setRegimeLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkKiteAuth();
      fetchPositions();
    }
    // Cancel any pending auto-close from a previous order placement
    return () => clearTimeout(closeTimerRef.current);
  }, [isOpen]);

  const fetchPositions = async () => {
    try {
      const res = await fetch('/api/kite-positions');
      const data = await res.json();
      if (data.positions) {
        setPositions(data.positions);
      }
    } catch (err) {
      console.error('Error fetching positions:', err);
    }
  };

  const checkKiteAuth = async () => {
    setCheckingAuth(true);
    try {
      // Check session + role first
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json();
      if (!meData.user) {
        setIsSessionLoggedIn(false);
        setIsLoggedIn(false);
        return;
      }
      setIsSessionLoggedIn(true);
      setUserRole(meData.user.role);

      // Only admin can connect broker / place orders
      if (meData.user.role !== 'admin') return;

      const res = await fetch('/api/kite-config');
      if (res.status === 401) {
        setIsLoggedIn(false);
        return;
      }
      const data = await res.json();
      setIsLoggedIn(data.tokenValid === true);
      setKiteApiKey(data.config?.apiKey || '');
    } catch (err) {
      console.error('Error checking Kite auth:', err);
      setIsLoggedIn(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleKiteLogin = () => {
    const popup = window.open('/settings/kite', 'KiteSettings', 'width=600,height=700,scrollbars=yes');
    const handleMessage = (event) => {
      if (event.data?.type === 'KITE_LOGIN_SUCCESS') {
        checkKiteAuth();
        window.removeEventListener('message', handleMessage);
      }
    };
    window.addEventListener('message', handleMessage);
    const checkPopup = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkPopup);
        window.removeEventListener('message', handleMessage);
        setTimeout(() => checkKiteAuth(), 500);
      }
    }, 500);
  };

  // Fetch available expiries for NIFTY/BANKNIFTY
  useEffect(() => {
    if (isOpen && optionType && (symbol === 'NIFTY' || symbol === 'BANKNIFTY')) {
      fetchAvailableExpiries();
    }
  }, [isOpen, optionType, symbol]);

  const fetchAvailableExpiries = async () => {
    setLoadingExpiries(true);
    try {
      const res = await fetch(`/api/option-meta?action=expiries&symbol=${symbol}`);
      const data = await res.json();
      if (data.expiries?.length) {
        setAvailableExpiries(data.expiries);
        // Auto-select nearest expiry
        const nearest = data.expiries[0];
        setSelectedExpiryDate(nearest.date);
      }
    } catch (err) {
      console.error('Error fetching expiries:', err);
    } finally {
      setLoadingExpiries(false);
    }
  };

  // For non-NIFTY/BANKNIFTY: fetch details normally
  // For NIFTY/BANKNIFTY: wait for selectedExpiryDate to be set (from expiries fetch)
  useEffect(() => {
    if (!isOpen || !optionType || !symbol || !price || !isLoggedIn) return;

    // Skip for NIFTY/BANKNIFTY until dropdown value is set
    if ((symbol === 'NIFTY' || symbol === 'BANKNIFTY') && !selectedExpiryDate) return;

    fetchOptionDetails();
  }, [isOpen, optionType, symbol, price, isLoggedIn, selectedExpiryDate]);

  const fetchOptionDetails = async () => {
    setFetchingLtp(true);
    setError('');
    try {
      const url = new URL('/api/option-ltp', window.location.origin);
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('price', price);
      url.searchParams.set('type', optionType);

      // For NIFTY/BANKNIFTY, use selected expiry; otherwise use passed optionExpiry
      const expiryToUse = (symbol === 'NIFTY' || symbol === 'BANKNIFTY')
        ? selectedExpiryDate
        : optionExpiry;
      if (expiryToUse) url.searchParams.set('expiry', expiryToUse);

      // Determine expiryType for NIFTY
      let finalExpiryType = optionExpiryType;
      if (!finalExpiryType && (symbol === 'NIFTY' || symbol === 'BANKNIFTY')) {
        // Check if selected expiry is weekly or monthly
        const expiryObj = availableExpiries.find(e => e.date === selectedExpiryDate);
        finalExpiryType = expiryObj?.isMonthly ? 'monthly' : 'weekly';
      } else if (!finalExpiryType) {
        finalExpiryType = 'monthly';
      }
      url.searchParams.set('expiryType', finalExpiryType);

      const res = await fetch(url.toString());
      const data = await res.json();
      if (res.ok && data.optionSymbol) {
        setKiteOptionSymbol(data.optionSymbol);
        setOptionLtp(data.ltp);
        setStrike(data.strike);
        setExpiryDay(data.expiryDay);
        if (data.lotSize) setLotSize(data.lotSize);
        setLimitPrice(data.ltp?.toString() || '');
      } else if (res.status === 401) {
        setIsLoggedIn(false);
      } else {
        setError(data.error || 'Failed to fetch option details');
      }
    } catch (err) {
      console.error('Error fetching option LTP:', err);
      setError('Failed to fetch option price');
    } finally {
      setFetchingLtp(false);
    }
  };

  const getExpectedStrike = (sym, prc, type) => {
    const p = parseFloat(prc) || 0;
    let step = nseStrikeSteps[sym];
    if (!step) {
      if (p >= 5000) step = 50;
      else if (p >= 1000) step = 20;
      else if (p >= 500) step = 10;
      else if (p >= 100) step = 5;
      else step = 2.5;
    }
    return type === 'CE' ? Math.ceil(p / step) * step : Math.floor(p / step) * step;
  };

  useEffect(() => {
    if (isOpen) {
      setTransactionType(defaultType);
      setQuantity(optionType ? 1 : 1);
      setProduct(optionType ? 'NRML' : 'CNC');
      setOrderType(optionType ? 'LIMIT' : 'MARKET');
      setLimitPrice(price?.toString() || '');
      setTriggerPrice('');
      setExchange(optionType ? 'NFO' : 'NSE');
      setError('');
      setSuccess('');
      setKiteOptionSymbol(null);
      setOptionLtp(null);
      setExpiryDay(null);
      setActiveTab('order');
      setDeepIntelResult(null);
      setRegimeData(null);
      setDepth(null);
      setAvailableExpiries([]);
      setSelectedExpiryDate(null);
      if (optionType && price) {
        setStrike(getExpectedStrike(symbol, price, optionType));
      } else {
        setStrike(null);
      }
    }
  }, [isOpen, defaultType, price, optionType, symbol]);

  // ─── FETCH DEEP INTELLIGENCE (5 agents) ─────────────────────────────
  const fetchDeepIntel = async () => {
    if (!symbol || !transactionType) return;
    setDeepIntelLoading(true);
    try {
      const isIndex = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].includes(symbol?.toUpperCase());
      const res = await fetch('/api/order-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          tradingsymbol: kiteOptionSymbol || optionSymbol || symbol,
          exchange: optionType ? 'NFO' : 'NSE',
          instrumentType: optionType || 'EQ',
          transactionType,
          productType: product,
          quantity: quantity || 1,
          price: optionType ? (optionLtp || price) : price,
          spotPrice: price || 0,
          includeStructure: true,
          includePattern: true,
          includeStation: true,
          includeOI: isIndex,
        }),
      });
      const data = await res.json();
      setDeepIntelResult(data);
    } catch (err) {
      console.error('Deep intel error:', err);
    } finally {
      setDeepIntelLoading(false);
    }
  };

  // ─── FETCH INTRADAY REGIME (NIFTY + BANKNIFTY) ──────────────────────
  const fetchRegime = async () => {
    setRegimeLoading(true);
    try {
      const [nifty, bnf] = await Promise.allSettled([
        fetch('/api/market-regime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'NIFTY', type: 'intraday' }) }).then(r => r.json()),
        fetch('/api/market-regime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'BANKNIFTY', type: 'intraday' }) }).then(r => r.json()),
      ]);
      setRegimeData({
        NIFTY:     nifty.status === 'fulfilled' ? nifty.value : null,
        BANKNIFTY: bnf.status   === 'fulfilled' ? bnf.value   : null,
      });
    } catch {}
    finally { setRegimeLoading(false); }
  };

  // Trigger deep analysis + regime when modal opens or direction changes.
  // Never use cached intelligence for scenario — direction (BUY/SELL, CE/PE) changes
  // the scenario result completely and the chart-pill cache is direction-agnostic.
  useEffect(() => {
    if (isOpen && symbol && transactionType && isLoggedIn) {
      fetchDeepIntel();
      fetchRegime();
    }
  }, [isOpen, symbol, transactionType, isLoggedIn, kiteOptionSymbol]);

  // ─── FETCH MARKET DEPTH ────────────────────────────────────────────────
  const fetchDepth = useCallback(async () => {
    if (!isLoggedIn) return;
    // For options use the resolved kiteOptionSymbol; fall back to symbol for equity
    const depthSymbol = optionType ? kiteOptionSymbol : symbol;
    if (!depthSymbol) return;
    const depthExchange = optionType ? 'NFO' : exchange;
    setDepthLoading(true);
    try {
      const r = await fetch(`/api/depth?symbol=${encodeURIComponent(depthSymbol)}&exchange=${depthExchange}`);
      if (r.ok) setDepth(await r.json());
    } catch {}
    finally { setDepthLoading(false); }
  }, [isLoggedIn, symbol, optionType, kiteOptionSymbol, exchange]);

  // Fetch depth when modal opens (equity) or once option symbol is resolved
  useEffect(() => {
    if (isOpen && isLoggedIn) {
      if (optionType && !kiteOptionSymbol) return; // wait for option resolution
      fetchDepth();
    }
  }, [isOpen, isLoggedIn, kiteOptionSymbol]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isSessionLoggedIn) {
      setIsSessionLoggedIn(false);
      return;
    }
    if (!isLoggedIn) {
      setError('Please connect your broker account first');
      return;
    }

    // ── Averaging down guard ──────────────────────────────────────────────
    if (!avgDownAlert && positions.length > 0) {
      const tradingSymbol = optionType ? (kiteOptionSymbol || optionSymbol) : symbol;
      const matchingPos = positions.find(p => 
        (p.tradingsymbol === tradingSymbol || p.tradingsymbol === symbol) &&
        p.quantity !== 0
      );

      if (matchingPos) {
        const isAddingLong  = matchingPos.quantity > 0 && transactionType === 'BUY';
        const isAddingShort = matchingPos.quantity < 0 && transactionType === 'SELL';
        
        // Calculate UNREALIZED P&L for current open position
        const avgPrice = matchingPos.average_price || 0;
        const ltp = matchingPos.last_price || 0;
        const qty = Math.abs(matchingPos.quantity);
        const isLong = matchingPos.quantity > 0;
        
        const unrealizedPnl = isLong 
          ? (ltp - avgPrice) * qty
          : (avgPrice - ltp) * qty;
        
        const lossThreshold = exchange === 'NFO' ? -500 : -200;
        const isLosingTrade = unrealizedPnl < lossThreshold;

        if ((isAddingLong || isAddingShort) && isLosingTrade) {
          setAvgDownAlert({ position: matchingPos, unrealizedPnl, avgPrice, ltp });
          return;
        }
      }
    }

    // Clear alert if bypass confirmed
    if (avgDownAlert) {
      setAvgDownAlert(null);
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const tradingSymbol = optionType ? (kiteOptionSymbol || optionSymbol) : symbol;
      const orderData = {
        tradingsymbol: tradingSymbol,
        exchange,
        transaction_type: transactionType,
        quantity: parseInt(quantity),
        product,
        order_type: orderType,
        variety: 'regular',
      };
      if (orderType === 'LIMIT' && limitPrice) {
        orderData.price = parseFloat(limitPrice);
      }
      if (['SL', 'SL-M'].includes(orderType) && triggerPrice) {
        orderData.trigger_price = parseFloat(triggerPrice);
        if (orderType === 'SL' && limitPrice) {
          orderData.price = parseFloat(limitPrice);
        }
      }
      const response = await fetch('/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });
      const result = await response.json();
      if (response.status === 401) {
        setIsSessionLoggedIn(false);
        setIsLoggedIn(false);
        return;
      }
      if (!response.ok) {
        throw new Error(result.error || 'Failed to place order');
      }
      setSuccess(`Order placed! ID: ${result.order_id}`);
      if (onOrderPlaced) {
        onOrderPlaced(result);
      }
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const displayPrice = optionType ? (optionLtp || 0) : (price || 0);
  const estimatedValue = quantity * (limitPrice !== '' ? (parseFloat(limitPrice) || 0) : displayPrice);

  // ─── VERDICT CONFIG ───────────────────────────────────────────────────
  const getVerdictColor = (verdict) => {
    switch (verdict) {
      case 'danger': return { bg: 'bg-red-900/20', border: 'border-red-500/40', text: 'text-red-400', dot: 'bg-red-500', stroke: '#ef4444' };
      case 'warning': return { bg: 'bg-amber-900/20', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-500', stroke: '#f59e0b' };
      case 'caution': return { bg: 'bg-yellow-900/15', border: 'border-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500', stroke: '#eab308' };
      default: return { bg: 'bg-green-900/20', border: 'border-green-500/30', text: 'text-green-400', dot: 'bg-green-500', stroke: '#22c55e' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`px-5 py-4 border-b border-slate-700 flex items-center justify-between sticky top-0 z-10 ${
          transactionType === 'BUY' ? 'bg-green-900/30' : 'bg-red-900/30'
        }`}>
          <div className="flex items-center gap-3">
            {transactionType === 'BUY' ? (
              <TrendingUp className="w-6 h-6 text-green-400" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-400" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{symbol}</h2>
                {optionType && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    optionType === 'CE' ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'
                  }`}>
                    {optionType}
                  </span>
                )}
              </div>
              {optionType && kiteOptionSymbol && (
                <p className="text-slate-300 text-xs font-mono">{kiteOptionSymbol}</p>
              )}
              {optionType && strike && (
                <p className="text-slate-400 text-xs">
                  Spot: ₹{price?.toLocaleString('en-IN') || '---'} • Strike: ₹{strike.toLocaleString('en-IN')} 
                  {expiryDay && <span className="text-blue-400"> • Exp: {expiryDay}</span>}
                </p>
              )}
              {optionType && (
                <p className="text-slate-400 text-xs">
                  {fetchingLtp ? (
                    <span className="text-blue-400">Loading option LTP...</span>
                  ) : optionLtp ? (
                    <span className="text-green-400">Option LTP: ₹{optionLtp.toLocaleString('en-IN')}</span>
                  ) : (
                    <span className="text-yellow-500">Option LTP unavailable</span>
                  )}
                </p>
              )}
              {!optionType && (
                <p className="text-slate-400 text-sm">
                  Stock Price: ₹{price?.toLocaleString('en-IN') || '---'} • {exchange}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {optionType && (
              <button
                type="button"
                onClick={fetchOptionDetails}
                disabled={fetchingLtp}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                title="Refresh LTP"
              >
                <RefreshCw className={`w-4 h-4 text-slate-400 ${fetchingLtp ? 'animate-spin' : ''}`} />
              </button>
            )}
            <a
              href={`/chart?symbol=${encodeURIComponent(optionType ? (kiteOptionSymbol || optionSymbol || symbol) : symbol)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              title={`Open ${optionType ? (kiteOptionSymbol || optionSymbol || symbol) : symbol} chart`}
            >
              <BarChart2 className="w-4 h-4 text-slate-400" />
            </a>
            <BrokerStatusBadge />
            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {checkingAuth ? (
          <div className="p-8 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-3" />
            <p className="text-slate-400 text-sm">Checking authentication...</p>
          </div>
        ) : !isSessionLoggedIn ? (
          <div className="p-8 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-blue-600/30">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Login Required</h3>
            <p className="text-slate-400 text-sm text-center mb-6 max-w-xs">
              You need to log in to TradingVerse to place orders.
            </p>
            <a
              href="/login"
              className="px-8 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              Login to TradingVerse
            </a>
          </div>
        ) : userRole === 'user' ? (
          <div className="p-8 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-violet-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-violet-600/30">
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Pro Feature</h3>
            <p className="text-amber-400 text-sm font-semibold mb-2">
              Order placement is available on the Pro plan.
            </p>
            <p className="text-slate-500 text-xs max-w-xs mb-5">
              Connect your broker and trade directly from TradingVerse with AI-powered order intelligence.
            </p>
            <a href="/pricing" className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-colors">
              View Plans →
            </a>
          </div>
        ) : !isLoggedIn ? (
          <div className="p-8 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-orange-600/30">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Connect to Kite</h3>
            <p className="text-slate-400 text-sm text-center mb-6 max-w-xs">
              Login to your Zerodha Kite account to place orders directly from here
            </p>
            <button
              type="button"
              onClick={handleKiteLogin}
              className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-orange-600/30 flex items-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              Login to Kite
            </button>
            <button
              type="button"
              onClick={checkKiteAuth}
              className="mt-4 text-slate-400 hover:text-white text-sm flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Status
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col">

          {/* ── Tab bar ─────────────────────────────────────────────────────── */}
          <div className="flex px-5 pt-3 pb-2 gap-1 border-b border-white/5">
            <button type="button" onClick={() => setActiveTab('order')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'order' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}>
              Place Order
            </button>
            <button type="button" onClick={() => setActiveTab('analysis')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'analysis' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}>
              Intelligence
              {deepIntelResult && (() => {
                const totalRisk = ['behavioral','structure','pattern','station','oi'].reduce((s,k) => s + (deepIntelResult[k]?.riskScore || 0), 0);
                return totalRisk >= 10 ? <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" /> : null;
              })()}
            </button>
          </div>

          {/* ── ANALYSIS TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'analysis' && (
          <div className="p-5 space-y-3">
            {/* Verdict Card — regime × scenario alignment (top of intelligence) */}
            <ModalVerdictCard
              regimeData={regimeData}
              scenarioResult={deepIntelResult?.scenario}
              symbol={symbol}
              isLoading={regimeLoading || deepIntelLoading}
              sector={deepIntelResult?.sector}
              transactionType={transactionType}
            />

            {/* Scenario synthesis — shown once deep intel (station) is loaded */}
            {deepIntelResult?.scenario && (
              <ScenarioCard scenarioResult={deepIntelResult.scenario} />
            )}

            {/* ── Deep Analysis ──────────────────────────────────────────── */}
            <div className="border-t border-white/10 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Brain size={13} className="text-purple-400" />
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">5-Agent Deep Analysis</span>
                </div>
                <button type="button" onClick={fetchDeepIntel} disabled={deepIntelLoading}
                  className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50">
                  {deepIntelLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {deepIntelResult ? 'Refresh' : 'Run Analysis'}
                </button>
              </div>
              {!deepIntelResult && !deepIntelLoading && (
                <p className="text-[11px] text-slate-500 text-center py-2">Pattern · Structure · OI · Station · Behavioral agents</p>
              )}
              {deepIntelLoading && (
                <div className="flex items-center justify-center py-4 gap-2">
                  <Loader2 size={16} className="animate-spin text-purple-400" />
                  <span className="text-xs text-slate-400">Running 5 agents...</span>
                </div>
              )}
              {deepIntelResult && !deepIntelLoading && (() => {
                const SEV = {
                  danger:  { dot: 'bg-red-500',   text: 'text-red-400'   },
                  warning: { dot: 'bg-red-400',   text: 'text-red-300'   },
                  caution: { dot: 'bg-amber-400', text: 'text-amber-300' },
                  info:    { dot: 'bg-blue-400',  text: 'text-blue-300'  },
                };
                const AGENTS = [
                  { key: 'behavioral', label: 'Behavioral',  icon: '🧠' },
                  { key: 'structure',  label: 'Structure',   icon: '📐' },
                  { key: 'pattern',    label: 'Pattern',     icon: '🕯️' },
                  { key: 'station',    label: 'Station',     icon: '🚉' },
                  { key: 'oi',         label: 'Open Interest', icon: '📊' },
                ];
                // Compute combined risk
                const totalRisk = AGENTS.reduce((s, a) => s + (deepIntelResult[a.key]?.riskScore || 0), 0);
                const overallVerdict = totalRisk >= 40 ? 'danger' : totalRisk >= 20 ? 'warning' : totalRisk >= 10 ? 'caution' : 'clear';
                const ovc = getVerdictColor(overallVerdict);
                return (
                  <div className="space-y-2">
                    {/* Combined header */}
                    <div className={`p-2.5 rounded-lg border ${ovc.bg} ${ovc.border} flex items-center justify-between`}>
                      <span className={`text-xs font-semibold ${ovc.text}`}>Combined Risk: {totalRisk}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ovc.border} ${ovc.text} capitalize`}>{overallVerdict}</span>
                    </div>
                    {/* Per-agent results */}
                    {AGENTS.map(({ key, label, icon }) => {
                      const agent = deepIntelResult[key];
                      if (!agent) return null; // not requested (e.g. OI for non-index)
                      if (agent.unavailable) return (
                        <div key={key} className="flex items-center gap-2 py-1">
                          <span className="text-sm">{icon}</span>
                          <span className="text-[11px] text-slate-500 font-medium">{label}</span>
                          <span className="ml-auto text-[10px] text-slate-600">unavailable</span>
                        </div>
                      );
                      const avc = getVerdictColor(agent.verdict);
                      const hasBehaviors = agent.behaviors?.length > 0;
                      return (
                        <div key={key} className={`rounded-lg border ${hasBehaviors ? `${avc.bg} ${avc.border}` : 'border-white/5'} p-2.5`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm leading-none">{icon}</span>
                            <span className={`text-[11px] font-semibold ${hasBehaviors ? avc.text : 'text-slate-400'}`}>{label}</span>
                            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border ${avc.border} ${avc.text} capitalize`}>{agent.verdict}</span>
                            {agent.riskScore > 0 && <span className="text-[10px] text-slate-500">+{agent.riskScore}</span>}
                          </div>
                          {hasBehaviors && (
                            <div className="space-y-1 mt-1.5 pl-6">
                              {agent.behaviors.map((beh, i) => {
                                const cfg = SEV[beh.severity] || { dot: 'bg-slate-400', text: 'text-slate-300' };
                                return (
                                  <div key={i} className="flex items-start gap-1.5">
                                    <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                    <div>
                                      <div className={`text-[10px] font-medium ${cfg.text} leading-snug`}>{beh.title}</div>
                                      {beh.detail && <div className="text-[9px] text-slate-500 leading-relaxed">{beh.detail}</div>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
          )}

          {/* ── ORDER TAB ────────────────────────────────────────────────────── */}
          {activeTab === 'order' && (
          <div className="p-5 space-y-4">
            {/* Verdict — regime × scenario alignment */}
            <ModalVerdictCard
              regimeData={regimeData}
              scenarioResult={deepIntelResult?.scenario}
              symbol={symbol}
              isLoading={regimeLoading || deepIntelLoading}
              sector={deepIntelResult?.sector}
              transactionType={transactionType}
            />

          {/* Buy/Sell Toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTransactionType('BUY')}
              className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                transactionType === 'BUY'
                  ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setTransactionType('SELL')}
              className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                transactionType === 'SELL'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              SELL
            </button>
          </div>

          {/* Market Depth */}
          <DepthPanel depth={depth} loading={depthLoading} onRefresh={fetchDepth}
            transactionType={transactionType} orderType={orderType} />

          {/* Expiry selector for NIFTY/BANKNIFTY */}
          {(symbol === 'NIFTY' || symbol === 'BANKNIFTY') && availableExpiries.length > 0 && (
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">Expiry</label>
              <select
                value={selectedExpiryDate || ''}
                onChange={(e) => setSelectedExpiryDate(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {availableExpiries.map(exp => (
                  <option key={exp.date} value={exp.date}>
                    {exp.shortLabel}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Rest of form (unchanged) */}
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Product Type</label>
            <div className="flex gap-2">
              {(optionType ? [
                { value: 'NRML', label: 'NRML', desc: 'Overnight' },
                { value: 'MIS', label: 'MIS', desc: 'Intraday' },
              ] : [
                { value: 'CNC', label: 'CNC', desc: 'Delivery' },
                { value: 'MIS', label: 'MIS', desc: 'Intraday' },
                { value: 'NRML', label: 'NRML', desc: 'F&O' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setProduct(opt.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm transition-all ${
                    product === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] opacity-70">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Order Type</label>
            <div className="flex gap-2">
              {['MARKET', 'LIMIT', 'SL', 'SL-M'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setOrderType(type)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    orderType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            {optionType && orderType === 'MARKET' && (
              <div className="mt-2 p-2 bg-amber-900/30 border border-amber-600/50 rounded-lg">
                <p className="text-amber-400 text-xs flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Market orders are not allowed for Options on Kite. Please use LIMIT order.</span>
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">Quantity</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            {orderType === 'LIMIT' || orderType === 'SL' ? (
              <div>
                <label className="block text-slate-400 text-xs mb-1.5">
                  {orderType === 'SL' ? 'Limit Price' : 'Price'}
                </label>
                <input
                  type="number"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  step="0.05"
                  placeholder={displayPrice?.toString()}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                  required={orderType === 'LIMIT'}
                />
              </div>
            ) : (
              <div>
                <label className="block text-slate-400 text-xs mb-1.5">
                  {optionType ? 'LTP (Market)' : 'Price (Market)'}
                </label>
                <input
                  type="text"
                  value={displayPrice ? `₹${displayPrice.toLocaleString('en-IN')}` : 'Fetching...'}
                  disabled
                  className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2.5 text-slate-300 text-sm cursor-not-allowed"
                />
              </div>
            )}
          </div>

          {['SL', 'SL-M'].includes(orderType) && (
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">Trigger Price</label>
              <input
                type="number"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                step="0.05"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>
          )}

          <div className="bg-slate-700/50 rounded-lg p-3 flex justify-between items-center">
            <span className="text-slate-400 text-sm">Estimated Value</span>
            <span className="text-white font-mono font-semibold">
              ₹{estimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* ── Structure Risk Bar — surfaces OI warnings onto the Order tab ── */}
          {(() => {
            if (!deepIntelResult) return null;
            // Each agent returns { behaviors (triggered checks), verdict, riskScore }
            // behaviors items: { type, severity, title, detail, riskScore, passed: false }
            const allFlags = [];
            for (const key of ['structure', 'behavioral', 'pattern', 'station', 'oi']) {
              const agent = deepIntelResult[key];
              if (!agent) continue;
              // Triggered checks live in .behaviors (structure/behavioral) or .checks filtered
              const behaviors = agent.behaviors ?? agent.checks?.filter(c => !c.passed) ?? [];
              for (const b of behaviors) {
                if (b.title && !b.passed) allFlags.push({ severity: b.severity ?? 'caution', title: b.title });
              }
            }
            // Surface scenario against-signals
            const scenario = deepIntelResult.scenario;
            const againstLabels = (scenario?.againstSignals || []).slice(0, 2).map(s => s.label).join(' · ');
            if (againstLabels && (scenario?.confidence === 'LOW' || scenario?.againstSignals?.length >= 2)) {
              allFlags.unshift({ severity: 'warning', title: againstLabels });
            }
            if (!allFlags.length) return null;
            const topFlags  = allFlags.slice(0, 3);
            const isDanger  = allFlags.some(f => f.severity === 'danger');
            const isWarning = !isDanger && allFlags.some(f => f.severity === 'warning');
            const borderColor = isDanger ? 'border-rose-600' : isWarning ? 'border-orange-500' : 'border-amber-500';
            const bgColor     = isDanger ? 'bg-rose-950/60'  : isWarning ? 'bg-orange-950/60'  : 'bg-amber-950/60';
            const textColor   = isDanger ? 'text-rose-300'   : isWarning ? 'text-orange-300'   : 'text-amber-300';
            const icon        = isDanger ? '🛑' : isWarning ? '⚠️' : '⚡';
            return (
              <div className={`rounded-lg border ${borderColor} ${bgColor} px-3 py-2.5`}>
                <div className="flex items-start gap-2">
                  <span className="text-sm leading-none mt-0.5 flex-shrink-0">{icon}</span>
                  <div className="min-w-0">
                    <p className={`text-[11px] font-bold ${textColor} mb-1`}>
                      {allFlags.length} signal{allFlags.length > 1 ? 's' : ''} against this {transactionType}
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {topFlags.map(f => f.title).join(' · ')}
                    </p>
                    {allFlags.length > 3 && (
                      <p className="text-[10px] text-slate-500 mt-0.5">+{allFlags.length - 3} more — see Analysis tab</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-900/30 border border-green-700 text-green-400 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 ${
              transactionType === 'BUY'
                ? 'bg-green-600 hover:bg-green-500 disabled:bg-green-800'
                : 'bg-red-600 hover:bg-red-500 disabled:bg-red-800'
            } disabled:cursor-not-allowed`}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Placing Order...
              </>
            ) : (
              `${transactionType} ${symbol}`
            )}
          </button>

          <p className="text-slate-500 text-[10px] text-center">
            Orders are placed via Kite Connect API. Market orders execute at current market price.
          </p>
          </div>
          )}
        </form>
        )}
      </div>

      {/* Averaging Down Alert Modal */}
      {avgDownAlert && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-xl">
          <div className="bg-slate-800 border-2 border-red-500/60 rounded-xl p-5 w-[90%] max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-red-400">Averaging Down Warning</h3>
                <p className="text-xs text-slate-400">Adding to losing position</p>
              </div>
            </div>

            <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-3 mb-4">
              <div className="text-xs text-slate-400 mb-1">Position</div>
              <div className="text-sm font-bold text-white mb-2">
                {avgDownAlert.position.tradingsymbol}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">Entry</div>
                  <div className="text-white font-mono">₹{avgDownAlert.avgPrice?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-500">LTP</div>
                  <div className="text-white font-mono">₹{avgDownAlert.ltp?.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-2 text-red-400 font-semibold">
                ₹{Math.abs(Math.round(avgDownAlert.unrealizedPnl || 0)).toLocaleString()} Unrealized Loss
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Your position is underwater. Adding more will increase your average entry price and risk exposure.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAvgDownAlert(null)}
                className="flex-1 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium transition-colors border border-red-500/30"
              >
                Place Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}