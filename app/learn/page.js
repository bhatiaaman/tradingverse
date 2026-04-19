'use client'

import { useState } from 'react'
import Link from 'next/link'
import Nav from '../components/Nav'

const BOOKS = [
  {
    slug: 'trading-in-the-zone',
    emoji: '🧠',
    title: 'Trading in the Zone',
    author: 'Mark Douglas',
    category: 'Psychology',
    categoryColor: 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900/50',
    difficulty: 'Essential',
    diffColor: 'text-emerald-600 dark:text-emerald-400',
    summary: 'The definitive book on trading psychology. Douglas argues that consistent profitability is entirely a function of mindset — not strategy.',
    lessons: ['Think in probabilities', 'Eliminate fear-based decisions', 'Accept the risk before entering'],
  },
  {
    slug: 'market-wizards',
    emoji: '⚡',
    title: 'Market Wizards',
    author: 'Jack D. Schwager',
    category: 'Strategy',
    categoryColor: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50',
    difficulty: 'Intermediate',
    diffColor: 'text-amber-600 dark:text-amber-400',
    summary: 'Interviews with the world\'s greatest traders. Each one found a completely different edge — but shared identical discipline in execution.',
    lessons: ['Every great trader has a unique edge', 'Cutting losses is non-negotiable', 'Never risk more than you can afford to lose mentally'],
  },
  {
    slug: 'daily-trading-coach',
    emoji: '🎯',
    title: 'The Daily Trading Coach',
    author: 'Brett Steenbarger',
    category: 'Psychology',
    categoryColor: 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900/50',
    difficulty: 'Intermediate',
    diffColor: 'text-amber-600 dark:text-amber-400',
    summary: '101 lessons for becoming your own trading psychologist. Steenbarger shows that self-improvement is the highest-leverage activity in trading.',
    lessons: ['Track your emotional state as closely as your P&L', 'Identify patterns in your mistakes', 'Build on strengths, not just fix weaknesses'],
  },
  {
    slug: 'reminiscences-stock-operator',
    emoji: '📜',
    title: 'Reminiscences of a Stock Operator',
    author: 'Edwin Lefèvre',
    category: 'Classic',
    categoryColor: 'text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-900/50',
    difficulty: 'Essential',
    diffColor: 'text-emerald-600 dark:text-emerald-400',
    summary: 'The thinly-veiled biography of Jesse Livermore, arguably the greatest trader who ever lived. 100 years old, still the most relevant trading book.',
    lessons: ['Human nature never changes — neither does the market', 'The big money is in the big swing', 'Never average down on a losing trade'],
  },
  {
    slug: 'technical-analysis-financial-markets',
    emoji: '📊',
    title: 'Technical Analysis of the Financial Markets',
    author: 'John J. Murphy',
    category: 'Technical',
    categoryColor: 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900/50',
    difficulty: 'Intermediate',
    diffColor: 'text-amber-600 dark:text-amber-400',
    summary: 'The most comprehensive reference on technical analysis ever written. Charts, indicators, and market interrelationships from the man who wrote the standard.',
    lessons: ['Price discounts everything — read the chart before reading the news', 'Trends persist longer than anyone expects', 'Volume confirms or questions every price move'],
  },
  {
    slug: 'thinking-fast-and-slow',
    emoji: '🔬',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    category: 'Psychology',
    categoryColor: 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900/50',
    difficulty: 'Advanced',
    diffColor: 'text-rose-600 dark:text-rose-400',
    summary: 'Nobel laureate Kahneman\'s masterwork on how humans actually make decisions — and why we systematically get them wrong. Every bias in this book costs traders money daily.',
    lessons: ['System 1 (fast, emotional) dominates trading decisions by default', 'Loss aversion causes twice as much pain as equivalent gains cause pleasure', 'Overconfidence is the most dangerous bias in markets'],
  },
  {
    slug: 'how-to-make-money-in-stocks',
    emoji: '📈',
    title: 'How to Make Money in Stocks',
    author: 'William J. O\'Neil',
    category: 'Strategy',
    categoryColor: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50',
    difficulty: 'Intermediate',
    diffColor: 'text-amber-600 dark:text-amber-400',
    summary: 'The CANSLIM system for identifying leading stocks before their biggest moves. O\'Neil studied every major market winner of the past century and found the same patterns repeating.',
    lessons: ['Buy fundamentally strong stocks breaking out of sound bases', 'Cut losses at 7–8% — no exceptions, no averaging down', 'The market is always right; your opinion is irrelevant'],
  },
  {
    slug: 'one-good-trade',
    emoji: '⚡',
    title: 'One Good Trade',
    author: 'Mike Bellafiore',
    category: 'Execution',
    categoryColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50',
    difficulty: 'Intermediate',
    diffColor: 'text-amber-600 dark:text-amber-400',
    summary: 'Inside the elite prop trading firm SMB Capital. Bellafiore reveals exactly how professional day traders develop — what separates those who make it from those who wash out.',
    lessons: ['Trade only the highest-probability setups — be selective, not busy', 'Your trading problems are your personal problems in disguise', 'Process matters more than any single result'],
  },
  {
    slug: 'psychology-of-money',
    emoji: '💡',
    title: 'The Psychology of Money',
    author: 'Morgan Housel',
    category: 'Mindset',
    categoryColor: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50',
    difficulty: 'Essential',
    diffColor: 'text-emerald-600 dark:text-emerald-400',
    summary: 'The most widely-read finance book of the decade. Housel argues that financial success has less to do with intelligence and everything to do with behaviour and time.',
    lessons: ['Getting wealthy and staying wealthy require completely different skills', 'Compounding only works if you don\'t interrupt it', 'Save for a future you can\'t predict — build in a margin of safety'],
  },
]

