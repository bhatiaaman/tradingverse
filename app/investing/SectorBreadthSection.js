'use client'

import { useState, useEffect } from 'react'

function pctColor(v) {
  if (v >= 1.5)  return { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' }
  if (v >= 0.3)  return { bg: 'bg-green-500/10 border-green-400/20',     text: 'text-green-600 dark:text-green-400',   dot: 'bg-green-500'   }
  if (v > -0.3)  return { bg: 'bg-slate-200/60 dark:bg-white/[0.04] border-slate-300/40 dark:border-white/8', text: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400' }
  if (v > -1.5)  return { bg: 'bg-amber-500/10 border-amber-400/20',      text: 'text-amber-600 dark:text-amber-400',   dot: 'bg-amber-500'   }
  return           { bg: 'bg-rose-500/10 border-rose-400/20',             text: 'text-rose-600 dark:text-rose-400',     dot: 'bg-rose-500'    }
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)  return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function SectorBreadthSection() {
  const [sectors, setSectors] = useState([])
  const [timestamp, setTimestamp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const r = await fetch('/api/sector-performance')
      const d = await r.json()
      if (d.sectors?.length) {
        // Re-sort strongest → weakest for display
        setSectors([...d.sectors].sort((a, b) => b.value - a.value))
        setTimestamp(d.timestamp)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const bullish  = sectors.filter(s => s.value >= 0.3).length
  const bearish  = sectors.filter(s => s.value <= -0.3).length
  const neutral  = sectors.length - bullish - bearish
  const breadth  = sectors.length > 0 ? Math.round((bullish / sectors.length) * 100) : null

  const breadthLabel =
    breadth === null ? '' :
    breadth >= 75    ? 'Broad Rally'     :
    breadth >= 55    ? 'Bullish Tilt'    :
    breadth >= 45    ? 'Mixed'           :
    breadth >= 25    ? 'Bearish Tilt'    :
                       'Broad Weakness'

  const breadthColor =
    breadth === null ? 'text-slate-400' :
    breadth >= 65    ? 'text-emerald-600 dark:text-emerald-400' :
    breadth >= 45    ? 'text-amber-600 dark:text-amber-400'     :
                       'text-rose-600 dark:text-rose-400'

  if (loading) {
    return (
      <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/8 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-28 h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
          <div className="w-16 h-4 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !sectors.length) return null

  return (
    <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/8 rounded-2xl p-5 mb-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs font-bold tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400">
            Sector Breadth
          </p>
          {breadth !== null && (
            <>
              <span className={`text-xs font-bold ${breadthColor}`}>{breadthLabel}</span>
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-500">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{bullish} ↑</span>
                {neutral > 0 && <span className="text-slate-400">{neutral} —</span>}
                <span className="text-rose-600 dark:text-rose-400 font-semibold">{bearish} ↓</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {timestamp && (
            <span className="text-[10px] text-slate-400 dark:text-slate-600">{timeAgo(timestamp)}</span>
          )}
          <button onClick={load}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            title="Refresh">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Breadth bar */}
      {breadth !== null && sectors.length > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden mb-4 gap-px">
          {sectors.map(s => {
            const c = s.value >= 0.3 ? 'bg-emerald-500' : s.value <= -0.3 ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-600'
            return <div key={s.symbol} className={`flex-1 ${c}`} title={`${s.name}: ${s.value > 0 ? '+' : ''}${s.value}%`} />
          })}
        </div>
      )}

      {/* Sector tiles */}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {sectors.map(s => {
          const c = pctColor(s.value)
          return (
            <div key={s.symbol}
              className={`flex flex-col justify-between rounded-xl border px-2.5 py-2 ${c.bg}`}>
              <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 leading-tight truncate mb-1">{s.name}</p>
              <div className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
                <span className={`text-xs font-bold tabular-nums ${c.text}`}>
                  {s.value > 0 ? '+' : ''}{s.value.toFixed(2)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
