'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Nav from '../../components/Nav'
import Link from 'next/link'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEPS(n) {
  if (n == null || isNaN(n)) return null
  const sign = n < 0 ? '-' : ''
  return `${sign}₹${Math.abs(Number(n)).toFixed(2)}`
}

function fmtDaysAway(n) {
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  return `${n}d`
}

// ─── Days Away Pill ───────────────────────────────────────────────────────────

function DaysPill({ daysAway }) {
  let cls = 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.05] border-slate-200 dark:border-white/10'
  if (daysAway === 0) cls = 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 border-rose-300 dark:border-rose-700/50 font-black'
  else if (daysAway === 1) cls = 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/50'
  else if (daysAway <= 3) cls = 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700/50'
  return (
    <span className={`inline-flex items-center justify-center min-w-[56px] text-[11px] font-bold px-2 py-0.5 rounded-lg border ${cls}`}>
      {fmtDaysAway(daysAway)}
    </span>
  )
}

// ─── EPS delta indicator ──────────────────────────────────────────────────────
// Shows ▲ Beat, ▼ Miss, ~ Flat when we have both estimate and last

function EPSDelta({ last, estimate }) {
  if (last == null || estimate == null || isNaN(last) || isNaN(estimate)) return null
  const diff    = estimate - last
  const pct     = last !== 0 ? (diff / Math.abs(last)) * 100 : 0
  if (Math.abs(pct) < 2) {
    return <span className="text-[10px] text-slate-400 dark:text-slate-600 font-semibold">~ flat</span>
  }
  if (diff > 0) {
    return <span className="text-[10px] text-emerald-500 font-bold">▲ {pct.toFixed(0)}%</span>
  }
  return <span className="text-[10px] text-rose-500 font-bold">▼ {Math.abs(pct).toFixed(0)}%</span>
}

// ─── P/E Badge ────────────────────────────────────────────────────────────────

function PEBadge({ pe }) {
  if (pe == null || isNaN(pe)) return <span className="text-xs text-slate-300 dark:text-slate-700">—</span>
  const n = parseFloat(Number(pe).toFixed(1))
  let color = 'text-slate-700 dark:text-slate-300'
  if (n < 15) color = 'text-emerald-600 dark:text-emerald-400'
  else if (n > 40) color = 'text-rose-600 dark:text-rose-400'
  else if (n > 25) color = 'text-amber-600 dark:text-amber-400'
  return <span className={`text-sm font-bold font-mono ${color}`}>{n}x</span>
}

// ─── Result Row ───────────────────────────────────────────────────────────────

