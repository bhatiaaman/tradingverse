'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Nav from '../../components/Nav'
import Link from 'next/link'
import posthog from 'posthog-js'

const VERDICT_CONFIG = {
  'STRONG BUY': { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700/50', dot: 'bg-emerald-500' },
  'BUY':        { color: 'text-green-600 dark:text-green-400',     bg: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700/50',         dot: 'bg-green-500'   },
  'NEUTRAL':    { color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/50',         dot: 'bg-amber-500'   },
  'AVOID':      { color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700/50',     dot: 'bg-orange-500'  },
  'SELL':       { color: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-700/50',             dot: 'bg-rose-500'    },
}

const RS_CONFIG = {
  'Outperforming':   { color: 'text-emerald-600 dark:text-emerald-400', icon: '↑' },
  'In-line':         { color: 'text-amber-600 dark:text-amber-400',     icon: '→' },
  'Underperforming': { color: 'text-rose-600 dark:text-rose-400',       icon: '↓' },
}

const SENTIMENT_CONFIG = {
  'Bullish':             { color: 'text-emerald-600 dark:text-emerald-400' },
  'Cautiously Bullish':  { color: 'text-green-600 dark:text-green-400'     },
  'Neutral':             { color: 'text-amber-600 dark:text-amber-400'     },
  'Cautiously Bearish':  { color: 'text-orange-600 dark:text-orange-400'   },
  'Bearish':             { color: 'text-rose-600 dark:text-rose-400'       },
}

function ScoreBar({ score }) {
  const pct = (score / 10) * 100
  const color = score >= 7 ? 'bg-emerald-500' : score >= 5 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">{score}/10</span>
    </div>
  )
}

function Tag({ label, color = 'text-slate-600 dark:text-slate-400', bg = 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10' }) {
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg border ${color} ${bg}`}>
      {label}
    </span>
  )
}

function Section({ title, icon, children }) {
  return (
    <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400">{title}</h3>
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
              <p className="text-slate-900 dark:text-white font-bold text-base">{analysis.ticker}
                {analysis.timeframe && <span className="text-slate-500 text-sm font-normal ml-2">· {analysis.timeframe}</span>}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Score</p>
            <p className={`text-3xl font-black ${vc.color}`}>{analysis.verdict?.score}<span className="text-slate-400 dark:text-slate-600 text-lg">/10</span></p>
          </div>
        </div>
        <ScoreBar score={analysis.verdict?.score || 5} />
        <p className="text-slate-700 dark:text-slate-300 text-sm leading-6 mt-3">{analysis.verdict?.summary}</p>
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
                <p className="text-slate-400 dark:text-slate-600 text-[10px] uppercase tracking-widest mb-1.5">Patterns</p>
                <ul className="space-y-1">
                  {analysis.technical.patterns.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <span className="text-blue-500 mt-0.5 flex-shrink-0">·</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.technical?.keyLevels && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-emerald-600 uppercase tracking-widest mb-0.5">Support</p>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{analysis.technical.keyLevels.support}</p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/30 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-rose-600 uppercase tracking-widest mb-0.5">Resistance</p>
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{analysis.technical.keyLevels.resistance}</p>
                </div>
              </div>
            )}
            {analysis.technical?.movingAverages && (
              <p className="text-slate-600 dark:text-slate-400 text-xs leading-5">{analysis.technical.movingAverages}</p>
            )}
            {analysis.technical?.volume && (
              <p className="text-slate-500 text-xs leading-5 border-t border-slate-100 dark:border-white/5 pt-2">{analysis.technical.volume}</p>
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
                <span className={`font-bold text-sm ${rsc.color || 'text-slate-700 dark:text-slate-300'}`}>
                  {rsc.icon} {analysis.relativeStrength?.vsNifty}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">RS Trend</span>
                <span className="text-slate-700 dark:text-slate-300 text-sm font-semibold">{analysis.relativeStrength?.trend}</span>
              </div>
              {analysis.relativeStrength?.notes && (
                <p className="text-slate-600 dark:text-slate-400 text-xs leading-5 pt-1 border-t border-slate-100 dark:border-white/5">{analysis.relativeStrength.notes}</p>
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
                <span className="text-slate-800 dark:text-slate-200 text-sm font-semibold">{analysis.sector?.likely}</span>
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
                <p className="text-slate-600 dark:text-slate-400 text-xs leading-5 pt-1 border-t border-slate-100 dark:border-white/5">{analysis.sector.notes}</p>
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
            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2">
              <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-1">Institutional Footprint</p>
              <p className="text-slate-700 dark:text-slate-300 text-sm">{analysis.sentiment.institutionalClues}</p>
            </div>
          )}
          {analysis.sentiment?.notes && (
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-6">{analysis.sentiment.notes}</p>
          )}
        </div>
      </Section>

      {/* Institutional */}
      {analysis.institutional && (
        <Section title="Institutional Activity" icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2">
                <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-1">FII Signal</p>
                <p className={`text-sm font-bold ${
                  analysis.institutional.fiiSignal === 'Buying' ? 'text-emerald-600 dark:text-emerald-400' :
                  analysis.institutional.fiiSignal === 'Selling' ? 'text-rose-600 dark:text-rose-400' :
                  'text-amber-600 dark:text-amber-400'
                }`}>{analysis.institutional.fiiSignal}</p>
              </div>
              <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2">
                <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-1">MF Signal</p>
                <p className={`text-sm font-bold ${
                  analysis.institutional.mfSignal === 'Accumulating' ? 'text-emerald-600 dark:text-emerald-400' :
                  analysis.institutional.mfSignal === 'Distributing' ? 'text-rose-600 dark:text-rose-400' :
                  'text-amber-600 dark:text-amber-400'
                }`}>{analysis.institutional.mfSignal}</p>
              </div>
            </div>
            {analysis.institutional.holdingTrend && analysis.institutional.holdingTrend !== 'Unknown' && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">Holding Trend</span>
                <span className={`text-sm font-semibold ${
                  analysis.institutional.holdingTrend === 'Increasing' ? 'text-emerald-600 dark:text-emerald-400' :
                  analysis.institutional.holdingTrend === 'Decreasing' ? 'text-rose-600 dark:text-rose-400' :
                  'text-slate-700 dark:text-slate-300'
                }`}>{analysis.institutional.holdingTrend}</span>
              </div>
            )}
            {analysis.institutional.smartMoneyClue && (
              <p className="text-slate-600 dark:text-slate-400 text-xs leading-5 pt-1 border-t border-slate-100 dark:border-white/5">{analysis.institutional.smartMoneyClue}</p>
            )}
          </div>
        </Section>
      )}

      {/* Story */}
      <Section title="The Story" icon={
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      }>
        <div className="space-y-4">
          {analysis.story?.theme && (
            <p className="text-slate-900 dark:text-white font-bold text-base leading-snug">"{analysis.story.theme}"</p>
          )}
          {analysis.story?.narrative && (
            <p className="text-slate-700 dark:text-slate-300 text-sm leading-6">{analysis.story.narrative}</p>
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
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
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
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
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
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2.5">
                <span className="text-violet-500 font-bold flex-shrink-0">{i + 1}</span>{w}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Disclaimer */}
      <p className="text-slate-400 dark:text-slate-700 text-xs text-center leading-5 pt-2">
        AI analysis for educational purposes only. Not investment advice. Always do your own research.{' '}
        <Link href="/disclaimer" className="underline underline-offset-2 hover:text-slate-500 dark:hover:text-slate-500 transition-colors">Disclaimer →</Link>
      </p>
    </div>
  )
}

const SAVED_KEY = 'tv:chart-analyses'
const MAX_SAVED = 50

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') } catch { return [] }
}

function SavedAnalyses({ onLoad, refreshTick }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => { setItems(loadSaved()) }, [refreshTick])

  function del(id) {
    const next = items.filter(x => x.id !== id)
    localStorage.setItem(SAVED_KEY, JSON.stringify(next))
    setItems(next)
  }

  if (items.length === 0) return null

  const vc = VERDICT_CONFIG

  return (
    <div className="mt-10">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs font-bold tracking-[0.1em] uppercase text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-4">
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Saved Analyses ({items.length})
      </button>
      {open && (
        <div className="space-y-2">
          {items.map(item => {
            const cfg = vc[item.rating] || vc['NEUTRAL']
            return (
              <div key={item.id} className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{item.ticker || 'Unknown'}</span>
                    <span className={`text-xs font-semibold ${cfg.color}`}>{item.rating}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-600">{item.score}/10</span>
                    {item.timeframe && <span className="text-xs text-slate-400 dark:text-slate-600">· {item.timeframe}</span>}
                  </div>
                  {item.summary && <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{item.summary}</p>}
                  <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">{new Date(item.savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => onLoad(item.analysis)}
                    className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline">
                    View
                  </button>
                  <button onClick={() => del(item.id)}
                    className="text-xs text-slate-400 hover:text-rose-500 transition-colors">
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ChartAnalyserPage() {
  const [image, setImage] = useState(null)        // base64 string
  const [mediaType, setMediaType] = useState('image/jpeg')
  const [preview, setPreview] = useState(null)    // object URL for display
  const [timeframe, setTimeframe] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')  // 'detecting' | 'analysing'
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState('')
  const [limitReached, setLimitReached] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedTick, setSavedTick] = useState(0)
  const [sampleAnalysis, setSampleAnalysis] = useState(null)
  const [sampleDate, setSampleDate] = useState(null)
  const [analysedAt, setAnalysedAt] = useState(null)
  const [session, setSession] = useState(undefined)  // undefined = loading, null = guest
  const [sampleSaved, setSampleSaved] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setSession(d.user ?? null))
      .catch(() => setSession(null))
    fetch('/api/investing/sample?type=chart')
      .then(r => r.json())
      .then(d => {
        if (d.sample) {
          // Handle both stored shapes: { analysis: {...}, generatedAt } or direct analysis object
          const a = d.sample?.analysis ?? d.sample
          const ts = d.sample?.generatedAt ?? null
          if (a?.verdict) { setSampleAnalysis(a); setSampleDate(ts) }
        }
      })
      .catch(() => {})
  }, [])

  async function setAsSample() {
    if (!analysis) return
    await fetch('/api/investing/sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'chart', data: { analysis, generatedAt: Date.now() } }),
    })
    setSampleAnalysis(analysis)
    setSampleDate(Date.now())
    setSampleSaved(true)
  }

  function saveAnalysis() {
    if (!analysis) return
    const existing = loadSaved()
    const entry = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString(),
      ticker: analysis.ticker,
      timeframe: analysis.timeframe,
      rating: analysis.verdict?.rating,
      score: analysis.verdict?.score,
      summary: analysis.verdict?.summary,
      analysis,
    }
    // Replace existing entry for same ticker + timeframe (no duplicates)
    const deduped = existing.filter(x => !(x.ticker === entry.ticker && x.timeframe === entry.timeframe))
    const next = [entry, ...deduped].slice(0, MAX_SAVED)
    localStorage.setItem(SAVED_KEY, JSON.stringify(next))
    setSaved(true)
    setSavedTick(t => t + 1)
  }

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

  const ALLOWED_TIMEFRAMES = ['Daily', 'Weekly', 'Monthly']

  function normaliseTimeframe(raw) {
    if (!raw) return null
    const s = raw.toLowerCase()
    if (s.includes('daily') || s === '1d' || s === 'd') return 'Daily'
    if (s.includes('weekly') || s === '1w' || s === 'w') return 'Weekly'
    if (s.includes('monthly') || s === '1m' || s === 'm' || s === 'mo') return 'Monthly'
    return null
  }

  async function analyse() {
    if (!image) return
    setLoading(true)
    setError('')
    setAnalysis(null)
    setLimitReached(false)
    setSaved(false)
    setSampleSaved(false)

    try {
      // Step 1: detect timeframe (fast, cheap — 64 tokens)
      setLoadingStep('detecting')
      const detectRes = await fetch('/api/investing/chart-analyser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, mediaType, detectOnly: true }),
      })
      const detectData = await detectRes.json()
      if (!detectRes.ok) throw new Error(detectData.error || 'Timeframe detection failed')

      const detectedTf = normaliseTimeframe(detectData.timeframe)
      if (!detectedTf) {
        throw new Error(
          `This looks like a ${detectData.timeframe || 'unsupported'} chart. Only Daily, Weekly, or Monthly timeframes are supported for positional analysis. Please upload a higher timeframe chart.`
        )
      }

      // Auto-select the correct button before full analysis starts
      setTimeframe(detectedTf)

      // Step 2: full analysis
      setLoadingStep('analysing')
      const res = await fetch('/api/investing/chart-analyser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, mediaType, timeframe: detectedTf }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.limitReached || data.loginRequired) { setLimitReached(true); return }
        throw new Error(data.error || 'Analysis failed')
      }
      setLimitReached(false)
      setAnalysis(data.analysis)
      setAnalysedAt(Date.now())
      posthog.capture('chart_analysed', {
        timeframe: detectedTf,
        ticker: data.analysis?.ticker,
        verdict: data.analysis?.verdict?.rating,
        score: data.analysis?.verdict?.score,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }

  function reset() {
    setImage(null)
    setPreview(null)
    setAnalysis(null)
    setError('')
    setTimeframe(null)
    setLoadingStep('')
    setLimitReached(false)
    setAnalysedAt(null)
    setSaved(false)
    setSampleSaved(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white" onPaste={onPaste}>
      <Nav />

      <div className="max-w-4xl mx-auto px-6 pt-12 pb-20">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-8">
          <Link href="/investing" className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-400 transition-colors">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>
            Investing
          </Link>
          <span>/</span>
          <span className="text-slate-600 dark:text-slate-400">Chart Analyser</span>
        </div>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800/50 px-2 py-0.5 rounded-full">AI Vision</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Chart Analyser</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-6">
            Paste or upload any daily / weekly chart. AI analyses technical structure, relative strength vs Nifty, sector position, market sentiment, and builds a medium to long-term story.
          </p>
        </div>

        {/* Sample analysis — shown only to guests and free users */}
        {sampleAnalysis && !analysis && (session === null || session?.role === 'user') && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4 p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/40 rounded-2xl">
              <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-violet-900 dark:text-violet-200">
                  Nifty — Real Analysis Data{sampleDate ? ` · ${new Date(sampleDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </p>
                <p className="text-xs text-violet-700 dark:text-violet-400">
                  {session === null ? 'As it will look · Login to analyse your own charts. Free, 2/day.' : 'As it will look · Upload your own chart below to get this analysis.'}
                </p>
              </div>
              {session === null && (
                <Link href="/login" className="flex-shrink-0 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                  Login free
                </Link>
              )}
            </div>
            <AnalysisPanel analysis={sampleAnalysis} />
          </div>
        )}

        {/* Guest CTA — no upload interface until logged in */}
        {session === null && !analysis && (
          <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-slate-900 dark:text-white font-bold mb-1">Login to analyse your chart</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">Free account. 2 analyses per day. No credit card needed.</p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/login" className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-colors">Create free account →</Link>
              <Link href="/login" className="px-5 py-2.5 border border-slate-200 dark:border-white/10 hover:border-violet-400 dark:hover:border-violet-500/40 text-slate-600 dark:text-slate-400 text-sm font-semibold rounded-xl transition-colors">Sign in</Link>
            </div>
          </div>
        )}

        {session !== null && session !== undefined && !analysis ? (
          <div className="space-y-5">
            {/* Upload zone */}
            <div
              className={`relative border-2 border-dashed rounded-2xl transition-all cursor-pointer
                ${dragging ? 'border-violet-500 bg-violet-500/10' : image ? 'border-slate-300 dark:border-white/20 bg-white dark:bg-white/[0.02]' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/[0.04]'}`}
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
                  <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800/50 flex items-center justify-center mb-5">
                    <svg className="w-7 h-7 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-slate-900 dark:text-white font-semibold mb-1">Drop your chart here</p>
                  <p className="text-slate-500 text-sm mb-4">or click to browse · <kbd className="text-slate-500 dark:text-slate-600 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-1.5 py-0.5 rounded text-xs">⌘V</kbd> to paste</p>
                  <p className="text-slate-400 dark:text-slate-700 text-xs">PNG, JPG, WebP · Daily, Weekly, or Monthly charts only</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            </div>

            {/* Timeframe + Analyse */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl p-1 gap-1">
                  {ALLOWED_TIMEFRAMES.map(tf => (
                    <button key={tf} onClick={() => setTimeframe(tf)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                        timeframe === tf ? 'bg-violet-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}>
                      {tf}
                    </button>
                  ))}
                </div>
                {!timeframe && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-600 leading-tight">
                    Auto-detected<br />after analysis
                  </span>
                )}
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
              <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/8 rounded-2xl p-6">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                {loadingStep === 'detecting' ? (
                  <>
                    <p className="text-slate-700 dark:text-slate-300 text-sm font-semibold text-center">Detecting timeframe…</p>
                    <p className="text-slate-400 dark:text-slate-600 text-xs mt-1 text-center">Checking if chart is Daily, Weekly, or Monthly</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <span className="text-[10px] font-bold tracking-widest uppercase text-emerald-500">✓ {timeframe} chart confirmed</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 text-sm font-semibold text-center">Reading chart structure…</p>
                    <p className="text-slate-400 dark:text-slate-600 text-xs mt-1 text-center">Technical patterns · Relative strength · Sector view · Story</p>
                  </>
                )}
              </div>
            )}

            {limitReached && (
              <div className="bg-violet-950/40 border border-violet-500/20 rounded-2xl p-6 flex flex-col items-center text-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                </div>
                <div>
                  <p className="text-white font-bold text-sm mb-1">Daily Limit Reached</p>
                  <p className="text-amber-400 text-xs font-semibold mb-2">You've used both analyses for today.</p>
                  <p className="text-slate-400 text-xs mb-4">Upgrade to Pro for unlimited chart analysis. Resets at midnight IST.</p>
                  <Link href="/pricing" className="inline-block px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-colors">View Plans →</Link>
                </div>
              </div>
            )}

            {error && !limitReached && (
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-4 text-rose-600 dark:text-rose-400 text-sm">
                {error}
              </div>
            )}

            {/* Hint */}
            {!image && !loading && (
              <div className="grid grid-cols-3 gap-3 pt-2">
                {[
                  { label: 'Take screenshot', sub: 'From TradingView or any charting app' },
                  { label: 'Paste directly', sub: '⌘V after copying a screenshot' },
                  { label: 'Daily / Weekly / Monthly', sub: 'Only these timeframes supported' },
                ].map(h => (
                  <div key={h.label} className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl p-3 text-center">
                    <p className="text-slate-700 dark:text-slate-300 text-xs font-semibold mb-0.5">{h.label}</p>
                    <p className="text-slate-500 dark:text-slate-600 text-xs">{h.sub}</p>
                  </div>
                ))}
              </div>
            )}

            <SavedAnalyses refreshTick={savedTick} onLoad={a => { setAnalysis(a); setPreview(null) }} />
          </div>
        ) : null}

        {analysis && (
          <div>
            {/* Analysis timestamp */}
            {analysedAt && (
              <div className="flex items-center gap-2 mb-4 text-xs text-slate-500 dark:text-slate-500">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Analysed {new Date(analysedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}

            {/* Chart preview strip */}
            {preview && (
              <div className="mb-6 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
                <img src={preview} alt="Analysed chart" className="w-full max-h-48 object-contain bg-slate-100 dark:bg-black/40" />
              </div>
            )}

            <AnalysisPanel analysis={analysis} />

            {/* Save + Analyse another */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={saveAnalysis}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                  saved
                    ? 'border-emerald-400 dark:border-emerald-500/60 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-violet-400 dark:hover:border-violet-500/40 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {saved ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    Save
                  </>
                )}
              </button>
              <button
                onClick={reset}
                className="flex-1 border border-slate-200 dark:border-white/10 hover:border-violet-400 dark:hover:border-violet-500/40 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold rounded-xl py-3 text-sm transition-all"
              >
                Analyse another chart →
              </button>
            </div>

            {/* Admin: set this analysis as the public sample */}
            {session?.role === 'admin' && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={setAsSample}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    sampleSaved
                      ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400'
                      : 'border-dashed border-slate-300 dark:border-white/20 text-slate-500 dark:text-slate-500 hover:border-violet-400 dark:hover:border-violet-500/50 hover:text-violet-600 dark:hover:text-violet-400'
                  }`}>
                  {sampleSaved ? '✓ Set as public sample' : '⚙ Set as public sample'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
