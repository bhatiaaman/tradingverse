'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Nav from '../../components/Nav'
import Link from 'next/link'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtVol(n) {
  if (!n) return '—'
  if (n >= 1e7)  return `${(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5)  return `${(n / 1e5).toFixed(1)}L`
  return n.toLocaleString('en-IN')
}

function fmtPrice(n) {
  if (!n) return '—'
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  const s = Math.abs(n).toFixed(2)
  return n >= 0 ? `+${s}%` : `-${s}%`
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

// ─── Table Row ────────────────────────────────────────────────────────────────

function StockRow({ item, highlightHigh }) {
  const changePos = item.change >= 0
  return (
    <div className="grid grid-cols-[160px_1fr_1fr_1fr_1fr_1fr] gap-0 px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-b-0 items-center hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
      {/* Symbol */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.symbol}</span>
        {item.series && item.series !== 'EQ' && (
          <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-1 py-0.5 rounded flex-shrink-0">
            {item.series}
          </span>
        )}
      </div>

      {/* LTP */}
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 text-right font-mono">
        ₹{fmtPrice(item.ltp)}
      </span>

      {/* Change% */}
      <span className={`text-sm font-bold text-right ${changePos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {fmtPct(item.change)}
      </span>

      {/* 52W High */}
      <span className={`text-sm text-right font-mono transition-colors ${
        highlightHigh
          ? 'font-bold text-emerald-600 dark:text-emerald-400'
          : 'text-slate-600 dark:text-slate-400'
      }`}>
        ₹{fmtPrice(item.high52w)}
      </span>

      {/* 52W Low */}
      <span className={`text-sm text-right font-mono transition-colors ${
        !highlightHigh
          ? 'font-bold text-rose-600 dark:text-rose-400'
          : 'text-slate-600 dark:text-slate-400'
      }`}>
        ₹{fmtPrice(item.low52w)}
      </span>

      {/* Volume */}
      <span className="text-xs text-slate-500 dark:text-slate-400 text-right font-mono">
        {fmtVol(item.volume)}
      </span>
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

function StockTable({ items, highlightHigh, emptyMsg }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500 dark:text-slate-400 text-sm space-y-1.5">
        <svg className="w-8 h-8 mx-auto mb-3 text-slate-300 dark:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        <p className="font-semibold">{emptyMsg}</p>
        <p className="text-xs text-slate-400 dark:text-slate-600">Available Mon–Fri · 9:15 AM – 3:30 PM IST</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[160px_1fr_1fr_1fr_1fr_1fr] gap-0 px-4 py-3 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/10">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">Symbol</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-right">LTP</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-right">Chg %</span>
        <span className={`text-[10px] font-bold uppercase tracking-widest text-right ${
          highlightHigh
            ? 'text-emerald-500 dark:text-emerald-500'
            : 'text-slate-400 dark:text-slate-600'
        }`}>52W High</span>
        <span className={`text-[10px] font-bold uppercase tracking-widest text-right ${
          !highlightHigh
            ? 'text-rose-500 dark:text-rose-500'
            : 'text-slate-400 dark:text-slate-600'
        }`}>52W Low</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 text-right">Volume</span>
      </div>

      {items.map((item, i) => (
        <StockRow key={`${item.symbol}-${i}`} item={item} highlightHigh={highlightHigh} />
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Week52Page() {
  const [data, setData]     = useState(null)
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState('')
  const [tab, setTab]       = useState('highs')
  const [search, setSearch] = useState('')
  const loaded = useRef(false)

  const load = useCallback(async (refresh = false) => {
    setLoad(true); setError('')
    try {
      const url = `/api/investing/52-week-highs${refresh ? '?refresh=1' : ''}`
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

  const allHighs = data?.highs || []
  const allLows  = data?.lows  || []

  const highs = allHighs.filter(s =>
    !search || s.symbol.toLowerCase().includes(search.toLowerCase())
  )
  const lows = allLows.filter(s =>
    !search || s.symbol.toLowerCase().includes(search.toLowerCase())
  )

  const activeList = tab === 'highs' ? highs : lows

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
              {data?.cached && (
                <span className="text-[9px] font-medium text-slate-400 dark:text-slate-600">cached</span>
              )}
            </div>
            <h1 className="text-3xl font-black mb-2">52-Week Highs &amp; Lows</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-6">
              Stocks making new annual extremes today
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
                <p className="text-amber-800 dark:text-amber-300 font-semibold text-sm mb-1">NSE data temporarily unavailable</p>
                <p className="text-amber-700 dark:text-amber-400 text-xs leading-5">
                  NSE India is not responding right now. Try refreshing — it usually resolves in a few seconds.
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

        {/* Summary cards — only when we have data */}
        {!loading && data && !data.nseBlocked && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{allHighs.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">New 52W Highs</p>
              </div>
            </div>
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{allLows.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">New 52W Lows</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl p-1 mb-5">
          <button
            onClick={() => setTab('highs')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'highs'
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            52W Highs {!loading && data && `(${allHighs.length})`}
          </button>
          <button
            onClick={() => setTab('lows')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'lows'
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            52W Lows {!loading && data && `(${allLows.length})`}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by symbol…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-violet-400 dark:focus:border-violet-500/60 transition-colors"
          />
        </div>

        {/* Results count */}
        {!loading && data && !data.nseBlocked && (
          <p className="text-xs text-slate-400 dark:text-slate-600 mb-3">
            {activeList.length} stock{activeList.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
            {' · '}
            {data.date}
          </p>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-slate-200 dark:bg-white/5 rounded-lg" />
            ))}
          </div>
        ) : (
          <StockTable
            items={activeList}
            highlightHigh={tab === 'highs'}
            emptyMsg={
              tab === 'highs'
                ? 'No stocks making new 52W highs today'
                : 'No stocks making new 52W lows today'
            }
          />
        )}

        <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-10">
          Sourced from NSE India
        </p>
      </div>
    </div>
  )
}
