'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Save, Tag, TrendingUp, TrendingDown, BookOpen } from 'lucide-react';

const PREDEFINED_TAGS = ['A+ Setup', 'B Setup', 'FOMO', 'Overtrading', 'Followed Plan', 'Revenge Trade', 'Early Exit', 'Late Entry', 'Missed Target'];

function getIstNow() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (330 * 60000));
}

function formatDateToYMD(dateObj) {
  return dateObj.toISOString().split('T')[0];
}

export default function JournalPage() {
  const [currentDate, setCurrentDate] = useState(formatDateToYMD(getIstNow()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Data State
  const [journal, setJournal] = useState({ pnl: 0, market_context: '', emotional_state: '', analysis: {} });
  const [tradeComments, setTradeComments] = useState({}); // mapped by symbol
  const [groupedSymbols, setGroupedSymbols] = useState([]);
  
  const [isToday, setIsToday] = useState(true);
  const [livePnl, setLivePnl] = useState(0);

  // Load Data
  const loadJournal = useCallback(async (dateStr) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/journal?date=${dateStr}`);
      const data = await res.json();
      if (data.success) {
        setJournal({
          pnl: data.data.journal.pnl || 0,
          market_context: data.data.journal.market_context || '',
          emotional_state: data.data.journal.emotional_state || '',
          analysis: data.data.journal.analysis || { preMarket: '', postMarket: '' }
        });
        
        setIsToday(data.data.isToday);
        setLivePnl(data.data.livePnl || 0);

        // 1. Process comments array into map by symbol, AGGREGating charges
        const commentsMap = {};
        (data.data.comments || []).forEach(c => {
          if (!commentsMap[c.symbol]) {
            commentsMap[c.symbol] = {
              symbol: c.symbol,
              comment: c.comment || '',
              tags: c.tags || [],
              brokerage: 0,
              other_charges: 0
            };
          }
          // Sum up charges if from multiple trades (order_ids)
          commentsMap[c.symbol].brokerage += parseFloat(c.brokerage || 0);
          commentsMap[c.symbol].other_charges += parseFloat(c.other_charges || 0);
          
          // Use the non-empty comment/tags if available
          if (c.comment) commentsMap[c.symbol].comment = c.comment;
          if (c.tags?.length) commentsMap[c.symbol].tags = c.tags;
        });
        setTradeComments(commentsMap);

        // 2. Process Kite positions & trades
        const posDay = data.data.kitePositions?.day || [];
        const rawTrades = data.data.kiteTrades || [];
        
        const symMap = {};
        // Use positions for accurate P&L
        posDay.forEach(p => {
          symMap[p.tradingsymbol] = {
            symbol: p.tradingsymbol,
            pnl: parseFloat(p.pnl || 0),
            qty: p.quantity,
            buy_value: p.buy_value,
            sell_value: p.sell_value,
            trades: []
          };
        });

        // Attach trades to symbols
        rawTrades.forEach(t => {
          if (!symMap[t.tradingsymbol]) {
            symMap[t.tradingsymbol] = {
              symbol: t.tradingsymbol, pnl: 0, qty: 0, trades: []
            };
          }
          symMap[t.tradingsymbol].trades.push(t);
        });

        const groups = Object.values(symMap).sort((a,b) => b.pnl - a.pnl);
        setGroupedSymbols(groups);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJournal(currentDate);
  }, [currentDate, loadJournal]);

  // Debounced Auto-save
  useEffect(() => {
    if (loading) return;
    
    // Autosave roughly 2 seconds after the last keystroke stops
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const commentsArr = Object.values(tradeComments).map(c => ({
          symbol: c.symbol, tags: c.tags || [], comment: c.comment || ''
        }));
        
        await fetch('/api/journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: currentDate,
            pnl: isToday ? livePnl : journal.pnl,
            market_context: journal.market_context,
            emotional_state: journal.emotional_state,
            analysis: journal.analysis,
            trade_comments: commentsArr
          })
        });
      } catch (err) {
        console.error('Autosave err', err);
      } finally {
        setSaving(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [journal, tradeComments, currentDate, isToday, livePnl, loading]);

  const changeDate = (days) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + days);
    // Don't cross into future beyond IST today
    const istToday = formatDateToYMD(getIstNow());
    const newYmd = formatDateToYMD(d);
    if (newYmd > istToday) return;
    setCurrentDate(newYmd);
  };

  const handleAnalysisChange = (key, val) => {
    setJournal(prev => ({ ...prev, analysis: { ...prev.analysis, [key]: val }}));
  };

  const handleCommentChange = (symbol, val) => {
    setTradeComments(prev => ({
      ...prev,
      [symbol]: { ...prev[symbol], symbol, comment: val, tags: prev[symbol]?.tags || [] }
    }));
  };

  const handleTagToggle = (symbol, tag) => {
    setTradeComments(prev => {
      const current = prev[symbol] || { symbol, comment: '', tags: [] };
      const tags = new Set(current.tags);
      if (tags.has(tag)) tags.delete(tag);
      else tags.add(tag);
      return { ...prev, [symbol]: { ...current, tags: Array.from(tags) } };
    });
  };

  const fetchCharges = async () => {
    setSaving(true);
    try {
      // Gather all trades from all grouped symbols
      const allTrades = groupedSymbols.flatMap(g => g.trades);
      if (!allTrades.length) return;

      const res = await fetch('/api/journal/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: currentDate, trades: allTrades })
      });
      const data = await res.json();
      if (data.success) {
        // Reload journal to get updated database values
        loadJournal(currentDate);
      }
    } catch (err) {
      console.error('Fetch charges error', err);
    } finally {
      setSaving(false);
    }
  };

  const grossPnl = isToday ? livePnl : journal.pnl;
  const totalCharges = Object.values(tradeComments).reduce((acc, c) => acc + (parseFloat(c.brokerage || 0) + parseFloat(c.other_charges || 0)), 0);
  const realNetPnl = grossPnl - totalCharges;

  return (
    <div className="min-h-screen bg-[#060c14] text-slate-300 font-sans p-6 pb-20">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link href="/trades" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            {saving ? <span className="flex items-center gap-1.5 text-xs text-blue-400 font-medium"><Loader2 size={12} className="animate-spin" /> Auto-saving...</span>
                    : <span className="flex items-center gap-1.5 text-xs text-slate-500 font-medium"><Save size={12} /> Saved</span>}
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-[#0a1424] border border-blue-900/30 p-6 rounded-2xl mb-8">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400 hidden sm:flex">
                <BookOpen size={24} />
             </div>
             <div>
                <h1 className="text-2xl font-bold text-white mb-1">Trading Journal</h1>
                <div className="flex items-center gap-3">
                  <button onClick={() => changeDate(-1)} className="p-1 rounded hover:bg-white/10 transition-colors">
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-sm font-medium w-28 text-center tabular-nums">{currentDate}</span>
                  <button onClick={() => changeDate(1)} disabled={currentDate === formatDateToYMD(getIstNow())} className="p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronRight size={18} />
                  </button>
                </div>
             </div>
          </div>

          <div className="flex bg-[#060c14] p-3 rounded-xl border border-slate-800">
             <div className="px-6 py-2 border-r border-slate-800">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Gross P&L</p>
                <p className={`text-lg font-bold font-mono ${grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                   {grossPnl >= 0 ? '+' : ''}₹{parseFloat(grossPnl).toLocaleString('en-IN', {minimumFractionDigits: 2})}
                </p>
             </div>
             <div className="px-6 py-2 border-r border-slate-800 relative group">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Total Charges</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold font-mono text-slate-400">
                    ₹{totalCharges.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                  </p>
                  <button 
                    onClick={fetchCharges}
                    disabled={saving}
                    className="p-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors"
                    title="Fetch charges from Kite"
                  >
                    <TrendingUp size={12} className="rotate-90" />
                  </button>
                </div>
             </div>
             <div className="px-6 py-2">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Real Net P&L</p>
                <p className={`text-xl font-bold font-mono ${realNetPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                   {realNetPnl >= 0 ? '+' : ''}₹{parseFloat(realNetPnl).toLocaleString('en-IN', {minimumFractionDigits: 2})}
                </p>
             </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-20 text-blue-500/50"><Loader2 size={32} className="animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
             {/* Left Column - Journal Elements */}
             <div className="lg:col-span-5 space-y-6">
                <div className="bg-[#0a1424] border border-blue-900/30 rounded-xl p-5 shadow-lg shadow-black/20">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">Emotional Check-in</h2>
                  <select 
                    value={journal.emotional_state}
                    onChange={(e) => setJournal({...journal, emotional_state: e.target.value})}
                    className="w-full bg-[#060c14] border border-slate-800 rounded-lg p-3 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  >
                     <option value="">Select current state...</option>
                     <option value="Calm & Focused">Calm & Focused 🧘‍♂️</option>
                     <option value="Tired / Low Energy">Tired / Low Energy 🔋</option>
                     <option value="Overconfident">Overconfident 🚀</option>
                     <option value="Anxious / Tilt">Anxious / Tilt ⚠️</option>
                     <option value="FOMO">Experiencing FOMO 👀</option>
                  </select>
                </div>

                <div className="bg-[#0a1424] border border-blue-900/30 rounded-xl p-5 shadow-lg shadow-black/20 flex flex-col items-center">
                  <h2 className="text-sm font-bold text-emerald-500/80 uppercase tracking-wider mb-4 border-b border-white/5 pb-2 w-full">☀️ Pre-Market Plan</h2>
                  <textarea 
                    value={journal.analysis.preMarket || ''}
                    onChange={(e) => handleAnalysisChange('preMarket', e.target.value)}
                    placeholder="What are your key levels, hypotheses, and goals for today before the bell rings?"
                    className="w-full bg-[#060c14] border border-slate-800 rounded-lg p-4 text-sm text-slate-300 min-h-[140px] focus:border-emerald-500/50 outline-none resize-y placeholder:text-slate-600 transition-colors"
                  />
                </div>

                <div className="bg-[#0a1424] border border-blue-900/30 rounded-xl p-5 shadow-lg shadow-black/20 flex flex-col items-center">
                  <h2 className="text-sm font-bold text-indigo-400/80 uppercase tracking-wider mb-4 border-b border-white/5 pb-2 w-full">🌙 End of Day Review</h2>
                  <textarea 
                    value={journal.analysis.postMarket || ''}
                    onChange={(e) => handleAnalysisChange('postMarket', e.target.value)}
                    placeholder="Did you follow the plan? What mistakes were made? What lessons are learned?"
                    className="w-full bg-[#060c14] border border-slate-800 rounded-lg p-4 text-sm text-slate-300 min-h-[180px] focus:border-indigo-500/50 outline-none resize-y placeholder:text-slate-600 transition-colors"
                  />
                </div>
             </div>

             {/* Right Column - Executions */}
             <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between mb-2 px-1">
                   <h2 className="text-lg font-bold text-white">Trade Executions</h2>
                   {isToday && <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">Live Sync Active</span>}
                </div>

                {groupedSymbols.length === 0 ? (
                  <div className="bg-[#0a1424] border border-slate-800 rounded-xl p-10 text-center flex flex-col items-center justify-center border-dashed">
                      <TrendingUp size={32} className="text-slate-700 mb-3" />
                      <p className="text-sm text-slate-500 font-medium">No recorded trades for this day.</p>
                      {isToday && <p className="text-[10px] text-slate-600 mt-2 max-w-xs mx-auto">Place orders in Kite. This section will automatically populate with your realized positions and executions.</p>}
                  </div>
                ) : (
                  groupedSymbols.map(group => {
                    const cmt = tradeComments[group.symbol] || { comment: '', tags: [] };
                    return (
                      <div key={group.symbol} className="bg-[#0a1424] border border-blue-900/30 rounded-xl overflow-hidden shadow-lg shadow-black/20">
                         {/* Header */}
                         <div className="bg-[#0c1a2e] p-4 flex items-center justify-between border-b border-blue-900/50">
                            <div className="flex items-center gap-4">
                               <div>
                                  <h3 className="font-bold text-white flex items-center gap-2">
                                     {group.symbol}
                                     {group.qty !== 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">Qty: {Math.abs(group.qty)} Open</span>}
                                  </h3>
                                  <p className="text-[10px] text-slate-500 mt-0.5">{group.trades?.length || 0} Executions</p>
                               </div>
                               {(cmt.brokerage > 0 || cmt.other_charges > 0) && (
                                 <div className="px-3 border-l border-slate-800">
                                   <p className="text-[9px] text-slate-500 uppercase font-bold">Charges</p>
                                   <p className="text-xs font-mono text-slate-400">₹{(parseFloat(cmt.brokerage || 0) + parseFloat(cmt.other_charges || 0)).toFixed(2)}</p>
                                 </div>
                               )}
                            </div>
                            <div className="text-right">
                               <p className={`font-bold font-mono ${group.pnl - (parseFloat(cmt.brokerage || 0) + parseFloat(cmt.other_charges || 0)) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {group.pnl - (parseFloat(cmt.brokerage || 0) + parseFloat(cmt.other_charges || 0)) >= 0 ? '+' : ''}₹{(group.pnl - (parseFloat(cmt.brokerage || 0) + parseFloat(cmt.other_charges || 0))).toLocaleString('en-IN', {minimumFractionDigits: 2})}
                               </p>
                               <p className="text-[9px] text-slate-500 uppercase font-bold mt-1">Real Net P&L</p>
                               <div className="mt-1 flex flex-col items-end">
                                  <p className="text-[9px] text-slate-500">Gross: <span className={group.pnl >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}>₹{parseFloat(group.pnl).toFixed(2)}</span></p>
                                  <div className="flex gap-2">
                                     <p className="text-[9px] text-slate-500">Brkg: <span className="text-slate-400">₹{parseFloat(cmt.brokerage || 0).toFixed(2)}</span></p>
                                     <p className="text-[9px] text-slate-500">Other: <span className="text-slate-400">₹{parseFloat(cmt.other_charges || 0).toFixed(2)}</span></p>
                                  </div>
                               </div>
                            </div>
                         </div>

                         {/* Trade breakdown & Comments layout (Side by side on larger screens within the card) */}
                         <div className="p-4 flex flex-col md:flex-row gap-6">
                            {/* Tags & Comments section */}
                            <div className="flex-1 space-y-4">
                               <textarea 
                                  value={cmt.comment}
                                  onChange={(e) => handleCommentChange(group.symbol, e.target.value)}
                                  placeholder="Why did you take this trade? How did you manage it?"
                                  className="w-full bg-[#060c14] border border-slate-800 rounded-lg p-3 text-xs text-slate-300 min-h-[90px] focus:border-blue-500 outline-none resize-y placeholder:text-slate-600 transition-colors"
                               />
                               
                               <div className="flex flex-wrap gap-2">
                                 {PREDEFINED_TAGS.map(t => {
                                    const active = cmt.tags.includes(t);
                                    return (
                                       <button 
                                          key={t}
                                          onClick={() => handleTagToggle(group.symbol, t)}
                                          className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                                            active ? 'bg-blue-600/20 text-blue-400 border-blue-500/50' 
                                                   : 'bg-[#060c14] text-slate-500 border-slate-800 hover:border-slate-600'
                                          }`}
                                       >
                                          {t}
                                       </button>
                                    );
                                 })}
                               </div>
                            </div>
                            
                            {/* Raw Executions Log */}
                            <div className="w-full md:w-[280px] flex-shrink-0 bg-[#060c14] rounded-lg border border-slate-800 p-2 max-h-[160px] overflow-y-auto scrollbar-thin">
                               {group.trades.length > 0 ? (
                                  <table className="w-full text-left border-collapse">
                                    <tbody>
                                      {group.trades.map((tr, i) => {
                                        const isBuy = tr.transaction_type === 'BUY';
                                        const time = new Date(tr.order_timestamp || tr.exchange_timestamp).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: false });
                                        return (
                                          <tr key={`${tr.trade_id}-${i}`} className="border-b border-slate-800/50 last:border-0 hover:bg-white/5 transition-colors">
                                            <td className="py-1.5 px-2 text-[10px] text-slate-500">{time}</td>
                                            <td className={`py-1.5 px-2 text-[10px] font-bold ${isBuy ? 'text-emerald-500' : 'text-red-500'}`}>
                                               {isBuy ? 'B' : 'S'}
                                            </td>
                                            <td className="py-1.5 px-2 text-[10px] text-slate-300 font-mono text-right">{tr.quantity}</td>
                                            <td className="py-1.5 px-2 text-[10px] text-slate-400 font-mono text-right">@ {tr.average_price}</td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                               ) : (
                                  <div className="text-[10px] text-slate-600 p-4 text-center">Executed previously via position logs only.</div>
                               )}
                            </div>
                         </div>
                      </div>
                    );
                  })
                )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
