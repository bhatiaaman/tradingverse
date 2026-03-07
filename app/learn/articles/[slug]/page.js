import Link from 'next/link'
import { notFound } from 'next/navigation'
import Nav from '../../../components/Nav'

const ARTICLES = {
  'trader-who-knew-everything': {
    tag: 'Market Psychology',
    tagColor: 'text-cyan-400',
    title: 'The trader who knew everything but lost anyway',
    readTime: '6 min',
    publishDate: 'February 2025',
    intro: 'He had three monitors, eleven indicators, and a 47-page trading plan. He lost money every month for two years. Here\'s what went wrong.',
    body: [
      {
        type: 'p',
        content: 'I\'ll call him Rahul. He was an engineer — meticulous, systematic, detail-obsessed in exactly the way you\'d want in a professional. He had spent three years studying markets before putting in real capital. He could explain Elliott Wave, Wyckoff accumulation, and market microstructure in the same breath. He had read more trading books than most people know exist.',
      },
      {
        type: 'p',
        content: 'He lost money every month for two years.',
      },
      {
        type: 'h2',
        content: 'The knowledge trap',
      },
      {
        type: 'p',
        content: 'The problem wasn\'t that Rahul didn\'t know enough. The problem was that he had confused knowing with performing. These are not the same thing. A surgeon who has read every textbook on appendectomies but never held a scalpel is not ready to operate. Knowing is the prerequisite. Performing is the skill.',
      },
      {
        type: 'p',
        content: 'Trading is a performance discipline. Like music, like sport, like surgery — the knowledge is necessary but insufficient. The gap between knowing and doing is where most traders spend their entire career.',
      },
      {
        type: 'h2',
        content: 'What his journals revealed',
      },
      {
        type: 'p',
        content: 'When I reviewed Rahul\'s trade journal, the pattern was obvious: he followed his system beautifully in paper trades. He violated it consistently in live trades. Not randomly — systematically. He always held losers too long. He always exited winners too early. He always added to losing positions when the setup "still looked good."',
      },
      {
        type: 'p',
        content: 'These weren\'t knowledge failures. He knew exactly what he was doing wrong, in real time. He watched himself break his rules and felt powerless to stop it.',
      },
      {
        type: 'h2',
        content: 'The fix that actually worked',
      },
      {
        type: 'p',
        content: 'Rahul stopped adding new knowledge. Instead, he spent 30 days doing one thing: placing only trades where he had pre-set hard stops, with position sizes so small the loss was emotionally irrelevant. He focused entirely on process — not P&L. Not market calls. Just: did I follow my rules today?',
      },
      {
        type: 'p',
        content: 'In month two, he increased size slightly. By month four, he was trading at his intended size — and for the first time, he was consistently profitable. Not because he learned anything new. Because he finally closed the gap between knowing and doing.',
      },
      {
        type: 'callout',
        content: 'The most dangerous trader is one who has studied enough to be confident but hasn\'t traded enough to be humble. Knowledge without reps builds false certainty. Real edge is earned in the market, not in books.',
      },
    ],
  },
  'why-breakouts-fail': {
    tag: 'Price Action',
    tagColor: 'text-blue-400',
    title: 'Why most breakout trades fail',
    readTime: '8 min',
    publishDate: 'January 2025',
    intro: 'The breakout is the most popular setup in retail trading. It\'s also where smart money hunts retail traders for liquidity. Here\'s what\'s actually happening.',
    body: [
      {
        type: 'p',
        content: 'Every trader has had this experience: you see price approach a clean resistance level. Volume starts picking up. You enter the breakout. Price moves two points above resistance — then reverses violently, stops you out, and continues lower. You look back at the chart and the reversal makes no sense.',
      },
      {
        type: 'p',
        content: 'It makes perfect sense — just not for the reasons you were watching.',
      },
      {
        type: 'h2',
        content: 'Where retail traders cluster',
      },
      {
        type: 'p',
        content: 'Round numbers, obvious support/resistance levels, and prior highs are where retail stops and orders cluster. This isn\'t a secret — market makers and institutional participants know it too. They\'re watching the same charts. The difference is what they do with that information.',
      },
      {
        type: 'p',
        content: 'A breakout above obvious resistance triggers two things simultaneously: breakout buyers entering long, and trapped shorts covering. This creates a momentary surge of buying that temporarily pushes price above resistance — before reversing once that buying is exhausted.',
      },
      {
        type: 'h2',
        content: 'The liquidity hunt',
      },
      {
        type: 'p',
        content: 'Institutional traders need to buy large quantities without moving the market against themselves. They need sellers. The best place to find concentrated sellers is just above a well-known resistance level — where retail breakout traders will sell to cut losses, and where new shorts will enter on the failed breakout. This is manufactured liquidity.',
      },
      {
        type: 'h2',
        content: 'The setups that actually work',
      },
      {
        type: 'p',
        content: 'Real breakouts — the ones that run — almost always look wrong initially. They start with low volume, a choppy, unconvincing push, then a sudden expansion. The "obvious" breakout with high volume on the initial push is often the trap. The one that grinds through resistance with little fanfare is often the real move.',
      },
      {
        type: 'callout',
        content: 'Rule of thumb: if the breakout looks so clean and obvious that you feel excited, be careful. The best trades rarely feel like obvious gifts. They feel uncertain — because the smart money is still accumulating, not distributing.',
      },
    ],
  },
  'revenge-trade-trap': {
    tag: 'Risk Management',
    tagColor: 'text-rose-400',
    title: 'The revenge trade trap — and how to escape it',
    readTime: '5 min',
    publishDate: 'December 2024',
    intro: 'You just took a painful loss. Every instinct says to get it back immediately. That instinct has destroyed more trading accounts than any bad strategy.',
    body: [
      {
        type: 'p',
        content: 'The loss happened fast. Maybe it was a stop-out on a setup you liked. Maybe the market gapped against you. The specific mechanism doesn\'t matter. What matters is what happens in the sixty seconds after the loss is realized.',
      },
      {
        type: 'p',
        content: 'For most traders, the brain enters a state that psychologists call "loss aversion arousal." The need to recover the loss becomes urgent, almost physical. The idea of ending the session down feels intolerable. And so: the revenge trade.',
      },
      {
        type: 'h2',
        content: 'Why revenge trades always make it worse',
      },
      {
        type: 'p',
        content: 'The revenge trade is never based on a setup. It\'s based on a feeling — the feeling that you\'re owed a recovery, that the market has been unfair, that if you can just get back to flat, everything will be okay. This is not a trading decision. It is an emotional reaction masquerading as a trading decision.',
      },
      {
        type: 'p',
        content: 'The consequences compound: the revenge trade typically involves larger size (to recover faster), worse risk management (because you\'re not thinking clearly), and a worse entry (because you\'re chasing). Three strikes. The second loss is usually larger than the first.',
      },
      {
        type: 'h2',
        content: 'The circuit breaker',
      },
      {
        type: 'p',
        content: 'The most effective technique is physical: stand up, walk away from the screen for a minimum of 15 minutes. Not to think about the trade — to let the emotional response metabolize. The neurological hijack that produces revenge trading has a half-life. It diminishes with time, not with thinking.',
      },
      {
        type: 'callout',
        content: 'A rule worth keeping: after any loss that produces an emotional reaction, you are not allowed to trade for 30 minutes. Write it in your trading plan. The cost of those 30 minutes of inaction is zero compared to the cost of what comes next if you don\'t take them.',
      },
    ],
  },
  'post-trade-review': {
    tag: 'Trade Review',
    tagColor: 'text-emerald-400',
    title: 'Post-trade review: the habit that separates pros',
    readTime: '7 min',
    publishDate: 'November 2024',
    intro: 'Every professional athlete reviews their performance. Almost no retail traders do. This habit alone can compound your edge faster than any new strategy.',
    body: [
      {
        type: 'p',
        content: 'The professional tennis player watches film of their last match — not because they don\'t know how to play tennis, but because the heat of competition makes accurate self-perception impossible. You cannot simultaneously be inside the experience and observe it clearly. Review creates distance. Distance creates learning.',
      },
      {
        type: 'p',
        content: 'Trading is identical. In the moment, your perception of why you made a decision is colored by emotion, rationalization, and time pressure. After the session, with the outcome known and the adrenaline gone, you can see clearly.',
      },
      {
        type: 'h2',
        content: 'What to review — and what to ignore',
      },
      {
        type: 'p',
        content: 'Most traders, when they do review trades, focus on outcome: "Did this trade make money?" This is almost useless. A trade that followed your rules perfectly but lost is a good trade. A trade that broke your rules and happened to win is a bad trade. The outcome is noise; the process is signal.',
      },
      {
        type: 'p',
        content: 'What to ask after every session: Did I follow my rules on every trade? Where did I deviate, and why? What was my emotional state at the point of deviation? What would I do differently if this exact setup appeared tomorrow?',
      },
      {
        type: 'h2',
        content: 'The 10-minute debrief protocol',
      },
      {
        type: 'p',
        content: 'After the market closes, take 10 minutes. Write — don\'t just think, write — three things: what you did well today, what you would do differently, and one specific focus for tomorrow\'s session. This takes less time than one revenge trade and compounds faster than any strategy upgrade.',
      },
      {
        type: 'callout',
        content: 'The traders who improve fastest are not the ones who study the most market theory. They are the ones who study themselves most rigorously. Your journal is your edge development system. Use it like one.',
      },
    ],
  },
}

