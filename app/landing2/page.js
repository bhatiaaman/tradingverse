'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible') }),
      { threshold: 0.08 }
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

// ── Reusable label pill ─────────────────────────────────────────────────────
function Tag({ children, color = 'violet' }) {
  const colors = {
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    amber:   'text-amber-400 bg-amber-500/10 border-amber-500/25',
    sky:     'text-sky-400 bg-sky-500/10 border-sky-500/25',
    rose:    'text-rose-400 bg-rose-500/10 border-rose-500/25',
    blue:    'text-blue-400 bg-blue-500/10 border-blue-500/25',
    orange:  'text-orange-400 bg-orange-500/10 border-orange-500/25',
  }
  return (
    <span className={`inline-block text-[9px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded-full border ${colors[color]}`}>
      {children}
    </span>
  )
}

// ── Pre-market mockup ────────────────────────────────────────────────────────
function PreMarketMockup() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a1628] overflow-hidden text-[11px] shadow-2xl shadow-black/50">
      {/* Window bar */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/8 bg-[#060e1d]">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-3 text-[10px] text-slate-600 font-mono">tradingverse.in/trades/pre-market</span>
        <span className="ml-auto text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">● Live</span>
      </div>
      <div className="p-4 space-y-3">
        {/* Header */}
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

        {/* Global cues */}
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

        {/* Key levels */}
        <div>
          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-2">Nifty Key Levels</p>
          <div className="flex gap-2">
            <div className="flex-1 bg-white/[0.03] border border-white/8 rounded-lg p-2.5">
              <p className="text-[9px] text-slate-500 mb-1">Resistance</p>
              <p className="font-bold text-amber-400 font-mono">24,600</p>
              <p className="text-[9px] text-slate-600 mt-0.5">Last week high</p>
            </div>
            <div className="flex-1 bg-white/[0.03] border border-white/8 rounded-lg p-2.5">
              <p className="text-[9px] text-slate-500 mb-1">Support</p>
              <p className="font-bold text-sky-400 font-mono">24,200</p>
              <p className="text-[9px] text-slate-600 mt-0.5">VWAP anchor</p>
            </div>
            <div className="flex-1 bg-white/[0.03] border border-white/8 rounded-lg p-2.5">
              <p className="text-[9px] text-slate-500 mb-1">India VIX</p>
              <p className="font-bold text-yellow-400 font-mono">13.45</p>
              <p className="text-[9px] text-slate-600 mt-0.5">Low — calm open</p>
            </div>
          </div>
        </div>

        {/* Sector heatmap strip */}
        <div>
          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-2">Sector Setup</p>
          <div className="flex gap-1 flex-wrap">
            {[
              { s: 'IT',       v: '+1.4%', up: true  },
              { s: 'BANK',     v: '+0.9%', up: true  },
              { s: 'AUTO',     v: '+0.6%', up: true  },
              { s: 'FMCG',     v: '-0.2%', up: false },
              { s: 'PHARMA',   v: '-0.5%', up: false },
              { s: 'METAL',    v: '+0.3%', up: true  },
            ].map(s => (
              <span key={s.s} className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${s.up ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                {s.s} {s.v}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Terminal mockup ──────────────────────────────────────────────────────────
function TerminalMockup() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#060b14] overflow-hidden text-[11px] shadow-2xl shadow-black/50">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/8 bg-[#040810]">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-3 text-[10px] text-slate-600 font-mono">tradingverse.in/trades</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-semibold">● Kite</span>
          <span className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded-full font-semibold">Live</span>
        </span>
      </div>

      <div className="grid grid-cols-12 gap-px bg-white/5 min-h-[300px]">
        {/* Left col — indices + watchlist */}
        <div className="col-span-3 bg-[#060b14] p-3 space-y-3">
          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600">Indices</p>
          {[
            { name: 'NIFTY 50',   val: '24,412', chg: '+0.58%', up: true  },
            { name: 'BANKNIFTY',  val: '52,640', chg: '+0.84%', up: true  },
            { name: 'INDIA VIX',  val: '13.45',  chg: '-3.2%',  up: false },
            { name: 'SENSEX',     val: '80,218', chg: '+0.61%', up: true  },
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
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600">Watchlist</p>
              <span className="text-[8px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold">Chartink ⚡</span>
            </div>
            {[
              { sym: 'RELIANCE', chg: '+1.2%', up: true, tag: '🔔 scanner' },
              { sym: 'HDFCBANK', chg: '+0.9%', up: true, tag: '' },
              { sym: 'INFY',     chg: '+1.8%', up: true, tag: '🔔 scanner' },
              { sym: 'TATASTEEL',chg: '-0.4%', up: false,tag: '' },
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

        {/* Centre — chart area */}
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
          {/* SVG chart */}
          <div className="flex-1 min-h-[120px] rounded-lg bg-slate-900/40 border border-white/5 overflow-hidden relative">
            <svg viewBox="0 0 300 120" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,90 L20,82 L40,75 L60,85 L80,72 L100,65 L120,70 L140,58 L160,50 L180,55 L200,44 L220,38 L240,45 L260,35 L280,28 L300,22" fill="none" stroke="#34d399" strokeWidth="1.5" />
              <path d="M0,90 L20,82 L40,75 L60,85 L80,72 L100,65 L120,70 L140,58 L160,50 L180,55 L200,44 L220,38 L240,45 L260,35 L280,28 L300,22 L300,120 L0,120 Z" fill="url(#chartGrad2)" />
              {/* Candles */}
              {[20,40,60,80,100,120,140,160,180,200,220,240,260,280].map((x, i) => {
                const ups = [1,0,1,1,0,1,1,1,0,1,1,0,1,1]
                const up = ups[i]
                const by = 90 - i*5
                const color = up ? '#34d399' : '#f87171'
                return (
                  <g key={x}>
                    <line x1={x} y1={by - (up?8:4)} x2={x} y2={by + (up?4:8)} stroke={color} strokeWidth="0.8" opacity="0.5" />
                    <rect x={x-4} y={up ? by-6 : by-2} width={8} height={6} fill={color} opacity="0.8" rx="0.5" />
                  </g>
                )
              })}
            </svg>
            {/* OR box label */}
            <div className="absolute top-2 left-2 text-[9px] bg-blue-500/15 border border-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">OR: 24,310H / 24,268L</div>
          </div>
          {/* Timeframe tabs */}
          <div className="flex gap-1 mt-2">
            {['1m','5m','15m','1h','D'].map((t,i) => (
              <button key={t} className={`px-2 py-0.5 rounded text-[9px] font-bold ${i===1 ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300 border border-white/5'}`}>{t}</button>
            ))}
            <button className="ml-auto text-[9px] font-semibold text-violet-400 border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 rounded">⊕ Options</button>
            <button className="text-[9px] font-semibold text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded">Place Order</button>
          </div>
        </div>

        {/* Right col — option chain + positions */}
        <div className="col-span-3 bg-[#060b14] p-3">
          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-2">Option Chain · 24400</p>
          <div className="space-y-0.5 mb-3">
            <div className="grid grid-cols-3 text-[9px] text-slate-600 mb-1 px-1">
              <span>OI</span><span className="text-center">Strike</span><span className="text-right">OI</span>
            </div>
            {[
              { s: '24600', co: '8.2L',  po: '2.1L',  atm: false, itm: false },
              { s: '24500', co: '12.4L', po: '3.8L',  atm: false, itm: false },
              { s: '24400', co: '18.6L', po: '18.2L', atm: true,  itm: false },
              { s: '24300', co: '3.2L',  po: '14.1L', atm: false, itm: true  },
              { s: '24200', co: '1.8L',  po: '11.3L', atm: false, itm: true  },
            ].map(r => (
              <div key={r.s} className={`grid grid-cols-3 items-center px-1 py-0.5 rounded text-[9px] ${r.atm ? 'bg-blue-500/10 border border-blue-500/15' : ''}`}>
                <span className="font-mono text-sky-400">{r.co}</span>
                <span className={`text-center font-bold ${r.atm ? 'text-blue-300' : r.itm ? 'text-slate-500' : 'text-slate-300'}`}>{r.s}</span>
                <span className="font-mono text-right text-rose-400">{r.po}</span>
              </div>
            ))}
          </div>

          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-1.5">Open Positions</p>
          <div className="space-y-1">
            <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-lg p-2">
              <div className="flex justify-between">
                <p className="font-bold text-emerald-300 text-[10px]">NIFTY 24400 CE</p>
                <p className="text-emerald-400 font-bold text-[10px]">+₹3,240</p>
              </div>
              <p className="text-[9px] text-slate-500">Qty: 50 · Avg: 142 · LTP: 207</p>
            </div>
            <div className="bg-rose-500/8 border border-rose-500/15 rounded-lg p-2">
              <div className="flex justify-between">
                <p className="font-bold text-rose-300 text-[10px]">BANKNIFTY 52500 PE</p>
                <p className="text-rose-400 font-bold text-[10px]">-₹840</p>
              </div>
              <p className="text-[9px] text-slate-500">Qty: 15 · Avg: 98 · LTP: 42</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Commentary mockup ────────────────────────────────────────────────────────
function CommentaryMockup() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#060b14] overflow-hidden text-[11px] shadow-2xl shadow-black/50">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/8 bg-[#040810]">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-3 text-[10px] text-slate-600 font-mono">Market Commentary · updates every 30 min</span>
      </div>
      <div className="p-4 space-y-3">
        {/* Bias header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-green-900/50 text-green-300 border border-green-700/40 flex items-center gap-1.5">
              <span>📈</span> Trending Up
            </span>
            <span className="text-lg">🐂</span>
            <p className="font-bold text-white text-sm">Bulls in control — OR breakout confirmed</p>
          </div>
          <span className="text-[10px] text-slate-600 font-mono">11:32</span>
        </div>

        {/* Metrics row */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Breadth:</span>
            <span className="font-mono font-bold text-emerald-400">1,847↑</span>
            <span className="font-mono font-bold text-rose-400">412↓</span>
            <span className="text-slate-600">(4.5:1)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">OR:</span>
            <span className="font-mono text-emerald-400">24,380H</span>
            <span className="font-mono text-rose-400">24,268L</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Regime:</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            <span className="font-semibold text-green-300">Trend Up</span>
            <span className="text-[9px] font-bold text-emerald-400">HIGH</span>
            <span className="text-[9px] px-1 py-0.5 rounded bg-green-900/40 text-green-400">▲ VWAP</span>
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

        {/* Action */}
        <div className="flex items-start gap-2 bg-cyan-900/20 border border-cyan-700/30 rounded-lg p-2.5">
          <span className="text-cyan-400 mt-0.5">ⓘ</span>
          <span className="text-cyan-300 text-[11px] font-medium">Strong breadth with 4.5:1 A/D ratio. Trend day confirmed — dips to VWAP are buy opportunities. Watch 24,600 as resistance.</span>
        </div>

        {/* Intraday sentiment sparkline */}
        <div className="flex items-center gap-3">
          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 flex-shrink-0">Intraday Sentiment</p>
          <div className="flex-1">
            <svg viewBox="0 0 200 44" className="w-full h-8">
              <defs>
                <linearGradient id="sg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="6" y1="22" x2="186" y2="22" stroke="#64748b" strokeWidth="1" strokeDasharray="4,3" />
              <text x="190" y="26" fontSize="7" fill="#94a3b8">50</text>
              <polyline points="6,38 28,34 50,30 72,26 94,28 116,20 138,14 160,10 182,8" fill="none" stroke="#34d399" strokeWidth="1.5" />
              <path d="M6,38 L28,34 L50,30 L72,26 L94,28 L116,20 L138,14 L160,10 L182,8 L182,44 L6,44 Z" fill="url(#sg2)" />
              <circle cx="182" cy="8" r="3" fill="#34d399" />
            </svg>
          </div>
          <span className="text-[10px] font-bold text-emerald-400">72</span>
        </div>
      </div>
    </div>
  )
}

// ── Order Intelligence mockup ────────────────────────────────────────────────
function OrderIntelligenceMockup() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#060b14] overflow-hidden text-[11px] shadow-2xl shadow-black/50">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/8 bg-[#040810]">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-3 text-[10px] text-slate-600 font-mono">Order Intelligence · NIFTY 24400 CE</span>
      </div>
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-white text-sm">NIFTY 24400 CE</p>
            <p className="text-slate-500 text-[10px]">BUY · Qty 50 · Exp 27 Mar</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">BULLISH ✓</span>
        </div>

        {/* 3 metrics */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: 'Regime',    v: 'Trend Up',  good: true  },
            { l: 'R : R',     v: '1 : 2.8',   good: true  },
            { l: 'IV Rank',   v: '38 — Low',  good: true  },
          ].map(m => (
            <div key={m.l} className={`rounded-lg p-2 border text-center ${m.good ? 'bg-emerald-500/8 border-emerald-500/15' : 'bg-rose-500/8 border-rose-500/15'}`}>
              <p className="text-[9px] text-slate-500 mb-0.5">{m.l}</p>
              <p className={`text-[10px] font-bold ${m.good ? 'text-emerald-400' : 'text-rose-400'}`}>{m.v}</p>
            </div>
          ))}
        </div>

        {/* Scenario card */}
        <div>
          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-1.5">Scenarios</p>
          {[
            { l: 'Bull', p: 52, desc: 'Break above 24,450 → 24,600', color: 'bg-emerald-500' },
            { l: 'Base', p: 30, desc: 'Consolidation 24,300–24,450',  color: 'bg-amber-500'   },
            { l: 'Bear', p: 18, desc: 'Break below VWAP → 24,150',   color: 'bg-rose-500'    },
          ].map(s => (
            <div key={s.l} className="flex items-center gap-2 mb-1">
              <span className="text-[9px] text-slate-500 w-6">{s.l}</span>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${s.p}%` }} />
              </div>
              <span className="text-[9px] text-slate-400 w-5 text-right">{s.p}%</span>
              <span className="text-[9px] text-slate-600 flex-1 truncate">{s.desc}</span>
            </div>
          ))}
        </div>

        {/* 4 agents */}
        <div>
          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-1.5">Agent Analysis</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { name: 'Trend Agent',      icon: '📈', status: 'Aligned',          color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/15', detail: 'All 3 TFs bullish' },
              { name: 'Volatility Agent', icon: '📊', status: 'Low IV — Buy',     color: 'text-sky-400',     bg: 'bg-sky-500/8 border-sky-500/15',         detail: 'IV Rank 38, VIX 13.4' },
              { name: 'Behavioural',      icon: '🧠', status: 'No bias detected', color: 'text-violet-400',  bg: 'bg-violet-500/8 border-violet-500/15',   detail: 'Clean slate' },
              { name: 'Order Flow',       icon: '🔀', status: 'Strong buying',    color: 'text-amber-400',   bg: 'bg-amber-500/8 border-amber-500/15',     detail: 'PCR 1.2, breadth 4:1' },
            ].map(a => (
              <div key={a.name} className={`rounded-lg p-2 border ${a.bg}`}>
                <div className="flex items-center gap-1 mb-0.5">
                  <span>{a.icon}</span>
                  <p className="text-[9px] text-slate-500">{a.name}</p>
                </div>
                <p className={`font-bold text-[10px] ${a.color}`}>{a.status}</p>
                <p className="text-[9px] text-slate-600 mt-0.5">{a.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* AI note */}
        <p className="text-[10px] text-slate-500 leading-4 italic border-t border-white/8 pt-3">
          "Trend day confirmed. Low IV favours buying options. All 4 agents aligned bullish. Wait for 5-min close above 24,420 before entry."
        </p>

        <button className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors">
          Place Order →
        </button>
      </div>
    </div>
  )
}

// ── Chartink mockup ──────────────────────────────────────────────────────────
function ChartinkMockup() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#060b14] overflow-hidden text-[11px] shadow-2xl shadow-black/50">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/8 bg-[#040810]">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-3 text-[10px] text-slate-600 font-mono">Chartink → Webhook → Watchlist</span>
      </div>
      <div className="p-5">
        {/* Flow diagram */}
        <div className="flex items-center gap-3 mb-5">
          {/* Chartink box */}
          <div className="flex-1 rounded-lg border border-blue-500/25 bg-blue-500/8 p-3 text-center">
            <p className="text-[9px] font-bold tracking-widest uppercase text-blue-400 mb-1">Chartink Scanner</p>
            <p className="text-[10px] text-slate-400 leading-4">RSI cross 60<br />+ Volume 2x avg</p>
          </div>
          {/* Arrow */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-px bg-amber-500/50" />
            <span className="text-[8px] text-amber-400 font-bold">Webhook</span>
            <div className="w-8 h-px bg-amber-500/50" />
          </div>
          {/* TradingVerse box */}
          <div className="flex-1 rounded-lg border border-violet-500/25 bg-violet-500/8 p-3 text-center">
            <p className="text-[9px] font-bold tracking-widest uppercase text-violet-400 mb-1">TradingVerse</p>
            <p className="text-[10px] text-slate-400 leading-4">Auto-adds to<br />watchlist</p>
          </div>
          {/* Arrow */}
          <div className="w-4 h-px bg-emerald-500/50" />
          {/* Watchlist box */}
          <div className="flex-1 rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3 text-center">
            <p className="text-[9px] font-bold tracking-widest uppercase text-emerald-400 mb-1">Watchlist</p>
            <p className="text-[10px] text-slate-400 leading-4">Ready to<br />trade</p>
          </div>
        </div>

        {/* Live alert log */}
        <p className="text-[9px] font-bold tracking-widest uppercase text-slate-600 mb-2">Live Alerts Today</p>
        <div className="space-y-1.5">
          {[
            { time: '09:22', sym: 'RELIANCE',  cond: 'RSI > 60 + Vol surge', action: 'Added to watchlist' },
            { time: '10:08', sym: 'INFY',      cond: 'Breakout above 52w',   action: 'Added to watchlist' },
            { time: '11:14', sym: 'AXISBANK',  cond: 'EMA 9 cross 21',       action: 'Added to watchlist' },
            { time: '13:41', sym: 'TATAMOTORS',cond: 'RSI > 60 + Vol surge', action: 'Added to watchlist' },
          ].map(a => (
            <div key={a.sym} className="flex items-center gap-3 py-1.5 border-b border-white/5">
              <span className="text-[9px] font-mono text-slate-600 w-10">{a.time}</span>
              <span className="font-bold text-slate-200 text-[10px] w-20">{a.sym}</span>
              <span className="text-slate-500 text-[9px] flex-1">{a.cond}</span>
              <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/15 px-1.5 py-0.5 rounded-full">⚡ {a.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Games mockup ─────────────────────────────────────────────────────────────
function GamesMockup() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#060b14] overflow-hidden text-[11px] shadow-2xl shadow-black/50 max-w-sm">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/8 bg-[#040810]">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-3 text-[10px] text-slate-600 font-mono">Trading Games</span>
      </div>
      <div className="p-4">
        <p className="text-[9px] font-bold tracking-widest uppercase text-violet-400 mb-3">Scenario Challenge</p>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {[
            { l: 'Dow Jones',   v: '-1.8%',           bad: true  },
            { l: 'GIFT Nifty',  v: '-180 pts',         bad: true  },
            { l: 'India VIX',   v: '18.4 ↑',           bad: true  },
            { l: 'Nifty',       v: 'Near weekly S/R',  bad: false },
          ].map(c => (
            <div key={c.l} className={`px-2 py-1.5 rounded-lg border flex justify-between text-[9px] ${c.bad ? 'bg-rose-500/8 border-rose-500/15' : 'bg-amber-500/8 border-amber-500/15'}`}>
              <span className="text-slate-500">{c.l}</span>
              <span className={`font-bold ${c.bad ? 'text-rose-400' : 'text-amber-400'}`}>{c.v}</span>
            </div>
          ))}
        </div>
        <p className="text-white font-semibold text-xs mb-3 leading-5">Gap down expected. Nifty near weekly support. 9:15 AM. What do you do?</p>
        <div className="space-y-1.5">
          {[
            { id: 'a', t: 'Short immediately — global cues bearish', correct: false },
            { id: 'b', t: 'Wait 15–30 mins for confirmation', correct: true  },
            { id: 'c', t: 'Buy the dip — support will hold',  correct: false },
          ].map(o => (
            <div key={o.id} className={`px-3 py-2 rounded-lg border text-[10px] ${o.correct ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300 font-semibold' : 'border-white/8 text-slate-400'}`}>
              <span className="font-bold mr-1.5 text-slate-500 uppercase">{o.id}.</span>{o.t}
              {o.correct && <span className="ml-2 text-emerald-400">✓</span>}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[9px] text-slate-600 leading-4 italic">"Opening volatility peaks in first 15 mins. Waiting for confirmation is the professional move."</p>
      </div>
    </div>
  )
}

// ── Chart analyser mockup ────────────────────────────────────────────────────
function ChartAnalyserMockup() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden text-[11px] shadow-xl">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/8 bg-white/[0.02]">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-3 text-[10px] text-slate-600 font-mono">Chart Analyser · RELIANCE Weekly</span>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[9px] font-bold tracking-widest uppercase text-sky-400 mb-1">AI VISION</p>
            <p className="font-black text-white text-base">RELIANCE · Weekly</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500">Score</p>
            <p className="text-2xl font-black text-sky-400">7<span className="text-sm text-slate-500">/10</span></p>
          </div>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full mb-1">
          <div className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full" style={{width:'70%'}} />
        </div>
        <div className="flex gap-1.5 mb-3 flex-wrap">
          <span className="text-[9px] bg-sky-500/10 border border-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full font-bold">Stage 2 Advance</span>
          <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Uptrend</span>
          <span className="text-[9px] bg-violet-500/10 border border-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full font-bold">Strong RS</span>
        </div>
        <p className="text-[10px] text-slate-400 leading-5 mb-3">Breaking above multi-month consolidation with volume expansion. Relative strength vs Nifty improving. MACD positive crossover on weekly.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { l: 'Technical',  v: 'Breakout',        color: 'text-emerald-400' },
            { l: 'RS vs Nifty',v: 'Outperforming ↑', color: 'text-emerald-400' },
            { l: 'Sector',     v: 'ENERGY — Leader',  color: 'text-sky-400'    },
            { l: 'Sentiment',  v: 'Bullish',           color: 'text-emerald-400' },
          ].map(m => (
            <div key={m.l} className="bg-white/[0.03] border border-white/8 rounded-lg p-2">
              <p className="text-[9px] text-slate-600 mb-0.5">{m.l}</p>
              <p className={`text-[10px] font-bold ${m.color}`}>{m.v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Landing2() {
  useReveal()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null)

  async function handleWaitlist(e) {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      setStatus(data.alreadyJoined ? 'exists' : res.ok ? 'done' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-[#060b14] text-white overflow-x-hidden">
      <style>{`
        [data-reveal] { opacity: 0; transform: translateY(20px); transition: opacity 0.6s ease, transform 0.6s ease; }
        [data-reveal].is-visible { opacity: 1; transform: translateY(0); }
        .delay-1 { transition-delay: 0.1s; }
        .delay-2 { transition-delay: 0.2s; }
        .delay-3 { transition-delay: 0.3s; }
        .chapter-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .timeline-line { width: 2px; flex-shrink: 0; }
      `}</style>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/8 bg-[#060b14]/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-sm font-black text-white">TradingVerse</span>
            <span className="text-[9px] font-bold tracking-widest uppercase text-violet-400 bg-violet-500/15 border border-violet-500/30 px-1.5 py-0.5 rounded-full">Beta</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="#workflow" className="hover:text-white transition-colors">How it works</a>
            <a href="#intelligence" className="hover:text-white transition-colors">Intelligence</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <Link href="/learn" className="hover:text-white transition-colors">Learn</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">Sign in</Link>
            <Link href="/login" className="text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl transition-colors">
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-violet-600/10 rounded-full blur-3xl" />
          <div className="absolute top-20 left-1/4 w-64 h-64 bg-blue-600/6 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            India's Intelligence-First Trading Platform
          </div>
          <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6">
            Your complete<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400">trading workflow.</span>
          </h1>
          <p className="text-slate-400 text-lg md:text-xl leading-8 max-w-2xl mx-auto mb-4">
            From 8:50 AM pre-market context to live order execution to post-session review — every step of a serious trader's day, in one platform.
          </p>
          <p className="text-slate-600 text-sm max-w-xl mx-auto mb-10">
            Built for Indian markets. Kite-integrated. AI-powered at every step.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login" className="w-full sm:w-auto px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-2xl transition-all text-base shadow-lg shadow-violet-500/20">
              Start for Free — No Card
            </Link>
            <Link href="/trades" className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/8 border border-white/10 text-white font-semibold rounded-2xl transition-all text-base">
              Open Terminal →
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-600">Free tier: live data, option chain, chart analyser, order intelligence & more.</p>
        </div>
      </section>

      {/* ── THE STORY: A day with TradingVerse ─────────────────────────────── */}
      <section id="workflow" className="py-24 px-6 border-t border-white/5">
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

          {/* ── Chapter 1: Pre-Market ── */}
          <div className="mb-24" data-reveal>
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black tracking-widest uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">8:50 AM</span>
                <h3 className="text-2xl font-black text-white">Prepare before the bell.</h3>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-10 items-start">
              <div>
                <p className="text-slate-400 text-base leading-7 mb-6">
                  Before 9:15 AM, serious traders are already ahead. The Pre-Market page gives you everything you need to understand how the day might unfold.
                </p>
                <div className="space-y-4">
                  {[
                    { icon: '🌐', title: 'Global cues',       desc: 'Dow, Nasdaq, Crude, DXY, SGX Nifty — all in one screen.' },
                    { icon: '📍', title: 'Key S/R levels',    desc: 'Nifty & BankNifty support/resistance, pivot points, OR levels.' },
                    { icon: '🗓️', title: 'Economic calendar', desc: 'RBI, FOMC, and macro events that move markets today.' },
                    { icon: '🔥', title: 'Sector rotation',   desc: 'Which sectors are strong, which are weak — before the open.' },
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
                <Link href="/trades/pre-market" className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
                  Open Pre-Market →
                </Link>
              </div>
              <PreMarketMockup />
            </div>
          </div>

          {/* ── Chapter 2: Terminal ── */}
          <div className="mb-24" data-reveal>
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black tracking-widest uppercase text-sky-400 bg-sky-500/10 border border-sky-500/20 px-3 py-1 rounded-full">9:15 AM</span>
                <h3 className="text-2xl font-black text-white">The market opens. You're ready.</h3>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-10 items-start">
              <div className="order-2 md:order-1">
                <TerminalMockup />
              </div>
              <div className="order-1 md:order-2">
                <p className="text-slate-400 text-base leading-7 mb-6">
                  One screen. Everything you need to trade. Live charts (equity and options), option chain, watchlist, open positions, and Kite-integrated order placement.
                </p>
                <div className="space-y-4">
                  {[
                    { icon: '📈', title: 'Live charts',       desc: 'Equity and options charts side by side. Switch instruments in one click.' },
                    { icon: '⛓️', title: 'Option chain',      desc: 'Real-time OI, LTP, Greeks. Identify max pain and key strikes instantly.' },
                    { icon: '📋', title: 'Watchlist',         desc: 'Manual adds or auto-populated by Chartink scanner webhooks.' },
                    { icon: '🔖', title: 'Positions & orders','desc': 'Open positions with live P&L. Pending orders at a glance.' },
                    { icon: '⚡', title: 'Order placement',    desc: 'Place, modify, cancel — all via Kite integration without leaving the terminal.' },
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
                <Link href="/trades" className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors">
                  Open Terminal →
                </Link>
              </div>
            </div>
          </div>

          {/* ── Chapter 2.5: Chartink ── */}
          <div className="mb-24" data-reveal>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-[10px] font-black tracking-widest uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">New</span>
                <h3 className="text-xl font-black text-white">Chartink scanner alerts → auto-watchlist.</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-10 items-center">
                <div>
                  <p className="text-slate-400 text-base leading-7 mb-5">
                    Connect any Chartink scanner via webhook. When a scan fires — RSI breakout, volume surge, EMA crossover — the stock automatically lands in your TradingVerse watchlist with a timestamp. No manual copy-paste. No missed alerts.
                  </p>
                  <div className="space-y-3">
                    {[
                      'Set up once in Chartink — paste the webhook URL',
                      'Alerts fire in real-time during market hours',
                      'Stock appears in watchlist tagged with the scan name',
                      'Order Intelligence pre-loads context immediately',
                    ].map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[9px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
                        <p className="text-slate-400 text-sm">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <ChartinkMockup />
              </div>
            </div>
          </div>

          {/* ── Chapter 3: Running Commentary ── */}
          <div className="mb-24" data-reveal>
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black tracking-widest uppercase text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full">All Day</span>
                <h3 className="text-2xl font-black text-white">The market narrates itself.</h3>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-10 items-start">
              <div>
                <p className="text-slate-400 text-base leading-7 mb-6">
                  Every 30 minutes throughout the session, TradingVerse generates a live commentary of how the day is unfolding — regime classification, breadth, OR levels, bias trail, and a plain-English action note. You always know where you are in the day's story.
                </p>
                <div className="space-y-4">
                  {[
                    { icon: '🏷️', title: 'Regime detection',     desc: 'Trend Day, Range Day, Breakout, Trap, Short Squeeze — classified in real time.' },
                    { icon: '📊', title: 'Market breadth',       desc: 'Advances/Declines ratio. How broad is the move? Is it real?' },
                    { icon: '🕯️', title: 'Opening Range tracking', desc: 'OR high/low tracked all day. Breakouts and fakeouts flagged.' },
                    { icon: '📉', title: 'Intraday sentiment',   desc: 'Sparkline of how bullish/bearish the market has been across 10 periods.' },
                    { icon: '🔔', title: 'Reversal alerts',      desc: 'RSI velocity, MACD cross, candlestick signals — sound alerts on key events.' },
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
              <CommentaryMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── ORDER INTELLIGENCE (full width) ────────────────────────────────── */}
      <section id="intelligence" className="py-24 px-6 bg-white/[0.02] border-y border-white/8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-amber-400 block mb-3">Order Intelligence</span>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
              Four agents review<br />
              <span className="text-slate-500">every trade before you place it.</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Before you pull the trigger, TradingVerse runs four independent analysis agents and synthesises a scenario. You know exactly what you're walking into.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-start mb-14" data-reveal>
            <OrderIntelligenceMockup />
            <div className="space-y-6">
              {[
                {
                  icon: '📈',
                  color: 'text-emerald-400',
                  bg: 'bg-emerald-500/8 border-emerald-500/15',
                  name: 'Trend Agent',
                  desc: 'Checks trend alignment across 5-min, 15-min, and daily timeframes. Is this trade with the structure or against it?',
                },
                {
                  icon: '📊',
                  color: 'text-sky-400',
                  bg: 'bg-sky-500/8 border-sky-500/15',
                  name: 'Volatility & Regime Agent',
                  desc: 'What is the current intraday regime — Trend Day, Range Day, Trap? Is IV high or low? Should you be buying or selling options premium right now?',
                },
                {
                  icon: '🧠',
                  color: 'text-violet-400',
                  bg: 'bg-violet-500/8 border-violet-500/15',
                  name: 'Behavioural Agent',
                  desc: 'Real-time bias detection. Flags FOMO, revenge trading, overconfidence, and anchoring before they cost you. Knows your recent trade history.',
                },
                {
                  icon: '🔀',
                  color: 'text-amber-400',
                  bg: 'bg-amber-500/8 border-amber-500/15',
                  name: 'Order Flow Agent',
                  desc: 'PCR, market breadth, BankNifty relative strength, OI buildup. Is smart money positioned with you or against you?',
                },
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

          {/* Scenario card callout */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8" data-reveal>
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <Tag color="amber">Scenario Synthesis</Tag>
                <h3 className="text-2xl font-black mt-3 mb-3">Know the Bull, Base, and Bear before entering.</h3>
                <p className="text-slate-400 text-sm leading-7">
                  After the four agents run, Order Intelligence synthesises a scenario card: three probabilistic outcomes for the trade with price targets and invalidation levels. Risk:Reward is calculated automatically. No more guessing.
                </p>
              </div>
              <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5 text-[11px]">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-black text-white text-sm">NIFTY 24400 CE</p>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400">R:R 1:2.8</span>
                </div>
                {[
                  { l: 'Bull', p: 52, desc: 'Break above 24,450 → 24,600', c: 'bg-emerald-500', tc: 'text-emerald-400' },
                  { l: 'Base', p: 30, desc: 'Consolidation 24,300–24,450',  c: 'bg-amber-500',   tc: 'text-amber-400'   },
                  { l: 'Bear', p: 18, desc: 'Rejection → 24,150',           c: 'bg-rose-500',    tc: 'text-rose-400'    },
                ].map(s => (
                  <div key={s.l} className="mb-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`font-bold text-[10px] ${s.tc}`}>{s.l} — {s.desc}</span>
                      <span className="text-[10px] text-slate-500">{s.p}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full ${s.c} rounded-full`} style={{width:`${s.p}%`}} />
                    </div>
                  </div>
                ))}
                <p className="mt-4 text-[10px] text-slate-500 italic leading-5">"Trend day confirmed. Low IV favours buying. All agents bullish. Entry above 24,420, stop 24,260."</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LEARN & GAMES ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-violet-400 block mb-3">After the Session</span>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
              The edge isn't data.<br />
              <span className="text-slate-500">It's how you think.</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              The best traders spend as much time improving their mind as they do reading charts. TradingVerse is built for that too.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-10 items-start mb-10" data-reveal>
            <GamesMockup />
            <div>
              <Tag color="violet">Trading Games</Tag>
              <h3 className="text-2xl font-black mt-3 mb-3">Train your decisions without risking capital.</h3>
              <p className="text-slate-400 text-sm leading-7 mb-6">
                Scenario-based quizzes using real market setups. Gap down opens. Trending charts. Event-day positions. Test what you'd do — then see why the professional move is often counterintuitive.
              </p>
              <div className="space-y-3">
                {[
                  'Real market data — not invented scenarios',
                  'Instant feedback with professional reasoning',
                  'Track your accuracy over time',
                  'New scenarios added weekly',
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-slate-400 text-sm">{s}</p>
                  </div>
                ))}
              </div>
              <Link href="/games" className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors">
                Play a scenario →
              </Link>
            </div>
          </div>

          {/* Books strip */}
          <div className="border-t border-white/8 pt-10" data-reveal>
            <div className="flex items-center justify-between mb-5">
              <div>
                <Tag color="blue">Learn</Tag>
                <h3 className="text-xl font-black mt-2">What the best traders learned the hard way.</h3>
              </div>
              <Link href="/learn" className="text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors hidden md:flex items-center gap-1">
                Browse library →
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { emoji: '🧠', title: 'Trading in the Zone',              author: 'Mark Douglas',   lesson: 'Your edge means nothing without the discipline to execute it.' },
                { emoji: '⚡', title: 'Market Wizards',                    author: 'Jack Schwager',  lesson: 'Every great trader has a unique edge — find yours.' },
                { emoji: '🎯', title: 'The Daily Trading Coach',           author: 'Brett Steenbarger', lesson: 'Self-improvement is the highest-leverage activity in trading.' },
                { emoji: '📜', title: 'Reminiscences of a Stock Operator', author: 'Edwin Lefèvre', lesson: 'Human nature never changes — the market has always been the same game.' },
              ].map((b, i) => (
                <Link key={b.title} href={`/learn/books/${['trading-in-the-zone','market-wizards','daily-trading-coach','reminiscences-stock-operator'][i]}`}
                  className="group relative rounded-xl border border-white/8 bg-white/[0.02] p-5 hover:border-blue-500/30 hover:bg-blue-500/[0.03] transition-all overflow-hidden min-h-[130px] block">
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
        </div>
      </section>

      {/* ── INVESTING SUITE ───────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-sky-400 block mb-3">Investing Suite</span>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
              Not just for day traders.
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              For medium to long-term investors — AI tools that combine technical structure, macro intelligence, and cross-asset context.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-10 items-start" data-reveal>
            <div>
              <Tag color="sky">Chart Analyser</Tag>
              <h3 className="text-2xl font-black mt-3 mb-3">Upload any chart. Get a full AI analysis.</h3>
              <p className="text-slate-400 text-sm leading-7 mb-5">
                Paste any daily or weekly chart — equity, index, ETF. The AI reads technical structure (stage analysis, patterns, trend), relative strength vs Nifty, sector positioning, and sentiment. Outputs a scored Bull/Bear story you can act on.
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
              <Link href="/investing/chart-analyser" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors">
                Try Chart Analyser →
              </Link>
            </div>
            <ChartAnalyserMockup />
          </div>

          {/* Strategic View teaser */}
          <div className="mt-10 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-8" data-reveal>
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <Tag color="violet">AI Macro</Tag>
                <h3 className="text-2xl font-black mt-3 mb-2">Connect the Dots — macro to portfolio.</h3>
                <p className="text-slate-400 text-sm leading-7">
                  Multi-horizon strategic outlook combining macro, geopolitics, AI disruption, demographics, and energy. Synthesises Dalio, Marks, Soros, and Burry frameworks into Bull / Base / Bear cases across 3M → 10Y horizons, with key signposts and a contrarian stress test.
                </p>
              </div>
              <Link href="/investing/strategic-view" className="flex-shrink-0 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl text-sm transition-colors text-center">
                Explore Strategic View →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 border-b border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-violet-400 block mb-3">Pricing</span>
            <h2 className="text-4xl font-black mb-3">Start free. Upgrade when ready.</h2>
            <p className="text-slate-400">No credit card required. Free tier is genuinely useful — not a teaser.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6" data-reveal>
            {/* Free */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8">
              <p className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2">Free</p>
              <p className="text-4xl font-black mb-1">₹0</p>
              <p className="text-slate-500 text-sm mb-7">Forever free · No card</p>
              <ul className="space-y-2.5 mb-8">
                {[
                  [true,  'Live market data & indices'],
                  [true,  'Option chain viewer'],
                  [true,  'Trading games & psychology tools'],
                  [true,  'Book summaries & learning library'],
                  [true,  'Chart analyser', '3/day'],
                  [true,  'Order intelligence (AI pre-trade)', '3/day'],
                  [false, 'Order placement (broker integrated)'],
                  [false, 'Unlimited AI analysis'],
                  [false, 'Chartink webhook integration'],
                  [false, 'Behavioural agent (real-time)'],
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
                <ul className="space-y-2.5 mb-8">
                  {[
                    'Everything in Free',
                    'Order placement (Kite integrated)',
                    'Unlimited chart analysis',
                    'Unlimited order intelligence',
                    'Chartink webhook integration',
                    'Pre-market movers & sector data',
                    'Behavioural agent (real-time)',
                    'Portfolio positions & P&L tracking',
                  ].map((label, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <svg className="w-4 h-4 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-slate-200">{label}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/pricing" className="block text-center py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors shadow-lg shadow-violet-500/20">
                  Join waitlist for Pro
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-violet-600/8 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-2xl mx-auto text-center" data-reveal>
          <h2 className="text-4xl md:text-5xl font-black mb-5 leading-tight">
            Ready to trade<br />with intelligence?
          </h2>
          <p className="text-slate-400 text-base leading-7 mb-10">
            Join Indian traders who've stopped guessing and started reading the market — with context, agents, and a complete workflow.
          </p>
          <form onSubmit={handleWaitlist} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-6">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email" required
              disabled={status === 'done' || status === 'exists'}
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 text-sm outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50" />
            <button type="submit" disabled={status === 'loading' || status === 'done' || status === 'exists'}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors whitespace-nowrap">
              {status === 'loading' ? 'Joining…' : status === 'done' ? 'You\'re in ✓' : status === 'exists' ? 'Already joined ✓' : 'Join Waitlist'}
            </button>
          </form>
          {status === 'error' && <p className="text-rose-400 text-xs mb-4">Something went wrong. Please try again.</p>}
          <p className="text-xs text-slate-600">Or <Link href="/login" className="text-violet-400 hover:text-violet-300 transition-colors">create a free account now →</Link></p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/8 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black text-white">TradingVerse</span>
            <span className="text-xs text-slate-600">© 2026. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/learn" className="hover:text-white transition-colors">Learn</Link>
            <Link href="/disclaimer" className="hover:text-white transition-colors">Disclaimer</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
          </div>
        </div>
        <div className="max-w-5xl mx-auto mt-6 pt-6 border-t border-white/5">
          <p className="text-[11px] text-slate-700 leading-5 text-center">
            TradingVerse is an informational and educational platform. Nothing on this site constitutes financial advice.{' '}
            <Link href="/disclaimer" className="underline hover:text-slate-500 transition-colors">Read full disclaimer →</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
