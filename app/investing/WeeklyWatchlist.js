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

// Derive the week these stocks are FOR from their fridayCloseDate.
// If stocks have fridayCloseDate "2026-04-17", the target week is the Mon–Fri after that Friday.
function getTargetWeekLabel(stockLists, fallback) {
  const allStocks = stockLists.flat()
  const dates = allStocks.map(s => s.fridayCloseDate).filter(Boolean).sort()
  if (!dates.length) return fallback
  const friday = new Date(dates[dates.length - 1])
  // Monday after this Friday = friday + 3 days
  const nextMonday = new Date(friday)
  nextMonday.setDate(friday.getDate() + 3)
  return getWeekRangeLabel(nextMonday)
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
  const [tempSymbol, setTempSymbol] = useState('')
  const [promptPriceMap, setPromptPriceMap] = useState({})
  const [isPromptPriceLoading, setIsPromptPriceLoading] = useState(false)
  const [editingSymbolIndex, setEditingSymbolIndex] = useState(null)
  const [isAdmin,            setIsAdmin]            = useState(false)

  // Nifty Outlook state
  const [outlook,             setOutlook]             = useState(null)
  const [outlookOpen,         setOutlookOpen]         = useState(true)
  const [outlookEditing,      setOutlookEditing]      = useState(false)
  const [outlookSources,      setOutlookSources]      = useState([
    { label: 'Claude',      json: '', text: '' },
    { label: 'Gemini',      json: '', text: '' },
    { label: 'Perplexity',  json: '', text: '' },
  ])
  const [outlookTextOpen,     setOutlookTextOpen]     = useState(false)
  const [outlookPrimaryIdx,   setOutlookPrimaryIdx]   = useState(0)
  const [outlookSaveStatus,   setOutlookSaveStatus]   = useState(null)
  const [outlookSchemaCopied, setOutlookSchemaCopied] = useState(false)

  // Basket state
  const [basket,          setBasket]          = useState({ T1: [], T2: [], T3: [] })
  const [sidebarMode,     setSidebarMode]     = useState('tracker')
  const [basketLTP,       setBasketLTP]       = useState({})
  const [basketLoaded,    setBasketLoaded]    = useState(false)
  const [pendingBasketAdd, setPendingBasketAdd] = useState(null) // symbol awaiting tier assignment

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
  const nextWeekLabel    = getWeekRangeLabel(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

  // Derive the "for week" label from stock fridayCloseDate fields — falls back to nextWeekLabel
  const targetWeekLabel  = getTargetWeekLabel(
    [watchlistObj.aiResearch, watchlistObj.expertsResearch, watchlistObj.chartink],
    nextWeekLabel
  )

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tv_watchlist_limit')
      if (saved) setDisplayLimit(saved === 'All' ? 'All' : parseInt(saved, 10))
    }
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setIsAdmin(d.user?.role === 'admin'))
      .catch(() => {})
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
        body: JSON.stringify({ 
          tab: activeTab, 
          list: finalList.map(s => ({ ...s, symbol: (s.symbol || '').toUpperCase() })) 
        }),
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

  const handleSyncMissingBaselines = async () => {
    setIsTrackerLoading(true)
    try {
      const res = await fetch('/api/weekly-watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: activeTab, list: watchlistObj[activeTab] }),
      })
      if (res.ok) {
        const saved = await res.json()
        setWatchlistObj(prev => ({ ...prev, [activeTab]: saved.watchlist?.[activeTab] || prev[activeTab] }))
      }
    } catch {} finally { setIsTrackerLoading(false) }
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

  const handleFetchPromptPrices = async () => {
    if (!userStocks) return
    setIsPromptPriceLoading(true)
    try {
      const symbols = userStocks.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`)
      const data = await res.json()
      if (data.quotes) {
        const mapped = {}
        data.quotes.forEach(q => { mapped[q.symbol] = q.ltp })
        setPromptPriceMap(mapped)
      }
    } catch (err) {
      console.error('Prompt price fetch failed:', err)
    } finally {
      setIsPromptPriceLoading(false)
    }
  }

  useEffect(() => {
    const syms = consolidated20.map(s => s.symbol)
    if (syms.length > 0) {
      fetchPerformance(syms)
    }
  }, [consolidated20, fetchPerformance])

  // ── Auto-fetch expert prompt prices ────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'expertsResearch' || !userStocks) return;
    const timer = setTimeout(() => {
      handleFetchPromptPrices();
    }, 1500); // 1.5s debounce
    return () => clearTimeout(timer);
  }, [userStocks, activeTab]);

  // ── Nifty Outlook: load from server on mount ────────────────────────────────
  useEffect(() => {
    fetch('/api/nifty-outlook')
      .then(res => res.json())
      .then(data => { if (data.outlook) setOutlook(data.outlook) })
      .catch(() => {})
  }, [])

  // ── Basket: load from server on mount ───────────────────────────────────────
  useEffect(() => {
    fetch('/api/weekly-basket')
      .then(res => res.json())
      .then(data => {
        if (data.basket && !Array.isArray(data.basket)) {
          setBasket({ T1: data.basket.T1 || [], T2: data.basket.T2 || [], T3: data.basket.T3 || [] })
        }
        setBasketLoaded(true)
      })
      .catch(() => setBasketLoaded(true))
  }, [])

  // ── Basket: save to server whenever it changes (after initial load, admin only) ─
  useEffect(() => {
    if (!basketLoaded || !isAdmin) return
    fetch('/api/weekly-basket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ basket }),
    }).catch(err => console.error('[basket] save failed:', err))
  }, [basket, basketLoaded, isAdmin])

  // ── Basket: fetch LTPs whenever basket symbols change ───────────────────────
  useEffect(() => {
    const allSyms = [...(basket.T1 || []), ...(basket.T2 || []), ...(basket.T3 || [])]
    if (!allSyms.length) { setBasketLTP({}); return }
    fetch(`/api/quotes?symbols=${encodeURIComponent(allSyms.join(','))}`)
      .then(res => res.json())
      .then(data => {
        if (data.quotes) {
          const map = {}
          data.quotes.forEach(q => { map[q.symbol] = q.ltp })
          setBasketLTP(map)
        }
      })
      .catch(() => {})
  }, [basket])

  if (loading) return null

  const handleLimitChange = (lim) => {
    setDisplayLimit(lim)
    if (typeof window !== 'undefined') localStorage.setItem('tv_watchlist_limit', lim)
  }

  const getDynamicPrompt = () => {
    const schema = `[
  {
    "symbol": "EXACT_NSE_TICKER",
    "companyName": "Full Company Name in readable format",
    "sector": "Sector Name",
    "setupType": "e.g. Volatility Contraction Pattern (VCP) | Breakout | Pullback | Tight Base",
    "fridayClose": 152.40,
    "fridayCloseDate": "YYYY-MM-DD",
    "entryLow": 150,
    "entryHigh": 153,
    "stopLoss": 142,
    "target1": 165,
    "target2": 180,
    "rewardToRiskRatio": "1:2.5",
    "confidenceScore": 8,
    "reasoning": "One-line reason why it was selected",
    "executionNote": "Short note on liquidity and execution risk."
  }
]`

    const symbolMandate = `CRITICAL MANDATE: You MUST use exact, official NSE ticker symbols in the "symbol" field. Do NOT use company names or include trailing spaces.
Correct Examples: Use "ELGIEQUIP" instead of "ElgiEquipments", "GET&D" instead of "GEVT&D", "BEPL" instead of "BhansaliEngg".`

    const priceEntries = Object.entries(promptPriceMap)
    let priceContext = ''
    if (priceEntries.length > 0) {
      priceContext = `\nCRITICAL CONTEXT — Current Prices (use as baseline for entry zones, stops, and targets):\n${priceEntries.map(([s, p]) => `- ${s}: ~₹${p}`).join('\n')}\nDo NOT hallucinate or estimate prices if a current price is provided above.\n`
    }

    if (activeTab === 'expertsResearch') {
      return `You are an expert Indian NSE swing-trading analyst.

I have already selected the following specific stocks based on my own research for the upcoming week (${nextWeekLabel}):

STOCKS: [ ${userStocks || 'INFY, TCS'} ]
${priceContext}
For EACH stock listed above, analyse the daily and weekly chart structure up to the most recent Friday close and provide a swing-trading setup for the week ahead. Cover:
- Is the stock in an actionable setup right now (breakout, base, pullback to support, VCP, etc.)?
- Realistic entry zone based on current price structure — do NOT place entry at extended highs.
- Stop-loss that technically invalidates the setup (below base, swing low, or breakout candle).
- Two targets: T1 conservative, T2 for strong follow-through.
- Confidence score reflecting how clean and timely the setup is this specific week.

Do not add or suggest other stocks. Only analyse the ones provided.
If a stock has no actionable setup this week, still return it with a low confidenceScore (1–4) and explain why in the reasoning field.

**Output Format:**
Output a single, valid JSON array only — no markdown blocks, no text outside the JSON.
CRITICAL: The "fridayClose" field must be the actual NSE closing price on the most recent Friday. The "fridayCloseDate" must be that exact date in YYYY-MM-DD format. Do not omit or estimate these fields.
${symbolMandate}

${schema}`
    }

    return `You are an expert Indian NSE swing-trading scanner.

I need you to find up to 12 stocks for the upcoming week's watchlist (${nextWeekLabel}) with the highest probability of follow-through.

Use data up to the most recent Friday close and build the watchlist for the upcoming week starting Monday.

**Selection Criteria:**
Prefer lesser-followed, non-popular stocks over obvious blue-chip names, but only if they are liquid enough for clean entries and exits.
Filter for stocks that meet most of these conditions:
- Daily volume is at least 2x the 20-day average.
- Price is above key moving averages (e.g. 50/200 DMA) or has recently reclaimed them.
- Chart shows a clean breakout, retest, tight base, or momentum continuation.
- Relative strength is better than the broader market or sector.
- Visible institutional interest (delivery buildup, unusual volume, or sustained accumulation).
- Room to the next resistance level (attractive risk-reward). Do NOT select stocks that are already sitting at or within 1–2% of a major horizontal resistance, supply zone, or all-time high — unless there is clear evidence of a confirmed breakout above it with volume.
- Sector is in demand: the stock's sector should show positive momentum or rotation interest in the current market environment. Avoid stocks in sectors facing broad selling pressure or underperforming the Nifty 50 over the past 2–4 weeks.
- No major bearish breakdown, weak trend, or obvious event/earnings risk in the coming week.

**Risk Management & Levels:**
- Entry should be conservative: near the breakout or retest zone, NOT at extended highs.
- Stop-loss should be technically invalidating (e.g. below the breakout candle or base), not too wide.
- Target 1 should be realistic; Target 2 should represent a strong follow-through move.
- Filter strictly: do not force 12 names if setup quality is poor. Returning 4–6 high-conviction names is better than 12 mediocre ones.

**Output Format:**
Output a single, valid JSON array only — no markdown blocks, no text outside the JSON.
CRITICAL: Do NOT hallucinate data. Only pick stocks you have verified technical data for up to the most recent Friday close.
CRITICAL: The "fridayClose" field must be the actual closing price on the most recent Friday. The "fridayCloseDate" must be that exact date in YYYY-MM-DD format. Do not omit or estimate these fields.
${symbolMandate}

${schema}`
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
      s.target1, s.target2, s.stopLoss,
      s.entryLow && s.entryHigh ? `${s.entryLow}-${s.entryHigh}` : (s.entryZone || ''),
      esc(s.rewardToRiskRatio),
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
        <div className="flex items-center gap-1.5">
          {/* Basket toggle */}
          {!readOnly && (() => {
            const TIER_LIMITS = { T1: 3, T2: 3, T3: 4 }
            const TIER_STYLES = {
              T1: 'bg-amber-500/20 text-amber-400 border-amber-600/50 hover:bg-amber-500/30',
              T2: 'bg-sky-500/20 text-sky-400 border-sky-600/50 hover:bg-sky-500/30',
              T3: 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600',
            }
            const inTier = ['T1', 'T2', 'T3'].find(t => (basket[t] || []).includes(stock.symbol))
            const totalCount = (basket.T1?.length || 0) + (basket.T2?.length || 0) + (basket.T3?.length || 0)

            // Stock is already in a tier — show removable badge
            if (inTier) {
              return (
                <button
                  onClick={() => setBasket(b => ({ ...b, [inTier]: b[inTier].filter(s => s !== stock.symbol) }))}
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider transition-colors ${TIER_STYLES[inTier]}`}
                  title={`Remove from basket (${inTier})`}
                >
                  {inTier}
                </button>
              )
            }

            // Tier picker open for this stock — rendered as absolute dropdown
            if (pendingBasketAdd === stock.symbol) {
              return (
                <div className="relative">
                  <div className="absolute right-0 top-6 z-30 flex flex-col gap-1 bg-[#0e1420] border border-white/10 rounded-lg shadow-xl p-1.5 min-w-[64px]">
                    {['T1', 'T2', 'T3'].map(t => {
                      const full = (basket[t] || []).length >= TIER_LIMITS[t]
                      return (
                        <button
                          key={t}
                          disabled={full}
                          onClick={() => {
                            if (!full) setBasket(b => ({ ...b, [t]: [...(b[t] || []), stock.symbol] }))
                            setPendingBasketAdd(null)
                          }}
                          className={`text-[9px] font-black px-2 py-1 rounded border uppercase tracking-wider transition-colors text-center ${
                            full
                              ? 'text-slate-700 border-slate-800 cursor-not-allowed'
                              : TIER_STYLES[t]
                          }`}
                          title={full ? `${t} full` : `Add to ${t}`}
                        >
                          {t}{full ? ' ✕' : ''}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setPendingBasketAdd(null)}
                      className="text-[9px] text-slate-500 hover:text-red-400 font-bold py-0.5 transition-colors text-center"
                      title="Cancel"
                    >cancel</button>
                  </div>
                  {/* The + button that triggered the picker */}
                  <button
                    className="text-[11px] font-black px-1.5 py-0.5 rounded border leading-none text-violet-400 border-violet-500"
                  >+</button>
                </div>
              )
            }

            // Default: + button
            const allFull = totalCount >= 10
            return (
              <button
                onClick={() => { if (!allFull) setPendingBasketAdd(stock.symbol) }}
                disabled={allFull}
                className={`text-[11px] font-black px-1.5 py-0.5 rounded border transition-colors leading-none ${
                  allFull
                    ? 'text-slate-600 dark:text-slate-700 border-slate-700 dark:border-slate-800 cursor-not-allowed'
                    : 'text-slate-400 dark:text-slate-500 border-slate-300 dark:border-slate-700 hover:text-violet-500 hover:border-violet-500'
                }`}
                title={allFull ? 'Basket full (10/10)' : 'Add to basket'}
              >
                +
              </button>
            )
          })()}

          <div className={`text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded-sm border ${
            stock.confidenceScore >= 8
              ? 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900/30'
              : 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 bg-amber-100 dark:bg-amber-900/30'
          }`}>
            SCORE: {stock.confidenceScore}/10
          </div>
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

      {/* Friday close */}
      {stock.fridayClose && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Fri Close</span>
          <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
            ₹{Number(stock.fridayClose).toLocaleString('en-IN')}
          </span>
          {stock.fridayCloseDate && (
            <span className="text-[9px] text-slate-500">
              ({new Date(stock.fridayCloseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})
            </span>
          )}
        </div>
      )}

      <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-3">{stock.setupType}</div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
          <div className="text-slate-400 mb-1">Entry Zone</div>
          <div className="font-bold text-slate-700 dark:text-slate-200">
            {stock.entryLow && stock.entryHigh
              ? `${stock.entryLow}–${stock.entryHigh}`
              : stock.entryZone || '--'}
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
          <div className="text-slate-400 mb-1">Stop Loss</div>
          <div className="font-bold text-red-500">{stock.stopLoss}</div>
        </div>
        {(stock.target1 || stock.target2) && (
          <>
            <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-2 border border-emerald-100 dark:border-emerald-800/30">
              <div className="text-slate-400 mb-1">Target 1</div>
              <div className="font-bold text-emerald-600 dark:text-emerald-400">{stock.target1 ?? '--'}</div>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-2 border border-emerald-100 dark:border-emerald-800/30">
              <div className="text-slate-400 mb-1">Target 2</div>
              <div className="font-bold text-emerald-600 dark:text-emerald-400">{stock.target2 ?? '--'}</div>
            </div>
          </>
        )}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
          <div className="text-slate-400 mb-1">Fri Close</div>
          <div className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
            {(() => {
              // Priority: fridayClose → referencePrice → entryZone mid
              if (stock.fridayClose) return <><span className="text-[10px]">📅</span> {Number(stock.fridayClose).toLocaleString('en-IN')}</>
              if (stock.referencePrice) return <><span className="text-[10px]">🏁</span> {stock.referencePrice.toLocaleString('en-IN')}</>
              if (stock.entryLow && stock.entryHigh) return <><span className="text-[10px]">🀄</span> {((stock.entryLow + stock.entryHigh) / 2).toLocaleString('en-IN')}</>
              const parts = stock.entryZone?.split(/[-–—/]/).map(p => parseFloat(p.replace(/[^0-9.]/g, '')))
              const nums = parts?.filter(n => !isNaN(n))
              if (nums?.length === 2) return <><span className="text-[10px]">🀄</span> {((nums[0] + nums[1]) / 2).toLocaleString('en-IN')}</>
              if (nums?.length === 1) return <><span className="text-[10px]">🀄</span> {nums[0].toLocaleString('en-IN')}</>
              return '--'
            })()}
          </div>
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

      <div className="mt-auto flex gap-2">
        <Link
          href={`/chart?symbol=${encodeURIComponent(stock.symbol)}&interval=day&back=/investing/weekly-watchlist`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 block text-center bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 rounded-lg transition-colors border border-transparent dark:border-white/5"
        >
          Launch Chart
        </Link>
        <a
          href={`https://www.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(stock.symbol)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2.5 bg-[#2962ff]/10 hover:bg-[#2962ff]/20 text-[#2962ff] dark:text-[#5b9bff] border border-[#2962ff]/20 hover:border-[#2962ff]/40 rounded-lg transition-colors text-xs font-bold whitespace-nowrap"
          title="Open on TradingView (Daily)"
        >
          <svg width="13" height="13" viewBox="0 0 36 28" fill="currentColor">
            <path d="M14 18H8l6-8 6 8h-6z"/>
            <path d="M22 18h-2l5-7 5 7h-8z" opacity=".6"/>
            <path d="M4 18H0l4-5.5L8 18H4z" opacity=".4"/>
          </svg>
          TV
        </a>
      </div>
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
            <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">{targetWeekLabel} · ROI vs Fri Close</p>
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
                    
                    // Priority: fridayClose → referencePrice → entryZone mid
                    let ref = null
                    let isMidFallback = false

                    if (s.fridayClose) {
                      ref = Number(s.fridayClose)
                    } else if (s.referencePrice) {
                      ref = s.referencePrice
                    } else if (s.entryLow && s.entryHigh) {
                      ref = (s.entryLow + s.entryHigh) / 2
                      isMidFallback = true
                    } else if (s.entryLow) {
                      ref = s.entryLow
                      isMidFallback = true
                    } else if (s.entryZone) {
                      const parts = s.entryZone.split(/[-–—/]/).map(p => parseFloat(p.replace(/[^0-9.]/g, '')))
                      const nums = parts.filter(n => !isNaN(n))
                      if (nums.length === 2) { ref = (nums[0] + nums[1]) / 2; isMidFallback = true }
                      else if (nums.length === 1) { ref = nums[0]; isMidFallback = true }
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

  const OUTLOOK_SCHEMA = `{
  "bias": "Bullish",
  "biasStrength": "Strong | Moderate | Weak",
  "weeklyView": "2-3 sentence directional take on Nifty for the week",
  "niftyFridayClose": 24234,
  "fridayCloseDate": "YYYY-MM-DD",
  "keySupport": [24200, 24000],
  "keyResistance": [24800, 25200],
  "watchFor": "What level or event to watch closely this week",
  "riskEvents": "e.g. Weekly expiry Tue, RBI policy Thu, FII data",
  "strategy": "Actionable stance — buy dips / sell rallies / stay neutral"
}`

  const BIAS_STYLES = {
    'Bullish':            { pill: 'bg-emerald-500/15 text-emerald-400 border-emerald-600/40', dot: 'bg-emerald-400' },
    'Strong Bullish':     { pill: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50', dot: 'bg-emerald-300' },
    'Cautiously Bullish': { pill: 'bg-teal-500/15 text-teal-400 border-teal-600/40',          dot: 'bg-teal-400'   },
    'Neutral':            { pill: 'bg-slate-500/15 text-slate-400 border-slate-600/40',        dot: 'bg-slate-400'  },
    'Cautiously Bearish': { pill: 'bg-orange-500/15 text-orange-400 border-orange-600/40',     dot: 'bg-orange-400' },
    'Bearish':            { pill: 'bg-rose-500/15 text-rose-400 border-rose-600/40',           dot: 'bg-rose-400'   },
    'Strong Bearish':     { pill: 'bg-rose-600/20 text-rose-300 border-rose-500/50',           dot: 'bg-rose-300'   },
  }

  // Merge multiple LLM outlook objects into one consensus view
  function mergeOutlooks(parsed, primaryIdx) {
    const valid = parsed.filter(p => p && p.bias && p.weeklyView)
    if (!valid.length) return null
    if (valid.length === 1) return { ...valid[0] }

    const primary = valid[Math.min(primaryIdx, valid.length - 1)]

    // Bias: majority vote
    const votes = {}
    valid.forEach(p => { votes[p.bias] = (votes[p.bias] || 0) + 1 })
    const bias = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]

    // Key levels: union + cluster within 1%
    function cluster(levels) {
      if (!levels.length) return []
      const sorted = [...new Set(levels)].sort((a, b) => a - b)
      const out = []
      let group = [sorted[0]]
      for (let i = 1; i < sorted.length; i++) {
        if ((sorted[i] - group[0]) / group[0] < 0.01) {
          group.push(sorted[i])
        } else {
          out.push(Math.round(group.reduce((a, b) => a + b, 0) / group.length))
          group = [sorted[i]]
        }
      }
      out.push(Math.round(group.reduce((a, b) => a + b, 0) / group.length))
      return out
    }

    const allSupport    = valid.flatMap(p => (p.keySupport    || []).map(Number)).filter(Boolean)
    const allResistance = valid.flatMap(p => (p.keyResistance || []).map(Number)).filter(Boolean)

    // niftyFridayClose: median of available values
    const closes = valid.map(p => p.niftyFridayClose).filter(Boolean).map(Number).sort((a, b) => a - b)

    return {
      bias,
      biasStrength:     primary.biasStrength || 'Moderate',
      weeklyView:       primary.weeklyView,
      niftyFridayClose: closes.length ? closes[Math.floor(closes.length / 2)] : null,
      fridayCloseDate:  primary.fridayCloseDate || null,
      keySupport:       cluster(allSupport).sort((a, b) => b - a),
      keyResistance:    cluster(allResistance).sort((a, b) => b - a),
      watchFor:         primary.watchFor   || null,
      riskEvents:       primary.riskEvents || null,
      strategy:         primary.strategy   || null,
    }
  }

  const NiftyOutlookCard = ({ isAdmin }) => {
    // Determine what to display — merged (multi-source) or single
    const displayOutlook = outlook?.merged ?? outlook

    const biasStyle = BIAS_STYLES[displayOutlook?.bias] ?? BIAS_STYLES['Neutral']
    const sources   = outlook?.sources ?? []

    const handleOpenEdit = (e) => {
      e.stopPropagation()
      // Pre-fill sources from saved data if available
      if (outlook?.sources) {
        setOutlookSources(outlook.sources.map(s => ({
          label: s.label,
          text:  s.rawText || '',
          json:  JSON.stringify(s, null, 2),
        })))
        const savedPrimary = outlook.sources.findIndex(s => s.isPrimary)
        setOutlookPrimaryIdx(savedPrimary >= 0 ? savedPrimary : 0)
      } else if (outlook && !outlook.sources) {
        // Legacy single-object: load into first slot
        setOutlookSources([
          { label: 'Claude',     text: outlook.rawText || '', json: JSON.stringify(outlook, null, 2) },
          { label: 'Gemini',     text: '', json: '' },
          { label: 'Perplexity', text: '', json: '' },
        ])
        setOutlookPrimaryIdx(0)
      } else {
        setOutlookSources([
          { label: 'Claude',     text: '', json: '' },
          { label: 'Gemini',     text: '', json: '' },
          { label: 'Perplexity', text: '', json: '' },
        ])
        setOutlookPrimaryIdx(0)
      }
      setOutlookEditing(true)
    }

    // Extract JSON object from a block of text (finds last { ... } block)
    function extractJsonBlock(raw) {
      const start = raw.lastIndexOf('{')
      const end   = raw.lastIndexOf('}')
      if (start === -1 || end === -1 || end < start) return null
      return raw.slice(start, end + 1).trim()
    }

    const handleSave = async () => {
      setOutlookSaveStatus('Saving...')

      // Parse each filled source — prefer explicit json field, else extract from text
      const parsed = []
      for (const src of outlookSources) {
        const rawText  = src.text.trim()
        const rawJson  = src.json.trim() || (rawText ? extractJsonBlock(rawText) : '')
        if (!rawJson) { parsed.push(null); continue }
        try {
          parsed.push({ ...JSON.parse(rawJson), label: src.label, rawText: rawText || null })
        } catch {
          setOutlookSaveStatus(`Invalid JSON in "${src.label}" — check the JSON block at the end`)
          return
        }
      }

      const filledParsed = parsed.filter(Boolean)
      if (!filledParsed.length) {
        setOutlookSaveStatus('Paste at least one LLM response')
        return
      }

      const merged = mergeOutlooks(filledParsed, outlookPrimaryIdx)
      // Attach primary source's raw text to merged for display
      const primarySource = filledParsed[Math.min(outlookPrimaryIdx, filledParsed.length - 1)]
      if (primarySource?.rawText) merged.rawText = primarySource.rawText

      // Mark primary
      const sourcesWithFlag = filledParsed.map((s, i) => ({ ...s, isPrimary: i === outlookPrimaryIdx }))

      try {
        const res = await fetch('/api/nifty-outlook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sources: sourcesWithFlag, merged }),
        })
        const data = await res.json()
        if (data.success) {
          setOutlook(data.outlook)
          setOutlookEditing(false)
          setOutlookSaveStatus(null)
        } else {
          setOutlookSaveStatus(`Error: ${data.error}`)
        }
      } catch (err) {
        setOutlookSaveStatus(`Error: ${err.message}`)
      }
    }

    return (
      <>
        <div className="mb-4 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {/* Header */}
          <div
            onClick={() => setOutlookOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-[#0b101a] hover:bg-slate-100 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-sm">🔭</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Nifty Outlook</span>
              <span className="text-[10px] font-semibold text-slate-400">— {nextWeekLabel}</span>
              {displayOutlook?.bias && (
                <span className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${biasStyle.pill}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${biasStyle.dot}`} />
                  {displayOutlook.biasStrength && displayOutlook.biasStrength !== 'Moderate' ? `${displayOutlook.biasStrength} ` : ''}{displayOutlook.bias}
                </span>
              )}
              {/* Per-source bias badges */}
              {sources.length > 1 && sources.map((s, i) => {
                const st = BIAS_STYLES[s.bias] ?? BIAS_STYLES['Neutral']
                return (
                  <span key={i} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${st.pill} opacity-70`}>
                    {s.label}: {s.bias}
                  </span>
                )
              })}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isAdmin && (
                <button
                  onClick={handleOpenEdit}
                  className="text-[11px] font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200 dark:hover:bg-violet-900/70 border border-violet-200 dark:border-violet-800/60 px-3 py-1 rounded-lg transition-colors"
                >
                  {displayOutlook ? '✏️ Edit' : '+ Add Outlook'}
                </button>
              )}
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${outlookOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Body */}
          {outlookOpen && (
            <div className="px-4 py-4 bg-white dark:bg-[#060a0f] border-t border-slate-200 dark:border-slate-800">
              {!displayOutlook ? (
                <p className="text-xs text-slate-400 italic">
                  No outlook added yet.{isAdmin ? ' Click "+ Add Outlook" to paste your analysis.' : ''}
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {displayOutlook.niftyFridayClose && (
                      <div className="flex-shrink-0 bg-slate-100 dark:bg-slate-800/60 rounded-lg px-3 py-2 text-center border border-slate-200 dark:border-white/5">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Nifty Close</div>
                        <div className="text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">
                          {Number(displayOutlook.niftyFridayClose).toLocaleString('en-IN')}
                        </div>
                        {displayOutlook.fridayCloseDate && (
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            {new Date(displayOutlook.fridayCloseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed flex-1 italic border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                      &ldquo;{displayOutlook.weeklyView}&rdquo;
                    </p>
                  </div>

                  {(displayOutlook.keySupport?.length > 0 || displayOutlook.keyResistance?.length > 0) && (
                    <div className="flex flex-wrap gap-2 text-[10px] font-mono font-bold">
                      {displayOutlook.keyResistance?.map(r => (
                        <span key={r} className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          R {Number(r).toLocaleString('en-IN')}
                        </span>
                      ))}
                      {displayOutlook.keySupport?.map(s => (
                        <span key={s} className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          S {Number(s).toLocaleString('en-IN')}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-1.5 text-[11px]">
                    {displayOutlook.watchFor && (
                      <div className="flex gap-2">
                        <span className="text-slate-400 flex-shrink-0">👁 Watch:</span>
                        <span className="text-slate-600 dark:text-slate-400">{displayOutlook.watchFor}</span>
                      </div>
                    )}
                    {displayOutlook.riskEvents && (
                      <div className="flex gap-2">
                        <span className="text-slate-400 flex-shrink-0">⚡ Events:</span>
                        <span className="text-slate-600 dark:text-slate-400">{displayOutlook.riskEvents}</span>
                      </div>
                    )}
                    {displayOutlook.strategy && (
                      <div className="flex gap-2">
                        <span className="text-slate-400 flex-shrink-0">📋 Strategy:</span>
                        <span className="text-slate-600 dark:text-slate-400">{displayOutlook.strategy}</span>
                      </div>
                    )}
                  </div>

                  {/* Full analysis toggle */}
                  {displayOutlook.rawText && (
                    <div className="border-t border-slate-100 dark:border-white/5 pt-2">
                      <button
                        onClick={() => setOutlookTextOpen(o => !o)}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-violet-500 hover:text-violet-400 transition-colors"
                      >
                        <svg className={`w-3.5 h-3.5 transition-transform ${outlookTextOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/>
                        </svg>
                        {outlookTextOpen ? 'Hide' : 'View'} Full Analysis
                        {(() => { const primary = sources.find(s => s.isPrimary) ?? sources[0]; return primary?.label ? <span className="text-[10px] font-normal text-slate-400 ml-1">({primary.label})</span> : null })()}
                      </button>
                      {outlookTextOpen && (
                        <pre className="mt-3 text-[11px] font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-[#060a0f] border border-slate-200 dark:border-white/5 rounded-xl p-4 max-h-[60vh] overflow-y-auto">
                          {displayOutlook.rawText}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Source count footnote */}
                  {sources.length > 0 && (
                    <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-100 dark:border-white/5">
                      Based on {sources.length} source{sources.length > 1 ? 's' : ''}: {sources.map(s => s.label).join(', ')}
                      {sources.length > 1 && ' · levels merged, narrative from primary'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {outlookEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-white dark:bg-[#0e1420] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Nifty Outlook — {nextWeekLabel}</h3>
              <p className="text-xs text-slate-500 mb-4">
                Get your Nifty analysis from Claude, Gemini, or Perplexity — then paste the JSON output below. 1–3 sources, all optional.
              </p>

              {/* How-to steps */}
              <div className="mb-5 space-y-2">
                {[
                  {
                    n: '1',
                    title: 'Copy the schema below',
                    desc: 'Click the button to copy a JSON instruction to your clipboard.',
                    action: (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`At the end of your response, output ONLY a single valid JSON object — no markdown fences, no text outside the JSON:\n\n${OUTLOOK_SCHEMA}`)
                          setOutlookSchemaCopied(true)
                          setTimeout(() => setOutlookSchemaCopied(false), 2000)
                        }}
                        className={`mt-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${outlookSchemaCopied ? 'bg-emerald-500 text-white' : 'bg-violet-600 text-white hover:bg-violet-700'}`}
                      >
                        {outlookSchemaCopied ? '✅ Copied!' : '📋 Copy Schema'}
                      </button>
                    ),
                    preview: <pre className="mt-2 text-[10px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto border border-slate-200 dark:border-white/5 rounded-lg p-2 bg-slate-50 dark:bg-[#060a0f]">{OUTLOOK_SCHEMA}</pre>,
                  },
                  {
                    n: '2',
                    title: 'Paste at the end of your Nifty prompt',
                    desc: 'Add it after your analysis instructions so the LLM knows to output structured JSON. Send to Claude.ai, Gemini, or Perplexity.',
                  },
                  {
                    n: '3',
                    title: 'Paste the full response into a box below',
                    desc: 'Copy the entire LLM output (text + JSON at the end) and paste it. We auto-extract the JSON — the full commentary is saved too and viewable in the card.',
                  },
                ].map(step => (
                  <div key={step.n} className="flex gap-3 bg-slate-50 dark:bg-[#0b101a] border border-slate-200 dark:border-white/5 rounded-xl p-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white text-[11px] font-black flex items-center justify-center mt-0.5">{step.n}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-slate-800 dark:text-slate-200">{step.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{step.desc}</p>
                      {step.action}
                      {step.preview}
                    </div>
                  </div>
                ))}
              </div>

              {/* Three source boxes */}
              <div className="space-y-3 mb-4">
                {outlookSources.map((src, i) => {
                  const isPrimary  = outlookPrimaryIdx === i
                  const hasContent = src.text.trim().length > 0 || src.json.trim().length > 0
                  // Try to detect auto-extracted JSON preview
                  const jsonPreview = src.text.trim()
                    ? (() => { const s = src.text.lastIndexOf('{'); const e = src.text.lastIndexOf('}'); return s !== -1 && e > s ? '✅ JSON detected' : '⚠️ No JSON found at end' })()
                    : null
                  return (
                    <div key={i} className={`rounded-xl border transition-colors ${isPrimary && hasContent ? 'border-violet-500/50 bg-violet-500/5' : 'border-slate-200 dark:border-slate-700'}`}>
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LLM {i + 1}</span>
                          <input
                            value={src.label}
                            onChange={e => setOutlookSources(prev => prev.map((s, j) => j === i ? { ...s, label: e.target.value } : s))}
                            className="text-xs font-bold bg-transparent text-slate-700 dark:text-slate-300 outline-none border-b border-dashed border-slate-300 dark:border-slate-600 w-24"
                            placeholder="Label"
                          />
                          {hasContent && jsonPreview && (
                            <span className={`text-[10px] font-bold ${jsonPreview.startsWith('✅') ? 'text-emerald-500' : 'text-amber-500'}`}>{jsonPreview}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {hasContent && (
                            <button
                              onClick={() => setOutlookPrimaryIdx(i)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                                isPrimary
                                  ? 'bg-violet-600 text-white border-violet-600'
                                  : 'text-slate-500 border-slate-300 dark:border-slate-600 hover:border-violet-500 hover:text-violet-500'
                              }`}
                            >
                              {isPrimary ? '★ Primary' : 'Set Primary'}
                            </button>
                          )}
                          {hasContent && (
                            <button
                              onClick={() => setOutlookSources(prev => prev.map((s, j) => j === i ? { ...s, text: '', json: '' } : s))}
                              className="text-[10px] text-slate-400 hover:text-red-400 transition-colors"
                            >✕</button>
                          )}
                        </div>
                      </div>
                      <textarea
                        className="w-full bg-slate-50 dark:bg-[#060a0f] px-3 pb-3 font-mono text-[11px] text-slate-800 dark:text-slate-300 focus:outline-none resize-none rounded-b-xl"
                        rows={hasContent ? 8 : 2}
                        value={src.text || src.json}
                        onChange={e => {
                          const val = e.target.value
                          // If it looks like pure JSON, keep in json field; otherwise store as full text
                          const trimmed = val.trim()
                          const looksLikeJson = trimmed.startsWith('{') && !trimmed.includes('\n###')
                          setOutlookSources(prev => prev.map((s, j) => j === i
                            ? looksLikeJson ? { ...s, json: val, text: '' } : { ...s, text: val, json: '' }
                            : s
                          ))
                        }}
                        placeholder={`Paste full ${src.label || `LLM ${i+1}`} output here — text + JSON at the end (optional)`}
                      />
                    </div>
                  )
                })}
              </div>

              {outlookSaveStatus && (
                <div className={`text-sm mb-3 font-medium ${outlookSaveStatus.startsWith('Error') || outlookSaveStatus.includes('Invalid') || outlookSaveStatus.includes('Paste') ? 'text-red-500' : 'text-violet-500'}`}>
                  {outlookSaveStatus}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setOutlookEditing(false); setOutlookSaveStatus(null) }}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 text-sm font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
                >
                  Save Outlook
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  const BasketPanel = () => {
    const TIERS = [
      { label: 'Tier 1', tag: 'T1', slots: 3, perStock: 17000, color: 'text-amber-400', border: 'border-amber-800/50', bg: 'bg-amber-900/10' },
      { label: 'Tier 2', tag: 'T2', slots: 3, perStock: 10000, color: 'text-sky-400',   border: 'border-sky-800/50',   bg: 'bg-sky-900/10'   },
      { label: 'Tier 3', tag: 'T3', slots: 4, perStock: 6000,  color: 'text-slate-400', border: 'border-slate-700',    bg: 'bg-slate-800/30' },
    ]
    const totalCount = (basket.T1?.length || 0) + (basket.T2?.length || 0) + (basket.T3?.length || 0)

    const copyBasket = () => {
      const lines = []
      TIERS.forEach(tier => {
        ;(basket[tier.tag] || []).forEach(sym => {
          const ltp = basketLTP[sym]
          const qty = ltp ? Math.floor(tier.perStock / ltp) : '?'
          lines.push(`${tier.tag} ${sym}: ${qty} qty @ ₹${ltp?.toLocaleString('en-IN') || '--'}`)
        })
      })
      navigator.clipboard.writeText(lines.join('\n'))
    }

    return (
      <div className="bg-white dark:bg-[#0b101a] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden flex flex-col max-h-[calc(100vh-130px)] sticky top-20 shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-[#0e1420] border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Stock Basket</h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">₹1,05,000 • 10 stocks</p>
          </div>
          <span className={`text-[10px] font-black tabular-nums ${totalCount === 10 ? 'text-emerald-400' : 'text-slate-500'}`}>
            {totalCount}/10
          </span>
        </div>

        {/* Tiers */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {TIERS.map(tier => {
            const group = basket[tier.tag] || []
            return (
              <div key={tier.tag} className={`rounded-xl border ${tier.border} ${tier.bg} p-3`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${tier.color}`}>
                    {tier.label} — {group.length}/{tier.slots}
                  </span>
                  <span className="text-[9px] font-bold text-slate-500">₹{tier.perStock.toLocaleString('en-IN')} ea</span>
                </div>

                {group.length === 0 ? (
                  <p className="text-[10px] text-slate-600 dark:text-slate-600 italic">No stocks added</p>
                ) : (
                  <div className="space-y-1.5">
                    {group.map(sym => {
                      const ltp = basketLTP[sym]
                      const qty = ltp ? Math.floor(tier.perStock / ltp) : null
                      return (
                        <div key={sym} className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setBasket(b => ({ ...b, [tier.tag]: b[tier.tag].filter(s => s !== sym) }))}
                              className="w-3.5 h-3.5 rounded-full bg-red-500/10 hover:bg-red-500/30 text-red-400 flex items-center justify-center text-[8px] font-bold transition-colors flex-shrink-0"
                              title="Remove"
                            >✕</button>
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{sym}</span>
                          </div>
                          <div className="text-right">
                            {ltp ? (
                              <>
                                <div className="text-[10px] font-mono font-bold text-slate-500">{qty} qty</div>
                                <div className="text-[9px] font-mono text-slate-500/70">@ ₹{ltp.toLocaleString('en-IN')}</div>
                              </>
                            ) : (
                              <div className="text-[10px] text-slate-600">--</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-3 pb-3 pt-1 border-t border-slate-200 dark:border-white/5 space-y-2">
          <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500 pt-1">
            <span>Total deployed</span>
            <span>₹1,05,000</span>
          </div>
          {totalCount > 0 && (
            <button
              onClick={copyBasket}
              className="w-full text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.07] py-2 rounded-lg transition-colors border border-slate-200 dark:border-white/5"
            >
              📋 Copy Basket
            </button>
          )}
        </div>
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
              — {targetWeekLabel}
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

          {isAdmin && activeTab === 'expertsResearch' && currentList.length > 0 && (
            <button onClick={() => { setJsonInput('[\n\n]'); setIsEditing('append') }}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-colors mr-2">
              + Add New Stocks
            </button>
          )}

          {isAdmin && activeTab !== 'consolidated' && (
            <div className="flex items-center gap-2">
              {['aiResearch', 'expertsResearch', 'chartink'].includes(activeTab) && currentList.length > 0 && (
                <button
                  onClick={handleSyncMissingBaselines}
                  title="Fix missing baseline prices for the current list"
                  className="p-1.5 text-slate-500 hover:text-violet-500 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-white/5 transition-colors"
                >
                  <svg className={`w-3.5 h-3.5 ${isTrackerLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              )}
              <button onClick={() => { setJsonInput(JSON.stringify(currentList, null, 2)); setIsEditing('replace') }}
                className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-3 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800/50 hover:bg-violet-200 dark:hover:bg-violet-800/50 transition-colors">
                {currentList.length > 0 ? 'Edit Watchlist' : 'Add Watchlist'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Nifty Outlook ──────────────────────────────────────────────────── */}
      <NiftyOutlookCard isAdmin={isAdmin} />

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
            {isAdmin && (
              <button
                onClick={e => { e.stopPropagation(); handleSaveWeek() }}
                disabled={archiveSaving}
                className="text-[11px] font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200 dark:hover:bg-violet-900/70 border border-violet-200 dark:border-violet-800/60 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                {archiveSaving ? 'Saving…' : '💾 Save This Week'}
              </button>
            )}
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
            <StockCard key={i} stock={stock} tabId={activeTab} readOnly={!isAdmin} />
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
                <div className="mb-4">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Enter Symbols (NSE Tickers)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={userStocks}
                      onChange={e => setUserStocks(e.target.value)}
                      placeholder="e.g. INFY, TCS, RELIANCE"
                      className="flex-1 bg-white dark:bg-[#060a0f] border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-violet-500 transition-colors"
                    />
                    {isPromptPriceLoading ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-white/5 animate-pulse">
                        <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Syncing...</span>
                      </div>
                    ) : Object.keys(promptPriceMap).length > 0 ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-100/50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800/30">
                        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">Prices Ready</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              
              <div className="flex flex-col gap-3">
                {activeTab === 'expertsResearch' && Object.keys(promptPriceMap).length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 bg-white dark:bg-[#060a0f] border border-slate-200 dark:border-slate-800 rounded-lg shadow-inner">
                    {Object.entries(promptPriceMap).map(([s, p]) => (
                      <div key={s} className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 dark:bg-white/[0.03] rounded border border-slate-100 dark:border-white/5">
                        <span className="text-[10px] font-bold text-slate-400">{s}</span>
                        <span className="text-[10px] font-mono font-bold text-violet-500">{p.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleCopyPrompt}
                      className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-[0.98] ${
                        copied
                          ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                          : 'bg-violet-600 text-white hover:bg-violet-700 shadow-violet-500/20'
                      }`}
                    >
                      <span>{copied ? '✅ Prompt Copied' : '📋 Copy Prompt for Claude'}</span>
                    </button>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">
                      {activeTab === 'expertsResearch'
                        ? 'Baseline prices included for accuracy'
                        : 'Claude will scan for best setups'}
                    </span>
                  </div>
                )}
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
      <div className="w-full lg:w-[280px] flex-shrink-0 space-y-3">
        {/* Tab switcher */}
        <div className="flex bg-slate-100 dark:bg-[#0e1420] rounded-xl border border-slate-200 dark:border-white/10 p-1 gap-1">
          <button
            onClick={() => setSidebarMode('tracker')}
            className={`flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-lg transition-colors ${
              sidebarMode === 'tracker'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            📊 Tracker
          </button>
          <button
            onClick={() => setSidebarMode('basket')}
            className={`flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-lg transition-colors ${
              sidebarMode === 'basket'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {(() => { const n = (basket.T1?.length||0)+(basket.T2?.length||0)+(basket.T3?.length||0); return n > 0 ? `🧺 Basket ${n}/10` : '🧺 Basket' })()}
          </button>
        </div>
        {sidebarMode === 'tracker' ? <PerformanceSidebar /> : <BasketPanel />}
      </div>
    </div>
  )
}