const ARTICLES = [
  { tag: 'Market Psychology', title: 'The trader who knew everything but lost anyway', readTime: '6 min', slug: 'trader-who-knew-everything', color: 'text-cyan-600 dark:text-cyan-400' },
  { tag: 'Price Action', title: 'Why most breakout trades fail', readTime: '8 min', slug: 'why-breakouts-fail', color: 'text-blue-600 dark:text-blue-400' },
  { tag: 'Risk Management', title: 'The revenge trade trap — and how to escape it', readTime: '5 min', slug: 'revenge-trade-trap', color: 'text-rose-600 dark:text-rose-400' },
  { tag: 'Trade Review', title: 'Post-trade review: the habit that separates pros', readTime: '7 min', slug: 'post-trade-review', color: 'text-emerald-600 dark:text-emerald-400' },
]

const TABS = ['Books', 'Articles', 'Views']

export default function LearnPage() {
  const [tab, setTab] = useState('Books')

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">

      <Nav />

      <div className="max-w-5xl mx-auto px-6 py-20">

        {/* Header */}
        <p className="text-violet-600 dark:text-violet-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Learn from Masters</p>
        <h1 className="text-5xl md:text-6xl font-black mb-4 leading-tight">
          Everything the best traders<br/>
          <span className="text-slate-500">learned the hard way.</span>
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-lg max-w-xl mb-12 leading-relaxed">
          Books, articles, and market views — curated for Indian traders who want to think, not just react.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/[0.03] rounded-xl border border-slate-200 dark:border-white/5 w-fit mb-12">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200
                ${tab === t ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {t}
              {t === 'Views' && <span className="ml-2 text-[9px] font-bold tracking-wider uppercase bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/60">Soon</span>}
            </button>
          ))}
        </div>

        {/* Books tab */}
        {tab === 'Books' && (
          <div>
            <div className="grid md:grid-cols-2 gap-5">
              {BOOKS.map(b => (
                <Link key={b.slug} href={`/learn/books/${b.slug}`}
                  className="group flex flex-col p-7 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:-translate-y-0.5 transition-all duration-200">

                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-4">
                      <span className="text-4xl">{b.emoji}</span>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight group-hover:text-blue-700 dark:group-hover:text-blue-100 transition-colors">{b.title}</h3>
                        <p className="text-slate-500 text-sm mt-0.5">{b.author}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold ${b.diffColor} shrink-0`}>{b.difficulty}</span>
                  </div>

                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-5 flex-1">{b.summary}</p>

                  <div className="flex flex-wrap gap-2 mb-5">
                    {b.lessons.map(l => (
                      <span key={l} className="text-[10px] text-slate-500 border border-slate-200 dark:border-white/10 px-2.5 py-1 rounded-full">
                        {l}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-white/5">
                    <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border ${b.categoryColor}`}>{b.category}</span>
                    <span className="text-xs text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors font-semibold">Read summary →</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Articles tab */}
        {tab === 'Articles' && (
          <div className="grid md:grid-cols-2 gap-5">
            {ARTICLES.map(a => (
              <Link key={a.slug} href={`/learn/articles/${a.slug}`}
                className="group flex flex-col p-7 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:-translate-y-0.5 transition-all duration-200">
                <span className={`text-[10px] font-bold tracking-widest uppercase ${a.color} mb-3 block`}>{a.tag}</span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3 leading-tight group-hover:text-blue-700 dark:group-hover:text-blue-100 transition-colors">{a.title}</h3>
                <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100 dark:border-white/5">
                  <span className="text-xs text-slate-500 dark:text-slate-600">{a.readTime} read</span>
                  <span className="text-xs text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors font-semibold">Read article →</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Views tab */}
        {tab === 'Views' && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-6">👁️</div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Market Views — Coming Soon</h3>
            <p className="text-slate-500 max-w-md leading-relaxed">
              Weekly market perspectives from experienced traders. Macro views, sector analysis, and trade ideas — not tips, but thinking.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
