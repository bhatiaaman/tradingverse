'use client';
import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Phase config — light + dark variants in every value
// ─────────────────────────────────────────────────────────────────────────────
const PHASE_META = {
  MARKUP: {
    label: 'Markup',
    description: 'Trending up — institutional buying in progress',
    dot:    'bg-green-500 dark:bg-green-400',
    border: 'border-green-300 dark:border-green-500/30',
    bg:     'bg-green-50 dark:bg-green-500/8',
    text:   'text-green-700 dark:text-green-400',
    badge:  'bg-green-100 text-green-700 border-green-300 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30',
  },
  DISTRIBUTION: {
    label: 'Distribution',
    description: 'Smart money offloading at highs — elevated risk for new longs',
    dot:    'bg-orange-500 dark:bg-orange-400',
    border: 'border-orange-300 dark:border-orange-500/30',
    bg:     'bg-orange-50 dark:bg-orange-500/8',
    text:   'text-orange-700 dark:text-orange-400',
    badge:  'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30',
  },
  MARKDOWN: {
    label: 'Markdown',
    description: 'Downtrend in force — selling pressure dominates',
    dot:    'bg-red-500 dark:bg-red-400',
    border: 'border-red-300 dark:border-red-500/30',
    bg:     'bg-red-50 dark:bg-red-500/8',
    text:   'text-red-700 dark:text-red-400',
    badge:  'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30',
  },
  ACCUMULATION: {
    label: 'Accumulation',
    description: 'Base formation below EMAs — watching for reversal signals',
    dot:    'bg-blue-500 dark:bg-blue-400',
    border: 'border-blue-300 dark:border-blue-500/30',
    bg:     'bg-blue-50 dark:bg-blue-500/8',
    text:   'text-blue-700 dark:text-blue-400',
    badge:  'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
  },
  INSUFFICIENT_DATA: {
    label: 'No Data',
    description: 'Not enough candles to classify',
    dot:    'bg-slate-400 dark:bg-slate-500',
    border: 'border-slate-200 dark:border-slate-700',
    bg:     'bg-slate-50 dark:bg-slate-800/40',
    text:   'text-slate-500 dark:text-slate-400',
    badge:  'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600/30',
  },
};

const CONF_COLOR = {
  HIGH:   'text-emerald-600 dark:text-emerald-400',
  MEDIUM: 'text-amber-600 dark:text-amber-400',
  LOW:    'text-slate-500',
};

// ── Single instrument card ────────────────────────────────────────────────────
function PhaseCard({ symbol, data, loading }) {
  const meta = PHASE_META[data?.phase] ?? PHASE_META.INSUFFICIENT_DATA;

  if (loading && !data) return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4 flex items-center gap-3 animate-pulse">
      <div className="w-3 h-3 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded w-2/3" />
      </div>
    </div>
  );

  if (!data || data.error) return (
    <div className="rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-white/[0.02] p-4">
      <div className="text-xs text-slate-500 dark:text-slate-600">{symbol} — unavailable</div>
    </div>
  );

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} p-4`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta.dot}`} />
          <span className="text-sm font-bold text-slate-900 dark:text-white">{symbol}</span>
          <span className="text-xs text-slate-500">{data.symbolName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${CONF_COLOR[data.confidence]}`}>{data.confidence}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${meta.badge}`}>{meta.label}</span>
        </div>
      </div>

      {/* Phase description */}
      <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">{meta.description}</p>

      {/* Signals */}
      {data.signals?.length > 0 && (
        <div className="space-y-1 mb-3">
          {data.signals.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${meta.dot}`} />
              {s}
            </div>
          ))}
        </div>
      )}

      {/* EMA levels */}
      {(data.ema20 || data.ema50) && (
        <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-2 border-t border-slate-200 dark:border-white/5 flex-wrap">
          {data.currentPrice && <span className="text-slate-900 dark:text-white font-mono">₹{data.currentPrice?.toLocaleString('en-IN')}</span>}
          {data.ema20 && (
            <span>
              EMA20 <span className={data.priceVsEma20 === 'ABOVE' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                ₹{data.ema20?.toLocaleString('en-IN')}
              </span>
            </span>
          )}
          {data.ema50 && (
            <span>
              EMA50 <span className={data.priceVsEma50 === 'ABOVE' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                ₹{data.ema50?.toLocaleString('en-IN')}
              </span>
            </span>
          )}
          {data.volumeBias && (
            <span className="ml-auto">
              Vol <span className={data.volumeBias === 'BULLISH' ? 'text-green-600 dark:text-green-400' : data.volumeBias === 'BEARISH' ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}>
                {data.volumeBias.toLowerCase()}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main exported section ─────────────────────────────────────────────────────
export default function MarketPhaseSection() {
  const [phases, setPhases]   = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchPhases = async () => {
    setLoading(true);
    try {
      const [nifty, bnf] = await Promise.allSettled([
        fetch('/api/market-regime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'NIFTY',     type: 'swing' }) }).then(r => r.json()),
        fetch('/api/market-regime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'BANKNIFTY', type: 'swing' }) }).then(r => r.json()),
      ]);
      setPhases({
        NIFTY:     nifty.status === 'fulfilled' ? nifty.value : { error: true },
        BANKNIFTY: bnf.status   === 'fulfilled' ? bnf.value   : { error: true },
      });
      setLastUpdated(new Date());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPhases(); }, []);

  // Summary — what type of environment is this for swing traders?
  const niftyPhase   = phases.NIFTY?.phase;
  const bnfPhase     = phases.BANKNIFTY?.phase;
  const bothMarkup   = niftyPhase === 'MARKUP'   && bnfPhase === 'MARKUP';
  const bothMarkdown = niftyPhase === 'MARKDOWN'  && bnfPhase === 'MARKDOWN';
  const bothDist     = niftyPhase === 'DISTRIBUTION' && bnfPhase === 'DISTRIBUTION';
  const envSummary   =
    bothMarkup   ? { text: 'Bullish environment — swing longs favoured',      color: 'text-green-600 dark:text-green-400'  } :
    bothMarkdown ? { text: 'Bearish environment — swing shorts favoured',     color: 'text-red-600 dark:text-red-400'      } :
    bothDist     ? { text: 'Distribution — reduce exposure, avoid new longs', color: 'text-orange-600 dark:text-orange-400' } :
    niftyPhase && bnfPhase ? { text: 'Mixed signals — size down, be selective', color: 'text-amber-600 dark:text-amber-400' } :
    null;

  return (
    <div className="mb-10">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-4 rounded-full bg-violet-500" />
            <span className="text-xs font-bold tracking-[0.15em] uppercase text-violet-600 dark:text-violet-400">Market Phase</span>
          </div>
          <p className="text-slate-500 text-xs pl-3">
            Swing / positional context — based on daily candles
          </p>
        </div>
        <button
          onClick={fetchPhases}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Environment summary banner */}
      {envSummary && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 text-xs font-medium">
          <span className={envSummary.color}>{envSummary.text}</span>
        </div>
      )}

      {/* Cards */}
      <div className="grid md:grid-cols-2 gap-3">
        <PhaseCard symbol="NIFTY"     data={phases.NIFTY}     loading={loading} />
        <PhaseCard symbol="BANKNIFTY" data={phases.BANKNIFTY} loading={loading} />
      </div>

      {lastUpdated && (
        <p className="text-[10px] text-slate-400 dark:text-slate-700 mt-2 text-right">
          Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}
