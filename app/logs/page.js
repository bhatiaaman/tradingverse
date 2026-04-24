'use client';
import { useState, useEffect, useCallback } from 'react';
import { Network, Search, RefreshCw, Layers } from 'lucide-react';
import Link from 'next/link';
import Nav from '@/app/components/Nav';

const TABS = ['Eye Setups', 'Options Signals', 'System'];

function timeIST(ts) {
  if (!ts) return '—';
  const date = typeof ts === 'number' ? new Date(ts) : (!isNaN(Number(ts)) ? new Date(Number(ts)) : new Date(ts));
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    hour12: true,
  });
}

function timeAgo(ts) {
  if (!ts) return '';
  const date = typeof ts === 'number' ? new Date(ts) : (!isNaN(Number(ts)) ? new Date(Number(ts)) : new Date(ts));
  if (isNaN(date.getTime())) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60)   return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

// ── Eye Setup Card ────────────────────────────────────────────────────────────
function EyeSetupCard({ e }) {
  const isBull = e.direction === 'bull';
  const isBear = e.direction === 'bear';
  return (
    <tr className="hover:bg-white/[0.02] transition-colors group">
      <td className="py-4 px-6">
        <div className="text-sm text-slate-300">{timeIST(e.ts)}</div>
        <div className="text-xs text-slate-500 mt-0.5" suppressHydrationWarning>{timeAgo(e.ts)}</div>
      </td>
      <td className="py-4 px-6">
        <span className="inline-flex items-center px-2 py-1 bg-white/5 text-white text-xs font-bold font-mono rounded border border-white/10">
          {e.symbol}
        </span>
        <div className="text-[10px] text-slate-500 mt-0.5">{e.interval}</div>
      </td>
      <td className="py-4 px-6 align-top">
        <div className="flex items-center gap-2 mb-2">
          {isBull && <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />}
          {isBear && <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />}
          {!isBull && !isBear && <div className="w-2 h-2 rounded-full bg-cyan-500" />}
          
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
            isBull ? 'bg-emerald-400/10 text-emerald-400 border-emerald-500/30' :
            isBear ? 'bg-rose-400/10 text-rose-400 border-rose-500/30' :
            'bg-slate-400/10 text-slate-400 border-slate-500/30'
          }`}>
            {isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL'}
          </span>
          
          <span className="text-sm font-bold text-white leading-none">
            {e.setupName}
          </span>
        </div>
        
        <div className="flex flex-wrap gap-1.5">
          {e.factors && (
            <span className="inline-flex items-center text-[9px] font-bold bg-cyan-900/40 text-cyan-400 border border-cyan-800/50 px-1.5 py-0.5 rounded">
              {e.factors} FACTORS
            </span>
          )}
          {e.allSetups?.map((s, i) => (
            <span key={i} className={`inline-flex items-center text-[9px] font-medium border px-1.5 py-0.5 rounded-full ${
              s.direction === 'bull' ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5' :
              s.direction === 'bear' ? 'text-rose-500 border-rose-500/20 bg-rose-500/5' :
              'text-slate-500 border-slate-500/20 bg-slate-500/5'
            }`}>
              {s.name}
            </span>
          ))}
        </div>
      </td>
      <td className="py-4 px-6">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex flex-col">
            <span className="text-slate-500">Candle</span>
            <span className="text-white font-mono">{e.time}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-slate-500">Score</span>
            <span className="text-white font-mono">{e.score}/10</span>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Options Signal Card ───────────────────────────────────────────────────────
function OptionsSignalCard({ e }) {
  const isBuy  = e.side === 'BUY';
  const isHigh = e.confidence === 'HIGH';
  return (
    <tr className="hover:bg-white/[0.02] transition-colors group">
      <td className="py-4 px-6">
        <div className="text-sm text-slate-300">{timeIST(e.ts)}</div>
        <div className="text-xs text-slate-500 mt-0.5" suppressHydrationWarning>{timeAgo(e.ts)}</div>
      </td>
      <td className="py-4 px-6">
        <span className="inline-flex items-center px-2 py-1 bg-white/5 text-white text-xs font-bold font-mono rounded border border-white/10">
          {e.symbol}
        </span>
        {e.strike && (
          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{e.strike} {e.optType}</div>
        )}
      </td>
      <td className="py-4 px-6">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            isBuy
              ? 'text-emerald-400 bg-emerald-900/30 border-emerald-800/50'
              : 'text-red-400 bg-red-900/30 border-red-800/50'
          }`}>
            {isBuy ? '▲ BUY' : '▼ SELL'}
          </span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400`}>
            {e.trigger?.replace(/_/g, ' ')}
          </span>
        </div>
        {e.reasons?.slice(0, 2).map((r, i) => (
          <div key={i} className="text-[10px] text-slate-500 mt-0.5 flex gap-1">
            <span className="text-slate-600">·</span>{r}
          </div>
        ))}
      </td>
      <td className="py-4 px-6">
        <div className="flex items-center gap-4 text-xs">
          {e.ltp    && <div className="flex flex-col"><span className="text-slate-500">LTP</span><span className="text-white font-mono">₹{e.ltp}</span></div>}
          {e.sl     && <div className="flex flex-col"><span className="text-slate-500">SL</span><span className="text-red-400 font-mono">₹{e.sl}</span></div>}
          {e.target && <div className="flex flex-col"><span className="text-slate-500">Target</span><span className="text-emerald-400 font-mono">₹{e.target}</span></div>}
          <span className={`text-[10px] font-bold ${isHigh ? 'text-amber-400' : 'text-slate-500'}`}>{e.confidence}</span>
        </div>
      </td>
    </tr>
  );
}

// ── System Log Row ────────────────────────────────────────────────────────────
function SystemLogRow({ log }) {
  return (
    <tr className="hover:bg-white/[0.02] transition-colors group">
      <td className="py-4 px-6">
        <div className="text-sm text-slate-300">{timeIST(log.timestamp)}</div>
        <div className="text-xs text-slate-500 mt-0.5" suppressHydrationWarning>{timeAgo(log.timestamp)}</div>
      </td>
      <td className="py-4 px-6">
        <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${
          log.category === 'error'  ? 'text-red-400 bg-red-900/20 border-red-800/40' :
          log.category === 'cron'   ? 'text-blue-400 bg-blue-900/20 border-blue-800/40' :
          'text-slate-400 bg-white/5 border-white/10'
        }`}>{log.category}</span>
      </td>
      <td className="py-4 px-6 text-sm text-slate-300">{log.message}</td>
      <td className="py-4 px-6">
        {log.data && Object.keys(log.data).length > 0 && (
          <span className="text-[10px] text-slate-600 font-mono">{JSON.stringify(log.data).slice(0, 80)}</span>
        )}
      </td>
    </tr>
  );
}

