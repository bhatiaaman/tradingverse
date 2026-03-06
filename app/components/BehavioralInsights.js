'use client';
import { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown, ChevronUp, RefreshCw, Zap, AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';

// ─── Level config ────────────────────────────────────────────────────────────
const LEVEL = {
  warning: { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    dot: 'bg-red-500',    label: 'Warning' },
  caution: { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  dot: 'bg-amber-500',  label: 'Caution' },
  info:    { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   dot: 'bg-blue-500',   label: 'Info'    },
  clear:   { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  dot: 'bg-green-500',  label: 'Clear'   },
};

const VERDICT = {
  danger:  { color: 'text-red-400',    bg: 'bg-red-500/15',   border: 'border-red-500/40',   label: 'High Risk',  ring: 'ring-red-500/30'    },
  warning: { color: 'text-amber-400',  bg: 'bg-amber-500/15', border: 'border-amber-500/40', label: 'Caution',    ring: 'ring-amber-500/30'  },
  caution: { color: 'text-yellow-400', bg: 'bg-yellow-500/15',border: 'border-yellow-500/40',label: 'Review',     ring: 'ring-yellow-500/30' },
  clear:   { color: 'text-green-400',  bg: 'bg-green-500/15', border: 'border-green-500/40', label: 'Looks Good', ring: 'ring-green-500/30'  },
};

// ─── Score arc (SVG gauge) ───────────────────────────────────────────────────
function ScoreGauge({ score, verdict }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  const dash = (pct / 100) * circ;
  const color = score >= 60 ? '#f87171' : score >= 40 ? '#fbbf24' : score >= 20 ? '#facc15' : '#4ade80';
  return (
    <div className="relative flex items-center justify-center w-16 h-16 flex-shrink-0">
      <svg width="56" height="56" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold" style={{ color }}>{score}</span>
        <span className="text-[8px] text-slate-500 uppercase tracking-wider">risk</span>
      </div>
    </div>
  );
}

// ─── Single insight card ─────────────────────────────────────────────────────
function InsightCard({ insight, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = LEVEL[insight.level] || LEVEL.info;
  // Averaging-down gets special full-open treatment
  const isAvgDown = insight.id === 'averaging_down';
  return (
    <div className={`rounded-lg border overflow-hidden transition-all duration-200 ${
      isAvgDown
        ? 'border-red-500/50 bg-red-900/20 ring-1 ring-red-500/20'
        : `${cfg.border} ${cfg.bg}`
    }`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
      >
        {isAvgDown
          ? <span className="text-sm flex-shrink-0">⚠</span>
          : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        }
        <span className={`flex-1 text-xs font-medium leading-tight ${isAvgDown ? 'text-red-300 font-semibold' : cfg.text}`}>
          {insight.title}
        </span>
        <span className="text-[10px] text-slate-600 mr-1">{insight.icon}</span>
        {open
          ? <ChevronUp size={11} className="text-slate-600 flex-shrink-0" />
          : <ChevronDown size={11} className="text-slate-600 flex-shrink-0" />
        }
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 pt-0">
          <p className={`text-[11px] leading-relaxed pl-3.5 border-l ${isAvgDown ? 'text-red-300 border-red-500/30' : 'text-slate-400 border-white/10'}`}>
            {insight.detail}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Passive badge (shown on Place Order button area) ────────────────────────
export function PassiveBadge({ count, verdict, onClick }) {
  if (!count) return null;
  const cfg = VERDICT[verdict] || VERDICT.caution;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-all ${cfg.bg} ${cfg.border} ${cfg.color} hover:opacity-80`}
    >
      <AlertTriangle size={11} />
      {count} insight{count > 1 ? 's' : ''}
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function BehavioralInsights({
  // Order context — passed from orders page
  symbol, tradingsymbol, exchange, instrumentType,
  transactionType, quantity, price, spotPrice, expiryType,
  // Already-loaded page data
  positions, openOrders, sentimentData, marketData, sectorData, optionChainData,
  // Callbacks
  onPassiveReady,   // (count, verdict) => void — fires when passive checks done
}) {
  const [state, setState] = useState('idle'); // idle | passive | loading | done | error
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState(false); // only used when there ARE warnings
  const prevSymbolRef = useRef(null);

  // ── Passive checks (instant, no API) ────────────────────────────────────────
  useEffect(() => {
    if (!symbol) { setState('idle'); setResult(null); return; }

    // Run passive checks whenever order context changes
    const passive = runPassiveChecks({
      symbol, tradingsymbol, instrumentType, transactionType,
      positions, openOrders,
      sentimentScore: sentimentData?.overall?.score,
      intradayScore: sentimentData?.timeframes?.intraday?.score,
      vix: marketData?.indices?.vix,
    });

    const hasNew = symbol !== prevSymbolRef.current;
    prevSymbolRef.current = symbol;

    setResult(prev => {
      // Merge passive into previous deep result if available
      if (prev?.deepAnalysis && !hasNew) {
        const deepOnly = prev.insights.filter(i => !passive.insights.find(p => p.id === i.id));
        return { ...prev, insights: [...passive.insights, ...deepOnly], riskScore: Math.min(100, passive.riskScore + (prev.deepRiskScore || 0)) };
      }
      // New symbol/type — clear direction verdict (it's stale from old analysis)
      return { ...passive, deepAnalysis: false, directionVerdict: null };
    });
    setState('passive');

    const warnCount = passive.insights.filter(i => i.level === 'warning' || i.level === 'caution').length;
    onPassiveReady?.(warnCount, passive.verdict);
  }, [symbol, tradingsymbol, instrumentType, transactionType, positions?.length, openOrders?.length]);

  // ── Auto re-run deep analysis when tradingsymbol/instrumentType changes ────
  const prevTradingsymbolRef = useRef(tradingsymbol);
  const prevInstrumentTypeRef = useRef(instrumentType);
  
  useEffect(() => {
    // If user had run deep analysis before, and now symbol/type changed, auto re-run
    if ((state === 'done' || state === 'passive') && symbol) {
      const symbolChanged = tradingsymbol !== prevTradingsymbolRef.current;
      const typeChanged = instrumentType !== prevInstrumentTypeRef.current;
      
      if (symbolChanged || typeChanged) {
        console.log('[Insights] Symbol/type changed, re-running deep analysis');
        // Debounce: wait 300ms before re-running (in case user is rapidly toggling CE/PE)
        const timer = setTimeout(() => runDeepAnalysis(), 300);
        
        // Update refs immediately to prevent duplicate triggers
        prevTradingsymbolRef.current = tradingsymbol;
        prevInstrumentTypeRef.current = instrumentType;
        
        return () => clearTimeout(timer);
      }
    }
    
    prevTradingsymbolRef.current = tradingsymbol;
    prevInstrumentTypeRef.current = instrumentType;
  }, [tradingsymbol, instrumentType, state, symbol]);

  // ── Deep analysis ────────────────────────────────────────────────────────────
  const runDeepAnalysis = async () => {
    if (!symbol) return;
    setState('loading');
    try {
      const res = await fetch('/api/behavioral-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol, tradingsymbol, exchange, instrumentType,
          transactionType, quantity, price, spotPrice, expiryType,
          context: {
            positions: positions || [],
            openOrders: openOrders || [],
            sentimentScore: sentimentData?.overall?.score,
            sentimentBias:  sentimentData?.overall?.mood,
            intradayScore:  sentimentData?.timeframes?.intraday?.score,
            intradayBias:   sentimentData?.timeframes?.intraday?.bias,
            vix:            marketData?.indices?.vix,
            sectorData:     sectorData || [],
            pcr:            optionChainData?.pcr,
            optionChain:    optionChainData ? {
              totalCallOI: optionChainData.totalCallOI,
              totalPutOI:  optionChainData.totalPutOI,
              support:     optionChainData.support,
              resistance:  optionChainData.resistance,
              maxPain:     optionChainData.maxPain,
            } : null,
          },
        }),
      });
      const data = await res.json();
      setResult({ ...data, deepRiskScore: data.riskScore });
      setState('done');
      const warnCount = data.insights.filter(i => i.level === 'warning' || i.level === 'caution').length;
      onPassiveReady?.(warnCount, data.verdict);
    } catch (err) {
      setState('error');
    }
  };

  // ── Idle state ────────────────────────────────────────────────────────────
  if (state === 'idle' || !symbol) {
    return (
      <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 rounded-2xl border border-white/8 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={15} className="text-purple-400" />
          <h3 className="text-xs font-semibold text-purple-300">Trade Insights</h3>
        </div>
        <p className="text-[11px] text-slate-600 text-center py-3">
          Select a symbol to see behavioural analysis
        </p>
      </div>
    );
  }

  const verdictCfg = VERDICT[result?.verdict || 'clear'];
  const warnings  = result?.insights?.filter(i => i.level === 'warning') || [];
  const cautions  = result?.insights?.filter(i => i.level === 'caution') || [];
  const others    = result?.insights?.filter(i => i.level !== 'warning' && i.level !== 'caution') || [];
  const badCount  = warnings.length + cautions.length;

  return (
    <div className={`rounded-2xl border transition-all duration-300 ${
      result?.verdict === 'danger'  ? 'border-red-500/40 bg-red-900/10' :
      result?.verdict === 'warning' ? 'border-amber-500/30 bg-amber-900/10' :
      result?.verdict === 'caution' ? 'border-yellow-500/20 bg-slate-800/40' :
      'border-white/10 bg-gradient-to-br from-slate-800/40 to-slate-900/40'
    }`}>

      {/* ── Header ── */}
      <div className="flex items-center gap-2 p-3 pb-2">
        <Brain size={15} className={result?.verdict === 'danger' ? 'text-red-400' : result?.verdict === 'warning' ? 'text-amber-400' : 'text-purple-400'} />
        <h3 className="text-xs font-semibold text-purple-300 flex-1">Trade Insights</h3>
        {state === 'passive' && (
          <span className="text-[9px] text-slate-600 bg-white/5 px-1.5 py-0.5 rounded">passive</span>
        )}
        {state === 'done' && (
          <span className="text-[9px] text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
            <span className="w-1 h-1 bg-green-500 rounded-full" />deep
          </span>
        )}
      </div>

      {/* ── Score + verdict row ── */}
      {result && (
        <div className={`mx-3 mb-2 rounded-xl border p-2 flex items-center gap-3 ${verdictCfg.bg} ${verdictCfg.border}`}>
          <ScoreGauge score={result.riskScore} verdict={result.verdict} />
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-bold ${verdictCfg.color}`}>{verdictCfg.label}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {warnings.length > 0 && <span className="text-red-400">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>}
              {warnings.length > 0 && cautions.length > 0 && <span className="text-slate-600"> · </span>}
              {cautions.length > 0 && <span className="text-amber-400">{cautions.length} caution{cautions.length > 1 ? 's' : ''}</span>}
              {badCount === 0 && <span className="text-green-500">No major concerns</span>}
            </div>
            {!result.deepAnalysis && state !== 'done' && (
              <div className="text-[9px] text-slate-600 mt-0.5">Passive only — run deep for candles/RSI</div>
            )}
          </div>
        </div>
      )}

      {/* ── Direction verdict banner ── */}
      {result?.directionVerdict && (
        <div className={`mx-3 mb-2 rounded-lg border p-2.5 ${
          result.directionVerdict.suitable 
            ? 'bg-green-900/20 border-green-500/30' 
            : 'bg-amber-900/20 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">
              {result.directionVerdict.suitable ? '✅' : '⚠'} 
              {result.directionVerdict.suitable ? ' GOOD SETUP' : ' WEAK SETUP'} FOR {result.directionVerdict.action || 'THIS TRADE'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {result.directionVerdict.reason}
          </p>
        </div>
      )}

      {/* ── Station Analysis Card ── */}
      {result?.stationAnalysis?.available && (
        <div className="mx-3 mb-2">
          <div className={`rounded-lg border p-2.5 ${
            result.stationAnalysis.atStation
              ? result.stationAnalysis.tradeEvaluation.suitable
                ? 'bg-green-900/15 border-green-500/25'
                : 'bg-amber-900/15 border-amber-500/25'
              : 'bg-slate-800/50 border-white/10'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🎯</span>
                <span className="text-xs font-semibold text-white">
                  {result.stationAnalysis.atStation ? 'AT STATION' : 'No Station Nearby'}
                </span>
              </div>
              {result.stationAnalysis.nearestStation && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  result.stationAnalysis.nearestStation.quality >= 7
                    ? 'bg-green-600/30 text-green-300'
                    : 'bg-slate-600/30 text-slate-300'
                }`}>
                  Q: {result.stationAnalysis.nearestStation.quality}/10
                </span>
              )}
            </div>
            
            {result.stationAnalysis.nearestStation && (
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] text-slate-500">Level:</span>
                  <span className="text-sm font-mono font-semibold text-white">
                    ₹{result.stationAnalysis.nearestStation.price.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({result.stationAnalysis.nearestStation.distance.toFixed(2)}% away)
                  </span>
                </div>
                
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] text-slate-500">Type:</span>
                  <span className={`text-xs font-medium ${
                    result.stationAnalysis.nearestStation.type === 'SUPPORT' ? 'text-green-400' :
                    result.stationAnalysis.nearestStation.type === 'RESISTANCE' ? 'text-red-400' :
                    'text-purple-400'
                  }`}>
                    {result.stationAnalysis.nearestStation.type}
                  </span>
                </div>
                
                {result.stationAnalysis.nearestStation.factors?.length > 0 && (
                  <div className="mt-1.5">
                    <span className="text-[10px] text-slate-500">Confluence:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.stationAnalysis.nearestStation.factors.map((factor, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                          {factor}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {result.stationAnalysis.nearestStation.tests > 0 && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    {result.stationAnalysis.nearestStation.tests} prior test{result.stationAnalysis.nearestStation.tests > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Insights list ── */}
      {result?.insights?.length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          {/* Always show warnings + cautions */}
          {[...warnings, ...cautions].map(ins => (
            <InsightCard key={ins.id} insight={ins} defaultOpen={ins.level === 'warning' || ins.id === 'averaging_down'} />
          ))}

          {/* Others collapsible */}
          {others.length > 0 && (
            <>
              {/* When no warnings/cautions, show all by default. When there are warnings, collapse the ok ones. */}
              {badCount === 0 ? (
                others.map(ins => (
                  <InsightCard key={ins.id} insight={ins} defaultOpen={true} />
                ))
              ) : (
                <>
                  <button
                    onClick={() => setExpanded(e => !e)}
                    className="w-full text-center text-[10px] text-slate-600 hover:text-slate-400 py-0.5 flex items-center justify-center gap-1"
                  >
                    {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    {expanded ? 'Hide' : `${others.length} more check${others.length > 1 ? 's' : ''}`}
                  </button>
                  {expanded && others.map(ins => (
                    <InsightCard key={ins.id} insight={ins} defaultOpen={false} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Action button ── */}
      <div className="px-3 pb-3">
        {state === 'loading' ? (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-purple-400">
            <RefreshCw size={13} className="animate-spin" />
            Running deep analysis…
          </div>
        ) : state === 'done' ? (
          <button
            onClick={runDeepAnalysis}
            className="w-full py-1.5 rounded-lg bg-white/5 hover:bg-white/8 text-[11px] text-slate-500 hover:text-slate-300 flex items-center justify-center gap-1.5 transition-colors border border-white/5"
          >
            <RefreshCw size={11} /> Refresh analysis
          </button>
        ) : (
          <button
            onClick={runDeepAnalysis}
            className="w-full py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 text-xs font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <Zap size={13} />
            {state === 'passive' ? 'Run Deep Analysis' : 'Analyse This Trade'}
          </button>
        )}
      </div>

      {/* Error */}
      {state === 'error' && (
        <p className="text-[10px] text-red-400 text-center pb-2">Analysis failed — check Kite connection</p>
      )}
    </div>
  );
}

// ─── Passive checks (pure JS, no API) ────────────────────────────────────────
function runPassiveChecks({ symbol, tradingsymbol, instrumentType, transactionType,
  positions, openOrders, sentimentScore, intradayScore, vix }) {

  const insights = [];
  let riskScore = 0;
  const openPos = (positions || []).filter(p => p.quantity !== 0);
  const isBuyingCall = transactionType === 'BUY' && instrumentType === 'CE';
  const isBuyingPut  = transactionType === 'BUY' && instrumentType === 'PE';

  // Position count
  if (openPos.length >= 5) {
    riskScore += 20;
    insights.push({ id: 'position_count', level: 'warning', icon: '⚠',
      title: `${openPos.length} positions open`, detail: 'High exposure. Consider reducing before adding more.' });
  } else if (openPos.length >= 3) {
    riskScore += 8;
    const pnl = openPos.reduce((s, p) => s + (p.pnl || 0), 0);
    insights.push({ id: 'position_count', level: 'info', icon: 'ℹ',
      title: `${openPos.length} positions open`, detail: `Unrealised: ${pnl >= 0 ? '+' : ''}₹${Math.round(pnl).toLocaleString()}` });
  }

  // Averaging down
  const existing = openPos.find(p => p.tradingsymbol === tradingsymbol || p.tradingsymbol?.includes(symbol));
  if (existing) {
    const avgDown = (existing.quantity > 0 && transactionType === 'BUY' && (existing.pnl || 0) < -500) ||
                    (existing.quantity < 0 && transactionType === 'SELL' && (existing.pnl || 0) < -500);
    if (avgDown) {
      riskScore += 20;
      insights.push({ id: 'averaging_down', level: 'warning', icon: '⚠',
        title: 'Averaging into a loss', detail: `${existing.tradingsymbol} at ₹${Math.round(existing.pnl || 0)} P&L. Higher risk.` });
    } else {
      riskScore += 5;
      insights.push({ id: 'existing_pos', level: 'info', icon: 'ℹ',
        title: `Already holding ${existing.tradingsymbol}`, detail: `P&L: ${existing.pnl >= 0 ? '+' : ''}₹${Math.round(existing.pnl || 0)}` });
    }
  }

  // Duplicate order
  const dup = (openOrders || []).find(o =>
    (o.tradingsymbol === tradingsymbol || o.tradingsymbol === symbol) &&
    ['OPEN', 'PENDING', 'TRIGGER PENDING'].includes(o.status?.toUpperCase())
  );
  if (dup) {
    riskScore += 15;
    insights.push({ id: 'dup_order', level: 'warning', icon: '🔁',
      title: 'Pending order for this symbol', detail: `${dup.transaction_type} ${dup.quantity} qty · ${dup.status}` });
  }

  // Trend conflict
  if (sentimentScore != null) {
    const bearish = sentimentScore < 45, bullish = sentimentScore > 55;
    const iDay_bearish = intradayScore != null && intradayScore < 45;
    const iDay_bullish = intradayScore != null && intradayScore > 55;
    if ((isBuyingCall && bearish && iDay_bearish) || (isBuyingPut && bullish && iDay_bullish)) {
      riskScore += 25;
      insights.push({ id: 'trend_conflict', level: 'warning', icon: '↕',
        title: 'Against trend on both timeframes', detail: `Daily: ${sentimentScore}/100 · Intraday: ${intradayScore}/100` });
    } else if ((isBuyingCall && bearish) || (isBuyingPut && bullish)) {
      riskScore += 12;
      insights.push({ id: 'trend_conflict', level: 'caution', icon: '↕',
        title: 'Against daily market trend', detail: `Sentiment ${sentimentScore}/100 — check intraday for confirmation.` });
    }
  }

  // VIX
  if (vix) {
    const v = parseFloat(vix);
    if (v > 25) {
      riskScore += 20;
      insights.push({ id: 'vix', level: 'warning', icon: '🌊',
        title: `VIX ${v.toFixed(1)} — High volatility`, detail: 'Options expensive. Premium decay risk elevated.' });
    } else if (v > 18) {
      riskScore += 8;
      insights.push({ id: 'vix', level: 'caution', icon: '🌊',
        title: `VIX ${v.toFixed(1)} — Elevated`, detail: 'Above-normal volatility. Widen your stop-loss.' });
    }
  }

  riskScore = Math.min(100, riskScore);
  const verdict = riskScore >= 60 ? 'danger' : riskScore >= 40 ? 'warning' : riskScore >= 20 ? 'caution' : 'clear';
  const levelOrder = { warning: 0, caution: 1, info: 2, clear: 3 };
  insights.sort((a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9));
  return { verdict, riskScore, insights, deepAnalysis: false };
}