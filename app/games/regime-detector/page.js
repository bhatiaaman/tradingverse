'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Nav from '../../components/Nav'

// ─── SVG Chart ────────────────────────────────────────────────────────────────
// Renders OHLCV candles + volume bars + BOS lines + zone lines + power-candle markers.
// When outcomeCandles is provided (post-reveal) they are drawn muted after the decision line.
function RegimeChart({ candles, signals = [], zones = [], outcomeCandles = null }) {
  const W = 520, H = 170
  const CT = 8, CB = 124     // candle area top/bottom y
  const VT = 132, VB = 162   // volume area top/bottom y
  const PL = 6, PR = 6

  const allC = outcomeCandles ? [...candles, ...outcomeCandles] : candles
  const prices = allC.flatMap(c => [c.h, c.l])
  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const pH = CB - CT, vH = VB - VT

  const scaleY = p => CB - ((p - minP) / (maxP - minP || 1)) * pH
  const maxVol = Math.max(...allC.map(c => c.v || 1))
  const scaleV = v => ((v || 0) / maxVol) * vH

  const cw = (W - PL - PR) / allC.length
  const biw = cw * 0.72
  const xL = i => PL + i * cw + cw * 0.14
  const xM = i => PL + i * cw + cw / 2

  const powerSet = new Set(
    signals.filter(s => s.type === 'power_candle')
      .map(s => s.idx < 0 ? candles.length + s.idx : s.idx)
  )
  const bosLines = signals.filter(s => s.type === 'bos')
  const dlX = PL + candles.length * cw   // decision line x

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 195, display: 'block', background: '#0d1b35', borderRadius: 12 }}
    >
      {/* BOS lines */}
      {bosLines.map((b, i) => {
        const y = scaleY(b.price)
        if (y < CT - 4 || y > CB + 4) return null
        const col = b.dir === 'bull' ? '#10b981' : '#ef4444'
        return (
          <g key={`bos${i}`}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke={col} strokeWidth={1} strokeDasharray="4,3" opacity={0.8} />
            <text x={W - PR - 2} y={y - 2} fill={col} fontSize={7} textAnchor="end" fontFamily="monospace">
              {b.dir === 'bull' ? 'BOS ▲' : 'BOS ▼'}
            </text>
          </g>
        )
      })}

      {/* Zone lines */}
      {zones.map((z, i) => {
        const y = scaleY(z.price)
        if (y < CT - 4 || y > CB + 4) return null
        return (
          <g key={`zone${i}`}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke={z.color} strokeWidth={1} strokeDasharray="6,3" opacity={0.55} />
            {z.label && (
              <text x={W - PR - 2} y={y - 2} fill={z.color} fontSize={7} textAnchor="end" fontFamily="monospace">
                {z.label}
              </text>
            )}
          </g>
        )
      })}

      {/* Candles */}
      {allC.map((c, i) => {
        const isOut  = outcomeCandles && i >= candles.length
        const isPow  = powerSet.has(i)
        const isUp   = c.c >= c.o
        const base   = isUp ? '#34d399' : '#f87171'
        const col    = isOut ? (isUp ? '#34d39950' : '#f8717150') : base
        const x = xL(i), mx = xM(i)
        const bt = scaleY(Math.max(c.o, c.c))
        const bh = Math.max(1.5, Math.abs(scaleY(c.o) - scaleY(c.c)))
        const vh = scaleV(c.v)

        return (
          <g key={i}>
            {isPow && !isOut && (
              <rect x={x - 1} y={bt - 1} width={biw + 2} height={bh + 2} fill={base} opacity={0.2} rx={2} />
            )}
            {/* Wick */}
            <line x1={mx} y1={scaleY(c.h)} x2={mx} y2={scaleY(c.l)} stroke={col} strokeWidth={isOut ? 0.8 : 1.2} />
            {/* Body */}
            <rect x={x} y={bt} width={biw} height={bh} fill={col} rx={1} />
            {/* Volume */}
            {!isOut && (
              <rect x={x} y={VB - vh} width={biw} height={Math.max(1, vh)} fill={isUp ? '#34d39930' : '#f8717130'} />
            )}
            {/* Power-candle arrow marker */}
            {isPow && !isOut && (
              isUp
                ? <polygon points={`${mx},${scaleY(c.h) - 7} ${mx - 4},${scaleY(c.h) - 1} ${mx + 4},${scaleY(c.h) - 1}`} fill="#fbbf24" />
                : <polygon points={`${mx},${scaleY(c.l) + 7} ${mx - 4},${scaleY(c.l) + 1} ${mx + 4},${scaleY(c.l) + 1}`} fill="#f87171" />
            )}
          </g>
        )
      })}

      {/* Decision line */}
      {!outcomeCandles && (
        <>
          <line x1={dlX} y1={CT} x2={dlX} y2={CB} stroke="#334155" strokeWidth={0.8} strokeDasharray="3,2" />
          <text x={dlX - 3} y={CT + 7} fill="#334155" fontSize={6} textAnchor="end" fontFamily="monospace">DECIDE</text>
        </>
      )}

      {/* Outcome divider + label */}
      {outcomeCandles && (
        <>
          <line x1={dlX} y1={CT} x2={dlX} y2={CB} stroke="#1e3a5f" strokeWidth={0.8} strokeDasharray="3,2" />
          <text x={dlX + 3} y={CT + 7} fill="#334155" fontSize={6} fontFamily="monospace">← outcome</text>
        </>
      )}

      {/* VOL label */}
      <text x={PL} y={VB + 6} fill="#334155" fontSize={6} fontFamily="monospace">VOL</text>
    </svg>
  )
}

