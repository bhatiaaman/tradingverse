'use client'

import { useState } from 'react'
import Link from 'next/link'

// ── Ticker ─────────────────────────────────────────────────────────────────
const TICKERS = [
  { sym: 'NIFTY 50', val: '22,347.60', chg: '+0.84%', up: true },
  { sym: 'BANKNIFTY', val: '47,891.25', chg: '+1.12%', up: true },
  { sym: 'SENSEX', val: '73,648.30', chg: '+0.76%', up: true },
  { sym: 'NIFTY IT', val: '38,421.10', chg: '-0.34%', up: false },
  { sym: 'NIFTY AUTO', val: '21,044.85', chg: '+1.58%', up: true },
  { sym: 'GOLD', val: '₹63,240', chg: '+0.22%', up: true },
  { sym: 'CRUDE OIL', val: '$83.40', chg: '-0.61%', up: false },
  { sym: 'USD/INR', val: '83.42', chg: '+0.08%', up: false },
]

function Ticker() {
  return (
    <div className="overflow-hidden border-b border-white/5 bg-white/[0.02] py-2 shrink-0">
      <div className="ticker-track flex gap-14 w-max">
        {[...TICKERS, ...TICKERS].map((t, i) => (
          <span key={i} className="flex items-center gap-2 text-xs whitespace-nowrap">
            <span className="text-slate-500">{t.sym}</span>
            <span className="text-slate-200 font-semibold">{t.val}</span>
            <span className={t.up ? 'text-emerald-400' : 'text-rose-400'}>{t.chg}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────
const NAV = [
  { icon: '🏠', label: 'Home',       href: '/',                  active: true },
  { icon: '🌅', label: 'Pre-Market', href: '/trades/pre-market', active: false },
  { icon: '📊', label: 'Dashboard',  href: '/trades',            active: false },
  { icon: '🎮', label: 'Games',      href: '#',                  active: false },
  { icon: '📘', label: 'Concepts',   href: '#',                  active: false },
  { icon: '📰', label: 'Articles',   href: '#',                  active: false },
  { icon: '📚', label: 'Books',      href: '#',                  active: false },
]

function Sidebar() {
  return (
    <aside className="w-[200px] shrink-0 flex flex-col border-r border-white/5 bg-[#080d1a]">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/5">
        <span className="text-base font-black tracking-tight">
          Trading<span className="text-blue-400">Verse</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-0.5 p-3 pt-4">
        {NAV.map(n => (
          <Link key={n.label} href={n.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group
              ${n.active
                ? 'bg-blue-600/20 text-blue-300 font-semibold'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
              }`}>
            <span className="text-base">{n.icon}</span>
            <span>{n.label}</span>
            {n.active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
          </Link>
        ))}
      </nav>

      {/* Market status */}
      <div className="p-3 border-t border-white/5">
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/50">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-400">Market Open</span>
          </div>
          <p className="text-[10px] text-slate-500">NSE · BSE · MCX</p>
        </div>
      </div>
    </aside>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({ sym, val, chg, up, icon }) {
  return (
    <div className={`card-base flex flex-col gap-2 p-4 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5
      ${up ? 'border-emerald-900/40 bg-emerald-950/20 hover:border-emerald-700/60' : 'border-rose-900/40 bg-rose-950/20 hover:border-rose-700/60'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium">{sym}</span>
        <span className="text-base">{icon}</span>
      </div>
      <div className="text-lg font-bold text-slate-100">{val}</div>
      <div className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{chg} today</div>
    </div>
  )
}

// ── Playable Game card ─────────────────────────────────────────────────────
function GameCard() {
  const [pick, setPick] = useState(null)
  const [done, setDone] = useState(false)
  const answer = 'bullish'

  const choose = (v) => {
    if (done) return
    setPick(v)
    setTimeout(() => setDone(true), 500)
  }

  return (
    <div className="card-base flex flex-col h-full p-5 rounded-2xl border border-white/5 bg-gradient-to-br from-[#0e1629] to-[#080d1a] hover:border-white/10 transition-all">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold tracking-widest uppercase text-emerald-400">Game of the Day</span>
        <Link href="#" className="text-[10px] text-slate-600 hover:text-slate-400">All games →</Link>
      </div>
      <p className="text-sm font-bold text-white mb-0.5">Market Direction Challenge</p>
      <p className="text-xs text-slate-500 mb-4">Nifty 15-min · What's the next move?</p>

      {/* Mini chart */}
      <div className="flex items-end gap-1.5 h-14 mb-4 bg-slate-900/40 rounded-xl px-4 py-3">
        {[{h:38,g:false},{h:52,g:true},{h:44,g:false},{h:66,g:true},{h:74,g:true}].map((c,i)=>(
          <div key={i} className="flex-1 flex flex-col items-center gap-px">
            <div className={`w-px ${c.g?'bg-emerald-400':'bg-rose-400'} opacity-40`} style={{height:c.h*0.22}}/>
            <div className={`w-full rounded-sm ${c.g?'bg-emerald-400':'bg-rose-400'} opacity-80`} style={{height:c.h*0.55}}/>
            <div className={`w-px ${c.g?'bg-emerald-400':'bg-rose-400'} opacity-40`} style={{height:c.h*0.14}}/>
          </div>
        ))}
        <div className="flex-1 flex items-center justify-center border border-dashed border-slate-700 rounded-sm h-full">
          <span className="text-slate-600 text-xs font-bold">?</span>
        </div>
      </div>

      {!done ? (
        <div className="flex gap-2">
          <button onClick={()=>choose('bullish')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all
              ${pick==='bullish'?'bg-emerald-600 border-emerald-500 text-white':'border-slate-700 text-slate-400 hover:border-emerald-700 hover:text-emerald-400 hover:bg-emerald-950/30'}`}>
            📈 Bullish
          </button>
          <button onClick={()=>choose('bearish')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all
              ${pick==='bearish'?'bg-rose-600 border-rose-500 text-white':'border-slate-700 text-slate-400 hover:border-rose-700 hover:text-rose-400 hover:bg-rose-950/30'}`}>
            📉 Bearish
          </button>
        </div>
      ) : (
        <div className={`p-3 rounded-xl border text-xs ${pick===answer?'border-emerald-800 bg-emerald-950/40 text-emerald-300':'border-rose-800 bg-rose-950/40 text-rose-300'}`}>
          <p className="font-bold mb-1">{pick===answer?'✓ Correct! +10 XP':'✗ The move was bullish.'}</p>
          <p className="text-slate-500 text-[11px] leading-relaxed">Price swept the low (stop hunt) before reversing — classic liquidity grab.</p>
        </div>
      )}

      <div className="mt-auto pt-4 grid grid-cols-3 gap-2 text-center border-t border-white/5">
        {[['Level','7','text-blue-400'],['Accuracy','62%','text-emerald-400'],['Streak','4d','text-amber-400']].map(([l,v,c])=>(
          <div key={l}>
            <div className={`text-sm font-bold ${c}`}>{v}</div>
            <div className="text-[10px] text-slate-600">{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Intel card (concept / article / book) ─────────────────────────────────
function IntelCard({ tag, accent, bg, border, title, desc, cta, visual }) {
  return (
    <div className={`flex flex-col h-full p-5 rounded-2xl border ${border} ${bg} hover:border-opacity-80 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group`}>
      <span className={`text-[10px] font-bold tracking-widest uppercase ${accent} mb-3`}>{tag}</span>
      <p className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors mb-2 leading-snug">{title}</p>
      {visual}
      <p className="text-xs text-slate-500 leading-relaxed flex-1">{desc}</p>
      <span className={`text-xs font-semibold ${accent} mt-4 group-hover:underline`}>{cta}</span>
    </div>
  )
}

// ── Article strip card ─────────────────────────────────────────────────────
function ArticleCard({ tag, title, color }) {
  return (
    <a href="#" className="flex flex-col p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all group cursor-pointer h-full">
      <span className={`text-[10px] font-bold tracking-widest uppercase ${color} mb-2`}>{tag}</span>
      <p className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 transition-colors leading-snug">{title}</p>
      <span className="mt-auto pt-3 text-[10px] text-slate-700 group-hover:text-slate-500 transition-colors">Read →</span>
    </a>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="h-screen flex bg-[#060b14] text-white overflow-hidden">

      <Sidebar />

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Ticker />

        {/* Header row */}
        <div className="shrink-0 px-6 pt-5 pb-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Saturday, 7 March 2026</p>
            <h1 className="text-xl font-black text-white">Good morning, Aman 👋</h1>
          </div>
          <Link href="/trades"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.45)] hover:-translate-y-0.5">
            Launch Dashboard →
          </Link>
        </div>

        {/* BENTO GRID */}
        <div className="flex-1 px-6 pb-5 grid grid-rows-[auto_1fr_auto] gap-4 min-h-0 overflow-y-auto scrollbar-thin">

          {/* ROW 1 — Market stats */}
          <div className="grid grid-cols-4 gap-4 shrink-0">
            <StatCard sym="NIFTY 50"   val="22,347"   chg="+0.84%" up icon="📈" />
            <StatCard sym="BANKNIFTY"  val="47,891"   chg="+1.12%" up icon="🏦" />
            <StatCard sym="SENSEX"     val="73,648"   chg="+0.76%" up icon="📊" />
            <StatCard sym="GOLD"       val="₹63,240"  chg="+0.22%" up icon="✨" />
          </div>

          {/* ROW 2 — Main cards */}
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 min-h-0">

            {/* Game */}
            <GameCard />

            {/* Concept of day */}
            <IntelCard
              tag="Concept of the Day"
              accent="text-blue-400"
              border="border-blue-900/40"
              bg="bg-blue-950/10"
              title="Liquidity Sweep"
              desc="Price raids a key level to grab stop orders placed by retail traders, then reverses sharply. The moment most traders get stopped out is exactly when smart money enters."
              cta="Learn this concept →"
              visual={
                <div className="flex items-end gap-1 h-10 my-2 opacity-60">
                  {[30,42,36,50,42,58,40,26,70,82].map((h,i)=>(
                    <div key={i} className={`flex-1 rounded-sm ${i<7?'bg-slate-700':i===8?'bg-rose-500':'bg-emerald-500'}`} style={{height:h*0.5}}/>
                  ))}
                </div>
              }
            />

            {/* Article of day */}
            <IntelCard
              tag="Article of the Day"
              accent="text-cyan-400"
              border="border-cyan-900/40"
              bg="bg-cyan-950/10"
              title="Why Most Breakout Trades Fail"
              desc="The setup looks perfect. Volume picks up. Price breaks the level. You enter. Then it reverses. Here's the structural reason it keeps happening to most traders."
              cta="Read article →"
              visual={
                <div className="flex items-center gap-2 my-2">
                  <span className="text-[10px] bg-cyan-900/30 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-900/50">Price Action</span>
                  <span className="text-[10px] text-slate-600">8 min read</span>
                </div>
              }
            />
          </div>

          {/* ROW 3 — Bottom strip: articles + book + pre-market */}
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_180px] gap-4 shrink-0">
            <ArticleCard tag="Psychology"   title="Why traders sabotage their own trades"  color="text-violet-400" />
            <ArticleCard tag="Price Action" title="Reading order flow without indicators"  color="text-blue-400" />
            <ArticleCard tag="Trade Review" title="Post-trade review: the missing habit"   color="text-emerald-400" />
            <ArticleCard tag="Mistakes"     title="The revenge trade trap — and the exit"  color="text-rose-400" />

            {/* Pre-Market CTA */}
            <Link href="/trades/pre-market"
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-amber-900/40 bg-amber-950/20 hover:border-amber-700/60 hover:bg-amber-950/30 hover:-translate-y-0.5 transition-all group text-center p-4">
              <span className="text-3xl">🌅</span>
              <span className="text-xs font-bold text-amber-300 group-hover:text-amber-200 transition-colors leading-snug">Start Pre-Market Analysis</span>
              <span className="text-[10px] text-slate-600">Plan your day →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
