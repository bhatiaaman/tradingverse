'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Nav from './components/Nav'

// ── Scroll-reveal hook ─────────────────────────────────────────────────────
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('revealed') }),
      { threshold: 0.15 }
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

// ── Mini SVG candlestick chart ─────────────────────────────────────────────
function MiniChart({ candles }) {
  const W = 200, H = 70, pad = 10
  const prices = candles.flatMap(c => [c.h, c.l])
  const min = Math.min(...prices), max = Math.max(...prices)
  const scaleY = v => H - pad - ((v - min) / (max - min)) * (H - pad * 2)
  const cw = (W - pad * 2) / candles.length
  return (
    <div className="mb-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16 rounded-lg bg-slate-900/60">
        {candles.map((c, i) => {
          const x = pad + i * cw + cw * 0.1
          const w = cw * 0.8
          const oy = scaleY(Math.max(c.o, c.c)), cy = scaleY(Math.min(c.o, c.c))
          const bodyH = Math.max(2, cy - oy)
          const color = c.c >= c.o ? '#34d399' : '#f87171'
          return (
            <g key={i}>
              <line x1={x + w/2} y1={scaleY(c.h)} x2={x + w/2} y2={scaleY(c.l)} stroke={color} strokeWidth="1" opacity="0.6"/>
              <rect x={x} y={oy} width={w} height={bodyH} fill={color} opacity="0.85" rx="1"/>
            </g>
          )
        })}
        {/* Question mark candle */}
        <rect x={pad + candles.length * cw + cw*0.1} y={H/2 - 12} width={cw*0.8} height={24}
          fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="3,2" rx="1"/>
        <text x={pad + candles.length * cw + cw*0.5} y={H/2 + 5} textAnchor="middle" fill="#475569" fontSize="10" fontWeight="bold">?</text>
      </svg>
      <p className="text-[10px] text-slate-600 mt-1 text-center">Nifty 15-min chart · What happens next?</p>
    </div>
  )
}

// ── Scenario data ──────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: 1,
    type: 'context',
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
    explanation: 'Opening volatility is highest in the first 15 mins. Weekly support could attract buyers OR break further. Waiting for confirmation is the professional move. Impulsive entries at open are how accounts blow up.',
  },
  {
    id: 2,
    type: 'chart',
    candles: [
      {o:100,c:108,h:110,l:98},{o:108,c:104,h:112,l:102},{o:104,c:115,h:117,l:103},
      {o:115,c:112,h:118,l:110},{o:112,c:120,h:122,l:111},
    ],
    question: 'Strong bullish candle after a pullback to support. Volume is above average. What\'s the trade?',
    options: [
      { id: 'a', text: 'Enter long now — strong close with volume' },
      { id: 'b', text: 'Wait for next candle to confirm, then enter' },
      { id: 'c', text: 'Short — overbought after big move' },
      { id: 'd', text: 'Ignore — risk:reward not clear' },
    ],
    answer: 'b',
    explanation: 'The candle looks great but chasing a big green candle is a classic mistake. Wait for the next candle to hold the gains without giving back much. A confirmation candle gives a tighter stop and better R:R.',
  },
  {
    id: 3,
    type: 'context',
    context: [
      { label: 'Dow Jones',   value: '+0.4%',         bad: false },
      { label: 'Nifty trend', value: 'Bullish 3 days', bad: false },
      { label: 'India VIX',   value: '12.1 ↓',        bad: false },
      { label: 'PCR',         value: '1.3 (bullish)',  bad: false },
    ],
    question: 'You\'re up 2% on a long trade. Target is 1.5% away. VIX is low, trend intact. What do you do?',
    options: [
      { id: 'a', text: 'Hold for full target — trend is your friend' },
      { id: 'b', text: 'Book 50% now, trail stop on the rest' },
      { id: 'c', text: 'Add more — momentum is strong' },
      { id: 'd', text: 'Exit fully — 2% is enough' },
    ],
    answer: 'b',
    explanation: 'Partial booking locks in gains while letting the trade breathe. Adding without a plan turns winners into losers. Full exit gives up potential. Partial + trailing stop is textbook risk management.',
  },
  {
    id: 4,
    type: 'chart',
    candles: [
      {o:120,c:116,h:122,l:114},{o:116,c:118,h:120,l:113},{o:118,c:113,h:119,l:111},
      {o:113,c:110,h:114,l:108},{o:110,c:108,h:112,l:106},
    ],
    question: 'Nifty is forming lower highs and lower lows. Now testing a key support at 24,400. What\'s your bias?',
    options: [
      { id: 'a', text: 'Short — structure is clearly bearish' },
      { id: 'b', text: 'Buy — support zone, mean reversion likely' },
      { id: 'c', text: 'Wait for a bounce and then short' },
      { id: 'd', text: 'Stay flat — trend is unclear' },
    ],
    answer: 'c',
    explanation: 'The structure is bearish (lower highs, lower lows). But shorting right at support is dangerous — it could bounce sharply. Waiting for a bounce to a resistance level gives you a high-probability short with a tight stop above resistance.',
  },
  {
    id: 5,
    type: 'context',
    context: [
      { label: 'Event',       value: 'RBI Policy Day',  bad: false },
      { label: 'Expectation', value: 'No rate change',  bad: false },
      { label: 'India VIX',   value: '16.8 ↑',         bad: true  },
      { label: 'Time',        value: '9:45 AM',         bad: false },
    ],
    question: 'RBI policy announcement at 10 AM. You have a profitable long position from yesterday. What do you do?',
    options: [
      { id: 'a', text: 'Hold — no rate change expected, should be fine' },
      { id: 'b', text: 'Exit before 10 AM — don\'t hold through events' },
      { id: 'c', text: 'Add more — positive outcome expected' },
      { id: 'd', text: 'Buy a put as hedge and hold the long' },
    ],
    answer: 'b',
    explanation: '"Buy the rumour, sell the news." Even if the outcome is as expected, markets often reverse on announcement day. VIX rising shows uncertainty. The professional move is to protect profits and re-enter after the event if the setup remains valid.',
  },
]