// ─── Scenario Data ────────────────────────────────────────────────────────────
const S = [
  // ── 1. Bearish Power Candle at Resistance ─────────────────────────────────
  {
    id: 1, difficulty: 'Medium',
    title: 'Bearish Power Candle at Resistance',
    subtitle: 'You are long. A massive bearish candle fires right at a prior swing high.',
    position: { dir: 'long', entry: 23200, stop: 23100, target: 23580 },
    candles: [
      {o:23105,c:23138,h:23150,l:23095,v:8200},{o:23138,c:23168,h:23178,l:23130,v:9100},
      {o:23168,c:23152,h:23185,l:23145,v:7600},{o:23152,c:23195,h:23208,l:23148,v:8900},
      {o:23195,c:23228,h:23238,l:23188,v:9400},{o:23228,c:23215,h:23250,l:23210,v:7800},
      {o:23215,c:23258,h:23268,l:23210,v:8600},{o:23258,c:23292,h:23302,l:23252,v:9200},
      {o:23292,c:23318,h:23328,l:23288,v:8800},{o:23318,c:23348,h:23358,l:23312,v:9600},
      {o:23348,c:23332,h:23365,l:23325,v:7500},{o:23332,c:23372,h:23382,l:23325,v:8400},
      {o:23372,c:23408,h:23418,l:23368,v:9800},{o:23408,c:23442,h:23452,l:23402,v:10200},
      {o:23442,c:23468,h:23480,l:23438,v:9800},
      // Signal: bearish power candle at resistance
      {o:23472,c:23338,h:23488,l:23330,v:26500},
    ],
    signals: [{ type:'power_candle', dir:'bear', idx:-1 }],
    zones:   [{ price:23480, label:'Resistance', color:'#f87171' }],
    chips: [
      { label:'Volume', value:'3.1× avg', bad:true },
      { label:'Range',  value:'4.6× ATR', bad:true },
      { label:'Body',   value:'84%',      bad:true },
      { label:'Direction', value:'Bearish', bad:true },
    ],
    question: 'A bearish power candle just fired at a known resistance (23,480). You are long from 23,200, stop at 23,100. What do you do?',
    options: [
      { id:'a', text:'Close the long immediately — power candle at resistance signals regime change' },
      { id:'b', text:'Hold — price is still above your stop, let the trade breathe' },
      { id:'c', text:'Move stop up to 23,350 to protect more profit' },
      { id:'d', text:'Add more longs — the big candle might be a liquidity sweep' },
    ],
    answer: 'a',
    explanation: 'A bearish power candle at a known resistance is a textbook regime shift signal. Three criteria are met simultaneously: body 84% of range (distribution, not indecision), volume 3.1× average (institutional selling), range 4.6× ATR (extreme force). Resistance held — the trend is reversing. Exiting here avoids giving back all gains. Stop at 23,100 is now irrelevant; the signal overrules it.',
    outcome: [
      {o:23338,c:23298,h:23345,l:23288,v:18500},{o:23298,c:23262,h:23308,l:23255,v:15200},
      {o:23262,c:23288,h:23295,l:23248,v:12800},{o:23288,c:23245,h:23298,l:23238,v:14500},
      {o:23245,c:23208,h:23258,l:23200,v:13200},{o:23208,c:23172,h:23222,l:23165,v:11500},
      {o:23172,c:23145,h:23185,l:23138,v:10800},{o:23145,c:23118,h:23158,l:23110,v:9600},
    ],
  },

  // ── 2. Bullish Power Candle at Support ────────────────────────────────────
  {
    id: 2, difficulty: 'Medium',
    title: 'Bullish Power Candle at Support',
    subtitle: 'You are short. Price hits major support and explodes upward.',
    position: { dir: 'short', entry: 22850, stop: 22925, target: 22450 },
    candles: [
      {o:22848,c:22815,h:22858,l:22808,v:8500},{o:22815,c:22782,h:22825,l:22775,v:9200},
      {o:22782,c:22800,h:22812,l:22770,v:7800},{o:22800,c:22762,h:22810,l:22755,v:8800},
      {o:22762,c:22728,h:22772,l:22720,v:9500},{o:22728,c:22748,h:22758,l:22718,v:7600},
      {o:22748,c:22712,h:22758,l:22705,v:8700},{o:22712,c:22678,h:22722,l:22670,v:9300},
      {o:22678,c:22658,h:22688,l:22648,v:8900},{o:22658,c:22632,h:22668,l:22625,v:9800},
      {o:22632,c:22652,h:22660,l:22618,v:7500},{o:22652,c:22618,h:22662,l:22610,v:8600},
      {o:22618,c:22598,h:22628,l:22588,v:9100},{o:22598,c:22575,h:22608,l:22568,v:9600},
      {o:22575,c:22562,h:22582,l:22548,v:10200},
      // Signal: bullish power candle bouncing from support
      {o:22548,c:22668,h:22678,l:22538,v:27800},
    ],
    signals: [{ type:'power_candle', dir:'bull', idx:-1 }],
    zones:   [{ price:22550, label:'Support', color:'#10b981' }],
    chips: [
      { label:'Volume', value:'2.9× avg', bad:false },
      { label:'Range',  value:'3.8× ATR', bad:false },
      { label:'Body',   value:'86%',      bad:false },
      { label:'Direction', value:'Bullish', bad:false },
    ],
    question: 'A bullish power candle fires at major support (22,550) — third touch. You are short from 22,850, stop 22,925. What is the right move?',
    options: [
      { id:'a', text:'Cover short immediately — power candle at support reverses the regime' },
      { id:'b', text:'Hold short — one candle is not confirmation, wait for more data' },
      { id:'c', text:'Move stop down to 22,680 to protect your short profit' },
      { id:'d', text:'Add to short — sellers tested 22,550 before, this will break eventually' },
    ],
    answer: 'a',
    explanation: 'A bullish power candle at a triple-tested support is one of the clearest reversal signals. Body at 86%, volume 2.9× average, range nearly 4× ATR — buyers stepped in hard at a known level. The "third touch" context matters: each test of support absorbs more sellers. When buyers finally dominate at that level with explosive force, the short is wrong. Exiting here saves capital and avoids a sharp squeeze.',
    outcome: [
      {o:22668,c:22715,h:22725,l:22658,v:18500},{o:22715,c:22762,h:22775,l:22708,v:16200},
      {o:22762,c:22748,h:22780,l:22740,v:12800},{o:22748,c:22795,h:22808,l:22742,v:14500},
      {o:22795,c:22832,h:22845,l:22788,v:13800},{o:22832,c:22868,h:22878,l:22825,v:11500},
      {o:22868,c:22852,h:22885,l:22845,v:10200},{o:22852,c:22895,h:22905,l:22848,v:9800},
    ],
  },

  // ── 3. BOS Bearish — Long Must Close ─────────────────────────────────────
  {
    id: 3, difficulty: 'Medium',
    title: 'Break of Structure — Bearish',
    subtitle: 'Structure breaks. The trend that justified your long is gone.',
    position: { dir: 'long', entry: 23350, stop: 23248, target: 23620 },
    candles: [
      {o:23248,c:23285,h:23298,l:23240,v:8100},{o:23285,c:23318,h:23328,l:23278,v:8900},
      {o:23318,c:23352,h:23362,l:23312,v:9500},{o:23352,c:23338,h:23368,l:23328,v:7600},
      {o:23338,c:23375,h:23385,l:23332,v:8800},{o:23375,c:23412,h:23422,l:23368,v:9700},
      // swing high at 23,422
      {o:23412,c:23388,h:23425,l:23382,v:7900},{o:23388,c:23368,h:23398,l:23360,v:7500},
      // swing low established at 23,360
      {o:23368,c:23402,h:23415,l:23362,v:8500},{o:23402,c:23435,h:23448,l:23398,v:9200},
      {o:23435,c:23462,h:23472,l:23428,v:10500},
      // swing high at 23,472 → higher high
      {o:23462,c:23438,h:23478,l:23432,v:8200},{o:23438,c:23415,h:23448,l:23408,v:7800},
      {o:23415,c:23392,h:23425,l:23385,v:8600},{o:23392,c:23368,h:23402,l:23358,v:9100},
      // Signal: BOS — close below prior swing low of 23,360
      {o:23368,c:23342,h:23378,l:23335,v:14800},
    ],
    signals: [{ type:'bos', dir:'bear', price:23360 }],
    zones:   [],
    chips: [
      { label:'Prior Swing Low', value:'23,360', bad:true },
      { label:'Close',           value:'23,342 ✗', bad:true },
      { label:'BOS',             value:'Confirmed', bad:true },
      { label:'Structure',       value:'Broken', bad:true },
    ],
    question: 'Price closed below the prior swing low (23,360), confirming a Break of Structure. You are long from 23,350. The BOS invalidates the bullish structure. What do you do?',
    options: [
      { id:'a', text:'Close the long — the structure that justified the trade is broken' },
      { id:'b', text:'Hold — price is only 8 points below the swing low, could be a fake-out' },
      { id:'c', text:'Add to long — buying into a potential false breakdown' },
      { id:'d', text:'Wait for the next candle to confirm before acting' },
    ],
    answer: 'a',
    explanation: 'A BOS is not a signal to watch — it\'s a signal to act. When price closes below a prior swing low in an uptrend, the higher-low structure that defined the uptrend is broken. The market is now making lower lows. Your long thesis was based on an uptrend; that uptrend no longer exists. Waiting for "confirmation" risks holding through the continuation of the new downtrend. Close at BOS, reassess the structure before considering re-entry.',
    outcome: [
      {o:23342,c:23305,h:23350,l:23298,v:16500},{o:23305,c:23275,h:23315,l:23268,v:14200},
      {o:23275,c:23298,h:23308,l:23262,v:12500},{o:23298,c:23258,h:23308,l:23250,v:13800},
      {o:23258,c:23222,h:23268,l:23215,v:15200},{o:23222,c:23195,h:23235,l:23188,v:11500},
      {o:23195,c:23178,h:23208,l:23170,v:10800},{o:23178,c:23210,h:23218,l:23165,v:9600},
    ],
  },

  // ── 4. Power Candle but Support 30 pts Below — Adjust Stop ────────────────
  {
    id: 4, difficulty: 'Medium',
    title: 'Power Candle — but Support is Very Close',
    subtitle: 'Bearish power candle fires, but a major support sits just 25 points below.',
    position: { dir: 'long', entry: 23280, stop: 23150, target: 23560 },
    candles: [
      {o:23182,c:23218,h:23228,l:23175,v:8300},{o:23218,c:23248,h:23258,l:23212,v:9100},
      {o:23248,c:23275,h:23285,l:23242,v:8800},{o:23275,c:23258,h:23290,l:23252,v:7600},
      {o:23258,c:23295,h:23305,l:23252,v:8700},{o:23295,c:23322,h:23332,l:23288,v:9400},
      {o:23322,c:23352,h:23362,l:23318,v:10200},{o:23352,c:23378,h:23388,l:23345,v:9800},
      {o:23378,c:23368,h:23395,l:23362,v:8200},{o:23368,c:23402,h:23412,l:23362,v:9100},
      {o:23402,c:23428,h:23438,l:23395,v:9700},{o:23428,c:23445,h:23458,l:23422,v:10500},
      {o:23445,c:23435,h:23462,l:23428,v:8800},{o:23435,c:23455,h:23465,l:23428,v:9200},
      {o:23455,c:23472,h:23480,l:23448,v:9600},
      // Signal: moderate bearish candle — power candle thresholds met but just barely
      {o:23468,c:23362,h:23475,l:23355,v:21500},
    ],
    signals: [{ type:'power_candle', dir:'bear', idx:-1 }],
    zones:   [{ price:23340, label:'Support', color:'#10b981' }],
    chips: [
      { label:'Volume',    value:'2.3× avg',  bad:true },
      { label:'Range',     value:'2.1× ATR',  bad:true },
      { label:'Body',      value:'67%',        bad:true },
      { label:'Support',   value:'23,340 (-22pts)', bad:false },
    ],
    question: 'A bearish power candle just fired (vol 2.3×, range 2.1×, body 67%). But look at the chart — there\'s a strong support zone at 23,340, just 22 points below the close. You are long from 23,280. What do you do?',
    options: [
      { id:'a', text:'Close immediately — a power candle always means exit' },
      { id:'b', text:'Tighten stop to just below support (23,325) — let support do its job first' },
      { id:'c', text:'Do nothing — your original stop at 23,150 is still valid' },
      { id:'d', text:'Add to long at support — power candle at strong support can mean buyers absorbing' },
    ],
    answer: 'b',
    explanation: 'Context matters. This power candle barely met the thresholds (vol 2.3×, body 67%) — it\'s not a high-conviction regime signal. More importantly, a major support sits only 22 points away. The right move is to tighten the stop to just below support (23,325), not close outright. This limits risk to ≈37pts while allowing the trade to survive a support test. If support breaks on the next candle, you\'re out. If it holds, the trend resumes. Blanket "close all power candles" thinking ignores critical context.',
    outcome: [
      {o:23362,c:23345,h:23370,l:23335,v:14500},{o:23345,c:23338,h:23355,l:23330,v:12800},
      {o:23338,c:23352,h:23360,l:23332,v:11200},{o:23352,c:23378,h:23388,l:23348,v:9800},
      {o:23378,c:23405,h:23415,l:23372,v:10500},{o:23405,c:23438,h:23448,l:23398,v:11800},
      {o:23438,c:23462,h:23472,l:23432,v:12200},{o:23462,c:23492,h:23502,l:23455,v:13500},
    ],
  },

  // ── 5. Breakout Power Candle — Do NOT Short ────────────────────────────────
  {
    id: 5, difficulty: 'Medium',
    title: 'Breakout Power Candle — Context Changes Everything',
    subtitle: 'A resistance level breaks with force. Your short plan is invalidated.',
    position: { dir: 'neutral', entry: 0, stop: 0, target: 0 },
    candles: [
      // Sideways range 23,150-23,340 for 14 candles
      {o:23220,c:23258,h:23268,l:23215,v:8200},{o:23258,c:23278,h:23298,l:23252,v:7800},
      {o:23278,c:23245,h:23290,l:23238,v:8500},{o:23245,c:23268,h:23280,l:23240,v:7600},
      {o:23268,c:23312,h:23328,l:23262,v:9100},{o:23312,c:23285,h:23322,l:23278,v:8300},
      {o:23285,c:23252,h:23298,l:23245,v:8800},{o:23252,c:23278,h:23288,l:23245,v:7900},
      {o:23278,c:23305,h:23318,l:23272,v:9200},{o:23305,c:23325,h:23338,l:23298,v:9800},
      {o:23325,c:23298,h:23342,l:23292,v:8100},{o:23298,c:23318,h:23330,l:23292,v:8600},
      {o:23318,c:23335,h:23345,l:23312,v:9300},{o:23335,c:23318,h:23348,l:23312,v:8700},
      {o:23318,c:23345,h:23352,l:23312,v:9500},
      // Signal: bullish power candle breaking above resistance (23,348)
      {o:23348,c:23468,h:23478,l:23342,v:28500},
    ],
    signals: [{ type:'power_candle', dir:'bull', idx:-1 }],
    zones:   [{ price:23348, label:'Range Resistance', color:'#f59e0b' }],
    chips: [
      { label:'Volume',    value:'3.1× avg',  bad:false },
      { label:'Range',     value:'4.0× ATR',  bad:false },
      { label:'Body',      value:'87%',        bad:false },
      { label:'Context',   value:'Breakout', bad:false },
    ],
    question: 'Price was rangebound for 15 bars (23,150-23,348). A bullish power candle (body 87%, vol 3.1×) just broke above resistance with force. You had a short order ready at 23,350. What do you do?',
    options: [
      { id:'a', text:'Take the short — resistance is resistance, fade the breakout' },
      { id:'b', text:'Cancel the short — a power candle breakout invalidates the range resistance' },
      { id:'c', text:'Short with a tight stop at 23,480 — let the market prove the breakout' },
      { id:'d', text:'Wait for a retest of 23,348 and then short there' },
    ],
    answer: 'b',
    explanation: 'Same candle type, completely different context. A bearish power candle at resistance = close long. But a bullish power candle breaking through resistance = do not short. The power candle\'s direction matters: this one broke out upward with 3.1× volume and an 87% body. That is a momentum ignition bar, not a reversal. Shorting into institutional buying momentum is one of the most common (and costly) mistakes in technical trading. Cancel the short, stand aside, and look for a long entry if the breakout consolidates.',
    outcome: [
      {o:23468,c:23505,h:23518,l:23458,v:19500},{o:23505,c:23542,h:23555,l:23498,v:16200},
      {o:23542,c:23528,h:23558,l:23520,v:12800},{o:23528,c:23565,h:23578,l:23522,v:14500},
      {o:23565,c:23598,h:23612,l:23558,v:15800},{o:23598,c:23625,h:23638,l:23590,v:13200},
      {o:23625,c:23612,h:23642,l:23605,v:11500},{o:23612,c:23648,h:23658,l:23605,v:12800},
    ],
  },

  // ── 6. Confluence: PC + BOS + Resistance ─────────────────────────────────
  {
    id: 6, difficulty: 'Advanced',
    title: 'Full Confluence — All Signals Aligned',
    subtitle: 'Power candle + BOS + resistance zone. Three signals at the same level.',
    position: { dir: 'long', entry: 23100, stop: 22995, target: 23480 },
    candles: [
      {o:23005,c:23042,h:23052,l:22998,v:8100},{o:23042,c:23078,h:23088,l:23035,v:8800},
      {o:23078,c:23065,h:23092,l:23058,v:7500},{o:23065,c:23108,h:23118,l:23060,v:9200},
      {o:23108,c:23145,h:23155,l:23102,v:9800},{o:23145,c:23182,h:23192,l:23138,v:10500},
      // swing high at 23,192 → becomes resistance
      {o:23182,c:23158,h:23198,l:23152,v:7800},{o:23158,c:23132,h:23168,l:23125,v:7200},
      // swing low at 23,125
      {o:23132,c:23168,h:23178,l:23128,v:8600},{o:23168,c:23205,h:23215,l:23162,v:9400},
      {o:23205,c:23242,h:23252,l:23198,v:10800},{o:23242,c:23278,h:23288,l:23235,v:11500},
      // approaching prior resistance at 23,192 — now higher
      {o:23278,c:23262,h:23295,l:23255,v:8500},{o:23262,c:23288,h:23298,l:23258,v:9100},
      {o:23288,c:23308,h:23318,l:23282,v:9800},
      // Signal: PC at resistance + BOS below prior swing low
      {o:23315,c:23148,h:23325,l:23138,v:29500},
    ],
    signals: [
      { type:'power_candle', dir:'bear', idx:-1 },
      { type:'bos', dir:'bear', price:23125 },
    ],
    zones: [{ price:23192, label:'Prior High / Resistance', color:'#f87171' }],
    chips: [
      { label:'Volume',       value:'2.8× avg',  bad:true },
      { label:'Range',        value:'3.4× ATR',  bad:true },
      { label:'Body',         value:'90%',        bad:true },
      { label:'BOS + Resistance', value:'CONFIRMED', bad:true },
    ],
    question: 'Three signals fire simultaneously: (1) Bearish power candle (body 90%, vol 2.8×), (2) BOS below prior swing low 23,125, (3) Prior resistance at 23,192 held. You are long from 23,100. This is the highest-conviction regime change setup. What do you do?',
    options: [
      { id:'a', text:'Close the full position immediately — all signals aligned bearish' },
      { id:'b', text:'Close half, hold half with a stop below 23,125' },
      { id:'c', text:'Tighten stop to 23,140 and wait to see if price recovers' },
      { id:'d', text:'Hold — confluence can be a false signal in volatile markets' },
    ],
    answer: 'a',
    explanation: 'This is the highest-conviction close signal in the regime change framework. When three independent signals fire at the same level — power candle (vol 2.8×, body 90%), BOS confirming lower structure, and prior resistance holding — the probability of continuation downward is very high. Each signal alone might warrant a stop tighten. All three together warrant a full exit. Partial exits or waiting here underestimates the weight of evidence. Holding through a triple-signal regime change is hope, not strategy.',
    outcome: [
      {o:23148,c:23098,h:23158,l:23085,v:21500},{o:23098,c:23055,h:23108,l:23042,v:18200},
      {o:23055,c:23082,h:23092,l:23038,v:15500},{o:23082,c:23028,h:23092,l:23018,v:17800},
      {o:23028,c:22985,h:23042,l:22975,v:19200},{o:22985,c:22948,h:22998,l:22938,v:16500},
      {o:22948,c:22968,h:22978,l:22932,v:13200},{o:22968,c:22925,h:22980,l:22918,v:14500},
    ],
  },

  // ── 7. Large Wick — NOT a Power Candle ────────────────────────────────────
  {
    id: 7, difficulty: 'Advanced',
    title: 'High Volume, Wide Range — but is it a Power Candle?',
    subtitle: 'Big volume, big range, but look at the body before you panic.',
    position: { dir: 'long', entry: 23400, stop: 23295, target: 23680 },
    candles: [
      {o:23298,c:23335,h:23345,l:23290,v:8500},{o:23335,c:23368,h:23378,l:23328,v:9100},
      {o:23368,c:23352,h:23385,l:23345,v:7800},{o:23352,c:23392,h:23402,l:23345,v:8900},
      {o:23392,c:23428,h:23438,l:23385,v:9700},{o:23428,c:23458,h:23468,l:23422,v:10200},
      {o:23458,c:23442,h:23478,l:23435,v:8500},{o:23442,c:23475,h:23485,l:23438,v:9300},
      {o:23475,c:23502,h:23512,l:23468,v:10800},{o:23502,c:23528,h:23538,l:23495,v:11500},
      {o:23528,c:23515,h:23545,l:23508,v:9200},{o:23515,c:23548,h:23558,l:23508,v:10500},
      {o:23548,c:23575,h:23585,l:23542,v:11800},{o:23575,c:23562,h:23595,l:23555,v:9800},
      {o:23562,c:23582,h:23598,l:23555,v:10200},
      // Signal: massive wick candle — high vol, wide range, but tiny body
      {o:23585,c:23598,h:23718,l:23392,v:24500},
    ],
    signals: [{ type:'power_candle', dir:'bear', idx:-1 }],
    zones:   [],
    chips: [
      { label:'Volume',     value:'2.4× avg',  bad:false },
      { label:'Range',      value:'326 pts',   bad:false },
      { label:'Body',       value:'4% (!)',     bad:false },
      { label:'Upper Wick', value:'120 pts',    bad:false },
    ],
    question: 'A candle fires with high volume (2.4× avg) and a huge range (326 pts). Your first instinct says "power candle — close long." But body is only 13 pts (4% of range). Long upper and lower wicks. What does this candle actually signal?',
    options: [
      { id:'a', text:'Close long — high volume + wide range = power candle, regime change' },
      { id:'b', text:'Hold long — this is an absorption/rejection candle, not a power candle. Sellers exhausted.' },
      { id:'c', text:'Tighten stop significantly — something big is happening, risk unknown' },
      { id:'d', text:'Short — the upper wick shows sellers rejected price hard' },
    ],
    answer: 'b',
    explanation: 'This is a doji or pin-bar — NOT a power candle. The defining metric is body ratio: 4% of range. Price explored 326 points in both directions and came back near the open. That is not distribution — it is two-sided absorption. Sellers attempted a breakdown to 23,392 and failed; buyers attempted a rally to 23,718 and failed. Nobody won decisively. High volume on a tiny-body candle often signals institutional absorption of a directional move, and is frequently bullish in an uptrend. The power candle definition requires body ≥ 60% of range. At 4%, this candle is noise.',
    outcome: [
      {o:23598,c:23635,h:23648,l:23590,v:13500},{o:23635,c:23668,h:23678,l:23628,v:12200},
      {o:23668,c:23655,h:23685,l:23648,v:10800},{o:23655,c:23692,h:23702,l:23648,v:11500},
      {o:23692,c:23725,h:23738,l:23685,v:12800},{o:23725,c:23712,h:23742,l:23705,v:10500},
      {o:23712,c:23748,h:23758,l:23705,v:11200},{o:23748,c:23778,h:23792,l:23742,v:13500},
    ],
  },

  // ── 8. Late-Session Power Candle — Protect Profit ────────────────────────
  {
    id: 8, difficulty: 'Advanced',
    title: 'Regime Shift at 3:10 PM',
    subtitle: 'A bearish power candle fires with 20 minutes to close. You are sitting on 235 pts profit.',
    position: { dir: 'long', entry: 23155, stop: 23055, target: 23480 },
    candles: [
      {o:23058,c:23098,h:23108,l:23050,v:9200},{o:23098,c:23135,h:23148,l:23092,v:10500},
      {o:23135,c:23168,h:23178,l:23128,v:11200},{o:23168,c:23152,h:23185,l:23145,v:8800},
      {o:23152,c:23195,h:23205,l:23145,v:9600},{o:23195,c:23232,h:23242,l:23188,v:10800},
      {o:23232,c:23268,h:23278,l:23225,v:11500},{o:23268,c:23252,h:23285,l:23245,v:9100},
      {o:23252,c:23292,h:23302,l:23245,v:10200},{o:23292,c:23325,h:23335,l:23285,v:11800},
      {o:23325,c:23358,h:23368,l:23318,v:12500},{o:23358,c:23342,h:23378,l:23335,v:9800},
      {o:23342,c:23375,h:23385,l:23335,v:10500},{o:23375,c:23395,h:23405,l:23368,v:11200},
      {o:23395,c:23382,h:23412,l:23375,v:10800},
      // Signal: bearish PC at 3:10 PM with 235pts open profit
      {o:23390,c:23268,h:23398,l:23260,v:25800},
    ],
    signals: [{ type:'power_candle', dir:'bear', idx:-1 }],
    zones:   [],
    chips: [
      { label:'Time',       value:'3:10 PM',   bad:true },
      { label:'Open P&L',   value:'+₹23,500',  bad:false },
      { label:'Volume',     value:'2.5× avg',  bad:true },
      { label:'Body',       value:'91%',        bad:true },
    ],
    question: 'It\'s 3:10 PM. 20 minutes to close. You are long from 23,155 with +235 pts (₹23,500) open profit. A bearish power candle (body 91%, vol 2.5×) fires. Regime is shifting. What do you do?',
    options: [
      { id:'a', text:'Close the position — lock in 235 pts, regime signal overrides the remaining upside' },
      { id:'b', text:'Hold overnight — the move down is a late-session shakeout, tomorrow will recover' },
      { id:'c', text:'Tighten stop to 23,300 — protect most of the profit' },
      { id:'d', text:'Close half, hold half overnight with a stop at 23,200' },
    ],
    answer: 'a',
    explanation: 'Late-session regime shifts require faster action than intraday ones. Three compounding factors make this an immediate exit: (1) A high-body (91%) power candle is a genuine regime signal. (2) Holding overnight in a regime shift exposes you to gap risk — you have no stop protection after close. (3) You have 235 pts in open profit — that gain can evaporate in a single overnight gap if a bad macro event hits. Locking in ₹23,500 confirmed profit is always correct when the regime signal fires near the close. The right trade for tomorrow is a new trade, with a new entry, with fresh risk defined.',
    outcome: [
      {o:23268,c:23218,h:23278,l:23205,v:18500},{o:23218,c:23182,h:23228,l:23172,v:15800},
      {o:23182,c:23155,h:23195,l:23145,v:14200},
      // Gap down next day
      {o:23080,c:23045,h:23092,l:23035,v:22500},{o:23045,c:23008,h:23058,l:22998,v:19800},
      {o:23008,c:23035,h:23045,l:22992,v:16500},{o:23035,c:22998,h:23048,l:22988,v:14800},
      {o:22998,c:23018,h:23028,l:22982,v:13500},
    ],
  },

  // ── 9. Third Touch of Support + Bull PC — Cover Short ─────────────────────
  {
    id: 9, difficulty: 'Advanced',
    title: 'The Third Test — Cover Your Short',
    subtitle: 'Support has held twice. A bullish power candle fires on the third touch.',
    position: { dir: 'short', entry: 23648, stop: 23728, target: 23200 },
    candles: [
      {o:23645,c:23608,h:23655,l:23600,v:9200},{o:23608,c:23572,h:23618,l:23565,v:9800},
      {o:23572,c:23538,h:23582,l:23528,v:10500},
      // 1st touch of 23,220 support — bounce
      {o:23538,c:23225,h:23548,l:23215,v:14500},{o:23225,c:23268,h:23278,l:23218,v:12800},
      {o:23268,c:23312,h:23322,l:23262,v:11200},{o:23312,c:23352,h:23362,l:23305,v:10500},
      {o:23352,c:23385,h:23395,l:23345,v:9800},{o:23385,c:23418,h:23428,l:23378,v:9200},
      // Rolls back over
      {o:23418,c:23382,h:23428,l:23375,v:8800},{o:23382,c:23345,h:23392,l:23338,v:9500},
      // 2nd touch of support ~ 23,218 — another bounce
      {o:23345,c:23222,h:23355,l:23212,v:13800},{o:23222,c:23258,h:23268,l:23215,v:11500},
      {o:23258,c:23285,h:23295,l:23252,v:10200},
      // Rolls over again
      {o:23285,c:23248,h:23298,l:23242,v:9600},
      // Signal: 3rd touch — bullish PC at support (23,220)
      {o:23235,c:23368,h:23378,l:23212,v:31200},
    ],
    signals: [{ type:'power_candle', dir:'bull', idx:-1 }],
    zones:   [{ price:23220, label:'Support (3× tested)', color:'#10b981' }],
    chips: [
      { label:'Volume',    value:'3.2× avg',  bad:false },
      { label:'Body',      value:'80%',        bad:false },
      { label:'Support Tests', value:'3rd touch', bad:false },
      { label:'Short P&L', value:'+₹42,800', bad:false },
    ],
    question: 'Support at 23,220 has held TWICE before. A bullish power candle (body 80%, vol 3.2×) fires on the third test. You are short from 23,648 with +₹42,800 profit. What do you do?',
    options: [
      { id:'a', text:'Cover the short — triple-tested support with a bullish PC is a high-conviction reversal' },
      { id:'b', text:'Hold short — triple tests often precede breakdowns, wait for the break' },
      { id:'c', text:'Tighten stop to 23,390, protect most of the profit' },
      { id:'d', text:'Cover half at market, hold half with stop at 23,390' },
    ],
    answer: 'a',
    explanation: 'The triple-touch support pattern with a power candle is one of the most reliable reversal setups. Each test of support builds buying interest: sellers failed at 23,220 twice already. On the third test, buyers — having watched the level hold twice — commit with conviction. The bullish PC (vol 3.2×, body 80%) confirms that buyers dominated that bar completely. Your short thesis assumed 23,220 would break. It has now held three times with increasing buying force. The thesis is wrong — covering here at +₹42,800 is the correct, disciplined response. Hoping for a breakdown into a level that has absorbed three waves of selling is wishful thinking.',
    outcome: [
      {o:23368,c:23415,h:23425,l:23358,v:20500},{o:23415,c:23462,h:23472,l:23408,v:17200},
      {o:23462,c:23448,h:23480,l:23440,v:13800},{o:23448,c:23498,h:23508,l:23442,v:15500},
      {o:23498,c:23542,h:23555,l:23490,v:16800},{o:23542,c:23578,h:23592,l:23535,v:14200},
      {o:23578,c:23615,h:23628,l:23572,v:13500},{o:23615,c:23652,h:23662,l:23608,v:12800},
    ],
  },
]

