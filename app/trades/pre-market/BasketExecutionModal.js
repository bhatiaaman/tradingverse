'use client';

import { useState, useMemo, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, AlertCircle, TrendingUp, TrendingDown, Target } from 'lucide-react';

const CONVICTION_SCORE = {
  'HIGH': 3,
  'VERY HIGH': 4,
  'MEDIUM-HIGH': 2,
  'MEDIUM': 1,
  'LOW': 0,
};

function getScore(c) {
  if (!c) return 0;
  return CONVICTION_SCORE[c.toUpperCase()] ?? 0;
}

export default function BasketExecutionModal({ isOpen, onClose, intradayWatchlist }) {
  const [selectedSymbols, setSelectedSymbols] = useState(new Set());
  const [executionStatuses, setExecutionStatuses] = useState({});
  const [isExecuting, setIsExecuting] = useState(false);

  // Computed array with Qty + Sorting
  const sortedAndScored = useMemo(() => {
    if (!intradayWatchlist) return [];
    
    return intradayWatchlist.map(stock => {
      const entryPrice = parseFloat(stock.entryPrice || stock.entry || 0);
      const stopLoss = parseFloat(stock.stopLoss || 0);
      let qty = 0;
      if (entryPrice > 0 && stopLoss > 0 && Math.abs(entryPrice - stopLoss) > 0) {
         qty = Math.floor(2100 / Math.abs(entryPrice - stopLoss));
      }
      
      const isShort = stock.direction === 'SHORT';
      const rawLimit = isShort ? (entryPrice * 0.999) : (entryPrice * 1.001);
      const limitPrice = (Math.round(rawLimit * 20) / 20).toFixed(2);
      
      return {
        ...stock,
        computedQty: qty,
        triggerPrice: entryPrice,
        limitPrice: Number(limitPrice)
      };
    }).sort((a, b) => getScore(b.conviction) - getScore(a.conviction));
  }, [intradayWatchlist]);

  // Sync checkboxes on open
  useEffect(() => {
    if (isOpen) {
      // By default, select all valid stocks
      const initialSet = new Set();
      sortedAndScored.forEach(s => {
        if (s.computedQty > 0) initialSet.add(s.symbol);
      });
      setSelectedSymbols(initialSet);
      setExecutionStatuses({});
      setIsExecuting(false);
    }
  }, [isOpen, sortedAndScored]);

  if (!isOpen) return null;

  const toggleSymbol = (sym) => {
    if (isExecuting) return;
    const newSet = new Set(selectedSymbols);
    if (newSet.has(sym)) newSet.delete(sym);
    else newSet.add(sym);
    setSelectedSymbols(newSet);
  };

  const handleExecute = async () => {
    if (selectedSymbols.size === 0) return;
    setIsExecuting(true);
    
    for (const stock of sortedAndScored) {
      if (!selectedSymbols.has(stock.symbol)) continue;

      setExecutionStatuses(prev => ({
        ...prev,
        [stock.symbol]: { status: 'loading' }
      }));

      try {
        const payload = {
          tradingsymbol: stock.symbol,
          exchange: 'NSE', // Typically all standard equities
          transaction_type: stock.direction === 'SHORT' ? 'SELL' : 'BUY',
          quantity: stock.computedQty,
          order_type: 'SL',
          product: 'MIS',
          trigger_price: stock.triggerPrice,
          price: stock.limitPrice,
          variety: 'regular'
        };

        const res = await fetch('/api/place-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (data.success || data.pending) {
          setExecutionStatuses(prev => ({
           ...prev,
           [stock.symbol]: { status: 'success', message: data.message || 'Queued' }
          }));
        } else {
          setExecutionStatuses(prev => ({
           ...prev,
           [stock.symbol]: { status: 'error', message: data.error || 'Failed' }
          }));
        }
      } catch (err) {
        setExecutionStatuses(prev => ({
          ...prev,
          [stock.symbol]: { status: 'error', message: err.message || 'Network error' }
        }));
      }

      // Add a slight sequential buffer to avoid hitting Kite rate limits if placing many
      await new Promise((r) => setTimeout(r, 600));
    }
    
    setIsExecuting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1628]/80 backdrop-blur-sm" onClick={!isExecuting ? onClose : undefined}>
      <div 
        className="bg-[#0d1d35] rounded-xl border border-blue-800/50 shadow-2xl w-[800px] max-w-[95%] max-h-[90vh] flex flex-col overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-blue-900/40">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                <Target size={20} />
             </div>
             <div>
               <h2 className="text-lg font-bold text-slate-100">Intraday Basket Execution</h2>
               <p className="text-xs text-slate-400">Risk constrained to ₹2,100 per setup. SL Limit MIS orders.</p>
             </div>
          </div>
          {!isExecuting && (
            <button onClick={onClose} className="p-1 hover:bg-white/5 rounded transition-colors text-slate-400 hover:text-white">
              <XCircle size={22} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
           <table className="w-full text-left border-collapse">
              <thead>
                 <tr>
                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Include</th>
                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Symbol</th>
                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Conviction</th>
                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Direction</th>
                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Entry & SL</th>
                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Qty</th>
                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                 </tr>
              </thead>
              <tbody>
                 {sortedAndScored.map((stock) => {
                   const isSelected = selectedSymbols.has(stock.symbol);
                   const isShort = stock.direction === 'SHORT';
                   const statusInfo = executionStatuses[stock.symbol];
                   const qtyError = stock.computedQty <= 0;

                   return (
                     <tr key={stock.symbol} className={`border-t border-white/5 transition-colors ${qtyError ? 'opacity-50' : 'hover:bg-white/5'}`}>
                        <td className="p-3">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            disabled={isExecuting || qtyError}
                            onChange={() => toggleSymbol(stock.symbol)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-800 focus:ring-blue-500 focus:ring-offset-slate-900" 
                          />
                        </td>
                        <td className="p-3 text-sm font-bold text-white">
                          {stock.symbol}
                          {qtyError && <div className="text-[9px] font-normal text-red-500">Invalid inputs</div>}
                        </td>
                        <td className="p-3">
                           <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-slate-800 text-slate-300">
                             {stock.conviction}
                           </span>
                        </td>
                        <td className="p-3">
                           <div className={`flex items-center gap-1.5 text-xs font-bold ${isShort ? 'text-red-400' : 'text-green-400'}`}>
                             {isShort ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                             {isShort ? 'SHORT' : 'LONG'}
                           </div>
                        </td>
                        <td className="p-3 text-xs">
                          <div className="flex flex-col gap-1">
                             <div className="font-mono text-slate-300">
                               <span className="text-slate-500">Entry: </span>{stock.triggerPrice}
                             </div>
                             <div className="font-mono text-red-400/80">
                               <span className="text-slate-500">SL: </span>{stock.stopLoss}
                             </div>
                          </div>
                        </td>
                        <td className="p-3 text-sm font-mono text-blue-300 font-bold">
                           {stock.computedQty}
                        </td>
                        <td className="p-3 min-w-[120px]">
                          {!statusInfo ? (
                             <span className="text-xs text-slate-600 font-medium">Pending</span>
                          ) : statusInfo.status === 'loading' ? (
                             <div className="flex items-center gap-2 text-xs text-blue-400 font-medium animate-pulse">
                                <Loader2 size={12} className="animate-spin" /> Placing...
                             </div>
                          ) : statusInfo.status === 'success' ? (
                             <div className="flex items-center gap-2 text-xs text-green-400 font-medium" title={statusInfo.message}>
                                <CheckCircle2 size={14} /> OK
                             </div>
                          ) : (
                             <div className="flex items-center gap-2 text-[10px] text-red-400 font-medium max-w-[150px] leading-tight" title={statusInfo.message}>
                                <AlertCircle size={14} className="flex-shrink-0" /> <span className="truncate">{statusInfo.message}</span>
                             </div>
                          )}
                        </td>
                     </tr>
                   );
                 })}
                 {sortedAndScored.length === 0 && (
                   <tr>
                     <td colSpan="7" className="text-center p-8 text-sm text-slate-500">No intraday setups found.</td>
                   </tr>
                 )}
              </tbody>
           </table>
        </div>

        <div className="p-5 border-t border-blue-900/40 bg-[#0a1628] flex items-center justify-between">
           <div className="text-sm font-medium text-slate-400">
             {selectedSymbols.size} of {sortedAndScored.length} selected
           </div>
           
           <div className="flex items-center gap-3">
             <button 
               onClick={onClose} 
               disabled={isExecuting}
               className="px-5 py-2 text-sm font-bold text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
             >
               Close
             </button>
             <button 
               onClick={handleExecute}
               disabled={isExecuting || selectedSymbols.size === 0}
               className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:shadow-none"
             >
               {isExecuting ? (
                 <><Loader2 size={16} className="animate-spin" /> Automating...</>
               ) : (
                 <>🚀 Execute Selected</>
               )}
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
