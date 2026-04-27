'use client';

import { useState, useEffect, useRef } from 'react';
import DomLadder                        from './DomLadder';

const POLL_MS = 15_000;

const DIR_STYLE = {
  bull:    { dot: 'bg-emerald-400', text: 'text-emerald-300', badgeCls: 'bg-emerald-950 border-emerald-700/50 text-emerald-300', grad: 'linear-gradient(to right, #065f46, #34d399)' },
  bear:    { dot: 'bg-rose-400',    text: 'text-rose-300',    badgeCls: 'bg-rose-950 border-rose-700/50 text-rose-300',         grad: 'linear-gradient(to right, #9f1239, #fb7185)' },
  neutral: { dot: 'bg-slate-500',   text: 'text-slate-400',   badgeCls: 'bg-slate-800 border-slate-600/50 text-slate-400',      grad: 'linear-gradient(to right, #334155, #64748b)' },
};

export default function DomPressureStrip({ underlying = 'NIFTY', devMode = false, onData, headless = false }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [ladderOpen, setLadderOpen] = useState(false);
  const timerRef = useRef(null);

  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams({ underlying });
      if (devMode) params.set('dev', 'true');
      const res  = await fetch(`/api/dom/pressure?${params}`, { cache: 'no-store' });
      if (!res.ok) { setData(null); onData?.(null); return; }
      const json = await res.json();
      const resolved = json.available ? json : null;
      setData(resolved);
      onData?.(resolved);
    } catch { setData(null); onData?.(null); }
    finally  { setLoading(false); }
  };

  useEffect(() => {
    fetchSummary();
    timerRef.current = setInterval(fetchSummary, POLL_MS);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlying]);

  useEffect(() => { setLadderOpen(false); }, [underlying]);

  if (headless || loading || !data) return null;

  const style = DIR_STYLE[data.direction] ?? DIR_STYLE.neutral;
  const pct   = data.score != null ? Math.min(100, (data.score / 10) * 100) : 0;

  return (
    <div className="mx-3 mb-2 rounded-lg bg-[#1c2030]/70 border border-white/[0.06] overflow-hidden">

      {/* ── Summary ─────────────────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 space-y-2">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse ${style.dot}`} />
            <span className="text-[9px] font-mono font-semibold text-slate-400 uppercase tracking-[0.15em]">
              Order Book Bias
            </span>
          </div>
          {data.score != null && (
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border font-bold ${style.badgeCls}`}>
              {data.score.toFixed(1)}/10
            </span>
          )}
        </div>

        <p className={`text-xs font-bold font-mono leading-tight ${style.text}`}>
          {data.biasLabel}
        </p>

        {data.score != null && (
          <div className="w-full bg-slate-800/80 rounded-full overflow-hidden h-1.5">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: style.grad }}
            />
          </div>
        )}

        {data.signals?.length > 0 && (
          <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
            {data.signals.join(' · ')}
          </p>
        )}

        {data.invalidation && (
          <p className="text-[10px] font-mono text-amber-400 leading-relaxed">❗ {data.invalidation}</p>
        )}

        {data.wallNote && (
          <p className="text-[10px] font-mono text-amber-400 leading-relaxed">{data.wallNote}</p>
        )}

        {/* Book toggle */}
        <button
          onClick={() => setLadderOpen(p => !p)}
          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
            ladderOpen
              ? 'bg-slate-700 border-slate-500 text-slate-200'
              : 'bg-transparent border-slate-700/50 text-slate-600 hover:text-slate-400 hover:border-slate-600'
          }`}
        >
          Book {ladderOpen ? '▲' : '▾'}
        </button>
      </div>

      {/* ── DOM Ladder ───────────────────────────────────────────────────────── */}
      {ladderOpen && (
        <div className="border-t border-white/[0.04] px-2 py-2">
          <DomLadder underlying={underlying} />
        </div>
      )}
    </div>
  );
}
