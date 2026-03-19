'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import Nav from '../../components/Nav'

const RISK          = 1000   // ₹ risk per trade
const START_CAPITAL = 100000 // ₹1 lakh

function runTrade(winRate) {
  return Math.random() * 100 < winRate ? 'win' : 'loss'
}

function calcStats(trades) {
  let wins = 0, losses = 0
  let longestLoss = 0, curLoss = 0
  let longestWin = 0, curWin = 0
  let maxDD = 0, peak = START_CAPITAL
  for (const t of trades) {
    if (t.result === 'win') { wins++; curWin++; curLoss = 0; longestWin = Math.max(longestWin, curWin) }
    else { losses++; curLoss++; curWin = 0; longestLoss = Math.max(longestLoss, curLoss) }
    if (t.equity > peak) peak = t.equity
    maxDD = Math.max(maxDD, ((peak - t.equity) / peak) * 100)
  }
  return { wins, losses, longestLoss, longestWin, maxDD }
}

function EquityCurve({ trades }) {
  if (trades.length < 2) return null
  const equities = [START_CAPITAL, ...trades.map(t => t.equity)]
  const min = Math.min(...equities)
  const max = Math.max(...equities)
  const range = max - min || 1
  const W = 600, H = 160, PX = 12, PY = 10

  const pts = equities.map((eq, i) => {
    const x = PX + (i / (equities.length - 1)) * (W - PX * 2)
    const y = PY + (1 - (eq - min) / range) * (H - PY * 2)
    return [x, y]
  })

  const last = equities[equities.length - 1]
  const color = last >= START_CAPITAL ? '#22c55e' : '#ef4444'
  const polyPts = pts.map(p => p.join(',')).join(' ')
  const fillPts = `${PX},${H - PY} ${polyPts} ${W - PX},${H - PY}`

  // zero line y
  const zeroY = PY + (1 - (START_CAPITAL - min) / range) * (H - PY * 2)
  const showZero = START_CAPITAL >= min && START_CAPITAL <= max

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showZero && (
        <line x1={PX} y1={zeroY} x2={W - PX} y2={zeroY}
          stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="5,4" />
      )}
      <polygon points={fillPts} fill="url(#eqFill)" />
      <polyline points={polyPts} fill="none" stroke={color} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* last dot */}
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4"
        fill={color} />
    </svg>
  )
}

function currentStreak(trades) {
  if (!trades.length) return { count: 0, type: null }
  const type = trades[trades.length - 1].result
  let count = 0
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].result === type) count++
    else break
  }
  return { count, type }
}

function Insight({ pnlPct, winRate, longestLoss, numTrades }) {
  if (pnlPct > 15)
    return <p className="text-green-400">Your {winRate}% edge compounded to <strong>+{pnlPct.toFixed(1)}%</strong> over {numTrades} trades. This is what consistent execution looks like — not prediction, just probability.</p>
  if (pnlPct > 0)
    return <p className="text-emerald-400">Positive result — but notice you had a <strong>{longestLoss}-trade losing streak</strong> along the way. Could you have held your rules through all of it without flinching?</p>
  if (pnlPct > -8)
    return <p className="text-amber-400">Near breakeven. Variance happens even with a positive edge. Over 200+ trades, the edge wins. The question isn't "did I profit?" — it's "did I execute every trade?"</p>
  return <p className="text-rose-400">A tough run. With a {winRate}% win rate, this was statistically possible — even expected sometimes. An edge doesn't guarantee every sample. Stay consistent.</p>
}

