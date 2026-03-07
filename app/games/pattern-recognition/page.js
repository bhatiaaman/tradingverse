import GameEngine from '../../components/GameEngine'

const questions = [
  {
    id: 1, type: 'chart',
    candles: [
      {o:100,c:106,h:108,l:99},{o:106,c:110,h:112,l:105},{o:110,c:108,h:115,l:107},
      {o:108,c:104,h:110,l:103},{o:104,c:100,h:106,l:99},
    ],
    question: 'Price made a new high, pulled back, made a slightly lower high, then pulled back again. What pattern is likely forming?',
    options: [
      { id: 'a', text: 'Bull flag — expect breakout higher' },
      { id: 'b', text: 'Double top — bearish reversal pattern' },
      { id: 'c', text: 'Ascending triangle — bullish continuation' },
      { id: 'd', text: 'Head and shoulders — distribution pattern' },
    ],
    answer: 'b',
    explanation: 'Two peaks at similar levels with a pullback in between is a double top — a bearish reversal pattern. The neckline break confirms it. Target is typically the height of the pattern subtracted from the neckline. Watch for volume declining on the second peak.',
  },
  {
    id: 2, type: 'chart',
    candles: [
      {o:108,c:103,h:109,l:101},{o:103,c:100,h:104,l:98},{o:100,c:102,h:103,l:99},
      {o:102,c:104,h:105,l:101},{o:104,c:108,h:109,l:103},
    ],
    question: 'After a sharp decline, price forms a narrow sideways range for 2 candles, then breaks upward with a strong candle. What pattern is this?',
    options: [
      { id: 'a', text: 'Bear flag — expect continuation lower' },
      { id: 'b', text: 'Bull flag — bullish continuation pattern' },
      { id: 'c', text: 'Inverse head and shoulders — major reversal' },
      { id: 'd', text: 'Base breakout — fresh accumulation' },
    ],
    answer: 'a',
    explanation: 'A sharp decline (flagpole) followed by a tight sideways consolidation before breaking lower is a bear flag — one of the most reliable continuation patterns. The tight consolidation represents trapped longs before the next leg down. The pattern breaks in the direction of the prior move.',
  },
  {
    id: 3, type: 'chart',
    candles: [
      {o:100,c:97,h:101,l:95},{o:97,c:94,h:98,l:92},{o:94,c:97,h:98,l:93},
      {o:97,c:94,h:99,l:93},{o:94,c:99,h:100,l:93},
    ],
    question: 'Price declines to a support, bounces, declines again to the same support, then bounces again with a strong bullish candle. What pattern is this?',
    options: [
      { id: 'a', text: 'Double bottom — bullish reversal' },
      { id: 'b', text: 'Descending triangle — bearish continuation' },
      { id: 'c', text: 'Bear flag — temporary pause before lower' },
      { id: 'd', text: 'Triple bottom — needs one more test' },
    ],
    answer: 'a',
    explanation: 'Two touches at the same support level followed by a bounce is a double bottom — a classic bullish reversal. The pattern is confirmed when price breaks above the "neckline" (the peak between the two bottoms). The second bottom often shows less volume, indicating selling pressure is exhausted.',
  },
  {
    id: 4, type: 'chart',
    candles: [
      {o:98,c:102,h:104,l:97},{o:102,c:104,h:106,l:101},{o:104,c:103,h:108,l:102},
      {o:103,c:105,h:107,l:102},{o:105,c:104,h:110,l:104},
    ],
    question: 'Price is making higher lows consistently, but hitting the same resistance level multiple times without breaking through. What pattern is this?',
    options: [
      { id: 'a', text: 'Symmetrical triangle — direction unclear' },
      { id: 'b', text: 'Descending triangle — bearish, expect breakdown' },
      { id: 'c', text: 'Ascending triangle — bullish, expect breakout above resistance' },
      { id: 'd', text: 'Rectangle — neutral consolidation' },
    ],
    answer: 'c',
    explanation: 'Higher lows compressing against a flat resistance = ascending triangle. This is a bullish pattern because buyers are getting more aggressive (higher lows) while sellers are defending the same level. Eventually buyers win. A breakout above resistance with volume confirms the pattern.',
  },
  {
    id: 5, type: 'chart',
    candles: [
      {o:100,c:106,h:108,l:99},{o:106,c:112,h:114,l:105},{o:112,c:106,h:114,l:104},
      {o:106,c:110,h:112,l:105},{o:110,c:104,h:112,l:103},
    ],
    question: 'Price makes a strong rally, forms a high, pulls back to the midpoint of the rally, then makes a lower high before declining. What does this suggest?',
    options: [
      { id: 'a', text: 'Bullish flag — buy the pullback' },
      { id: 'b', text: 'Failed breakout — price is likely to continue lower' },
      { id: 'c', text: 'Normal retracement in an uptrend — no concern' },
      { id: 'd', text: 'Head and shoulders right shoulder forming' },
    ],
    answer: 'b',
    explanation: 'A failed breakout (rally followed by a lower high) is a bearish signal. Price could not sustain the move and is now making lower highs — the definition of a downtrend beginning. Retail traders often buy the "dip" here, not realizing the structure has changed.',
  },
]

export default function PatternRecognitionPage() {
  return (
    <GameEngine
      title="Pattern Recognition"
      tag="Technical Analysis"
      tagColor="text-violet-400"
      description="Identify the chart pattern before it plays out. From classic reversals to continuation patterns."
      questions={questions}
    />
  )
}
