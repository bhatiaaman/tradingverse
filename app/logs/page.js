'use client';
import { useState, useEffect } from 'react';
import { Network, Search, AlertCircle, Clock, ShieldCheck, RefreshCw, Layers } from 'lucide-react';
import Link from 'next/link';
import Nav from '@/app/components/Nav';

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " mins ago";
  if (Math.floor(seconds) === 0) return "just now";
  return Math.floor(seconds) + " seconds ago";
}

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('setup');
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?category=${category}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [category]);

  const filteredLogs = logs.filter(log => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      log.message?.toLowerCase().includes(s) ||
      log.data?.symbol?.toLowerCase().includes(s) ||
      log.data?.setupName?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="min-h-screen bg-[#0E1217] text-slate-300 font-sans selection:bg-cyan-500/30">
      <Nav />
      <div className="p-6 pb-24 lg:p-12">
        {/* Header */}
        <div className="max-w-6xl mx-auto space-y-8">
        <div className="mb-6">
          <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>
            Admin
          </Link>
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-cyan-400 mb-2">
              <Network size={18} />
              <span className="text-sm font-semibold tracking-widest uppercase">System</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">Activity Logs</h1>
            <p className="text-slate-500 text-sm max-w-lg mt-2">
              Persistent 7-day trailing engine logs. Filter by category to view automated detections and system events.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
             <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Search logs..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 w-full md:w-64"
                />
             </div>
             <button 
                onClick={fetchLogs} 
                className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Refresh logs"
              >
               <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
             </button>
          </div>
        </div>

        {/* Categories */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-px">
          <button 
            onClick={() => setCategory('setup')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              category === 'setup' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Setup Logs
          </button>
          <button 
            onClick={() => setCategory('system')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              category === 'system' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            System
          </button>
        </div>

        {/* Content */}
        <div className="bg-[#131820] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
          {loading ? (
             <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-4">
                <RefreshCw size={24} className="animate-spin text-cyan-400/50" />
                <p className="text-sm font-medium">Fetching historical logs...</p>
             </div>
          ) : filteredLogs.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-4">
                <Layers size={32} className="text-slate-700" />
                <p className="text-sm font-medium">No logs found for this criteria.</p>
             </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-4 px-6 font-semibold w-40">Time</th>
                    <th className="py-4 px-6 font-semibold w-32">Symbol</th>
                    <th className="py-4 px-6 font-semibold">T/F</th>
                    <th className="py-4 px-6 font-semibold">Event / Setup</th>
                    <th className="py-4 px-6 font-semibold">Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredLogs.map(log => {
                    const date = new Date(log.timestamp);
                    const isBull = log.data?.direction === 'bull';
                    const isBear = log.data?.direction === 'bear';
                    
                    return (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="py-4 px-6">
                           <div className="text-sm text-slate-300">{date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                           <div className="text-xs text-slate-500 mt-0.5" suppressHydrationWarning>{timeAgo(date)}</div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center px-2 py-1 bg-white/5 text-white text-xs font-bold font-mono rounded border border-white/10">
                            {log.data?.symbol || 'SYSTEM'}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-xs font-medium text-slate-400">
                            {log.data?.timeframe || '—'}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                             {isBull && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />}
                             {isBear && <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />}
                             {!isBull && !isBear && <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                             <span className={`text-sm font-bold ${isBull ? 'text-emerald-400' : isBear ? 'text-red-400' : 'text-slate-200'}`}>
                               {log.data?.setupName || log.message}
                             </span>
                          </div>
                          {log.data?.setupId && (
                            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{log.data.setupId}</div>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {log.category === 'setup' ? (
                            <div className="flex items-center gap-4 text-xs">
                               <div className="flex flex-col">
                                 <span className="text-slate-500">Strength</span>
                                 <span className="text-white font-mono">{log.data?.strength || '—'}/10</span>
                               </div>
                               {log.data?.sl && (
                                 <div className="flex flex-col">
                                   <span className="text-slate-500">Valid Invalidation</span>
                                   <span className="text-slate-300 font-mono">₹{log.data.sl.toFixed(1)}</span>
                                 </div>
                               )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">{JSON.stringify(log.data)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
