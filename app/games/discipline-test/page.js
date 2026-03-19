'use client'

import { useState } from 'react'
import Link from 'next/link'
import Nav from '../../components/Nav'

const SCENARIOS = [
  {
    id: 1,
    phase: 'In Trade',
    title: 'The Stop Is Calling',
    situation: `You shorted NIFTY at 23,400 with a stop at 23,450 (+50 pts). Price moved to 23,435 — just 15 points from your stop — and formed a small green candle. Your P&L shows −₹4,500 right now.`,
    question: 'What do you do?',
    choices: [
      { text: 'Hold. My stop is at 23,450. Price hasn\'t hit it yet.', disciplined: true },
      { text: 'Move stop to 23,490 to give it more room. It looks like it wants to reverse.', disciplined: false },
    ],
    lesson: 'Moving stop losses is the #1 account killer. Your stop was placed at a technically meaningful level. Widening it converts small losses into large ones — one trade at a time.',
    concept: 'Honour your stop loss',
    wrongWarning: 'You widened your stop.',
  },
  {
    id: 2,
    phase: 'Managing Winner',
    title: 'Good Enough?',
    situation: `Your plan: enter BANKNIFTY long at 45,000, stop at 44,800 (−200 pts), target 45,400 (+400 pts) → 2:1 R:R. Trade is now at 45,320 — 80% of the way to target — with 20 minutes left in the session.`,
    question: 'What do you do?',
    choices: [
      { text: 'Exit now at 45,320. I\'ve captured most of the move.', disciplined: false },
      { text: 'Hold to my target at 45,400. The plan said 45,400.', disciplined: true },
    ],
    lesson: 'Exiting at 80% of target feels safe but systematically destroys your R:R. If you do this every trade, your average winner shrinks while your average loser stays full-sized.',
    concept: 'Let winners reach their target',
    wrongWarning: 'You cut the winner early.',
  },
  {
    id: 3,
    phase: 'After Losses',
    title: 'Revenge Setup',
    situation: `Three losses in a row. Total drawdown today: ₹9,000 (3 × ₹3,000 risk). A valid setup matching your criteria just appeared. You'd planned to risk ₹3,000 per trade.`,
    question: 'How much do you risk on this trade?',
    choices: [
      { text: '₹3,000 — same as always. A setup is a setup.', disciplined: true },
      { text: '₹9,000 — need to recover today\'s losses in one go.', disciplined: false },
    ],
    lesson: 'Tripling size to recover losses is a direct emotional response — not a trading decision. If this trade also loses, you\'re now down ₹18,000. Consistent sizing is what lets your edge play out.',
    concept: 'Consistent position sizing',
    wrongWarning: 'You sized up to recover losses.',
  },
  {
    id: 4,
    phase: 'Entry',
    title: 'You Missed It',
    situation: `Your setup triggered at NIFTY 23,200 but you hesitated. Price is now at 23,255 — 55 points past your planned entry — and clearly moving. Your stop would have been 23,150 (−50 pts from entry), giving 2:1 R:R.`,
    question: 'What do you do?',
    choices: [
      { text: 'Enter at market now. Don\'t miss the whole move.', disciplined: false },
      { text: 'Skip it. At 23,255, the R:R no longer meets my criteria.', disciplined: true },
    ],
    lesson: 'At 23,255 with stop at 23,150, you\'re risking 105 points for a target that\'s now much smaller — a completely different trade. Chasing entries is how traders override their own edge.',
    concept: 'No chasing — discipline over FOMO',
    wrongWarning: 'You chased the entry.',
  },
  {
    id: 5,
    phase: 'Setup Evaluation',
    title: 'Fear After Losses',
    situation: `You've had 3 consecutive losses this week (all valid setups, just didn't work). Today a new setup appears that perfectly matches your criteria — right price, right structure, right volume.`,
    question: 'What do you do?',
    choices: [
      { text: 'Skip it. I\'m on a losing streak and need a break.', disciplined: false },
      { text: 'Take it. My edge doesn\'t change because of recent outcomes.', disciplined: true },
    ],
    lesson: 'Skipping valid setups after losses is fear-of-loss in action. Each trade is an independent event. Your edge doesn\'t know what happened in the last 3 trades — and neither should your decision-making.',
    concept: 'Each trade is independent',
    wrongWarning: 'You let recent losses override your process.',
  },
  {
    id: 6,
    phase: 'Losing Position',
    title: 'It\'ll Come Back',
    situation: `You bought RELIANCE at ₹1,450 with a stop at ₹1,420. Price has broken ₹1,420 and is now at ₹1,415. Your stop got triggered, but your finger is hovering over the "cancel stop" button. "It's near strong support."`,
    question: 'What do you do?',
    choices: [
      { text: 'Cancel the stop. It\'s at strong support — it\'ll bounce.', disciplined: false },
      { text: 'Let the stop execute. I placed it there for a reason.', disciplined: true },
    ],
    lesson: '"It\'ll come back" has wiped out more accounts than any other thought in trading. Your stop was placed before emotion entered. Trust the pre-trade you over the in-trade you.',
    concept: 'Execute your stop — no exceptions',
    wrongWarning: 'You held past your stop.',
  },
  {
    id: 7,
    phase: 'Adding to Position',
    title: 'Average Down?',
    situation: `You bought HDFCBANK at ₹1,600. It's now at ₹1,560 — ₹40 against you. Your stop is ₹1,540. A colleague says: "It's even cheaper now — great time to add more."`,
    question: 'What do you do?',
    choices: [
      { text: 'Buy more at ₹1,560 to average down my cost.', disciplined: false },
      { text: 'Hold the original position. No adding to losers.', disciplined: true },
    ],
    lesson: 'Averaging down is adding size to a trade that is proving you wrong. You\'re increasing exposure on a position the market is rejecting. Add to winners, not losers.',
    concept: 'Never average down on losers',
    wrongWarning: 'You averaged down.',
  },
  {
    id: 8,
    phase: 'Overtrading',
    title: 'One More Trade',
    situation: `You've already hit your daily target — ₹8,000 profit, 3 clean trades. It's 2:30 PM. Market is slow and choppy. You're bored. You spot a mediocre setup that "sort of" fits your criteria.`,
    question: 'What do you do?',
    choices: [
      { text: 'Take it. Still 1 hour left. Could add to the day\'s profit.', disciplined: false },
      { text: 'Close the terminal. Target is hit. No trading in choppy conditions.', disciplined: true },
    ],
    lesson: 'Boredom is one of the most dangerous emotions in trading. Most profitable traders have a daily stop-loss AND a daily profit target. Hitting target means stopping — not finding reasons to keep going.',
    concept: 'Know when to stop trading',
    wrongWarning: 'You traded out of boredom.',
  },
  {
    id: 9,
    phase: 'News Event',
    title: 'Headline Risk',
    situation: `You\'re long NIFTY from 23,300, stop at 23,250. A bearish headline drops: "FII outflows spike." NIFTY dips 20 points to 23,280 — still 30 points above your stop. The dip is recovering.`,
    question: 'What do you do?',
    choices: [
      { text: 'Exit immediately. Bearish news = exit long.', disciplined: false },
      { text: 'Hold. My stop is 23,250. Price hasn\'t hit it — and is recovering.', disciplined: true },
    ],
    lesson: 'Reacting to every headline is noise trading. Your stop is your risk manager — not the news ticker. If the thesis truly changes fundamentally, reassess. But one headline during a live trade is usually noise.',
    concept: 'Trade your plan, not the news',
    wrongWarning: 'You exited on noise before your stop.',
  },
  {
    id: 10,
    phase: 'Winning Streak',
    title: 'I\'m On Fire',
    situation: `Five wins in a row. You\'re up ₹25,000 this week — best week ever. You feel invincible. A setup appears. Your normal risk is ₹3,000 per trade.`,
    question: 'How much do you risk?',
    choices: [
      { text: '₹10,000 — I\'m on a hot streak. Maximize it.', disciplined: false },
      { text: '₹3,000 — same as always. The streak changes nothing.', disciplined: true },
    ],
    lesson: 'Overconfidence after wins is as dangerous as revenge after losses. The market doesn\'t know or care about your streak. Size stays consistent — that\'s what "having an edge" means.',
    concept: 'Consistency after wins too',
    wrongWarning: 'You oversized on a winning streak.',
  },
]

