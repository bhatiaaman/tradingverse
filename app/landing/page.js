'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

// ── Intersection observer for reveal animations ────────────────────────────
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible') }),
      { threshold: 0.1 }
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

// ── Animated counter ───────────────────────────────────────────────────────
function Counter({ end, suffix = '', duration = 2000 }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        const start = performance.now()
        function step(now) {
          const p = Math.min((now - start) / duration, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          setCount(Math.round(ease * end))
          if (p < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }
    }, { threshold: 0.5 })
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [end, duration])

  return <span ref={ref}>{count.toLocaleString('en-IN')}{suffix}</span>
}

// ── Feature card ───────────────────────────────────────────────────────────
function FeatureCard({ icon, tag, tagColor, title, description, href, badge }) {
  return (
    <div data-reveal className="reveal-card group relative flex flex-col bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:border-violet-500/40 hover:bg-white/[0.05] transition-all duration-300">
      {badge && (
        <span className="absolute top-4 right-4 text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300">
          {badge}
        </span>
      )}
      <span className={`self-start text-[9px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded-full border mb-4 ${tagColor}`}>
        {tag}
      </span>
      <div className="mb-3 text-violet-400">{icon}</div>
      <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-6 flex-1">{description}</p>
      {href && (
        <Link href={href} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors">
          Explore →
        </Link>
      )}
    </div>
  )
}

// ── Testimonial ────────────────────────────────────────────────────────────
function Testimonial({ quote, name, role }) {
  return (
    <div data-reveal className="reveal-card flex flex-col bg-white/[0.03] border border-white/8 rounded-2xl p-6">
      <svg className="w-6 h-6 text-violet-500/60 mb-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
      </svg>
      <p className="text-slate-300 text-sm leading-7 flex-1 italic">{quote}</p>
      <div className="mt-5 pt-5 border-t border-white/8">
        <p className="text-white font-semibold text-sm">{name}</p>
        <p className="text-slate-500 text-xs mt-0.5">{role}</p>
      </div>
    </div>
  )
}

// ── Check icon ─────────────────────────────────────────────────────────────
function Check({ dim }) {
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${dim ? 'text-slate-600' : 'text-emerald-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {dim
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      }
    </svg>
  )
}

