'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'

// ── Week helpers (client-side mirror of server utils) ─────────────────────────
function getISOWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekRangeLabel(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  const fmt = dt => dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return `${fmt(mon)} – ${fmt(fri)}`;
}

function formatDateAdded(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
export default function WeeklyWatchlist() {
  const [watchlistObj, setWatchlistObj] = useState({ aiResearch: [], expertsResearch: [], chartink: [] })
  const [activeTab, setActiveTab] = useState('aiResearch')
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [saveStatus, setSaveStatus] = useState(null)
  const [displayLimit, setDisplayLimit] = useState(15)
  const [userStocks, setUserStocks] = useState('')
  const [copied, setCopied] = useState(false)
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const [performanceData, setPerformanceData] = useState({})
  const [isTrackerLoading, setIsTrackerLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [editingSymbolIndex, setEditingSymbolIndex] = useState(null)
  const [tempSymbol, setTempSymbol] = useState('')

  // Archive state
  const [archiveIndex, setArchiveIndex] = useState([])
  const [archiveLabels, setArchiveLabels] = useState({})
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [archiveSaveMsg, setArchiveSaveMsg] = useState(null)
  const [loadedWeek, setLoadedWeek] = useState(null)      // { week, label, snapshot }
  const [loadingWeek, setLoadingWeek] = useState(null)    // key being fetched

  const currentWeekKey   = getISOWeekKey()
  const currentWeekLabel = getWeekRangeLabel()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tv_watchlist_limit')
      if (saved) setDisplayLimit(saved === 'All' ? 'All' : parseInt(saved, 10))
    }
    fetch('/api/weekly-watchlist')
      .then(res => res.json())
      .then(data => {
        setWatchlistObj({
          aiResearch:      data.watchlist?.aiResearch      || [],
          expertsResearch: data.watchlist?.expertsResearch || [],
          chartink:        data.watchlist?.chartink        || [],
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Load archive index
    fetch('/api/weekly-watchlist/archive')
      .then(res => res.json())
      .then(data => {
        setArchiveIndex(data.index  || [])
        setArchiveLabels(data.labels || {})
      })
      .catch(() => {})
  }, [])

  // ── Save current week snapshot ───────────────────────────────────────────────
  const handleSaveWeek = async () => {
    setArchiveSaving(true)
    setArchiveSaveMsg(null)
    try {
      const res  = await fetch('/api/weekly-watchlist/archive', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setArchiveSaveMsg({ ok: true, text: `Saved: ${data.label}` })
        // Refresh index
        const idx = await fetch('/api/weekly-watchlist/archive').then(r => r.json())
        setArchiveIndex(idx.index  || [])
        setArchiveLabels(idx.labels || {})
      } else {
        setArchiveSaveMsg({ ok: false, text: data.error || 'Save failed' })
      }
    } catch {
      setArchiveSaveMsg({ ok: false, text: 'Network error' })
    } finally {
      setArchiveSaving(false)
      setTimeout(() => setArchiveSaveMsg(null), 3000)
    }
  }

  // ── Load a past week snapshot ────────────────────────────────────────────────
  const handleLoadWeek = async (weekKey) => {
    setLoadingWeek(weekKey)
    try {
      const res  = await fetch(`/api/weekly-watchlist/archive?week=${weekKey}`)
      const data = await res.json()
      if (data.snapshot) setLoadedWeek({ week: weekKey, label: data.label, snapshot: data.snapshot })
    } catch {}
    finally { setLoadingWeek(null) }
  }

  // ── Watchlist CRUD ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaveStatus('Saving...')
    try {
      const parsed = JSON.parse(jsonInput)
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array of objects')

      let finalList = parsed
      if (isEditing === 'append') {
        const existingMap = new Map();
        (watchlistObj[activeTab] || []).forEach(s => existingMap.set(s.symbol, s))
        parsed.forEach(s => existingMap.set(s.symbol, s))
        finalList = Array.from(existingMap.values())
      }

      const res = await fetch('/api/weekly-watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: activeTab, list: finalList }),
      })

      if (res.ok) {
        const saved = await res.json()
        // Use server-returned list (has dateAdded stamped)
        const serverList = saved.watchlist?.[activeTab] ?? finalList
        setWatchlistObj(prev => ({ ...prev, [activeTab]: serverList }))
        setIsEditing(false)
        setSaveStatus(null)
      } else {
        const errorData = await res.json()
        setSaveStatus(`Error: ${errorData.error}`)
      }
    } catch {
      setSaveStatus('Invalid JSON format')
    }
  }

  const handleSymbolSave = async (oldSymbol) => {
    if (!tempSymbol || tempSymbol.toUpperCase().trim() === oldSymbol) {
      setEditingSymbolIndex(null); return
    }
    const cleanSym = tempSymbol.toUpperCase().replace(/[^A-Z0-9&-]/g, '');
    const updatedList = [...watchlistObj[activeTab]]
    const ogIndex = updatedList.findIndex(s => s.symbol === oldSymbol)
    
    if (ogIndex !== -1) {
      updatedList[ogIndex].symbol = cleanSym
      setWatchlistObj(prev => ({ ...prev, [activeTab]: updatedList }))
      try {
        await fetch('/api/weekly-watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tab: activeTab, list: updatedList }),
        })
      } catch (err) {
        console.error('Failed to save symbol edit:', err)
      }
    }
    setEditingSymbolIndex(null)
  }

  // ── Unified Consolidation Logic ─────────────────────────────────────────────
  const consolidated20 = useMemo(() => {
    const combined = [
      ...watchlistObj.aiResearch.map(s => ({ ...s, source: 'AI' })),
      ...watchlistObj.expertsResearch.map(s => ({ ...s, source: 'Exp' })),
      ...watchlistObj.chartink.map(s => ({ ...s, source: 'Chart' })),
    ]
    
    const map = {}
    for (const item of combined) {
      const sym = item.symbol
      if (!sym) continue
      if (!map[sym] || (item.confidenceScore || 0) > (map[sym].confidenceScore || 0)) {
        map[sym] = item
      }
    }
    return Object.values(map)
      .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
      .slice(0, 20)
  }, [watchlistObj])

  // ── Performance Tracker Fetcher ──────────────────────────────────────────────
  const fetchPerformance = useCallback(async (symbols) => {
    if (!symbols?.length) return
    setIsTrackerLoading(true)
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`)
      const data = await res.json()
      if (data.quotes) {
        const mapped = {}
        data.quotes.forEach(q => { mapped[q.symbol] = q })
        setPerformanceData(mapped)
        setLastRefreshed(new Date())
      }
    } catch (err) {
      console.error('Performance fetch failed:', err)
    } finally {
      setIsTrackerLoading(false)
    }
  }, [])

  useEffect(() => {
    const syms = consolidated20.map(s => s.symbol)
    if (syms.length > 0) {
      fetchPerformance(syms)
    }
  }, [consolidated20, fetchPerformance])

  if (loading) return null

  const handleLimitChange = (lim) => {
    setDisplayLimit(lim)
    if (typeof window !== 'undefined') localStorage.setItem('tv_watchlist_limit', lim)
  }

  const getDynamicPrompt = () => {
    const schemaString = `[
  {
    "symbol": "STOCK_NAME",
    "companyName": "Full Company Name in readable format",
    "sector": "Sector Name",
    "setupType": "e.g. VCP | Breakout | Mean Reversion",
    "entryZone": "150-153",
    "stopLoss": 142,
    "target1": 165,
    "target2": 180,
    "rewardToRiskRatio": "1:2.5",
    "confidenceScore": 8,
    "reasoning": "One line technical reason",
    "executionNote": "Volume or liquidity risk"
  }
]`
    const base = `You are an expert Indian NSE swing-trading scanner.\n\n`
    const constraints = `Output the response as a single, valid JSON array of objects using this exact schema. Do not use markdown wrappers outside the JSON, strictly JSON.\nCRITICAL MANDATE: You MUST use exact, official NSE ticker symbols in the "symbol" field. Do NOT use company names or include trailing spaces.\nCorrect Examples: Use "ELGIEQUIP" instead of "ElgiEquipments", "GET&D" instead of "GEVT&D", "BEPL" instead of "BhansaliEngg".\n\n${schemaString}`
    if (activeTab === 'expertsResearch') {
      return `${base}I have already selected the following specific stocks based on my own research:\n\nSTOCKS: [ ${userStocks || 'INFY, TCS'} ]\n\nFor EACH of the specific stocks listed above, provide a comprehensive swing-trading setup analysis using daily and weekly data up to the most recent Friday close.\nDo not find other stocks. Only analyze the ones provided.\n\n${constraints}`
    }
    return `${base}I need you to find up to 15 stocks for next week's watchlist with the highest probability of follow-through. Use data up to Friday's close and build the watchlist for the upcoming week starting Monday.\n\nPreferences: Liquid stocks, daily volume >2x 20-day avg, clean breakout/momentum continuation, high relative strength.\n\n${constraints}`
  }

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(getDynamicPrompt())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const TABS = [
    { id: 'aiResearch',      label: '🤖 AI Research' },
    { id: 'expertsResearch', label: '🧠 Experts Research' },
    { id: 'chartink',        label: '📊 Chartink' },
    { id: 'consolidated',    label: '✨ Consolidated Top 20' },
  ]

  let currentList = []
  if (activeTab === 'consolidated') {
    const combined = [
      ...watchlistObj.aiResearch.map(s      => ({ ...s, sourceTitle: '⚡ AI',       sourceColor: 'text-fuchsia-400 bg-fuchsia-900/40 border-fuchsia-800' })),
      ...watchlistObj.expertsResearch.map(s => ({ ...s, sourceTitle: '🧠 Expert',   sourceColor: 'text-indigo-400 bg-indigo-900/40 border-indigo-800' })),
      ...watchlistObj.chartink.map(s        => ({ ...s, sourceTitle: '📊 Chartink', sourceColor: 'text-emerald-400 bg-emerald-900/40 border-emerald-800' })),
    ]
    const map = {}
    for (const item of combined) {
      if (!map[item.symbol] || item.confidenceScore > map[item.symbol].confidenceScore) map[item.symbol] = item
    }
    currentList = Object.values(map)
  } else {
    currentList = watchlistObj[activeTab] || []
  }

  const displayWatchlist = [...currentList]
    .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
    .slice(0, activeTab === 'consolidated' ? 20 : (displayLimit === 'All' ? undefined : displayLimit))

  // ── Export helpers ─────────────────────────────────────────────────────────
  const exportToTradingView = () => {
    const combined = [...watchlistObj.aiResearch, ...watchlistObj.expertsResearch, ...watchlistObj.chartink]
    if (!combined.length) return
    const uniqueSymbols = Array.from(new Set(combined.map(s => s.symbol)))
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const tvContent = `### Watchlist (${dateStr}),${uniqueSymbols.map(s => `NSE:${s}`).join(',')}`
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([tvContent], { type: 'text/plain' })), download: 'Tradingverse_Watchlist_All.txt' })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const exportToCSV = () => {
    const combined = [
      ...watchlistObj.aiResearch.map(s      => ({ ...s, source: 'AI' })),
      ...watchlistObj.expertsResearch.map(s => ({ ...s, source: 'Expert' })),
      ...watchlistObj.chartink.map(s        => ({ ...s, source: 'Chartink' })),
    ]
    if (!combined.length) return
    const uniqueList = Object.values(Object.fromEntries(combined.map(s => [s.symbol, s])))
    const esc = str => typeof str === 'string' ? `"${str.replace(/"/g, '""')}"` : (str || '')
    const headers = ['Symbol', 'Company Name', 'Source', 'Sector', 'Setup Type', 'Target 1', 'Target 2', 'Stop Loss', 'Entry Zone', 'R:R', 'Score', 'Date Added', 'Reasoning']
    const rows = uniqueList.map(s => [
      s.symbol, esc(s.companyName), s.source, esc(s.sector), esc(s.setupType),
      s.target1, s.target2, s.stopLoss, esc(s.entryZone), esc(s.rewardToRiskRatio),
      s.confidenceScore, s.dateAdded ? formatDateAdded(s.dateAdded) : '',
      esc(s.reasoning),
    ].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })), download: 'Tradingverse_Watchlist_All.csv' })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  // ── Stock card renderer (reused for live + archive modal) ──────────────────
  const StockCard = ({ stock, tabId, readOnly = false }) => (
    <div className="flex flex-col bg-white dark:bg-[#0b101a] border border-slate-200 dark:border-white/10 rounded-xl p-5 hover:border-violet-300 dark:hover:border-violet-500/40 transition-colors group relative">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2 group/title">
          {!readOnly && editingSymbolIndex === stock.symbol ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={tempSymbol}
                onChange={e => setTempSymbol(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSymbolSave(stock.symbol)}
                className="w-24 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white px-2 py-0.5 rounded text-sm font-bold border border-violet-500 outline-none"
              />
              <button onClick={() => handleSymbolSave(stock.symbol)} className="text-emerald-500 hover:text-emerald-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
              </button>
              <button onClick={() => setEditingSymbolIndex(null)} className="text-slate-400 hover:text-red-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{stock.symbol}</h3>
              {!readOnly && tabId !== 'consolidated' && (
                <button
                  onClick={() => { setTempSymbol(stock.symbol); setEditingSymbolIndex(stock.symbol) }}
                  className="text-slate-400 hover:text-violet-500 opacity-0 group-hover/title:opacity-100 transition-opacity"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              )}
            </>
          )}
          {tabId === 'consolidated' && stock.sourceTitle && (
            <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-sm border ${stock.sourceColor}`}>
              {stock.sourceTitle}
            </span>
          )}
          <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-sm">
            {stock.sector}
          </span>
        </div>
        <div className={`text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded-sm border ${
          stock.confidenceScore >= 8
            ? 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900/30'
            : 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 bg-amber-100 dark:bg-amber-900/30'
        }`}>
          SCORE: {stock.confidenceScore}/10
        </div>
      </div>

      {/* Company name + Date Added */}
      <div className="-mt-1 mb-2 flex items-center justify-between gap-2">
        {stock.companyName && (
          <span className="text-[10px] text-slate-500 font-medium tracking-wide truncate">{stock.companyName}</span>
        )}
        {stock.dateAdded && (
          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap flex-shrink-0">
            📅 {formatDateAdded(stock.dateAdded)}
          </span>
        )}
      </div>

      <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-3">{stock.setupType}</div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
          <div className="text-slate-400 mb-1">Entry Zone</div>
          <div className="font-bold text-slate-700 dark:text-slate-200">{stock.entryZone}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
          <div className="text-slate-400 mb-1">Stop Loss</div>
          <div className="font-bold text-red-500">{stock.stopLoss}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
          <div className="text-slate-400 mb-1">Targets</div>
          <div className="font-bold text-emerald-500">{stock.target1} • {stock.target2}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
          <div className="text-slate-400 mb-1">Risk : Reward</div>
          <div className="font-bold text-slate-700 dark:text-slate-200">{stock.rewardToRiskRatio}</div>
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic mb-3 flex-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
        &ldquo;{stock.reasoning}&rdquo;
      </p>

      {stock.executionNote && (
        <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-4 bg-slate-50 dark:bg-slate-800/30 p-2 rounded">
          <span className="font-bold">⚠️ Note:</span> {stock.executionNote}
        </div>
      )}

      <Link
        href={`/chart?symbol=${encodeURIComponent(stock.symbol)}&interval=day&back=/investing/weekly-watchlist`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto block text-center w-full bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 rounded-lg transition-colors border border-transparent dark:border-white/5"
      >
        Launch Chart
      </Link>
    </div>
  )

  const PerformanceSidebar = () => {
    return (
      <div className="bg-white dark:bg-[#0b101a] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden flex flex-col max-h-[calc(100vh-100px)] sticky top-20 shadow-xl">
        <div className="px-4 py-3 bg-slate-50 dark:bg-[#0e1420] border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">
              Weekly Tracker
            </h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">ROI vs Fri Close</p>
          </div>
          <button 
            onClick={() => fetchPerformance(consolidated20.map(s => s.symbol))}
            disabled={isTrackerLoading}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 text-slate-500 ${isTrackerLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-white/10">
          {consolidated20.length === 0 ? (
            <div className="p-4 text-center text-[10px] text-slate-500 italic">No consolidated stocks yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-white/[0.02]">
                    <th className="px-4 py-2 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Symbol</th>
                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">ROI %</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidated20.map((s, idx) => {
                    const quote = performanceData[s.symbol]
                    
                    // Fallback logic: Use mid of entry zone if refPrice is missing
                    let ref = s.referencePrice
                    let isMidFallback = false
                    
                    if (!ref && s.entryZone) {
                      const parts = s.entryZone.split(/[-–—/]/).map(p => parseFloat(p.replace(/[^0-9.]/g, '')))
                      const nums = parts.filter(n => !isNaN(n))
                      if (nums.length === 2) {
                        ref = (nums[0] + nums[1]) / 2
                        isMidFallback = true
                      } else if (nums.length === 1) {
                        ref = nums[0]
                        isMidFallback = true
                      }
                    }

                    const roi = (quote?.ltp && ref) ? ((quote.ltp - ref) / ref) * 100 : null
                    const isPositive = roi !== null ? roi >= 0 : null
                    
                    return (
                      <tr key={s.symbol} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="text-[11px] font-black text-slate-700 dark:text-slate-300">{s.symbol}</div>
                          <div className={`text-[9px] font-mono ${isMidFallback ? 'text-amber-500/80' : 'text-slate-400 dark:text-slate-500'}`}>
                            {ref ? `${isMidFallback ? '🀄' : '🏁'} ${ref.toLocaleString('en-IN')}` : 'No Baseline'}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {roi !== null ? (
                            <div className={`text-[11px] font-mono font-black ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {isPositive ? '▲' : '▼'}{Math.abs(roi).toFixed(2)}%
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 dark:text-slate-600">---</div>
                          )}
                          <div className="text-[9px] font-mono text-slate-500">
                            {quote?.ltp ? quote.ltp.toLocaleString('en-IN') : '--'}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {lastRefreshed && (
          <div className="px-4 py-2 bg-slate-50 dark:bg-black/20 text-[8px] font-bold text-slate-400 uppercase tracking-tight text-center">
            Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full flex flex-col lg:flex-row gap-8">
      <div className="flex-1 min-w-0">
      <Link href="/investing" className="inline-flex items-center text-xs font-bold text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 mb-4 transition-colors">
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Investing
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-baseline gap-2 flex-wrap">
            Stocks For Week
            {displayWatchlist.length > 0 && (
              <span className="text-slate-400 font-normal">({displayWatchlist.length})</span>
            )}
            <span className="text-base font-semibold text-slate-500 dark:text-slate-400">
              — {currentWeekLabel}
            </span>
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
            High-probability setups for the upcoming sessions
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {displayWatchlist.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="flex items-center text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-[#060a0f] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors mr-1"
              >
                📥 Export...
                <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {isExportMenuOpen && (
                <div className="absolute top-full right-0 mt-1 w-36 bg-white dark:bg-[#0e1420] border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg overflow-hidden z-20">
                  <button onClick={() => { exportToCSV(); setIsExportMenuOpen(false) }} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-b border-slate-200 dark:border-slate-800">
                    📊 To CSV
                  </button>
                  <button onClick={() => { exportToTradingView(); setIsExportMenuOpen(false) }} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    📈 To TradingView
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab !== 'consolidated' && currentList.length > 0 && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800/50 rounded-lg p-1 border border-slate-200 dark:border-white/5 mr-2">
              {[10, 15, 20, 'All'].map(lim => (
                <button key={lim} onClick={() => handleLimitChange(lim)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${displayLimit === lim ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  {lim}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'expertsResearch' && currentList.length > 0 && (
            <button onClick={() => { setJsonInput('[\n\n]'); setIsEditing('append') }}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-colors mr-2">
              + Add New Stocks
            </button>
          )}

          {activeTab !== 'consolidated' && (
            <button onClick={() => { setJsonInput(JSON.stringify(currentList, null, 2)); setIsEditing('replace') }}
              className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-3 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800/50 hover:bg-violet-200 dark:hover:bg-violet-800/50 transition-colors">
              {currentList.length > 0 ? 'Edit Watchlist' : 'Add Watchlist'}
            </button>
          )}
        </div>
      </div>

      {/* ── Week Archive Bar ────────────────────────────────────────────────── */}
      <div className="mb-4 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {/* Toggle header */}
        <div
          onClick={() => setArchiveOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-[#0b101a] hover:bg-slate-100 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">📅</span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Week Archive</span>
            {archiveIndex.length > 0 && (
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
                {archiveIndex.length} saved
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {archiveSaveMsg && (
              <span className={`text-[11px] font-semibold ${archiveSaveMsg.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                {archiveSaveMsg.ok ? '✓' : '✕'} {archiveSaveMsg.text}
              </span>
            )}
            <button
              onClick={e => { e.stopPropagation(); handleSaveWeek() }}
              disabled={archiveSaving}
              className="text-[11px] font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200 dark:hover:bg-violet-900/70 border border-violet-200 dark:border-violet-800/60 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              {archiveSaving ? 'Saving…' : '💾 Save This Week'}
            </button>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${archiveOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Saved weeks list */}
        {archiveOpen && (
          <div className="px-4 py-3 bg-white dark:bg-[#060a0f] border-t border-slate-200 dark:border-slate-800">
            {archiveIndex.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No weeks saved yet. Click &ldquo;Save This Week&rdquo; to create the first snapshot.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {archiveIndex.map(weekKey => {
                  const isCurrent = weekKey === currentWeekKey
                  return (
                    <button
                      key={weekKey}
                      onClick={() => handleLoadWeek(weekKey)}
                      disabled={loadingWeek === weekKey}
                      className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        isCurrent
                          ? 'border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-600 dark:hover:text-violet-300'
                      } disabled:opacity-50`}
                    >
                      {loadingWeek === weekKey ? '…' : archiveLabels[weekKey] || weekKey}
                      {isCurrent && <span className="ml-1 text-[9px] text-violet-500">current</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-bold whitespace-nowrap rounded-t-lg transition-colors border-b-2 
              ${activeTab === tab.id
                ? 'text-violet-600 dark:text-violet-400 border-violet-600 dark:border-violet-500 bg-violet-50 dark:bg-violet-900/10'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Stock grid ──────────────────────────────────────────────────────── */}
      {currentList.length === 0 && !isEditing ? (
        <div className="text-center py-10 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-white/[0.01]">
          <p className="text-slate-500 text-sm">No stocks available in this view.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayWatchlist.map((stock, i) => (
            <StockCard key={i} stock={stock} tabId={activeTab} readOnly={false} />
          ))}
        </div>
      )}

      {/* ── Admin Modal (edit/add) ───────────────────────────────────────────── */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-[#0e1420] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {activeTab === 'expertsResearch' ? 'Add Expert Stocks' : 'AI Prompt Builder'}
            </h3>

            <div className="mb-6 bg-slate-50 dark:bg-[#0b101a] border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Step 1: Generate AI Prompt</h4>
              {activeTab === 'expertsResearch' && (
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Enter Stocks (Comma Separated)</label>
                  <input type="text" value={userStocks} onChange={e => setUserStocks(e.target.value)}
                    placeholder="e.g. INFY, TCS, RELIANCE"
                    className="w-full bg-white dark:bg-[#060a0f] border border-slate-200 dark:border-slate-700 rounded-md p-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              )}
              <div className="flex items-center gap-3">
                <button onClick={handleCopyPrompt}
                  className="px-4 py-2 text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">
                  {copied ? '✅ Copied to Clipboard!' : '📋 Copy Prompt'}
                </button>
                <span className="text-xs text-slate-500">Paste this into Claude.</span>
              </div>
            </div>

            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Step 2: Paste LLM Output</h4>
            <textarea
              className="w-full flex-1 min-h-[200px] bg-slate-50 dark:bg-[#060a0f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-800 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
              placeholder={'[\n  {\n    "symbol": "TCS",\n    ...\n  }\n]'}
            />

            {saveStatus && (
              <div className={`text-sm mb-4 font-medium ${saveStatus.startsWith('Error') || saveStatus.startsWith('Invalid') ? 'text-red-500' : 'text-violet-500'}`}>
                {saveStatus}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-auto">
              <button onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={handleSave}
                className="px-4 py-2 text-sm font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
                {isEditing === 'append' ? '➕ Append to Database' : 'Save to Database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Modal (read-only overlay) ──────────────────────────────── */}
      {loadedWeek && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="w-full max-w-6xl">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4 bg-slate-900 border border-slate-700 rounded-xl px-5 py-3 sticky top-0 z-10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-sm">📅</span>
                  <span className="text-white font-bold text-sm">
                    Loaded: {loadedWeek.label}
                  </span>
                  <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    READ-ONLY
                  </span>
                </div>
                {loadedWeek.snapshot?.savedAt && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Snapshot saved {new Date(loadedWeek.snapshot.savedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
              <button
                onClick={() => setLoadedWeek(null)}
                className="text-xs font-bold text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              >
                ✕ Back to Current Week
              </button>
            </div>

            {/* Tabs for archived data */}
            {(['aiResearch', 'expertsResearch', 'chartink']).map(tab => {
              const archList = loadedWeek.snapshot[tab] || []
              if (!archList.length) return null
              const tabLabel = tab === 'aiResearch' ? '🤖 AI Research' : tab === 'expertsResearch' ? '🧠 Experts Research' : '📊 Chartink'
              return (
                <div key={tab} className="mb-6">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{tabLabel} — {archList.length} stocks</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...archList]
                      .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
                      .map((stock, i) => (
                        <StockCard key={i} stock={stock} tabId={tab} readOnly={true} />
                      ))
                    }
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      </div>

      {/* Right Sidebar */}
      <div className="w-full lg:w-[280px] flex-shrink-0">
        <PerformanceSidebar />
      </div>
    </div>
  )
}
