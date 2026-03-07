'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

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

// ── Inline game ────────────────────────────────────────────────────────────
function InlineGame() {
  const [pick, setPick]   = useState(null)
  const [done, setDone]   = useState(false)
  const answer = 'bullish'

  const choose = v => {
    if (done) return
    setPick(v)
    setTimeout(() => setDone(true), 500)
  }
  const reset = () => { setPick(null); setDone(false) }

  return (
    <div className="max-w-md mx-auto">
      {/* Chart */}
      <div className="flex items-end gap-2 h-20 mb-6 px-2">
        {[{h:35,g:false},{h:50,g:true},{h:42,g:false},{h:62,g:true},{h:72,g:true}].map((c,i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-px">
            <div className={`w-px opacity-50 ${c.g?'bg-emerald-400':'bg-rose-400'}`} style={{height:c.h*0.25}}/>
            <div className={`w-full rounded-sm opacity-90 ${c.g?'bg-emerald-400':'bg-rose-400'}`} style={{height:c.h*0.65}}/>
            <div className={`w-px opacity-50 ${c.g?'bg-emerald-400':'bg-rose-400'}`} style={{height:c.h*0.15}}/>
          </div>
        ))}
        <div className="flex-1 h-full flex items-center justify-center border-2 border-dashed border-slate-600 rounded-sm">
          <span className="text-slate-500 text-sm font-bold">?</span>
        </div>
      </div>

      {!done ? (
        <div className="flex gap-3">
          <button onClick={() => choose('bullish')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm border transition-all duration-200
              ${pick==='bullish' ? 'bg-emerald-600 border-emerald-500 text-white scale-95' : 'border-slate-700 text-slate-400 hover:border-emerald-600 hover:text-emerald-400'}`}>
            📈 Bullish
          </button>
          <button onClick={() => choose('bearish')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm border transition-all duration-200
              ${pick==='bearish' ? 'bg-rose-600 border-rose-500 text-white scale-95' : 'border-slate-700 text-slate-400 hover:border-rose-600 hover:text-rose-400'}`}>
            📉 Bearish
          </button>
        </div>
      ) : (
        <div className={`p-4 rounded-xl border text-sm ${pick===answer ? 'border-emerald-700 bg-emerald-950/40' : 'border-rose-700 bg-rose-950/40'}`}>
          <p className={`font-bold mb-1 ${pick===answer ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pick===answer ? '✓ Correct! +10 XP' : '✗ The next candle was bullish.'}
          </p>
          <p className="text-slate-500 text-xs leading-relaxed">Price swept the low (liquidity grab) before reversing higher. Classic stop hunt.</p>
          <button onClick={reset} className="mt-3 text-xs text-slate-500 hover:text-slate-300 underline transition-colors">Try again</button>
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

      <div className="bg-[#060b14] text-white min-h-screen">

        {/* ── NAV ── */}
        <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 bg-[#060b14]/80 backdrop-blur-md border-b border-white/5">
          <span className="text-lg font-black tracking-tight">Trading<span className="text-blue-400">Verse</span></span>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <Link href="/trades"   className="hover:text-white transition-colors">Dashboard</Link>
            <Link href="#games"    className="hover:text-white transition-colors">Games</Link>
            <Link href="#learn"    className="hover:text-white transition-colors">Learn</Link>
          </div>
          <Link href="/settings/kite" className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:border-blue-600 hover:text-white transition-all">
            Login
          </Link>
        </nav>

        {/* ── HERO ── */}
        <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(59,130,246,0.07),transparent_65%)]" />

          <div className="relative z-10 max-w-4xl">
            <p data-reveal className="text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-8">For Indian Traders</p>

            <h1 data-reveal data-reveal-delay="1" className="text-6xl md:text-8xl font-black tracking-tight leading-[0.9] mb-8">
              Trade less.<br/>
              <span className="text-slate-500">Trade smarter.</span><br/>
              Trade with context.
            </h1>

            <p data-reveal data-reveal-delay="2" className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-16">
              Most traders lose not because they lack skills — but because they trade without understanding the full picture.
            </p>

            <div data-reveal data-reveal-delay="3" className="flex flex-col items-center gap-3">
              <span className="text-slate-600 text-sm">Scroll to see why</span>
              <div className="w-px h-12 bg-gradient-to-b from-slate-600 to-transparent" />
            </div>
          </div>
        </section>

        {/* ── THE TRUTH ── */}
        <section className="py-32 px-6">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-center">
            <div data-reveal>
              <div className="text-8xl md:text-9xl font-black text-white/10 leading-none mb-4">83%</div>
              <p className="text-3xl font-bold text-white leading-tight">of retail traders lose money in the markets.</p>
            </div>
            <div data-reveal data-reveal-delay="2">
              <p className="text-slate-400 text-xl leading-relaxed mb-6">
                The 17% who consistently win share one habit — they understand <em className="text-white not-italic font-semibold">context</em> before placing a trade.
              </p>
              <p className="text-slate-500 text-base leading-relaxed">
                They know what the global markets did overnight. They know where smart money is positioned. They've trained their instincts on hundreds of real scenarios. They've read the books.
              </p>
            </div>
          </div>
        </section>

        {/* ── THREE PATHS ── */}
        <section className="border-t border-white/5">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/5">

            {[
              {
                num: '01', verb: 'Know',
                desc: 'Understand what the market is telling you before it opens. Global cues, key levels, what to watch.',
                cta: 'Open Pre-Market →', href: '/trades/pre-market',
                accent: 'text-blue-400',
              },
              {
                num: '02', verb: 'Train',
                desc: 'Test your instincts on real market scenarios. No capital at risk. Just you vs the chart.',
                cta: 'Play a game →', href: '#games',
                accent: 'text-emerald-400',
              },
              {
                num: '03', verb: 'Learn',
                desc: 'Read what the best traders in the world figured out after years of painful losses.',
                cta: 'Explore articles & books →', href: '#learn',
                accent: 'text-violet-400',
              },
            ].map((p, i) => (
              <div key={p.num} data-reveal className={`p-10 md:p-14 group hover:bg-white/[0.02] transition-colors`} style={{transitionDelay: `${i*0.1}s`}}>
                <div className="text-slate-700 text-sm font-bold tracking-widest mb-6">{p.num}</div>
                <h3 className={`text-5xl font-black mb-6 ${p.accent}`}>{p.verb}</h3>
                <p className="text-slate-400 text-base leading-relaxed mb-10">{p.desc}</p>
                <Link href={p.href} className={`text-sm font-semibold ${p.accent} hover:underline`}>{p.cta}</Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── GAMES ── */}
        <section id="games" className="py-32 px-6 border-t border-white/5">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <p data-reveal className="text-emerald-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Trading Games</p>
                <h2 data-reveal data-reveal-delay="1" className="text-4xl md:text-5xl font-black mb-6 leading-tight">
                  Can you read<br/>the chart?
                </h2>
                <p data-reveal data-reveal-delay="2" className="text-slate-400 text-lg leading-relaxed mb-6">
                  Nifty 15-min chart. Five candles. What happens next? No login required — just your instinct vs the market.
                </p>
                <div data-reveal data-reveal-delay="3" className="flex items-center gap-6 text-sm text-slate-500 mb-8">
                  <span>🎮 3 games available</span>
                  <span>⚡ No signup needed</span>
                </div>
                <Link data-reveal data-reveal-delay="4" href="#" className="text-sm font-semibold text-emerald-400 hover:underline">
                  See all games →
                </Link>
              </div>

              <div data-reveal data-reveal-delay="2">
                <div className="p-8 rounded-3xl border border-white/10 bg-white/[0.02]">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-6 font-semibold">Live challenge</p>
                  <InlineGame />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── LEARN ── */}
        <section id="learn" className="py-32 px-6 border-t border-white/5">
          <div className="max-w-5xl mx-auto">
            <p data-reveal className="text-violet-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Learn from Masters</p>
            <h2 data-reveal data-reveal-delay="1" className="text-4xl md:text-5xl font-black mb-16 leading-tight max-w-xl">
              Everything the best traders learned the hard way.
            </h2>

            {/* Featured article */}
            <div data-reveal className="group p-10 rounded-3xl border border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04] transition-all cursor-pointer mb-6">
              <span className="text-xs font-bold tracking-widest uppercase text-cyan-400 mb-4 block">Market Psychology</span>
              <h3 className="text-2xl md:text-3xl font-black mb-4 group-hover:text-blue-200 transition-colors leading-tight">
                The trader who knew everything but lost anyway
              </h3>
              <p className="text-slate-400 text-base leading-relaxed max-w-2xl mb-6">
                He could identify every pattern. He knew support, resistance, order flow. He had read every book. And yet, at the end of each month, his account shrank. The problem was never knowledge.
              </p>
              <span className="text-sm font-semibold text-cyan-400 group-hover:underline">Read article →</span>
            </div>

            {/* Books */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { title: 'Trading in the Zone', author: 'Mark Douglas', emoji: '🧠', lesson: 'Your edge means nothing without the mental discipline to execute it consistently.' },
                { title: 'Market Wizards', author: 'Jack Schwager', emoji: '⚡', lesson: 'Every great trader has found a unique edge. Find yours and exploit it relentlessly.' },
                { title: 'The Daily Trading Coach', author: 'Brett Steenbarger', emoji: '🎯', lesson: 'Self-improvement is the highest-leverage activity in trading.' },
                { title: 'Reminiscences of a Stock Operator', author: 'Edwin Lefèvre', emoji: '📜', lesson: 'Human nature never changes. The market has always been the same game.' },
              ].map((b, i) => (
                <div key={b.title} data-reveal className="group relative rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-violet-700/60 hover:bg-violet-950/10 transition-all cursor-pointer overflow-hidden min-h-[160px]"
                  style={{transitionDelay: `${i*0.08}s`}}>
                  <div className="transition-all duration-300 group-hover:opacity-0">
                    <div className="text-3xl mb-3">{b.emoji}</div>
                    <p className="text-sm font-bold text-white leading-tight mb-1">{b.title}</p>
                    <p className="text-xs text-slate-500">{b.author}</p>
                  </div>
                  <div className="absolute inset-0 p-6 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <p className="text-violet-300 text-xs leading-relaxed italic">"{b.lesson}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── TESTIMONIALS ── */}
        <section className="py-32 px-6 border-t border-white/5">
          <div className="max-w-5xl mx-auto">
            <p data-reveal className="text-slate-500 text-xs font-bold tracking-[0.2em] uppercase mb-16 text-center">What traders say</p>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { quote: "The pre-market analysis alone changed how I approach each trading day. I stopped trading in the dark.", name: 'Rahul M.', role: 'Swing Trader, Mumbai' },
                { quote: "The games section is addictive. I've played the direction challenge every morning for 3 weeks. My accuracy went from 48% to 67%.", name: 'Priya S.', role: 'Positional Trader, Bangalore' },
                { quote: "Finally a tool that focuses on context, not just charts. The articles are some of the best trading content I've read in years.", name: 'Karan T.', role: 'Options Trader, Delhi' },
              ].map((t, i) => (
                <div key={i} data-reveal className="p-8 rounded-2xl border border-white/8 bg-white/[0.02]" style={{transitionDelay: `${i*0.1}s`}}>
                  <p className="text-slate-300 text-base leading-relaxed mb-6 italic">"{t.quote}"</p>
                  <div>
                    <p className="text-white font-semibold text-sm">{t.name}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="py-32 px-6 border-t border-white/5">
          <div className="max-w-3xl mx-auto text-center">
            <div data-reveal className="inline-block w-16 h-px bg-blue-500 mb-10" />
            <h2 data-reveal data-reveal-delay="1" className="text-5xl md:text-6xl font-black mb-6 leading-tight">
              Ready to trade<br/>with context?
            </h2>
            <p data-reveal data-reveal-delay="2" className="text-slate-400 text-lg mb-12">
              Join traders who've stopped guessing and started reading the market.
            </p>
            <Link data-reveal data-reveal-delay="3" href="/trades"
              className="inline-block px-12 py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-bold text-lg transition-all duration-200 hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] hover:-translate-y-1">
              Enter TradingVerse →
            </Link>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="border-t border-white/5 py-12 px-8">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <span className="text-base font-black">Trading<span className="text-blue-400">Verse</span></span>
            <div className="flex items-center gap-8 text-sm text-slate-500">
              <Link href="/trades"          className="hover:text-slate-300 transition-colors">Dashboard</Link>
              <Link href="#games"           className="hover:text-slate-300 transition-colors">Games</Link>
              <Link href="#learn"           className="hover:text-slate-300 transition-colors">Articles</Link>
              <Link href="#learn"           className="hover:text-slate-300 transition-colors">Books</Link>
              <a    href="mailto:hello@tradingverse.in" className="hover:text-slate-300 transition-colors">Contact</a>
            </div>
            <p className="text-slate-700 text-xs">© 2025 TradingVerse</p>
          </div>
        </footer>

      </div>
    </>
  )
}
