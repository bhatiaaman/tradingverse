'use client'

import { useState } from 'react'
import Link from 'next/link'
import Nav from '../../components/Nav'

// Full-width SVG chart — supports reveal candles shown after answer
function Chart({ candles, revealCandles = [], showReveal = false }) {
  const all    = showReveal ? [...candles, ...revealCandles] : candles
  const W = 480, H = 130, pad = 14
  const prices = all.flatMap(c => [c.h, c.l])
  const min    = Math.min(...prices) * 0.9985
  const max    = Math.max(...prices) * 1.0015
  const total  = candles.length + (showReveal ? revealCandles.length : 0)
  const cw     = (W - pad * 2) / Math.max(total, 20)

  const scaleY = v => H - pad - ((v - min) / (max - min)) * (H - pad * 2)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 rounded-xl bg-slate-900/70 mb-2">
      {candles.map((c, i) => {
        const x   = pad + i * cw + cw * 0.1
        const w   = cw * 0.8
        const isUp = c.c >= c.o
        const col  = isUp ? '#34d399' : '#f87171'
        const bodyTop = scaleY(Math.max(c.o, c.c))
        const bodyH   = Math.max(1.5, Math.abs(scaleY(c.o) - scaleY(c.c)))
        const mid = x + w / 2
        return (
          <g key={i}>
            <line x1={mid} y1={scaleY(c.h)} x2={mid} y2={scaleY(c.l)} stroke={col} strokeWidth={1} />
            <rect x={x} y={bodyTop} width={w} height={bodyH} fill={col} rx={0.8} />
          </g>
        )
      })}

      {/* Question mark at end of known data */}
      {!showReveal && (
        <text
          x={pad + candles.length * cw + cw * 0.4}
          y={H / 2 + 5}
          fontSize="14"
          fill="#64748b"
          fontWeight="bold"
        >?</text>
      )}

      {/* Reveal candles — amber/teal tint to distinguish */}
      {showReveal && revealCandles.map((c, i) => {
        const idx = candles.length + i
        const x   = pad + idx * cw + cw * 0.1
        const w   = cw * 0.8
        const isUp = c.c >= c.o
        const col  = isUp ? '#2dd4bf' : '#fb923c'
        const bodyTop = scaleY(Math.max(c.o, c.c))
        const bodyH   = Math.max(1.5, Math.abs(scaleY(c.o) - scaleY(c.c)))
        const mid = x + w / 2
        return (
          <g key={'r' + i}>
            <line x1={mid} y1={scaleY(c.h)} x2={mid} y2={scaleY(c.l)} stroke={col} strokeWidth={1} opacity={0.9} />
            <rect x={x} y={bodyTop} width={w} height={bodyH} fill={col} rx={0.8} opacity={0.9} />
          </g>
        )
      })}

      {/* Divider line between known and reveal */}
      {showReveal && (
        <line
          x1={pad + candles.length * cw}
          y1={pad / 2}
          x2={pad + candles.length * cw}
          y2={H - pad / 2}
          stroke="#475569"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      )}
    </svg>
  )
}

