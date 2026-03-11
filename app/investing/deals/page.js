'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Nav from '../../components/Nav'
import Link from 'next/link'

// ─── helpers ─────────────────────────────────────────────────────────────────

function todayLocal() {
  return new Date().toLocaleDateString('en-CA')
}

function nDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

function fmtValue(n) {
  if (!n) return '—'
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`
  return `₹${n.toLocaleString('en-IN')}`
}

function fmtQty(n) {
  if (!n) return '—'
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`
  return n.toLocaleString('en-IN')
}

function pct(n) {
  if (n == null) return '—'
  const s = Number(n).toFixed(2)
  return n >= 0 ? `+${s}%` : `${s}%`
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function RefreshBtn({ loading, onClick }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-40">
      <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {loading ? 'Loading…' : 'Refresh'}
    </button>
  )
}

// ─── Block Deal Window ────────────────────────────────────────────────────────

// Block deal window trades happen in two sessions:
//   Session 1: 8:45–9:00 AM (pre-market)
//   Session 2: 2:05–2:20 PM (afternoon)
// These are exclusively institutional trades (min lot-size restrictions apply).

function SessionBadge({ session }) {
  const isS1 = session?.includes('1')
  return (
    <span className={`inline-flex items-center text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded border ${
      isS1
        ? 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 border-violet-200 dark:border-violet-700/50'
        : 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30 border-sky-200 dark:border-sky-700/50'
    }`}>
      {isS1 ? 'Pre-Market' : 'Afternoon'}
    </span>
  )
}

