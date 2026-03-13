import Nav from '../components/Nav'
import Link from 'next/link'
import MarketPhaseSection from './MarketPhaseSection'

const TOOLS = [
  {
    href: '/investing/strategic-view',
    tag: 'AI Macro',
    tagColor: 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800/50',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Connect the Dots',
    subtitle: 'Strategic View',
    description: 'Multi-horizon strategic outlook synthesising macro, geopolitics, AI disruption, demographics, and energy across 3M to 10Y horizons.',
    features: ['Dalio · Marks · Soros · Burry', 'Bull / Bear / Base cases', '3M → 10Y time horizon matrix', 'Contrarian stress test'],
    available: true,
  },
  {
    href: '/investing/chart-analyser',
    tag: 'AI Vision',
    tagColor: 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30 border-sky-200 dark:border-sky-800/50',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Chart Analyser',
    description: 'Paste any daily or weekly chart. AI reads technical structure, relative strength, sector position, sentiment, and builds a medium to long-term story.',
    features: ['Technical & Pattern Analysis', 'Relative Strength vs Nifty', 'Sector View', 'Bullish / Bearish Story'],
    available: true,
  },
  {
    href: '/investing/deals',
    tag: 'NSE Data',
    tagColor: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/50',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    title: 'Bulk & Block Deals',
    description: 'See every institutional trade reported to NSE today — bulk deals above 0.5% of shares and block deals executed off-market.',
    features: ['Buy / Sell side badges', 'Deal value in ₹Cr', 'Filter by bulk or block', 'Search by symbol or client'],
    available: true,
  },
  {
    tag: 'Coming Soon',
    tagColor: 'text-slate-500 bg-slate-100 dark:bg-slate-800/40 border-slate-300 dark:border-slate-700/50',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    title: 'Stock Screener',
    description: 'Filter stocks by stage, relative strength, sector leadership, and momentum. Build your watchlist with context.',
    features: ['Stage 2 Breakouts', 'RS Leaders', 'Sector Rotation', 'Watchlist Builder'],
    available: false,
  },
  {
    tag: 'Coming Soon',
    tagColor: 'text-slate-500 bg-slate-100 dark:bg-slate-800/40 border-slate-300 dark:border-slate-700/50',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Portfolio X-Ray',
    description: 'Upload your holdings. Get sector concentration, RS scores, risk profile, and rebalancing suggestions.',
    features: ['Sector Concentration', 'RS Score per Stock', 'Risk Profile', 'Rebalance Nudges'],
    available: false,
  },
]

export default function InvestingPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 pt-20 pb-14">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-violet-600 dark:text-violet-400">Investing Suite</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white leading-tight mb-4">
          Invest with context.<br />
          <span className="text-slate-500">Not just conviction.</span>
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-base leading-7 max-w-xl">
          Tools for medium to long-term investors — combining technical strength, relative performance, sector dynamics, and AI to build better positions.
        </p>
      </div>

      {/* Market Phase — swing context for NIFTY / BANKNIFTY */}
      <div className="max-w-5xl mx-auto px-6 pb-4">
        <MarketPhaseSection />
      </div>

      {/* Tools grid */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-5">
          {TOOLS.map(tool => (
            <div key={tool.title}
              className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-200
                ${tool.available
                  ? 'bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/40 hover:bg-slate-50 dark:hover:bg-white/[0.05] group cursor-pointer'
                  : 'bg-slate-50 dark:bg-white/[0.015] border-slate-100 dark:border-white/5 opacity-60'
                }`}>

              {/* Tag */}
              <span className={`self-start text-[9px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded-full border mb-5 ${tool.tagColor}`}>
                {tool.tag}
              </span>

              {/* Icon */}
              <div className={`mb-4 ${tool.available ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400 dark:text-slate-600'}`}>
                {tool.icon}
              </div>

              {/* Title & description */}
              <div className="mb-2">
                <h3 className="text-slate-900 dark:text-white font-bold text-lg leading-tight">{tool.title}</h3>
                {tool.subtitle && <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-0.5">{tool.subtitle}</p>}
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-6 mb-5 flex-1">{tool.description}</p>

              {/* Features */}
              <ul className="space-y-1.5 mb-6">
                {tool.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className={`w-1 h-1 rounded-full flex-shrink-0 ${tool.available ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {tool.available ? (
                <Link href={tool.href}
                  className="block text-center text-sm font-semibold text-violet-600 dark:text-violet-400 border border-violet-300 dark:border-violet-500/30 rounded-xl py-3
                    hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:border-violet-400 dark:hover:border-violet-500/60 transition-all">
                  Open Tool →
                </Link>
              ) : (
                <div className="text-center text-sm font-semibold text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-white/5 rounded-xl py-3">
                  Coming Soon
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
