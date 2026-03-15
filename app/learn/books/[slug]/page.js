import Link from 'next/link'
import { notFound } from 'next/navigation'
import Nav from '../../../components/Nav'

const BOOKS = {
  'trading-in-the-zone': {
    emoji: '🧠',
    title: 'Trading in the Zone',
    author: 'Mark Douglas',
    year: 2000,
    category: 'Psychology',
    categoryColor: 'text-violet-400 bg-violet-950/40 border-violet-900/50',
    difficulty: 'Essential',
    diffColor: 'text-emerald-400',
    pages: 240,
    readTime: '5–6 hours',
    tagline: 'The most important trading book ever written — and it has nothing to do with charts.',
    summary: `Mark Douglas spent years watching traders lose money despite having solid strategies. His conclusion was uncomfortable: the market doesn't beat traders. Traders beat themselves.

Trading in the Zone is the definitive text on trading psychology. Douglas argues that the difference between a winning and losing trader isn't their system — it's their relationship with uncertainty, risk, and loss. Most traders approach the market wanting to be right. Consistently profitable traders approach it wanting to execute their edge.

The book dismantles the illusion of market predictability and replaces it with something far more powerful: a probabilistic mindset. When you truly accept that any individual trade can lose — and that this is perfectly fine — everything changes. Fear dissolves. Hesitation disappears. Discipline becomes effortless.`,
    keyThemes: [
      {
        title: 'The Probabilistic Mindset',
        content: 'Professional traders think in probabilities, not certainties. They know their edge works over 100 trades — so any single loss is just data, not failure. This shift from "I need to be right" to "I trust my edge over time" is the single most important mental leap a trader can make.',
      },
      {
        title: 'The Five Trading Fears',
        content: 'Douglas identifies five core fears that destroy trading performance: fear of being wrong, fear of losing money, fear of missing out, fear of leaving money on the table, and fear of not being good enough. Each fear distorts your perception and causes you to break your own rules at the worst possible moments.',
      },
      {
        title: 'Accepting Risk Completely',
        content: 'Most traders say they accept risk, but flinch when a trade goes against them. True risk acceptance means defining your risk before entry, then mentally releasing the money as already gone. The trade\'s outcome becomes emotionally irrelevant — only your execution matters.',
      },
      {
        title: 'The Zone State',
        content: '"The Zone" is a state of effortless execution — you follow your rules automatically, take every signal without hesitation, and remain unmoved by results. Douglas argues this isn\'t talent; it\'s a mental framework anyone can install through consistent belief alignment.',
      },
    ],
    lessons: [
      { num: '01', title: 'Think in batches, not trades', body: 'Your edge is statistical. Judge it over 20–50 trades, not on whether this trade wins. A single loss tells you nothing about your system\'s validity.' },
      { num: '02', title: 'Define risk before entry', body: 'The moment you place a trade without a stop, you haven\'t accepted the risk — you\'ve denied it. Pre-defined risk is what separates a trade from a gamble.' },
      { num: '03', title: 'Your rules are your edge', body: 'Every time you break your own rules, you\'re not trading your system — you\'re trading your emotions. The rules exist because you were rational when you wrote them. In the trade, you\'re not.' },
      { num: '04', title: 'The market is never wrong', body: 'The market doesn\'t know your entry price or your opinion. It just moves. When you\'re losing, the market isn\'t doing something to you — you\'re holding a position that isn\'t working.' },
      { num: '05', title: 'Consistency is a skill, not luck', body: 'Consistent traders aren\'t luckier — they\'ve built consistent beliefs that produce consistent actions. Inconsistent results always trace back to inconsistent thinking.' },
    ],
    quotes: [
      { text: 'The best traders aren\'t afraid. They have developed attitudes that give them the greatest degree of mental flexibility to flow in and out of trades based on what the market is actually doing.', context: 'On the mindset of elite traders' },
      { text: 'If you want to be a consistently successful trader, then you have to start from the premise that no matter what the trade looks like, you could be wrong.', context: 'On humility and risk acceptance' },
      { text: 'The market is never wrong — opinions often are.', context: 'On market reality' },
    ],
    whoShouldRead: 'Every trader who has ever broken their own rules, held a losing trade too long, or felt paralyzed before pulling the trigger. This isn\'t a beginner\'s book — it\'s for anyone who already knows what to do but can\'t seem to do it consistently.',
    tldr: 'Your edge is not the problem. Your relationship with uncertainty, loss, and being wrong is. Fix that, and consistent profitability becomes inevitable.',
  },

  'market-wizards': {
    emoji: '⚡',
    title: 'Market Wizards',
    author: 'Jack D. Schwager',
    year: 1989,
    category: 'Strategy',
    categoryColor: 'text-amber-400 bg-amber-950/40 border-amber-900/50',
    difficulty: 'Intermediate',
    diffColor: 'text-amber-400',
    pages: 458,
    readTime: '8–10 hours',
    tagline: 'Seventeen legendary traders. Completely different styles. One identical truth about success.',
    summary: `Jack Schwager spent years conducting in-depth interviews with the most successful traders of his generation — people who turned thousands into millions, managed billions, and produced extraordinary returns across decades. He expected to find a secret formula. He found something more interesting.

Every wizard traded differently. Some were pure technicians. Others relied entirely on fundamentals. Some held positions for minutes; others for years. They disagreed on almost everything — except one thing: how to handle losses.

Market Wizards is the most revealing document of what elite trading actually looks like in practice. Not theory. Not backtests. The real thinking, real mistakes, and real disciplines of people who actually did it at the highest level.`,
    keyThemes: [
      {
        title: 'No Single Holy Grail',
        content: 'The wizards\'s most striking characteristic is their diversity. Paul Tudor Jones is a macro trader. Ed Seykota is a systematic trend follower. Michael Marcus is a discretionary fundamental trader. The lesson: the edge isn\'t a specific strategy — it\'s the disciplined execution of whatever your genuine edge happens to be.',
      },
      {
        title: 'The Universal Law of Loss Management',
        content: 'Despite every other difference, every single wizard shared an obsession with cutting losses quickly and letting profits run. Not as a platitude — as a lived principle that overrode their desire to be right. Paul Tudor Jones said: "If you have a losing position that is making you uncomfortable, the solution is simple: get out."',
      },
      {
        title: 'Finding Your Own Edge',
        content: 'Several wizards explicitly warn against copying others\' methods. What works for Ed Seykota — a computerized trend system — would be agonizing for someone who needs to understand why they\'re in a trade. The discipline to follow a system comes from conviction, and conviction must be earned through genuine belief in the logic.',
      },
      {
        title: 'The Psychology of Big Winners',
        content: 'Schwager probes each wizard\'s response to losses, drawdowns, and mistakes. The pattern is consistent: they feel the pain acutely, but it doesn\'t shake their confidence in themselves or their system. They separate the result of a trade from their identity as a trader.',
      },
    ],
    lessons: [
      { num: '01', title: 'The method matters less than you think', body: 'Fundamentals, technicals, systems, discretion — there are wizards who\'ve mastered each. Spend less time finding the "right" strategy and more time deeply understanding whichever one resonates with how you think.' },
      { num: '02', title: 'Losses are always negotiable on entry', body: 'Every wizard defined their maximum acceptable loss before entering. After entry, the loss is inevitable — you can only choose how large it gets. Before entry, it\'s entirely in your control.' },
      { num: '03', title: 'Great traders are obsessively humble', body: 'The most successful traders in the world are the ones who most readily admit they can be — and often are — wrong. This isn\'t false modesty. It\'s the survival trait that kept them in the game long enough to win big.' },
      { num: '04', title: 'Size is a weapon and a trap', body: 'Several wizards describe their biggest mistakes as position sizing errors, not strategy errors. They were right about the market, then lost because they were too large to survive the volatility before being proven right.' },
      { num: '05', title: 'Don\'t trade when you\'re off', body: 'Multiple wizards describe periods where they deliberately stepped back — took smaller size, traded less, or stopped entirely — when they sensed their judgment was impaired. Knowing when not to trade is as important as knowing when to.' },
    ],
    quotes: [
      { text: 'I\'m always thinking about losing money as opposed to making money. Don\'t focus on making money; focus on protecting what you have.', context: 'Paul Tudor Jones' },
      { text: 'The elements of good trading are: (1) cutting losses, (2) cutting losses, and (3) cutting losses. If you can follow these three rules, you may have a chance.', context: 'Ed Seykota' },
      { text: 'The market is not your mother. It consists of tough men and women who look for ways to take money away from you instead of pouring milk and cookies into you.', context: 'Ed Seykota' },
    ],
    whoShouldRead: 'Any trader who wants to see what serious, sustained success actually looks like — not the theory, but the reality. Essential reading if you\'ve been wondering whether to be technical or fundamental, systematic or discretionary. The answer is: whichever you can execute with conviction.',
    tldr: 'Seventeen different edges. Seventeen different personalities. One identical discipline: protect capital first, and let the edge do its job over time.',
  },

  'daily-trading-coach': {
    emoji: '🎯',
    title: 'The Daily Trading Coach',
    author: 'Brett Steenbarger',
    year: 2009,
    category: 'Psychology',
    categoryColor: 'text-violet-400 bg-violet-950/40 border-violet-900/50',
    difficulty: 'Intermediate',
    diffColor: 'text-amber-400',
    pages: 342,
    readTime: '6–8 hours',
    tagline: '101 lessons for becoming your own best coach — because no one else can do it for you.',
    summary: `Brett Steenbarger is a psychiatrist who spent years working directly with professional traders at major hedge funds and prop desks. His conclusion: the highest-leverage activity available to any trader isn't finding a better system — it's becoming a better learner.

The Daily Trading Coach is structured as 101 standalone lessons, each one a specific, actionable technique borrowed from psychology, coaching science, and behavioral research. It's not about fixing weaknesses. It's about building the self-awareness to know what's working, the discipline to build on it, and the honesty to identify the patterns that are costing you money.

This book treats trading as a performance skill — like professional athletics or music — and applies the same developmental frameworks used in those fields. The result is a practical coaching manual you can use on yourself, every day.`,
    keyThemes: [
      {
        title: 'Trading as Performance',
        content: 'Steenbarger repeatedly frames trading as a performance skill, not a knowledge skill. You don\'t fail because you don\'t know enough — you fail because you can\'t consistently execute what you know under pressure. Peak performance research from sports, music, and surgery all apply directly to trading.',
      },
      {
        title: 'Track the Invisible P&L',
        content: 'Your emotional state is as important as your market position. Steenbarger recommends tracking not just trades, but the circumstances surrounding them — your mood, sleep, recent life events, the session\'s feel. Patterns emerge: maybe you always revenge-trade after a stop-out, or your best setups always come in the first hour.',
      },
      {
        title: 'Build on Strengths, Not Just Fix Weaknesses',
        content: 'Most traders focus coaching energy on what\'s going wrong. Steenbarger argues the higher-leverage question is: what\'s going right, and why? Identify your genuine edge — the setups where you consistently perform — and dedicate more capital and attention to those.',
      },
      {
        title: 'Deliberate Practice',
        content: 'Elite performance in any domain requires deliberate practice — focused repetition of specific skills with immediate feedback. Steenbarger applies this to trading: instead of just "reviewing trades," identify one specific skill you\'re working on, design scenarios to practice it, and track improvement over time.',
      },
    ],
    lessons: [
      { num: '01', title: 'Keep a performance journal, not just a trade journal', body: 'Record your emotional state before, during, and after significant trades. Over 30 days, you\'ll see patterns in your best and worst decisions that have nothing to do with market conditions.' },
      { num: '02', title: 'Find your genuine edge with data', body: 'Pull your last 50 trades. Filter them by setup type, time of day, market condition. Your real edge is probably narrower than you think — and more reliable when focused on.' },
      { num: '03', title: 'Use the post-session debrief', body: 'Spend 10 minutes after every trading day answering: what did I do well, what would I do differently, and what is my focus for tomorrow? This single habit compounds faster than any strategy upgrade.' },
      { num: '04', title: 'Interrupt your own patterns', body: 'When you notice you\'re about to break a rule — taking a setup you shouldn\'t, staying in a losing trade — physically pause. Stand up. Take three breaths. The emotional hijack dissipates within 90 seconds if you don\'t feed it.' },
      { num: '05', title: 'Set process goals, not outcome goals', body: '"Make ₹5,000 today" is an outcome goal and creates pressure that distorts your decisions. "Follow my rules on every trade today" is a process goal and is entirely within your control. Process goals make you better. Outcome goals make you nervous.' },
    ],
    quotes: [
      { text: 'The best traders I have known are not the most talented; they are the hardest working. They are the ones who are always learning, always challenging themselves.', context: 'On the work behind elite trading' },
      { text: 'You cannot fix what you cannot see. That is why self-observation is the foundation of all trading improvement.', context: 'On self-awareness as a skill' },
      { text: 'The goal is not to be perfect. The goal is to be consistently better — to improve at the rate that your edge improves.', context: 'On the trajectory of development' },
    ],
    whoShouldRead: 'Traders with some experience who know their rules but struggle to follow them consistently. Also valuable for anyone who reviews trades intellectually but hasn\'t developed a systematic self-improvement process. The "I know what I should do, but..." trader.',
    tldr: 'You are your own best coach — but only if you learn how to observe yourself clearly, build on what works, and improve deliberately rather than hoping to get better through repetition alone.',
  },

  'reminiscences-stock-operator': {
    emoji: '📜',
    title: 'Reminiscences of a Stock Operator',
    author: 'Edwin Lefèvre',
    year: 1923,
    category: 'Classic',
    categoryColor: 'text-cyan-400 bg-cyan-950/40 border-cyan-900/50',
    difficulty: 'Essential',
    diffColor: 'text-emerald-400',
    pages: 318,
    readTime: '6–7 hours',
    tagline: 'Written in 1923. Nothing in it is obsolete. That tells you everything about human nature.',
    summary: `Published in 1923, Reminiscences is the thinly veiled autobiography of Jesse Livermore — arguably the most brilliant speculator who ever lived. Livermore started trading at 14 in the bucket shops of Boston, went broke multiple times, made and lost fortunes in the tens of millions, and shaped how the world thinks about market speculation.

The book is written as a novel — a series of stories rather than lessons — which is exactly what makes it so powerful. You don't learn from Livermore's theories; you learn from his decisions, his mistakes, his psychology in real situations with real money on the line.

A hundred years later, every significant market dynamic described in this book still happens, every week, in every market. Human nature has not changed. Prices still run on hope and fear. Markets still shake out weak hands before the real move. The lessons are permanent.`,
    keyThemes: [
      {
        title: 'Human Nature Never Changes',
        content: 'Livermore\'s central observation, repeated throughout the book, is that markets move on human emotion — hope, fear, greed, and the need to feel right. These emotions were identical in 1900 and they are identical now. Understanding them is what gives a trader a permanent, timeless edge.',
      },
      {
        title: 'Patience Is the Hardest Discipline',
        content: 'Livermore didn\'t just know when to buy — he knew when not to. He waited for the exact right moment, often for weeks or months. "It never was my thinking that made the big money for me. It always was my sitting." Premature action was responsible for most of his major losses.',
      },
      {
        title: 'Averaging Down Is a Disease',
        content: 'One of Livermore\'s strongest convictions: never average down on a losing position. Adding to a loser is rationalizing a mistake. It increases your exposure exactly when the market is telling you that you\'re wrong. Every trader who has ever been wiped out has done it — often multiple times before the final blow.',
      },
      {
        title: 'The Big Move Requires Conviction',
        content: '"Men who can both be right and sit tight are uncommon." Livermore describes the agony of holding a correct position through violent reactions — the market moving against you before the real move unfolds. The ability to stay in the big move, without being shaken out, is what separates fortunes from trades.',
      },
    ],
    lessons: [
      { num: '01', title: 'The tape tells the truth', body: 'Price is the only honest signal. Livermore ignored tips, news, and opinions — he watched how prices actually behaved. When a stock stopped going up on good news, he saw distribution. When it held on bad news, he saw accumulation. Price behavior reveals the smart money.' },
      { num: '02', title: 'Never average down', body: 'Every dollar added to a losing position is a bet that you\'re smarter than the market that\'s currently proving you wrong. The logic that made the original trade valid may no longer exist. Adding to losers has destroyed more fortunes than any other single habit in trading.' },
      { num: '03', title: 'The big money is in the big swing', body: 'Livermore made his fortune not by trading frequently, but by identifying major market moves and holding them through turbulence. He thought in terms of market phases — bull markets, bear markets — not individual trades. Scalping fortunes requires scalping discipline and luck. Swinging requires neither.' },
      { num: '04', title: 'Sit with your winners', body: '"It was never my thinking that made me money. It was always my sitting." The most profitable thing you can do in a good trade is nothing. Premature exit costs more money than bad entries. Learn to be bored while you are winning.' },
      { num: '05', title: 'Know the market phase', body: 'Livermore distinguished between being right about a stock and being right about the timing. A correct thesis in the wrong market phase is still a losing trade. He waited not just for the right setup but for the right environment — the tide — before acting on it.' },
    ],
    quotes: [
      { text: 'It never was my thinking that made the big money for me. It always was my sitting. Got that? My sitting tight!', context: 'On patience as the master skill' },
      { text: 'The stock market is never obvious. It is designed to fool most of the people, most of the time.', context: 'On the adversarial nature of markets' },
      { text: 'There is nothing new on Wall Street. There can\'t be because speculation is as old as the hills. Whatever happens in the stock market today has happened before and will happen again.', context: 'On the permanence of human nature' },
      { text: 'A loss never bothers me after I take it. I forget it overnight. But being wrong — not taking the loss — that is what does damage to the pocketbook and to the soul.', context: 'On the psychology of cutting losses' },
    ],
    whoShouldRead: 'Every trader. Required reading before any other trading book. Not because the techniques are directly applicable today — the bucket shops are gone — but because the psychology is completely, uncomfortably accurate about every mistake you have made or will make.',
    tldr: 'The most important things about trading have been known for over 100 years. Patience, cutting losses, and letting winners run aren\'t platitudes — they\'re the entire game. Livermore learned them the hard way so you can learn them the easy way.',
  },
}

