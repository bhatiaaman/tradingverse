import GameEngine from '../../components/GameEngine'

const questions = [
  {
    id: 1, type: 'chart',
    candles: [
      {o:110,c:106,h:112,l:104},{o:106,c:102,h:108,l:100},{o:102,c:98,h:103,l:96},
      {o:98,c:96,h:100,l:94},{o:96,c:103,h:104,l:95},
    ],
    question: 'After 4 consecutive bearish candles, a strong bullish candle closes near its high with a long lower wick. What is likely next?',
    options: [
      { id: 'a', text: 'Continuation down — trend is still bearish' },
      { id: 'b', text: 'Short-term bounce / reversal attempt' },
      { id: 'c', text: 'Sideways consolidation for several candles' },
      { id: 'd', text: 'Immediate breakout to new highs' },
    ],
    answer: 'b',
    explanation: 'A strong bullish candle with a long lower wick after a sustained downtrend signals that buyers stepped in. This is a classic reversal candle pattern. Expect at least a short-term bounce — though the trend may or may not reverse fully.',
  },
  {
    id: 2, type: 'chart',
    candles: [
      {o:100,c:105,h:107,l:99},{o:105,c:108,h:110,l:104},{o:108,c:107,h:113,l:106},
      {o:107,c:106,h:110,l:105},{o:106,c:105,h:108,l:104},
    ],
    question: 'After a strong rally, the last 3 candles show shrinking bodies and overlapping ranges near the high. What does this signal?',
    options: [
      { id: 'a', text: 'Continuation — tight range before breakout higher' },
      { id: 'b', text: 'Distribution — smart money selling into the rally' },
      { id: 'c', text: 'Strong support forming at current levels' },
      { id: 'd', text: 'Bullish consolidation, buy on any dip' },
    ],
    answer: 'b',
    explanation: 'Shrinking candles after a strong rally near the highs suggest distribution — large players selling into retail buying. The inability to make new highs despite upward momentum is a warning sign. Watch for a reversal candle.',
  },
  {
    id: 3, type: 'chart',
    candles: [
      {o:100,c:103,h:105,l:99},{o:103,c:105,h:107,l:102},{o:105,c:104,h:108,l:103},
      {o:104,c:106,h:109,l:103},{o:106,c:109,h:111,l:105},
    ],
    question: 'Nifty making higher highs and higher lows consistently. Current candle breaks above the previous high with a strong body. What is the probable next move?',
    options: [
      { id: 'a', text: 'Reversal — too extended, expect pullback immediately' },
      { id: 'b', text: 'Continuation of the uptrend' },
      { id: 'c', text: 'Sideways — consolidation needed before moving higher' },
      { id: 'd', text: 'Sharp breakdown — breakouts often fail' },
    ],
    answer: 'b',
    explanation: 'Consistent higher highs and higher lows define an uptrend. A clean breakout with a strong body above previous high confirms momentum. The path of least resistance is higher. Trade with the trend, not against it.',
  },
  {
    id: 4, type: 'chart',
    candles: [
      {o:105,c:101,h:106,l:99},{o:101,c:103,h:104,l:100},{o:103,c:101,h:105,l:100},
      {o:101,c:102,h:104,l:100},{o:102,c:100,h:104,l:98},
    ],
    question: 'Price has been moving sideways for 4 candles with decreasing range. The last candle just closed below the range low. What is the probable move?',
    options: [
      { id: 'a', text: 'Immediate bounce back into the range' },
      { id: 'b', text: 'Continuation lower — range breakout to the downside' },
      { id: 'c', text: 'Strong reversal up — breakdown was a fakeout' },
      { id: 'd', text: 'Impossible to tell — need more data' },
    ],
    answer: 'b',
    explanation: 'A consolidation range breakout to the downside after shrinking volatility is a classic momentum signal. The coiled spring has released downward. While fakeouts happen, the higher-probability trade is to follow the breakout direction.',
  },
  {
    id: 5, type: 'chart',
    candles: [
      {o:100,c:108,h:110,l:99},{o:108,c:114,h:116,l:107},{o:114,c:112,h:117,l:110},
      {o:112,c:113,h:115,l:109},{o:113,c:110,h:115,l:108},
    ],
    question: 'After two strong bullish candles, the last 3 candles show upper wicks and closing near their lows. What is price likely doing?',
    options: [
      { id: 'a', text: 'Accumulating before another leg up' },
      { id: 'b', text: 'Facing selling pressure — potential reversal' },
      { id: 'c', text: 'Strong support at current level, buy opportunity' },
      { id: 'd', text: 'Normal pause in an uptrend, no concern' },
    ],
    answer: 'b',
    explanation: 'Upper wicks with closes near the low indicate sellers are overwhelming buyers at the highs. This is a sign of distribution or rejection. After a sharp move up, this pattern often precedes a pullback or reversal.',
  },
]

export default function MarketDirectionPage() {
  return (
    <GameEngine
      title="Market Direction"
      tag="Price Action"
      tagColor="text-emerald-400"
      description="Given the last 5 candles, predict what happens next. Trains your ability to read price structure and momentum shifts."
      questions={questions}
    />
  )
}