export async function generateStaticParams() {
  return Object.keys(ARTICLES).map(slug => ({ slug }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const article = ARTICLES[slug]
  if (!article) return { title: 'Article Not Found' }
  return {
    title: `${article.title} | TradingVerse`,
    description: article.intro,
  }
}

export default async function ArticlePage({ params }) {
  const { slug } = await params
  const article = ARTICLES[slug]
  if (!article) notFound()

  return (
    <div className="min-h-screen bg-[#060b14] text-white">

      <Nav />

      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-3 mb-10">
          <Link href="/learn" className="text-slate-600 text-sm hover:text-slate-400 transition-colors">Learn</Link>
          <span className="text-slate-800">/</span>
          <Link href="/learn" className="text-slate-600 text-sm hover:text-slate-400 transition-colors">Articles</Link>
          <span className="text-slate-800">/</span>
          <span className="text-slate-600 text-sm truncate">{article.title}</span>
        </div>

        {/* Header */}
        <header className="mb-14">
          <div className="flex items-center gap-3 mb-5">
            <span className={`text-[10px] font-bold tracking-widest uppercase ${article.tagColor}`}>{article.tag}</span>
            <span className="text-slate-700 text-xs">·</span>
            <span className="text-slate-600 text-xs">{article.readTime} read</span>
            <span className="text-slate-700 text-xs">·</span>
            <span className="text-slate-600 text-xs">{article.publishDate}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-6 leading-tight">{article.title}</h1>
          <p className="text-slate-300 text-xl leading-9 font-medium">{article.intro}</p>
        </header>

        {/* Body */}
        <article className="space-y-6">
          {article.body.map((block, i) => {
            if (block.type === 'p') {
              return (
                <p key={i} className="text-slate-300 text-base leading-8">
                  {block.content}
                </p>
              )
            }
            if (block.type === 'h2') {
              return (
                <h2 key={i} className="text-white text-2xl font-bold mt-12 mb-2">
                  {block.content}
                </h2>
              )
            }
            if (block.type === 'callout') {
              return (
                <div key={i} className="my-10 p-6 rounded-2xl border border-blue-900/50 bg-blue-950/20">
                  <p className="text-blue-200 text-base leading-8 font-medium">{block.content}</p>
                </div>
              )
            }
            return null
          })}
        </article>

        {/* Footer nav */}
        <div className="flex items-center justify-between mt-20 pt-8 border-t border-white/5">
          <Link href="/learn" className="text-slate-400 hover:text-white text-sm font-semibold transition-colors">
            ← All Articles
          </Link>
          <Link href="/learn" className="text-blue-400 hover:text-blue-300 text-sm font-semibold transition-colors">
            Browse Books →
          </Link>
        </div>
      </div>
    </div>
  )
}
