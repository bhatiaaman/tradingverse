'use client';

import { useState, useEffect, useRef } from 'react';
import { X }                            from 'lucide-react';
import DomLadder                        from './DomLadder';

const POLL_MS = 15_000;

const DIR_STYLE = {
  bull:    { dot: 'bg-emerald-400', text: 'text-emerald-300', badgeCls: 'bg-emerald-950 border-emerald-700/50 text-emerald-300', grad: 'linear-gradient(to right, #065f46, #34d399)' },
  bear:    { dot: 'bg-rose-400',    text: 'text-rose-300',    badgeCls: 'bg-rose-950 border-rose-700/50 text-rose-300',         grad: 'linear-gradient(to right, #9f1239, #fb7185)' },
  neutral: { dot: 'bg-slate-500',   text: 'text-slate-400',   badgeCls: 'bg-slate-800 border-slate-600/50 text-slate-400',      grad: 'linear-gradient(to right, #334155, #64748b)' },
};

// ── Subscriptions mini-panel ───────────────────────────────────────────────────
function SubscriptionsPanel() {
  const [subs,    setSubs]    = useState([]);
  const [input,   setInput]   = useState('');
  const [adding,  setAdding]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = async () => {
    try {
      const res  = await fetch('/api/dom/subscriptions', { cache: 'no-store' });
      const data = await res.json();
      setSubs(data.subscriptions ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    setAdding(true); setError(null);
    try {
      const res  = await fetch('/api/dom/subscriptions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ symbol: sym }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      setSubs(data.subscriptions ?? []);
      setInput('');
    } catch { setError('Network error'); }
    finally { setAdding(false); }
  };

  const remove = async (sym) => {
    try {
      const res  = await fetch(`/api/dom/subscriptions?symbol=${sym}`, { method: 'DELETE' });
      const data = await res.json();
      setSubs(data.subscriptions ?? []);
    } catch { /* silent */ }
  };

  if (loading) {
    return <p className="text-[9px] font-mono text-slate-700 animate-pulse">Loading…</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[8px] font-mono text-slate-600 uppercase tracking-[0.12em]">
        Bridge subscriptions · max 10
      </p>

      {subs.length === 0 && (
        <p className="text-[9px] font-mono text-slate-700">No stocks subscribed yet.</p>
      )}

      {subs.map(s => (
        <div key={s.symbol} className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.alive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
          <span className="text-[9px] font-mono text-slate-300 flex-1">{s.symbol}</span>
          {s.ltp != null && (
            <span className="text-[9px] font-mono tabular-nums text-slate-500">
              ₹{Number(s.ltp).toLocaleString('en-IN')}
            </span>
          )}
          {!s.alive && s.ageSeconds != null && (
            <span className="text-[8px] font-mono text-slate-700">{s.ageSeconds}s</span>
          )}
          <button
            onClick={() => remove(s.symbol)}
            className="text-slate-700 hover:text-rose-400 transition-colors"
          >
            <X size={9} />
          </button>
        </div>
      ))}

      {/* Add input */}
      <div className="flex items-center gap-1 pt-0.5">
        <input
          type="text"
          value={input}
          placeholder="HDFCBANK"
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && add()}
          className="flex-1 bg-[#1c2030] border border-white/[0.08] text-[9px] font-mono text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-slate-500 placeholder:text-slate-700"
        />
        <button
          onClick={add}
          disabled={adding || !input.trim()}
          className="text-[9px] font-mono px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
        >
          {adding ? '…' : '+'}
        </button>
      </div>
      {error && <p className="text-[9px] font-mono text-rose-400">{error}</p>}
    </div>
  );
}

// ── DomPressureStrip ──────────────────────────────────────────────────────────
export default function DomPressureStrip({ underlying = 'NIFTY', devMode = false }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [ladderOpen, setLadderOpen] = useState(false);
  const [subsOpen,   setSubsOpen]   = useState(false);
  const timerRef = useRef(null);

  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams({ underlying });
      if (devMode) params.set('dev', 'true');
      const res  = await fetch(`/api/dom/pressure?${params}`, { cache: 'no-store' });
      if (!res.ok) { setData(null); return; }
      const json = await res.json();
      setData(json.available ? json : null);
    } catch { setData(null); }
    finally  { setLoading(false); }
  };

  useEffect(() => {
    fetchSummary();
    timerRef.current = setInterval(fetchSummary, POLL_MS);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlying]);

  // Close sub-panels when underlying switches
  useEffect(() => {
    setLadderOpen(false);
    setSubsOpen(false);
  }, [underlying]);

  if (loading || !data) return null;

  const style = DIR_STYLE[data.direction] ?? DIR_STYLE.neutral;
  const pct   = data.score != null ? Math.min(100, (data.score / 10) * 100) : 0;

  return (
    <div className="mx-3 mb-2 rounded-lg bg-[#1c2030]/70 border border-white/[0.06] overflow-hidden">

      {/* ── Summary section ─────────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 space-y-2">

        {/* Header: label + live pulse + score badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse ${style.dot}`} />
            <span className="text-[9px] font-mono font-semibold text-slate-500 uppercase tracking-[0.15em]">
              Order Book Bias
            </span>
          </div>
          {data.score != null && (
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border font-bold ${style.badgeCls}`}>
              {data.score.toFixed(1)}/10
            </span>
          )}
        </div>

        {/* Headline */}
        <p className={`text-xs font-bold font-mono leading-tight ${style.text}`}>
          {data.biasLabel}
        </p>

        {/* Score bar */}
        {data.score != null && (
          <div className="w-full bg-slate-800/80 rounded-full overflow-hidden h-1.5">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: style.grad }}
            />
          </div>
        )}

        {/* Signals */}
        {data.signals?.length > 0 && (
          <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
            {data.signals.join(' · ')}
          </p>
        )}

        {/* Invalidation */}
        {data.invalidation && (
          <p className="text-[10px] font-mono text-amber-600/70">❗ {data.invalidation}</p>
        )}

        {/* Wall note */}
        {data.wallNote && (
          <p className="text-[10px] font-mono text-amber-500/70">{data.wallNote}</p>
        )}

        {/* Toggle buttons: Book / Stocks */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            onClick={() => { setLadderOpen(p => !p); if (!ladderOpen) setSubsOpen(false); }}
            className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
              ladderOpen
                ? 'bg-slate-700 border-slate-500 text-slate-200'
                : 'bg-transparent border-slate-700/50 text-slate-600 hover:text-slate-400 hover:border-slate-600'
            }`}
          >
            Book {ladderOpen ? '▲' : '▾'}
          </button>
          <button
            onClick={() => { setSubsOpen(p => !p); if (!subsOpen) setLadderOpen(false); }}
            className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
              subsOpen
                ? 'bg-slate-700 border-slate-500 text-slate-200'
                : 'bg-transparent border-slate-700/50 text-slate-600 hover:text-slate-400 hover:border-slate-600'
            }`}
          >
            Stocks {subsOpen ? '▲' : '▾'}
          </button>
        </div>
      </div>

      {/* ── DOM Ladder (collapsible) ─────────────────────────────────────────── */}
      {ladderOpen && (
        <div className="border-t border-white/[0.04] px-2 py-2">
          <DomLadder underlying={underlying} />
        </div>
      )}

      {/* ── Subscriptions (collapsible) ──────────────────────────────────────── */}
      {subsOpen && (
        <div className="border-t border-white/[0.04] px-3 py-2.5">
          <SubscriptionsPanel />
        </div>
      )}
    </div>
  );
}
