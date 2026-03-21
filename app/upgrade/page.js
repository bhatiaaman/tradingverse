'use client'

import Link from 'next/link'

const FEATURES = [
  { icon: '📊', title: 'Live Trading Terminal', desc: 'Real-time option chain, indices, regime detection, and AI scenario synthesis' },
  { icon: '🧠', title: 'Order Intelligence', desc: '4 agents analyse every trade before you place it — structure, OI, risk, momentum' },
  { icon: '📅', title: 'Pre-Market Intelligence', desc: 'Daily AI plan, economic calendar, key levels, and global market context' },
  { icon: '📈', title: 'Investing Tools', desc: 'Earnings calendar with EPS data, 52-week highs/lows, and sector analysis' },
  { icon: '🎮', title: 'Trading Games', desc: 'Test your psychology and decision-making without risking real capital' },
  { icon: '📚', title: 'Book Summaries', desc: 'Condensed insights from the best trading and investing books' },
]

export default function UpgradePage() {
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
            Send a message and we'll review your request within 24 hours.
          </p>
          <a
            href="mailto:bhatiaaman.p@gmail.com?subject=TradingVerse Access Request"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email to request access
          </a>
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
