'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ── Ticker ─────────────────────────────────────────────────────────────────
const TICKERS = [
  { sym: 'NIFTY 50',   val: '22,347.60', chg: '+0.84%', up: true },
  { sym: 'BANKNIFTY',  val: '47,891.25', chg: '+1.12%', up: true },
  { sym: 'SENSEX',     val: '73,648.30', chg: '+0.76%', up: true },
  { sym: 'NIFTY IT',   val: '38,421.10', chg: '-0.34%', up: false },
  { sym: 'NIFTY AUTO', val: '21,044.85', chg: '+1.58%', up: true },
  { sym: 'GOLD',       val: '₹63,240',   chg: '+0.22%', up: true },
  { sym: 'CRUDE OIL',  val: '$83.40',    chg: '-0.61%', up: false },
  { sym: 'USD/INR',    val: '83.42',     chg: '+0.08%', up: false },
]

function Ticker() {
  return (
    <div className="overflow-hidden border-b border-slate-800/80 bg-slate-900/60 py-2">
      <div className="ticker-track flex gap-14 w-max">
        {[...TICKERS, ...TICKERS].map((t, i) => (
          <span key={i} className="flex items-center gap-2 text-xs whitespace-nowrap">
            <span className="text-slate-500 font-medium">{t.sym}</span>
            <span className="text-slate-200 font-semibold">{t.val}</span>
            <span className={t.up ? 'text-emerald-400' : 'text-rose-400'}>{t.chg}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Mini candlestick bg ────────────────────────────────────────────────────
function CandleBg() {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')
    let raf
    const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight }
    resize(); window.addEventListener('resize', resize)
    const cs = Array.from({ length: 20 }, (_, i) => ({
      x: i / 19, y: 0.2 + Math.random() * 0.6, h: 0.05 + Math.random() * 0.15,
      green: Math.random() > 0.45, sp: 0.00005 + Math.random() * 0.00005, ph: Math.random() * Math.PI * 2,
    }))
    let t = 0
    const draw = () => {
      t++; ctx.clearRect(0, 0, c.width, c.height)
      cs.forEach(cd => {
        const cx = cd.x * c.width
        const cy = (cd.y + Math.sin(t * cd.sp + cd.ph) * 0.04) * c.height
        const h = cd.h * c.height; const w = c.width * 0.025
        const a = 0.04 + Math.abs(Math.sin(t * cd.sp + cd.ph)) * 0.04
        ctx.fillStyle = cd.green ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h)
        ctx.fillRect(cx - 0.8, cy - h / 2 - h * 0.25, 1.6, h * 0.25)
        ctx.fillRect(cx - 0.8, cy + h / 2, 1.6, h * 0.25)
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />
}

// ── Playable Game ──────────────────────────────────────────────────────────
function GamePanel() {
  const [pick, setPick] = useState(null)
  const [done, setDone] = useState(false)
  const answer = 'bullish'

  const choose = (v) => {
    if (done) return
    setPick(v)
    setTimeout(() => setDone(true), 500)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold tracking-widest uppercase text-emerald-400">Game of the Day</span>
        <Link href="#" className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">All games →</Link>
      </div>

      <p className="text-sm font-semibold text-slate-200 mb-1">Market Direction Challenge</p>
      <p className="text-xs text-slate-500 mb-4">Nifty 15-min · Last 5 candles. What's the next move?</p>

      {/* Mini chart */}
      <div className="flex items-end gap-1.5 h-16 mb-4 px-1">
        {[{h:38,g:false},{h:52,g:true},{h:44,g:false},{h:66,g:true},{h:78,g:true}].map((cd, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-px">
            <div className={`w-px ${cd.g?'bg-emerald-500':'bg-rose-500'} opacity-50`} style={{height:cd.h*0.25}}/>
            <div className={`w-full rounded-sm ${cd.g?'bg-emerald-500':'bg-rose-500'}`} style={{height:cd.h*0.65}}/>
            <div className={`w-px ${cd.g?'bg-emerald-500':'bg-rose-500'} opacity-50`} style={{height:cd.h*0.15}}/>
          </div>
        ))}
        <div className="flex-1 flex items-center justify-center h-full border border-dashed border-slate-700 rounded-sm">
          <span className="text-slate-700 text-xs font-bold">?</span>
        </div>
      </div>

      {!done ? (
        <div className="flex gap-2">
          <button onClick={() => choose('bullish')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${pick==='bullish' ? 'bg-emerald-700 border-emerald-600 text-white' : 'border-slate-700 text-slate-400 hover:border-emerald-700 hover:text-emerald-400 hover:bg-emerald-950/40'}`}>
            📈 Bullish
          </button>
          <button onClick={() => choose('bearish')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all ${pick==='bearish' ? 'bg-rose-700 border-rose-600 text-white' : 'border-slate-700 text-slate-400 hover:border-rose-700 hover:text-rose-400 hover:bg-rose-950/40'}`}>
            📉 Bearish
          </button>
        </div>
      ) : (
        <div className={`p-3 rounded-lg border text-xs ${pick===answer ? 'border-emerald-800 bg-emerald-950/50 text-emerald-300' : 'border-rose-800 bg-rose-950/50 text-rose-300'}`}>
          <p className="font-bold mb-1">{pick===answer ? '✓ Correct! +10 XP' : '✗ The move was bullish.'}</p>
          <p className="text-slate-500 leading-relaxed">Price swept the low (liquidity grab) before reversing higher — a classic stop hunt.</p>
        </div>
      )}

      {/* Stats */}
      <div className="mt-auto pt-4 border-t border-slate-800/60 grid grid-cols-3 gap-2 text-center">
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

// ── Daily Intel (left panel) ───────────────────────────────────────────────
const INTEL = [
  {
    tag: 'Concept', accent: 'text-blue-400', border: 'border-blue-900/50', bg: 'hover:bg-blue-950/20',
    title: 'Liquidity Sweep',
    desc: 'Price raids stops before reversing. Retail gets shaken out right as smart money enters.',
  },
  {
    tag: 'Article', accent: 'text-cyan-400', border: 'border-cyan-900/50', bg: 'hover:bg-cyan-950/20',
    title: 'Why Most Breakout Trades Fail',
    desc: 'Most breakouts are traps. Volume + context separate real moves from fakeouts.',
  },
  {
    tag: 'Book', accent: 'text-violet-400', border: 'border-violet-900/50', bg: 'hover:bg-violet-950/20',
    title: 'Trading in the Zone',
    desc: '"Eliminate the possibility of feeling betrayed by the market." — Mark Douglas',
  },
]

// ── Bottom article strip ───────────────────────────────────────────────────
const ARTICLES = [
  { tag: 'Psychology',    title: 'Why traders sabotage their own trades',  color: 'text-blue-400' },
  { tag: 'Price Action',  title: 'Reading order flow without indicators',  color: 'text-cyan-400' },
  { tag: 'Trade Review',  title: 'Post-trade review: the missing habit',   color: 'text-emerald-400' },
  { tag: 'Mistakes',      title: 'The revenge trade trap — and the exit',  color: 'text-rose-400' },
]

// ── Page ───────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="h-screen flex flex-col bg-[#060b14] text-white overflow-hidden">

      {/* NAV */}
      <nav className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800/80 shrink-0">
        <span className="text-lg font-black tracking-tight">Trading<span className="text-blue-400">Verse</span></span>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
          Markets open
        </div>
      </nav>

      {/* TICKER */}
      <Ticker />

      {/* COCKPIT MAIN: LEFT | CENTER | RIGHT */}
      <div className="flex-1 grid grid-cols-[260px_1fr_280px] min-h-0 divide-x divide-slate-800/80">

        {/* ── LEFT: Daily Intel ── */}
        <div className="flex flex-col gap-3 p-5 overflow-y-auto">
          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-1">Today's Intel</p>

          {INTEL.map(card => (
            <a key={card.title} href="#"
              className={`block p-4 rounded-xl border ${card.border} ${card.bg} transition-colors cursor-pointer group`}>
              <span className={`text-[10px] font-bold tracking-widest uppercase ${card.accent} mb-2 block`}>{card.tag}</span>
              <p className="text-sm font-semibold text-slate-200 mb-1 group-hover:text-white transition-colors leading-snug">{card.title}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{card.desc}</p>
            </a>
          ))}

          <div className="mt-auto pt-4 border-t border-slate-800/60">
            <p className="text-[10px] font-bold tracking-widest uppercase text-slate-600 mb-3">Quick Access</p>
            <div className="flex flex-col gap-1.5">
              {[['📘','Concepts','#'],['📰','Articles','#'],['📚','Books','#'],['🎮','All Games','#']].map(([icon,label,href])=>(
                <Link key={label} href={href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors">
                  <span>{icon}</span>{label}
                  <span className="ml-auto text-slate-700">→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── CENTER: Hero ── */}
        <div className="relative flex flex-col items-center justify-center p-10 text-center overflow-hidden">
          <CandleBg />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(59,130,246,0.08),transparent_65%)]" />
          <div className="relative z-10 max-w-lg">
            <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-[0.95] mb-5">
              Stop guessing.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Start reading</span><br />
              the market.
            </h1>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-sm mx-auto">
              Your daily ritual — concepts, games, articles, and a trading dashboard built for clarity.
            </p>

            {/* Market mood */}
            <div className="flex items-center justify-center gap-6 mb-8 text-xs">
              {[['Trend','Bullish','text-emerald-400'],['Sentiment','Cautious','text-amber-400'],['Volatility','Low','text-blue-400']].map(([l,v,c])=>(
                <div key={l} className="text-center">
                  <div className={`font-bold text-sm ${c}`}>{v}</div>
                  <div className="text-slate-600">{l}</div>
                </div>
              ))}
            </div>

            {/* Today's focus */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-8 text-left">
              <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-2">Today's Trading Focus</p>
              <ul className="flex flex-col gap-1.5">
                {['Watch for liquidity sweeps at key highs before entry','BankNifty showing relative strength — trade the leader','Pre-market gap fill likely — wait for confirmation'].map(pt=>(
                  <li key={pt} className="flex items-start gap-2 text-xs text-slate-400">
                    <span className="text-blue-500 mt-0.5 shrink-0">·</span>{pt}
                  </li>
                ))}
              </ul>
            </div>

            <Link href="/trades"
              className="inline-block w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm transition-all hover:shadow-[0_0_28px_rgba(59,130,246,0.5)] hover:-translate-y-0.5">
              Launch Trading Dashboard →
            </Link>
          </div>
        </div>

        {/* ── RIGHT: Game ── */}
        <div className="flex flex-col p-5 overflow-y-auto">
          <GamePanel />
        </div>
      </div>

      {/* BOTTOM STRIP */}
      <div className="shrink-0 border-t border-slate-800/80 bg-slate-900/40 grid grid-cols-[1fr_1fr_1fr_1fr_auto] divide-x divide-slate-800/60">

        {ARTICLES.map(a => (
          <a key={a.title} href="#"
            className="px-4 py-3 hover:bg-slate-800/40 transition-colors group block">
            <span className={`text-[9px] font-bold tracking-widest uppercase ${a.color} mb-1 block`}>{a.tag}</span>
            <p className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors leading-snug line-clamp-2">{a.title}</p>
          </a>
        ))}

        {/* Launch Pre-Market */}
        <div className="flex items-stretch">
          <Link href="/trades/pre-market"
            className="flex flex-col items-center justify-center px-6 gap-1 bg-slate-800/60 hover:bg-slate-700/60 border-l border-slate-800/60 transition-colors group">
            <span className="text-lg">🌅</span>
            <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200 transition-colors whitespace-nowrap">Pre-Market</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
