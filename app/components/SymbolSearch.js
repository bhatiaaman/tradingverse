'use client';
// ─── SymbolSearch ─────────────────────────────────────────────────────────────
// Click the symbol name in the chart header → inline search opens → select →
// router.replace updates the URL and chart re-initialises with the new symbol.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const QUICK_PICKS = [
  'NIFTY', 'BANKNIFTY', 'FINNIFTY',
  'RELIANCE', 'HCLTECH', 'INFY', 'TCS',
  'HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK',
];

export default function SymbolSearch({ symbol, onSelectSymbol }) {
  const router   = useRouter();
  const [open,   setOpen]    = useState(false);
  const [query,  setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cursor,  setCursor]  = useState(-1);
  const inputRef  = useRef(null);
  const wrapRef   = useRef(null);
  const timerRef  = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Debounced search
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search-instruments?q=${encodeURIComponent(query.trim())}&limit=8`);
        const d = await r.json();
        setResults((d.instruments || []).slice(0, 8));
        setCursor(-1);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const openSearch = () => {
    setOpen(true);
    setQuery('');
    setResults([]);
    setCursor(-1);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const close = () => { setOpen(false); setQuery(''); setResults([]); setCursor(-1); };

  const select = (sym) => {
    close();
    const upper = sym.toUpperCase();
    if (upper === symbol.toUpperCase()) return;
    if (onSelectSymbol) {
      onSelectSymbol(upper);
    } else {
      router.replace(`/chart?symbol=${upper}`);
    }
  };

  const displayList = query.trim() ? results : QUICK_PICKS.map(s => ({ symbol: s, exchange: 'NSE' }));

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, displayList.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, -1)); return; }
    if (e.key === 'Enter' && cursor >= 0 && displayList[cursor]) { select(displayList[cursor].symbol); return; }
    if (e.key === 'Enter' && query.trim()) { select(query.trim().toUpperCase()); }
  };

  if (!open) {
    return (
      <button
        onClick={openSearch}
        className="text-white font-bold text-sm tracking-wide hover:text-indigo-300 transition-colors cursor-pointer flex items-center gap-1 group"
        title="Search symbol"
      >
        {symbol}
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-slate-500 group-hover:text-indigo-400 transition-colors mt-px">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Input */}
      <div className="flex items-center gap-1.5 bg-white/[0.08] border border-white/20 rounded-md px-2 py-1">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-slate-400 flex-shrink-0">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value.toUpperCase())}
          onKeyDown={onKeyDown}
          placeholder={symbol}
          className="bg-transparent text-white text-sm font-bold w-28 outline-none placeholder:text-slate-500 placeholder:font-normal tracking-wide"
        />
        {loading && (
          <span className="w-3 h-3 border border-slate-500 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />
        )}
      </div>

      {/* Dropdown */}
      <div className="absolute top-full left-0 mt-1 w-52 bg-[#0f1629] border border-white/[0.12] rounded-lg shadow-2xl overflow-hidden z-50">
        {!query.trim() && (
          <div className="px-3 py-1.5 text-[9px] text-slate-600 uppercase tracking-wider border-b border-white/[0.06]">
            Quick picks
          </div>
        )}
        {displayList.length === 0 && query.trim() && !loading && (
          <div className="px-3 py-3 text-xs text-slate-500 text-center">No results for "{query}"</div>
        )}
        {displayList.map((inst, i) => (
          <button
            key={inst.symbol}
            onClick={() => select(inst.symbol)}
            className={`w-full px-3 py-2 flex items-center justify-between text-xs transition-colors ${
              i === cursor ? 'bg-indigo-600/30 text-white' : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
            } ${inst.symbol === symbol ? 'text-indigo-400' : ''}`}
          >
            <span className="font-semibold tracking-wide">{inst.symbol}</span>
            <span className="text-slate-600 text-[10px]">{inst.exchange}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