function ScenarioGame() {
  const [idx, setIdx]     = useState(0)
  const [pick, setPick]   = useState(null)
  const [done, setDone]   = useState(false)
  const scenario          = SCENARIOS[idx]

  const choose = v => {
    if (done) return
    setPick(v)
    setTimeout(() => setDone(true), 400)
  }
  const next = () => {
    setIdx(i => (i + 1) % SCENARIOS.length)
    setPick(null)
    setDone(false)
  }

  return (
    <div>
      {/* Context or chart */}
      {scenario.type === 'chart'
        ? <MiniChart candles={scenario.candles} />
        : (
          <div className="grid grid-cols-2 gap-2 mb-5">
            {scenario.context.map(c => (
              <div key={c.label} className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between
                ${c.bad ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20' : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20'}`}>
                <span className="text-slate-600 dark:text-slate-400">{c.label}</span>
                <span className={`font-bold ${c.bad ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{c.value}</span>
              </div>
            ))}
          </div>
        )
      }

      {/* Question */}
      <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug mb-4">{scenario.question}</p>

      {/* Options */}
      {!done ? (
        <div className="flex flex-col gap-2">
          {scenario.options.map(o => (
            <button key={o.id} onClick={() => choose(o.id)}
              className={`text-left px-4 py-3 rounded-xl text-xs border transition-all duration-200 leading-snug
                ${pick === o.id
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 scale-[0.99]'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.03]'}`}>
              <span className="font-bold text-slate-400 dark:text-slate-500 mr-2">{o.id.toUpperCase()}.</span>{o.text}
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div className={`p-4 rounded-xl border mb-3 text-xs
            ${pick === scenario.answer ? 'border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/30' : 'border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/20'}`}>
            <p className={`font-bold mb-2 text-sm ${pick === scenario.answer ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {pick === scenario.answer ? '✓ Good thinking.' : `✗ The smarter play was: ${scenario.options.find(o=>o.id===scenario.answer)?.text}`}
            </p>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{scenario.explanation}</p>
          </div>
          <button onClick={next}
            className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-semibold hover:border-slate-300 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
            Next scenario →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function Home() {
  useReveal()

  return (
    <>
      <style>{`
        [data-reveal] { opacity: 0; transform: translateY(28px); transition: opacity 0.7s ease, transform 0.7s ease; }
        [data-reveal].revealed { opacity: 1; transform: translateY(0); }
        [data-reveal-delay="1"] { transition-delay: 0.1s; }
        [data-reveal-delay="2"] { transition-delay: 0.2s; }
        [data-reveal-delay="3"] { transition-delay: 0.3s; }
        [data-reveal-delay="4"] { transition-delay: 0.4s; }
      `}</style>

      <div className="bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white min-h-screen">

        {/* ── NAV ── */}
        <Nav fixed />

        {/* ── HERO ── */}
        <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(59,130,246,0.07),transparent_65%)]" />

          <div className="relative z-10 max-w-4xl">
            <p data-reveal className="text-blue-600 dark:text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-8">For Indian Traders</p>

            <h1 data-reveal data-reveal-delay="1" className="text-6xl md:text-8xl font-black tracking-tight leading-[0.9] mb-8">
              Trade less.<br/>
              <span className="text-slate-500">Trade smarter.</span><br/>
              Trade with context.
            </h1>

            <p data-reveal data-reveal-delay="2" className="text-slate-600 dark:text-slate-300 text-base md:text-lg max-w-xl mx-auto leading-relaxed mb-4">
              <span className="text-slate-900 dark:text-white font-semibold">TradingVerse</span> is your daily trading ritual — pre-market context, skill-building games, and lessons from the world's best traders. All in one place.
            </p>

            <p data-reveal data-reveal-delay="3" className="text-slate-500 text-base max-w-2xl mx-auto leading-relaxed mb-16">
              Most traders lose not because they lack skills — but because they trade without understanding the full picture.
            </p>

            <div data-reveal data-reveal-delay="3" className="flex flex-col items-center gap-3">
              <span className="text-slate-500 dark:text-slate-600 text-sm">Scroll to see why</span>
              <div className="w-px h-12 bg-gradient-to-b from-slate-400 dark:from-slate-600 to-transparent" />
            </div>
          </div>
        </section>

        {/* ── QUOTE ── */}
        <section className="py-16 px-6 border-t border-slate-100 dark:border-white/5">
          <div className="max-w-2xl mx-auto text-center" data-reveal>
            <p className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white leading-snug mb-3">
              "Give a man a fish and you feed him for a day.
            </p>
            <p className="text-2xl md:text-3xl font-black text-slate-500 leading-snug mb-6">
              Teach a man to fish and you feed him for a lifetime."
            </p>
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-600">— Proverb</p>
          </div>
        </section>

        {/* ── THE TRUTH ── */}
        <section className="py-32 px-6">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-center">
            <div data-reveal>
              <div className="text-8xl md:text-9xl font-black leading-none mb-4 bg-gradient-to-br from-rose-500 to-rose-400/40 dark:from-rose-500/80 dark:to-rose-800/20 bg-clip-text text-transparent">83%</div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white leading-tight">of retail traders lose money in the markets.</p>
            </div>
            <div data-reveal data-reveal-delay="2">
              <p className="text-slate-600 dark:text-slate-400 text-xl leading-relaxed mb-6">
                The 17% who consistently win share one habit — they understand <em className="text-slate-900 dark:text-white not-italic font-semibold">context</em> before placing a trade.
              </p>
              <p className="text-slate-500 text-base leading-relaxed mb-8">
                They know what the global markets did overnight. They know where smart money is positioned. They've trained their instincts on hundreds of real scenarios. They've read the books.
              </p>
              <Link href="/trades" className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm font-semibold hover:gap-3 transition-all group">
                See what the 17% see every morning
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ── THREE PATHS ── */}
        <section className="border-t border-slate-100 dark:border-white/5">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-white/5">

            {[
              {
                num: '01', verb: 'Know',
                desc: 'Understand what the market is telling you before it opens. Global cues, key levels, what to watch.',
                cta: 'Open Pre-Market →', href: '/trades/pre-market',
                accent: 'text-blue-600 dark:text-blue-400',
              },
              {
                num: '02', verb: 'Train',
                desc: 'Test your instincts on real market scenarios. No capital at risk. Just you vs the chart.',
                cta: 'Play a game →', href: '#games',
                accent: 'text-emerald-600 dark:text-emerald-400',
              },
              {
                num: '03', verb: 'Learn',
                desc: 'Read what the best traders in the world figured out after years of painful losses.',
                cta: 'Explore articles & books →', href: '/learn',
                accent: 'text-violet-600 dark:text-violet-400',
              },
            ].map((p, i) => (
              <div key={p.num} data-reveal className={`p-10 md:p-14 group hover:bg-slate-100 dark:hover:bg-white/[0.02] transition-colors`} style={{transitionDelay: `${i*0.1}s`}}>
                <div className="text-slate-400 dark:text-slate-700 text-sm font-bold tracking-widest mb-6">{p.num}</div>
                <h3 className={`text-5xl font-black mb-6 ${p.accent}`}>{p.verb}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed mb-10">{p.desc}</p>
                <Link href={p.href} className={`text-sm font-semibold ${p.accent} hover:underline`}>{p.cta}</Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── GAMES ── */}
        <section id="games" className="py-32 px-6 border-t border-slate-100 dark:border-white/5">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <p data-reveal className="text-emerald-600 dark:text-emerald-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Trading Games</p>
                <h2 data-reveal data-reveal-delay="1" className="text-4xl md:text-5xl font-black mb-6 leading-tight">
                  Can you read<br/>the chart?
                </h2>
                <p data-reveal data-reveal-delay="2" className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed mb-6">
                  Real market scenarios. Real decisions. No right answer is obvious — just like actual trading.
                </p>
                <div data-reveal data-reveal-delay="3" className="flex items-center gap-6 text-sm text-slate-500 mb-8">
                  <span>🎮 New scenarios every week</span>
                  <span>⚡ No signup needed</span>
                </div>
                <Link data-reveal data-reveal-delay="4" href="/games" className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                  See all games →
                </Link>
              </div>

              <div data-reveal data-reveal-delay="2">
                <div className="p-8 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02]">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-4 font-semibold">Scenario Challenge</p>
                  <ScenarioGame />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── LEARN ── */}
        <section id="learn" className="py-32 px-6 border-t border-slate-100 dark:border-white/5">
          <div className="max-w-5xl mx-auto">
            <p data-reveal className="text-violet-600 dark:text-violet-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Learn from Masters</p>
            <h2 data-reveal data-reveal-delay="1" className="text-4xl md:text-5xl font-black mb-16 leading-tight max-w-xl">
              Everything the best traders learned the hard way.
            </h2>

            {/* Featured article */}
            <Link href="/learn/articles/trader-who-knew-everything" data-reveal className="group block p-10 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all mb-6">
              <span className="text-xs font-bold tracking-widest uppercase text-cyan-600 dark:text-cyan-400 mb-4 block">Market Psychology</span>
              <h3 className="text-2xl md:text-3xl font-black mb-4 group-hover:text-blue-700 dark:group-hover:text-blue-200 transition-colors leading-tight">
                The trader who knew everything but lost anyway
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed max-w-2xl mb-6">
                He could identify every pattern. He knew support, resistance, order flow. He had read every book. And yet, at the end of each month, his account shrank. The problem was never knowledge.
              </p>
              <span className="text-sm font-semibold text-cyan-600 dark:text-cyan-400 group-hover:underline">Read article →</span>
            </Link>

            {/* Books */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { title: 'Trading in the Zone', author: 'Mark Douglas', emoji: '🧠', slug: 'trading-in-the-zone', lesson: 'Your edge means nothing without the mental discipline to execute it consistently.' },
                { title: 'Market Wizards', author: 'Jack Schwager', emoji: '⚡', slug: 'market-wizards', lesson: 'Every great trader has found a unique edge. Find yours and exploit it relentlessly.' },
                { title: 'The Daily Trading Coach', author: 'Brett Steenbarger', emoji: '🎯', slug: 'daily-trading-coach', lesson: 'Self-improvement is the highest-leverage activity in trading.' },
                { title: 'Reminiscences of a Stock Operator', author: 'Edwin Lefèvre', emoji: '📜', slug: 'reminiscences-stock-operator', lesson: 'Human nature never changes. The market has always been the same game.' },
              ].map((b, i) => (
                <Link key={b.title} href={`/learn/books/${b.slug}`} data-reveal className="group relative rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 hover:border-violet-300 dark:hover:border-violet-700/60 hover:bg-violet-50 dark:hover:bg-violet-950/10 transition-all overflow-hidden min-h-[160px] block"
                  style={{transitionDelay: `${i*0.08}s`}}>
                  <div className="transition-all duration-300 group-hover:opacity-0">
                    <div className="text-3xl mb-3">{b.emoji}</div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight mb-1">{b.title}</p>
                    <p className="text-xs text-slate-500">{b.author}</p>
                  </div>
                  <div className="absolute inset-0 p-6 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <p className="text-violet-700 dark:text-violet-300 text-xs leading-relaxed italic">"{b.lesson}"</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── TESTIMONIALS ── */}
        <section className="py-32 px-6 border-t border-slate-100 dark:border-white/5">
          <div className="max-w-5xl mx-auto">
            <p data-reveal className="text-slate-500 text-xs font-bold tracking-[0.2em] uppercase mb-16 text-center">What traders say</p>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { quote: "The pre-market analysis alone changed how I approach each trading day. I stopped trading in the dark.", name: 'Rahul M.', role: 'Swing Trader, Mumbai' },
                { quote: "The games section is addictive. I've played the direction challenge every morning for 3 weeks. My accuracy went from 48% to 67%.", name: 'Priya S.', role: 'Positional Trader, Bangalore' },
                { quote: "Finally a tool that focuses on context, not just charts. The articles are some of the best trading content I've read in years.", name: 'Karan T.', role: 'Options Trader, Delhi' },
              ].map((t, i) => (
                <div key={i} data-reveal className="p-8 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-white/[0.02]" style={{transitionDelay: `${i*0.1}s`}}>
                  <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed mb-6 italic">"{t.quote}"</p>
                  <div>
                    <p className="text-slate-900 dark:text-white font-semibold text-sm">{t.name}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="py-32 px-6 border-t border-slate-100 dark:border-white/5">
          <div className="max-w-3xl mx-auto text-center">
            <div data-reveal className="inline-block w-16 h-px bg-blue-500 mb-10" />
            <h2 data-reveal data-reveal-delay="1" className="text-5xl md:text-6xl font-black mb-6 leading-tight">
              Ready to trade<br/>with context?
            </h2>
            <p data-reveal data-reveal-delay="2" className="text-slate-600 dark:text-slate-400 text-lg mb-12">
              Join traders who've stopped guessing and started reading the market.
            </p>
            <Link data-reveal data-reveal-delay="3" href="/trades"
              className="inline-block px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-lg transition-all duration-200 hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] hover:-translate-y-1">
              Enter TradingVerse →
            </Link>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="border-t border-slate-100 dark:border-white/5 py-12 px-8">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <span className="text-base font-black text-slate-900 dark:text-white">Trading<span className="text-blue-600 dark:text-blue-400">Verse</span></span>
            <div className="flex items-center gap-8 text-sm text-slate-500">
              <Link href="/trades"          className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Dashboard</Link>
              <Link href="#games"           className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Games</Link>
              <Link href="/learn"            className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Articles</Link>
              <Link href="/learn"            className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Books</Link>
              <a    href="mailto:hello@tradingverse.in" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Contact</a>
            </div>
            <p className="text-slate-400 dark:text-slate-700 text-xs">© 2025 TradingVerse</p>
          </div>
        </footer>

      </div>
    </>
  )
}
