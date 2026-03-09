'use client'

import Link from 'next/link'
import Nav from '../components/Nav'

const GAMES = [
  {
    emoji: '🧠',
    title: 'Scenario Challenge',
    desc: 'Read the market context — global cues, VIX, key levels — and make the right trading decision. Tests judgment, not just pattern recognition.',
    tag: 'Decision Making',
    tagColor: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50',
    difficulty: 'Intermediate',
    available: true,
    href: '/games/scenario',
  },
  {
    emoji: '📈',
    title: 'Market Direction',
    desc: 'Given the last 5 candles on Nifty, what happens next? Builds your ability to read price structure and momentum shifts.',
    tag: 'Price Action',
    tagColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50',
    difficulty: 'Beginner',
    available: true,
    href: '/games/market-direction',
  },
  {
    emoji: '⚖️',
    title: 'Risk Management',
    desc: 'You have a position going against you. What do you do? Tests your ability to cut losses, trail stops, and protect capital under pressure.',
    tag: 'Risk & Psychology',
    tagColor: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50',
    difficulty: 'Advanced',
    available: true,
    href: '/games/risk-management',
  },
  {
    emoji: '🔍',
    title: 'Pattern Recognition',
    desc: 'Identify the chart pattern before it plays out. From simple support breaks to complex liquidity sweeps and order blocks.',
    tag: 'Technical Analysis',
    tagColor: 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900/50',
    difficulty: 'Intermediate',
    available: true,
    href: '/games/pattern-recognition',
  },
  {
    emoji: '📰',
    title: 'News & Reaction',
    desc: 'A macro event just hit the wire. How will Nifty react in the next 15 minutes? Tests your understanding of event-driven trading.',
    tag: 'Macro',
    tagColor: 'text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-900/50',
    difficulty: 'Advanced',
    available: true,
    href: '/games/news-reaction',
  },
  {
    emoji: '📅',
    title: 'Real Chart Challenge',
    desc: 'Real Nifty charts from historic moments — COVID crash, election day, budget surprises. What would you have done? Then see what actually happened.',
    tag: 'Market History',
    tagColor: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50',
    difficulty: 'Advanced',
    available: true,
    href: '/games/real-charts',
  },
  {
    emoji: '📐',
    title: 'Pyramid or Average?',
    desc: 'Do you add to winning trades or losing ones? This game targets the #1 account-killer habit — averaging down on losers — and trains you to pyramid into strength instead.',
    tag: 'Trade Management',
    tagColor: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900/50',
    difficulty: 'Advanced',
    available: true,
    href: '/games/position-sizing',
  },
  {
    emoji: '🧘',
    title: 'Hold or Fold?',
    desc: 'Most traders sell winners too early and hold losers too long. The Disposition Effect quietly drains accounts. Do you have it? Find out — and fix it.',
    tag: 'Trading Psychology',
    tagColor: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50',
    difficulty: 'Advanced',
    available: true,
    href: '/games/exit-psychology',
  },
  {
    emoji: '🎯',
    title: 'Entry Precision',
    desc: 'The setup is there. But where exactly do you enter? Tests your ability to time entries at optimal risk:reward without chasing.',
    tag: 'Execution',
    tagColor: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50',
    difficulty: 'Advanced',
    available: false,
    href: null,
  },
]

const DIFF_COLOR = {
  'Beginner':     'text-emerald-600 dark:text-emerald-400',
  'Intermediate': 'text-amber-600 dark:text-amber-400',
  'Advanced':     'text-rose-600 dark:text-rose-400',
}

export default function GamesPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">

      <Nav />

      <div className="max-w-5xl mx-auto px-6 py-20">

        {/* Header */}
        <p className="text-emerald-600 dark:text-emerald-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Trading Games</p>
        <h1 className="text-5xl md:text-6xl font-black mb-4 leading-tight">
          Sharpen your instincts.<br/>
          <span className="text-slate-500">Without risking a rupee.</span>
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-lg max-w-xl mb-16 leading-relaxed">
          Real market scenarios. Real decisions. Train your trading mind daily — each game targets a different skill gap that separates winning traders from losing ones.
        </p>

        {/* Games grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {GAMES.map(g => {
            const inner = (
              <>
                {!g.available && (
                  <span className="absolute top-5 right-5 text-[9px] font-bold tracking-widest uppercase text-slate-400 dark:text-slate-600 border border-slate-300 dark:border-slate-800 px-2 py-0.5 rounded-full">
                    Soon
                  </span>
                )}
                <div className="text-4xl mb-5">{g.emoji}</div>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border ${g.tagColor}`}>
                    {g.tag}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{g.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed flex-1">{g.desc}</p>
                <div className="mt-6 flex items-center justify-between">
                  <span className={`text-xs font-semibold ${DIFF_COLOR[g.difficulty]}`}>{g.difficulty}</span>
                  {g.available
                    ? <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Play now →</span>
                    : <span className="text-xs text-slate-400 dark:text-slate-700">Coming soon</span>
                  }
                </div>
              </>
            )

            return g.available ? (
              <Link key={g.title} href={g.href}
                className="relative flex flex-col p-7 rounded-2xl border transition-all duration-200 border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:-translate-y-1">
                {inner}
              </Link>
            ) : (
              <div key={g.title}
                className="relative flex flex-col p-7 rounded-2xl border transition-all duration-200 border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01] opacity-60">
                {inner}
              </div>
            )
          })}
        </div>

        {/* Bottom nudge */}
        <div className="mt-20 text-center">
          <p className="text-slate-500 text-sm mb-2">Want to track your accuracy over time?</p>
          <Link href="/login" className="text-blue-600 dark:text-blue-400 text-sm font-semibold hover:underline">
            Login to save your progress →
          </Link>
        </div>
      </div>
    </div>
  )
}
