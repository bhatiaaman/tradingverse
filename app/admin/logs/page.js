'use client'

import { useEffect, useState, useCallback } from 'react'
import Nav from '@/app/components/Nav'

const TABS = ['All', 'Short Covering', 'Third Eye']

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
  if (tab === 'Short Covering') return 'SC'
  if (tab === 'Third Eye')      return 'THIRD_EYE'
  return null
}

function SCEntry({ e }) {
  return (
    <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/50">
            SC
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{e.symbol}</span>
          <span className="text-xs text-slate-500">{e.expiry}</span>
          <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
            {e.spot ? Number(e.spot).toLocaleString('en-IN') : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold ${e.strength >= 7 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
            str {e.strength}/10
          </span>
          <span className="text-[11px] text-slate-500">{timeIST(e.ts)}</span>
        </div>
      </div>
      {e.description && (
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{e.description}</p>
      )}
      {e.actionable && (
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{e.actionable}</p>
      )}
    </div>
  )
}

function ThirdEyeEntry({ e }) {
  const dirColor = e.direction === 'bull'
    ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800/50'
    : 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800/50'

  return (
    <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800/50">
            Eye
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

export default function AdminLogsPage() {
  const [tab, setTab]         = useState('All')
  const [entries, setEntries] = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState(null)

  const fetchLogs = useCallback(async () => {
    const type = typeMap(tab)
    const url  = `/api/admin/signal-logs?n=100${type ? `&type=${type}` : ''}`
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />
      <div className="max-w-4xl mx-auto px-6 py-16">

        <div className="flex items-end justify-between mb-8 gap-4">
          <div>
            <p className="text-violet-600 dark:text-violet-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Admin</p>
            <h1 className="text-3xl font-black">Signal Logs</h1>
            <p className="text-slate-500 text-sm mt-1">Short covering + Third Eye setups, last 300 entries</p>
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
            <p className="text-slate-500">No {tab === 'All' ? '' : tab + ' '}signals logged yet.</p>
            <p className="text-slate-600 text-sm mt-2">
              {tab === 'Short Covering'
                ? 'SC logs here when price rises + OI falls (strength ≥ 4) during market hours.'
                : tab === 'Third Eye'
                ? 'Third Eye logs here whenever a strong setup (score ≥ 6) fires on a new candle.'
                : 'SC and Third Eye signals will appear here once they fire during market hours.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-4">Showing {entries.length} of {total} matching entries</p>
            <div className="space-y-3">
              {entries.map((e, i) => (
                e.type === 'SC'
                  ? <SCEntry key={i} e={e} />
                  : <ThirdEyeEntry key={i} e={e} />
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