const SCENARIOS = [
  {
    date: '23 March 2020',
    time: '11:45 AM',
    event: 'COVID Crash — Day 19 of selloff',
    context: 'Nifty had fallen 38% in 19 trading days. Circuit breakers triggered the previous day. Global markets in freefall.',
    candles: [
      {o:8200,c:8050,h:8280,l:7950},{o:8050,c:7900,h:8100,l:7820},{o:7900,c:7700,h:7950,l:7650},
      {o:7700,c:7580,h:7750,l:7511},{o:7580,c:7520,h:7650,l:7490},{o:7520,c:7480,h:7600,l:7450},
      {o:7480,c:7510,h:7560,l:7440},{o:7510,c:7600,h:7650,l:7490},{o:7600,c:7750,h:7800,l:7580},
      {o:7750,c:7820,h:7900,l:7720},{o:7820,c:7950,h:8000,l:7800},{o:7950,c:8100,h:8150,l:7920},
    ],
    revealCandles: [
      {o:8100,c:8350,h:8420,l:8080},{o:8350,c:8600,h:8650,l:8300},{o:8600,c:8900,h:8950,l:8550},
      {o:8900,c:9100,h:9180,l:8850},{o:9100,c:9350,h:9400,l:9050},
    ],
    question: 'Nifty hit 7,511 — a 12-year low. It\'s been selling for 19 straight days. The last few candles show some stabilization. What is the most probable next move?',
    options: [
      { id: 'a', text: 'Further crash — COVID situation has no end in sight' },
      { id: 'b', text: 'Dead cat bounce, then lower lows' },
      { id: 'c', text: 'The bottom is in — expect a sharp reversal rally' },
      { id: 'd', text: 'Sideways consolidation for weeks before direction' },
    ],
    answer: 'c',
    explanation: 'March 23, 2020 was the exact COVID bottom. Within 3 days, Nifty was up 20%. Within 6 months, it recovered fully. The clues: 19 days of uninterrupted selling, stabilizing candles, global coordinated stimulus incoming. Extreme fear at a round number support often marks the bottom.',
    outcome: 'Nifty rallied 20% in the next 3 sessions. By August 2020, it had recovered all losses.',
  },
  {
    date: '4 June 2024',
    time: '9:20 AM',
    event: 'India General Election Results Day',
    context: 'Exit polls had predicted a massive BJP majority (350+ seats). Markets gapped up 3% at open. Results are being counted live.',
    candles: [
      {o:23200,c:23550,h:23650,l:23100},{o:23550,c:23800,h:23900,l:23500},{o:23800,c:23600,h:23900,l:23500},
      {o:23600,c:23300,h:23650,l:23200},{o:23300,c:23000,h:23350,l:22800},{o:23000,c:22600,h:23050,l:22500},
      {o:22600,c:22200,h:22700,l:22050},{o:22200,c:21900,h:22300,l:21700},{o:21900,c:21700,h:22050,l:21550},
      {o:21700,c:21500,h:21800,l:21350},{o:21500,c:21650,h:21750,l:21400},{o:21650,c:21800,h:21900,l:21550},
    ],
    revealCandles: [
      {o:21800,c:22100,h:22200,l:21700},{o:22100,c:22400,h:22500,l:22000},{o:22400,c:22700,h:22800,l:22300},
      {o:22700,c:23000,h:23100,l:22600},{o:23000,c:23200,h:23300,l:22900},
    ],
    question: 'Exit polls predicted 350+ seats for BJP. Markets gapped up 3% at open. But actual results show only 240 seats — no majority alone. The market has crashed 9% from the open high. What happens next?',
    options: [
      { id: 'a', text: 'Further crash — coalition government seen as unstable' },
      { id: 'b', text: 'Stabilize and gradually recover — government will form' },
      { id: 'c', text: 'Immediate full recovery to pre-result levels' },
      { id: 'd', text: 'Sideways for months — political uncertainty' },
    ],
    answer: 'b',
    explanation: 'After the shock selling, markets recognized that a coalition NDA government was still stable and reform-oriented. The initial panic was an overreaction to the exit poll miss. Over the next 2 weeks, Nifty recovered most of the losses as the government formation clarified.',
    outcome: 'Nifty recovered from 21,500 to 23,000+ over the next 2 weeks as government stability was confirmed.',
  },
  {
    date: '1 February 2023',
    time: '11:00 AM',
    event: 'Union Budget Day — Post-announcement',
    context: 'Finance Minister announced the budget. Capital gains tax structure changed. Markets initially rallied on capex boost, then reversed.',
    candles: [
      {o:17600,c:17750,h:17820,l:17550},{o:17750,c:17900,h:17980,l:17700},{o:17900,c:18050,h:18120,l:17850},
      {o:18050,c:18200,h:18280,l:18000},{o:18200,c:18100,h:18250,l:18000},{o:18100,c:17900,h:18150,l:17820},
      {o:17900,c:17700,h:17950,l:17650},{o:17700,c:17550,h:17780,l:17480},{o:17550,c:17450,h:17620,l:17380},
      {o:17450,c:17380,h:17520,l:17300},{o:17380,c:17420,h:17500,l:17300},{o:17420,c:17500,h:17560,l:17380},
    ],
    revealCandles: [
      {o:17500,c:17650,h:17720,l:17460},{o:17650,c:17800,h:17880,l:17600},{o:17800,c:17950,h:18020,l:17750},
      {o:17950,c:18050,h:18120,l:17900},{o:18050,c:18150,h:18200,l:18000},
    ],
    question: 'Budget announced positive capex boost. Markets initially rallied to 18,200 but have since reversed hard. Nifty is now down 5% from the day\'s high. What is the likely direction?',
    options: [
      { id: 'a', text: 'Continue falling — budget disappointment will weigh for days' },
      { id: 'b', text: 'Stabilize and recover — the fundamentals are still good' },
      { id: 'c', text: 'Crash further — capital gains change is very bearish' },
      { id: 'd', text: 'Gap up strongly the next morning' },
    ],
    answer: 'b',
    explanation: '"Buy the rumour, sell the news" played out perfectly. The initial sell-off after the high was profit-booking. The budget\'s capex boost was genuinely positive. Markets typically find footing within 2-3 days after budget volatility as the dust settles and institutional money re-evaluates.',
    outcome: 'Nifty recovered from 17,400 to 18,150+ over the next 5 sessions.',
  },
  {
    date: '27 September 2024',
    time: '2:15 PM',
    event: 'Nifty All-Time High Break — 26,000',
    context: 'Nifty crossed 26,000 for the first time. FIIs have been net buyers for 8 consecutive days. Global cues are positive.',
    candles: [
      {o:25400,c:25550,h:25620,l:25350},{o:25550,c:25700,h:25780,l:25500},{o:25700,c:25800,h:25880,l:25650},
      {o:25800,c:25900,h:25980,l:25750},{o:25900,c:26050,h:26120,l:25850},{o:26050,c:26100,h:26180,l:26000},
      {o:26100,c:26050,h:26200,l:25980},{o:26050,c:26000,h:26120,l:25920},{o:26000,c:25900,h:26050,l:25850},
      {o:25900,c:25850,h:25980,l:25780},{o:25850,c:25920,h:26000,l:25800},{o:25920,c:26000,h:26080,l:25880},
    ],
    revealCandles: [
      {o:26000,c:25800,h:26050,l:25720},{o:25800,c:25600,h:25880,l:25500},{o:25600,c:25400,h:25700,l:25300},
      {o:25400,c:25250,h:25500,l:25100},{o:25250,c:25100,h:25350,l:24950},
    ],
    question: 'Nifty crossed 26,000 for the first time. After the initial euphoria, it is now consolidating just below the level. FIIs buying for 8 days. What happens next?',
    options: [
      { id: 'a', text: 'Strong continuation — ATH breakouts always run further' },
      { id: 'b', text: 'Sharp correction — "sell the ATH" is a classic pattern' },
      { id: 'c', text: 'Sideways range between 25,800-26,200 for weeks' },
      { id: 'd', text: 'Small dip then recovery to new highs' },
    ],
    answer: 'b',
    explanation: 'ATH breakouts are exciting but often mark short-term distribution. After 8 days of FII buying and a 5% rally, profit-booking was inevitable. Nifty fell nearly 1,000 points over the next 2 weeks before recovering. The signal: consolidation with narrowing candles just below ATH after an extended run is often a distribution pattern.',
    outcome: 'Nifty corrected from 26,000 to ~25,000 over the next 2 weeks before recovering.',
  },
  {
    date: '19 October 2022',
    time: '10:30 AM',
    event: 'FII Reversal — End of 6-Month Selloff',
    context: 'FIIs had sold ₹2.8 lakh crore over 6 months. Rising US rates drove continuous outflows. But the last 3 days show unusual FII buying.',
    candles: [
      {o:16800,c:16950,h:17050,l:16750},{o:16950,c:17100,h:17180,l:16900},{o:17100,c:17050,h:17200,l:16950},
      {o:17050,c:17200,h:17280,l:17000},{o:17200,c:17350,h:17420,l:17150},{o:17350,c:17300,h:17420,l:17200},
      {o:17300,c:17450,h:17520,l:17250},{o:17450,c:17550,h:17620,l:17400},{o:17550,c:17650,h:17720,l:17500},
      {o:17650,c:17600,h:17720,l:17520},{o:17600,c:17700,h:17780,l:17550},{o:17700,c:17800,h:17860,l:17650},
    ],
    revealCandles: [
      {o:17800,c:17950,h:18020,l:17750},{o:17950,c:18100,h:18180,l:17900},{o:18100,c:18250,h:18320,l:18050},
      {o:18250,c:18400,h:18480,l:18200},{o:18400,c:18600,h:18680,l:18350},
    ],
    question: 'FIIs sold ₹2.8 lakh crore over 6 months. But the last 3 days show unusual net FII buying. Nifty has made 5 consecutive higher highs and higher lows from the 15,200 low. What is the probable next move?',
    options: [
      { id: 'a', text: 'Temporary bounce — FII selling will resume' },
      { id: 'b', text: 'Major trend reversal — the bottom is in at 15,200' },
      { id: 'c', text: 'Sideways — FII reversal needs 2-3 months to confirm' },
      { id: 'd', text: 'Crash — global uncertainty still too high' },
    ],
    answer: 'b',
    explanation: 'October 2022 marked the end of the FII selling cycle. When institutions that have sold ₹2.8 lakh crore start buying back simultaneously, it signals a regime change. The combination of structural higher highs/lows + FII buying reversal after extreme selling = high-probability trend reversal. Nifty rallied 20% over the next 3 months.',
    outcome: 'Nifty rallied from 17,800 to 18,887 over the next month. By Dec 2022 it hit 18,800+.',
  },
]