export async function generateStaticParams() {
  return Object.keys(BOOKS).map(slug => ({ slug }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const book = BOOKS[slug]
  if (!book) return { title: 'Book Not Found' }
  return {
    title: `${book.title} — ${book.author} | TradingVerse`,
    description: book.tagline,
  }
}

export default async function BookPage({ params }) {
  const { slug } = await params
  const book = BOOKS[slug]
  if (!book) notFound()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">

      <Nav />

      {/* Hero */}
      <div className="border-b border-slate-200 dark:border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="flex items-center gap-3 mb-8">
            <Link href="/learn" className="text-slate-500 dark:text-slate-600 text-sm hover:text-slate-700 dark:hover:text-slate-400 transition-colors">Learn</Link>
            <span className="text-slate-400 dark:text-slate-700">/</span>
            <Link href="/learn" className="text-slate-500 dark:text-slate-600 text-sm hover:text-slate-700 dark:hover:text-slate-400 transition-colors">Books</Link>
            <span className="text-slate-400 dark:text-slate-700">/</span>
            <span className="text-slate-500 dark:text-slate-500 text-sm">{book.title}</span>
          </div>

          <div className="flex items-start gap-8">
            <div className="text-7xl shrink-0 leading-none">{book.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border ${book.categoryColor}`}>
                  {book.category}
                </span>
                <span className={`text-xs font-bold ${book.diffColor}`}>{book.difficulty}</span>
                <span className="text-slate-500 dark:text-slate-700 text-xs">{book.pages} pages · {book.readTime} read</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black mb-2 leading-tight">{book.title}</h1>
              <p className="text-slate-500 dark:text-slate-400 text-lg mb-5">by {book.author} · {book.year}</p>
              <p className="text-slate-600 dark:text-slate-300 text-lg font-medium leading-relaxed italic border-l-2 border-blue-500/50 pl-4">
                {book.tagline}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-16 space-y-20">

        {/* Summary */}
        <section>
          <p className="text-violet-600 dark:text-violet-400 text-xs font-bold tracking-[0.2em] uppercase mb-6">Overview</p>
          <div className="max-w-none">
            {book.summary.split('\n\n').map((para, i) => (
              <p key={i} className="text-slate-700 dark:text-slate-300 text-base leading-8 mb-5 last:mb-0">{para}</p>
            ))}
          </div>
        </section>

        {/* Key Themes */}
        <section>
          <p className="text-violet-600 dark:text-violet-400 text-xs font-bold tracking-[0.2em] uppercase mb-6">Key Themes</p>
          <div className="space-y-5">
            {book.keyThemes.map((theme, i) => (
              <div key={i} className="p-6 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-white/[0.02]">
                <h3 className="text-slate-900 dark:text-white font-bold text-base mb-3">{theme.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-7">{theme.content}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Core Lessons */}
        <section>
          <p className="text-violet-600 dark:text-violet-400 text-xs font-bold tracking-[0.2em] uppercase mb-6">What You Will Learn</p>
          <div className="space-y-0">
            {book.lessons.map((lesson, i) => (
              <div key={i} className="flex gap-6 py-7 border-b border-slate-200 dark:border-white/5 last:border-0">
                <span className="text-slate-400 dark:text-slate-700 text-xs font-bold font-mono tracking-widest mt-0.5 shrink-0 w-8">{lesson.num}</span>
                <div>
                  <h3 className="text-slate-900 dark:text-white font-bold mb-2">{lesson.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-7">{lesson.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quotes */}
        <section>
          <p className="text-violet-600 dark:text-violet-400 text-xs font-bold tracking-[0.2em] uppercase mb-6">Memorable Quotes</p>
          <div className="space-y-5">
            {book.quotes.map((quote, i) => (
              <blockquote key={i} className="p-6 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-white/[0.02]">
                <p className="text-slate-900 dark:text-white text-base leading-8 font-medium mb-4">"{quote.text}"</p>
                <p className="text-slate-500 dark:text-slate-600 text-xs font-semibold tracking-wide">— {quote.context}</p>
              </blockquote>
            ))}
          </div>
        </section>

        {/* Who Should Read */}
        <section>
          <p className="text-violet-600 dark:text-violet-400 text-xs font-bold tracking-[0.2em] uppercase mb-6">Who Should Read This</p>
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-white/[0.02]">
            <p className="text-slate-700 dark:text-slate-300 text-base leading-8">{book.whoShouldRead}</p>
          </div>
        </section>

        {/* TL;DR */}
        <section>
          <div className="p-8 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20">
            <p className="text-blue-600 dark:text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">TL;DR</p>
            <p className="text-slate-900 dark:text-white text-lg font-semibold leading-8">{book.tldr}</p>
          </div>
        </section>

        {/* Back to Learn */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/5">
          <Link href="/learn" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-semibold transition-colors">
            ← All Books
          </Link>
          <Link href="/learn" className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 text-sm font-semibold transition-colors">
            Browse Articles →
          </Link>
        </div>
      </div>
    </div>
  )
}