function BlockWindowRow({ deal }) {
  const isUp = deal.change >= 0
  return (
    <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-slate-900 dark:text-white font-bold text-sm">{deal.symbol}</span>
            <SessionBadge session={deal.session} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {deal.time || 'Today'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">₹{Number(deal.price).toFixed(2)}</p>
          <p className={`text-xs font-semibold mt-0.5 ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {pct(deal.pchange)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-100 dark:border-white/5 flex-wrap">
        <div>
          <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest">Volume</p>
          <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{fmtQty(deal.qty)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest">Value</p>
          <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{fmtValue(deal.value)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest">Prev Close</p>
          <p className="text-xs font-mono text-slate-700 dark:text-slate-300">₹{Number(deal.prevClose).toFixed(2)}</p>
        </div>
      </div>
    </div>
  )
}

const SESSION_FILTERS = [
  { id: 'all', label: 'All Sessions' },
  { id: 'session1', label: 'Pre-Market (S1)' },
  { id: 'session2', label: 'Afternoon (S2)' },
]

function BulkDealsNotice() {
  return (
    <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/8 rounded-2xl p-5 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/8 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-1">Bulk deals with client names not available</p>
          <p className="text-slate-500 dark:text-slate-400 text-xs leading-5 mb-3">
            NSE's bulk deals API (client-wise trade data) has been removed. Only the Block Deal Window — showing which stocks traded institutionally — is accessible.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="https://www.nseindia.com/report-detail/display-bulk-and-block-deals"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 dark:bg-white/10 dark:hover:bg-white/15 text-white text-xs font-bold rounded-lg transition-colors">
              View on NSE
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <a href="https://www.moneycontrol.com/stocks/marketstats/bulk_deal/index.php"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
              Moneycontrol ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function DealsPanel() {
  const [data, setData]     = useState(null)
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const loaded = useRef(false)

  const load = useCallback(async (refresh = false) => {
    setLoad(true); setError('')
    try {
      const url = `/api/investing/deals${refresh ? '?refresh=1' : ''}`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      setData(json)
    } catch (e) { setError(e.message) }
    finally { setLoad(false) }
  }, [])

  useEffect(() => {
    if (!loaded.current) { loaded.current = true; load() }
  }, [load])

  const deals = data?.deals || []
  const filtered = deals.filter(d => {
    if (filter === 'session1' && !d.session?.includes('1')) return false
    if (filter === 'session2' && !d.session?.includes('2')) return false
    if (search) {
      const q = search.toLowerCase()
      return d.symbol?.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div>
      {/* Bulk deals notice always visible */}
      <BulkDealsNotice />

      {/* Block deal window section */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Block Deal Window</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Today's institutional block deal window stocks · NSE live data
            </p>
          </div>
          <RefreshBtn loading={loading} onClick={() => load(true)} />
        </div>
        {data && !loading && !data.nseBlocked && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {data.count} {data.count === 1 ? 'stock' : 'stocks'} traded · {data.date}
            {data.timestamp && ` · Updated ${data.timestamp}`}
          </p>
        )}
      </div>

      {/* Session filter */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl p-1 mb-4 overflow-x-auto">
        {SESSION_FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`flex-shrink-0 flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              filter === f.id ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>{f.label}</button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" placeholder="Search symbol…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-violet-400 dark:focus:border-violet-500/60 transition-colors" />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data?.nseBlocked ? (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-6 text-center">
          <p className="text-amber-700 dark:text-amber-400 font-semibold text-sm mb-1">NSE session unavailable</p>
          <p className="text-amber-600 dark:text-amber-500 text-xs mb-3">
            Could not connect to NSE. Try refreshing or check directly on NSE.
          </p>
          <button onClick={() => load(true)}
            className="text-xs font-semibold text-amber-700 dark:text-amber-400 underline">Retry</button>
        </div>
      ) : error ? (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-5 text-center">
          <p className="text-rose-600 dark:text-rose-400 text-sm font-semibold mb-1">Failed to load</p>
          <p className="text-rose-500 text-xs mb-3">{error}</p>
          <button onClick={() => load(true)} className="text-xs font-semibold text-rose-600 dark:text-rose-400 underline">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
          {deals.length === 0
            ? 'No block deal window activity today — market may be closed or window has not opened yet.'
            : 'No stocks match your filter.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((deal, i) => (
            <BlockWindowRow key={`${deal.symbol}-${deal.session}-${i}`} deal={deal} />
          ))}
        </div>
      )}

      {/* Explainer */}
      {!loading && !error && (
        <div className="mt-8 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl px-4 py-3">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-5">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Block Deal Window</span> — NSE allows large institutional trades (≥5 lakh shares or ≥₹5 Cr) through a dedicated 15-minute window.
            Session 1 runs 8:45–9:00 AM (pre-market), Session 2 runs 2:05–2:20 PM. All trades here are exclusively institutional.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Insider Trading ──────────────────────────────────────────────────────────

const INSIDER_PERIODS = [
  { id: 'week',   label: '1 Week' },
  { id: 'month',  label: '1 Month' },
  { id: 'custom', label: 'Custom' },
]

function TxBadge({ type }) {
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-lg border ${
      type === 'BUY'    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700/50' :
      type === 'SELL'   ? 'text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 border-rose-200 dark:border-rose-700/50' :
      type === 'PLEDGE' ? 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/50' :
                          'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'
    }`}>{type}</span>
  )
}

function InsiderRow({ trade }) {
  const qty = trade.secAcq > 0 ? trade.secAcq : trade.secSell
  return (
    <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-slate-900 dark:text-white font-bold text-sm">{trade.symbol}</span>
            {trade.category && (
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-1.5 py-0.5 rounded">
                {trade.category}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate">{trade.person || '—'}</p>
          {trade.name && <p className="text-[11px] text-slate-400 dark:text-slate-600 truncate mt-0.5">{trade.name}</p>}
        </div>
        <div className="text-right flex-shrink-0 space-y-1">
          <TxBadge type={trade.txType} />
          {qty > 0 && <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{fmtQty(qty)} shares</p>}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-100 dark:border-white/5 flex-wrap">
        {trade.secHeld > 0 && (
          <div>
            <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest">Held after</p>
            <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{fmtQty(trade.secHeld)}</p>
          </div>
        )}
        {trade.value > 0 && (
          <div>
            <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest">Value</p>
            <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{fmtValue(trade.value)}</p>
          </div>
        )}
        <div className="ml-auto text-right">
          {trade.dateTraded && <p className="text-[11px] text-slate-400 dark:text-slate-600">Traded: {trade.dateTraded}</p>}
          {trade.dateFiled  && <p className="text-[11px] text-slate-400 dark:text-slate-600">Filed: {trade.dateFiled}</p>}
        </div>
      </div>
    </div>
  )
}

const INSIDER_FILTERS = [
  { id: 'all',    label: 'All' },
  { id: 'buy',    label: 'Buy' },
  { id: 'sell',   label: 'Sell' },
  { id: 'pledge', label: 'Pledge' },
]

function InsiderPanel() {
  const [data, setData]     = useState(null)
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('week')
  const [customFrom, setCustomFrom] = useState(() => nDaysAgo(7))
  const [customTo, setCustomTo]     = useState(() => todayLocal())
  const lastQuery = useRef('')

  const doLoad = useCallback(async (p, from, to, refresh = false) => {
    const q = `${p}:${from}:${to}:${refresh}`
    if (q === lastQuery.current && !refresh) return
    lastQuery.current = q
    setLoad(true); setError('')
    try {
      let url = `/api/investing/insider-trading?period=${p}`
      if (p === 'custom') url += `&from=${from}&to=${to}`
      if (refresh) url += '&refresh=1'
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok && !json.nseBlocked) throw new Error(json.error || 'Failed')
      setData(json)
    } catch (e) { setError(e.message) }
    finally { setLoad(false) }
  }, [])

  useEffect(() => { doLoad('week', nDaysAgo(7), todayLocal()) }, [doLoad])

  function handlePeriodChange(p) {
    setPeriod(p)
    if (p === 'custom') return
    const from = p === 'month' ? nDaysAgo(30) : nDaysAgo(7)
    doLoad(p, from, todayLocal())
  }

  const trades = data?.trades || []
  const filtered = trades.filter(t => {
    if (filter === 'buy'    && t.txType !== 'BUY')    return false
    if (filter === 'sell'   && t.txType !== 'SELL')   return false
    if (filter === 'pledge' && t.txType !== 'PLEDGE') return false
    if (search) {
      const q = search.toLowerCase()
      return t.symbol?.toLowerCase().includes(q) || t.name?.toLowerCase().includes(q) || t.person?.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {data && !loading && !data.nseBlocked && (
            <>{data.count} filings
              {data.fromDate && ` · ${data.fromDate}${data.fromDate !== data.toDate ? ` → ${data.toDate}` : ''}`}
            </>
          )}
        </p>
        <RefreshBtn loading={loading} onClick={() => {
          const from = period === 'month' ? nDaysAgo(30) : period === 'custom' ? customFrom : nDaysAgo(7)
          const to   = period === 'custom' ? customTo : todayLocal()
          lastQuery.current = ''
          doLoad(period, from, to, true)
        }} />
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl p-1 mb-3">
        {INSIDER_PERIODS.map(p => (
          <button key={p.id} onClick={() => handlePeriodChange(p.id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              period === p.id ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>{p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-2 mb-3 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs text-slate-500 flex-shrink-0">From</span>
            <input type="date" value={customFrom} max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              className="flex-1 min-w-0 text-sm text-slate-900 dark:text-slate-200 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 outline-none" />
          </div>
          <span className="text-slate-400 text-xs">→</span>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs text-slate-500 flex-shrink-0">To</span>
            <input type="date" value={customTo} min={customFrom} max={todayLocal()}
              onChange={e => setCustomTo(e.target.value)}
              className="flex-1 min-w-0 text-sm text-slate-900 dark:text-slate-200 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 outline-none" />
          </div>
          <button onClick={() => { lastQuery.current = ''; doLoad('custom', customFrom, customTo) }}
            disabled={loading}
            className="flex-shrink-0 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">
            Apply
          </button>
        </div>
      )}

      {/* Tx type filter */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl p-1 mb-4">
        {INSIDER_FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === f.id ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>{f.label}</button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" placeholder="Search symbol, company, or person…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-violet-400 dark:focus:border-violet-500/60 transition-colors" />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data?.nseBlocked ? (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-amber-900 dark:text-amber-300 font-bold text-sm mb-1">NSE session unavailable</p>
              <p className="text-amber-700 dark:text-amber-400 text-xs leading-5 mb-3">
                Could not connect to NSE. Try refreshing or view directly.
              </p>
              <a href="https://www.nseindia.com/companies-listing/corporate-filings-insider-trading"
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg transition-colors">
                View on NSE ↗
              </a>
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-5 text-center">
          <p className="text-rose-600 dark:text-rose-400 text-sm font-semibold mb-1">Failed to load</p>
          <p className="text-rose-500 text-xs mb-3">{error}</p>
          <button onClick={() => { lastQuery.current = ''; doLoad(period, customFrom, customTo, true) }}
            className="text-xs font-semibold text-rose-600 dark:text-rose-400 underline">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
          {trades.length === 0 ? 'No filings for this period.' : 'No filings match your filter.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t, i) => <InsiderRow key={`${t.symbol}-${t.person}-${i}`} trade={t} />)}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TOP_TABS = [
  { id: 'deals',   label: 'Block Deal Window' },
  { id: 'insider', label: 'Insider Trading' },
]

export default function DealsPage() {
  const [topTab, setTopTab] = useState('deals')
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />
      <div className="max-w-3xl mx-auto px-6 pt-12 pb-20">

        <div className="flex items-center gap-2 text-sm text-slate-500 mb-8">
          <Link href="/investing" className="hover:text-slate-700 dark:hover:text-slate-400 transition-colors">Investing</Link>
          <span>/</span>
          <span className="text-slate-600 dark:text-slate-400">Institutional Activity</span>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 px-2 py-0.5 rounded-full">NSE Data</span>
          </div>
          <h1 className="text-3xl font-black mb-2">Institutional Activity</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-6">
            Block deal window trades and insider trading filings from NSE.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl p-1 mb-6">
          {TOP_TABS.map(t => (
            <button key={t.id} onClick={() => setTopTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                topTab === t.id ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}>{t.label}
            </button>
          ))}
        </div>

        {topTab === 'deals' ? <DealsPanel /> : <InsiderPanel />}

        <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-10">
          Sourced from NSE India
        </p>
      </div>
    </div>
  )
}