// ─── Verdict helper ───────────────────────────────────────────────────────────
function verdict(score, total) {
  const pct = Math.round((score / total) * 100)
  if (pct === 100) return { label: 'Regime Maestro', color: 'text-emerald-400', desc: 'Perfect score. You read every signal correctly — including the traps. You understand that context overrules rules.' }
  if (pct >= 78)  return { label: 'Sharp Eyes',     color: 'text-emerald-400', desc: 'You caught most regime shifts. The scenarios you missed reveal specific edge cases to study further.' }
  if (pct >= 56)  return { label: 'Pattern Reader', color: 'text-amber-400',   desc: 'Good instincts on the obvious signals. Advanced scenarios — wick traps, confluence, late session — tripped you up.' }
  if (pct >= 33)  return { label: 'Still Learning',  color: 'text-orange-400',  desc: 'Regime change detection is a high-skill area. Review the explanations carefully — each one contains a principle you can apply immediately.' }
  return              { label: 'Study Mode',         color: 'text-red-400',     desc: 'The signals are there — the framework to read them takes practice. Start with scenarios 1-3 and master the basics before the advanced ones.' }
}

// ─── Position badge ───────────────────────────────────────────────────────────
function PositionBadge({ position }) {
  if (!position || position.dir === 'neutral') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-xs">
        <span className="text-slate-400">No open position</span>
      </div>
    )
  }
  const isLong = position.dir === 'long'
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-xs ${isLong ? 'bg-emerald-950/30 border-emerald-800/40' : 'bg-red-950/30 border-red-800/40'}`}>
      <span className={`font-black uppercase tracking-wide ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
        {isLong ? '▲ LONG' : '▼ SHORT'}
      </span>
      <span className="text-slate-400">Entry <span className="text-white font-semibold">{position.entry.toLocaleString('en-IN')}</span></span>
      <span className="text-slate-400">Stop <span className="text-red-400 font-semibold">{position.stop.toLocaleString('en-IN')}</span></span>
      <span className="text-slate-400">Target <span className="text-emerald-400 font-semibold">{position.target.toLocaleString('en-IN')}</span></span>
    </div>
  )
}

