'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ── Live ticker strip ──────────────────────────────────────────────────────
const TICKER_DATA = [
  { sym: 'NIFTY 50', val: '22,347.60', chg: '+0.84%', up: true },
  { sym: 'BANKNIFTY', val: '47,891.25', chg: '+1.12%', up: true },
  { sym: 'SENSEX', val: '73,648.30', chg: '+0.76%', up: true },
  { sym: 'NIFTY IT', val: '38,421.10', chg: '-0.34%', up: false },
  { sym: 'NIFTY AUTO', val: '21,044.85', chg: '+1.58%', up: true },
  { sym: 'GOLD', val: '₹63,240', chg: '+0.22%', up: true },
  { sym: 'CRUDE OIL', val: '$83.40', chg: '-0.61%', up: false },
  { sym: 'USD/INR', val: '83.42', chg: '+0.08%', up: false },
]

function TickerStrip() {
  return (
    <div className="w-full overflow-hidden bg-slate-900/80 border-y border-slate-800 backdrop-blur-sm py-2.5">
      <div className="ticker-track flex gap-12 w-max">
        {[...TICKER_DATA, ...TICKER_DATA].map((t, i) => (
          <div key={i} className="flex items-center gap-2 whitespace-nowrap text-sm">
            <span className="text-slate-400 font-medium">{t.sym}</span>
            <span className="text-white font-semibold">{t.val}</span>
            <span className={t.up ? 'text-emerald-400' : 'text-rose-400'}>{t.chg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Animated hero background ──────────────────────────────────────────────
function HeroBg() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)
    const candles = Array.from({ length: 22 }, (_, i) => ({
      x: (i / 21) * 1.1 - 0.05,
      y: 0.25 + Math.random() * 0.5,
      h: 0.05 + Math.random() * 0.14,
      w: 0.022,
      green: Math.random() > 0.42,
      speed: 0.00006 + Math.random() * 0.00005,
      phase: Math.random() * Math.PI * 2,
    }))
    let t = 0
    const draw = () => {
      t++
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      candles.forEach(c => {
        const cx = c.x * canvas.width
        const cy = (c.y + Math.sin(t * c.speed + c.phase) * 0.045) * canvas.height
        const h = c.h * canvas.height
        const w = c.w * canvas.width
        const alpha = 0.055 + Math.abs(Math.sin(t * c.speed + c.phase)) * 0.055
        const col = c.green ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`
        ctx.fillStyle = col
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h)
        ctx.fillRect(cx - 1, cy - h / 2 - h * 0.28, 2, h * 0.28)
        ctx.fillRect(cx - 1, cy + h / 2, 2, h * 0.28)
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60" />
}

// ── Game of the Day ───────────────────────────────────────────────────────
function GameOfDay() {
  const [choice, setChoice] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const answer = 'bullish'

  const handleChoice = (c) => {
    if (revealed) return
    setChoice(c)
    setTimeout(() => setRevealed(true), 600)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-3xl overflow-hidden border border-slate-800">
      {/* Left — chart visual */}
      <div className="bg-slate-900/80 p-10 flex flex-col justify-between">
        <div>
          <span className="text-xs font-bold tracking-widest uppercase text-emerald-400 mb-4 block">Game of the Day</span>
          <h3 className="text-2xl font-bold mb-2">Market Direction Challenge</h3>
          <p className="text-slate-400 text-sm mb-8">Look at the last 5 candles on Nifty 15-min chart. What's the next likely move?</p>
        </div>

        {/* Mini fake chart */}
        <div className="flex items-end gap-2 h-24 mb-8">
          {[
            { h: 40, green: false }, { h: 55, green: true }, { h: 48, green: false },
            { h: 70, green: true }, { h: 82, green: true }
          ].map((c, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
              <div className={`w-0.5 ${c.green ? 'bg-emerald-500' : 'bg-rose-500'} opacity-60`} style={{ height: c.h * 0.3 }} />
              <div className={`w-full rounded-sm ${c.green ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ height: c.h * 0.7 }} />
              <div className={`w-0.5 ${c.green ? 'bg-emerald-500' : 'bg-rose-500'} opacity-60`} style={{ height: c.h * 0.2 }} />
            </div>
          ))}
          <div className="flex-1 flex flex-col items-center justify-end gap-0.5">
            <div className="w-full h-16 rounded-sm border-2 border-dashed border-slate-600 flex items-center justify-center">
              <span className="text-slate-600 text-xs">?</span>
            </div>
          </div>
        </div>

        {/* Buttons */}
        {!revealed ? (
          <div className="flex gap-3">
            <button
              onClick={() => handleChoice('bullish')}
              className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all duration-200 border ${
                choice === 'bullish'
                  ? 'bg-emerald-600 border-emerald-500 text-white scale-95'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-emerald-950 hover:border-emerald-700 hover:text-emerald-300'
              }`}
            >
              📈 Bullish
            </button>
            <button
              onClick={() => handleChoice('bearish')}
              className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all duration-200 border ${
                choice === 'bearish'
                  ? 'bg-rose-600 border-rose-500 text-white scale-95'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-rose-950 hover:border-rose-700 hover:text-rose-300'
              }`}
            >
              📉 Bearish
            </button>
          </div>
        ) : (
          <div className={`p-4 rounded-xl border ${choice === answer ? 'bg-emerald-950/60 border-emerald-700' : 'bg-rose-950/60 border-rose-700'}`}>
            <p className={`font-bold text-sm mb-1 ${choice === answer ? 'text-emerald-400' : 'text-rose-400'}`}>
              {choice === answer ? '✓ Correct! +10 XP' : '✗ Not quite. The move was bullish.'}
            </p>
            <p className="text-slate-400 text-xs">Price swept the low (liquidity grab) before continuing higher. Classic reversal signal.</p>
          </div>
        )}
      </div>

      {/* Right — stats + more games */}
      <div className="bg-[#060f1a] p-10 flex flex-col justify-between border-l border-slate-800">
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-widest mb-6 font-semibold">Your Progress</p>
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[['Level', '7', 'text-blue-400'], ['Accuracy', '62%', 'text-emerald-400'], ['Streak', '4 days', 'text-amber-400']].map(([l, v, c]) => (
              <div key={l} className="text-center p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className={`text-2xl font-bold ${c} mb-1`}>{v}</div>
                <div className="text-slate-600 text-xs">{l}</div>
              </div>
            ))}
          </div>

          <p className="text-slate-500 text-xs uppercase tracking-widest mb-4 font-semibold">More Games</p>
          <div className="flex flex-col gap-3">
            {[
              { icon: '⚖️', name: 'Risk Management', desc: 'Size positions under pressure' },
              { icon: '🔍', name: 'Pattern Recognition', desc: 'Spot the setup before it moves' },
            ].map(g => (
              <div key={g.name} className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-600 transition-colors cursor-pointer group">
                <span className="text-2xl">{g.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">{g.name}</p>
                  <p className="text-xs text-slate-500">{g.desc}</p>
                </div>
                <span className="ml-auto text-slate-700 group-hover:text-slate-400 transition-colors">→</span>
              </div>
            ))}
          </div>
        </div>

        <Link href="#" className="mt-8 block text-center py-3.5 rounded-xl border border-blue-800 text-blue-400 text-sm font-semibold hover:bg-blue-950/40 transition-colors">
          View All Games →
        </Link>
      </div>
    </div>
  )
}

// ── Data ──────────────────────────────────────────────────────────────────
const dailyIntel = [
  {
    type: 'Concept of the Day',
    accent: 'text-blue-400',
    border: 'border-blue-900/60',
    bg: 'bg-blue-950/20',
    glow: 'hover:shadow-[0_0_30px_rgba(59,130,246,0.1)]',
    hborder: 'hover:border-blue-700',
    title: 'Liquidity Sweep',
    body: 'Price raids a key level — sweeping stop orders placed by retail traders — before reversing sharply. The moment most traders get stopped out is exactly when smart money enters.',
    visual: (
      <div className="flex items-end gap-1 h-14 my-4">
        {[30,45,38,52,44,60,42,28,72,85].map((h, i) => (
          <div key={i} className={`flex-1 rounded-sm ${i < 7 ? (i % 2 === 0 ? 'bg-slate-700' : 'bg-slate-600') : 'bg-emerald-500'}`} style={{ height: h * 0.56 }} />
        ))}
      </div>
    ),
    cta: 'Learn this concept →',
  },
  {
    type: 'Article of the Day',
    accent: 'text-cyan-400',
    border: 'border-cyan-900/60',
    bg: 'bg-cyan-950/20',
    glow: 'hover:shadow-[0_0_30px_rgba(6,182,212,0.1)]',
    hborder: 'hover:border-cyan-700',
    title: 'Why Most Breakout Trades Fail',
    body: 'The setup looks perfect. Volume picks up. Price breaks the level. You enter. Then it reverses and stops you out. Sound familiar? Here\'s the structural reason it keeps happening.',
    visual: (
      <div className="my-4 flex items-center gap-2">
        <span className="text-xs bg-cyan-900/40 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-800">Price Action</span>
        <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">8 min read</span>
      </div>
    ),
    cta: 'Read article →',
  },
  {
    type: 'Book Insight',
    accent: 'text-violet-400',
    border: 'border-violet-900/60',
    bg: 'bg-violet-950/20',
    glow: 'hover:shadow-[0_0_30px_rgba(139,92,246,0.1)]',
    hborder: 'hover:border-violet-700',
    title: 'Trading in the Zone',
    body: '"The best traders have a mental framework that allows them to trade without fear and without overconfidence. They have eliminated the possibility of feeling betrayed by the market."',
    visual: (
      <div className="my-4 flex items-center gap-3">
        <div className="w-10 h-14 rounded bg-gradient-to-br from-violet-800 to-violet-950 border border-violet-700 flex items-center justify-center text-xl">📘</div>
        <div>
          <p className="text-xs text-slate-500">Mark Douglas</p>
          <div className="flex gap-0.5 mt-1">{[1,2,3,4,5].map(i => <span key={i} className="text-amber-400 text-xs">★</span>)}</div>
        </div>
      </div>
    ),
    cta: 'Get the insight →',
  },
]

const featuredArticle = {
  tag: 'Market Psychology',
  title: 'The Trader Who Knew Everything but Lost Anyway',
  excerpt: 'He could identify every pattern. He knew support, resistance, order flow. He had read every book. And yet, at the end of each month, his account shrank. The problem was never knowledge — it was the six inches between his ears.',
  readTime: '6 min read',
}

const books = [
  { title: 'Trading in the Zone', author: 'Mark Douglas', emoji: '🧠', color: 'from-violet-900 to-violet-950', lesson: 'Your edge means nothing without the mental discipline to execute it consistently, every single time.' },
  { title: 'Market Wizards', author: 'Jack D. Schwager', emoji: '⚡', color: 'from-amber-900 to-amber-950', lesson: 'Every great trader has found a unique edge. Your job is to find yours — then exploit it relentlessly.' },
  { title: 'The Daily Trading Coach', author: 'Brett Steenbarger', emoji: '🎯', color: 'from-blue-900 to-blue-950', lesson: 'Self-improvement is the highest-leverage activity in trading. More than any strategy or indicator.' },
  { title: "Reminiscences of a Stock Operator", author: 'Edwin Lefèvre', emoji: '📜', color: 'from-emerald-900 to-emerald-950', lesson: 'Human nature never changes. The market has always been the same game, played by different faces.' },
]

// ── Page ──────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <main className="min-h-screen bg-[#060b14] text-white overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col overflow-hidden">
        <HeroBg />
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/10 via-transparent to-[#060b14] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(59,130,246,0.10),transparent_60%)] pointer-events-none" />

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between px-8 py-6">
          <span className="text-xl font-bold tracking-tight">Trading<span className="text-blue-400">Verse</span></span>
          <Link href="/trades" className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-semibold transition-all hover:shadow-[0_0_16px_rgba(59,130,246,0.5)]">
            Open Dashboard
          </Link>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pb-32">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-slate-700 bg-slate-900/60 text-slate-400 text-xs mb-10 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Nifty +0.84% &nbsp;·&nbsp; BankNifty +1.12% &nbsp;·&nbsp; Markets open
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-6 leading-[0.95]">
            Stop guessing.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Start reading</span><br />
            the market.
          </h1>
          <p className="text-slate-400 text-lg md:text-xl max-w-xl mx-auto mb-12 font-light leading-relaxed">
            TradingVerse is your daily ritual — concepts, games, articles, and a trading dashboard built for clarity.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/trades" className="px-10 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-lg transition-all duration-200 hover:shadow-[0_0_32px_rgba(59,130,246,0.55)] hover:-translate-y-0.5">
              Launch Dashboard →
            </Link>
            <a href="#daily" className="px-10 py-4 bg-slate-800/50 hover:bg-slate-700/60 border border-slate-700 rounded-xl font-bold text-lg transition-all duration-200 hover:-translate-y-0.5 backdrop-blur-sm text-slate-300">
              Start Learning
            </a>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10">
          <TickerStrip />
        </div>
      </section>

      {/* ── GAME OF THE DAY ──────────────────────────────────────────────── */}
      <section className="py-28 px-6 max-w-6xl mx-auto">
        <div className="mb-12">
          <p className="text-emerald-400 text-xs font-bold tracking-widest uppercase mb-3">Only on TradingVerse</p>
          <h2 className="text-4xl font-bold mb-3">Sharpen your instincts.</h2>
          <p className="text-slate-400 text-lg max-w-lg">Practice real market decisions daily. No capital at risk. Just you vs the chart.</p>
        </div>
        <GameOfDay />
      </section>

      {/* ── DAILY INTEL ──────────────────────────────────────────────────── */}
      <section id="daily" className="py-28 px-6 max-w-6xl mx-auto">
        <div className="mb-12">
          <p className="text-blue-400 text-xs font-bold tracking-widest uppercase mb-3">Every Morning</p>
          <h2 className="text-4xl font-bold mb-3">Your daily trading briefing.</h2>
          <p className="text-slate-400 text-lg">One concept. One article. One book insight. Compounding daily.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dailyIntel.map(card => (
            <div key={card.title} className={`group p-7 rounded-2xl border ${card.border} ${card.bg} ${card.glow} ${card.hborder} transition-all duration-300 hover:-translate-y-1 flex flex-col`}>
              <span className={`text-xs font-bold tracking-widest uppercase ${card.accent} mb-4`}>{card.type}</span>
              <h3 className="text-xl font-bold mb-2">{card.title}</h3>
              {card.visual}
              <p className="text-slate-400 text-sm leading-relaxed flex-1">{card.body}</p>
              <a href="#" className={`mt-6 text-sm font-semibold ${card.accent} hover:underline`}>{card.cta}</a>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURED ARTICLE ─────────────────────────────────────────────── */}
      <section className="py-10 px-6 max-w-6xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-gradient-to-br from-slate-900 to-[#060b14] p-12 md:p-16 group hover:border-slate-700 transition-all duration-300 cursor-pointer">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-cyan-950/20 to-transparent pointer-events-none" />
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-xs font-bold tracking-widest uppercase text-cyan-400 bg-cyan-950/50 border border-cyan-900 px-3 py-1 rounded-full">
                {featuredArticle.tag}
              </span>
              <span className="text-slate-600 text-xs">{featuredArticle.readTime}</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-6 leading-tight group-hover:text-blue-100 transition-colors">
              {featuredArticle.title}
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-8 font-light">
              {featuredArticle.excerpt}
            </p>
            <span className="inline-flex items-center gap-2 text-cyan-400 font-semibold hover:underline">
              Read the full article →
            </span>
          </div>
        </div>
      </section>

      {/* ── BOOKS ────────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 max-w-6xl mx-auto">
        <div className="mb-12">
          <p className="text-violet-400 text-xs font-bold tracking-widest uppercase mb-3">Reading List</p>
          <h2 className="text-4xl font-bold mb-3">Books that changed traders.</h2>
          <p className="text-slate-400 text-lg">Hover to reveal the lesson that matters most.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {books.map(b => (
            <div key={b.title} className="group relative rounded-2xl overflow-hidden border border-slate-800 hover:border-slate-600 transition-all duration-300 hover:-translate-y-1 cursor-pointer min-h-[220px]">
              <div className={`absolute inset-0 bg-gradient-to-br ${b.color} opacity-50`} />
              <div className="relative z-10 p-7 h-full flex flex-col justify-between transition-all duration-300 group-hover:opacity-0">
                <span className="text-5xl">{b.emoji}</span>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">{b.title}</h3>
                  <p className="text-slate-400 text-sm">{b.author}</p>
                </div>
              </div>
              <div className="absolute inset-0 z-20 p-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-slate-900/90">
                <p className="text-slate-200 text-sm leading-relaxed italic text-center">"{b.lesson}"</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LAUNCH DASHBOARD ─────────────────────────────────────────────── */}
      <section className="py-10 pb-28 px-6">
        <div className="max-w-5xl mx-auto relative rounded-3xl overflow-hidden border border-blue-900/60 text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-950/80 via-slate-900 to-[#060b14]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,130,246,0.25),transparent_60%)]" />

          {/* Decorative grid lines */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.3) 1px,transparent 1px)',
            backgroundSize: '48px 48px'
          }} />

          <div className="relative z-10 py-24 px-8">
            <p className="text-blue-400 text-xs font-bold tracking-widest uppercase mb-5">You're ready</p>
            <h2 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
              Enter the<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">TradingVerse</span>
            </h2>
            <p className="text-slate-400 text-lg mb-12 max-w-md mx-auto font-light">
              Your dashboard. Your trades. Your edge. See the market through clarity.
            </p>
            <Link
              href="/trades"
              className="inline-block px-12 py-5 bg-blue-600 hover:bg-blue-500 rounded-xl font-black text-xl transition-all duration-200 hover:shadow-[0_0_60px_rgba(59,130,246,0.6)] hover:-translate-y-1"
            >
              Launch Trading Dashboard →
            </Link>
            <p className="text-slate-700 text-xs mt-6">Free forever. No signup required.</p>
          </div>
        </div>
      </section>

      <footer className="text-center py-8 text-slate-700 text-sm border-t border-slate-900">
        © 2025 TradingVerse · Trade with context. Learn from the best.
      </footer>
    </main>
  )
}
