'use client'

import { useState, useRef, useCallback } from 'react'
import Nav from '../../components/Nav'
import Link from 'next/link'

const VERDICT_CONFIG = {
  'STRONG BUY': { color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-700/50', dot: 'bg-emerald-400' },
  'BUY':        { color: 'text-green-400',   bg: 'bg-green-900/30 border-green-700/50',     dot: 'bg-green-400'   },
  'NEUTRAL':    { color: 'text-amber-400',   bg: 'bg-amber-900/30 border-amber-700/50',     dot: 'bg-amber-400'   },
  'AVOID':      { color: 'text-orange-400',  bg: 'bg-orange-900/30 border-orange-700/50',   dot: 'bg-orange-400'  },
  'SELL':       { color: 'text-rose-400',    bg: 'bg-rose-900/30 border-rose-700/50',       dot: 'bg-rose-400'    },
}

const RS_CONFIG = {
  'Outperforming': { color: 'text-emerald-400', icon: '↑' },
  'In-line':       { color: 'text-amber-400',   icon: '→' },
  'Underperforming': { color: 'text-rose-400',  icon: '↓' },
}

const SENTIMENT_CONFIG = {
  'Bullish':             { color: 'text-emerald-400' },
  'Cautiously Bullish':  { color: 'text-green-400'   },
  'Neutral':             { color: 'text-amber-400'   },
  'Cautiously Bearish':  { color: 'text-orange-400'  },
  'Bearish':             { color: 'text-rose-400'    },
}

function ScoreBar({ score }) {
  const pct = (score / 10) * 100
  const color = score >= 7 ? 'bg-emerald-500' : score >= 5 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-white tabular-nums">{score}/10</span>
    </div>
  )
}