// ── Main landing page ──────────────────────────────────────────────────────
export default function LandingPage() {
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
        [data-reveal] { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
        [data-reveal].is-visible { opacity: 1; transform: translateY(0); }
        [data-reveal]:nth-child(2) { transition-delay: 0.1s; }
        [data-reveal]:nth-child(3) { transition-delay: 0.2s; }
        [data-reveal]:nth-child(4) { transition-delay: 0.3s; }
      `}</style>

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/8 bg-[#060b14]/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-sm font-black tracking-tight text-white">TradingVerse</span>
            <span className="text-[9px] font-bold tracking-widest uppercase text-violet-400 bg-violet-500/15 border border-violet-500/30 px-1.5 py-0.5 rounded-full">Beta</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#intelligence" className="hover:text-white transition-colors">AI Tools</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <Link href="/learn" className="hover:text-white transition-colors">Learn</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">Sign in</Link>
            <Link href="/login" className="text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl transition-colors">
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-24 px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-violet-600/10 rounded-full blur-3xl" />
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-blue-600/8 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            India's Intelligence-First Trading Platform
          </div>

          <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6">
            Trade with{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400">
              intelligence.
            </span>
            <br />Not just instinct.
          </h1>

          <p className="text-slate-400 text-lg md:text-xl leading-8 max-w-2xl mx-auto mb-10">
            TradingVerse combines live market data, AI analysis, behavioural coaching, and broker-integrated order execution — in one unified platform built for Indian traders.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login" className="w-full sm:w-auto px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-2xl transition-all duration-200 text-base shadow-lg shadow-violet-500/20">
              Start for Free — No Card Needed
            </Link>
            <Link href="/trades" className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-2xl transition-all duration-200 text-base">
              Open Terminal →
            </Link>
          </div>

          <p className="mt-5 text-xs text-slate-600">
            Free tier includes live data, option chain, chart analyser & more. No credit card required.
          </p>
        </div>

        {/* ── Hero visual: terminal mockup ──── */}
        <div className="relative max-w-5xl mx-auto mt-16">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-2xl shadow-black/40">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/8 bg-white/[0.02]">
              <span className="w-3 h-3 rounded-full bg-rose-500/70" />
              <span className="w-3 h-3 rounded-full bg-amber-500/70" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
              <span className="ml-4 text-xs text-slate-600 font-mono">tradingverse.in/trades</span>
            </div>
            {/* Fake terminal content */}
            <div className="grid grid-cols-12 gap-px bg-white/5 min-h-[320px]">
              {/* Left sidebar */}
              <div className="col-span-3 bg-[#060b14] p-4 space-y-3">
                <p className="text-[10px] font-bold tracking-widest uppercase text-slate-600 mb-3">Indices</p>
                {[
                  { name: 'NIFTY 50', val: '24,153', chg: '+0.72%', up: true },
                  { name: 'BANK NIFTY', val: '52,840', chg: '+1.14%', up: true },
                  { name: 'INDIA VIX', val: '13.45', chg: '-4.2%', up: false },
                  { name: 'SENSEX', val: '79,408', chg: '+0.68%', up: true },
                ].map(idx => (
                  <div key={idx.name} className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">{idx.name}</span>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-200">{idx.val}</p>
                      <p className={`text-[10px] font-semibold ${idx.up ? 'text-emerald-400' : 'text-rose-400'}`}>{idx.chg}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Centre — chart area */}
              <div className="col-span-6 bg-[#060b14] p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-white">NIFTY 50</p>
                    <p className="text-xs text-slate-500">NSE · 5 min</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-emerald-400">24,153.00</p>
                    <p className="text-xs text-emerald-400">+173.45 (0.72%)</p>
                  </div>
                </div>
                {/* Fake chart bars */}
                <div className="flex-1 flex items-end gap-[3px] px-1">
                  {[45,52,48,55,60,58,62,70,65,68,72,69,75,73,80,78,82,76,84,88,85,90,87,92].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-[1px]">
                      <div style={{ height: `${h}%` }} className={`w-full rounded-sm ${i % 3 === 0 ? 'bg-rose-500/60' : 'bg-emerald-500/60'}`} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3 justify-center">
                  {['5m','15m','1h','1d'].map(t => (
                    <button key={t} className={`text-[10px] px-2 py-0.5 rounded font-semibold ${t === '5m' ? 'bg-violet-500/20 text-violet-400' : 'text-slate-600'}`}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Right — order panel */}
              <div className="col-span-3 bg-[#060b14] p-4 space-y-3">
                <p className="text-[10px] font-bold tracking-widest uppercase text-slate-600 mb-3">Order</p>
                <div className="grid grid-cols-2 gap-1">
                  <button className="py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold">BUY</button>
                  <button className="py-1.5 rounded-lg bg-white/5 text-slate-500 text-xs font-bold">SELL</button>
                </div>
                <div className="space-y-2">
                  {[['Symbol', 'NIFTY24MAR'], ['Type', 'Market'], ['Qty', '50'], ['Price', 'MKT']].map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-600">{k}</span>
                      <span className="text-[11px] font-semibold text-slate-300">{v}</span>
                    </div>
                  ))}
                </div>
                <button className="w-full py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-xl">
                  Place Order
                </button>
                {/* Order Intelligence teaser */}
                <div className="mt-2 p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <p className="text-[9px] font-bold tracking-widest uppercase text-violet-400 mb-1">AI Pre-Trade</p>
                  <p className="text-[10px] text-slate-400 leading-4">Trend aligned ✓ · RR 2.4x · Fair entry</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <section className="border-y border-white/8 bg-white/[0.02] py-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { label: 'Instruments tracked', val: 5000, suffix: '+' },
              { label: 'Options strikes live', val: 200, suffix: '+' },
              { label: 'Market hours covered', val: 6, suffix: '.5h/day' },
              { label: 'AI signals per session', val: 12, suffix: '+' },
            ].map(stat => (
              <div key={stat.label}>
                <p className="text-3xl font-black text-white mb-1">
                  <Counter end={stat.val} suffix={stat.suffix} />
                </p>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Core features grid ─────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-violet-400 block mb-3">Platform Features</span>
            <h2 className="text-4xl md:text-5xl font-black mb-4">Everything a trader needs.</h2>
            <p className="text-slate-400 max-w-xl mx-auto text-base leading-7">
              From live data to AI-powered analysis to order execution — all in one place, built specifically for Indian markets.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <FeatureCard
              tag="Live Terminal"
              tagColor="text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              title="Trading Terminal"
              description="Full-featured terminal with live NIFTY/BANKNIFTY charts, real-time option chain, indices feed, and broker-integrated order placement."
              href="/trades"
            />
            <FeatureCard
              tag="AI Vision"
              tagColor="text-sky-400 bg-sky-500/10 border-sky-500/20"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              title="Chart Analyser"
              description="Upload any chart screenshot. AI reads technical structure, pattern setups, relative strength, sector context, and builds a bull/bear story."
              href="/investing/chart-analyser"
              badge="AI Powered"
            />
            <FeatureCard
              tag="AI Macro"
              tagColor="text-violet-400 bg-violet-500/10 border-violet-500/20"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              title="Strategic View"
              description="Multi-horizon macro outlook synthesising Dalio, Marks, Soros, Burry frameworks across 3M to 10Y horizons. Bull/Bear/Base cases with signposts."
              href="/investing/strategic-view"
              badge="AI Powered"
            />
            <FeatureCard
              tag="Pre-Trade AI"
              tagColor="text-amber-400 bg-amber-500/10 border-amber-500/20"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
              title="Order Intelligence"
              description="Before you place a trade, get AI-powered analysis: trend alignment, risk-reward ratio, volatility regime, and a structured pre-trade checklist."
              href="/trades"
            />
            <FeatureCard
              tag="Psychology"
              tagColor="text-rose-400 bg-rose-500/10 border-rose-500/20"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
              title="Behavioural Agent"
              description="Real-time bias detection while you trade. Spots FOMO, revenge trading, overconfidence, and anchoring before they cost you money."
              href="/trades"
            />
            <FeatureCard
              tag="Morning Prep"
              tagColor="text-orange-400 bg-orange-500/10 border-orange-500/20"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
              title="Pre-Market Planner"
              description="Start every session right. Global cues, GIFT Nifty, top movers, key S/R levels, sector performance — before the market opens at 9:15."
              href="/pre-market"
            />
          </div>
        </div>
      </section>

      {/* ── Deep dive: Order Intelligence ─────────────────────────────── */}
      <section id="intelligence" className="py-24 px-6 bg-white/[0.02] border-y border-white/8">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div data-reveal>
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-amber-400 block mb-4">Order Intelligence</span>
              <h2 className="text-4xl font-black mb-5 leading-tight">
                Know before<br />you trade.
              </h2>
              <p className="text-slate-400 text-base leading-7 mb-8">
                Every order you place on TradingVerse goes through an AI pre-trade analysis engine. It tells you whether the trade aligns with the current trend, the risk:reward ratio, the volatility environment, and flags any red flags — before you pull the trigger.
              </p>
              <ul className="space-y-4">
                {[
                  { label: 'Trend alignment', desc: 'Is the trade with or against the short, medium, and long-term trend?' },
                  { label: 'Risk:Reward calculation', desc: 'Automatic R:R based on your entry, stop, and target.' },
                  { label: 'Volatility context', desc: 'Is IV high or low? Is this the right time to buy or sell options?' },
                  { label: 'Scenario synthesis', desc: 'Bull / Bear / Base scenarios for the next 15 mins to 1 session.' },
                ].map(item => (
                  <li key={item.label} className="flex gap-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
                    <div>
                      <p className="text-white font-semibold text-sm">{item.label}</p>
                      <p className="text-slate-500 text-sm mt-0.5">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Mock Order Intelligence card */}
            <div data-reveal className="relative">
              <div className="absolute inset-0 bg-amber-500/5 rounded-3xl blur-3xl" />
              <div className="relative bg-white/[0.03] border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs font-bold tracking-widest uppercase text-amber-400">Order Intelligence</p>
                    <p className="text-white font-bold text-lg mt-0.5">NIFTY 24600 CE</p>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">BULLISH</span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Trend', val: 'Aligned ✓', good: true },
                    { label: 'Risk:Reward', val: '1 : 2.8', good: true },
                    { label: 'IV Rank', val: '38 — Low', good: true },
                  ].map(m => (
                    <div key={m.label} className={`rounded-xl p-3 border ${m.good ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-rose-500/8 border-rose-500/20'}`}>
                      <p className="text-[10px] text-slate-500 mb-1">{m.label}</p>
                      <p className={`text-xs font-bold ${m.good ? 'text-emerald-400' : 'text-rose-400'}`}>{m.val}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 mb-5">
                  <p className="text-[10px] font-bold tracking-widest uppercase text-slate-600">Scenarios</p>
                  {[
                    { label: 'Bull', prob: 45, desc: 'Break above 24600 targets 24800', color: 'bg-emerald-500' },
                    { label: 'Base', prob: 35, desc: 'Range between 24400–24600 intraday', color: 'bg-amber-500' },
                    { label: 'Bear', prob: 20, desc: 'Rejection at 24600, back to 24300', color: 'bg-rose-500' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-500 w-7">{s.label}</span>
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full ${s.color} rounded-full`} style={{ width: `${s.prob}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400 w-6 text-right">{s.prob}%</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-500 leading-5 italic border-t border-white/8 pt-4">
                  "Trend aligned with rising NIFTY momentum. Low IV favours buying options. 24600 is near-term resistance — wait for a 5-min close above before entering."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Learning ecosystem ─────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">

            {/* Mock game card */}
            <div data-reveal className="relative order-2 md:order-1">
              <div className="absolute inset-0 bg-violet-500/5 rounded-3xl blur-3xl" />
              <div className="relative bg-white/[0.03] border border-white/10 rounded-2xl p-6">
                <p className="text-[10px] font-bold tracking-widest uppercase text-violet-400 mb-4">Trading Psychology Quiz</p>
                <div className="mb-4 bg-white/[0.02] border border-white/8 rounded-xl p-4 space-y-2">
                  {[
                    { label: 'Dow Jones', value: '-1.8%', bad: true },
                    { label: 'GIFT Nifty', value: '-180 pts', bad: true },
                    { label: 'India VIX', value: '18.4 ↑', bad: true },
                    { label: 'Nifty', value: 'Near weekly S/R', bad: false },
                  ].map(ctx => (
                    <div key={ctx.label} className="flex justify-between text-xs">
                      <span className="text-slate-500">{ctx.label}</span>
                      <span className={ctx.bad ? 'text-rose-400 font-semibold' : 'text-amber-400 font-semibold'}>{ctx.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-white font-semibold mb-4 leading-5">
                  Gap down expected. Nifty near weekly support. 9:15 AM. What do you do?
                </p>
                <div className="space-y-2">
                  {[
                    { id: 'a', text: 'Short immediately — global cues are bearish' },
                    { id: 'b', text: 'Wait 15–30 mins for directional confirmation', correct: true },
                    { id: 'c', text: 'Buy the dip — support will hold' },
                  ].map(opt => (
                    <button key={opt.id} className={`w-full text-left text-xs px-4 py-2.5 rounded-xl border transition-colors ${opt.correct ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 font-semibold' : 'bg-white/[0.02] border-white/8 text-slate-400 hover:bg-white/[0.05]'}`}>
                      <span className="font-bold mr-2 uppercase">{opt.id}.</span>{opt.text}
                      {opt.correct && <span className="ml-2 text-emerald-400">✓ Correct</span>}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-[11px] text-slate-500 leading-5 italic">
                  Opening volatility peaks in the first 15 mins. Waiting for confirmation is the professional move.
                </p>
              </div>
            </div>

            <div data-reveal className="order-1 md:order-2">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-violet-400 block mb-4">Learn & Improve</span>
              <h2 className="text-4xl font-black mb-5 leading-tight">
                Train your mind.<br />Sharpen your edge.
              </h2>
              <p className="text-slate-400 text-base leading-7 mb-8">
                Most traders lose not because of missing data — but because of their own psychology. TradingVerse teaches you how the best traders think.
              </p>
              <div className="space-y-5">
                {[
                  {
                    title: 'Trading Games',
                    desc: 'Scenario-based quizzes with real market setups. Test your decision-making without risking capital.',
                  },
                  {
                    title: 'Book Summaries',
                    desc: 'Market Wizards, Reminiscences, Trading in the Zone — condensed to the key lessons you need.',
                  },
                  {
                    title: 'Articles',
                    desc: 'Practical guides on options, F&O strategies, technical analysis, and market microstructure.',
                  },
                ].map(item => (
                  <div key={item.title} className="flex gap-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 flex-shrink-0" />
                    <div>
                      <p className="text-white font-semibold text-sm">{item.title}</p>
                      <p className="text-slate-500 text-sm mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/learn" className="inline-flex items-center gap-2 mt-8 text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors">
                Go to Learn →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Investing tools ────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white/[0.02] border-y border-white/8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-violet-400 block mb-3">Investing Suite</span>
            <h2 className="text-4xl font-black mb-4">Invest with context.<br /><span className="text-slate-500">Not just conviction.</span></h2>
            <p className="text-slate-400 max-w-xl mx-auto text-base leading-7">
              For medium to long-term investors — combining technical strength, macro intelligence, and AI to build better positions.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div data-reveal className="relative bg-white/[0.03] border border-white/10 rounded-2xl p-8 hover:border-violet-500/40 transition-all duration-300 group">
              <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
              <span className="text-[9px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded-full border mb-6 inline-block text-sky-400 bg-sky-500/10 border-sky-500/20">AI Vision</span>
              <h3 className="text-2xl font-black mb-3">Chart Analyser</h3>
              <p className="text-slate-400 text-sm leading-6 mb-5">
                Paste any daily or weekly chart. AI reads technical structure, relative strength, sector position, sentiment, and builds a medium to long-term story with bull and bear scenarios.
              </p>
              <ul className="space-y-2 mb-6">
                {['Technical & Pattern Analysis', 'Relative Strength vs Nifty', 'Sector View', 'Bullish / Bearish Story'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-1 h-1 rounded-full bg-sky-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/investing/chart-analyser" className="inline-flex items-center gap-1 text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors">
                Try Chart Analyser →
              </Link>
            </div>

            <div data-reveal className="relative bg-white/[0.03] border border-white/10 rounded-2xl p-8 hover:border-violet-500/40 transition-all duration-300">
              <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
              <span className="text-[9px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded-full border mb-6 inline-block text-violet-400 bg-violet-500/10 border-violet-500/20">AI Macro</span>
              <h3 className="text-2xl font-black mb-3">Connect the Dots</h3>
              <p className="text-slate-400 text-sm leading-6 mb-5">
                Multi-horizon strategic outlook synthesising macro, geopolitics, AI disruption, demographics, and energy across 3M to 10Y horizons. Dalio · Marks · Soros · Burry frameworks.
              </p>
              <ul className="space-y-2 mb-6">
                {['Bull / Bear / Base cases', '3M → 10Y time horizon matrix', 'Contrarian stress test', 'Key signposts dashboard'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-1 h-1 rounded-full bg-violet-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/investing/strategic-view" className="inline-flex items-center gap-1 text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors">
                Explore Strategic View →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-violet-400 block mb-3">From Traders</span>
            <h2 className="text-4xl font-black">What traders are saying.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            <Testimonial
              quote="The Order Intelligence feature changed how I approach every trade. I used to jump in on gut — now I have a structured checklist before I place anything. My win rate improved noticeably in the first month."
              name="Rahul M."
              role="Options trader, 4 years · Pune"
            />
            <Testimonial
              quote="Strategic View is like having a top-tier macro analyst on call. I used to spend hours reading newsletters — now I get a Dalio-style multi-horizon breakdown for any asset in seconds."
              name="Priya S."
              role="Swing trader & long-term investor · Bengaluru"
            />
            <Testimonial
              quote="The Trading Games section alone is worth it. I thought I understood risk management, but the scenario quizzes exposed how often I'd have taken the wrong decision under pressure. Humbling and educational."
              name="Vikram T."
              role="Retail trader, 2 years · Mumbai"
            />
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 bg-white/[0.02] border-y border-white/8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-violet-400 block mb-3">Pricing</span>
            <h2 className="text-4xl font-black mb-4">Start free. Upgrade when ready.</h2>
            <p className="text-slate-400 text-base">No credit card required. Free tier is genuinely useful — not a teaser.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Free */}
            <div data-reveal className="bg-white/[0.03] border border-white/10 rounded-2xl p-8">
              <p className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2">Free</p>
              <p className="text-4xl font-black mb-1">₹0</p>
              <p className="text-slate-500 text-sm mb-7">Forever free · No card needed</p>
              <ul className="space-y-3 mb-8">
                {[
                  ['Live market data & indices', true],
                  ['Option chain viewer', true],
                  ['Trading games & psychology tools', true],
                  ['Book summaries & learning library', true],
                  ['Chart analyser', true, '3/day'],
                  ['Order intelligence (AI pre-trade)', true, '3/day'],
                  ['Order placement (broker integrated)', false],
                  ['Unlimited AI analysis', false],
                  ['Pre-market movers', false],
                  ['Behavioural agent', false],
                ].map(([label, inc, note]) => (
                  <li key={label} className="flex items-center gap-3 text-sm">
                    <Check dim={!inc} />
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
            <div data-reveal className="relative bg-violet-600/10 border border-violet-500/30 rounded-2xl p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold tracking-widest uppercase text-violet-400">Pro</p>
                  <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300">Early Access</span>
                </div>
                <p className="text-4xl font-black mb-1">₹499<span className="text-lg font-semibold text-slate-400">/mo</span></p>
                <p className="text-slate-400 text-sm mb-7">Everything you need to trade professionally</p>
                <ul className="space-y-3 mb-8">
                  {[
                    ['Everything in Free', true],
                    ['Order placement (broker integrated)', true],
                    ['Unlimited chart analysis', true],
                    ['Unlimited order intelligence', true],
                    ['Pre-market movers & sector data', true],
                    ['Behavioural agent (real-time)', true],
                    ['Portfolio positions & P&L tracking', true],
                    ['Priority support', true],
                  ].map(([label, inc]) => (
                    <li key={label} className="flex items-center gap-3 text-sm">
                      <Check dim={!inc} />
                      <span className={inc ? 'text-slate-200' : 'text-slate-600'}>{label}</span>
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

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="py-28 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-violet-600/8 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-black mb-5 leading-tight">
            Ready to trade<br />with intelligence?
          </h2>
          <p className="text-slate-400 text-base leading-7 mb-10">
            Join thousands of Indian traders building better habits, making smarter decisions, and staying ahead with TradingVerse.
          </p>

          <form onSubmit={handleWaitlist} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-6">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={status === 'done' || status === 'exists'}
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 text-sm outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status === 'loading' || status === 'done' || status === 'exists'}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors whitespace-nowrap"
            >
              {status === 'loading' ? 'Joining…' : status === 'done' ? 'You\'re in ✓' : status === 'exists' ? 'Already joined ✓' : 'Join Waitlist'}
            </button>
          </form>
          {status === 'error' && <p className="text-rose-400 text-xs mb-4">Something went wrong. Please try again.</p>}

          <p className="text-xs text-slate-600">Or <Link href="/login" className="text-violet-400 hover:text-violet-300 transition-colors">create a free account now →</Link></p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
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
            TradingVerse is an informational and educational platform. Nothing on this site constitutes financial advice or a recommendation to buy or sell any securities.
            All trading and investment decisions are solely your own responsibility.{' '}
            <Link href="/disclaimer" className="underline hover:text-slate-500 transition-colors">Read full disclaimer →</Link>
          </p>
        </div>
      </footer>

    </div>
  )
}
