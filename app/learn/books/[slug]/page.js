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
  'technical-analysis-financial-markets': {
    emoji: '📊',
    title: 'Technical Analysis of the Financial Markets',
    author: 'John J. Murphy',
    year: 1999,
    category: 'Technical',
    categoryColor: 'text-sky-400 bg-sky-950/40 border-sky-900/50',
    difficulty: 'Intermediate',
    diffColor: 'text-amber-400',
    pages: 576,
    readTime: '10–14 hours',
    tagline: 'The complete reference guide that every serious technician eventually owns — and keeps going back to.',
    summary: `John Murphy spent decades as a technical analyst for major institutions and built this book as a comprehensive textbook for everyone from beginners to professionals. It covers the full breadth of technical analysis: Dow Theory, chart patterns, indicators, oscillators, volume, open interest, inter-market analysis, and more.

What makes this book different from shorter technical books is its depth. Murphy doesn't just tell you what patterns to look for — he explains the logic behind why they form, what they mean about market psychology, and where they fail. Every major indicator gets its proper treatment, including when not to use it.

For Indian traders using intraday or swing strategies, this is the book that turns tools you already use (RSI, MACD, moving averages, support/resistance) from vague concepts into precisely understood instruments. It's a reference you open again and again, not a book you read once.`,
    keyThemes: [
      {
        title: 'Price Discounts Everything',
        content: 'Murphy anchors the entire book in the foundational premise of technical analysis: all known information — fundamentals, earnings, geopolitics, sentiment — is already reflected in the price. You don\'t need to read financial reports to trade a chart. The chart already knows. This isn\'t a belief; it\'s a working assumption that happens to produce results.',
      },
      {
        title: 'Trends Are Your Only Real Edge',
        content: 'The book devotes extensive chapters to trend identification and trend following — because trend trading is the most statistically robust strategy available to most market participants. Murphy\'s detailed treatment of trend lines, channels, and support/resistance gives traders a systematic vocabulary for reading market structure rather than guessing.',
      },
      {
        title: 'Volume Confirms Price',
        content: 'Price moves on high volume are significant; price moves on low volume are suspect. Murphy explains volume analysis in depth — expanding volume in a breakout confirms the move; declining volume on a rally warns of weakness. Volume is the market\'s lie detector. Most traders ignore it completely.',
      },
      {
        title: 'Inter-Market Relationships',
        content: 'One of the most underrated sections: how bonds, commodities, currencies, and equities move in relationship to each other. A bond rally often precedes an equity rally. Dollar strength pressures commodities. Understanding these linkages gives intraday traders broader context for what the larger money flows are doing.',
      },
    ],
    lessons: [
      { num: '01', title: 'Support and resistance are roles, not prices', body: 'A broken support level becomes resistance; a broken resistance level becomes support. Murphy explains this role-reversal principle with dozens of examples. It\'s not a trick — it\'s how market memory works. Previous buyers who are now underwater become sellers on the rally back.' },
      { num: '02', title: 'Indicators confirm; price leads', body: 'No indicator can tell you what price hasn\'t already told you. Murphy is clear that indicators are derivatives of price — they smooth it, average it, or measure its velocity. Use them to confirm what you\'re reading in the chart structure, not to generate signals independently.' },
      { num: '03', title: 'Patterns have measured price targets', body: 'Head and shoulders, cup and handle, double tops — every major pattern has a mathematical price target derivable from its structure. Murphy explains all of them. Knowing the target doesn\'t guarantee price reaches it, but it changes how you think about where to take profits.' },
      { num: '04', title: 'The higher timeframe dominates', body: 'A buy signal on a 5-minute chart in the context of a weekly downtrend is a low-probability trade. Murphy\'s multi-timeframe analysis framework is essential: always know where you are on the higher timeframe before reading a signal on the lower one.' },
      { num: '05', title: 'Divergence is a warning, not a signal', body: 'When price makes a new high but RSI doesn\'t, the momentum isn\'t confirming the move. Murphy distinguishes between divergence as a caution flag versus an action signal. Acting on divergence alone is premature — it tells you the trend may be weakening, not that it\'s over.' },
    ],
    quotes: [
      { text: 'The technician believes that everything that can possibly affect the price is reflected in the price itself.', context: 'On the core premise of technical analysis' },
      { text: 'Volume must confirm the trend. Volume should increase in the direction of the existing trend.', context: 'On volume as trend confirmation' },
      { text: 'The longer a support or resistance level has held, the more significant it becomes when it is eventually broken.', context: 'On the significance of breakouts from long-established levels' },
    ],
    whoShouldRead: 'Any trader who uses charts but has never had a proper education in what the tools actually measure and when they fail. If you\'ve been using RSI or MACD for years but couldn\'t explain why they work or when they don\'t, this book fills that gap permanently. Also the best single-volume reference for anyone learning technical analysis from scratch.',
    tldr: 'This is the textbook. Every chart pattern, every indicator, every inter-market relationship explained in full. You don\'t read it cover to cover in one sitting — you use it as a reference that makes everything you look at on a chart more legible.',
  },

  'thinking-fast-and-slow': {
    emoji: '🔬',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    year: 2011,
    category: 'Psychology',
    categoryColor: 'text-violet-400 bg-violet-950/40 border-violet-900/50',
    difficulty: 'Advanced',
    diffColor: 'text-rose-400',
    pages: 499,
    readTime: '10–12 hours',
    tagline: 'The Nobel laureate\'s masterwork on why humans make terrible decisions — and why traders are especially vulnerable.',
    summary: `Daniel Kahneman spent 40 years studying how humans actually make decisions — and the results are not flattering. The central insight of this book is that we have two cognitive systems: System 1 (fast, automatic, emotional) and System 2 (slow, deliberate, logical). The problem is that System 1 runs most of our decisions, including trading decisions, while we believe System 2 is in charge.

Kahneman and his late collaborator Amos Tversky mapped dozens of cognitive biases that produce systematic, predictable errors in judgment. Loss aversion, overconfidence, the availability heuristic, anchoring, the planning fallacy — each of these has a direct, concrete cost in trading that most traders are completely blind to.

This is not a trading book, which is exactly why it belongs on every trader's shelf. The biases it documents are the hidden forces behind every broken rule, every held loser, every overconfident oversize position. Understanding them is the prerequisite for overcoming them.`,
    keyThemes: [
      {
        title: 'System 1 vs System 2',
        content: 'System 1 is the fast, automatic mind — it pattern-matches, jumps to conclusions, and reacts emotionally in milliseconds. System 2 is slow, effortful, and rational — but it\'s lazy and often defers to System 1. When you react to a fast price move by impulsively chasing it, that\'s System 1. When you carefully check your setup criteria before entering, that\'s System 2. The entire discipline of trading is the project of keeping System 2 in charge.',
      },
      {
        title: 'Loss Aversion',
        content: 'Kahneman\'s most famous finding: losses hurt approximately twice as much as equivalent gains feel good. This isn\'t philosophy — it\'s measurable in brain scans and betting behaviour. For traders, it means you will hold losing positions longer than winning ones, because taking a loss feels worse than an unrealised loss. It means you exit winners too early to "bank the gain." Understanding that your brain is asymmetric about pain is the first step to overriding it.',
      },
      {
        title: 'Overconfidence Is Ubiquitous',
        content: 'Kahneman documents how even experts are systematically overconfident in their predictions. Traders have a specific version: the narrative fallacy, where we construct a story about why a trade should work, then become convinced of it. The story feels like analysis. It isn\'t. The antidote is pre-mortem thinking: before taking a trade, ask "what would have to be true for this to fail?"',
      },
      {
        title: 'Anchoring Distorts Every Estimate',
        content: 'When you see a price at 24,000 in the morning, your estimate of where it\'ll go is unconsciously anchored to that number. When a stock falls from ₹500 to ₹300, most people think it\'s "cheap" — anchoring to the prior high. Kahneman\'s research shows this bias is so powerful that even random, irrelevant numbers influence estimates. In trading, anchoring to your entry price, your day\'s high, or last week\'s close leads to flawed target-setting.',
      },
    ],
    lessons: [
      { num: '01', title: 'Name your biases before they operate', body: 'You cannot correct for a bias you can\'t see. Kahneman\'s framework gives you language: "I\'m loss-averse right now" or "I\'m anchoring to my cost basis." Just naming the bias activates System 2 and creates a pause before the error compounds.' },
      { num: '02', title: 'Don\'t trust your intuitions in unfamiliar situations', body: 'Intuition is only reliable when built from thousands of repetitions with clear, fast feedback — like a chess grandmaster or a firefighter. Trading new setups, new instruments, or new market regimes does not meet this threshold. In these situations, follow rules, not gut feelings.' },
      { num: '03', title: 'Pre-mortem your trades', body: 'Before entering a trade, imagine it\'s three weeks from now and the trade has failed badly. What happened? This exercise bypasses optimism bias and forces you to see risks your System 1 is suppressing. It is the single most practical risk management exercise in this book.' },
      { num: '04', title: 'Separate the quality of the decision from the outcome', body: 'A good decision can produce a bad outcome. A bad decision can produce a good outcome. Kahneman calls this "resulting" — judging decisions by their results rather than their process. Grade your trading process independently of your P&L, or you\'ll learn the wrong lessons from every trade.' },
      { num: '05', title: 'Reduce the number of decisions you make', body: 'Every decision depletes System 2 capacity. Kahneman\'s research on decision fatigue shows that later decisions are worse decisions. Have a trading plan. Define your setups, your stops, and your targets before the market opens. In-session, you\'re only executing — not deciding.' },
    ],
    quotes: [
      { text: 'A reliable way to make people believe in falsehoods is frequent repetition, because familiarity is not easily distinguished from truth.', context: 'On why false market narratives persist' },
      { text: 'The confidence that individuals have in their beliefs depends mostly on the quality of the story they can tell about what they see, even if they see little.', context: 'On overconfidence and narrative' },
      { text: 'Losses loom larger than gains. The asymmetry of pain and pleasure is a powerful driver of human decisions.', context: 'On loss aversion' },
    ],
    whoShouldRead: 'Every trader who has ever held a losing trade too long, chased a move, or felt inexplicably confident before a big loss. The self-awareness this book builds is more valuable than any strategy. Read it once for the concepts, then re-read the chapters on loss aversion and overconfidence every six months.',
    tldr: 'Your brain is not a rational decision-making machine — it\'s a fast, emotional, bias-riddled survival tool that evolved to avoid tigers, not to trade Nifty. Knowing exactly how it fails is the most important edge you can build.',
  },

  'how-to-make-money-in-stocks': {
    emoji: '📈',
    title: 'How to Make Money in Stocks',
    author: 'William J. O\'Neil',
    year: 2009,
    category: 'Strategy',
    categoryColor: 'text-amber-400 bg-amber-950/40 border-amber-900/50',
    difficulty: 'Intermediate',
    diffColor: 'text-amber-400',
    pages: 464,
    readTime: '8–10 hours',
    tagline: 'The CANSLIM system — built from studying every major market winner over 125 years.',
    summary: `William O'Neil founded Investor's Business Daily and spent decades studying the greatest stock market winners in history — from the 1880s through the 2000s. What he found was not random. The same fundamental and technical characteristics appeared in virtually every major winner before its biggest move.

From this research, he developed the CANSLIM system: Current quarterly earnings, Annual earnings growth, New products or services, Supply and demand, Leader or laggard in its sector, Institutional sponsorship, and Market direction. Each letter captures a specific quality that top-performing stocks share before a major price advance.

This book is unusual in that it's simultaneously a fundamental screening system and a technical entry methodology. O'Neil's "cup with handle" pattern is arguably the most widely-used chart pattern in institutional growth investing. The strict 7–8% loss-cutting rule and precise entry technique have influenced an entire generation of professional traders.`,
    keyThemes: [
      {
        title: 'Buy Leaders, Not Laggards',
        content: 'O\'Neil\'s data shows that the best returns come from the top-performing stocks in the top-performing sectors — not from cheap, beaten-down stocks that seem like "value." The instinct to buy things that have fallen is the most expensive instinct in investing. Strong fundamentals, accelerating earnings growth, and relative price strength are the markers of a leader. Buy those; avoid the "bargains."',
      },
      {
        title: 'The Cup with Handle Pattern',
        content: 'O\'Neil identifies specific chart patterns that have preceded the biggest stock moves across 125 years of market history. The most important is the cup with handle — a price consolidation shaped like a teacup, where the stock builds a base as weak holders exit, then forms a short tight handle before breaking out on volume. This base-building period is where institutions are quietly accumulating. The breakout is the moment they\'re ready to move the price.',
      },
      {
        title: 'Never Hold a Loss Beyond 7–8%',
        content: 'O\'Neil\'s most rigid rule: if a stock falls 7–8% below your purchase price, sell it. No exceptions. No hoping. This single rule, applied consistently, prevents the catastrophic losses that destroy portfolios. A 7% loss requires an 8% gain to recover. A 50% loss requires a 100% gain. The arithmetic of loss is asymmetric — the earlier you cut, the less damage compounds.',
      },
      {
        title: 'The Market Direction Is Always Primary',
        content: 'Three out of four stocks move with the general market. You can pick the perfect stock with perfect timing and still lose money if the market is in a downtrend. O\'Neil devotes significant space to reading market direction — specifically identifying distribution days (institutional selling) that signal a market top. When the market is in a confirmed downtrend, the correct position size is zero.',
      },
    ],
    lessons: [
      { num: '01', title: 'Buy during the base, not after the breakout', body: 'Most retail traders wait for confirmation after a breakout. By then, institutions have already bought and the risk/reward has deteriorated. O\'Neil\'s system has specific buy points within the base structure — precise entry prices that minimise risk while maximising proximity to the institutional accumulation.' },
      { num: '02', title: 'Relative price strength is predictive', body: 'O\'Neil\'s research shows that stocks with the highest relative strength (outperforming 85%+ of all stocks over the past 52 weeks) continue to outperform. This feels counterintuitive — buying what\'s already strong. But institutions buy strength, not weakness. Following their footprints means following the money.' },
      { num: '03', title: 'Volume confirms the move', body: 'A breakout from a base on volume 40–50% above average is meaningful. A breakout on average volume is suspect. Volume is the only way to confirm that institutions — who move markets — are participating. Without volume, a breakout is just noise.' },
      { num: '04', title: 'The first pullback after a breakout is buyable', body: 'Stocks that break out don\'t go straight up. They often pull back to test the breakout point on lower volume. This is a second, lower-risk entry — the market has confirmed the breakout and is simply digesting. It\'s one of the highest-probability entries in O\'Neil\'s system.' },
      { num: '05', title: 'Sell into strength, not weakness', body: 'Most retail investors sell when a stock is down (capitulation). O\'Neil teaches the opposite: take partial profits on the way up — especially when a stock has risen 20–25% from the breakout. This locks in gains before the inevitable pullback and gives you staying power in a longer-term winner.' },
    ],
    quotes: [
      { text: 'The whole secret to winning big in the stock market is not to be right all the time, but to lose the least amount possible when you\'re wrong.', context: 'On loss management as the primary skill' },
      { text: 'What seems too high and risky to the majority generally goes higher and what seems low and cheap generally goes lower.', context: 'On why buying strong stocks is correct' },
      { text: 'The market is not obligated to make sense to you. Your job is to read it, not to argue with it.', context: 'On humility before the market' },
    ],
    whoShouldRead: 'Swing traders and growth investors looking for a systematic, backtested approach to selecting and timing stocks. Also essential for anyone who keeps buying cheap-looking stocks that keep going lower — O\'Neil\'s data demolishes the "buy the dip" mentality with 125 years of evidence.',
    tldr: 'Study the greatest stock market winners in history and you find the same fingerprints every time: accelerating earnings, relative strength, and a specific chart pattern before the big move. CANSLIM is the codified version of those fingerprints.',
  },

  'one-good-trade': {
    emoji: '⚡',
    title: 'One Good Trade',
    author: 'Mike Bellafiore',
    year: 2010,
    category: 'Execution',
    categoryColor: 'text-emerald-400 bg-emerald-950/40 border-emerald-900/50',
    difficulty: 'Intermediate',
    diffColor: 'text-amber-400',
    pages: 320,
    readTime: '6–8 hours',
    tagline: 'Inside an elite prop trading firm — and the real reason most traders wash out.',
    summary: `Mike Bellafiore co-founded SMB Capital, one of the most respected proprietary trading firms in New York. One Good Trade is the inside story of how professional day traders are actually built — the training, the development, the mistakes, and the specific habits that separate traders who make it from the large majority who don't.

The book takes its title from a core SMB principle: your only goal on any given session is to make one good trade. Not to hit a P&L target. Not to take every setup that appears. One trade, executed perfectly, with full discipline. This philosophy is simultaneously a psychological anchor and a quality filter — it forces a standard of selectivity that most retail traders never apply to themselves.

What makes this book valuable isn't theory — it's specificity. Bellafiore writes about real traders, real mistakes, and the exact conversations that happen on a prop trading desk. The feedback loops, the journaling practices, the way experienced traders build mental models of individual stocks — it's as close to being inside a professional trading firm as most people will ever get.`,
    keyThemes: [
      {
        title: 'Selectivity Over Activity',
        content: 'The biggest mistake most new traders make is overtrading — taking too many setups, filling the day with noise trades, generating commissions but not edge. SMB\'s culture demands the opposite: wait for the highest-probability setups, the situations where everything aligns — level, pattern, volume, catalyst. One good trade is worth more than twenty mediocre ones, financially and developmentally.',
      },
      {
        title: 'Build a Playbook',
        content: 'SMB traders build a personal playbook — a documented set of specific setups with defined entry conditions, stop placement, and targets. The playbook is built from real trades, reviewed and refined over months. It transforms vague pattern recognition into explicit, executable rules. When you see the setup, you execute the play — not improvise. This is the foundation of consistency.',
      },
      {
        title: 'Your Trading Problems Are Personal Problems',
        content: 'Bellafiore is unusually direct about this: if you can\'t follow rules, it\'s not a trading problem — it\'s a discipline and self-awareness problem. Traders who revenge-trade after losses, who size up recklessly when they\'re "due for a win," or who can\'t sit through a drawdown are displaying personal psychological patterns that manifest in the market. The market is an amplifier — it makes every psychological weakness bigger and more expensive.',
      },
      {
        title: 'Tape Reading as a Modern Skill',
        content: 'SMB teaches a modern version of tape reading — reading the order flow, the time and sales, the bid/ask dynamics to understand what institutional participants are actually doing. This is different from chart reading and provides an additional layer of confirmation. A breakout on the chart that\'s also supported by strong order flow is a much higher-conviction trade than one that isn\'t.',
      },
    ],
    lessons: [
      { num: '01', title: 'Define your best setups and only trade those', body: 'Most traders have 15 types of setups they\'ll take. Their results are mediocre across all of them. SMB traders identify their two or three best setups — the ones where their hit rate and risk/reward are statistically significant — and develop deep expertise in those. Quality over quantity, always.' },
      { num: '02', title: 'Set a daily stop-loss before you start', body: 'SMB traders have a hard rule: if you lose X in a single session, you stop trading for the day. This isn\'t weakness — it\'s survival. A session where you lose control and blow through your max daily loss takes weeks to recover. The daily stop-loss is the line between a bad day and a damaged account.' },
      { num: '03', title: 'Journal every trade — specifically', body: 'Not "bought RELIANCE, it worked." SMB journals capture: the setup type, the specific entry trigger, size, the management decision, the exit, and critically — what you did well and what you\'d change. This is the feedback loop that makes deliberate improvement possible. Without it, you\'re just repeating patterns.' },
      { num: '04', title: 'Stocks have personalities — learn them', body: 'A stock that always snaps back to VWAP behaves differently from one that trends cleanly all day. Bellafiore describes SMB traders who develop intimate knowledge of their specific instruments — how they trade around key levels, how they react to news, when they\'re worth trading and when they\'re noise. Expertise in fewer instruments beats passing familiarity with many.' },
      { num: '05', title: 'Build on your best days, not your worst', body: 'Most traders spend coaching energy analysing their worst trades. Bellafiore suggests the inverse: study your best sessions obsessively. What setup was it? What was your state? What did you see that others didn\'t? The goal is to replicate excellence, not just avoid disaster.' },
    ],
    quotes: [
      { text: 'Make one good trade. That\'s it. If you make one good trade a day, that\'s 250 good trades a year. Compounded, that\'s a career.', context: 'On the philosophy behind the book\'s title' },
      { text: 'We are not trying to make money in the markets. We are trying to become elite traders. The money is a byproduct of being elite.', context: 'On process vs outcome orientation' },
      { text: 'Your trading problems are usually personal problems. They\'re just wearing a trading costume.', context: 'On the psychological roots of trading mistakes' },
    ],
    whoShouldRead: 'Day traders and anyone who trades for a living or wants to. Especially valuable if you\'re profitable sometimes but wildly inconsistent — the playbook and journaling frameworks alone are worth the price of admission. Also read this if you\'ve ever wondered what professional trader development actually looks like from the inside.',
    tldr: 'Stop trying to take every setup. Build a playbook of your two or three best setups, execute them with discipline, journal them obsessively, and improve deliberately. One good trade a day, 250 days a year, is a career.',
  },

  'psychology-of-money': {
    emoji: '💡',
    title: 'The Psychology of Money',
    author: 'Morgan Housel',
    year: 2020,
    category: 'Mindset',
    categoryColor: 'text-rose-400 bg-rose-950/40 border-rose-900/50',
    difficulty: 'Essential',
    diffColor: 'text-emerald-400',
    pages: 256,
    readTime: '4–5 hours',
    tagline: 'The most widely-read finance book of the decade — because it\'s about people, not spreadsheets.',
    summary: `Morgan Housel is not a trader. He's a partner at the Collaborative Fund and one of the clearest thinkers in finance. The Psychology of Money collects 19 short essays on the strangest, most counterintuitive truths about how humans relate to money — how we earn it, save it, invest it, and lose it.

The central argument is this: financial outcomes are less determined by intelligence, information, or strategy than they are by behaviour — and behaviour is driven by personality, history, and emotion, none of which appear in any financial model. The person who earns a modest salary but never sells in a crash will consistently outperform the brilliant fund manager who panic-exits every downturn.

For traders specifically, this book provides the philosophical foundation for why discipline and emotional control matter more than any edge. It's also a rare finance book that is genuinely enjoyable to read — Housel writes with clarity, humour, and the kind of honesty that makes you uncomfortable in useful ways.`,
    keyThemes: [
      {
        title: 'Getting Wealthy vs Staying Wealthy',
        content: 'Getting wealthy requires taking risk, being optimistic, and being willing to be wrong sometimes. Staying wealthy requires the opposite: humility, frugality, and paranoia about the downside. These two skill sets are in direct tension. Many traders who generate exceptional returns over a period blow it up because they apply the "getting wealthy" mindset to a situation that requires the "staying wealthy" mindset.',
      },
      {
        title: 'The Tail Drives Everything',
        content: 'Housel documents how a tiny number of events produce the vast majority of outcomes — in investing, in business, in history. Warren Buffett\'s wealth comes from a handful of exceptional holdings. Most venture funds\' returns come from one or two investments. For traders, this means your best trades will account for most of your annual P&L. Everything else is practice.',
      },
      {
        title: 'Compounding Requires Endurance',
        content: 'The paradox of compounding: the greatest returns come from the longest holding periods — but the longest holding periods require surviving recessions, crashes, personal crises, and the psychological agony of watching a position decline 40% before recovering. Housel\'s point is that endurance — not intelligence — is the rarest and most valuable financial skill. The investor who stays invested through chaos beats the one who optimises entry and exit points.',
      },
      {
        title: 'Everyone Has a Different Story',
        content: 'Housel makes a point that sounds simple but has deep consequences: everyone\'s financial decisions are based on their unique personal history with money. Someone who grew up during a recession approaches risk differently from someone who grew up in a bull market. Someone who lived through the 2008 crash learned different lessons from it depending on whether they were a homeowner or a renter. Before judging anyone else\'s financial decisions, understand their story.',
      },
    ],
    lessons: [
      { num: '01', title: 'The ability to hold through volatility is worth more than strategy', body: 'The best investment returns belong to people who don\'t sell during panics. Not because they\'re smarter — because they\'re more patient and more secure. Volatility is the price of admission for returns. If you can\'t stomach 30% drawdowns psychologically, no strategy will save you.' },
      { num: '02', title: 'Build in a margin of safety for everything', body: 'Housel describes how the engineers of the Golden Gate Bridge built it to hold far more weight than they ever expected it to carry. Apply this to trading: never be in a position where a single bad sequence of events ends your ability to trade. Keep reserves. Limit max loss. Assume the unexpected will happen — because it will.' },
      { num: '03', title: 'Redefine risk as "what ends the game"', body: 'Housel\'s definition of risk is anything that forces you to stop. Volatility is not risk if you can hold through it. A 30% drawdown is not risk if you have the psychological and financial resources to wait. Risk is whatever makes you exit at the worst possible time — and that\'s usually debt, leverage, or emotional fragility.' },
      { num: '04', title: 'Be suspicious of confidence', body: 'Every financial disaster in history was preceded by enormous confidence. The people who blow up are usually the ones who are most certain. Housel argues for what he calls "room for error" — having enough buffer that you can be wrong and still survive. Overconfidence and undersized buffers are the combination that creates catastrophe.' },
      { num: '05', title: 'Know why you\'re doing this', body: 'Housel asks: what is enough? Most people don\'t know. Without a clear answer, the goalposts keep moving — more profit, more size, more risk. Knowing what "enough" looks like for you prevents the dangerous expansion of appetite that causes otherwise successful people to keep pushing until they lose everything.' },
    ],
    quotes: [
      { text: 'The ability to do what you want, when you want, with who you want, for as long as you want, is priceless. It is the highest dividend money pays.', context: 'On financial freedom as the real goal' },
      { text: 'Getting money requires taking risks, being optimistic, and putting yourself out there. But keeping money requires the opposite of taking risk. It requires humility.', context: 'On the tension between getting and staying wealthy' },
      { text: 'The most important financial skill is getting the goalpost to stop moving.', context: 'On the danger of unchecked ambition' },
    ],
    whoShouldRead: 'Everyone. But especially traders who are technically proficient but financially reckless — who make money and give it back, who know the rules but can\'t follow them, who optimise strategy but ignore the psychological infrastructure that strategy requires. Read this before you read any other finance book.',
    tldr: 'Financial success is less about intelligence and more about behaviour. The investor who stays invested through chaos, never runs out of runway, and has defined what "enough" means will beat the brilliant trader who keeps blowing up — every single time.',
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