function ResultRow({ ev, isLast }) {
  const lastFormatted = fmtEPS(ev.lastEPS)
  const estFormatted  = fmtEPS(ev.epsEstimate)
  const estPos        = ev.epsEstimate !== null && ev.epsEstimate >= 0
  const lastPos       = ev.lastEPS !== null && ev.lastEPS >= 0

  const rowHighlight = ev.daysAway === 0
    ? 'bg-rose-50/40 dark:bg-rose-950/20'
    : ev.daysAway === 1
    ? 'bg-amber-50/30 dark:bg-amber-950/10'
    : ''

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-[minmax(180px,2fr)_90px_70px_100px_110px_70px] gap-2 lg:gap-3 px-5 py-3.5 items-center
      hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors ${rowHighlight}
      ${!isLast ? 'border-b border-slate-100 dark:border-white/[0.04]' : ''}`}
    >
      {/* Company */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-black text-slate-500 dark:text-slate-400">
            {(ev.symbol || '').slice(0, 2)}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">{ev.company || ev.symbol}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">{ev.symbol}</p>
        </div>
      </div>

      {/* Quarter */}
      <div>
        <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${
          ev.type === 'Annual'
            ? 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800/50'
            : 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30 border-sky-200 dark:border-sky-800/50'
        }`}>
          {ev.quarter}
        </span>
      </div>

      {/* Trailing P/E */}
      <div className="flex flex-col">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600 mb-0.5 lg:hidden">P/E</span>
        <PEBadge pe={ev.trailingPE} />
        {ev.forwardPE != null && (
          <p className="text-[9px] text-slate-400 dark:text-slate-600 mt-0.5">Fwd {Number(ev.forwardPE).toFixed(1)}x</p>
        )}
      </div>

      {/* Last EPS (actual) */}
      <div className="flex flex-col">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600 mb-0.5 lg:hidden">Last EPS</span>
        {lastFormatted ? (
          <div>
            <span className={`text-sm font-bold font-mono ${lastPos ? 'text-slate-800 dark:text-slate-200' : 'text-rose-600 dark:text-rose-400'}`}>
              {lastFormatted}
            </span>
            {ev.lastPeriod && (
              <p className="text-[9px] text-slate-400 dark:text-slate-600 mt-0.5">{ev.lastPeriod}</p>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-300 dark:text-slate-700">—</span>
        )}
      </div>

      {/* EPS Estimate */}
      <div className="flex flex-col">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600 mb-0.5 lg:hidden">Estimate</span>
        {estFormatted ? (
          <div className="space-y-0.5">
            <span className={`text-sm font-bold font-mono ${estPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {estFormatted}
            </span>
            <div>
              <EPSDelta last={ev.lastEPS} estimate={ev.epsEstimate} />
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-300 dark:text-slate-700">—</span>
        )}
      </div>

      {/* Days Away */}
      <div className="flex lg:justify-end">
        <DaysPill daysAway={ev.daysAway} />
      </div>
    </div>
  )
}

// ─── Date Group ───────────────────────────────────────────────────────────────

function DateGroup({ label, dateIso, events, search }) {
  const filtered = search
    ? events.filter(e =>
        e.symbol.toLowerCase().includes(search.toLowerCase()) ||
        e.company.toLowerCase().includes(search.toLowerCase())
      )
    : events

  if (filtered.length === 0) return null

  const isToday    = events[0]?.daysAway === 0
  const isTomorrow = events[0]?.daysAway === 1

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2 px-1">
        <span className={`text-xs font-bold uppercase tracking-widest ${
          isToday    ? 'text-rose-500 dark:text-rose-400' :
          isTomorrow ? 'text-amber-500 dark:text-amber-400' :
                       'text-slate-400 dark:text-slate-500'
        }`}>{label}</span>
        <span className="text-xs text-slate-300 dark:text-slate-700">{filtered.length} co.</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.06]" />
      </div>

      <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
        {/* Table header — desktop only */}
        <div className="hidden lg:grid grid-cols-[minmax(180px,2fr)_90px_70px_100px_110px_70px] gap-3 px-5 py-2.5 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/10">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">Company</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">Quarter</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">P/E</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">Last EPS</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 dark:text-emerald-500">Estimate ↑</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-right">When</span>
        </div>

        {filtered.map((ev, i) => (
          <ResultRow key={`${ev.symbol}-${ev.dateIso}-${i}`} ev={ev} isLast={i === filtered.length - 1} />
        ))}
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, sub }) {
  return (
    <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl px-5 py-4">
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { key: 'week',  label: 'This Week', days: 7  },
  { key: '2week', label: '2 Weeks',   days: 14 },
  { key: 'month', label: 'Month',     days: 30 },
  { key: 'all',   label: '45 Days',   days: 45 },
]

export default function EarningsCalendarPage() {
  const [data,    setData]   = useState(null)
  const [loading, setLoad]   = useState(true)
  const [error,   setError]  = useState('')
  const [filter,  setFilter] = useState('2week')
  const [search,  setSearch] = useState('')
  const loaded = useRef(false)

  const load = useCallback(async (refresh = false) => {
    setLoad(true); setError('')
    try {
      const url  = `/api/investing/earnings-calendar${refresh ? '?refresh=1' : ''}`
      const res  = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoad(false)
    }
  }, [])

  useEffect(() => {
    if (!loaded.current) { loaded.current = true; load() }
  }, [load])

  const maxDays  = FILTER_OPTIONS.find(f => f.key === filter)?.days ?? 14
  const filtered = (data?.events || []).filter(e => e.daysAway <= maxDays)

  // Group by date
  const groups = {}
  for (const ev of filtered) {
    const key = ev.dateIso
    if (!groups[key]) groups[key] = { label: ev.dateLabel, dateIso: ev.dateIso, events: [] }
    groups[key].events.push(ev)
  }
  const groupList = Object.values(groups).sort((a, b) => a.dateIso.localeCompare(b.dateIso))

  const allEvents  = data?.events || []
  const thisWeek   = allEvents.filter(e => e.daysAway <= 7).length
  const withEPS    = allEvents.filter(e => e.lastEPS !== null).length
  const withEst    = allEvents.filter(e => e.epsEstimate !== null).length
  const withPE     = allEvents.filter(e => e.trailingPE !== null).length

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />
      <div className="max-w-5xl mx-auto px-6 pt-12 pb-20">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-8">
          <Link href="/investing" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            ← Investing Suite
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 rounded-full">
                NSE · Yahoo Finance
              </span>
              {data?.cached && (
                <span className="text-[9px] font-medium text-slate-400 dark:text-slate-600">cached</span>
              )}
            </div>
            <h1 className="text-3xl font-black mb-2">Earnings Calendar</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-6">
              Upcoming results — last quarter EPS vs analyst estimate. Know before you buy.
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-40 mt-1"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* Error */}
        {error && !loading && (
          <div className="mb-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-5 text-center">
            <p className="text-rose-600 dark:text-rose-400 text-sm font-semibold mb-1">Failed to load</p>
            <p className="text-rose-500 text-xs mb-3">{error}</p>
            <button onClick={() => load(true)} className="text-xs font-semibold text-rose-600 dark:text-rose-400 underline">Retry</button>
          </div>
        )}

        {/* Stats */}
        {!loading && data && allEvents.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <StatCard label="This week"       value={thisWeek} color="text-amber-600 dark:text-amber-400" />
            <StatCard label="With P/E ratio"  value={withPE}   color="text-slate-700 dark:text-slate-300" sub="trailing P/E" />
            <StatCard label="With last EPS"   value={withEPS}  color="text-slate-700 dark:text-slate-300" sub="prior quarter" />
            <StatCard label="With estimate"   value={withEst}  color="text-emerald-600 dark:text-emerald-400" sub="analyst consensus" />
          </div>
        )}

        {/* Legend */}
        {!loading && data && allEvents.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-5 text-[11px] text-slate-500 dark:text-slate-400">
            <span><span className="text-emerald-500 font-bold">Green P/E</span> &lt;15 · <span className="text-amber-500 font-bold">Amber</span> &gt;25 · <span className="text-rose-500 font-bold">Red</span> &gt;40</span>
            <span><strong className="text-slate-700 dark:text-slate-300">Last EPS</strong> — prior quarter actual (Yahoo Finance)</span>
            <span><strong className="text-emerald-600 dark:text-emerald-400">Estimate</strong> — analyst consensus for upcoming quarter</span>
            <span><strong>▲ / ▼</strong> — how estimate compares to last EPS</span>
          </div>
        )}

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl p-1">
            {FILTER_OPTIONS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  filter === f.key
                    ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search company or symbol…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-violet-400 dark:focus:border-violet-500/60 transition-colors"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse bg-slate-200 dark:bg-white/[0.04] rounded-2xl" />
            ))}
          </div>
        ) : groupList.length > 0 ? (
          groupList.map(group => (
            <DateGroup
              key={group.dateIso}
              label={group.label}
              dateIso={group.dateIso}
              events={group.events}
              search={search}
            />
          ))
        ) : (
          <div className="text-center py-16 text-slate-500 dark:text-slate-400 text-sm space-y-1.5">
            <svg className="w-8 h-8 mx-auto mb-3 text-slate-300 dark:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="font-semibold">No results scheduled in this window</p>
            <p className="text-xs text-slate-400 dark:text-slate-600">Try expanding to "45 Days" or check back later</p>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-10">
          Dates sourced from NSE India · EPS data from Yahoo Finance
        </p>
      </div>
    </div>
  )
}
