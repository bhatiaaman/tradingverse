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
  currentSymbol 
}) {
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

  // 3. Fetch Fixed Data (FnO, Movers)
  useEffect(() => {
    if (activeListId === 'fno') {
      setLoading(true);
      fetch('/api/option-meta?action=symbols')
        .then(r => r.json())
        .then(d => {
          if (d.symbols) {
            const syms = d.symbols.map(s => ({ symbol: s.name, type: 'fno' }));
            updateFixedList('fno', syms);
          }
        })
        .finally(() => setLoading(false));
    } else if (activeListId === 'movers') {
      setLoading(true);
      fetch('/api/pre-market/movers?limit=10')
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            const gainers = (d.gainers || []).map(s => ({ ...s, type: 'gainer' }));
            const losers = (d.losers || []).map(s => ({ ...s, type: 'loser' }));
            // Add Volume Shakers? Movers API has 'volRatio'. Let's sort all for that too.
            const all = [...(d.gainers || []), ...(d.losers || [])];
            const volumeShakers = all
              .filter(s => s.volRatio > 1.2)
              .sort((a,b) => b.volRatio - a.volRatio)
              .slice(0, 10)
              .map(s => ({ ...s, type: 'volume' }));

            // We combine them into one list for simplicity or we can separate. 
            // The user asked for "Movers and Shakers" as one watchlist.
            const combined = [...gainers, ...losers, ...volumeShakers];
            // Remove duplicates
            const unique = [];
            const seen = new Set();
            for (const item of combined) {
              if (!seen.has(item.symbol)) {
                unique.push(item);
                seen.add(item.symbol);
              }
            }
            updateFixedList('movers', unique);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [activeListId]);

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

  // Basic search for adding stocks (can be expanded to use a real API)
  const handleSearch = (q) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchSymbols([]); return; }
    // Fetch search from existing API or use common symbols
    fetch(`/api/option-meta?action=symbols`)
      .then(r => r.json())
      .then(d => {
        if (d.symbols) {
          const filtr = d.symbols.filter(s => s.name.includes(q.toUpperCase())).slice(0, 5);
          setSearchSymbols(filtr.map(s => s.name));
        }
      });
  };

  return (
    <div 
      className={`relative h-full bg-[#0a0e1a] border-l border-white/10 z-[100] transition-all duration-300 flex flex-col overflow-visible
        ${isOpen ? 'w-80' : 'w-0'}`}
    >
      {/* Toggle Handle (Vertical strip) - Absolute to the drawer container */}
      <button 
        onClick={onToggle}
        className="absolute left-[-22px] top-1/2 -translate-y-1/2 w-6 h-20 bg-[#0f1d33] border border-white/10 border-r-0 rounded-l-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors group z-20"
      >
        {isOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {isOpen && (
        <>
          {/* Header & Selector */}
          <div className="p-4 border-b border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Watchlist</h2>
              <button 
                onClick={() => setShowAddList(!showAddList)}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title="Create New List"
              >
                <Plus size={16} className="text-blue-400" />
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
                  className="flex-1 bg-white/5 border border-white/10 px-2 py-1 text-xs rounded outline-none focus:border-blue-500/50"
                />
                <button onClick={handleAddList} className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded">ADD</button>
              </div>
            )}

            <div className="relative group">
              <select 
                value={activeListId}
                onChange={e => setActiveListId(e.target.value)}
                className="w-full bg-[#111827] border border-white/10 px-3 py-2 rounded-lg text-sm text-white appearance-none outline-none focus:ring-1 focus:ring-blue-500/30 cursor-pointer"
              >
                {watchlists.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-slate-300">
                <ChevronLeft size={14} className="-rotate-90" />
              </div>
            </div>
          </div>

          {/* Search bar inside drawer for custom lists */}
          {!currentList.isFixed && (
            <div className="px-4 py-2 relative">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-2 py-1.5 rounded-lg focus-within:border-blue-500/30">
                <Search size={14} className="text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Add stock (e.g. RELIANCE)"
                  className="bg-transparent border-none outline-none text-xs text-white w-full"
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
                <div className="absolute left-4 right-4 top-full mt-1 bg-[#111827] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden divide-y divide-white/5">
                  {searchSymbols.map(s => (
                    <button 
                      key={s} 
                      onClick={() => addToCustomList(s)}
                      className="w-full text-left px-3 py-2 text-xs text-white hover:bg-blue-600/20 transition-colors flex items-center justify-between"
                    >
                      <span>{s}</span>
                      <Plus size={12} className="text-blue-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Active Watchlist List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pt-2">
            {loading && (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <span className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-[10px] text-slate-500 font-medium">Fetching Data...</span>
              </div>
            )}

            {!loading && currentList.symbols.length === 0 && (
              <div className="px-8 py-20 text-center">
                <ListFilter size={32} className="mx-auto text-slate-700 mb-4" />
                <p className="text-xs text-slate-500">Waitlist is empty.</p>
                {!currentList.isFixed && <p className="text-[10px] text-slate-600 mt-1">Search above to add symbols.</p>}
              </div>
            )}

            {!loading && currentList.symbols.map((s, idx) => {
              const isSelected = currentSymbol === s.symbol;
              return (
                <div 
                  key={s.symbol + idx}
                  onClick={() => onSelectSymbol(s.symbol)}
                  className={`px-4 py-3 border-b border-white/[0.04] flex items-center justify-between cursor-pointer transition-all hover:bg-white/[0.03] active:bg-white/[0.06] group
                    ${isSelected ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : ''}`}
                >
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold truncate ${isSelected ? 'text-blue-400' : 'text-slate-200'}`}>
                        {s.symbol}
                      </span>
                      {s.type === 'gainer' && <TrendingUp size={12} className="text-emerald-500 flex-shrink-0" />}
                      {s.type === 'loser' && <TrendingDown size={12} className="text-red-500 flex-shrink-0" />}
                      {s.type === 'volume' && <Volume2 size={12} className="text-amber-500 flex-shrink-0" />}
                    </div>
                    {/* Reason/Meta */}
                    <div className="text-[10px] font-mono text-slate-500 truncate lowercase">
                      {s.type === 'gainer' ? 'Top Gainer' : s.type === 'loser' ? 'Top Loser' : s.type === 'volume' ? 'Volume Shaker' : 'NSE Equity'}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {s.lastPrice != null && (
                      <div className="text-xs font-mono font-bold text-white">
                        ₹{s.lastPrice.toFixed(2)}
                      </div>
                    )}
                    {s.changePercent != null && (
                      <div className={`text-[10px] font-mono font-medium ${s.changePercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
                      </div>
                    )}
                    
                    {/* Delete button for custom lists */}
                    {!currentList.isFixed && (
                      <button 
                        onClick={(e) => removeFromCustomList(s.symbol, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-slate-600 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer stats or contextual info */}
          <div className="p-3 bg-white/[0.02] border-t border-white/10 flex items-center justify-between">
            <span className="text-[10px] text-slate-600 font-medium">{currentList.symbols.length} Symbols</span>
            {!currentList.isFixed && (
              <button onClick={(e) => handleDeleteList(currentList.id, e)} className="text-[10px] text-red-900/40 hover:text-red-500 font-bold transition-colors">
                DELETE LIST
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
