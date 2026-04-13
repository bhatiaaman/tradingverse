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
  if (n >  2) return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
  if (n >  0) return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/10'
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

function ChangePill({ value }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-[60px] text-[11px] font-bold px-2 py-1 rounded-lg ${changePillClass(value)}`}>
      {fmtPct(value)}
    </span>
  )
}

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

// ─── RRG Chart ────────────────────────────────────────────────────────────────

const QUADRANT_CONFIG = {
  Leading:   { fill: 'rgba(16,185,129,0.07)',  dot: '#10b981', label: '#10b981', text: 'Leading',   labelPos: 'top-right'    },
  Weakening: { fill: 'rgba(251,191,36,0.07)',  dot: '#f59e0b', label: '#f59e0b', text: 'Weakening', labelPos: 'bottom-right' },
  Lagging:   { fill: 'rgba(239,68,68,0.07)',   dot: '#ef4444', label: '#ef4444', text: 'Lagging',   labelPos: 'bottom-left'  },
  Improving: { fill: 'rgba(59,130,246,0.07)',  dot: '#3b82f6', label: '#3b82f6', text: 'Improving', labelPos: 'top-left'     },
}

function RRGChart({ rrgData }) {
  const svgRef  = useRef(null)
  const [tooltip, setTooltip] = useState(null) // { x, y, sector }
  const [hovered, setHovered] = useState(null)

  if (!rrgData || rrgData.length === 0) {
    return (
      <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-8 text-center text-slate-400 dark:text-slate-600 text-sm mb-8">
        RRG data unavailable — refresh or check Kite connection.
      </div>
    )
  }

  // Determine axis bounds from data
  const allX = rrgData.flatMap(d => d.tail.map(t => t.rsRatio))
  const allY = rrgData.flatMap(d => d.tail.map(t => t.rsMomentum))
  const rawMinX = Math.min(...allX), rawMaxX = Math.max(...allX)
  const rawMinY = Math.min(...allY), rawMaxY = Math.max(...allY)

  // Always keep center at 100; determine symmetric range
  const rangeX = Math.max(Math.abs(rawMaxX - 100), Math.abs(rawMinX - 100), 3) + 1.5
  const rangeY = Math.max(Math.abs(rawMaxY - 100), Math.abs(rawMinY - 100), 3) + 1.5
  const minX = 100 - rangeX, maxX = 100 + rangeX
  const minY = 100 - rangeY, maxY = 100 + rangeY

  const W = 580, H = 480
  const PAD = { top: 40, right: 40, bottom: 50, left: 50 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top  - PAD.bottom

  const toSvgX = val => PAD.left + ((val - minX) / (maxX - minX)) * chartW
  const toSvgY = val => PAD.top  + ((maxY - val) / (maxY - minY)) * chartH // invert Y
  const cx     = toSvgX(100)
  const cy     = toSvgY(100)

  // Grid lines
  const xTicks = [minX + rangeX * 0.25, 100, minX + rangeX * 1.75].map(v => Math.round(v * 10) / 10)
  const yTicks = [minY + rangeY * 0.25, 100, minY + rangeY * 1.75].map(v => Math.round(v * 10) / 10)

  return (
    <div className="bg-white dark:bg-[#080d16] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden mb-8">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Relative Rotation Graph (RRG)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Sectors vs NIFTY 50 • Trailing 4-week rotation shown</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold">
          {Object.entries(QUADRANT_CONFIG).map(([q, cfg]) => (
            <span key={q} className="flex items-center gap-1" style={{ color: cfg.dot }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: cfg.dot }} />
              {q}
            </span>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full max-w-2xl mx-auto"
          style={{ minWidth: 340 }}
          onMouseLeave={() => { setTooltip(null); setHovered(null) }}
        >
          {/* Quadrant fills */}
          <rect x={cx} y={PAD.top}  width={W - PAD.right - cx} height={cy - PAD.top}  fill={QUADRANT_CONFIG.Leading.fill} />
          <rect x={cx} y={cy}       width={W - PAD.right - cx} height={H - PAD.bottom - cy} fill={QUADRANT_CONFIG.Weakening.fill} />
          <rect x={PAD.left} y={cy} width={cx - PAD.left}      height={H - PAD.bottom - cy} fill={QUADRANT_CONFIG.Lagging.fill} />
          <rect x={PAD.left} y={PAD.top} width={cx - PAD.left} height={cy - PAD.top}    fill={QUADRANT_CONFIG.Improving.fill} />

          {/* Quadrant labels */}
          <text x={W - PAD.right - 6} y={PAD.top + 16} textAnchor="end" fontSize="9" fontWeight="700" fill={QUADRANT_CONFIG.Leading.label} opacity="0.7">LEADING</text>
          <text x={W - PAD.right - 6} y={H - PAD.bottom - 8} textAnchor="end" fontSize="9" fontWeight="700" fill={QUADRANT_CONFIG.Weakening.label} opacity="0.7">WEAKENING</text>
          <text x={PAD.left + 6} y={H - PAD.bottom - 8} textAnchor="start" fontSize="9" fontWeight="700" fill={QUADRANT_CONFIG.Lagging.label} opacity="0.7">LAGGING</text>
          <text x={PAD.left + 6} y={PAD.top + 16} textAnchor="start" fontSize="9" fontWeight="700" fill={QUADRANT_CONFIG.Improving.label} opacity="0.7">IMPROVING</text>

          {/* Grid lines */}
          {xTicks.map(v => (
            <line key={v} x1={toSvgX(v)} y1={PAD.top} x2={toSvgX(v)} y2={H - PAD.bottom}
              stroke="currentColor" strokeWidth="0.5" className="text-slate-200 dark:text-white/5" strokeDasharray="4,4" />
          ))}
          {yTicks.map(v => (
            <line key={v} x1={PAD.left} y1={toSvgY(v)} x2={W - PAD.right} y2={toSvgY(v)}
              stroke="currentColor" strokeWidth="0.5" className="text-slate-200 dark:text-white/5" strokeDasharray="4,4" />
          ))}

          {/* Center crosshair */}
          <line x1={cx} y1={PAD.top} x2={cx} y2={H - PAD.bottom} stroke="currentColor" strokeWidth="1" className="text-slate-300 dark:text-white/20" />
          <line x1={PAD.left} y1={cy} x2={W - PAD.right} y2={cy} stroke="currentColor" strokeWidth="1" className="text-slate-300 dark:text-white/20" />

          {/* Axis labels */}
          <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="9" fontWeight="600" fill="currentColor" className="text-slate-400 dark:text-slate-600">RS-Ratio →  Relative Strength</text>
          <text x={14} y={H / 2} textAnchor="middle" fontSize="9" fontWeight="600" fill="currentColor" className="text-slate-400 dark:text-slate-600" transform={`rotate(-90 14 ${H / 2})`}>RS-Momentum →  Acceleration</text>

          {/* Tails + Dots */}
          {rrgData.map((sector) => {
            const cfg    = QUADRANT_CONFIG[sector.quadrant] || QUADRANT_CONFIG.Lagging
            const isHov  = hovered === sector.name
            const points = sector.tail

            return (
              <g key={sector.name}>
                {/* Tail polyline */}
                {points.length > 1 && (
                  <polyline
                    points={points.map(p => `${toSvgX(p.rsRatio)},${toSvgY(p.rsMomentum)}`).join(' ')}
                    fill="none"
                    stroke={cfg.dot}
                    strokeWidth={isHov ? 2 : 1}
                    strokeOpacity={isHov ? 0.8 : 0.35}
                    strokeDasharray="3,2"
                  />
                )}
                {/* Tail ghost dots */}
                {points.slice(0, -1).map((p, pi) => (
                  <circle key={pi}
                    cx={toSvgX(p.rsRatio)} cy={toSvgY(p.rsMomentum)}
                    r={2}
                    fill={cfg.dot}
                    opacity={isHov ? 0.5 : 0.2}
                  />
                ))}
                {/* Current dot */}
                <circle
                  cx={toSvgX(sector.rsRatio)} cy={toSvgY(sector.rsMomentum)}
                  r={isHov ? 7 : 5}
                  fill={cfg.dot}
                  fillOpacity={0.9}
                  stroke="white"
                  strokeWidth={isHov ? 2 : 1}
                  style={{ cursor: 'pointer', transition: 'r 0.15s' }}
                  onMouseEnter={(e) => {
                    setHovered(sector.name)
                    const rect = svgRef.current?.getBoundingClientRect()
                    const svgEl = svgRef.current
                    if (!rect || !svgEl) return
                    const scaleX = rect.width  / W
                    const scaleY = rect.height / H
                    setTooltip({
                      x: toSvgX(sector.rsRatio) * scaleX,
                      y: toSvgY(sector.rsMomentum) * scaleY - 12,
                      sector,
                    })
                  }}
                />
                {/* Sector label */}
                <text
                  x={toSvgX(sector.rsRatio)}
                  y={toSvgY(sector.rsMomentum) - 9}
                  textAnchor="middle"
                  fontSize={isHov ? "10" : "9"}
                  fontWeight={isHov ? "800" : "600"}
                  fill={cfg.label}
                  opacity={isHov ? 1 : 0.85}
                  style={{ pointerEvents: 'none' }}
                >
                  {sector.name}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Floating Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-20 bg-white dark:bg-[#0e1420] border border-slate-200 dark:border-white/15 rounded-xl px-3 py-2 shadow-xl text-xs"
            style={{ left: tooltip.x + 12, top: tooltip.y - 20, transform: 'translateY(-100%)' }}
          >
            <div className="font-black text-slate-900 dark:text-white mb-1">{tooltip.sector.name}</div>
            <div className="flex flex-col gap-0.5 text-slate-500 dark:text-slate-400">
              <span>RS-Ratio: <b className="text-slate-900 dark:text-white">{tooltip.sector.rsRatio.toFixed(2)}</b></span>
              <span>RS-Mom:   <b className="text-slate-900 dark:text-white">{tooltip.sector.rsMomentum.toFixed(2)}</b></span>
              <span className="mt-1 font-bold" style={{ color: QUADRANT_CONFIG[tooltip.sector.quadrant]?.dot }}>{tooltip.sector.quadrant}</span>
            </div>
          </div>
        )}
      </div>
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
  const rrgData = data?.rrgData || []
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
              RRG chart + multi-timeframe sector performance — 1D, 1W, 1M
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

        {/* RRG Chart */}
        {loading ? (
          <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl h-64 animate-pulse mb-8" />
        ) : (
          <RRGChart rrgData={rrgData} />
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
              // Get RRG quadrant for this sector
              const rrg = rrgData.find(r => r.name === sector.name)
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
                    {rrg && !isLeading && !isLagging && (rrg.quadrant === 'Improving' || rrg.quadrant === 'Weakening') && (
                      <span className={`text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded flex-shrink-0 border ${
                        rrg.quadrant === 'Improving'
                          ? 'bg-blue-500/15 text-blue-500 border-blue-500/20'
                          : 'bg-amber-500/15 text-amber-500 border-amber-500/20'
                      }`}>
                        {rrg.quadrant}
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
