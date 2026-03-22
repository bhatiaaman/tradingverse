'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Nav from './components/Nav'

// ── Scroll-reveal ────────────────────────────────────────────────────────────
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible') }),
      { threshold: 0.07 }
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

// ── Tag pill ─────────────────────────────────────────────────────────────────
function Tag({ children, color = 'violet' }) {
  const map = {
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    amber:   'text-amber-400 bg-amber-500/10 border-amber-500/25',
    sky:     'text-sky-400 bg-sky-500/10 border-sky-500/25',
    blue:    'text-blue-400 bg-blue-500/10 border-blue-500/25',
    cyan:    'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
    rose:    'text-rose-400 bg-rose-500/10 border-rose-500/25',
  }
  return (
    <span className={`inline-block text-[9px] font-bold tracking-[0.18em] uppercase px-2.5 py-0.5 rounded-full border ${map[color]}`}>
      {children}
    </span>
  )
}

// ── Browser frame wrapper ─────────────────────────────────────────────────────
// Wrap either a screenshot <Image> or a mockup component in a macOS-style frame
function BrowserFrame({ url, badge, badgeColor = 'emerald', children }) {
  const badgeColors = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    sky:     'text-sky-400 bg-sky-500/10 border-sky-500/20',
    violet:  'text-violet-400 bg-violet-500/10 border-violet-500/20',
    amber:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }
  return (
    <div className="rounded-xl border border-white/10 bg-[#060b14] overflow-hidden shadow-2xl shadow-black/60">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/8 bg-[#040810] shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        {url && <span className="ml-3 text-[10px] text-slate-600 font-mono">{url}</span>}
        {badge && (
          <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${badgeColors[badgeColor]}`}>
            ● {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Screenshot slot ───────────────────────────────────────────────────────────
// Shows a real screenshot if the file exists, otherwise renders the fallback mockup
function ScreenshotOrMockup({ src, alt, fallback: Fallback, url, badge, badgeColor }) {
  const [hasImage, setHasImage] = useState(true)
  // If no src provided, always use fallback
  if (!src) return <BrowserFrame url={url} badge={badge} badgeColor={badgeColor}><Fallback /></BrowserFrame>
  if (!hasImage) return <BrowserFrame url={url} badge={badge} badgeColor={badgeColor}><Fallback /></BrowserFrame>
  return (
    <BrowserFrame url={url} badge={badge} badgeColor={badgeColor}>
      <Image
        src={src}
        alt={alt}
        width={900}
        height={560}
        className="w-full h-auto"
        onError={() => setHasImage(false)}
      />
    </BrowserFrame>
  )
}

// ── Mockups ───────────────────────────────────────────────────────────────────

function PreMarketMockup() {
  return (
    <div className="p-4 space-y-3 text-[11px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-white text-sm">Pre-Market Intelligence</p>
          <p className="text-slate-500 text-[10px]">Mon, 17 Mar 2026 · Opens in 1h 24m</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500">GIFT Nifty</p>
          <p className="text-sm font-black text-emerald-400">+142 pts</p>
          <p className="text-[10px] text-emerald-500">Gap up ~0.6%</p>
        </div>
      </div>
      <div>
        <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-2">Global Cues</p>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { name: 'Dow Jones', val: '+0.82%', up: true },
            { name: 'Nasdaq',    val: '+1.14%', up: true },
            { name: 'Crude Oil', val: '-0.4%',  up: false },
            { name: 'DXY',       val: '-0.3%',  up: false },
          ].map(g => (
            <div key={g.name} className={`rounded-lg p-2 border text-center ${g.up ? 'bg-emerald-500/8 border-emerald-500/15' : 'bg-rose-500/8 border-rose-500/15'}`}>
              <p className="text-[9px] text-slate-500 mb-0.5">{g.name}</p>
              <p className={`font-bold text-[10px] ${g.up ? 'text-emerald-400' : 'text-rose-400'}`}>{g.val}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-2">Nifty Key Levels</p>
        <div className="flex gap-2">
          {[
            { label: 'Resistance', val: '24,600', color: 'text-amber-400', sub: 'Last week high' },
            { label: 'Support',    val: '24,200', color: 'text-sky-400',   sub: 'VWAP anchor' },
            { label: 'India VIX',  val: '13.45',  color: 'text-yellow-400',sub: 'Low — calm open' },
          ].map(l => (
            <div key={l.label} className="flex-1 bg-white/[0.03] border border-white/8 rounded-lg p-2.5">
              <p className="text-[9px] text-slate-500 mb-1">{l.label}</p>
              <p className={`font-bold font-mono ${l.color}`}>{l.val}</p>
              <p className="text-[9px] text-slate-600 mt-0.5">{l.sub}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-2">Sector Setup</p>
        <div className="flex gap-1 flex-wrap">
          {[
            { s: 'IT',     v: '+1.4%', up: true  },
            { s: 'BANK',   v: '+0.9%', up: true  },
            { s: 'AUTO',   v: '+0.6%', up: true  },
            { s: 'FMCG',   v: '-0.2%', up: false },
            { s: 'PHARMA', v: '-0.5%', up: false },
            { s: 'METAL',  v: '+0.3%', up: true  },
          ].map(s => (
            <span key={s.s} className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${s.up ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
              {s.s} {s.v}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function TerminalMockup() {
  return (
    <div className="grid grid-cols-12 gap-px bg-white/5 min-h-[280px] text-[11px]">
      {/* Left — indices + watchlist */}
      <div className="col-span-3 bg-[#060b14] p-3 space-y-3">
        <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600">Indices</p>
        {[
          { name: 'NIFTY 50',  val: '24,412', chg: '+0.58%', up: true  },
          { name: 'BANKNIFTY', val: '52,640', chg: '+0.84%', up: true  },
          { name: 'INDIA VIX', val: '13.45',  chg: '-3.2%',  up: false },
          { name: 'SENSEX',    val: '80,218', chg: '+0.61%', up: true  },
        ].map(idx => (
          <div key={idx.name} className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-slate-500 text-[10px]">{idx.name}</span>
            <div className="text-right">
              <p className="font-bold text-slate-200 text-[10px]">{idx.val}</p>
              <p className={`text-[9px] font-semibold ${idx.up ? 'text-emerald-400' : 'text-rose-400'}`}>{idx.chg}</p>
            </div>
          </div>
        ))}
        <div className="pt-1">
          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-1.5">Watchlist</p>
          {[
            { sym: 'RELIANCE',  chg: '+1.2%', up: true,  tag: '🔔 scanner' },
            { sym: 'HDFCBANK',  chg: '+0.9%', up: true,  tag: '' },
            { sym: 'INFY',      chg: '+1.8%', up: true,  tag: '🔔 scanner' },
            { sym: 'TATASTEEL', chg: '-0.4%', up: false, tag: '' },
          ].map(w => (
            <div key={w.sym} className="flex items-center justify-between py-1 border-b border-white/5">
              <div>
                <p className="font-semibold text-slate-300 text-[10px]">{w.sym}</p>
                {w.tag && <p className="text-[8px] text-amber-400">{w.tag}</p>}
              </div>
              <p className={`text-[10px] font-bold ${w.up ? 'text-emerald-400' : 'text-rose-400'}`}>{w.chg}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Centre — chart */}
      <div className="col-span-6 bg-[#060b14] p-3 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-bold text-white">NIFTY 50</p>
            <p className="text-[10px] text-slate-500">NSE · 5 min</p>
          </div>
          <div className="text-right">
            <p className="text-base font-black text-emerald-400">24,412.35</p>
            <p className="text-[10px] text-emerald-500">+141.20 (+0.58%)</p>
          </div>
        </div>
        <div className="flex-1 min-h-[110px] rounded-lg bg-slate-900/40 border border-white/5 overflow-hidden relative">
          <svg viewBox="0 0 300 110" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,88 L22,80 L44,72 L66,83 L88,70 L110,62 L132,68 L154,54 L176,46 L198,52 L220,40 L242,33 L264,41 L286,28" fill="none" stroke="#34d399" strokeWidth="1.5" />
            <path d="M0,88 L22,80 L44,72 L66,83 L88,70 L110,62 L132,68 L154,54 L176,46 L198,52 L220,40 L242,33 L264,41 L286,28 L286,110 L0,110 Z" fill="url(#chartGrad)" />
            {[22,44,66,88,110,132,154,176,198,220,242,264,286].map((x, i) => {
              const ups = [1,0,1,1,0,1,1,1,0,1,1,0,1]
              const up = ups[i]; const by = 88 - i * 5; const color = up ? '#34d399' : '#f87171'
              return (
                <g key={x}>
                  <line x1={x} y1={by-(up?8:4)} x2={x} y2={by+(up?4:8)} stroke={color} strokeWidth="0.8" opacity="0.5"/>
                  <rect x={x-4} y={up?by-6:by-2} width={8} height={6} fill={color} opacity="0.8" rx="0.5"/>
                </g>
              )
            })}
          </svg>
          <div className="absolute top-2 left-2 text-[9px] bg-blue-500/15 border border-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">OR: 24,310H / 24,268L</div>
          <div className="absolute top-2 right-2 text-[9px] bg-green-500/15 border border-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-bold">▲ Trend Day</div>
        </div>
        <div className="flex gap-1 mt-2">
          {['1m','5m','15m','1h','D'].map((t,i) => (
            <button key={t} className={`px-2 py-0.5 rounded text-[9px] font-bold ${i===1 ? 'bg-blue-600 text-white' : 'text-slate-500 border border-white/5'}`}>{t}</button>
          ))}
          <button className="ml-auto text-[9px] font-semibold text-violet-400 border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 rounded">⊕ Options</button>
          <button className="text-[9px] font-semibold text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded">Place Order</button>
        </div>
      </div>
      {/* Right — option chain */}
      <div className="col-span-3 bg-[#060b14] p-3">
        <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-2">Option Chain · 24400</p>
        <div className="grid grid-cols-3 text-[9px] text-slate-600 mb-1 px-1">
          <span>CE OI</span><span className="text-center">Strike</span><span className="text-right">PE OI</span>
        </div>
        {[
          { s: '24600', co: '8.2L',  po: '2.1L',  atm: false },
          { s: '24500', co: '12.4L', po: '3.8L',  atm: false },
          { s: '24400', co: '18.6L', po: '18.2L', atm: true  },
          { s: '24300', co: '3.2L',  po: '14.1L', atm: false },
          { s: '24200', co: '1.8L',  po: '11.3L', atm: false },
        ].map(r => (
          <div key={r.s} className={`grid grid-cols-3 items-center px-1 py-0.5 rounded text-[9px] ${r.atm ? 'bg-blue-500/10 border border-blue-500/15' : ''}`}>
            <span className="font-mono text-sky-400">{r.co}</span>
            <span className={`text-center font-bold ${r.atm ? 'text-blue-300' : 'text-slate-400'}`}>{r.s}</span>
            <span className="font-mono text-right text-rose-400">{r.po}</span>
          </div>
        ))}
        <div className="mt-3 space-y-1">
          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-1">Positions</p>
          <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-lg p-2">
            <div className="flex justify-between">
              <p className="font-bold text-emerald-300 text-[10px]">NIFTY 24400 CE</p>
              <p className="text-emerald-400 font-bold text-[10px]">+₹3,240</p>
            </div>
            <p className="text-[9px] text-slate-500">Qty: 50 · Avg: 142 · LTP: 207</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function CommentaryMockup() {
  return (
    <div className="p-4 space-y-3 text-[11px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-green-900/50 text-green-300 border border-green-700/40">📈 Trending Up</span>
          <p className="font-bold text-white text-sm">Bulls in control — OR breakout confirmed</p>
        </div>
        <span className="text-[10px] text-slate-600 font-mono">11:32</span>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Breadth:</span>
          <span className="font-mono font-bold text-emerald-400">1,847↑</span>
          <span className="font-mono font-bold text-rose-400">412↓</span>
          <span className="text-slate-600">(4.5:1)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Regime:</span>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
          <span className="font-semibold text-green-300">Trend Up</span>
          <span className="text-[9px] font-bold text-emerald-400">HIGH</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Bias trail:</span>
          <span className="text-emerald-400 font-bold">BULL</span>
          <span className="text-slate-600">→</span>
          <span className="text-yellow-400 font-bold">NEUTRAL</span>
          <span className="text-slate-600">→</span>
          <span className="text-emerald-400 font-bold">BULL</span>
        </div>
      </div>
      <div className="flex items-start gap-2 bg-cyan-900/20 border border-cyan-700/30 rounded-lg p-2.5">
        <span className="text-cyan-400 mt-0.5">ⓘ</span>
        <span className="text-cyan-300 text-[11px] font-medium">Strong breadth 4.5:1. Trend day confirmed — dips to VWAP are buy opportunities. Watch 24,600 as resistance.</span>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 flex-shrink-0">Intraday Sentiment</p>
        <div className="flex-1">
          <svg viewBox="0 0 200 40" className="w-full h-8">
            <defs>
              <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="6" y1="20" x2="186" y2="20" stroke="#64748b" strokeWidth="1" strokeDasharray="4,3" />
            <polyline points="6,36 28,32 50,28 72,24 94,26 116,18 138,12 160,8 182,6" fill="none" stroke="#34d399" strokeWidth="1.5"/>
            <path d="M6,36 L28,32 L50,28 L72,24 L94,26 L116,18 L138,12 L160,8 L182,6 L182,40 L6,40 Z" fill="url(#sg)"/>
            <circle cx="182" cy="6" r="3" fill="#34d399"/>
          </svg>
        </div>
        <span className="text-[10px] font-bold text-emerald-400">72</span>
      </div>
    </div>
  )
}

function OrderIntelligenceMockup() {
  return (
    <div className="p-4 space-y-3 text-[11px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-black text-white text-sm">NIFTY 24400 CE</p>
          <p className="text-slate-500 text-[10px]">BUY · Qty 50 · Exp 27 Mar</p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">BULLISH ✓</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: 'Regime',  v: 'Trend Up', good: true },
          { l: 'R : R',   v: '1 : 2.8',  good: true },
          { l: 'IV Rank', v: '38 — Low', good: true },
        ].map(m => (
          <div key={m.l} className="rounded-lg p-2 border text-center bg-emerald-500/8 border-emerald-500/15">
            <p className="text-[9px] text-slate-500 mb-0.5">{m.l}</p>
            <p className="text-[10px] font-bold text-emerald-400">{m.v}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-1.5">Scenarios</p>
        {[
          { l: 'Bull', p: 52, desc: 'Break above 24,450 → 24,600', c: 'bg-emerald-500' },
          { l: 'Base', p: 30, desc: 'Consolidation 24,300–24,450',  c: 'bg-amber-500'  },
          { l: 'Bear', p: 18, desc: 'Rejection → VWAP 24,150',      c: 'bg-rose-500'   },
        ].map(s => (
          <div key={s.l} className="flex items-center gap-2 mb-1.5">
            <span className="text-[9px] text-slate-500 w-6">{s.l}</span>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full ${s.c} rounded-full`} style={{ width: `${s.p}%` }} />
            </div>
            <span className="text-[9px] text-slate-400 w-5 text-right">{s.p}%</span>
            <span className="text-[9px] text-slate-600 w-36 truncate">{s.desc}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { name: 'Trend Agent',   icon: '📈', status: 'Aligned',      color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/15' },
          { name: 'Volatility',    icon: '📊', status: 'Low IV — Buy', color: 'text-sky-400',     bg: 'bg-sky-500/8 border-sky-500/15' },
          { name: 'Behavioural',   icon: '🧠', status: 'No bias',      color: 'text-violet-400',  bg: 'bg-violet-500/8 border-violet-500/15' },
          { name: 'Order Flow',    icon: '🔀', status: 'Strong buy',   color: 'text-amber-400',   bg: 'bg-amber-500/8 border-amber-500/15' },
        ].map(a => (
          <div key={a.name} className={`rounded-lg p-2 border ${a.bg}`}>
            <div className="flex items-center gap-1 mb-0.5">
              <span>{a.icon}</span>
              <p className="text-[9px] text-slate-500">{a.name}</p>
            </div>
            <p className={`font-bold text-[10px] ${a.color}`}>{a.status}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-500 italic border-t border-white/8 pt-2 leading-4">
        "Trend day confirmed. Low IV favours buying. All agents aligned. Wait for 5-min close above 24,420."
      </p>
    </div>
  )
}

function ChartAnalyserMockup() {
  return (
    <div className="p-4 text-[11px]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[9px] font-bold tracking-widest uppercase text-sky-400 mb-1">AI Vision</p>
          <p className="font-black text-white text-base">RELIANCE · Weekly</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500">Score</p>
          <p className="text-2xl font-black text-sky-400">7<span className="text-sm text-slate-500">/10</span></p>
        </div>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full mb-3">
        <div className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full" style={{ width: '70%' }} />
      </div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        <span className="text-[9px] bg-sky-500/10 border border-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full font-bold">Stage 2 Advance</span>
        <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Uptrend</span>
        <span className="text-[9px] bg-violet-500/10 border border-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full font-bold">Strong RS</span>
      </div>
      <p className="text-[10px] text-slate-400 leading-5 mb-3">Breaking above multi-month consolidation with volume expansion. MACD positive crossover on weekly. Relative strength vs Nifty improving.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { l: 'Technical',   v: 'Breakout',         color: 'text-emerald-400' },
          { l: 'RS vs Nifty', v: 'Outperforming ↑',  color: 'text-emerald-400' },
          { l: 'Sector',      v: 'ENERGY — Leader',   color: 'text-sky-400' },
          { l: 'Sentiment',   v: 'Bullish',           color: 'text-emerald-400' },
        ].map(m => (
          <div key={m.l} className="bg-white/[0.03] border border-white/8 rounded-lg p-2">
            <p className="text-[9px] text-slate-600 mb-0.5">{m.l}</p>
            <p className={`text-[10px] font-bold ${m.color}`}>{m.v}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChartinkMockup() {
  return (
    <div className="p-5 text-[11px]">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 rounded-lg border border-blue-500/25 bg-blue-500/8 p-3 text-center">
          <p className="text-[9px] font-bold tracking-widest uppercase text-blue-400 mb-1">Chartink Scanner</p>
          <p className="text-[10px] text-slate-400 leading-4">RSI cross 60<br />+ Volume 2x avg</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 h-px bg-amber-500/50" />
          <span className="text-[8px] text-amber-400 font-bold">Webhook</span>
          <div className="w-8 h-px bg-amber-500/50" />
        </div>
        <div className="flex-1 rounded-lg border border-violet-500/25 bg-violet-500/8 p-3 text-center">
          <p className="text-[9px] font-bold tracking-widest uppercase text-violet-400 mb-1">TradingVerse</p>
          <p className="text-[10px] text-slate-400 leading-4">Auto-adds to<br />watchlist</p>
        </div>
        <div className="w-4 h-px bg-emerald-500/50" />
        <div className="flex-1 rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3 text-center">
          <p className="text-[9px] font-bold tracking-widest uppercase text-emerald-400 mb-1">Watchlist</p>
          <p className="text-[10px] text-slate-400 leading-4">Ready to<br />trade</p>
        </div>
      </div>
      <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-2">Live Alerts Today</p>
      <div className="space-y-1.5">
        {[
          { time: '09:22', sym: 'RELIANCE',   cond: 'RSI > 60 + Vol surge' },
          { time: '10:08', sym: 'INFY',       cond: 'Breakout above 52w high' },
          { time: '11:14', sym: 'AXISBANK',   cond: 'EMA 9 cross 21' },
          { time: '13:41', sym: 'TATAMOTORS', cond: 'RSI > 60 + Vol surge' },
        ].map(a => (
          <div key={a.sym} className="flex items-center gap-3 py-1.5 border-b border-white/5">
            <span className="text-[9px] font-mono text-slate-600 w-10">{a.time}</span>
            <span className="font-bold text-slate-200 text-[10px] w-20">{a.sym}</span>
            <span className="text-slate-500 text-[9px] flex-1">{a.cond}</span>
            <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/15 px-1.5 py-0.5 rounded-full">⚡ Added</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Interactive Scenario Game (from original landing) ─────────────────────────
const SCENARIOS = [
  {
    id: 1, type: 'context',
    context: [
      { label: 'Dow Jones',  value: '-1.8%',              bad: true  },
      { label: 'GIFT Nifty', value: '-180 pts',            bad: true  },
      { label: 'India VIX',  value: '18.4 ↑',             bad: true  },
      { label: 'Nifty',      value: 'Near weekly support', bad: false },
    ],
    question: 'Gap down open expected. Nifty is near a major weekly support. 9:15 AM. What do you do?',
    options: [
      { id: 'a', text: 'Short immediately — global cues are bearish' },
      { id: 'b', text: 'Wait 15–30 mins for directional confirmation' },
      { id: 'c', text: 'Buy the dip — weekly support will hold' },
      { id: 'd', text: 'Buy straddle — direction unclear' },
    ],
    answer: 'b',
    explanation: 'Opening volatility is highest in the first 15 mins. Weekly support could attract buyers OR break further. Waiting for confirmation is the professional move.',
  },
  {
    id: 2, type: 'context',
    context: [
      { label: 'Dow Jones',   value: '+0.4%',          bad: false },
      { label: 'Nifty trend', value: 'Bullish 3 days',  bad: false },
      { label: 'India VIX',   value: '12.1 ↓',         bad: false },
      { label: 'PCR',         value: '1.3 (bullish)',   bad: false },
    ],
    question: "You're up 2% on a long trade. Target is 1.5% away. VIX is low, trend intact. What do you do?",
    options: [
      { id: 'a', text: 'Hold for full target — trend is your friend' },
      { id: 'b', text: 'Book 50% now, trail stop on the rest' },
      { id: 'c', text: 'Add more — momentum is strong' },
      { id: 'd', text: 'Exit fully — 2% is enough' },
    ],
    answer: 'b',
    explanation: 'Partial booking locks in gains while letting the trade breathe. Adding without a plan turns winners into losers. Partial + trailing stop is textbook risk management.',
  },
  {
    id: 3, type: 'context',
    context: [
      { label: 'Event',       value: 'RBI Policy Day', bad: false },
      { label: 'Expectation', value: 'No rate change', bad: false },
      { label: 'India VIX',   value: '16.8 ↑',        bad: true  },
      { label: 'Time',        value: '9:45 AM',        bad: false },
    ],
    question: 'RBI announcement at 10 AM. You have a profitable long position from yesterday. What do you do?',
    options: [
      { id: 'a', text: "Hold — no rate change expected, should be fine" },
      { id: 'b', text: "Exit before 10 AM — don't hold through events" },
      { id: 'c', text: 'Add more — positive outcome expected' },
      { id: 'd', text: 'Buy a put as hedge and hold the long' },
    ],
    answer: 'b',
    explanation: '"Buy the rumour, sell the news." Even if the outcome is as expected, markets often reverse. VIX rising shows uncertainty. Protect profits and re-enter after the event.',
  },
]

function ScenarioGame() {
  const [idx, setIdx]   = useState(0)
  const [pick, setPick] = useState(null)
  const [done, setDone] = useState(false)
  const s = SCENARIOS[idx]

  const choose = v => { if (done) return; setPick(v); setTimeout(() => setDone(true), 350) }
  const next   = () => { setIdx(i => (i + 1) % SCENARIOS.length); setPick(null); setDone(false) }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {s.context.map(c => (
          <div key={c.label} className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between
            ${c.bad ? 'border-rose-800/50 bg-rose-950/20' : 'border-emerald-800/50 bg-emerald-950/20'}`}>
            <span className="text-slate-400">{c.label}</span>
            <span className={`font-bold ${c.bad ? 'text-rose-400' : 'text-emerald-400'}`}>{c.value}</span>
          </div>
        ))}
      </div>
      <p className="text-sm font-semibold text-white leading-snug mb-4">{s.question}</p>
      {!done ? (
        <div className="flex flex-col gap-2">
          {s.options.map(o => (
            <button key={o.id} onClick={() => choose(o.id)}
              className={`text-left px-4 py-3 rounded-xl text-xs border transition-all duration-200 leading-snug
                ${pick === o.id
                  ? 'border-blue-500/60 bg-blue-950/50 text-blue-300 scale-[0.99]'
                  : 'border-white/8 text-slate-400 hover:border-white/15 hover:text-slate-200 hover:bg-white/[0.03]'}`}>
              <span className="font-bold text-slate-500 mr-2">{o.id.toUpperCase()}.</span>{o.text}
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div className={`p-4 rounded-xl border mb-3 text-xs
            ${pick === s.answer ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-amber-700/50 bg-amber-950/20'}`}>
            <p className={`font-bold mb-2 text-sm ${pick === s.answer ? 'text-emerald-400' : 'text-amber-400'}`}>
              {pick === s.answer ? '✓ Good thinking.' : `✗ Smarter play: ${s.options.find(o => o.id === s.answer)?.text}`}
            </p>
            <p className="text-slate-400 leading-relaxed">{s.explanation}</p>
          </div>
          <button onClick={next}
            className="w-full py-2.5 rounded-xl border border-white/10 text-slate-400 text-xs font-semibold hover:border-white/20 hover:text-slate-200 transition-colors">
            Next scenario →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  useReveal()

  return (
    <div className="min-h-screen bg-[#060b14] text-white overflow-x-hidden">
      <style>{`
        [data-reveal] { opacity: 0; transform: translateY(22px); transition: opacity 0.65s ease, transform 0.65s ease; }
        [data-reveal].is-visible { opacity: 1; transform: translateY(0); }
        .delay-1 { transition-delay: 0.1s; }
        .delay-2 { transition-delay: 0.2s; }
        .delay-3 { transition-delay: 0.3s; }
      `}</style>

      {/* ── NAV ── */}
      <Nav fixed />

      {/* ── HERO ── */}
      <section className="relative pt-36 pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-violet-600/10 rounded-full blur-3xl" />
          <div className="absolute top-20 left-1/4 w-64 h-64 bg-blue-600/6 rounded-full blur-3xl" />
          <div className="absolute top-32 right-1/4 w-48 h-48 bg-emerald-600/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            India's Intelligence-First Trading Platform
          </div>
          <h1 data-reveal className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6">
            Your complete<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400">trading workflow.</span>
          </h1>
          <p data-reveal className="delay-1 text-slate-400 text-lg md:text-xl leading-8 max-w-2xl mx-auto mb-4">
            From <span className="text-white font-semibold">8:50 AM pre-market context</span> to live order execution to post-session review — every step of a serious trader's day, in one platform.
          </p>
          <p data-reveal className="delay-2 text-slate-600 text-sm max-w-xl mx-auto mb-10">
            Built for Indian markets. Kite-integrated. Intelligence at every step.
          </p>
          <div data-reveal className="delay-2 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login"
              className="w-full sm:w-auto px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-2xl transition-all text-base shadow-lg shadow-violet-500/20">
              Start for Free — No Card
            </Link>
            <Link href="/trades"
              className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/8 border border-white/10 text-white font-semibold rounded-2xl transition-all text-base">
              Open Terminal →
            </Link>
          </div>
          <p data-reveal className="delay-3 mt-4 text-xs text-slate-600">
            Free: live data · option chain · chart analyser · order intelligence · trading games
          </p>
        </div>
      </section>

      {/* ── TRUST BAR ── */}
      <div className="border-y border-white/5 py-4 px-6 bg-white/[0.01]">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-xs text-slate-500">
          {['Zerodha Kite integrated', 'Real-time NSE & BSE data', 'Live option chain', 'AI-powered analysis', 'Chartink webhook support'].map(t => (
            <span key={t} className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-slate-600" />{t}
            </span>
          ))}
        </div>
      </div>

      {/* ── THE PROBLEM ── */}
      <section className="py-28 px-6 border-b border-white/5">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div data-reveal>
            <div className="text-8xl md:text-9xl font-black leading-none mb-4 bg-gradient-to-br from-rose-500 to-rose-500/25 bg-clip-text text-transparent">83%</div>
            <p className="text-3xl font-bold text-white leading-tight">of retail traders lose money in the markets.</p>
          </div>
          <div data-reveal className="delay-2">
            <p className="text-slate-400 text-xl leading-relaxed mb-6">
              The 17% who consistently win share one habit — they understand <em className="text-white not-italic font-semibold">context</em> before placing a trade.
            </p>
            <p className="text-slate-500 text-base leading-relaxed mb-8">
              They know what global markets did overnight. They know where smart money is positioned. They've trained their instincts on hundreds of real scenarios. TradingVerse is the ritual the 17% already follow.
            </p>
            <Link href="/trades/pre-market" className="inline-flex items-center gap-2 text-blue-400 text-sm font-semibold hover:gap-3 transition-all group">
              See what the 17% see every morning
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── THE WORKFLOW ── */}
      <section id="workflow" className="py-24 px-6 border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500 block mb-3">The Workflow</span>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
              A smarter trader's day —<br />
              <span className="text-slate-500">step by step.</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Most platforms give you data. TradingVerse gives you a complete workflow — context before the open, intelligence at execution, coaching throughout the session.
            </p>
          </div>

          {/* Chapter 1: Pre-Market */}
          <div className="mb-24" data-reveal>
            <div className="flex items-center gap-3 mb-8">
              <span className="text-[10px] font-black tracking-widest uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">8:50 AM</span>
              <h3 className="text-2xl font-black text-white">Prepare before the bell.</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-10 items-start">
              <div>
                <p className="text-slate-400 text-base leading-7 mb-6">
                  Before 9:15 AM, serious traders are already ahead. The Pre-Market page gives you everything you need to understand how the day might unfold.
                </p>
                <div className="space-y-4 mb-6">
                  {[
                    { icon: '🌐', title: 'Global cues',        desc: 'Dow, Nasdaq, Crude, DXY, SGX Nifty — all in one screen.' },
                    { icon: '📍', title: 'Key S/R levels',     desc: 'Nifty & BankNifty support/resistance, pivot points, OR levels.' },
                    { icon: '🔥', title: 'Sector rotation',    desc: 'Which sectors are strong, which are weak — before the open.' },
                    { icon: '🤖', title: 'AI Week Ahead Plan', desc: 'What Nifty & BankNifty could do this week, and exactly why.' },
                  ].map(f => (
                    <div key={f.title} className="flex gap-3">
                      <span className="text-lg mt-0.5">{f.icon}</span>
                      <div>
                        <p className="font-semibold text-white text-sm">{f.title}</p>
                        <p className="text-slate-500 text-sm mt-0.5">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/trades/pre-market" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
                  Open Pre-Market →
                </Link>
              </div>
              {/* TODO: replace PreMarketMockup with screenshot once captured */}
              <ScreenshotOrMockup
                src="/screenshots/pre-market.png"
                alt="Pre-Market Intelligence dashboard"
                fallback={PreMarketMockup}
                url="tradingverse.in/trades/pre-market"
                badge="Live"
                badgeColor="emerald"
              />
            </div>
          </div>

          {/* Chapter 2: Terminal */}
          <div className="mb-24" data-reveal>
            <div className="flex items-center gap-3 mb-8">
              <span className="text-[10px] font-black tracking-widest uppercase text-sky-400 bg-sky-500/10 border border-sky-500/20 px-3 py-1 rounded-full">9:15 AM</span>
              <h3 className="text-2xl font-black text-white">The market opens. You're ready.</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-10 items-start">
              <div className="order-2 md:order-1">
                {/* TODO: replace with terminal screenshot */}
                <ScreenshotOrMockup
                  src="/screenshots/terminal.png"
                  alt="Trading terminal with option chain"
                  fallback={TerminalMockup}
                  url="tradingverse.in/trades"
                  badge="Kite"
                  badgeColor="sky"
                />
              </div>
              <div className="order-1 md:order-2">
                <p className="text-slate-400 text-base leading-7 mb-6">
                  One screen. Everything you need to trade. Live charts, option chain, watchlist, open positions, and Kite-integrated order placement.
                </p>
                <div className="space-y-4 mb-6">
                  {[
                    { icon: '📈', title: 'Live charts',       desc: 'Equity and options charts with OR bands, VWAP, EMA 9/21/50, S/R zones.' },
                    { icon: '⛓️', title: 'Option chain',      desc: 'Real-time OI, LTP, Greeks. Identify max pain and key strikes instantly.' },
                    { icon: '🏷️', title: 'Regime detection',  desc: 'Trend Day, Range Day, Breakout, Trap — classified live, every 30 minutes.' },
                    { icon: '⚡', title: 'Order placement',   desc: 'Place, modify, cancel — via Kite integration without leaving the terminal.' },
                  ].map(f => (
                    <div key={f.title} className="flex gap-3">
                      <span className="text-lg mt-0.5">{f.icon}</span>
                      <div>
                        <p className="font-semibold text-white text-sm">{f.title}</p>
                        <p className="text-slate-500 text-sm mt-0.5">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/trades" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors">
                  Open Terminal →
                </Link>
              </div>
            </div>
          </div>

          {/* Chapter 2.5: Chartink */}
          <div className="mb-24" data-reveal>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-8">
              <div className="flex items-center gap-3 mb-6">
                <Tag color="amber">New</Tag>
                <h3 className="text-xl font-black text-white">Chartink scanner alerts → auto-watchlist.</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-10 items-center">
                <div>
                  <p className="text-slate-400 text-base leading-7 mb-5">
                    Connect any Chartink scanner via webhook. When a scan fires — RSI breakout, volume surge, EMA crossover — the stock automatically lands in your TradingVerse watchlist. No manual copy-paste. No missed alerts.
                  </p>
                  <div className="space-y-3">
                    {[
                      'Set up once in Chartink — paste the webhook URL',
                      'Alerts fire in real-time during market hours',
                      'Stock appears tagged with the scan name',
                      'Order Intelligence pre-loads context immediately',
                    ].map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[9px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-slate-400 text-sm">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <BrowserFrame url="Chartink → Webhook → Watchlist">
                  <ChartinkMockup />
                </BrowserFrame>
              </div>
            </div>
          </div>

          {/* Chapter 3: Commentary */}
          <div data-reveal>
            <div className="flex items-center gap-3 mb-8">
              <span className="text-[10px] font-black tracking-widest uppercase text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full">All Day</span>
              <h3 className="text-2xl font-black text-white">The market narrates itself.</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-10 items-start">
              <div>
                <p className="text-slate-400 text-base leading-7 mb-6">
                  Every 30 minutes, TradingVerse generates live commentary — regime classification, breadth, OR levels, bias trail, and a plain-English action note. You always know where you are in the day's story.
                </p>
                <div className="space-y-4 mb-6">
                  {[
                    { icon: '🏷️', title: 'Regime detection',      desc: 'Trend Day, Range Day, Breakout, Trap, Short Squeeze — classified live.' },
                    { icon: '📊', title: 'Market breadth',         desc: 'Advance/Decline ratio. Is the move broad or narrow?' },
                    { icon: '📉', title: 'Intraday sentiment',     desc: 'Sparkline of how bullish/bearish the market has been across 10 periods.' },
                    { icon: '🔔', title: 'Reversal alerts',        desc: 'RSI velocity, MACD cross, candlestick signals — sound alerts on key events.' },
                  ].map(f => (
                    <div key={f.title} className="flex gap-3">
                      <span className="text-lg mt-0.5">{f.icon}</span>
                      <div>
                        <p className="font-semibold text-white text-sm">{f.title}</p>
                        <p className="text-slate-500 text-sm mt-0.5">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* TODO: replace with commentary screenshot */}
              <ScreenshotOrMockup
                src="/screenshots/commentary.png"
                alt="Live market commentary"
                fallback={CommentaryMockup}
                url="Market Commentary · updates every 30 min"
                badge="Live"
                badgeColor="emerald"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── ORDER INTELLIGENCE ── */}
      <section id="intelligence" className="py-24 px-6 bg-white/[0.015] border-y border-white/8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <Tag color="amber">Order Intelligence</Tag>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight mt-4">
              Four agents review<br />
              <span className="text-slate-500">every trade before you place it.</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Before you pull the trigger, TradingVerse runs four independent analysis agents and synthesises a scenario. You know exactly what you're walking into.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-12 items-start mb-14" data-reveal>
            {/* TODO: replace with order intelligence screenshot */}
            <ScreenshotOrMockup
              src="/screenshots/order-intelligence.png"
              alt="Order Intelligence verdict panel"
              fallback={OrderIntelligenceMockup}
              url="Order Intelligence · NIFTY 24400 CE"
            />
            <div className="space-y-5">
              {[
                { icon: '📈', color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/15', name: 'Trend Agent',
                  desc: 'Checks trend alignment across 5-min, 15-min, and daily timeframes. Is this trade with the structure or against it?' },
                { icon: '📊', color: 'text-sky-400',     bg: 'bg-sky-500/8 border-sky-500/15',         name: 'Volatility & Regime Agent',
                  desc: 'What is the current regime — Trend Day, Range Day, Trap? Is IV high or low? Buy or sell premium right now?' },
                { icon: '🧠', color: 'text-violet-400',  bg: 'bg-violet-500/8 border-violet-500/15',   name: 'Behavioural Agent',
                  desc: 'Real-time bias detection. Flags FOMO, revenge trading, overconfidence before they cost you.' },
                { icon: '🔀', color: 'text-amber-400',   bg: 'bg-amber-500/8 border-amber-500/15',     name: 'Order Flow Agent',
                  desc: 'PCR, market breadth, BankNifty relative strength, OI buildup. Is smart money with you or against you?' },
              ].map(a => (
                <div key={a.name} className={`rounded-xl border p-5 ${a.bg}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{a.icon}</span>
                    <p className={`font-bold text-base ${a.color}`}>{a.name}</p>
                  </div>
                  <p className="text-slate-400 text-sm leading-6">{a.desc}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Scenario synthesis callout */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8" data-reveal>
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <Tag color="amber">Scenario Synthesis</Tag>
                <h3 className="text-2xl font-black mt-3 mb-3">Know the Bull, Base, and Bear before entering.</h3>
                <p className="text-slate-400 text-sm leading-7">
                  After the four agents run, Order Intelligence synthesises a scenario card — three probabilistic outcomes with price targets and invalidation levels. Risk:Reward calculated automatically.
                </p>
              </div>
              <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5 text-[11px]">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-black text-white text-sm">NIFTY 24400 CE</p>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400">R:R 1:2.8</span>
                </div>
                {[
                  { l: 'Bull', p: 52, desc: 'Break above 24,450 → 24,600', c: 'bg-emerald-500', tc: 'text-emerald-400' },
                  { l: 'Base', p: 30, desc: 'Consolidation 24,300–24,450',  c: 'bg-amber-500',   tc: 'text-amber-400'  },
                  { l: 'Bear', p: 18, desc: 'Rejection → 24,150',           c: 'bg-rose-500',    tc: 'text-rose-400'   },
                ].map(s => (
                  <div key={s.l} className="mb-3">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`font-bold text-[10px] ${s.tc}`}>{s.l} — {s.desc}</span>
                      <span className="text-[10px] text-slate-500">{s.p}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full ${s.c} rounded-full`} style={{ width: `${s.p}%` }} />
                    </div>
                  </div>
                ))}
                <p className="mt-3 text-[10px] text-slate-500 italic leading-5">"Trend day confirmed. Low IV favours buying. All agents bullish. Entry above 24,420, stop 24,260."</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── GAMES ── */}
      <section id="games" className="py-24 px-6 border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <Tag color="violet">Trading Games</Tag>
              <h2 className="text-4xl md:text-5xl font-black mb-5 leading-tight mt-4">
                Train your instincts.<br />Risk-free.
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-6">
                Real market scenarios. Real decisions. No right answer is obvious — just like actual trading.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  { name: 'Edge Simulator',    desc: 'Does your system survive 50 trades? See the math.' },
                  { name: 'Discipline Test',   desc: '10 psychology situations — FOMO, revenge, overconfidence.' },
                  { name: 'Market Direction',  desc: 'Read the last 5 candles. Predict the next move.' },
                  { name: 'Risk Management',   desc: 'Protect an open trade under pressure with a live clock.' },
                  { name: 'Scenario Challenge',desc: 'Global cues + chart context. What do you do?' },
                ].map(g => (
                  <div key={g.name} className="flex gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-2 flex-shrink-0" />
                    <div>
                      <span className="text-white text-sm font-semibold">{g.name}</span>
                      <span className="text-slate-500 text-sm"> — {g.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/games" className="inline-flex items-center gap-2 text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors">
                See all games →
              </Link>
            </div>
            <div data-reveal>
              <div className="p-6 rounded-3xl border border-white/10 bg-white/[0.02]">
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-4 font-semibold">Scenario Challenge · Try it now</p>
                <ScenarioGame />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LEARN ── */}
      <section id="learn" className="py-24 px-6 border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between mb-10" data-reveal>
            <div>
              <Tag color="blue">Learn</Tag>
              <h2 className="text-4xl font-black mt-3 leading-tight max-w-xl">
                What the best traders learned the hard way.
              </h2>
            </div>
            <Link href="/learn" className="text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors hidden md:flex items-center gap-1 mt-2">
              Browse library →
            </Link>
          </div>
          <Link href="/learn/articles/trader-who-knew-everything" data-reveal
            className="group block p-8 rounded-2xl border border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] transition-all mb-5">
            <span className="text-xs font-bold tracking-widest uppercase text-cyan-400 mb-3 block">Market Psychology</span>
            <h3 className="text-xl md:text-2xl font-black mb-3 group-hover:text-blue-300 transition-colors leading-tight">
              The trader who knew everything but lost anyway
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed max-w-2xl mb-4">
              He could identify every pattern. He knew support, resistance, order flow. He had read every book. And yet, at the end of each month, his account shrank. The problem was never knowledge.
            </p>
            <span className="text-sm font-semibold text-cyan-400 group-hover:underline">Read article →</span>
          </Link>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-reveal>
            {[
              { title: 'Trading in the Zone',              author: 'Mark Douglas',      emoji: '🧠', slug: 'trading-in-the-zone',          lesson: 'Your edge means nothing without the mental discipline to execute it consistently.' },
              { title: 'Market Wizards',                   author: 'Jack Schwager',     emoji: '⚡', slug: 'market-wizards',               lesson: 'Every great trader has found a unique edge. Find yours and exploit it relentlessly.' },
              { title: 'The Daily Trading Coach',          author: 'Brett Steenbarger', emoji: '🎯', slug: 'daily-trading-coach',          lesson: 'Self-improvement is the highest-leverage activity in trading.' },
              { title: 'Reminiscences of a Stock Operator',author: 'Edwin Lefèvre',     emoji: '📜', slug: 'reminiscences-stock-operator', lesson: 'Human nature never changes. The market has always been the same game.' },
            ].map((b, i) => (
              <Link key={b.title} href={`/learn/books/${b.slug}`}
                className="group relative rounded-xl border border-white/8 bg-white/[0.02] p-5 hover:border-blue-500/30 hover:bg-blue-500/[0.03] transition-all overflow-hidden min-h-[130px] block"
                style={{ transitionDelay: `${i * 0.07}s` }}>
                <div className="transition-all duration-300 group-hover:opacity-0">
                  <div className="text-2xl mb-2">{b.emoji}</div>
                  <p className="text-xs font-bold text-white leading-tight mb-0.5">{b.title}</p>
                  <p className="text-[10px] text-slate-500">{b.author}</p>
                </div>
                <div className="absolute inset-0 p-4 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <p className="text-blue-300 text-[10px] leading-5 italic">"{b.lesson}"</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── INVESTING SUITE ── */}
      <section className="py-24 px-6 border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <Tag color="sky">Investing Suite</Tag>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight mt-4">
              Not just for day traders.
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              For medium to long-term investors — AI tools combining technical structure, macro intelligence, and cross-asset context.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-10 items-start mb-10" data-reveal>
            <div>
              <Tag color="sky">Chart Analyser</Tag>
              <h3 className="text-2xl font-black mt-3 mb-3">Upload any chart. Get a full AI analysis.</h3>
              <p className="text-slate-400 text-sm leading-7 mb-5">
                Paste any daily or weekly chart — equity, index, ETF. The AI reads technical structure, relative strength vs Nifty, sector positioning, and sentiment. Outputs a scored Bull/Bear story you can act on.
              </p>
              <div className="space-y-2 mb-5">
                {['Technical structure & pattern recognition', 'Relative strength vs Nifty 50', 'Stage analysis (Weinstein framework)', 'Bull / Bear scenarios with price targets'].map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-sky-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-slate-400 text-sm">{f}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mb-5 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-emerald-400 font-semibold">Free</span> · 3 analyses/day
                <span className="text-slate-700">|</span>
                <span className="text-violet-400 font-semibold">Pro</span> · Unlimited
              </div>
              <Link href="/investing/chart-analyser" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors">
                Try Chart Analyser →
              </Link>
            </div>
            {/* TODO: replace with chart analyser screenshot */}
            <ScreenshotOrMockup
              src="/screenshots/chart-analyser.png"
              alt="Chart Analyser AI output"
              fallback={ChartAnalyserMockup}
              url="Chart Analyser · RELIANCE Weekly"
            />
          </div>
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-8" data-reveal>
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <Tag color="violet">AI Macro</Tag>
                <h3 className="text-2xl font-black mt-3 mb-2">Connect the dots — macro to portfolio.</h3>
                <p className="text-slate-400 text-sm leading-7">
                  Multi-horizon strategic outlook combining macro, geopolitics, and AI disruption. Synthesises Dalio, Marks, Soros, and Burry frameworks into Bull/Base/Bear cases across 3M → 10Y horizons, with key signposts and a contrarian stress test.
                </p>
              </div>
              <Link href="/investing/strategic-view"
                className="flex-shrink-0 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl text-sm transition-colors text-center">
                Explore Strategic View →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-24 px-6 border-b border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <Tag color="violet">Pricing</Tag>
            <h2 className="text-4xl font-black mb-3 mt-4">Start free. Upgrade when ready.</h2>
            <p className="text-slate-400">No credit card required. The free tier is genuinely useful — not a teaser.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6" data-reveal>
            {/* Free */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8">
              <p className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2">Free</p>
              <p className="text-4xl font-black mb-1">₹0</p>
              <p className="text-slate-500 text-sm mb-7">Forever free · No card needed</p>
              <ul className="space-y-3 mb-8">
                {[
                  [true,  'Live market data & indices'],
                  [true,  'Option chain viewer'],
                  [true,  'Trading games & psychology tools'],
                  [true,  'Book summaries & learning library'],
                  [true,  'Chart analyser', '3/day'],
                  [true,  'Order intelligence', '3/day'],
                  [false, 'Order placement (broker integrated)'],
                  [false, 'Unlimited AI analysis'],
                  [false, 'Chartink webhook integration'],
                  [false, 'Behavioural agent (real-time)'],
                  [false, 'Portfolio positions & P&L'],
                ].map(([inc, label, note], i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <svg className={`w-4 h-4 flex-shrink-0 ${inc ? 'text-emerald-400' : 'text-slate-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {inc
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />}
                    </svg>
                    <span className={inc ? 'text-slate-300' : 'text-slate-600'}>{label}</span>
                    {note && <span className="ml-auto text-[10px] text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{note}</span>}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block text-center py-3 rounded-xl border border-white/10 text-white font-semibold text-sm hover:bg-white/5 transition-colors">
                Get started free
              </Link>
            </div>
            {/* Pro */}
            <div className="relative bg-violet-600/10 border border-violet-500/30 rounded-2xl p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/8 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold tracking-widest uppercase text-violet-400">Pro</p>
                  <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300">Early Access</span>
                </div>
                <p className="text-4xl font-black mb-1">₹499<span className="text-lg font-semibold text-slate-400">/mo</span></p>
                <p className="text-slate-400 text-sm mb-7">Everything to trade professionally</p>
                <ul className="space-y-3 mb-8">
                  {[
                    'Everything in Free',
                    'Order placement (Kite integrated)',
                    'Unlimited chart analysis',
                    'Unlimited order intelligence',
                    'Chartink webhook integration',
                    'Pre-market movers & sector data',
                    'Behavioural agent (real-time)',
                    'Portfolio positions & P&L tracking',
                    'Priority support',
                  ].map((label, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <svg className="w-4 h-4 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-slate-200">{label}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/upgrade"
                  className="block text-center py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors shadow-lg shadow-violet-500/20">
                  Upgrade to Pro →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-28 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-violet-600/8 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-2xl mx-auto text-center" data-reveal>
          <h2 className="text-4xl md:text-5xl font-black mb-5 leading-tight">
            Your market ritual<br />starts here.
          </h2>
          <p className="text-slate-400 text-base leading-7 mb-10">
            Join Indian traders who've stopped guessing and started reading the market — with context, agents, and a complete workflow.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login"
              className="w-full sm:w-auto px-10 py-4 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-2xl transition-all text-base shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:-translate-y-0.5">
              Get Started Free →
            </Link>
            <Link href="/trades"
              className="w-full sm:w-auto px-10 py-4 bg-white/5 hover:bg-white/8 border border-white/10 text-white font-semibold rounded-2xl transition-all text-base">
              Open Terminal
            </Link>
          </div>
          <p className="mt-5 text-xs text-slate-600">
            Already have an account? <Link href="/login" className="text-violet-400 hover:text-violet-300 transition-colors">Sign in →</Link>
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/8 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black text-white">TradingVerse</span>
            <span className="text-xs text-slate-600">© 2026. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="#workflow"   className="hover:text-white transition-colors">How it works</a>
            <a href="#intelligence" className="hover:text-white transition-colors">Intelligence</a>
            <a href="#games"      className="hover:text-white transition-colors">Games</a>
            <a href="#pricing"    className="hover:text-white transition-colors">Pricing</a>
            <Link href="/learn"   className="hover:text-white transition-colors">Learn</Link>
            <Link href="/disclaimer" className="hover:text-white transition-colors">Disclaimer</Link>
            <Link href="/login"   className="hover:text-white transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
