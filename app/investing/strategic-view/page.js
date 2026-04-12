'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Nav from '../../components/Nav'
import Link from 'next/link'

// ─── Local storage ────────────────────────────────────────────────────────────

const SAVED_KEY = 'tv:strategic-views'
const MAX_SAVED = 10

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') }
  catch { return [] }
}

function saveToDisk(views) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(views)) } catch {}
}

function timeAgo(ms) {
  if (!ms) return null
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function parseInline(text) {
  if (!text) return text
  const parts = []
  let key = 0
  const regex = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g
  let last = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[1]) parts.push(<strong key={key++}><em>{match[1]}</em></strong>)
    else if (match[2]) parts.push(<strong key={key++} className="font-semibold text-slate-900 dark:text-white">{match[2]}</strong>)
    else if (match[3]) parts.push(<em key={key++} className="italic">{match[3]}</em>)
    else if (match[4]) parts.push(<code key={key++} className="bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 px-1.5 py-0.5 rounded text-[11px] font-mono">{match[4]}</code>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 0 ? text : parts.length === 1 ? parts[0] : parts
}

function TableBlock({ lines }) {
  const rows = lines.filter(l => !/^\|[-:\s|]+\|$/.test(l))
  if (!rows.length) return null
  const parseRow = r => r.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim())
  const headers = parseRow(rows[0])
  const body    = rows.slice(1)
  return (
    <div className="overflow-x-auto my-4 rounded-xl border border-slate-200 dark:border-white/10 text-xs">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100 dark:bg-white/[0.05]">
            {headers.map((h, i) => (
              <th key={i} className="text-left font-bold py-2.5 px-3 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 whitespace-nowrap">
                {parseInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => {
            const cells = parseRow(row)
            return (
              <tr key={i} className="border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                {cells.map((cell, j) => (
                  <td key={j} className={`py-2.5 px-3 text-slate-700 dark:text-slate-300 leading-5 align-top ${j === 0 ? 'font-semibold whitespace-nowrap text-slate-900 dark:text-slate-200' : ''}`}>
                    {parseInline(cell)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Markdown({ content }) {
  const blocks = useMemo(() => {
    if (!content) return []
    const lines = content.split('\n')
    const result = []
    let i = 0
    let key = 0

    while (i < lines.length) {
      const line = lines[i]
      const t = line.trim()

      if (!t) { i++; continue }

      // Table
      if (t.startsWith('|')) {
        const tableLines = []
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim()); i++
        }
        result.push(<TableBlock key={key++} lines={tableLines} />)
        continue
      }

      // Headings
      if (t.startsWith('#### ')) {
        result.push(<h4 key={key++} className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-4 mb-1">{parseInline(t.slice(5))}</h4>)
      } else if (t.startsWith('### ') && !t.startsWith('#### ')) {
        result.push(<h3 key={key++} className="text-[15px] font-bold text-violet-700 dark:text-violet-400 mt-6 mb-2">{parseInline(t.slice(4))}</h3>)
      } else if (t.startsWith('## ') && !t.startsWith('### ')) {
        result.push(<h2 key={key++} className="text-lg font-black text-slate-900 dark:text-white mt-8 mb-3 pb-2 border-b border-slate-200 dark:border-white/10">{parseInline(t.slice(3))}</h2>)
      } else if (t.startsWith('# ') && !t.startsWith('## ')) {
        result.push(<h1 key={key++} className="text-2xl font-black text-slate-900 dark:text-white mt-8 mb-4">{parseInline(t.slice(2))}</h1>)
      }

      // HR
      else if (t === '---' || t === '***' || t === '___') {
        result.push(<hr key={key++} className="border-slate-200 dark:border-white/10 my-5" />)
      }

      // Bullet list
      else if (t.startsWith('- ') || t.startsWith('* ')) {
        const items = []
        while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
          items.push(lines[i].trim().slice(2)); i++
        }
        result.push(
          <ul key={key++} className="list-disc pl-5 space-y-1.5 my-3 text-sm text-slate-700 dark:text-slate-300 leading-5">
            {items.map((item, j) => <li key={j}>{parseInline(item)}</li>)}
          </ul>
        )
        continue
      }

      // Numbered list
      else if (/^\d+\. /.test(t)) {
        const items = []
        while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+\. /, '')); i++
        }
        result.push(
          <ol key={key++} className="list-decimal pl-5 space-y-1.5 my-3 text-sm text-slate-700 dark:text-slate-300 leading-5">
            {items.map((item, j) => <li key={j}>{parseInline(item)}</li>)}
          </ol>
        )
        continue
      }

      // Paragraph
      else {
        result.push(<p key={key++} className="text-sm text-slate-700 dark:text-slate-300 leading-6 mb-2">{parseInline(t)}</p>)
      }

      i++
    }
    return result
  }, [content])

  return <div className="strategic-view-content">{blocks}</div>
}

// ─── Asset selector ───────────────────────────────────────────────────────────

const PRESET_ASSETS = [
  { id: 'nifty50',  label: 'Nifty 50',  icon: '🇮🇳' },
  { id: 'sp500',    label: 'S&P 500',   icon: '🇺🇸' },
  { id: 'nasdaq',   label: 'Nasdaq',    icon: '💻' },
  { id: 'gold',     label: 'Gold',      icon: '🥇' },
  { id: 'crudeoil', label: 'Crude Oil', icon: '🛢️' },
  { id: 'bitcoin',  label: 'Bitcoin',   icon: '₿' },
  { id: 'usd',      label: 'US Dollar', icon: '💵' },
]

// ─── Saved views sidebar component ───────────────────────────────────────────

function SavedDrawer({ views, onLoad, onDelete, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-sm bg-white dark:bg-[#0c1420] border-l border-slate-200 dark:border-white/10 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">Saved Views ({views.length})</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {views.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No saved views yet</p>
          ) : (
            views.map(v => (
              <div key={v.id} className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-slate-900 dark:text-white font-semibold text-sm">{v.asset}</span>
                  <button onClick={() => onDelete(v.id)}
                    className="text-slate-400 hover:text-rose-500 transition-colors flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                  {new Date(v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <button onClick={() => { onLoad(v); onClose() }}
                  className="w-full text-xs font-semibold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-500/30 rounded-lg py-1.5 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
                  Load View
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StrategicViewPage() {
  const [selected, setSelected]   = useState('')         // preset id
  const [custom, setCustom]       = useState('')         // custom asset text
  const [content, setContent]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState('')
  const [currentAsset, setCurrentAsset] = useState('')
  const [isCached, setIsCached]   = useState(false)
  const [generatedAt, setGeneratedAt] = useState(null)  // Redis timestamp (ms)
  const [savedViews, setSavedViews] = useState([])
  const [showDrawer, setShowDrawer] = useState(false)
  const [saveTick, setSaveTick]   = useState(false)
  const [sampleNifty, setSampleNifty]     = useState(null)  // { content, generatedAt } or plain string
  const [sampleGold, setSampleGold]       = useState(null)
  const [session, setSession]             = useState(undefined)  // undefined = loading
  const [sampleSaved, setSampleSaved]     = useState(false)
  const [loginRequired, setLoginRequired] = useState(false)
  const [limitReached, setLimitReached]   = useState(false)
  // Manual context form
  const [showContext, setShowContext] = useState(false)
  const [userPrice, setUserPrice] = useState('')
  const [userMacro, setUserMacro] = useState('')
  const outputRef = useRef(null)
  const abortRef  = useRef(null)

  useEffect(() => {
    setSavedViews(loadSaved())
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setSession(d.user ?? null))
      .catch(() => setSession(null))
    fetch('/api/investing/sample?type=strategic-view&asset=nifty')
      .then(r => r.json())
      .then(d => { if (d.sample) setSampleNifty(d.sample) })
      .catch(() => {})
    fetch('/api/investing/sample?type=strategic-view&asset=gold')
      .then(r => r.json())
      .then(d => { if (d.sample) setSampleGold(d.sample) })
      .catch(() => {})
  }, [])

  const activeAsset = useMemo(() => {
    if (custom.trim()) return custom.trim()
    return PRESET_ASSETS.find(a => a.id === selected)?.label || ''
  }, [selected, custom])

  const generate = useCallback(async (refresh = false) => {
    const asset = activeAsset
    if (!asset) return
    setLoading(true); setContent(''); setDone(false); setError(''); setIsCached(false); setGeneratedAt(null); setLoginRequired(false); setLimitReached(false); setSampleSaved(false); setSaveTick(false)
    setCurrentAsset(asset)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/investing/strategic-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, refresh, userPrice: userPrice.trim(), userMacro: userMacro.trim() }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        if (res.status === 401) { setLoginRequired(true); return }
        const err = await res.json().catch(() => ({}))
        if (err.limitReached) { setLimitReached(true); return }
        throw new Error(err.error || `Error ${res.status}`)
      }

      const ct = res.headers.get('content-type') || ''

      // Cached response — comes back as JSON
      if (ct.includes('application/json')) {
        const data = await res.json()
        setContent(data.content)
        setIsCached(true)
        setGeneratedAt(data.generatedAt || null)
        setDone(true)
        return
      }

      // Streaming response — grab timestamp from header
      const xGenAt = res.headers.get('x-generated-at')
      if (xGenAt) setGeneratedAt(Number(xGenAt))

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ''

      while (true) {
        const { done: doneChunk, value } = await reader.read()
        if (doneChunk) break
        text += decoder.decode(value, { stream: true })
        setContent(text)
      }

      setDone(true)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Generation failed')
    } finally {
      setLoading(false)
    }
  }, [activeAsset, userPrice, userMacro])

  // Auto-scroll output as it streams
  useEffect(() => {
    if (loading && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [content, loading])

  async function setAsSample() {
    if (!content || !currentAsset) return
    // Determine asset key from currentAsset label
    const assetKey = currentAsset.toLowerCase().includes('gold') ? 'gold' : 'nifty'
    await fetch('/api/investing/sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'strategic-view', asset: assetKey, data: { content, generatedAt: Date.now() } }),
    })
    const sampleObj = { content, generatedAt: Date.now() }
    if (assetKey === 'gold') setSampleGold(sampleObj)
    else setSampleNifty(sampleObj)
    setSampleSaved(true)
  }

  function saveView() {
    const views = loadSaved()
    const entry = { id: Date.now().toString(), asset: currentAsset, content, createdAt: new Date().toISOString() }
    const updated = [entry, ...views.filter(v => v.asset !== currentAsset)].slice(0, MAX_SAVED)
    saveToDisk(updated)
    setSavedViews(updated)
    setSaveTick(true)
  }

  function deleteView(id) {
    const updated = savedViews.filter(v => v.id !== id)
    saveToDisk(updated)
    setSavedViews(updated)
  }

  function loadView(v) {
    setCurrentAsset(v.asset)
    setContent(v.content)
    setDone(true)
    setIsCached(false)
    // Match selection UI
    const preset = PRESET_ASSETS.find(a => a.label === v.asset)
    if (preset) { setSelected(preset.id); setCustom('') }
    else { setCustom(v.asset); setSelected('') }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />

      {showDrawer && (
        <SavedDrawer
          views={savedViews}
          onLoad={loadView}
          onDelete={deleteView}
          onClose={() => setShowDrawer(false)}
        />
      )}

      <div className="max-w-4xl mx-auto px-6 pt-12 pb-24">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-8">
          <Link href="/investing" className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-400 transition-colors">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>
            Investing
          </Link>
          <span>/</span>
          <span className="text-slate-600 dark:text-slate-400">Connect the Dots</span>
        </div>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700/50 px-2 py-0.5 rounded-full">AI Macro</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black mb-2">Connect the Dots</h1>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-6 max-w-xl">
                Multi-horizon strategic view synthesising macro, geopolitics, AI disruption, demographics, and energy dynamics across 3M to 10Y horizons.
              </p>
            </div>
            {session && savedViews.length > 0 && (
              <button onClick={() => setShowDrawer(true)}
                className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-violet-300 dark:hover:border-violet-500/50 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                Saved ({savedViews.length})
              </button>
            )}
          </div>
        </div>

        {/* Asset selector — only for Pro/admin users */}
        {(session?.role === 'admin' || session?.role === 'trader') && (
          <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 mb-6">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Select Asset</p>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-5">
              {PRESET_ASSETS.map(a => (
                <button key={a.id}
                  onClick={() => { setSelected(a.id); setCustom('') }}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-semibold transition-all ${
                    selected === a.id && !custom
                      ? 'bg-violet-50 dark:bg-violet-500/15 border-violet-400 dark:border-violet-500/60 text-violet-700 dark:text-violet-300 shadow-sm'
                      : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/8 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20 hover:text-slate-900 dark:hover:text-white'
                  }`}>
                  <span className="text-lg leading-none">{a.icon}</span>
                  <span className="leading-tight text-center">{a.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Or type any asset — Gold, EUR/USD, Copper, Sensex, TSMC…"
                  value={custom}
                  onChange={e => { setCustom(e.target.value); if (e.target.value) setSelected('') }}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-violet-400 dark:focus:border-violet-500/60 transition-colors"
                />
              </div>
              <button
                onClick={() => generate(false)}
                disabled={!activeAsset || loading}
                className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors">
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Analysing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Generate View
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Free user asset selector — Nifty + Crude enabled, rest locked */}
        {session?.role === 'user' && (
          <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Select Asset</p>
              <span className="text-[10px] font-bold tracking-widest uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-2 py-0.5 rounded-full">Free — Nifty &amp; Crude only</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-5">
              {PRESET_ASSETS.map(a => {
                const FREE_ASSETS = ['nifty50', 'crudeoil']
                const allowed = FREE_ASSETS.includes(a.id)
                return (
                  <button key={a.id}
                    onClick={() => allowed && (setSelected(a.id), setCustom(''))}
                    disabled={!allowed}
                    className={`relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-semibold transition-all ${
                      allowed
                        ? selected === a.id && !custom
                          ? 'bg-violet-50 dark:bg-violet-500/15 border-violet-400 dark:border-violet-500/60 text-violet-700 dark:text-violet-300 shadow-sm'
                          : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/8 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20 hover:text-slate-900 dark:hover:text-white'
                        : 'bg-slate-50 dark:bg-white/[0.015] border-slate-100 dark:border-white/5 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    }`}>
                    <span className={`text-lg leading-none ${!allowed ? 'opacity-30' : ''}`}>{a.icon}</span>
                    <span className="leading-tight text-center">{a.label}</span>
                    {!allowed && (
                      <span className="absolute top-1 right-1 text-[8px] font-bold text-slate-400 dark:text-slate-600">Pro</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => generate(false)}
                disabled={!selected || loading || !['nifty50', 'crudeoil'].includes(selected)}
                className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors">
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Analysing…
                  </>
                ) : 'Generate View'}
              </button>
              <p className="text-xs text-slate-400 dark:text-slate-600">Upgrade to Pro for all 7 assets + custom symbols</p>
            </div>
          </div>
        )}

        {/* Additional context (collapsible) — Pro only */}
        {(session?.role === 'admin' || session?.role === 'trader') && <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl mb-6 overflow-hidden">
          <button
            onClick={() => setShowContext(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors group">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Additional Context</span>
              {(userPrice.trim() || userMacro.trim()) && (
                <span className="text-[9px] font-bold tracking-widest uppercase text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700/50 px-1.5 py-0.5 rounded-full">Active</span>
              )}
            </div>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${showContext ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showContext && (
            <div className="px-5 pb-5 border-t border-slate-100 dark:border-white/8 pt-4 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-5">
                Provide current context for assets where auto-fetch is unavailable, or override with more precise data. This is injected directly into the AI prompt.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                    Current Price
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. $82.50 or ₹24,500"
                    value={userPrice}
                    onChange={e => setUserPrice(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-violet-400 dark:focus:border-violet-500/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                    Macro Regime Context
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Fed on hold, US 10Y at 4.3%, DXY at 104"
                    value={userMacro}
                    onChange={e => setUserMacro(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-violet-400 dark:focus:border-violet-500/60 transition-colors"
                  />
                </div>
              </div>
              {(userPrice.trim() || userMacro.trim()) && (
                <button
                  onClick={() => { setUserPrice(''); setUserMacro('') }}
                  className="text-xs text-slate-400 hover:text-rose-500 transition-colors">
                  Clear context
                </button>
              )}
            </div>
          )}
        </div>}

        {/* Guest CTA */}
        {session === null && (
          <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-8 text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-slate-900 dark:text-white font-bold mb-1">Login to generate strategic views</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">Free account — see Nifty &amp; Gold samples. Pro — generate for any asset.</p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/login" className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-colors">Create free account →</Link>
              <Link href="/login" className="px-5 py-2.5 border border-slate-200 dark:border-white/10 hover:border-violet-400 dark:hover:border-violet-500/40 text-slate-600 dark:text-slate-400 text-sm font-semibold rounded-xl transition-colors">Sign in</Link>
            </div>
          </div>
        )}

        {/* Free user upgrade CTA */}
        {session?.role === 'user' && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700/30 rounded-2xl p-4 flex items-center gap-4 mb-6">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Pro — Generate for any asset</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">Free account shows pre-generated Nifty &amp; Gold samples. Upgrade for S&amp;P 500, Bitcoin, Crude Oil, and custom assets.</p>
            </div>
            <Link href="/pricing" className="flex-shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap">Upgrade →</Link>
          </div>
        )}

        {/* Login required */}
        {loginRequired && (
          <div className="bg-violet-950/40 border border-violet-500/20 rounded-2xl p-6 flex flex-col items-center text-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-sm mb-1">Login to Generate</p>
              <p className="text-slate-400 text-xs mb-4">Create a free account to run strategic views for any asset. No credit card needed.</p>
              <div className="flex items-center justify-center gap-3">
                <Link href="/login" className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-colors">Create free account →</Link>
                <Link href="/login" className="px-4 py-2 border border-white/10 hover:border-white/20 text-slate-300 text-xs font-semibold rounded-lg transition-colors">Sign in</Link>
              </div>
            </div>
          </div>
        )}

        {/* Daily limit reached */}
        {limitReached && (
          <div className="bg-violet-950/40 border border-violet-500/20 rounded-2xl p-6 flex flex-col items-center text-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div>
              <p className="text-white font-bold text-sm mb-1">Daily Limit Reached</p>
              <p className="text-amber-400 text-xs font-semibold mb-2">You've used all 3 strategic views for today.</p>
              <p className="text-slate-400 text-xs mb-4">Upgrade to Pro for unlimited analysis. Resets at midnight IST.</p>
              <Link href="/pricing" className="inline-block px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-colors">View Plans →</Link>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-5 mb-6">
            <p className="text-rose-600 dark:text-rose-400 font-semibold text-sm mb-1">Generation failed</p>
            <p className="text-rose-500 dark:text-rose-500 text-xs">{error}</p>
          </div>
        )}

        {/* Sample strategic views — shown to guests and free users */}
        {(session === null || session?.role === 'user') && !content && !loading && (
          <div className="space-y-8 mb-8">
            {[
              { key: 'nifty', label: 'Nifty 50', raw: sampleNifty },
              { key: 'gold',  label: 'Gold',     raw: sampleGold  },
            ].filter(s => s.raw).map(s => {
              const isObj = s.raw && typeof s.raw === 'object'
              const mdContent = isObj ? s.raw.content : s.raw
              const ts = isObj ? s.raw.generatedAt : null
              return (
              <div key={s.key}>
                <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 md:p-8">
                  <div className="flex items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100 dark:border-white/8">
                    <div>
                      <h2 className="text-xl font-black text-slate-900 dark:text-white">
                        {s.label} — Real Analysis Data{ts ? ` · ${new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">As it will look · Strategic View</p>
                    </div>
                  </div>
                  <Markdown content={mdContent} />
                </div>
              </div>
            )})}

          </div>
        )}

        {/* Output */}
        {(content || loading) && (
          <div ref={outputRef} className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 md:p-8">

            {/* Output header */}
            <div className="flex items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100 dark:border-white/8">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">{currentAsset}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center flex-wrap gap-1.5">
                  <span>Strategic View</span>
                  {generatedAt && !loading && (
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      · Generated {timeAgo(generatedAt)}
                    </span>
                  )}
                  {isCached && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">Cached</span>}
                  {loading && <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400"><span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />Generating…</span>}
                </p>
              </div>
              {done && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={saveView}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                      saveTick
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-violet-300 dark:hover:border-violet-500/50 hover:text-violet-600 dark:hover:text-violet-400'
                    }`}>
                    <svg className="w-3.5 h-3.5" fill={saveTick ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    {saveTick ? 'Saved!' : 'Save'}
                  </button>
                  <button
                    onClick={() => generate(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerate
                  </button>
                  {session?.role === 'admin' && (
                    <button
                      onClick={setAsSample}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        sampleSaved
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400'
                          : 'border-dashed border-slate-300 dark:border-white/20 text-slate-500 dark:text-slate-500 hover:border-violet-400 dark:hover:border-violet-500/50 hover:text-violet-600 dark:hover:text-violet-400'
                      }`}>
                      {sampleSaved ? '✓ Saved as sample' : '⚙ Set as sample'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Streaming markdown content */}
            <Markdown content={content} />

            {/* Streaming cursor */}
            {loading && (
              <span className="inline-block w-0.5 h-4 bg-violet-500 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}

        {/* Empty state — only for Pro users who haven't generated yet */}
        {!content && !loading && !error && (session?.role === 'admin' || session?.role === 'trader') && (
          <div className="text-center py-16 text-slate-400 dark:text-slate-600">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium mb-1">Select an asset and generate</p>
            <p className="text-xs">A multi-horizon strategic view across macro, geopolitics, AI, demographics, and energy will be built for you.</p>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-8 leading-5">
          AI-generated strategic analysis for educational purposes only. Not financial advice.<br />
          Always do your own research before investing. <Link href="/disclaimer" className="underline underline-offset-2 hover:text-slate-500 dark:hover:text-slate-500 transition-colors">Read full disclaimer →</Link>
        </p>
      </div>
    </div>
  )
}