export default function RealChartsPage() {
  const [idx, setIdx]         = useState(0)
  const [pick, setPick]       = useState(null)
  const [answered, setAnswered] = useState(false)
  const [showReveal, setShowReveal] = useState(false)
  const [score, setScore]     = useState(0)
  const [finished, setFinished] = useState(false)

  const q     = SCENARIOS[idx]
  const total = SCENARIOS.length

  const choose = v => {
    if (answered) return
    setPick(v)
    setTimeout(() => {
      setAnswered(true)
      if (v === q.answer) setScore(s => s + 1)
    }, 300)
  }

  const next = () => {
    if (idx + 1 >= total) {
      setFinished(true)
    } else {
      setIdx(i => i + 1)
      setPick(null)
      setAnswered(false)
      setShowReveal(false)
    }
  }

  const restart = () => {
    setIdx(0); setPick(null); setAnswered(false)
    setShowReveal(false); setScore(0); setFinished(false)
  }

  const pct = Math.round((score / total) * 100)

  return (
    <div className="min-h-screen bg-[#060b14] text-white">
      <Nav />

      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-8">
          <Link href="/games" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors mb-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All Games
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] font-bold tracking-widest uppercase text-rose-400">Real Market History</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Real Chart Challenge</h1>
          <p className="text-slate-500 text-sm">Real Nifty charts from significant market events. What would you have done — and what actually happened?</p>
        </div>

        {finished ? (
          <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] text-center">
            <p className="text-slate-500 text-xs font-bold tracking-widest uppercase mb-4">Your Score</p>
            <p className={`text-7xl font-black mb-2 ${pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>
              {score}/{total}
            </p>
            <p className="text-slate-400 text-base mb-2">
              {pct >= 80 ? 'Excellent market reading.' : pct >= 60 ? 'Good instincts. History is a great teacher.' : 'These are hard. Even pros got these wrong in real-time.'}
            </p>
            <p className="text-slate-600 text-sm mb-8">{pct}% accuracy on real market scenarios</p>
            <div className="flex gap-3 justify-center">
              <button onClick={restart} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold transition-colors">
                Play Again
              </button>
              <Link href="/games" className="px-6 py-3 border border-white/10 hover:border-white/20 rounded-xl text-sm font-semibold text-slate-300 transition-colors">
                More Games
              </Link>
            </div>
          </div>
        ) : (
          <div>
            {/* Progress */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-600 text-xs font-semibold">Scenario {idx + 1} of {total}</span>
              <span className="text-slate-600 text-xs font-semibold">{score} correct</span>
            </div>
            <div className="w-full h-1 bg-white/5 rounded-full mb-8">
              <div className="h-1 bg-rose-600 rounded-full transition-all duration-500" style={{ width: `${(idx / total) * 100}%` }} />
            </div>

            <div className="p-7 rounded-2xl border border-white/10 bg-white/[0.02]">

              {/* Event header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-rose-400 text-[10px] font-bold tracking-widest uppercase">{q.event}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{q.date} · {q.time} IST</p>
                </div>
                <span className="text-slate-700 text-xs font-semibold border border-slate-800 px-2 py-0.5 rounded-full">15-min chart</span>
              </div>

              {/* Context */}
              <p className="text-slate-400 text-xs leading-relaxed mb-5 border-l-2 border-slate-700 pl-3">{q.context}</p>

              {/* Chart */}
              <Chart candles={q.candles} revealCandles={q.revealCandles} showReveal={showReveal} />

              {showReveal && (
                <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-emerald-400 inline-block" /> Known data</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-teal-400 inline-block opacity-90" /> What actually happened</span>
                </div>
              )}

              {/* Question */}
              <p className="text-white font-semibold text-base leading-snug mb-5">{q.question}</p>

              {/* Options / Result */}
              {!answered ? (
                <div className="flex flex-col gap-2.5">
                  {q.options.map(o => (
                    <button key={o.id} onClick={() => choose(o.id)}
                      className={`text-left px-5 py-3.5 rounded-xl text-sm border transition-all duration-200
                        ${pick === o.id
                          ? 'border-blue-600 bg-blue-950/50 text-blue-300 scale-[0.99]'
                          : 'border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-white/[0.03]'}`}>
                      <span className="font-bold text-slate-500 mr-2.5">{o.id.toUpperCase()}.</span>{o.text}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className={`p-5 rounded-xl border ${pick === q.answer ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-amber-700/60 bg-amber-950/20'}`}>
                    <p className={`font-bold mb-2 ${pick === q.answer ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {pick === q.answer ? 'Correct read.' : `Missed. Best answer: ${q.options.find(o => o.id === q.answer)?.text}`}
                    </p>
                    <p className="text-slate-400 text-sm leading-relaxed">{q.explanation}</p>
                  </div>

                  {!showReveal ? (
                    <button onClick={() => setShowReveal(true)}
                      className="w-full py-3 rounded-xl border border-teal-800/60 bg-teal-950/20 text-teal-400 text-sm font-bold hover:bg-teal-950/40 transition-colors">
                      Show what actually happened →
                    </button>
                  ) : (
                    <div className="p-4 rounded-xl border border-white/8 bg-white/[0.02]">
                      <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase mb-1.5">Actual Outcome</p>
                      <p className="text-white text-sm leading-relaxed font-medium">{q.outcome}</p>
                    </div>
                  )}

                  {(showReveal || true) && (
                    <button onClick={next}
                      className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors">
                      {idx + 1 >= total ? 'See Results' : 'Next Scenario →'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