function Tag({ label, color = 'text-slate-400', bg = 'bg-white/5 border-white/10' }) {
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg border ${color} ${bg}`}>
      {label}
    </span>
  )
}

function Section({ title, icon, children }) {
  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-slate-500">{icon}</span>
        <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-slate-400">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function AnalysisPanel({ analysis }) {
  const vc = VERDICT_CONFIG[analysis.verdict?.rating] || VERDICT_CONFIG['NEUTRAL']
  const rsc = RS_CONFIG[analysis.relativeStrength?.vsNifty] || {}
  const sc = SENTIMENT_CONFIG[analysis.sentiment?.overall] || {}

  return (
    <div className="space-y-4">

      {/* Verdict card */}
      <div className={`rounded-2xl border p-5 ${vc.bg}`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${vc.dot}`} />
              <span className={`text-lg font-black tracking-wide ${vc.color}`}>{analysis.verdict?.rating}</span>
            </div>
            {analysis.ticker && analysis.ticker !== 'Unknown' && (
              <p className="text-white font-bold text-base">{analysis.ticker}
                {analysis.timeframe && <span className="text-slate-500 text-sm font-normal ml-2">· {analysis.timeframe}</span>}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Score</p>
            <p className={`text-3xl font-black ${vc.color}`}>{analysis.verdict?.score}<span className="text-slate-600 text-lg">/10</span></p>
          </div>
        </div>
        <ScoreBar score={analysis.verdict?.score || 5} />
        <p className="text-slate-300 text-sm leading-6 mt-3">{analysis.verdict?.summary}</p>
      </div>

      {/* Grid: Technical + RS + Sector */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Technical */}
        <Section title="Technical Structure" icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
        }>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {analysis.technical?.trend && <Tag label={analysis.technical.trend} color="text-blue-400" bg="bg-blue-900/20 border-blue-800/40" />}
              {analysis.technical?.stage && <Tag label={analysis.technical.stage} color="text-slate-300" bg="bg-white/5 border-white/10" />}
              {analysis.technical?.strength && (
                <Tag
                  label={analysis.technical.strength}
                  color={analysis.technical.strength === 'Strong' ? 'text-emerald-400' : analysis.technical.strength === 'Weak' ? 'text-rose-400' : 'text-amber-400'}
                  bg={analysis.technical.strength === 'Strong' ? 'bg-emerald-900/20 border-emerald-800/40' : analysis.technical.strength === 'Weak' ? 'bg-rose-900/20 border-rose-800/40' : 'bg-amber-900/20 border-amber-800/40'}
                />
              )}
            </div>
            {analysis.technical?.patterns?.length > 0 && (
              <div>
                <p className="text-slate-600 text-[10px] uppercase tracking-widest mb-1.5">Patterns</p>
                <ul className="space-y-1">
                  {analysis.technical.patterns.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-blue-500 mt-0.5 flex-shrink-0">·</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.technical?.keyLevels && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-emerald-600 uppercase tracking-widest mb-0.5">Support</p>
                  <p className="text-sm font-semibold text-emerald-300">{analysis.technical.keyLevels.support}</p>
                </div>
                <div className="bg-rose-900/20 border border-rose-800/30 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-rose-600 uppercase tracking-widest mb-0.5">Resistance</p>
                  <p className="text-sm font-semibold text-rose-300">{analysis.technical.keyLevels.resistance}</p>
                </div>
              </div>
            )}
            {analysis.technical?.movingAverages && (
              <p className="text-slate-400 text-xs leading-5">{analysis.technical.movingAverages}</p>
            )}
            {analysis.technical?.volume && (
              <p className="text-slate-500 text-xs leading-5 border-t border-white/5 pt-2">{analysis.technical.volume}</p>
            )}
          </div>
        </Section>

        {/* RS + Sector stacked */}
        <div className="space-y-4">
          <Section title="Relative Strength" icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">vs Nifty 50</span>
                <span className={`font-bold text-sm ${rsc.color || 'text-slate-300'}`}>
                  {rsc.icon} {analysis.relativeStrength?.vsNifty}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">RS Trend</span>
                <span className="text-slate-300 text-sm font-semibold">{analysis.relativeStrength?.trend}</span>
              </div>
              {analysis.relativeStrength?.notes && (
                <p className="text-slate-400 text-xs leading-5 pt-1 border-t border-white/5">{analysis.relativeStrength.notes}</p>
              )}
            </div>
          </Section>

          <Section title="Sector View" icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">Sector</span>
                <span className="text-slate-200 text-sm font-semibold">{analysis.sector?.likely}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">Position</span>
                <Tag
                  label={analysis.sector?.position}
                  color={analysis.sector?.position === 'Leading' ? 'text-emerald-400' : analysis.sector?.position === 'Lagging' ? 'text-rose-400' : 'text-amber-400'}
                  bg={analysis.sector?.position === 'Leading' ? 'bg-emerald-900/20 border-emerald-800/40' : analysis.sector?.position === 'Lagging' ? 'bg-rose-900/20 border-rose-800/40' : 'bg-amber-900/20 border-amber-800/40'}
                />
              </div>
              {analysis.sector?.notes && (
                <p className="text-slate-400 text-xs leading-5 pt-1 border-t border-white/5">{analysis.sector.notes}</p>
              )}
            </div>
          </Section>
        </div>
      </div>

      {/* Sentiment */}
      <Section title="Sentiment" icon={
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      }>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={`text-base font-black ${sc.color || 'text-slate-300'}`}>{analysis.sentiment?.overall}</span>
          </div>
          {analysis.sentiment?.institutionalClues && (
            <div className="bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2">
              <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Institutional Footprint</p>
              <p className="text-slate-300 text-sm">{analysis.sentiment.institutionalClues}</p>
            </div>
          )}
          {analysis.sentiment?.notes && (
            <p className="text-slate-400 text-sm leading-6">{analysis.sentiment.notes}</p>
          )}
        </div>
      </Section>

      {/* Story */}
      <Section title="The Story" icon={
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      }>
        <div className="space-y-4">
          {analysis.story?.theme && (
            <p className="text-white font-bold text-base leading-snug">"{analysis.story.theme}"</p>
          )}
          {analysis.story?.narrative && (
            <p className="text-slate-300 text-sm leading-6">{analysis.story.narrative}</p>
          )}
          {analysis.story?.horizon && (
            <div className="flex items-center gap-2">
              <span className="text-slate-600 text-xs">Horizon</span>
              <Tag label={analysis.story.horizon} color="text-violet-400" bg="bg-violet-900/20 border-violet-800/40" />
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4 pt-1">
            {analysis.story?.positives?.length > 0 && (
              <div>
                <p className="text-emerald-600 text-[10px] uppercase tracking-widest mb-2">Positives</p>
                <ul className="space-y-1.5">
                  {analysis.story.positives.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-emerald-500 mt-0.5 flex-shrink-0">+</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.story?.negatives?.length > 0 && (
              <div>
                <p className="text-rose-600 text-[10px] uppercase tracking-widest mb-2">Risks</p>
                <ul className="space-y-1.5">
                  {analysis.story.negatives.map((n, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-rose-500 mt-0.5 flex-shrink-0">−</span>{n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Watch For */}
      {analysis.watchFor?.length > 0 && (
        <Section title="Watch For" icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        }>
          <ul className="space-y-2">
            {analysis.watchFor.map((w, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-300 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2.5">
                <span className="text-violet-500 font-bold flex-shrink-0">{i + 1}</span>{w}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Disclaimer */}
      <p className="text-slate-700 text-xs text-center leading-5 pt-2">
        AI analysis for educational purposes only. Not investment advice. Always do your own research.
      </p>
    </div>
  )
}

export default function ChartAnalyserPage() {
  const [image, setImage] = useState(null)        // base64 string
  const [mediaType, setMediaType] = useState('image/jpeg')
  const [preview, setPreview] = useState(null)    // object URL for display
  const [timeframe, setTimeframe] = useState('Daily')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  const processFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, WebP)')
      return
    }
    setError('')
    setAnalysis(null)
    setPreview(URL.createObjectURL(file))

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1200
        const scale = img.width > MAX ? MAX / img.width : 1
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const resized = canvas.toDataURL('image/jpeg', 0.85)
        setMediaType('image/jpeg')
        setImage(resized.split(',')[1])
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }, [])

  function onFileChange(e) {
    processFile(e.target.files[0])
    e.target.value = ''
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    processFile(e.dataTransfer.files[0])
  }

  function onPaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        processFile(item.getAsFile())
        break
      }
    }
  }

  async function analyse() {
    if (!image) return
    setLoading(true)
    setError('')
    setAnalysis(null)

    try {
      const res = await fetch('/api/investing/chart-analyser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, mediaType, timeframe }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setAnalysis(data.analysis)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setImage(null)
    setPreview(null)
    setAnalysis(null)
    setError('')
  }

  return (
    <div className="min-h-screen bg-[#060b14]" onPaste={onPaste}>
      <Nav />

      <div className="max-w-4xl mx-auto px-6 pt-12 pb-20">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-600 mb-8">
          <Link href="/investing" className="hover:text-slate-400 transition-colors">Investing</Link>
          <span>/</span>
          <span className="text-slate-400">Chart Analyser</span>
        </div>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-violet-400 bg-violet-900/30 border border-violet-800/50 px-2 py-0.5 rounded-full">AI Vision</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Chart Analyser</h1>
          <p className="text-slate-400 text-sm leading-6">
            Paste or upload any daily / weekly chart. AI analyses technical structure, relative strength vs Nifty, sector position, market sentiment, and builds a medium to long-term story.
          </p>
        </div>

        {!analysis ? (
          <div className="space-y-5">
            {/* Upload zone */}
            <div
              className={`relative border-2 border-dashed rounded-2xl transition-all cursor-pointer
                ${dragging ? 'border-violet-500 bg-violet-500/10' : image ? 'border-white/20 bg-white/[0.02]' : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'}`}
              onClick={() => !image && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              {preview ? (
                <div className="relative p-3">
                  <img src={preview} alt="Chart preview" className="w-full max-h-[420px] object-contain rounded-xl" />
                  <button
                    onClick={(e) => { e.stopPropagation(); reset() }}
                    className="absolute top-5 right-5 bg-black/70 hover:bg-black text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold transition-colors"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-violet-900/30 border border-violet-800/50 flex items-center justify-center mb-5">
                    <svg className="w-7 h-7 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-white font-semibold mb-1">Drop your chart here</p>
                  <p className="text-slate-500 text-sm mb-4">or click to browse · <kbd className="text-slate-600 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-xs">⌘V</kbd> to paste</p>
                  <p className="text-slate-700 text-xs">PNG, JPG, WebP · Daily or Weekly chart recommended</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            </div>

            {/* Timeframe + Analyse */}
            <div className="flex items-center gap-3">
              <div className="flex bg-white/[0.04] border border-white/10 rounded-xl p-1 gap-1">
                {['Daily', 'Weekly'].map(tf => (
                  <button key={tf} onClick={() => setTimeframe(tf)}
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                      timeframe === tf ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}>
                    {tf}
                  </button>
                ))}
              </div>
              <button
                onClick={analyse}
                disabled={!image || loading}
                className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl py-3 text-sm transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analysing chart…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Analyse Chart
                  </>
                )}
              </button>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6 text-center">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-slate-300 text-sm font-semibold">Reading chart structure…</p>
                <p className="text-slate-600 text-xs mt-1">Technical patterns · Relative strength · Sector view · Story</p>
              </div>
            )}

            {error && (
              <div className="bg-rose-950/30 border border-rose-800/50 rounded-2xl p-4 text-rose-400 text-sm">
                {error}
              </div>
            )}

            {/* Hint */}
            {!image && !loading && (
              <div className="grid grid-cols-3 gap-3 pt-2">
                {[
                  { label: 'Take screenshot', sub: 'From TradingView or any charting app' },
                  { label: 'Paste directly', sub: '⌘V after copying a screenshot' },
                  { label: 'Daily or Weekly', sub: 'Best for positional analysis' },
                ].map(h => (
                  <div key={h.label} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-center">
                    <p className="text-slate-300 text-xs font-semibold mb-0.5">{h.label}</p>
                    <p className="text-slate-600 text-xs">{h.sub}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Chart preview strip */}
            {preview && (
              <div className="mb-6 rounded-2xl overflow-hidden border border-white/10">
                <img src={preview} alt="Analysed chart" className="w-full max-h-48 object-contain bg-black/40" />
              </div>
            )}

            <AnalysisPanel analysis={analysis} />

            {/* Analyse another */}
            <button
              onClick={reset}
              className="mt-6 w-full border border-white/10 hover:border-violet-500/40 text-slate-400 hover:text-white font-semibold rounded-xl py-3 text-sm transition-all"
            >
              Analyse another chart →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