export default function EdgeSimulator() {
  const [phase,     setPhase]     = useState('setup')
  const [winRate,   setWinRate]   = useState(55)
  const [rr,        setRR]        = useState(2)
  const [numTrades, setNumTrades] = useState(50)
  const [trades,    setTrades]    = useState([])
  const [autoPlay,  setAutoPlay]  = useState(false)
  const autoRef = useRef(false)

  const equity = trades.length ? trades[trades.length - 1].equity : START_CAPITAL
  const pnl    = equity - START_CAPITAL
  const pnlPct = (pnl / START_CAPITAL) * 100
  const done   = trades.length >= numTrades
  const stats  = calcStats(trades)
  const streak = currentStreak(trades)

  const expectedPerTrade = (winRate / 100) * RISK * rr - (1 - winRate / 100) * RISK
  const expectedTotal    = expectedPerTrade * numTrades

  const takeTrade = useCallback(() => {
    setTrades(prev => {
      if (prev.length >= numTrades) return prev
      const result  = runTrade(winRate)
      const prevEq  = prev.length ? prev[prev.length - 1].equity : START_CAPITAL
      const newEq   = result === 'win' ? prevEq + RISK * rr : prevEq - RISK
      return [...prev, { result, equity: newEq }]
    })
  }, [winRate, rr, numTrades])

  useEffect(() => {
    if (!autoPlay || done) { autoRef.current = false; return }
    autoRef.current = true
    const id = setTimeout(() => { if (autoRef.current) takeTrade() }, 100)
    return () => clearTimeout(id)
  }, [autoPlay, trades.length, done, takeTrade])

  const reset = () => { setPhase('setup'); setTrades([]); setAutoPlay(false); autoRef.current = false }

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-[#060b14] text-white">
        <Nav />
        <div className="max-w-lg mx-auto px-6 py-14">
          <Link href="/games" className="text-xs text-slate-500 hover:text-white transition-colors mb-8 inline-flex items-center gap-1">
            ← Back to Games
          </Link>

          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-blue-400 mb-3">Trading in the Zone · Game 1</div>
          <h1 className="text-4xl font-black mb-3 leading-tight">The Edge<br/>Simulator</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-10">
            Configure your trading edge, then execute it trade by trade.
            Watch how probability really plays out — including the losing streaks
            you'll need to survive without breaking your rules.
          </p>

          <div className="space-y-8">
            {/* Win Rate */}
            <div>
              <div className="flex justify-between items-baseline mb-3">
                <label className="text-sm font-semibold text-slate-300">Win Rate</label>
                <span className="text-2xl font-black text-blue-400">{winRate}%</span>
              </div>
              <input type="range" min={45} max={70} value={winRate}
                onChange={e => setWinRate(+e.target.value)}
                className="w-full h-2 rounded-full accent-blue-500 cursor-pointer" />
              <div className="flex justify-between text-[11px] text-slate-600 mt-2">
                <span>45% (tough)</span><span>55% (realistic)</span><span>70% (easy)</span>
              </div>
            </div>

            {/* R:R */}
            <div>
              <div className="flex justify-between items-baseline mb-3">
                <label className="text-sm font-semibold text-slate-300">Reward : Risk</label>
                <span className="text-2xl font-black text-purple-400">{rr.toFixed(1)} : 1</span>
              </div>
              <input type="range" min={10} max={30} value={rr * 10}
                onChange={e => setRR(e.target.value / 10)}
                className="w-full h-2 rounded-full accent-purple-500 cursor-pointer" />
              <div className="flex justify-between text-[11px] text-slate-600 mt-2">
                <span>1:1</span><span>2:1</span><span>3:1</span>
              </div>
            </div>

            {/* Num trades */}
            <div>
              <label className="text-sm font-semibold text-slate-300 mb-3 block">Number of Trades</label>
              <div className="flex gap-2">
                {[20, 50, 100].map(n => (
                  <button key={n} onClick={() => setNumTrades(n)}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-all ${
                      numTrades === n
                        ? 'bg-white text-black border-white'
                        : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                    }`}>{n}</button>
                ))}
              </div>
            </div>

            {/* Expected outcome */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/8 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Expected gain/trade</span>
                <span className={`font-bold ${expectedPerTrade >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {expectedPerTrade >= 0 ? '+' : ''}₹{expectedPerTrade.toFixed(0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Expected over {numTrades} trades</span>
                <span className={`font-bold ${expectedTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {expectedTotal >= 0 ? '+' : ''}₹{expectedTotal.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Risk per trade</span>
                <span className="text-white font-bold">₹{RISK.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          <button onClick={() => { setTrades([]); setPhase('playing') }}
            className="mt-8 w-full py-4 bg-blue-600 hover:bg-blue-500 font-black text-lg rounded-2xl transition-colors">
            Start Trading →
          </button>
        </div>
      </div>
    )
  }

  // ── Playing ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#060b14] text-white">
      <Nav />

      {/* Results modal */}
      {done && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1829] rounded-2xl border border-white/10 p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2">{numTrades} trades completed</div>
              <div className={`text-5xl font-black ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {pnl >= 0 ? '+' : '−'}₹{Math.abs(pnl).toLocaleString('en-IN')}
              </div>
              <div className="text-slate-400 text-sm mt-1">
                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}% · Started with ₹1,00,000
              </div>
              <div className="text-xs text-slate-600 mt-1">
                {stats.wins}W × ₹{(RISK * rr).toLocaleString('en-IN')} − {stats.losses}L × ₹{RISK.toLocaleString('en-IN')} = {pnl >= 0 ? '+' : '−'}₹{Math.abs(pnl).toLocaleString('en-IN')}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: 'Actual win rate', value: `${((stats.wins / numTrades) * 100).toFixed(1)}%`, sub: `target ${winRate}%` },
                { label: 'Longest loss run', value: `${stats.longestLoss} trades`, sub: 'in a row' },
                { label: 'Max drawdown', value: `${stats.maxDD.toFixed(1)}%`, sub: 'from peak equity' },
                { label: 'W / L', value: `${stats.wins} / ${stats.losses}`, sub: `out of ${numTrades}` },
              ].map(s => (
                <div key={s.label} className="p-3 rounded-xl bg-white/5 text-center">
                  <div className="text-xl font-black">{s.value}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">{s.label}</div>
                  <div className="text-xs text-slate-600">{s.sub}</div>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-white/5 text-sm leading-relaxed mb-6">
              <Insight pnlPct={pnlPct} winRate={winRate} longestLoss={stats.longestLoss} numTrades={numTrades} />
            </div>

            <div className="flex gap-3">
              <Link href="/games"
                className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5 transition-colors text-center">
                ← All Games
              </Link>
              <button onClick={reset}
                className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5 transition-colors">
                Change Setup
              </button>
              <button onClick={() => { setTrades([]); setAutoPlay(false) }}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors">
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/games" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">← Games</Link>
            <div className="text-lg font-black mt-0.5">Edge Simulator</div>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-black tabular-nums ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {pnl >= 0 ? '+' : '−'}₹{Math.abs(pnl).toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Trade {trades.length} of {numTrades}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/5 rounded-full mb-6 overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${(trades.length / numTrades) * 100}%` }} />
        </div>

        {/* Equity curve */}
        <div className="h-44 mb-4 bg-white/[0.02] rounded-2xl border border-white/5 overflow-hidden">
          {trades.length >= 2
            ? <EquityCurve trades={trades} />
            : <div className="h-full flex items-center justify-center text-slate-700 text-sm">
                Equity curve builds as you trade
              </div>
          }
        </div>

        {/* Trade dots */}
        <div className="flex gap-1 flex-wrap min-h-[20px] mb-5">
          {trades.map((t, i) => (
            <div key={i}
              className={`w-3 h-3 rounded-full flex-shrink-0 transition-all ${t.result === 'win' ? 'bg-green-500' : 'bg-red-500'}`}
              title={`#${i + 1}: ${t.result} → ₹${t.equity.toLocaleString('en-IN')}`} />
          ))}
          {Array(numTrades - trades.length).fill(0).map((_, i) => (
            <div key={`empty-${i}`} className="w-3 h-3 rounded-full flex-shrink-0 bg-white/8" />
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { label: 'Capital', value: `₹${(equity / 1000).toFixed(1)}k`, color: pnl >= 0 ? 'text-green-400' : 'text-red-400' },
            { label: 'Wins', value: stats.wins, color: 'text-green-400' },
            { label: 'Losses', value: stats.losses, color: 'text-red-400' },
            {
              label: 'Streak',
              value: streak.count > 1 ? `${streak.count}×` : '—',
              color: streak.type === 'win' ? 'text-green-400' : streak.type === 'loss' ? 'text-red-400' : 'text-slate-400',
              sub: streak.count > 1 ? (streak.type === 'win' ? 'wins' : 'losses') : null,
            },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
              <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
              {s.sub && <div className="text-[10px] text-slate-600">{s.sub}</div>}
              <div className="text-[10px] uppercase tracking-wider text-slate-600 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Streak warning */}
        {streak.count >= 3 && streak.type === 'loss' && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {streak.count} losses in a row — this is where most traders break their rules. Don't.
          </div>
        )}
        {streak.count >= 4 && streak.type === 'win' && (
          <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm text-center">
            {streak.count} wins in a row — don't increase size. Stay consistent.
          </div>
        )}

        {/* Action */}
        <div className="flex gap-3">
          <button onClick={takeTrade} disabled={done || autoPlay}
            className="flex-1 py-5 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-30 font-black text-xl transition-all">
            {done ? 'All trades done' : `Take Trade #${trades.length + 1}`}
          </button>
          <button onClick={() => setAutoPlay(a => !a)} disabled={done}
            className={`px-6 rounded-2xl text-sm font-bold border transition-all ${
              autoPlay
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : 'border-white/10 text-slate-500 hover:text-white hover:border-white/20'
            }`}>
            {autoPlay ? '⏸ Pause' : '▶ Auto'}
          </button>
        </div>

        <p className="text-center text-[11px] text-slate-700 mt-4">
          {winRate}% win rate · {rr}:1 R:R · ₹{RISK.toLocaleString('en-IN')} risk/trade
        </p>
      </div>
    </div>
  )
}