// ─── Main Game ────────────────────────────────────────────────────────────────
export default function RegimeDetectorGame() {
  const [phase,     setPhase]     = useState('intro')
  const [idx,       setIdx]       = useState(0)
  const [pick,      setPick]      = useState(null)
  const [revealed,  setRevealed]  = useState(false)
  const [score,     setScore]     = useState(0)
  const [answers,   setAnswers]   = useState([])
  const [bestScore, setBestScore] = useState(null)
  const [newBest,   setNewBest]   = useState(false)
  const [saving,    setSaving]    = useState(false)

  const total = S.length
  const q = S[idx]

  // Load progress
  useEffect(() => {
    fetch('/api/games/progress?game=regime-detector')
      .then(r => r.json())
      .then(d => { if (d.bestScore != null) setBestScore(d.bestScore) })
      .catch(() => {})
  }, [])

  const choose = id => {
    if (revealed) return
    setPick(id)
    setTimeout(() => {
      setRevealed(true)
      if (id === q.answer) setScore(s => s + 1)
    }, 250)
  }

  const next = () => {
    const correct = pick === q.answer
    setAnswers(prev => [...prev, { correct, scenarioId: q.id, title: q.title, pick }])

    if (idx + 1 >= total) {
      // Finished — compute final score first then save
      const finalScore = score + (correct ? 1 : 0)
      saveProgress(finalScore)
      setPhase('done')
    } else {
      setIdx(i => i + 1)
      setPick(null)
      setRevealed(false)
    }
  }

  const saveProgress = async (finalScore) => {
    setSaving(true)
    try {
      const res = await fetch('/api/games/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'regime-detector', score: finalScore, total }),
      })
      const data = await res.json()
      if (data.isNewBest) { setNewBest(true); setBestScore(finalScore) }
    } catch {}
    setSaving(false)
  }

  const restart = () => {
    setPhase('intro')
    setIdx(0)
    setPick(null)
    setRevealed(false)
    setScore(0)
    setAnswers([])
    setNewBest(false)
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

          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-amber-400 mb-3">Price Action · Game</div>
          <h1 className="text-4xl font-black mb-3 leading-tight">
            Regime Change<br />Detector
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            9 real chart scenarios — from straightforward power candles to advanced confluence signals
            and deliberate traps. Each scenario asks: what does the market structure tell you right now,
            and what do you do with your open position?
          </p>

          {bestScore != null && (
            <div className="mb-8 px-4 py-3 rounded-xl border border-amber-800/40 bg-amber-950/20 text-sm flex items-center gap-3">
              <span className="text-amber-400 text-lg">🏆</span>
              <div>
                <span className="text-slate-400">Best score: </span>
                <span className="text-amber-400 font-black">{bestScore}/{total}</span>
                <span className="text-slate-500 text-xs ml-2">({Math.round(bestScore/total*100)}%)</span>
              </div>
            </div>
          )}

          <div className="space-y-3 mb-10">
            {[
              { icon: '⚡', text: 'Power candle recognition — body, volume, ATR thresholds' },
              { icon: '📐', text: 'Break of Structure (BOS) — when the trend\'s logic is gone' },
              { icon: '🎯', text: 'Context: resistance vs breakout, support proximity, time' },
              { icon: '🔍', text: 'Trap candles — large wicks that look like power candles but aren\'t' },
              { icon: '🧩', text: 'Confluence — when multiple signals align for highest conviction' },
            ].map(item => (
              <div key={item.text} className="flex items-start gap-3 text-sm text-slate-400">
                <span className="flex-shrink-0 mt-0.5">{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 text-[10px] font-bold uppercase tracking-widest mb-6">
            <span className="px-2 py-1 rounded-full border border-amber-800/40 text-amber-400">5 Medium</span>
            <span className="px-2 py-1 rounded-full border border-red-800/40 text-red-400">4 Advanced</span>
          </div>

          <button onClick={() => setPhase('playing')}
            className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black font-black text-lg rounded-2xl transition-colors">
            Detect Regimes →
          </button>
        </div>
      </div>
    )
  }

  // ── Results ────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const finalScore = answers.filter(a => a.correct).length
    const v = verdict(finalScore, total)
    const pct = Math.round((finalScore / total) * 100)

    return (
      <div className="min-h-screen bg-[#060b14] text-white">
        <Nav />
        <div className="max-w-2xl mx-auto px-6 py-14">

          <div className="text-center mb-10">
            {newBest && (
              <div className="inline-block mb-4 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-bold tracking-widest uppercase">
                🏆 New Best Score
              </div>
            )}
            <p className={`text-6xl font-black mb-2 ${v.color}`}>{finalScore}/{total}</p>
            <p className="text-slate-500 text-sm mb-2">{pct}% accuracy</p>
            <p className={`text-xl font-black mb-2 ${v.color}`}>{v.label}</p>
            <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">{v.desc}</p>
            {saving && <p className="text-slate-600 text-xs mt-4">Saving score…</p>}
          </div>

          {/* Scenario breakdown */}
          <div className="space-y-2 mb-10">
            <p className="text-slate-600 text-xs font-bold uppercase tracking-widest mb-3">Scenario Breakdown</p>
            {S.map((sc, i) => {
              const a = answers[i]
              if (!a) return null
              return (
                <div key={sc.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm
                  ${a.correct ? 'border-emerald-900/40 bg-emerald-950/20' : 'border-red-900/40 bg-red-950/15'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0
                    ${a.correct ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {a.correct ? '✓' : '✗'}
                  </span>
                  <span className="flex-1 text-slate-300 text-xs">{sc.title}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded
                    ${sc.difficulty === 'Advanced' ? 'text-red-400 bg-red-950/40' : 'text-amber-400 bg-amber-950/40'}`}>
                    {sc.difficulty}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex gap-3">
            <button onClick={restart}
              className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-sm font-bold transition-colors">
              Play Again
            </button>
            <Link href="/games"
              className="flex-1 py-3 border border-slate-800 hover:border-slate-600 rounded-xl text-sm font-semibold text-slate-400 transition-colors text-center">
              More Games
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Playing ────────────────────────────────────────────────────────────────
  const isCorrect = revealed && pick === q.answer
  const diffColor = q.difficulty === 'Advanced' ? 'text-red-400 border-red-900/40' : 'text-amber-400 border-amber-900/40'

  return (
    <div className="min-h-screen bg-[#060b14] text-white">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <Link href="/games" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
            ← Games
          </Link>
          <span className="text-slate-600 text-xs font-semibold">{score} correct · {idx + 1}/{total}</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-0.5 bg-white/5 rounded-full mb-8">
          <div className="h-0.5 bg-amber-500 rounded-full transition-all duration-500"
            style={{ width: `${(idx / total) * 100}%` }} />
        </div>

        {/* Scenario card */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden mb-4">

          {/* Title bar */}
          <div className="px-5 py-4 border-b border-white/5 flex items-start justify-between gap-3">
            <div>
              <p className="text-white font-bold text-sm leading-snug">{q.title}</p>
              <p className="text-slate-500 text-xs mt-0.5">{q.subtitle}</p>
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded border flex-shrink-0 ${diffColor}`}>
              {q.difficulty}
            </span>
          </div>

          {/* Chart */}
          <div className="px-5 pt-4 pb-2">
            <RegimeChart
              candles={q.candles}
              signals={q.signals}
              zones={q.zones}
              outcomeCandles={revealed ? q.outcome : null}
            />
          </div>

          {/* Signal chips + position */}
          <div className="px-5 pb-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {q.chips.map(c => (
                <div key={c.label}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1.5
                    ${c.bad ? 'border-red-900/40 bg-red-950/20' : 'border-emerald-900/40 bg-emerald-950/20'}`}>
                  <span className="text-slate-400">{c.label}:</span>
                  <span className={`font-bold ${c.bad ? 'text-red-300' : 'text-emerald-300'}`}>{c.value}</span>
                </div>
              ))}
            </div>
            <PositionBadge position={q.position} />
          </div>

          {/* Divider */}
          <div className="border-t border-white/5" />

          {/* Question + options */}
          <div className="px-5 py-5">
            <p className="text-white font-semibold text-sm leading-snug mb-4">{q.question}</p>

            {!revealed ? (
              <div className="flex flex-col gap-2">
                {q.options.map(o => (
                  <button key={o.id} onClick={() => choose(o.id)}
                    className={`text-left px-4 py-3.5 rounded-xl text-sm border transition-all duration-200 leading-snug
                      ${pick === o.id
                        ? 'border-amber-500/60 bg-amber-950/40 text-amber-200 scale-[0.99]'
                        : 'border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-white/[0.03]'}`}>
                    <span className="font-bold text-slate-500 mr-2.5">{o.id.toUpperCase()}.</span>{o.text}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                {/* Result banner */}
                <div className={`px-5 py-4 rounded-xl border mb-4
                  ${isCorrect
                    ? 'border-emerald-700/50 bg-emerald-950/30'
                    : 'border-red-800/40 bg-red-950/20'}`}>
                  <p className={`font-black text-sm mb-1 ${isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isCorrect ? '✓ Correct read.' : `✗ Not quite — best answer: ${q.options.find(o => o.id === q.answer)?.text}`}
                  </p>
                  <p className="text-slate-400 text-xs leading-relaxed">{q.explanation}</p>
                </div>

                {/* Outcome note */}
                <div className="px-4 py-3 rounded-xl border border-slate-800 bg-white/[0.02] mb-4 text-xs text-slate-400 leading-relaxed">
                  <span className="text-slate-500 font-semibold uppercase tracking-widest text-[9px] block mb-1.5">What Happened Next (chart above)</span>
                  The outcome candles are shown in the chart. Observe how price moved after the decision point.
                </div>

                <button onClick={next}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black transition-colors">
                  {idx + 1 >= total ? 'See Results →' : 'Next Scenario →'}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
