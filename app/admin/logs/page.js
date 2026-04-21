'use client'

import { useEffect, useState, useCallback } from 'react'
import Nav from '@/app/components/Nav'

const TABS = ['All', 'Eye Setups', 'Options Signals']

function timeIST(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function typeMap(tab) {
  if (tab === 'Eye Setups')      return 'THIRD_EYE'
  if (tab === 'Options Signals') return 'OPT_SIGNAL'
  return null
}

// ── Eye Setup Entry ───────────────────────────────────────────────────────────
function ThirdEyeEntry({ e }) {
  const dirColor = e.direction === 'bull'
    ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800/50'
    : 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800/50'

  return (
    <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800/50">
            👁 Eye
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{e.symbol}</span>
          <span className="text-xs text-slate-500">{e.interval}</span>
          <span className="text-xs font-mono text-slate-500">{e.time}</span>
          {e.setupName && (
            <span className={`text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full border ${dirColor}`}>
              {e.setupName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-violet-600 dark:text-violet-400">
            score {e.score}
          </span>
          <span className="text-[11px] text-slate-500">{timeIST(e.ts)}</span>
        </div>
      </div>
      {e.allSetups?.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {e.allSetups.slice(1).map((s, i) => (
            <span key={i} className="text-[10px] text-slate-500 border border-slate-200 dark:border-white/10 px-2 py-0.5 rounded-full">
              {s.name} ({s.score})
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Options Signal Entry ──────────────────────────────────────────────────────
function OptSignalEntry({ e }) {
  const isBuy  = e.side === 'BUY'
  const isHigh = e.confidence === 'HIGH'

  const sideClasses = isBuy
    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50'

  const confClasses = isHigh
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-slate-500'

  return (
    <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border ${sideClasses}`}>
            {isBuy ? '▲ BUY' : '▼ SELL'}
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{e.symbol}</span>
          {e.strike && (
            <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
              {e.strike} {e.optType}
            </span>
          )}
          {e.trigger && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-500">
              {e.trigger.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold ${confClasses}`}>{e.confidence}</span>
          <span className="text-[11px] text-slate-500">{timeIST(e.ts)}</span>
        </div>
      </div>

      {/* Key data row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mb-2">
        {e.ltp     && <span>LTP <span className="text-slate-700 dark:text-slate-300 font-mono font-semibold">₹{e.ltp}</span></span>}
        {e.sl      && <span>SL  <span className="text-red-600 dark:text-red-400 font-mono font-semibold">₹{e.sl}</span></span>}
        {e.target  && <span>Target <span className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">₹{e.target}</span></span>}
        {e.strategy && <span className="text-slate-400">• {e.strategy}</span>}
      </div>

      {/* Reasons */}
      {e.reasons?.length > 0 && (
        <ul className="space-y-0.5">
          {e.reasons.map((r, i) => (
            <li key={i} className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed flex gap-1.5">
              <span className="text-slate-400 shrink-0">·</span>
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AdminLogsPage() {
  const [tab, setTab]         = useState('All')
  const [entries, setEntries] = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState(null)

  const fetchLogs = useCallback(async () => {
    const type = typeMap(tab)
    const url  = `/api/admin/signal-logs?n=100${type ? `&type=${type}` : '&type=THIRD_EYE,OPT_SIGNAL'}`
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(await r.text())
      const d = await r.json()
      setEntries(d.entries || [])
      setTotal(d.total || 0)
      setLastFetch(new Date())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    setLoading(true)
    fetchLogs()
    const id = setInterval(fetchLogs, 30_000)
    return () => clearInterval(id)
  }, [fetchLogs])

  const emptyMsg = {
    'All':             'No Eye Setup or Options Signal logs yet. They will appear here during market hours.',
    'Eye Setups':      'No Eye setups logged yet. Strong setups (score ≥ 6) are auto-logged from the Eye page during market hours.',
    'Options Signals': 'No options buy/sell signals logged yet. Signals are logged from the Options page when the Trade Desk generates a recommendation.',
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />
      <div className="max-w-4xl mx-auto px-6 py-16">

        <div className="flex items-end justify-between mb-8 gap-4">
          <div>
            <p className="text-violet-600 dark:text-violet-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Admin</p>
            <h1 className="text-3xl font-black">Signal Logs</h1>
            <p className="text-slate-500 text-sm mt-1">Eye page setups + Options buy/sell recommendations</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastFetch && (
              <span className="text-[11px] text-slate-500">
                Updated {lastFetch.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
            )}
            <button
              onClick={fetchLogs}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/[0.03] rounded-xl border border-slate-200 dark:border-white/5 w-fit mb-8">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                ${tab === t ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-slate-500 text-sm py-16 text-center">Loading logs…</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-slate-500">{emptyMsg[tab]}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-4">Showing {entries.length} of {total} entries</p>
            <div className="space-y-3">
              {entries.map((e, i) => (
                e.type === 'THIRD_EYE'
                  ? <ThirdEyeEntry key={i} e={e} />
                  : <OptSignalEntry key={i} e={e} />
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
