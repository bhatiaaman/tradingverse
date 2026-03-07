'use client'

import { useState } from 'react'
import Link from 'next/link'
import Nav from './Nav'

// Mini SVG candlestick chart
function MiniChart({ candles }) {
  const W = 280, H = 100, pad = 12
  const prices = candles.flatMap(c => [c.h, c.l])
  const min = Math.min(...prices), max = Math.max(...prices)
  const scaleY = v => H - pad - ((v - min) / (max - min)) * (H - pad * 2)
  const cw = (W - pad * 2) / candles.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 rounded-xl bg-slate-900/60 mb-5">
      {candles.map((c, i) => {
        const x = pad + i * cw + cw * 0.1
        const w = cw * 0.8
        const isUp = c.c >= c.o
        const color = isUp ? '#34d399' : '#f87171'
        const bodyTop = scaleY(Math.max(c.o, c.c))
        const bodyH = Math.max(2, Math.abs(scaleY(c.o) - scaleY(c.c)))
        const mid = x + w / 2
        return (
          <g key={i}>
            <line x1={mid} y1={scaleY(c.h)} x2={mid} y2={scaleY(c.l)} stroke={color} strokeWidth={1.5} />
            <rect x={x} y={bodyTop} width={w} height={bodyH} fill={color} rx={1} />
          </g>
        )
      })}
    </svg>
  )
}

export default function GameEngine({ title, tag, tagColor, description, questions }) {
  const [idx, setIdx]     = useState(0)
  const [pick, setPick]   = useState(null)
  const [done, setDone]   = useState(false)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)

  const q = questions[idx]
  const total = questions.length

  const choose = v => {
    if (done) return
    setPick(v)
    setTimeout(() => {
      setDone(true)
      if (v === q.answer) setScore(s => s + 1)
    }, 300)
  }

  const next = () => {
    if (idx + 1 >= total) {
      setFinished(true)
    } else {
      setIdx(i => i + 1)
      setPick(null)
      setDone(false)
    }
  }

  const restart = () => {
    setIdx(0)
    setPick(null)
    setDone(false)
    setScore(0)
    setFinished(false)
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
            <span className={`text-[10px] font-bold tracking-widest uppercase ${tagColor}`}>{tag}</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">{title}</h1>
          <p className="text-slate-500 text-sm">{description}</p>
        </div>

        {finished ? (
          /* ── Final score ── */
          <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] text-center">
            <p className="text-slate-500 text-xs font-bold tracking-widest uppercase mb-4">Your Score</p>
            <p className={`text-7xl font-black mb-2 ${pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>
              {score}/{total}
            </p>
            <p className="text-slate-400 text-base mb-2">
              {pct >= 80 ? 'Excellent decision-making.' : pct >= 60 ? 'Solid instincts. Keep sharpening.' : 'Good attempt. Review the explanations and retry.'}
            </p>
            <p className="text-slate-600 text-sm mb-8">{pct}% accuracy</p>
            <div className="flex gap-3 justify-center">
              <button onClick={restart}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold transition-colors">
                Play Again
              </button>
              <Link href="/games"
                className="px-6 py-3 border border-white/10 hover:border-white/20 rounded-xl text-sm font-semibold text-slate-300 transition-colors">
                More Games
              </Link>
            </div>
          </div>
        ) : (
          /* ── Question ── */
          <div>
            {/* Progress */}
            <div className="flex items-center justify-between mb-5">
              <span className="text-slate-600 text-xs font-semibold">Question {idx + 1} of {total}</span>
              <span className="text-slate-600 text-xs font-semibold">{score} correct</span>
            </div>
            <div className="w-full h-1 bg-white/5 rounded-full mb-8">
              <div className="h-1 bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${((idx) / total) * 100}%` }} />
            </div>

            <div className="p-7 rounded-2xl border border-white/10 bg-white/[0.02]">

              {/* Context or chart */}
              {q.type === 'chart' && q.candles && <MiniChart candles={q.candles} />}

              {q.type === 'context' && q.context && (
                <div className="grid grid-cols-2 gap-2.5 mb-5">
                  {q.context.map(c => (
                    <div key={c.label} className={`px-3 py-2.5 rounded-xl border text-xs flex items-center justify-between
                      ${c.bad ? 'border-rose-900/50 bg-rose-950/20' : 'border-emerald-900/50 bg-emerald-950/20'}`}>
                      <span className="text-slate-400">{c.label}</span>
                      <span className={`font-bold ${c.bad ? 'text-rose-400' : 'text-emerald-400'}`}>{c.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {q.type === 'news' && q.headline && (
                <div className="p-4 rounded-xl border border-amber-900/40 bg-amber-950/20 mb-5">
                  <p className="text-amber-400 text-[10px] font-bold tracking-widest uppercase mb-1.5">Breaking News</p>
                  <p className="text-white font-bold text-base leading-snug">{q.headline}</p>
                  {q.context && q.context.map(c => (
                    <div key={c.label} className="flex items-center gap-2 mt-2">
                      <span className="text-slate-500 text-xs">{c.label}:</span>
                      <span className="text-slate-300 text-xs font-semibold">{c.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Question */}
              <p className="text-white font-semibold text-base leading-snug mb-5">{q.question}</p>

              {/* Options */}
              {!done ? (
                <div className="flex flex-col gap-2.5">
                  {q.options.map(o => (
                    <button key={o.id} onClick={() => choose(o.id)}
                      className={`text-left px-5 py-3.5 rounded-xl text-sm border transition-all duration-200 leading-snug
                        ${pick === o.id
                          ? 'border-blue-600 bg-blue-950/50 text-blue-300 scale-[0.99]'
                          : 'border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-white/[0.03]'}`}>
                      <span className="font-bold text-slate-500 mr-2.5">{o.id.toUpperCase()}.</span>{o.text}
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <div className={`p-5 rounded-xl border mb-4
                    ${pick === q.answer ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-amber-700/60 bg-amber-950/20'}`}>
                    <p className={`font-bold mb-2 ${pick === q.answer ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {pick === q.answer
                        ? 'Correct. Good thinking.'
                        : `Not quite. Best answer: ${q.options.find(o => o.id === q.answer)?.text}`}
                    </p>
                    <p className="text-slate-400 text-sm leading-relaxed">{q.explanation}</p>
                  </div>
                  <button onClick={next}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors">
                    {idx + 1 >= total ? 'See Results' : 'Next Question →'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
