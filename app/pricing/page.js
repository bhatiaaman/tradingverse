'use client'

import { useState } from 'react'
import Nav from '@/app/components/Nav'
import Link from 'next/link'

const FREE_FEATURES = [
  { label: 'Live market data & indices', included: true },
  { label: 'Option chain viewer', included: true },
  { label: 'Trading games & psychology tools', included: true },
  { label: 'Book summaries & learning', included: true },
  { label: 'Chart analyser', note: '3 per day', included: true },
  { label: 'Order intelligence (AI pre-trade analysis)', note: '3 per day', included: true },
  { label: 'Order placement (broker integrated)', included: false },
  { label: 'Unlimited chart analysis', included: false },
  { label: 'Unlimited order intelligence', included: false },
  { label: 'Pre-market movers & sector performance', included: false },
  { label: 'Behavioral agent (real-time bias detection)', included: false },
  { label: 'Portfolio positions & P&L tracking', included: false },
]

const PRO_FEATURES = [
  { label: 'Everything in Free', included: true },
  { label: 'Order placement (Zerodha Kite integrated)', included: true },
  { label: 'Unlimited chart analysis', included: true },
  { label: 'Unlimited order intelligence', included: true },
  { label: 'Pre-market movers & sector performance', included: true },
  { label: 'Behavioral agent (real-time bias detection)', included: true },
  { label: 'Portfolio positions & P&L tracking', included: true },
  { label: 'Priority support', included: true },
]

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg className="w-4 h-4 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export default function PricingPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null) // null | 'loading' | 'done' | 'exists' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  async function joinWaitlist(e) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error || 'Something went wrong')
      } else if (data.alreadyJoined) {
        setStatus('exists')
      } else {
        setStatus('done')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Network error. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />
      <div className="max-w-4xl mx-auto px-6 pt-24 pb-24">

        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-blue-600 dark:text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Pricing</p>
          <h1 className="text-4xl sm:text-5xl font-black mb-4 leading-tight">
            Simple, transparent<br className="hidden sm:block" /> pricing
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg max-w-xl mx-auto">
            Start free. Upgrade when you're ready to trade with full broker integration and unlimited AI tools.
          </p>
        </div>

        {/* Plans */}
        <div className="grid sm:grid-cols-2 gap-6 mb-16">

          {/* Free */}
          <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-8">
            <p className="text-xs font-bold tracking-widest uppercase text-slate-500 dark:text-slate-400 mb-3">Free</p>
            <div className="flex items-end gap-1 mb-1">
              <span className="text-4xl font-black">₹0</span>
            </div>
            <p className="text-slate-500 text-sm mb-8">Forever free, no card needed</p>

            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-3">
                  {f.included ? <CheckIcon /> : <CrossIcon />}
                  <span className={`text-sm ${f.included ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600 line-through'}`}>
                    {f.label}
                    {f.note && <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500 no-underline not-italic">({f.note})</span>}
                  </span>
                </li>
              ))}
            </ul>

            <Link href="/login" className="block w-full text-center py-3 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors">
              Get started free
            </Link>
          </div>

          {/* Pro */}
          <div className="relative bg-gradient-to-b from-blue-600/10 to-violet-600/5 border border-blue-500/30 rounded-2xl p-8">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">Coming Soon</span>
            </div>

            <p className="text-xs font-bold tracking-widest uppercase text-blue-400 mb-3">Pro</p>
            <div className="flex items-end gap-1 mb-1">
              <span className="text-4xl font-black">₹999</span>
              <span className="text-slate-500 text-sm mb-1">/month</span>
            </div>
            <p className="text-slate-500 text-sm mb-8">Join the waitlist — early access pricing locked in</p>

            <ul className="space-y-3 mb-8">
              {PRO_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-3">
                  <CheckIcon />
                  <span className="text-sm text-slate-700 dark:text-slate-200">{f.label}</span>
                </li>
              ))}
            </ul>

            {/* Waitlist form */}
            {status === 'done' ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-semibold">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                You're on the list! We'll email you when Pro launches.
              </div>
            ) : status === 'exists' ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-semibold">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01" /></svg>
                You're already on the waitlist.
              </div>
            ) : (
              <form onSubmit={joinWaitlist} className="flex flex-col gap-3">
                {status === 'error' && (
                  <p className="text-rose-400 text-xs">{errorMsg}</p>
                )}
                <input
                  type="email"
                  required
                  placeholder="Enter your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-all"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-all"
                >
                  {status === 'loading' ? 'Joining…' : 'Join Waitlist →'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-xl mx-auto">
          <h2 className="text-xl font-black mb-6 text-center">Frequently asked questions</h2>
          <div className="space-y-4">
            {[
              {
                q: 'Is the free plan really free forever?',
                a: 'Yes. The free plan has no expiry. You can use market data, option chain, trading games, book summaries, and limited AI tools without paying anything.',
              },
              {
                q: 'What is the Pro plan waitlist?',
                a: 'Pro is currently in development. Joining the waitlist locks in early-access pricing (₹999/month) and gets you notified the moment it launches.',
              },
              {
                q: 'Which brokers are supported?',
                a: 'Zerodha Kite is currently supported for live order placement. Upstox and Angel One are coming soon.',
              },
              {
                q: 'Can I use TradingVerse without a broker account?',
                a: 'Absolutely. Market data, chart analysis, order intelligence, and all learning tools work without connecting a broker.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6">
                <p className="font-bold text-sm mb-2">{q}</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
