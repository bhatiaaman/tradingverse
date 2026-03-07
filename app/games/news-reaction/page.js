import GameEngine from '../../components/GameEngine'

const questions = [
  {
    id: 1, type: 'news',
    headline: 'RBI cuts repo rate by 25 bps — surprise move ahead of schedule',
    context: [
      { label: 'Prior expectation', value: 'No change' },
      { label: 'Nifty pre-news',    value: 'Up 0.3%' },
      { label: 'Time',              value: '10:05 AM' },
    ],
    question: 'RBI surprises with a rate cut. Nifty was already up 0.3% before the news. In the next 15 minutes, what is the most probable Nifty reaction?',
    options: [
      { id: 'a', text: 'Sharp spike up — rate cut is very bullish for equities' },
      { id: 'b', text: 'Spike up, then partial giveback as traders book profits' },
      { id: 'c', text: 'Sells off — already priced in, "sell the news"' },
      { id: 'd', text: 'No reaction — markets had already moved' },
    ],
    answer: 'b',
    explanation: 'Rate cuts are bullish for equities, so an initial spike is expected. However, after any surprise news event, the first 5-10 minutes see extreme volatility as algos react. Traders who were already long take profits into the spike, causing a partial giveback. "Buy the rumour, sell the news" applies even here.',
  },
  {
    id: 2, type: 'news',
    headline: 'US CPI comes in at 4.2% vs 3.8% expected — significantly higher than forecast',
    context: [
      { label: 'US Futures',  value: 'Down 1.4%' },
      { label: 'GIFT Nifty',  value: 'Down 120 pts' },
      { label: 'India VIX',   value: '17.2 ↑' },
    ],
    question: 'US inflation surprises to the upside. Global markets are selling off. How will Nifty likely open and trade in the first hour?',
    options: [
      { id: 'a', text: 'Flat — India is decoupled from US inflation data' },
      { id: 'b', text: 'Gap down open, likely to recover by midday' },
      { id: 'c', text: 'Gap down open, volatile, with possible further downside' },
      { id: 'd', text: 'Gap up — Indian inflation is under control, divergence play' },
    ],
    answer: 'c',
    explanation: 'High US CPI means the Fed may keep rates higher for longer — bad for global risk assets including Indian equities. With GIFT Nifty already down 120 pts and VIX elevated, expect a gap down open with continued selling pressure. Indian markets are not decoupled from major global risk-off events.',
  },
  {
    id: 3, type: 'news',
    headline: 'India Q3 GDP growth: 7.6% vs 6.8% expected — significant beat',
    context: [
      { label: 'Time',          value: '5:30 PM (after market)' },
      { label: 'Global markets', value: 'Flat to positive' },
      { label: 'FII activity',  value: 'Net buyers last 3 days' },
    ],
    question: 'India GDP beats estimates significantly, announced after market hours. Global cues are positive. How will Nifty likely open the next morning?',
    options: [
      { id: 'a', text: 'Gap down — GDP data is lagging, markets look forward' },
      { id: 'b', text: 'Flat open — already priced in from recent FII buying' },
      { id: 'c', text: 'Gap up — strong GDP + FII buying + positive global cues' },
      { id: 'd', text: 'Volatile open — uncertainty about what to do with the data' },
    ],
    answer: 'c',
    explanation: 'All three factors align bullishly — strong GDP beat (positive sentiment), FII already buying (smart money positioning), global cues positive. A gap up is the high-probability outcome. The magnitude depends on how much was already priced in, but direction is clear.',
  },
  {
    id: 4, type: 'news',
    headline: 'Crude oil spikes 9% as Middle East tensions escalate sharply',
    context: [
      { label: 'Brent Crude', value: '$95/barrel (+9%)' },
      { label: 'India imports', value: '85% of crude from Middle East' },
      { label: 'USD/INR',      value: '84.20 (+0.8%)' },
    ],
    question: 'Crude oil spikes 9% on geopolitical tensions. India imports 85% of its oil. USD/INR is already weakening. How will this impact Nifty?',
    options: [
      { id: 'a', text: 'Positive — higher crude benefits Indian energy companies' },
      { id: 'b', text: 'Neutral — India has strategic reserves to buffer the impact' },
      { id: 'c', text: 'Negative — higher import costs, inflation pressure, weak rupee' },
      { id: 'd', text: 'Positive — oil companies will rally and lift the index' },
    ],
    answer: 'c',
    explanation: 'India is a major crude importer. A 9% crude spike means higher import costs → wider current account deficit → rupee pressure → imported inflation. This is a negative macro shock for Nifty. While OMC stocks might benefit from price hike expectations, the broader index faces headwinds from macro deterioration.',
  },
  {
    id: 5, type: 'news',
    headline: 'Major Indian IT company misses Q3 earnings — revenue down 8% YoY, cuts FY guidance',
    context: [
      { label: 'Stock pre-market', value: 'Down 7% in US ADR' },
      { label: 'Sector weight',    value: 'IT = 15% of Nifty' },
      { label: 'Peer stocks',      value: 'All down 2-4% in pre-market' },
    ],
    question: 'A major IT company misses badly and cuts guidance. IT is 15% of Nifty. Peers are also falling. How do you trade Nifty at open?',
    options: [
      { id: 'a', text: 'Buy Nifty — IT weakness is stock-specific, not market-wide' },
      { id: 'b', text: 'Avoid Nifty — wait for IT stocks to settle before reading direction' },
      { id: 'c', text: 'Short Nifty immediately — IT sector drag will pull index down' },
      { id: 'd', text: 'Buy IT stocks — oversold bounce expected after the initial sell-off' },
    ],
    answer: 'b',
    explanation: 'When a 15%-weight sector is in distress at open, Nifty direction is harder to read. IT stocks often gap down sharply and then stabilize. Trading Nifty before IT finds a level is trading noise. Waiting 30 minutes for the sector to settle gives you a cleaner read on whether the selling is contained or spreading.',
  },
]

export default function NewsReactionPage() {
  return (
    <GameEngine
      title="News & Reaction"
      tag="Macro"
      tagColor="text-cyan-400"
      description="A macro event just hit the wire. How will Nifty react in the next 15 minutes? Tests your understanding of event-driven trading."
      questions={questions}
    />
  )
}
