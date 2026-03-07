'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

function CandlestickCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animFrame

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const candles = Array.from({ length: 18 }, (_, i) => ({
      x: (i / 17) * 1.1 - 0.05,
      y: 0.3 + Math.random() * 0.4,
      h: 0.06 + Math.random() * 0.12,
      w: 0.024,
      green: Math.random() > 0.45,
      speed: 0.00008 + Math.random() * 0.00006,
      phase: Math.random() * Math.PI * 2,
    }))

    let t = 0
    const draw = () => {
      t += 1
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      candles.forEach((c) => {
        const cx = c.x * canvas.width
        const cy = (c.y + Math.sin(t * c.speed + c.phase) * 0.04) * canvas.height
        const h = c.h * canvas.height
        const w = c.w * canvas.width
        const alpha = 0.07 + Math.abs(Math.sin(t * c.speed + c.phase)) * 0.06
        const color = c.green ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`
        ctx.fillStyle = color
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h)
        ctx.fillStyle = color
        ctx.fillRect(cx - 1, cy - h / 2 - h * 0.3, 2, h * 0.3)
        ctx.fillRect(cx - 1, cy + h / 2, 2, h * 0.3)
      })
      animFrame = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animFrame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
}

const toolkitCards = [
  { icon: '🎮', title: 'Trading Games', desc: 'Sharpen instincts without risking capital', href: '#games' },
  { icon: '📘', title: 'Concepts', desc: 'Price action and market structure', href: '#concepts' },
  { icon: '📰', title: 'Articles', desc: 'Market insights and trade breakdowns', href: '#articles' },
  { icon: '📚', title: 'Books', desc: 'Best trading books summarized', href: '#books' },
  { icon: '📊', title: 'Trading Dashboard', desc: 'Your trading command center', href: '/trades' },
]

const todayCards = [
  {
    label: 'Concept of the Day',
    title: 'Liquidity Sweep',
    desc: 'Price raids a key level to grab stop orders before reversing — understanding this prevents you from being the liquidity.',
    color: 'from-blue-950 to-slate-900',
    accent: 'text-blue-400',
    border: 'border-blue-900',
  },
  {
    label: 'Article of the Day',
    title: 'Why Most Breakout Trades Fail',
    desc: 'Most breakouts are traps. Learn to distinguish genuine breakouts from liquidity grabs using volume and context.',
    color: 'from-cyan-950 to-slate-900',
    accent: 'text-cyan-400',
    border: 'border-cyan-900',
  },
  {
    label: 'Book Insight',
    title: 'Trading in the Zone',
    desc: '"The best traders have a mental framework that allows them to trade without fear and without overconfidence." — Mark Douglas',
    color: 'from-violet-950 to-slate-900',
    accent: 'text-violet-400',
    border: 'border-violet-900',
  },
]

const games = [
  { icon: '📈', title: 'Market Direction', desc: 'Guess Nifty direction for the day' },
  { icon: '⚖️', title: 'Risk Management', desc: 'Manage live trade scenarios' },
  { icon: '🔍', title: 'Pattern Recognition', desc: 'Spot high-probability setups' },
]

const articles = [
  { tag: 'Market Psychology', title: 'Why traders sabotage their own trades', color: 'text-blue-400' },
  { tag: 'Price Action', title: 'Reading order flow without indicators', color: 'text-cyan-400' },
  { tag: 'Trade Analysis', title: 'Post-trade review framework', color: 'text-emerald-400' },
  { tag: 'Trading Mistakes', title: 'The revenge trade trap', color: 'text-rose-400' },
]

const books = [
  {
    title: 'Trading in the Zone',
    author: 'Mark Douglas',
    lesson: 'Your edge means nothing without the discipline to execute it consistently.',
  },
  {
    title: 'Market Wizards',
    author: 'Jack D. Schwager',
    lesson: 'Every great trader has a unique edge — find yours and exploit it relentlessly.',
  },
  {
    title: 'The Daily Trading Coach',
    author: 'Brett Steenbarger',
    lesson: 'Self-improvement is the highest-leverage trading tool you have.',
  },
  {
    title: 'Reminiscences of a Stock Operator',
    author: 'Edwin Lefèvre',
    lesson: 'The market has always been the same — human nature never changes.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-[#060b14] text-white overflow-x-hidden">

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial-hero pointer-events-none" />
        <CandlestickCanvas />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#060b14] pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-800 bg-blue-950/40 text-blue-300 text-sm mb-8 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Markets open. Are you ready?
          </div>

          <h1 className="text-6xl md:text-7xl font-bold tracking-tight mb-6 leading-none">
            Trading<span className="text-blue-400">Verse</span>
          </h1>
          <p className="text-slate-400 text-xl md:text-2xl mb-4 font-light">
            Trade with context. Learn from the best.
          </p>
          <p className="text-slate-500 text-base mb-12 max-w-xl mx-auto">
            Your daily ritual for becoming a sharper, calmer, more consistent trader.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/trades"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-lg transition-all duration-200 hover:shadow-[0_0_24px_rgba(59,130,246,0.5)] hover:-translate-y-0.5"
            >
              Launch Dashboard →
            </Link>
            <a
              href="#toolkit"
              className="px-8 py-4 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700 rounded-xl font-semibold text-lg transition-all duration-200 hover:-translate-y-0.5 backdrop-blur-sm"
            >
              Explore Toolkit
            </a>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-600 animate-bounce text-xl">↓</div>
      </section>

      {/* ── TOOLKIT ── */}
      <section id="toolkit" className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-3">Your Hub</p>
          <h2 className="text-4xl font-bold">Daily Trader Toolkit</h2>
          <p className="text-slate-400 mt-3 text-lg">Everything you need. Nothing you don't.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {toolkitCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group relative p-7 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-blue-700 hover:bg-slate-800/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(59,130,246,0.12)] backdrop-blur-sm"
            >
              <div className="text-4xl mb-4">{card.icon}</div>
              <h3 className="text-lg font-semibold mb-1 group-hover:text-blue-300 transition-colors">{card.title}</h3>
              <p className="text-slate-500 text-sm">{card.desc}</p>
              <div className="absolute top-5 right-5 text-slate-700 group-hover:text-blue-500 transition-colors text-lg">→</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── TODAY'S LEARNING ── */}
      <section className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-cyan-400 text-sm font-semibold tracking-widest uppercase mb-3">Daily Habit</p>
          <h2 className="text-4xl font-bold">Today's Learning</h2>
          <p className="text-slate-400 mt-3 text-lg">One insight. Every day. Compounding over time.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {todayCards.map((card) => (
            <div
              key={card.title}
              className={`p-7 rounded-2xl border ${card.border} bg-gradient-to-br ${card.color} flex flex-col gap-3`}
            >
              <span className={`text-xs font-semibold tracking-widest uppercase ${card.accent}`}>{card.label}</span>
              <h3 className="text-xl font-bold">{card.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed flex-1">{card.desc}</p>
              <a href="#" className={`text-sm font-medium ${card.accent} hover:underline mt-2`}>Read more →</a>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRADING GAMES ── */}
      <section id="games" className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-6">
          <p className="text-emerald-400 text-sm font-semibold tracking-widest uppercase mb-3">Unique to TradingVerse</p>
          <h2 className="text-4xl font-bold">Trading Games</h2>
          <p className="text-slate-400 mt-3 text-lg">Sharpen your trading instincts without risking capital.</p>
        </div>

        <div className="flex justify-center gap-8 mb-14 text-center">
          {[['Trader Level', '7'], ['Games Played', '38'], ['Accuracy', '62%']].map(([label, val]) => (
            <div key={label}>
              <div className="text-3xl font-bold text-emerald-400">{val}</div>
              <div className="text-slate-500 text-sm mt-1">{label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {games.map((g) => (
            <div
              key={g.title}
              className="group p-7 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-700 hover:bg-slate-800/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(34,197,94,0.1)] cursor-pointer"
            >
              <div className="text-4xl mb-4">{g.icon}</div>
              <h3 className="text-lg font-semibold mb-1 group-hover:text-emerald-300 transition-colors">{g.title}</h3>
              <p className="text-slate-500 text-sm">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── ARTICLES ── */}
      <section id="articles" className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-rose-400 text-sm font-semibold tracking-widest uppercase mb-3">Insights</p>
          <h2 className="text-4xl font-bold">Latest Articles</h2>
          <p className="text-slate-400 mt-3 text-lg">Market psychology, price action, real trade analysis.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {articles.map((a) => (
            <a
              key={a.title}
              href="#"
              className="group p-7 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-800/60 transition-all duration-300 hover:-translate-y-0.5"
            >
              <span className={`text-xs font-semibold tracking-widest uppercase ${a.color} mb-3 block`}>{a.tag}</span>
              <h3 className="text-lg font-semibold group-hover:text-white transition-colors text-slate-200">{a.title}</h3>
              <span className="text-slate-600 group-hover:text-slate-400 text-sm mt-3 block transition-colors">Read article →</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── BOOKS ── */}
      <section id="books" className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-violet-400 text-sm font-semibold tracking-widest uppercase mb-3">Reading List</p>
          <h2 className="text-4xl font-bold">Book Recommendations</h2>
          <p className="text-slate-400 mt-3 text-lg">Hover to reveal the key lesson.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {books.map((b) => (
            <div
              key={b.title}
              className="group relative p-7 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-violet-700 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(139,92,246,0.12)] cursor-pointer overflow-hidden min-h-[180px]"
            >
              <div className="transition-all duration-300 group-hover:opacity-0 group-hover:-translate-y-2">
                <div className="text-3xl mb-3">📚</div>
                <h3 className="text-base font-bold text-white mb-1">{b.title}</h3>
                <p className="text-slate-500 text-sm">{b.author}</p>
              </div>
              <div className="absolute inset-0 p-7 flex flex-col justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                <p className="text-violet-300 text-sm leading-relaxed italic">"{b.lesson}"</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LAUNCH DASHBOARD ── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto relative rounded-3xl border border-blue-800/50 bg-gradient-to-br from-blue-950/60 to-slate-900/80 p-16 text-center overflow-hidden backdrop-blur-sm">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.12),transparent_70%)] pointer-events-none" />
          <div className="relative z-10">
            <p className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4">Ready?</p>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Enter the TradingVerse</h2>
            <p className="text-slate-400 text-lg mb-10 max-w-lg mx-auto">
              See the market through clarity. Your dashboard, your edge.
            </p>
            <Link
              href="/trades"
              className="inline-block px-10 py-5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-lg transition-all duration-200 hover:shadow-[0_0_40px_rgba(59,130,246,0.6)] hover:-translate-y-0.5"
            >
              Launch Trading Dashboard →
            </Link>
          </div>
        </div>
      </section>

      <footer className="text-center py-10 text-slate-700 text-sm border-t border-slate-900">
        © 2025 TradingVerse · Trade with context. Learn from the best.
      </footer>
    </main>
  )
}