const SCORE_LABEL = s => {
  if (s === 10) return { label: 'Iron Discipline', color: 'text-green-400', desc: 'Perfect score. You think in probabilities and execute without hesitation. This is what Trading in the Zone looks like.' }
  if (s >= 8)  return { label: 'Strong Trader', color: 'text-emerald-400', desc: 'You have the right instincts on most situations. A couple of emotional decisions slipped through — identify which ones and drill them.' }
  if (s >= 6)  return { label: 'Work in Progress', color: 'text-amber-400', desc: 'Your discipline holds in easy situations but breaks under pressure. The wrong answers reveal your specific emotional patterns.' }
  if (s >= 4)  return { label: 'Emotional Trader', color: 'text-orange-400', desc: 'You know the rules but don\'t follow them when it matters. This gap between knowledge and execution is what Trading in the Zone is about.' }
  return        { label: 'Needs Reset', color: 'text-red-400', desc: 'Fear and hope are running your trades, not your rules. The good news: this is fixable — with awareness and deliberate practice.' }
}

function AnswerDot({ disciplined, chosen }) {
  const correct = disciplined === chosen
  return (
    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
      correct ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
    }`}>
      {correct ? '✓' : '✗'}
    </div>
  )
}

export default function DisciplineTest() {
  const [phase,    setPhase]    = useState('intro')   // intro | playing | done
  const [current,  setCurrent]  = useState(0)
  const [answers,  setAnswers]  = useState([])         // array of { chosen: bool (disciplined?), scenario }
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState(null)       // index of selected choice

  const scenario = SCENARIOS[current]
  const score    = answers.filter(a => a.correct).length

  const choose = (idx) => {
    if (revealed) return
    setSelected(idx)
    setRevealed(true)
  }

  const next = () => {
    const correct = SCENARIOS[current].choices[selected].disciplined
    setAnswers(prev => [...prev, { correct, scenario: SCENARIOS[current], selectedIdx: selected }])
    setRevealed(false)
    setSelected(null)
    if (current + 1 >= SCENARIOS.length) {
      setCurrent(0)
      setPhase('done')
    } else {
      setCurrent(c => c + 1)
    }
  }

  const restart = () => {
    setPhase('intro')
    setCurrent(0)
    setAnswers([])
    setRevealed(false)
    setSelected(null)
  }

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div className="min-h-screen bg-[#060b14] text-white">
        <Nav />
        <div className="max-w-lg mx-auto px-6 py-14">
          <Link href="/games" className="text-xs text-slate-500 hover:text-white transition-colors mb-8 inline-block">
            ← Back to Games
          </Link>

          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-purple-400 mb-3">Trading in the Zone · Game 2</div>
          <h1 className="text-4xl font-black mb-3 leading-tight">The Discipline<br/>Test</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            10 real trading situations. Each one has an emotional response and a disciplined one.
            Your score reveals your specific psychological patterns — the exact gaps between
            what you know and what you actually do under pressure.
          </p>

          <div className="space-y-3 mb-10">
            {[
              { icon: '🛑', text: 'Stop loss management' },
              { icon: '💰', text: 'Letting winners run vs cutting early' },
              { icon: '😤', text: 'Revenge trading & oversizing after losses' },
              { icon: '🎯', text: 'Entry discipline — no chasing' },
              { icon: '🧘', text: 'Consistency after wins AND losses' },
            ].map(item => (
              <div key={item.text} className="flex items-center gap-3 text-sm text-slate-400">
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>

          <button onClick={() => setPhase('playing')}
            className="w-full py-4 bg-purple-600 hover:bg-purple-500 font-black text-lg rounded-2xl transition-colors">
            Begin Test →
          </button>
        </div>
      </div>
    )
  }

  // ── Results ────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const result = SCORE_LABEL(score)
    const wrong  = answers.filter(a => !a.correct)

    return (
      <div className="min-h-screen bg-[#060b14] text-white">
        <Nav />
        <div className="max-w-2xl mx-auto px-6 py-14">
          <div className="text-center mb-10">
            <div className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-3">Discipline Test Complete</div>
            <div className={`text-6xl font-black mb-2 ${result.color}`}>{score} / 10</div>
            <div className={`text-xl font-bold mb-3 ${result.color}`}>{result.label}</div>
            <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">{result.desc}</p>
          </div>

          {/* Score bar */}
          <div className="h-2 bg-white/5 rounded-full mb-10 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(score / 10) * 100}%`,
                background: score >= 8 ? '#22c55e' : score >= 6 ? '#f59e0b' : '#ef4444',
              }} />
          </div>

          {/* Answer review */}
          <div className="space-y-3 mb-10">
            <div className="text-sm font-semibold text-slate-400 mb-4">All 10 Scenarios</div>
            {answers.map((a, i) => (
              <div key={i} className={`p-4 rounded-xl border ${
                a.correct
                  ? 'bg-green-500/5 border-green-500/15'
                  : 'bg-red-500/5 border-red-500/15'
              }`}>
                <div className="flex items-start gap-3">
                  <AnswerDot disciplined={true} chosen={a.correct} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-400 mb-0.5">{a.scenario.phase} · {a.scenario.concept}</div>
                    <div className="text-sm font-semibold text-white">{a.scenario.title}</div>
                    {!a.correct && (
                      <>
                        <div className="text-xs text-red-400 mt-1">✗ {a.scenario.wrongWarning}</div>
                        <div className="text-xs text-slate-500 mt-1.5 leading-relaxed">{a.scenario.lesson}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Weak areas */}
          {wrong.length > 0 && (
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/8 mb-8">
              <div className="text-sm font-bold mb-3 text-slate-300">Your Key Gaps</div>
              <ul className="space-y-2">
                {wrong.map((a, i) => (
                  <li key={i} className="text-sm text-amber-400 flex items-start gap-2">
                    <span className="mt-0.5 flex-shrink-0">→</span>
                    <span>{a.scenario.concept}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-600 mt-4">
                These are the exact patterns from <em>Trading in the Zone</em> that Mark Douglas says separate consistent traders from the rest.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Link href="/games" className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-semibold text-center hover:bg-white/5 transition-colors">
              ← All Games
            </Link>
            <button onClick={restart}
              className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition-colors">
              Retake Test
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Playing ────────────────────────────────────────────────────────────────
  const isCorrect  = revealed && scenario.choices[selected]?.disciplined === true
  const isWrong    = revealed && scenario.choices[selected]?.disciplined === false

  return (
    <div className="min-h-screen bg-[#060b14] text-white">
      <Nav />
      <div className="max-w-xl mx-auto px-6 py-10">

        {/* Progress */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/games" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">← Games</Link>
          <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${(current / SCENARIOS.length) * 100}%` }} />
          </div>
          <span className="text-xs text-slate-500 tabular-nums">{current + 1} / {SCENARIOS.length}</span>
        </div>

        {/* Score dots */}
        <div className="flex gap-1.5 mb-6">
          {SCENARIOS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${
              i < answers.length
                ? answers[i].correct ? 'bg-green-500' : 'bg-red-500'
                : i === current ? 'bg-purple-500' : 'bg-white/8'
            }`} />
          ))}
        </div>

        {/* Scenario card */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold tracking-widest uppercase text-purple-400 border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 rounded-full">
              {scenario.phase}
            </span>
            <span className="text-[10px] text-slate-500">Scenario {current + 1}</span>
          </div>
          <h2 className="text-xl font-black mb-4">{scenario.title}</h2>
          <div className="p-4 rounded-xl bg-white/[0.04] border border-white/8 text-sm text-slate-300 leading-relaxed mb-4">
            {scenario.situation}
          </div>
          <p className="text-sm font-semibold text-white">{scenario.question}</p>
        </div>

        {/* Choices */}
        <div className="space-y-3 mb-6">
          {scenario.choices.map((choice, idx) => {
            let style = 'border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/[0.02] cursor-pointer'
            if (revealed) {
              if (idx === selected) {
                style = choice.disciplined
                  ? 'border-green-500/50 bg-green-500/10 text-green-300'
                  : 'border-red-500/50 bg-red-500/10 text-red-300'
              } else if (choice.disciplined) {
                style = 'border-green-500/30 bg-green-500/5 text-green-400/60'
              } else {
                style = 'border-white/5 text-slate-600'
              }
            }
            return (
              <button key={idx} onClick={() => choose(idx)} disabled={revealed}
                className={`w-full p-4 rounded-xl border text-left text-sm leading-relaxed transition-all ${style}`}>
                <span className="font-bold mr-2 text-slate-500">{idx === 0 ? 'A' : 'B'}.</span>
                {choice.text}
                {revealed && idx === selected && (
                  <span className="ml-2">{choice.disciplined ? '✓' : '✗'}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Feedback */}
        {revealed && (
          <div className={`p-4 rounded-xl border mb-6 text-sm leading-relaxed transition-all ${
            isCorrect
              ? 'bg-green-500/10 border-green-500/20 text-green-300'
              : 'bg-red-500/10 border-red-500/20 text-red-300'
          }`}>
            <div className="font-bold mb-1">
              {isCorrect ? '✓ Disciplined choice' : `✗ ${scenario.wrongWarning}`}
            </div>
            <p className="text-slate-400">{scenario.lesson}</p>
            <div className="mt-2 text-[11px] font-bold uppercase tracking-wider opacity-60">
              Principle: {scenario.concept}
            </div>
          </div>
        )}

        {/* Next button */}
        {revealed && (
          <button onClick={next}
            className="w-full py-4 bg-purple-600 hover:bg-purple-500 font-black text-base rounded-2xl transition-colors">
            {current + 1 >= SCENARIOS.length ? 'See Results →' : 'Next Scenario →'}
          </button>
        )}
      </div>
    </div>
  )
}
