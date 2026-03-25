'use client'

import Link from 'next/link'
import { useState } from 'react'

const FEATURES = [
  { icon: '📊', title: 'Live Trading Terminal', desc: 'Real-time option chain, indices, regime detection, and AI scenario synthesis' },
  { icon: '🧠', title: 'Order Intelligence', desc: '4 agents analyse every trade before you place it — structure, OI, risk, momentum' },
  { icon: '📅', title: 'Pre-Market Intelligence', desc: 'Daily AI plan, economic calendar, key levels, and global market context' },
  { icon: '📈', title: 'Investing Tools', desc: 'Earnings calendar with EPS data, 52-week highs/lows, and sector analysis' },
  { icon: '🎮', title: 'Trading Games', desc: 'Test your psychology and decision-making without risking real capital' },
  { icon: '📚', title: 'Book Summaries', desc: 'Condensed insights from the best trading and investing books' },
]

export default function UpgradePage() {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState(null) // 'loading' | 'done' | 'error'

  async function requestAccess(e) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      setStatus(res.ok ? 'done' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-[#060b14] flex flex-col items-center justify-center px-6 py-16">

      {/* Logo */}
      <Link href="/" className="text-xl font-black tracking-tight text-white mb-16">
        Trading<span className="text-blue-400">Verse</span>
      </Link>

      <div className="w-full max-w-2xl">
        {/* Headline */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-amber-400 text-xs font-bold tracking-wide mb-6">
            EARLY ACCESS
          </div>
          <h1 className="text-4xl font-black text-white mb-4 leading-tight">
            You're on the waitlist.
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed max-w-md mx-auto">
            TradingVerse is currently invite-only while we're in early access. Reach out and we'll get you in.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex gap-3">
              <span className="text-xl flex-shrink-0">{f.icon}</span>
              <div>
                <p className="text-white text-sm font-semibold mb-0.5">{f.title}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 text-center">
          <p className="text-white font-semibold mb-2">Request access</p>
          <p className="text-slate-500 text-sm mb-6">
            Enter your email and we'll review your request within 24 hours.
          </p>
          {status === 'done' ? (
            <p className="text-emerald-400 font-semibold text-sm">Request sent! We'll be in touch soon.</p>
          ) : (
            <form onSubmit={requestAccess} className="flex gap-2 max-w-sm mx-auto">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-blue-500/50"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl text-sm transition-all whitespace-nowrap"
              >
                {status === 'loading' ? '…' : 'Request'}
              </button>
            </form>
          )}
          {status === 'error' && (
            <p className="text-rose-400 text-xs mt-3">Something went wrong. Please try again.</p>
          )}
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-6 mt-8 text-sm text-slate-600">
          <Link href="/" className="hover:text-slate-400 transition-colors">Home</Link>
          <Link href="/login" className="hover:text-slate-400 transition-colors">Sign in with different account</Link>
        </div>
      </div>
    </div>
  )
}
