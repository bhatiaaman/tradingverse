'use client'

import { useState, useEffect, useCallback } from 'react'
import Nav from '../../components/Nav'

function fmt(ts) {
  const d = new Date(ts)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function Badge({ type }) {
  const map = {
    BUY:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    SELL:   'bg-red-500/15 text-red-400 border-red-500/30',
    MARKET: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    LIMIT:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
    SL:     'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'SL-M': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    MIS:    'bg-purple-500/15 text-purple-400 border-purple-500/30',
    CNC:    'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    NRML:   'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  }
  const cls = map[type] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/30'
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {type}
    </span>
  )
}

export default function OrderLogPage() {
  const [tab, setTab] = useState('real') // real | paper
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [clearing, setClearing] = useState(false)
  const [filter, setFilter] = useState('all') // all | success | failed
  const [paperOrders, setPaperOrders] = useState([])
  const [paperPositions, setPaperPositions] = useState([])
  const [paperPnl, setPaperPnl] = useState(null)
  const [paperLoading, setPaperLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/order-log')
      if (!r.ok) throw new Error('Failed to load')
      const d = await r.json()
      setEntries(d.entries ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPaper = useCallback(async () => {
    setPaperLoading(true)
    try {
      const r = await fetch('/api/paper-orders')
      const d = await r.json()
      setPaperOrders(d.orders ?? [])
      setPaperPositions(d.positions ?? [])
      setPaperPnl(d.totalRealizedPnl ?? null)
    } catch (e) {
      console.error('Failed to load paper orders:', e)
    } finally {
      setPaperLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'paper') loadPaper() }, [tab, loadPaper])

  async function clearLog() {
    if (!confirm('Clear all order log entries? This cannot be undone.')) return
    setClearing(true)
    await fetch('/api/order-log', { method: 'DELETE' })
    setEntries([])
    setClearing(false)
  }

  async function clearPaperLog() {
    if (!confirm('Clear all paper trades? This cannot be undone.')) return
    setClearing(true)
    await fetch('/api/paper-orders', { method: 'DELETE' })
    setPaperOrders([])
    setPaperPositions([])
    setPaperPnl(null)
    setClearing(false)
  }

  const realEntries = entries.filter(e => !e.paper)
  const visible = filter === 'all' ? realEntries : realEntries.filter(e => e.status === filter)
  const wins = paperPositions.filter(p => p.realizedPnl > 0).length
  const total = paperPositions.filter(p => p.realizedPnl !== 0).length
  const winRate = total > 0 ? Math.round((wins / total) * 100) : null

  return (
    <div className="min-h-screen bg-[#060b14] text-white">
      <Nav />
      <main className="max-w-[1200px] mx-auto px-6 py-8">

        {/* Header with tab switcher */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Order Log</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {tab === 'real' ? 'Last 200 real orders placed via TradingVerse' : 'Paper trades for analysis'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Tab Switcher */}
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 text-xs font-semibold">
              {[['real', 'Real Orders'], ['paper', 'Paper Trades']].map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-3 py-1 rounded-md transition-all ${
                    tab === key
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={tab === 'real' ? load : loadPaper}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-semibold transition-all border border-white/5">
              Refresh
            </button>
            <button onClick={tab === 'real' ? clearLog : clearPaperLog} disabled={clearing || (tab === 'real' ? realEntries.length === 0 : paperOrders.length === 0)}
              className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-semibold transition-all border border-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
              {clearing ? 'Clearing…' : 'Clear'}
            </button>
          </div>
        </div>

        {/* Real Orders Tab */}
        {tab === 'real' && (
          <>
            {/* Stats bar */}
            {!loading && realEntries.length > 0 && (
              <div className="flex items-center gap-6 mb-5 text-sm">
                <span className="text-slate-500">
                  Total: <span className="text-white font-semibold">{realEntries.length}</span>
                </span>
                <span className="text-slate-500">
                  Success: <span className="text-emerald-400 font-semibold">
                    {realEntries.filter(e => e.status === 'success').length}
                  </span>
                </span>
                <span className="text-slate-500">
                  Failed: <span className="text-red-400 font-semibold">
                    {realEntries.filter(e => e.status === 'failed').length}
                  </span>
                </span>
              </div>
            )}

            {/* Filter */}
            <div className="mb-5">
              <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 text-xs font-semibold w-fit">
                {['all', 'success', 'failed'].map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-md capitalize transition-all ${
                      filter === f
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="text-slate-500 text-sm py-16 text-center">Loading…</div>
            ) : error ? (
              <div className="text-red-400 text-sm py-16 text-center">{error}</div>
            ) : visible.length === 0 ? (
              <div className="text-slate-600 text-sm py-16 text-center">
                {realEntries.length === 0 ? 'No orders placed yet.' : 'No entries match this filter.'}
              </div>
            ) : (
              <div className="rounded-xl border border-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 bg-white/[0.03] border-b border-white/5">
                      <th className="text-left px-4 py-3 font-semibold">Time</th>
                      <th className="text-left px-4 py-3 font-semibold">Symbol</th>
                      <th className="text-left px-4 py-3 font-semibold">Side</th>
                      <th className="text-left px-4 py-3 font-semibold">Type</th>
                      <th className="text-left px-4 py-3 font-semibold">Product</th>
                      <th className="text-right px-4 py-3 font-semibold">Qty</th>
                      <th className="text-right px-4 py-3 font-semibold">Price</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Order ID / Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {visible.map((e, i) => (
                      <tr key={i}
                        className={`transition-colors hover:bg-white/[0.025] ${
                          e.status === 'failed' ? 'bg-red-500/[0.03]' : ''
                        }`}>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmt(e.ts)}</td>
                        <td className="px-4 py-3 font-semibold text-white">{e.symbol}</td>
                        <td className="px-4 py-3"><Badge type={e.transaction_type} /></td>
                        <td className="px-4 py-3"><Badge type={e.order_type} /></td>
                        <td className="px-4 py-3"><Badge type={e.product} /></td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{e.quantity ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                          {e.price != null ? `₹${e.price}` : e.order_type === 'MARKET' ? 'MKT' : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            e.status === 'success'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-red-500/15 text-red-400 border-red-500/30'
                          }`}>
                            {e.status === 'success' ? 'SUCCESS' : 'FAILED'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[200px]">
                          {e.status === 'success' ? (
                            <span className="text-slate-500 font-mono">{e.order_id}</span>
                          ) : (
                            <span className="text-red-400/80 truncate block" title={e.error}>{e.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Paper Trades Tab */}
        {tab === 'paper' && (
          <>
            {/* Stats bar */}
            {!paperLoading && paperOrders.length > 0 && (
              <div className="flex items-center gap-6 mb-5 text-sm">
                <span className="text-slate-500">
                  Total P&L: <span className={`font-semibold ${paperPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ₹{paperPnl?.toFixed(2) || '0.00'}
                  </span>
                </span>
                <span className="text-slate-500">
                  Trades: <span className="text-white font-semibold">{total}</span>
                </span>
                {winRate !== null && (
                  <span className="text-slate-500">
                    Win Rate: <span className="text-white font-semibold">{winRate}%</span>
                  </span>
                )}
              </div>
            )}

            {paperLoading ? (
              <div className="text-slate-500 text-sm py-16 text-center">Loading…</div>
            ) : paperOrders.length === 0 ? (
              <div className="text-slate-600 text-sm py-16 text-center">No paper trades yet.</div>
            ) : (
              <>
                {/* Positions Table */}
                {paperPositions.length > 0 && (
                  <>
                    <h2 className="text-sm font-semibold text-white mb-3">Open Positions</h2>
                    <div className="rounded-xl border border-white/5 overflow-hidden mb-6">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 bg-white/[0.03] border-b border-white/5">
                            <th className="text-left px-4 py-3 font-semibold">Symbol</th>
                            <th className="text-right px-4 py-3 font-semibold">Net Qty</th>
                            <th className="text-right px-4 py-3 font-semibold">Avg Entry</th>
                            <th className="text-right px-4 py-3 font-semibold">Realized P&L</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {paperPositions.map((p, i) => (
                            <tr key={i} className="transition-colors hover:bg-white/[0.025]">
                              <td className="px-4 py-3 font-semibold text-white">{p.symbol}</td>
                              <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                                <span className={p.netQty > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                  {p.netQty > 0 ? '+' : ''}{p.netQty}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                                ₹{(p.netQty > 0 ? p.avgBuy : p.avgSell)?.toFixed(2) || '—'}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                                <span className={p.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                  {p.realizedPnl >= 0 ? '+' : ''}₹{p.realizedPnl.toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Orders Table */}
                <h2 className="text-sm font-semibold text-white mb-3">Trades</h2>
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 bg-white/[0.03] border-b border-white/5">
                        <th className="text-left px-4 py-3 font-semibold">Time</th>
                        <th className="text-left px-4 py-3 font-semibold">Symbol</th>
                        <th className="text-left px-4 py-3 font-semibold">Side</th>
                        <th className="text-left px-4 py-3 font-semibold">Type</th>
                        <th className="text-right px-4 py-3 font-semibold">Qty</th>
                        <th className="text-right px-4 py-3 font-semibold">Fill Price</th>
                        <th className="text-left px-4 py-3 font-semibold">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {paperOrders.map((e, i) => (
                        <tr key={i} className="transition-colors hover:bg-white/[0.025]">
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmt(e.ts)}</td>
                          <td className="px-4 py-3 font-semibold text-white">{e.tradingsymbol}</td>
                          <td className="px-4 py-3"><Badge type={e.transaction_type} /></td>
                          <td className="px-4 py-3"><Badge type={e.order_type} /></td>
                          <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{e.quantity}</td>
                          <td className="px-4 py-3 text-right text-slate-300 tabular-nums">₹{e.average_price}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/30">PAPER</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