export default function LogsPage() {
  const [tab, setTab]         = useState('Eye Setups');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [lastFetch, setLastFetch] = useState(null);

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let url;
      if (tab === 'Eye Setups')       url = '/api/admin/signal-logs?type=THIRD_EYE&n=100';
      else if (tab === 'Options Signals') url = '/api/admin/signal-logs?type=OPT_SIGNAL&n=100';
      else                            url = '/api/logs?category=system';

      const res  = await fetch(url);
      const data = await res.json();
      if (tab === 'System') {
        setEntries(data.logs || []);
      } else {
        setEntries(data.entries || []);
      }
      setLastFetch(new Date());
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    setEntries([]);
    fetchLogs(false);
    const id = setInterval(() => fetchLogs(true), 30_000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  const filtered = entries.filter(e => {
    if (!search) return true;
    const s = search.toLowerCase();
    const sym     = (e.symbol || e.data?.symbol || '').toLowerCase();
    const name    = (e.setupName || e.trigger || e.message || '').toLowerCase();
    return sym.includes(s) || name.includes(s);
  });

  const colHeaders = tab === 'System'
    ? ['Time', 'Category', 'Message', 'Data']
    : ['Time', 'Symbol', 'Setup / Signal', 'Details'];

  const emptyMsg = {
    'Eye Setups':      'No Eye setups logged yet. Strong setups (score ≥ 6) are auto-logged from the Eye page during market hours.',
    'Options Signals': 'No options signals logged yet. HIGH confidence signals are logged from the Options page during market hours.',
    'System':          'No system logs found.',
  };

  return (
    <div className="min-h-screen bg-[#0E1217] text-slate-300 font-sans selection:bg-cyan-500/30">
      <Nav />
      <div className="p-6 pb-24 lg:p-12">
        <div className="max-w-6xl mx-auto space-y-8">

          {/* Back link */}
          <div>
            <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>
              Admin
            </Link>
          </div>

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-cyan-400 mb-2">
                <Network size={18} />
                <span className="text-sm font-semibold tracking-widest uppercase">System</span>
              </div>
              <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">Activity Logs</h1>
              <p className="text-slate-500 text-sm max-w-lg mt-2">
                Persistent 7-day trailing engine logs. Eye page setups, options signals, and system events.
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
              {lastFetch && (
                <span className="text-[11px] text-slate-500">
                  {lastFetch.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </span>
              )}
              <button
                onClick={fetchLogs}
                className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Refresh logs"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-px">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  tab === t ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-[#131820] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-4">
                <RefreshCw size={24} className="animate-spin text-cyan-400/50" />
                <p className="text-sm font-medium">Fetching logs...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-4">
                <Layers size={32} className="text-slate-700" />
                <p className="text-sm font-medium">{search ? 'No logs match your search.' : emptyMsg[tab]}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-wider text-slate-500">
                      {colHeaders.map(h => (
                        <th key={h} className="py-4 px-6 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map((e, i) =>
                      tab === 'Eye Setups'       ? <EyeSetupCard     key={i} e={e} /> :
                      tab === 'Options Signals'  ? <OptionsSignalCard key={i} e={e} /> :
                                                   <SystemLogRow      key={i} log={e} />
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-600 text-center">Showing {filtered.length} entries · auto-refreshes every 30s</p>
        </div>
      </div>
    </div>
  );
}
