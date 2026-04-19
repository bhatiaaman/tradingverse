'use client';
// ─── SymbolSearch ─────────────────────────────────────────────────────────────
// Two modes:
//   default  — inline trigger showing current symbol; onSelectSymbol callback or router.replace
//   navMode  — pill search box in the nav; always navigates to /chart?symbol=...
//              supports ⌘K / Ctrl+K global shortcut

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const QUICK_PICKS = [
  'NIFTY', 'BANKNIFTY', 'FINNIFTY',
  'RELIANCE', 'HCLTECH', 'INFY', 'TCS',
  'HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK',
];

export default function SymbolSearch({ symbol, onSelectSymbol, navMode = false, backPath = '' }) {
  const router   = useRouter();
  const [open,   setOpen]    = useState(false);
  const [query,  setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cursor,  setCursor]  = useState(-1);
  const inputRef  = useRef(null);
  const wrapRef   = useRef(null);
  const timerRef  = useRef(null);

  // ⌘K / Ctrl+K global shortcut — nav mode only
  useEffect(() => {
    if (!navMode) return;
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 30);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navMode]);

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
    if (navMode) {
      const url = `/chart?symbol=${upper}&interval=day${backPath ? `&back=${encodeURIComponent(backPath)}` : ''}`;
      window.open(url, '_blank');
      return;
    }
    if (upper === symbol?.toUpperCase()) return;
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
    if (navMode) {
      return (
        <button
          onClick={openSearch}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.07] border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 transition-all text-xs"
          title="Search symbol (⌘K)"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
          </svg>
          <span className="text-slate-500 dark:text-slate-400">Search</span>
          <kbd className="hidden lg:inline-flex items-center text-[10px] font-mono text-slate-400 dark:text-slate-600 bg-slate-200 dark:bg-white/[0.06] px-1 py-px rounded">⌘K</kbd>
        </button>
      );
    }
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
      <div className={`flex items-center gap-1.5 border rounded-md px-2 py-1 ${
        navMode
          ? 'bg-slate-100 dark:bg-white/[0.07] border-slate-200 dark:border-white/20 rounded-full'
          : 'bg-white/[0.08] border-white/20'
      }`}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-slate-400 flex-shrink-0">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value.toUpperCase())}
          onKeyDown={onKeyDown}
          placeholder={navMode ? 'Search symbol…' : symbol}
          className={`bg-transparent text-sm outline-none tracking-wide ${
            navMode
              ? 'text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 w-36 font-normal'
              : 'text-white font-bold w-28 placeholder:text-slate-500 placeholder:font-normal'
          }`}
        />
        {loading && (
          <span className="w-3 h-3 border border-slate-500 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />
        )}
      </div>

      {/* Dropdown */}
      <div className={`absolute top-full mt-1 bg-white dark:bg-[#0f1629] border border-slate-200 dark:border-white/[0.12] rounded-lg shadow-2xl overflow-hidden z-50 ${
        navMode ? 'left-0 w-64' : 'left-0 w-52'
      }`}>
        {!query.trim() && (
          <div className="px-3 py-1.5 text-[9px] text-slate-400 dark:text-slate-600 uppercase tracking-wider border-b border-slate-100 dark:border-white/[0.06]">
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
              i === cursor
                ? 'bg-indigo-600/20 dark:bg-indigo-600/30 text-indigo-700 dark:text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.07] hover:text-slate-900 dark:hover:text-white'
            } ${!navMode && inst.symbol === symbol ? 'text-indigo-400' : ''}`}
          >
            <span className="font-semibold tracking-wide">{inst.symbol}</span>
            <span className="text-slate-400 dark:text-slate-600 text-[10px]">{inst.exchange}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
