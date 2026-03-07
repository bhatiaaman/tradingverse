'use client'

import { createContext, useContext, useState } from 'react'
import Link from 'next/link'

// ── Theme tokens ────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    page:          'bg-[#060b14] text-white',
    sidebar:       'bg-[#080d1a] border-white/5',
    sidebarBorder: 'border-white/5',
    ticker:        'bg-white/[0.02] border-white/5',
    tickerSym:     'text-slate-500',
    tickerVal:     'text-slate-200 font-semibold',
    navActive:     'bg-blue-600/20 text-blue-300 font-semibold',
    navInactive:   'text-slate-500 hover:text-slate-200 hover:bg-white/5',
    navDot:        'bg-blue-400',
    mktStatus:     'bg-emerald-950/40 border-emerald-900/50',
    mktText:       'text-emerald-400',
    mktSub:        'text-slate-500',
    hdrDate:       'text-slate-500',
    hdrTitle:      'text-white',
    ctaBtn:        'bg-blue-600 hover:bg-blue-500 text-white hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]',
    statUp:        'border-emerald-900/40 bg-emerald-950/20 hover:border-emerald-700/60',
    statDown:      'border-rose-900/40 bg-rose-950/20 hover:border-rose-700/60',
    statLabel:     'text-slate-500',
    statVal:       'text-slate-100',
    gameCard:      'border-white/5 bg-gradient-to-br from-[#0e1629] to-[#080d1a] hover:border-white/10',
    gameChartBg:   'bg-slate-900/40',
    gameChartDash: 'border-slate-700',
    gameChartQ:    'text-slate-600',
    gameBtnOff:    'border-slate-700 text-slate-400',
    gameBtnBull:   'hover:border-emerald-700 hover:text-emerald-400 hover:bg-emerald-950/30',
    gameBtnBear:   'hover:border-rose-700 hover:text-rose-400 hover:bg-rose-950/30',
    gameDiv:       'border-white/5',
    gameLbl:       'text-slate-600',
    intelTitle:    'text-slate-200 group-hover:text-white',
    intelDesc:     'text-slate-500',
    intelConceptBorder: 'border-blue-900/40', intelConceptBg: 'bg-blue-950/10',
    intelConceptBar:    'bg-slate-700',
    intelArticleBorder: 'border-cyan-900/40',  intelArticleBg: 'bg-cyan-950/10',
    intelArticleTag:    'bg-cyan-900/30 text-cyan-400 border border-cyan-900/50',
    intelArticleMeta:   'text-slate-600',
    artCard:       'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10',
    artTitle:      'text-slate-400 group-hover:text-slate-200',
    artCta:        'text-slate-700 group-hover:text-slate-500',
    preMarket:     'border-amber-900/40 bg-amber-950/20 hover:border-amber-700/60 hover:bg-amber-950/30',
    preMarketTxt:  'text-amber-300 group-hover:text-amber-200',
    preMarketSub:  'text-slate-600',
    toggle:        'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700',
    logo:          'text-blue-400',
    accentBlue:    'text-blue-400',
    accentCyan:    'text-cyan-400',
    accentGreen:   'text-emerald-400',
    accentAmber:   'text-amber-400',
    accentViolet:  'text-violet-400',
  },
  light: {
    page:          'bg-[#eef2ff] text-slate-800',
    sidebar:       'bg-white border-slate-200 shadow-sm',
    sidebarBorder: 'border-slate-100',
    ticker:        'bg-white border-slate-200',
    tickerSym:     'text-slate-400',
    tickerVal:     'text-slate-700 font-semibold',
    navActive:     'bg-indigo-50 text-indigo-700 font-semibold border-l-[3px] border-indigo-500 rounded-l-none',
    navInactive:   'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
    navDot:        'bg-indigo-500',
    mktStatus:     'bg-emerald-50 border-emerald-200',
    mktText:       'text-emerald-600',
    mktSub:        'text-slate-400',
    hdrDate:       'text-slate-400',
    hdrTitle:      'text-slate-800',
    ctaBtn:        'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-[0_4px_14px_rgba(79,70,229,0.4)]',
    statUp:        'border-emerald-200 bg-white hover:border-emerald-300 shadow-sm',
    statDown:      'border-red-200 bg-white hover:border-red-300 shadow-sm',
    statLabel:     'text-slate-400',
    statVal:       'text-slate-800',
    gameCard:      'border-slate-200 bg-white hover:border-slate-300 shadow-sm hover:shadow-md',
    gameChartBg:   'bg-slate-50 border border-slate-100',
    gameChartDash: 'border-slate-300',
    gameChartQ:    'text-slate-300',
    gameBtnOff:    'border-slate-200 text-slate-500 bg-white',
    gameBtnBull:   'hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50',
    gameBtnBear:   'hover:border-red-400 hover:text-red-700 hover:bg-red-50',
    gameDiv:       'border-slate-100',
    gameLbl:       'text-slate-400',
    intelTitle:    'text-slate-700 group-hover:text-slate-900',
    intelDesc:     'text-slate-500',
    intelConceptBorder: 'border-indigo-200', intelConceptBg: 'bg-white shadow-sm',
    intelConceptBar:    'bg-slate-200',
    intelArticleBorder: 'border-sky-200',    intelArticleBg: 'bg-white shadow-sm',
    intelArticleTag:    'bg-sky-50 text-sky-600 border border-sky-200',
    intelArticleMeta:   'text-slate-400',
    artCard:       'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm hover:shadow-md',
    artTitle:      'text-slate-600 group-hover:text-slate-800',
    artCta:        'text-slate-300 group-hover:text-slate-500',
    preMarket:     'border-amber-200 bg-white hover:border-amber-300 hover:bg-amber-50 shadow-sm hover:shadow-md',
    preMarketTxt:  'text-amber-700 group-hover:text-amber-800',
    preMarketSub:  'text-slate-400',
    toggle:        'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 shadow-sm',
    logo:          'text-indigo-600',
    accentBlue:    'text-indigo-500',
    accentCyan:    'text-sky-500',
    accentGreen:   'text-emerald-500',
    accentAmber:   'text-amber-500',
    accentViolet:  'text-violet-500',
  },
}

