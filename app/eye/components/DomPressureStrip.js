'use client';

import { useState, useEffect, useRef } from 'react';

const POLL_MS = 15_000;

const DIRECTION_STYLE = {
  bull:    { border: 'border-l-emerald-500', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  bear:    { border: 'border-l-rose-500',    dot: 'bg-rose-400',    text: 'text-rose-300'    },
  neutral: { border: 'border-l-slate-600',   dot: 'bg-slate-500',   text: 'text-slate-400'   },
};

export default function DomPressureStrip({ underlying = 'NIFTY', devMode = false }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const fetch_ = async () => {
    try {
      const params = new URLSearchParams({ underlying });
      if (devMode) params.set('dev', 'true');
      const res = await fetch(`/api/dom/pressure?${params}`, { cache: 'no-store' });
      if (!res.ok) { setData(null); return; }
      const json = await res.json();
      setData(json.available ? json : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlying]);

  // Nothing to show — bridge offline, DOM disabled, or market closed
  if (loading || !data) return null;

  const style = DIRECTION_STYLE[data.direction] ?? DIRECTION_STYLE.neutral;
  const scoreStr = data.score != null ? ` (${data.score}/10)` : '';

  return (
    <div className={`mx-3 mb-2 rounded border-l-2 ${style.border} bg-slate-900/60 px-3 py-2 space-y-1`}>
      {/* Title + pulse dot */}
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse ${style.dot}`} />
        <span className="text-[9px] font-mono font-semibold text-slate-500 uppercase tracking-wide">
          Live Market Bias
        </span>
      </div>

      {/* Headline: "Current Market Bias: Bullish (7.5/10)" */}
      <p className={`text-[11px] font-mono font-semibold leading-tight ${style.text}`}>
        {data.biasLabel}{scoreStr}
      </p>

      {/* Signal list: "Based on: Bid stacking · Buy side 2.1× heavier · Positive delta 8.4k" */}
      {data.signals?.length > 0 && (
        <p className="text-[10px] font-mono text-slate-500">
          <span className="text-slate-600">Based on: </span>
          {data.signals.join(' · ')}
        </p>
      )}

      {/* Invalidation */}
      {data.invalidation && (
        <p className="text-[10px] font-mono text-amber-600/80">❗ {data.invalidation}</p>
      )}

      {/* Wall warning */}
      {data.wallNote && (
        <p className="text-[10px] font-mono text-amber-500/80">{data.wallNote}</p>
      )}
    </div>
  );
}
