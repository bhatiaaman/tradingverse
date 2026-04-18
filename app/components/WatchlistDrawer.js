'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Volume2, ListFilter, Trash2 } from 'lucide-react';

const LS_KEY = 'tradingverse_watchlists';
const DEFAULT_LISTS = [
  { id: 'fno', name: 'FnO Stocks (NSE)', symbols: [], isFixed: true },
  { id: 'movers', name: 'Movers & Shakers', symbols: [], isFixed: true },
];

export default function WatchlistDrawer({ 
  isOpen, 
  onToggle, 
  onSelectSymbol, 
  currentSymbol,
  theme = 'dark'
}) {
  const isDark = theme === 'dark';
  const [activeListId, setActiveListId] = useState('fno');
  const [watchlists, setWatchlists] = useState(DEFAULT_LISTS);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [searchSymbols, setSearchSymbols] = useState([]); // for adding to custom list
  const [showSearch, setShowSearch] = useState(false);

  const containerRef = useRef(null);

  // 1. Initial Load from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with fixed defaults to ensure they exist
        const merged = DEFAULT_LISTS.map(def => {
          const s = parsed.find(x => x.id === def.id);
          return s ? { ...def, ...s, isFixed: true } : def;
        });
        const custom = parsed.filter(x => !DEFAULT_LISTS.find(d => d.id === x.id));
        setWatchlists([...merged, ...custom]);
      }
    } catch (e) {
      console.error('Error loading watchlists:', e);
    }
  }, []);

  // 2. Persist Custom Lists to LocalStorage
  useEffect(() => {
    const toSave = watchlists.map(w => ({ id: w.id, name: w.name, symbols: w.symbols }));
    localStorage.setItem(LS_KEY, JSON.stringify(toSave));
  }, [watchlists]);

  // 3. Fetch Pricing Data (FnO, Movers, Custom)
  useEffect(() => {
    if (!activeListId) return;

    if (activeListId === 'fno') {
      setLoading(true);
      fetch('/api/option-meta?action=quotes')
        .then(r => r.json())
        .then(d => { if (d.symbols) updateFixedList('fno', d.symbols); })
        .finally(() => setLoading(false));
    } else if (activeListId === 'movers') {
      setLoading(true);
      fetch('/api/pre-market/movers?limit=10')
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            const gainers = (d.gainers || []).map(s => ({ ...s, type: 'gainer' }));
            const losers = (d.losers || []).map(s => ({ ...s, type: 'loser' }));
            const all = [...(d.gainers || []), ...(d.losers || [])];
            const volumeShakers = all
              .filter(s => s.volRatio > 1.2)
              .sort((a,b) => b.volRatio - a.volRatio)
              .slice(0, 10)
              .map(s => ({ ...s, type: 'volume' }));

            const combined = [...gainers, ...losers, ...volumeShakers];
            const unique = [];
            const seen = new Set();
            for (const item of combined) {
              if (!seen.has(item.symbol)) { unique.push(item); seen.add(item.symbol); }
            }
            updateFixedList('movers', unique);
          }
        })
        .finally(() => setLoading(false));
    } else if (activeListId.startsWith('custom_')) {
      const list = watchlists.find(w => w.id === activeListId);
      if (!list || list.symbols.length === 0) return;

      // Only fetch if symbols are missing price data
      const needsPrice = list.symbols.some(s => s.lastPrice === undefined || s.lastPrice === null);
      if (!needsPrice) return;

      const symString = list.symbols.map(s => s.symbol).join(',');
      fetch(`/api/option-meta?action=quotes&symbols=${symString}`)
        .then(r => r.json())
        .then(d => {
          if (d.symbols) {
            // Update the specific custom list with prices
            setWatchlists(prev => prev.map(w => {
              if (w.id === activeListId) {
                const pricedSymbols = w.symbols.map(orig => {
                  const match = d.symbols.find(qs => qs.symbol === orig.symbol);
                  return match ? { ...orig, ...match } : orig;
                });
                return { ...w, symbols: pricedSymbols };
              }
              return w;
            }));
          }
        });
    }
  }, [activeListId, watchlists.find(w => w.id === activeListId)?.symbols.length]);

  const updateFixedList = (id, symbols) => {
    setWatchlists(prev => prev.map(w => w.id === id ? { ...w, symbols } : w));
  };

  const handleAddList = () => {
    if (!newListName.trim()) return;
    const newList = {
      id: 'custom_' + Date.now(),
      name: newListName.trim(),
      symbols: [],
      isFixed: false
    };
    setWatchlists([...watchlists, newList]);
    setActiveListId(newList.id);
    setNewListName('');
    setShowAddList(false);
  };

  const handleDeleteList = (id, e) => {
    e.stopPropagation();
    if (confirm('Delete this watchlist?')) {
      const filtered = watchlists.filter(w => w.id !== id);
      setWatchlists(filtered);
      if (activeListId === id) setActiveListId('fno');
    }
  };

  const currentList = watchlists.find(w => w.id === activeListId) || watchlists[0];

  const addToCustomList = (symbol) => {
    setWatchlists(prev => prev.map(w => {
      if (w.id === activeListId) {
        if (w.symbols.find(s => s.symbol === symbol)) return w;
        return { ...w, symbols: [...w.symbols, { symbol }] };
      }
      return w;
    }));
    setShowSearch(false);
    setSearchQuery('');
  };

  const removeFromCustomList = (symbol, e) => {
    e.stopPropagation();
    setWatchlists(prev => prev.map(w => {
      if (w.id === activeListId) {
        return { ...w, symbols: w.symbols.filter(s => s.symbol !== symbol) };
      }
      return w;
    }));
  };

  // Global search for adding any NSE symbol
  const handleSearch = (q) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchSymbols([]); return; }
    
    fetch(`/api/search-symbols?q=${q}`)
      .then(r => r.json())
      .then(d => {
        if (d.symbols) {
          setSearchSymbols(d.symbols);
        }
      });
  };

  return (
    <div 
      className={`relative h-full border-l transition-all duration-300 flex flex-col overflow-visible
        ${isDark ? 'bg-[#0a0e1a] border-white/10' : 'bg-white border-slate-200'}
        ${isOpen ? 'w-80' : 'w-0'}`}
    >
      {/* Toggle Handle - Professional 'Tab' that sticks out from the right edge */}
      <button 
        onClick={onToggle}
        className={`absolute left-[-24px] top-1/2 -translate-y-1/2 w-6 h-24 flex items-center justify-center transition-all z-20 rounded-l-xl border-y border-l shadow-2xl group
          ${isDark 
            ? 'bg-[#0f1d33]/80 border-white/10 text-blue-400 hover:bg-[#152a4a] hover:w-8 hover:left-[-32px]' 
            : 'bg-white/90 border-slate-200 text-indigo-600 hover:bg-slate-50 hover:w-8 hover:left-[-32px]'}
        `}
        title={isOpen ? "Close Watchlist" : "Open Watchlist"}
      >
        <div className="flex flex-col items-center gap-1">
          {isOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          <div className={`w-[2px] h-6 rounded-full opacity-40 group-hover:h-8 transition-all
            ${isDark ? 'bg-blue-500' : 'bg-indigo-500'}
          `} />
        </div>
      </button>

      {isOpen && (
        <>
          {/* Header & Selector */}
          <div className={`p-4 border-b space-y-3 ${isDark ? 'border-white/10' : 'border-slate-100 bg-slate-50/50'}`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Watchlist
              </h2>
              <button 
                onClick={() => setShowAddList(!showAddList)}
                className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200/50'}`}
                title="Create New List"
              >
                <Plus size={14} className={isDark ? 'text-blue-400' : 'text-indigo-600'} />
              </button>
            </div>

            {showAddList && (
              <div className="flex gap-1 animate-in slide-in-from-top-2 duration-300">
                <input 
                  autoFocus
                  type="text"
                  placeholder="List Name..."
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddList()}
                  className={`flex-1 px-2 py-1.5 text-xs rounded outline-none border transition-all
                    ${isDark ? 'bg-white/5 border-white/10 focus:border-blue-500/50 text-white' : 'bg-white border-slate-200 focus:border-indigo-500 text-slate-900'}
                  `}
                />
                <button onClick={handleAddList} className={`px-2 py-1 text-[10px] font-bold rounded shadow-sm ${isDark ? 'bg-blue-600 text-white' : 'bg-indigo-600 text-white'}`}>ADD</button>
              </div>
            )}

            <div className="relative group">
              <select 
                value={activeListId}
                onChange={e => setActiveListId(e.target.value)}
                className={`w-full border px-3 py-2 rounded-lg text-xs appearance-none outline-none focus:ring-1 cursor-pointer transition-all font-semibold
                  ${isDark ? 'bg-[#111827] border-white/10 text-white focus:ring-blue-500/30' : 'bg-white border-slate-200 text-slate-700 focus:ring-indigo-500/20'}
                `}
              >
                {watchlists.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <div className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${isDark ? 'text-slate-500 group-hover:text-slate-300' : 'text-slate-400 group-hover:text-slate-600'}`}>
                <ChevronLeft size={12} className="-rotate-90" />
              </div>
            </div>
          </div>

          {/* Search bar inside drawer for custom lists */}
          {!currentList.isFixed && (
            <div className="px-4 py-2.5 relative">
              <div className={`flex items-center gap-2 border px-2.5 py-1.5 rounded-lg focus-within:ring-1 transition-all
                ${isDark ? 'bg-white/5 border-white/10 focus-within:ring-blue-500/30' : 'bg-slate-50 border-slate-200 focus-within:ring-indigo-500/20'}
              `}>
                <Search size={14} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
                <input 
                  type="text" 
                  placeholder="Analyze symbols..."
                  className={`bg-transparent border-none outline-none text-xs w-full ${isDark ? 'text-white' : 'text-slate-900'}`}
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  onFocus={() => setShowSearch(true)}
                />
                {searchQuery && (
                  <button onClick={() => {setSearchQuery(''); setSearchSymbols([]);}}>
                    <X size={12} className="text-slate-500" />
                  </button>
                )}
              </div>

              {showSearch && searchSymbols.length > 0 && (
                <div className={`absolute left-4 right-4 top-full mt-1 border rounded-lg shadow-2xl z-50 overflow-hidden divide-y
                  ${isDark ? 'bg-[#111827] border-white/10 divide-white/5' : 'bg-white border-slate-200 divide-slate-100'}
                `}>
                  {searchSymbols.map(s => (
                    <button 
                      key={s} 
                      onClick={() => addToCustomList(s)}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between
                        ${isDark ? 'text-white hover:bg-blue-600/20' : 'text-slate-700 hover:bg-slate-50'}
                      `}
                    >
                      <span className="font-medium">{s}</span>
                      <Plus size={12} className={isDark ? 'text-blue-500' : 'text-indigo-600'} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Active Watchlist List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading && (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <span className={`w-5 h-5 border-2 rounded-full animate-spin ${isDark ? 'border-slate-700 border-t-blue-500' : 'border-slate-200 border-t-indigo-500'}`} />
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">Syncing Data...</span>
              </div>
            )}

            {!loading && currentList.symbols.length === 0 && (
              <div className="px-8 py-20 text-center">
                <ListFilter size={24} className={`mx-auto mb-3 opacity-20 ${isDark ? 'text-white' : 'text-slate-900'}`} />
                <p className="text-[11px] font-medium text-slate-500">Waitlist is empty.</p>
                {!currentList.isFixed && <p className="text-[9px] text-slate-400 mt-1">Search above to add companies.</p>}
              </div>
            )}

            {!loading && currentList.symbols.map((s, idx) => {
              const isSelected = currentSymbol === s.symbol;
              const positive = (s.changePercent ?? 0) >= 0;
              return (
                <div 
                  key={s.symbol + idx}
                  onClick={() => onSelectSymbol(s.symbol)}
                  className={`px-4 py-3 border-b group flex items-center justify-between cursor-pointer transition-all
                    ${isDark ? 'border-white/[0.04] hover:bg-white/[0.03]' : 'border-slate-100 hover:bg-slate-50/80'}
                    ${isSelected ? (isDark ? 'bg-blue-600/10' : 'bg-indigo-600/5') : ''}`}
                >
                  <div className="flex flex-col gap-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-bold truncate transition-colors
                        ${isSelected ? (isDark ? 'text-blue-400' : 'text-indigo-600') : (isDark ? 'text-slate-200' : 'text-slate-800')}
                      `}>
                        {s.symbol}
                      </span>
                      {s.type === 'gainer' && <TrendingUp size={12} className="text-emerald-500 flex-shrink-0" />}
                      {s.type === 'loser' && <TrendingDown size={12} className="text-red-500 flex-shrink-0" />}
                      {s.type === 'volume' && <Volume2 size={12} className="text-amber-500 flex-shrink-0" />}
                    </div>
                    <div className={`text-[9px] font-mono uppercase tracking-tight ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {s.type === 'gainer' ? 'Gainer' : s.type === 'loser' ? 'Loser' : s.type === 'volume' ? 'Shocking Volume' : 'Equity'}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-0.5">
                    {s.lastPrice != null && (
                      <div className={`text-xs font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {s.lastPrice.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </div>
                    )}
                    {s.changePercent != null && (
                      <div className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        positive 
                          ? (isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700') 
                          : (isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-100 text-red-700')
                      }`}>
                        {positive ? '+' : ''}{s.changePercent.toFixed(2)}%
                      </div>
                    )}
                    
                    {/* Delete button for custom lists */}
                    {!currentList.isFixed && (
                      <button 
                        onClick={(e) => removeFromCustomList(s.symbol, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 text-slate-400 transition-all transform hover:scale-110"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer stats */}
          <div className={`p-3 border-t flex items-center justify-between text-[10px] font-semibold tracking-tight
            ${isDark ? 'bg-white/[0.01] border-white/10 text-slate-600' : 'bg-slate-50 border-slate-100 text-slate-500'}
          `}>
            <span>{currentList.symbols.length} Assets</span>
            {!currentList.isFixed && (
              <button 
                onClick={(e) => handleDeleteList(currentList.id, e)} 
                className={`transition-colors uppercase font-bold ${isDark ? 'text-red-900/40 hover:text-red-500' : 'text-red-400 hover:text-red-600'}`}
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
