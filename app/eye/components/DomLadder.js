'use client';

import { useState, useEffect, useRef } from 'react';

// ── Formatters ─────────────────────────────────────────────────────────────────
function fmtK(qty) {
  if (qty == null || qty === 0) return '—';
  const v = qty / 1000;
  return v >= 100 ? `${Math.round(v)}k` : v >= 10 ? `${v.toFixed(1)}k` : `${v.toFixed(2)}k`;
}

function fmtPrice(p) {
  if (p == null) return '—';
  return Number(p).toLocaleString('en-IN');
}

function fmtDelta(d) {
  if (d == null) return '—';
  const k    = d / 1000;
  const sign = d > 0 ? '+' : '';
  return `${sign}${Math.abs(k) >= 10 ? Math.round(k) : k.toFixed(1)}k`;
}

// ── Delta sparkline — mini bar chart of recent delta5m readings ───────────────
function DeltaSparkline({ history }) {
  if (!history?.length) return null;
  const maxAbs = Math.max(...history.map(h => Math.abs(h.d)), 1);
  return (
    <div className="px-1 pt-1">
      <p className="text-[8px] font-mono text-slate-700 mb-0.5 uppercase tracking-[0.1em]">δ5m timeline</p>
      <div className="flex items-end gap-[2px]" style={{ height: 24 }}>
        {history.map((pt, i) => {
          const pct    = Math.min(100, (Math.abs(pt.d) / maxAbs) * 100);
          const isBull = pt.d >= 0;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end"
              style={{ height: '100%' }}
              title={`${fmtDelta(pt.d)} (${new Date(pt.t * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })})`}
            >
              <div
                className={`w-full rounded-[1px] ${isBull ? 'bg-emerald-500/55' : 'bg-rose-500/55'}`}
                style={{ height: `${Math.max(8, pct)}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Single book level row ─────────────────────────────────────────────────────
function BookRow({ price, qty, isAsk, isIceberg, isWall, isStacking, maxQty }) {
  const pct = maxQty > 0 ? Math.min(100, (qty / maxQty) * 100) : 0;

  const barBg = isIceberg
    ? 'linear-gradient(to right, #78350f, #f59e0b)'
    : isWall
      ? (isAsk ? 'linear-gradient(to right, #9f1239, #fb7185)' : 'linear-gradient(to right, #065f46, #34d399)')
      : (isAsk ? 'linear-gradient(to right, #7f1d1d, #dc2626)' : 'linear-gradient(to right, #14532d, #16a34a)');

  const priceColor = isIceberg ? 'text-amber-300'
    : isWall ? (isAsk ? 'text-rose-300'  : 'text-emerald-300')
    : isAsk  ? 'text-rose-500/80' : 'text-emerald-600/80';

  const qtyColor = isIceberg ? 'text-amber-400'
    : isWall ? (isAsk ? 'text-rose-300' : 'text-emerald-300')
    : 'text-slate-600';

  return (
    <div className={`flex items-center gap-1 px-1 py-[2px] rounded-[2px] ${
      isIceberg ? 'bg-amber-950/25'
      : isWall  ? (isAsk ? 'bg-rose-950/15' : 'bg-emerald-950/15')
      : ''
    }`}>

      {/* Price */}
      <span className={`text-[9px] font-mono tabular-nums w-11 text-right shrink-0 leading-none ${priceColor}`}>
        {fmtPrice(price)}
      </span>

      {/* Bar */}
      <div className="flex-1 h-[5px] bg-slate-800/50 rounded-[2px] overflow-hidden">
        <div
          className="h-full rounded-[2px] transition-all duration-500"
          style={{ width: `${pct}%`, background: barBg }}
        />
      </div>

      {/* Qty */}
      <span className={`text-[9px] font-mono tabular-nums w-8 text-left shrink-0 leading-none ${qtyColor}`}>
        {fmtK(qty)}
      </span>

      {/* Indicator: iceberg, wall, or stacking */}
      <span className="w-3 text-[8px] shrink-0 text-center leading-none">
        {isIceberg ? '⚡' : isWall ? '🧱' : isStacking ? '↑' : ''}
      </span>
    </div>
  );
}

// ── DomLadder — main component ────────────────────────────────────────────────
// Uses SSE (/api/dom/live) with automatic fallback to polling (/api/dom/snapshot)
// if the SSE connection fails (e.g., Vercel Hobby plan 10s timeout).
export default function DomLadder({ underlying = 'NIFTY' }) {
  const [snap,    setSnap]    = useState(null);
  const [loading, setLoading] = useState(true);
  const esRef       = useRef(null);
  const fallbackRef = useRef(null);

  const fetchSnap = async () => {
    try {
      const res  = await fetch(`/api/dom/snapshot?underlying=${underlying}`, { cache: 'no-store' });
      if (!res.ok) { setSnap(null); return; }
      const data = await res.json();
      setSnap(data.available ? data : null);
    } catch { setSnap(null); }
    finally  { setLoading(false); }
  };

  useEffect(() => {
    let stopped = false;
    setLoading(true);
    setSnap(null);

    const startPolling = () => {
      if (stopped) return;
      fetchSnap();
      fallbackRef.current = setInterval(fetchSnap, 2000);
    };

    const trySSE = () => {
      if (typeof EventSource === 'undefined') { startPolling(); return; }

      const es = new EventSource(`/api/dom/live?underlying=${underlying}`);
      esRef.current = es;

      let sseGotData = false;

      es.onmessage = (e) => {
        if (stopped) return;
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'reconnect') {
            // Server-initiated graceful reconnect (before Vercel timeout)
            es.close();
            esRef.current = null;
            if (!stopped) trySSE();
            return;
          }
          sseGotData = true;
          setLoading(false);
          setSnap(data.available ? data : null);
        } catch {}
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // If SSE never got data, fall back to polling (Hobby plan / proxy issue)
        if (!stopped && !sseGotData) startPolling();
        // If it had data but dropped, retry SSE
        else if (!stopped) setTimeout(trySSE, 3000);
      };
    };

    trySSE();

    return () => {
      stopped = true;
      esRef.current?.close();
      esRef.current = null;
      clearInterval(fallbackRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlying]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="py-3 text-center text-[9px] font-mono text-slate-700 animate-pulse">
        Connecting to order book…
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="py-2 text-[9px] font-mono text-slate-700 text-center">
        Order book unavailable
      </div>
    );
  }

  const {
    bids = [], asks = [],
    spread, imbalance, delta5m, delta30m, deltaHistory = [],
    icebergAsk, icebergBid, bidStacking, askStacking,
    bidWallPrice, bidWallQty, askWallPrice, askWallQty,
    ageSeconds,
  } = snap;

  // Unified max qty for proportional bars across both sides
  const allQtys = [...bids, ...asks].map(l => l.qty).filter(q => q > 0);
  const maxQty  = allQtys.length ? Math.max(...allQtys) : 1;

  // asks[0] = best ask (lowest price); display with highest price at top → reverse
  const asksDisplay = [...asks].reverse();
  // bids[0] = best bid (highest price); display with highest at top → no reverse
  const bidsDisplay = bids;

  return (
    <div className="space-y-0.5">

      {/* Column labels */}
      <div className="flex items-center gap-1 px-1 mb-0.5">
        <span className="text-[7px] font-mono text-slate-700 w-11 text-right">price</span>
        <span className="flex-1" />
        <span className="text-[7px] font-mono text-slate-700 w-8 text-left">qty</span>
        <span className="w-3" />
      </div>

      {/* ASK side — asks[4] at top, asks[0] (best ask) closest to spread */}
      <div className="space-y-[1px]">
        {asksDisplay.map((lvl, i) => (
          <BookRow
            key={lvl.price}
            price={lvl.price}
            qty={lvl.qty}
            isAsk={true}
            isIceberg={icebergAsk != null && lvl.price === icebergAsk}
            isWall={askWallPrice != null && lvl.price === askWallPrice && (askWallQty ?? 0) > 15_000}
            isStacking={i === asksDisplay.length - 1 && askStacking === 'up'}
            maxQty={maxQty}
          />
        ))}
      </div>

      {/* Spread line */}
      <div className="flex items-center gap-1 px-1 py-0.5">
        <div className="flex-1 border-t border-slate-700/30" />
        <span className="text-[8px] font-mono text-slate-600 shrink-0 tabular-nums">
          {spread != null ? `${Number(spread).toFixed(1)}pt` : '—'}
        </span>
        <div className="flex-1 border-t border-slate-700/30" />
      </div>

      {/* BID side — bids[0] (best bid) closest to spread, bids[4] at bottom */}
      <div className="space-y-[1px]">
        {bidsDisplay.map((lvl, i) => (
          <BookRow
            key={lvl.price}
            price={lvl.price}
            qty={lvl.qty}
            isAsk={false}
            isIceberg={icebergBid != null && lvl.price === icebergBid}
            isWall={bidWallPrice != null && lvl.price === bidWallPrice && (bidWallQty ?? 0) > 15_000}
            isStacking={i === 0 && bidStacking === 'up'}
            maxQty={maxQty}
          />
        ))}
      </div>

      {/* Metrics footer */}
      <div className="border-t border-white/[0.04] pt-1.5 px-1 grid grid-cols-3 gap-1 text-[9px] font-mono">
        <div className="text-slate-600">
          Imb{' '}
          <span className={
            imbalance >= 1.6 ? 'text-emerald-500 font-semibold' :
            imbalance <= 0.63 ? 'text-rose-500 font-semibold'   : 'text-slate-400'
          }>
            {imbalance?.toFixed(1) ?? '—'}×
          </span>
        </div>
        <div className={`text-center ${
          delta5m  > 500  ? 'text-emerald-500' :
          delta5m  < -500 ? 'text-rose-500'   : 'text-slate-600'
        }`}>
          δ5m {fmtDelta(delta5m)}
        </div>
        <div className={`text-right ${
          delta30m  > 1000  ? 'text-emerald-500/70' :
          delta30m  < -1000 ? 'text-rose-500/70'    : 'text-slate-700'
        }`}>
          δ30m {fmtDelta(delta30m)}
        </div>
      </div>

      {/* Delta timeline sparkline */}
      {deltaHistory.length > 3 && <DeltaSparkline history={deltaHistory} />}

      {/* Data age */}
      {ageSeconds != null && (
        <p className="text-[8px] font-mono text-slate-800 text-right px-1 pt-0.5">
          {ageSeconds}s ago
        </p>
      )}
    </div>
  );
}