const ThemeCtx = createContext('dark')
const useTh = () => THEMES[useContext(ThemeCtx)]

// ── Ticker ──────────────────────────────────────────────────────────────────
const TICKERS = [
  { sym: 'NIFTY 50',   val: '22,347.60', chg: '+0.84%', up: true  },
  { sym: 'BANKNIFTY',  val: '47,891.25', chg: '+1.12%', up: true  },
  { sym: 'SENSEX',     val: '73,648.30', chg: '+0.76%', up: true  },
  { sym: 'NIFTY IT',   val: '38,421.10', chg: '-0.34%', up: false },
  { sym: 'NIFTY AUTO', val: '21,044.85', chg: '+1.58%', up: true  },
  { sym: 'GOLD',       val: '₹63,240',   chg: '+0.22%', up: true  },
  { sym: 'CRUDE OIL',  val: '$83.40',    chg: '-0.61%', up: false },
  { sym: 'USD/INR',    val: '83.42',     chg: '+0.08%', up: false },
]

function Ticker() {
  const tk = useTh()
  return (
    <div className={`overflow-hidden border-b ${tk.ticker} py-2 shrink-0`}>
      <div className="ticker-track flex gap-14 w-max">
        {[...TICKERS, ...TICKERS].map((t, i) => (
          <span key={i} className="flex items-center gap-2 text-xs whitespace-nowrap">
            <span className={tk.tickerSym}>{t.sym}</span>
            <span className={tk.tickerVal}>{t.val}</span>
            <span className={t.up ? 'text-emerald-500' : 'text-rose-500'}>{t.chg}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
const NAV = [
  { icon: '🏠', label: 'Home',        href: '/',                  active: true  },
  { icon: '🌅', label: 'Pre-Market',  href: '/trades/pre-market', active: false },
  { icon: '📊', label: 'Dashboard',   href: '/trades',            active: false },
  { icon: '🎮', label: 'Games',       href: '#',                  active: false },
  { icon: '📘', label: 'Concepts',    href: '#',                  active: false },
  { icon: '📰', label: 'Articles',    href: '#',                  active: false },
  { icon: '📚', label: 'Books',       href: '#',                  active: false },
]

function Sidebar() {
  const tk = useTh()
  return (
    <aside className={`w-[200px] shrink-0 flex flex-col border-r ${tk.sidebar}`}>
      <div className={`px-5 py-5 border-b ${tk.sidebarBorder}`}>
        <span className="text-base font-black tracking-tight">
          Trading<span className={tk.logo}>Verse</span>
        </span>
      </div>

      <nav className="flex-1 flex flex-col gap-0.5 p-3 pt-4">
        {NAV.map(n => (
          <Link key={n.label} href={n.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group
              ${n.active ? tk.navActive : tk.navInactive}`}>
            <span className="text-base">{n.icon}</span>
            <span>{n.label}</span>
            {n.active && <span className={`ml-auto w-1.5 h-1.5 rounded-full ${tk.navDot}`} />}
          </Link>
        ))}
      </nav>

      <div className={`p-3 border-t ${tk.sidebarBorder}`}>
        <div className={`p-3 rounded-xl border ${tk.mktStatus}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className={`text-xs font-semibold ${tk.mktText}`}>Market Open</span>
          </div>
          <p className={`text-[10px] ${tk.mktSub}`}>NSE · BSE · MCX</p>
        </div>
      </div>
    </aside>
  )
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ sym, val, chg, up, icon }) {
  const tk = useTh()
  return (
    <div className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5
      ${up ? tk.statUp : tk.statDown}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${tk.statLabel}`}>{sym}</span>
        <span className="text-base">{icon}</span>
      </div>
      <div className={`text-lg font-bold ${tk.statVal}`}>{val}</div>
      <div className={`text-xs font-semibold ${up ? 'text-emerald-500' : 'text-rose-500'}`}>{chg} today</div>
    </div>
  )
}

// ── Game card ─────────────────────────────────────────────────────────────────
function GameCard() {
  const tk = useTh()
  const [pick, setPick] = useState(null)
  const [done, setDone] = useState(false)
  const answer = 'bullish'

  const choose = (v) => {
    if (done) return
    setPick(v)
    setTimeout(() => setDone(true), 500)
  }

  return (
    <div className={`flex flex-col h-full p-5 rounded-2xl border transition-all ${tk.gameCard}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] font-bold tracking-widest uppercase ${tk.accentGreen}`}>Game of the Day</span>
        <Link href="#" className={`text-[10px] transition-colors ${tk.artCta}`}>All games →</Link>
      </div>
      <p className={`text-sm font-bold mb-0.5 ${tk.hdrTitle}`}>Market Direction Challenge</p>
      <p className={`text-xs mb-4 ${tk.statLabel}`}>Nifty 15-min · What's the next move?</p>

      <div className={`flex items-end gap-1.5 h-14 mb-4 rounded-xl px-4 py-3 ${tk.gameChartBg}`}>
        {[{h:38,g:false},{h:52,g:true},{h:44,g:false},{h:66,g:true},{h:74,g:true}].map((c,i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-px">
            <div className={`w-px ${c.g?'bg-emerald-400':'bg-rose-400'} opacity-50`} style={{height:c.h*0.22}}/>
            <div className={`w-full rounded-sm ${c.g?'bg-emerald-400':'bg-rose-400'} opacity-80`} style={{height:c.h*0.55}}/>
            <div className={`w-px ${c.g?'bg-emerald-400':'bg-rose-400'} opacity-50`} style={{height:c.h*0.14}}/>
          </div>
        ))}
        <div className={`flex-1 flex items-center justify-center border border-dashed ${tk.gameChartDash} rounded-sm h-full`}>
          <span className={`text-xs font-bold ${tk.gameChartQ}`}>?</span>
        </div>
      </div>

      {!done ? (
        <div className="flex gap-2">
          <button onClick={() => choose('bullish')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all
              ${pick==='bullish' ? 'bg-emerald-600 border-emerald-500 text-white' : `${tk.gameBtnOff} ${tk.gameBtnBull}`}`}>
            📈 Bullish
          </button>
          <button onClick={() => choose('bearish')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all
              ${pick==='bearish' ? 'bg-rose-600 border-rose-500 text-white' : `${tk.gameBtnOff} ${tk.gameBtnBear}`}`}>
            📉 Bearish
          </button>
        </div>
      ) : (
        <div className={`p-3 rounded-xl border text-xs ${pick===answer ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-rose-300 bg-rose-50 text-rose-700'}`}>
          <p className="font-bold mb-1">{pick===answer ? '✓ Correct! +10 XP' : '✗ The move was bullish.'}</p>
          <p className="text-slate-500 text-[11px] leading-relaxed">Price swept the low (stop hunt) before reversing — classic liquidity grab.</p>
        </div>
      )}

      <div className={`mt-auto pt-4 grid grid-cols-3 gap-2 text-center border-t ${tk.gameDiv}`}>
        {[['Level','7',tk.accentBlue],['Accuracy','62%',tk.accentGreen],['Streak','4d',tk.accentAmber]].map(([l,v,c]) => (
          <div key={l}>
            <div className={`text-sm font-bold ${c}`}>{v}</div>
            <div className={`text-[10px] ${tk.gameLbl}`}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Intel cards ───────────────────────────────────────────────────────────────
function ConceptCard() {
  const tk = useTh()
  return (
    <div className={`flex flex-col h-full p-5 rounded-2xl border hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group ${tk.intelConceptBorder} ${tk.intelConceptBg}`}>
      <span className={`text-[10px] font-bold tracking-widest uppercase mb-3 ${tk.accentBlue}`}>Concept of the Day</span>
      <p className={`text-sm font-bold mb-2 leading-snug transition-colors ${tk.intelTitle}`}>Liquidity Sweep</p>
      <div className={`flex items-end gap-1 h-10 my-2 opacity-60`}>
        {[30,42,36,50,42,58,40,26,70,82].map((h,i) => (
          <div key={i} className={`flex-1 rounded-sm ${i<7 ? tk.intelConceptBar : i===8 ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{height:h*0.5}}/>
        ))}
      </div>
      <p className={`text-xs leading-relaxed flex-1 ${tk.intelDesc}`}>
        Price raids a key level to grab stop orders placed by retail traders, then reverses sharply. The moment most get stopped out is exactly when smart money enters.
      </p>
      <span className={`text-xs font-semibold mt-4 group-hover:underline ${tk.accentBlue}`}>Learn this concept →</span>
    </div>
  )
}

function ArticleIntelCard() {
  const tk = useTh()
  return (
    <div className={`flex flex-col h-full p-5 rounded-2xl border hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group ${tk.intelArticleBorder} ${tk.intelArticleBg}`}>
      <span className={`text-[10px] font-bold tracking-widest uppercase mb-3 ${tk.accentCyan}`}>Article of the Day</span>
      <p className={`text-sm font-bold mb-2 leading-snug transition-colors ${tk.intelTitle}`}>Why Most Breakout Trades Fail</p>
      <div className="flex items-center gap-2 my-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tk.intelArticleTag}`}>Price Action</span>
        <span className={`text-[10px] ${tk.intelArticleMeta}`}>8 min read</span>
      </div>
      <p className={`text-xs leading-relaxed flex-1 ${tk.intelDesc}`}>
        The setup looks perfect. Volume picks up. Price breaks the level. You enter. Then it reverses. Here's the structural reason it keeps happening.
      </p>
      <span className={`text-xs font-semibold mt-4 group-hover:underline ${tk.accentCyan}`}>Read article →</span>
    </div>
  )
}

// ── Article strip card ────────────────────────────────────────────────────────
function ArticleCard({ tag, title, accent }) {
  const tk = useTh()
  return (
    <a href="#" className={`flex flex-col p-4 rounded-2xl border transition-all group cursor-pointer h-full ${tk.artCard}`}>
      <span className={`text-[10px] font-bold tracking-widest uppercase mb-2 ${accent}`}>{tag}</span>
      <p className={`text-xs font-semibold leading-snug transition-colors ${tk.artTitle}`}>{title}</p>
      <span className={`mt-auto pt-3 text-[10px] transition-colors ${tk.artCta}`}>Read →</span>
    </a>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const [theme, setTheme] = useState('dark')
  const tk = THEMES[theme]

  return (
    <ThemeCtx.Provider value={theme}>
      <div className={`h-screen flex overflow-hidden transition-colors duration-300 ${tk.page}`}>

        <Sidebar />

        {/* MAIN */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Ticker />

          {/* Header */}
          <div className="shrink-0 px-6 pt-5 pb-3 flex items-center justify-between">
            <div>
              <p className={`text-xs mb-0.5 ${tk.hdrDate}`}>Saturday, 7 March 2026</p>
              <h1 className={`text-xl font-black ${tk.hdrTitle}`}>Good morning, Aman 👋</h1>
            </div>
            <div className="flex items-center gap-3">
              {/* Theme toggle */}
              <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${tk.toggle}`}>
                {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
              </button>
              <Link href="/trades"
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 ${tk.ctaBtn}`}>
                Launch Dashboard →
              </Link>
            </div>
          </div>

          {/* BENTO GRID */}
          <div className="flex-1 px-6 pb-5 grid grid-rows-[auto_1fr_auto] gap-4 min-h-0 overflow-y-auto scrollbar-thin">

            {/* ROW 1 — Market stats */}
            <div className="grid grid-cols-4 gap-4 shrink-0">
              <StatCard sym="NIFTY 50"  val="22,347" chg="+0.84%" up  icon="📈" />
              <StatCard sym="BANKNIFTY" val="47,891" chg="+1.12%" up  icon="🏦" />
              <StatCard sym="SENSEX"    val="73,648" chg="+0.76%" up  icon="📊" />
              <StatCard sym="GOLD"      val="₹63,240" chg="+0.22%" up icon="✨" />
            </div>

            {/* ROW 2 — Game + Intel cards */}
            <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 min-h-0">
              <GameCard />
              <ConceptCard />
              <ArticleIntelCard />
            </div>

            {/* ROW 3 — Article strip + Pre-Market */}
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_180px] gap-4 shrink-0">
              <ArticleCard tag="Psychology"   accent={tk.accentViolet} title="Why traders sabotage their own trades" />
              <ArticleCard tag="Price Action" accent={tk.accentBlue}   title="Reading order flow without indicators" />
              <ArticleCard tag="Trade Review" accent={tk.accentGreen}  title="Post-trade review: the missing habit" />
              <ArticleCard tag="Mistakes"     accent="text-rose-500"   title="The revenge trade trap — and the exit" />

              <Link href="/trades/pre-market"
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border hover:-translate-y-0.5 transition-all group text-center p-4 ${tk.preMarket}`}>
                <span className="text-3xl">🌅</span>
                <span className={`text-xs font-bold leading-snug transition-colors ${tk.preMarketTxt}`}>Start Pre-Market Analysis</span>
                <span className={`text-[10px] transition-colors ${tk.preMarketSub}`}>Plan your day →</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </ThemeCtx.Provider>
  )
}
