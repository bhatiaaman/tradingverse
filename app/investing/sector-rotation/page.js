'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Nav from '../../components/Nav'
import Link from 'next/link'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  const s = Math.abs(n).toFixed(2)
  return n >= 0 ? `+${s}%` : `-${s}%`
}

function changePillClass(n) {
  if (n > 2)  return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
  if (n > 0)  return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/10'
  if (n > -2) return 'bg-red-500/10 text-red-300 border border-red-500/10'
  return 'bg-red-500/20 text-red-400 border border-red-500/30'
}

function RefreshBtn({ loading, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-40"
    >
      <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {loading ? 'Loading…' : 'Refresh'}
    </button>
  )
}

// ─── Change Pill ──────────────────────────────────────────────────────────────

function ChangePill({ value }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-[60px] text-[11px] font-bold px-2 py-1 rounded-lg ${changePillClass(value)}`}>
      {fmtPct(value)}
    </span>
  )
}

// ─── Mini Bar ─────────────────────────────────────────────────────────────────

function MiniBar({ value, maxAbs }) {
  if (!maxAbs) return <div className="w-24 h-2" />
  const pct = Math.min(100, (Math.abs(value) / maxAbs) * 100)
  const isPos = value >= 0
  return (
    <div className="w-24 h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${isPos ? 'bg-emerald-500' : 'bg-rose-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Sort Pills ───────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { id: 'change1D', label: '1D' },
  { id: 'change1W', label: '1W' },
  { id: 'change1M', label: '1M' },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SectorRotationPage() {
  const [data, setData]     = useState(null)
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState('')
  const [sortBy, setSortBy] = useState('change1W')
  const loaded = useRef(false)

  const load = useCallback(async (refresh = false) => {
    setLoad(true); setError('')
    try {
      const url = `/api/investing/sector-rotation${refresh ? '?refresh=1' : ''}`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok && !json.sectors) throw new Error(json.error || 'Failed')
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

  const sectors = data?.sectors || []
  const sorted  = [...sectors].sort((a, b) => b[sortBy] - a[sortBy])

  const maxAbs1W = sectors.length ? Math.max(...sectors.map(s => Math.abs(s.change1W))) : 0

  const top3Set    = new Set(sorted.slice(0, 3).map(s => s.name))
  const bottom3Set = new Set(sorted.slice(-3).map(s => s.name))

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />
      <div className="max-w-4xl mx-auto px-6 pt-12 pb-20">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-8">
          <Link href="/investing" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            ← Investing Suite
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 rounded-full">
                Live Data
              </span>
              {data?.cached && (
                <span className="text-[9px] font-medium text-slate-400 dark:text-slate-600">cached</span>
              )}
            </div>
            <h1 className="text-3xl font-black mb-2">Sector Rotation</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-6">
              Multi-timeframe sector performance — 1D, 1W, 1M
            </p>
          </div>
          <div className="flex-shrink-0 pt-1">
            <RefreshBtn loading={loading} onClick={() => load(true)} />
          </div>
        </div>

        {/* Error */}
        {error && !loading && (
          <div className="mb-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-5 text-center">
            <p className="text-rose-600 dark:text-rose-400 text-sm font-semibold mb-1">Failed to load</p>
            <p className="text-rose-500 text-xs mb-3">{error}</p>
            <button onClick={() => load(true)} className="text-xs font-semibold text-rose-600 dark:text-rose-400 underline">Retry</button>
          </div>
        )}

        {/* Sort controls */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex-shrink-0">Sort by</span>
          <div className="flex items-center gap-1.5">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setSortBy(opt.id)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                  sortBy === opt.id
                    ? 'bg-violet-600 text-white border-violet-600 dark:border-violet-500'
                    : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sector table */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-slate-200 dark:bg-white/5 rounded-xl" />
            ))}
          </div>
        ) : sectors.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
            No sector data available. Please check Kite connection.
          </div>
        ) : (
          <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px_120px] gap-0 px-5 py-3 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">Sector</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-center">1D</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-center">1W</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-center">1M</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-center">1W Strength</span>
            </div>

            {sorted.map((sector, i) => {
              const isLeading = top3Set.has(sector.name)
              const isLagging = bottom3Set.has(sector.name)
              const isOdd = i % 2 !== 0
              return (
                <div
                  key={sector.name}
                  className={`grid grid-cols-[1fr_80px_80px_80px_120px] gap-0 px-5 py-3.5 border-b border-slate-100 dark:border-white/5 last:border-b-0 items-center
                    ${isOdd ? 'bg-slate-50/50 dark:bg-white/[0.015]' : 'bg-white dark:bg-transparent'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{sector.name}</span>
                    {isLeading && (
                      <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                        Leading
                      </span>
                    )}
                    {isLagging && (
                      <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 flex-shrink-0">
                        Lagging
                      </span>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <ChangePill value={sector.change1D} />
                  </div>
                  <div className="flex justify-center">
                    <ChangePill value={sector.change1W} />
                  </div>
                  <div className="flex justify-center">
                    <ChangePill value={sector.change1M} />
                  </div>
                  <div className="flex justify-center">
                    <MiniBar value={sector.change1W} maxAbs={maxAbs1W} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Timestamp */}
        {data?.timestamp && !loading && (
          <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-6">
            Last updated {new Date(data.timestamp).toLocaleTimeString('en-IN')}
          </p>
        )}

        <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-3">
          Sourced from Zerodha Kite · Indices via NSE
        </p>
      </div>
    </div>
  )
}
