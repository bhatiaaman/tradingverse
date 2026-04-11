'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Nav from '../../components/Nav'
import Link from 'next/link'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCr(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  return abs.toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' Cr'
}

function fmtSign(n) {
  if (n == null || isNaN(n)) return '—'
  const s = fmtCr(Math.abs(n))
  return n >= 0 ? `+${s}` : `-${s}`
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

// ─── Today's Snapshot Cards ───────────────────────────────────────────────────

function SnapshotCard({ label, data, color }) {
  const isPos = data?.net >= 0
  const netColor = isPos
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400'

  return (
    <div className="flex-1 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded-full border ${color}`}>
          {label}
        </span>
      </div>
      {data ? (
        <>
          <p className={`text-2xl font-black mb-1 ${netColor}`}>
            {fmtSign(data.net)}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-1">Net flow today</p>
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-0.5">Buy</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{fmtCr(data.buy)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-0.5">Sell</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{fmtCr(data.sell)}</p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-400 dark:text-slate-600">No data</p>
      )}
    </div>
  )
}

// ─── Flow Bar ─────────────────────────────────────────────────────────────────

function FlowBar({ net, maxAbs }) {
  if (!maxAbs) return null
  const pct = Math.min(100, (Math.abs(net) / maxAbs) * 100)
  const isPos = net >= 0
  return (
    <div className="w-16 h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex-shrink-0">
      <div
        className={`h-full rounded-full ${isPos ? 'bg-emerald-500' : 'bg-rose-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FiiDiiPage() {
  const [data, setData]   = useState(null)
  const [loading, setLoad] = useState(true)
  const [error, setError] = useState('')
  const loaded = useRef(false)

  const load = useCallback(async (refresh = false) => {
    setLoad(true); setError('')
    try {
      const url = `/api/investing/fii-dii${refresh ? '?refresh=1' : ''}`
      const res = await fetch(url, { cache: 'no-store' })
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

  const rows    = data?.data || []
  const today   = rows[0] || null
  const maxAbsFii = rows.length ? Math.max(...rows.map(r => Math.abs(r.fii?.net || 0))) : 0
  const maxAbsDii = rows.length ? Math.max(...rows.map(r => Math.abs(r.dii?.net || 0))) : 0

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
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 rounded-full">
                NSE Data
              </span>
              {data?.stale && (
                <span className="text-[9px] font-medium text-amber-500">showing prev day — updates 9 PM IST</span>
              )}
            </div>
            <h1 className="text-3xl font-black mb-2">FII / DII Activity</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-6">
              Foreign and domestic institutional flow — 30-day trend
            </p>
          </div>
          <div className="flex-shrink-0 pt-1">
            <RefreshBtn loading={loading} onClick={() => load(true)} />
          </div>
        </div>

        {/* NSE Blocked warning */}
        {data?.nseBlocked && !loading && (
          <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-amber-800 dark:text-amber-300 font-semibold text-sm mb-1">NSE session unavailable</p>
                <p className="text-amber-700 dark:text-amber-400 text-xs leading-5">
                  Could not connect to NSE. Try refreshing or check directly on NSE.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="mb-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-5 text-center">
            <p className="text-rose-600 dark:text-rose-400 text-sm font-semibold mb-1">Failed to load</p>
            <p className="text-rose-500 text-xs mb-3">{error}</p>
            <button onClick={() => load(true)} className="text-xs font-semibold text-rose-600 dark:text-rose-400 underline">Retry</button>
          </div>
        )}

        {/* Today's Snapshot */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
            Today's Snapshot
          </h2>
          {loading ? (
            <div className="flex gap-4">
              <div className="flex-1 h-32 animate-pulse bg-slate-200 dark:bg-white/5 rounded-2xl" />
              <div className="flex-1 h-32 animate-pulse bg-slate-200 dark:bg-white/5 rounded-2xl" />
            </div>
          ) : (
            <div className="flex gap-4">
              <SnapshotCard
                label="FII / FPI"
                data={today?.fii}
                color="text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30 border-sky-200 dark:border-sky-800/50"
              />
              <SnapshotCard
                label="DII"
                data={today?.dii}
                color="text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800/50"
              />
            </div>
          )}
        </div>

        {/* 30-Day Table */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
            30-Day Trend
          </h2>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse bg-slate-200 dark:bg-white/5 rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
              No data available. Try refreshing after market opens.
            </div>
          ) : (
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[140px_1fr_1fr_1fr_1fr_1fr_1fr_80px] gap-0 px-4 py-3 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">Date</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-right">FII Buy</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-right">FII Sell</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-right">FII Net</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-right">DII Buy</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-right">DII Sell</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-right">DII Net</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-center">Flow</span>
              </div>

              {/* Rows */}
              {rows.map((row, i) => {
                const fiiPos = row.fii?.net >= 0
                const diiPos = row.dii?.net >= 0
                return (
                  <div
                    key={row.date}
                    className={`grid grid-cols-[140px_1fr_1fr_1fr_1fr_1fr_1fr_80px] gap-0 px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-b-0 items-center
                      ${i % 2 === 0
                        ? 'bg-white dark:bg-transparent'
                        : 'bg-slate-50/60 dark:bg-white/[0.015]'
                      }`}
                  >
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{row.date}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400 text-right font-mono">{fmtCr(row.fii?.buy)}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400 text-right font-mono">{fmtCr(row.fii?.sell)}</span>
                    <span className={`text-xs font-bold text-right font-mono ${fiiPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {fmtSign(row.fii?.net)}
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-400 text-right font-mono">{fmtCr(row.dii?.buy)}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400 text-right font-mono">{fmtCr(row.dii?.sell)}</span>
                    <span className={`text-xs font-bold text-right font-mono ${diiPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {fmtSign(row.dii?.net)}
                    </span>
                    <div className="flex items-center justify-center">
                      <FlowBar net={row.fii?.net || 0} maxAbs={maxAbsFii} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-10">
          Sourced from NSE India · Values in ₹ Cr
        </p>
      </div>
    </div>
  )
}
