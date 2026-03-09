import GameEngine from '../../components/GameEngine'

const questions = [
  {
    id: 1, type: 'context',
    context: [
      { label: 'Trade',     value: 'Nifty long (futures)',  bad: false },
      { label: 'P&L',       value: '+₹9,200 (+3.1%)',      bad: false },
      { label: 'Trend',     value: 'Bullish — no resistance nearby', bad: false },
      { label: 'Feeling',   value: '"Book it before it reverses"', bad: true },
    ],
    question: 'Your Nifty long is up ₹9,200. Trend is intact, no resistance in sight for another 80 points. You feel the urge to book and "protect the profit." What should you do?',
    options: [
      { id: 'a', text: 'Book fully — a profit booked is a profit earned' },
      { id: 'b', text: 'Trail the stop to breakeven and hold the position' },
      { id: 'c', text: 'Book 50% now, trail stop on the rest' },
      { id: 'd', text: 'Exit and re-enter on a dip' },
    ],
    answer: 'b',
    explanation: 'The urge to book profits when a trade has room to run is called the Disposition Effect — a well-documented cognitive bias. Trailing your stop to breakeven removes all risk while letting the winner run. Exiting "before it reverses" is fear-based decision making, not strategy. Winners should be held until price tells you to exit — not until your emotions do.',
  },
  {
    id: 2, type: 'context',
    context: [
      { label: 'Stock',     value: 'SBI',                  bad: false },
      { label: 'Position',  value: 'Long @ ₹820',          bad: false },
      { label: 'Current',   value: '₹793 (-3.3%)',         bad: true  },
      { label: 'Thought',   value: '"Still in the range, just needs time"', bad: true },
    ],
    question: 'SBI is down 3.3% from your entry. Your stop was ₹805 but you reasoned it was "still in the range." It\'s been 3 days. What is the correct action?',
    options: [
      { id: 'a', text: 'Hold — it\'s a PSU bank, it will recover' },
      { id: 'b', text: 'Average down to ₹780 to lower cost basis' },
      { id: 'c', text: 'Exit — you\'ve already violated your stop, cut the loss' },
      { id: 'd', text: 'Place a stop at ₹780 now and give it more room' },
    ],
    answer: 'c',
    explanation: 'You had a stop at ₹805 and didn\'t take it. Three days later you\'re even deeper in the loss. "Giving it more room" now is moving goalposts — a classic way of turning a small loss into a catastrophic one. The lesson: a stop is only useful if you actually take it. Exit now, learn from the miss, and define your stop before entering next time.',
  },
  {
    id: 3, type: 'context',
    context: [
      { label: 'Trade',     value: 'Swing long — Infosys',  bad: false },
      { label: 'Entry',     value: '₹1,720 (3 days ago)',   bad: false },
      { label: 'Current',   value: '₹1,856 (+7.9%)',        bad: false },
      { label: 'Target',    value: '₹1,920 (set at entry)',  bad: false },
    ],
    question: 'Infosys is up 7.9% on your swing trade. Your original target was ₹1,920. You\'re now feeling nervous and tempted to book before the target. What is the disciplined move?',
    options: [
      { id: 'a', text: 'Book all — 7.9% is great, don\'t get greedy' },
      { id: 'b', text: 'Hold for the full ₹1,920 target — trust your plan' },
      { id: 'c', text: 'Book 50% at current price, trail stop for the rest' },
      { id: 'd', text: 'Raise the target to ₹1,980 — momentum is strong' },
    ],
    answer: 'c',
    explanation: 'Booking 50% locks in a strong gain while removing anxiety about giving it all back. The remaining half rides toward your original target with a trailing stop. This is the professional middle ground: neither exit too early (full book at 7.9%) nor hold through anxiety without a plan. Pre-defined targets should be respected, but partial booking with a trail is even better.',
  },
  {
    id: 4, type: 'context',
    context: [
      { label: 'Stock',     value: 'Paytm',                bad: false },
      { label: 'Bought',    value: '500 shares @ ₹760',    bad: false },
      { label: 'Current',   value: '₹612 (-19.5%)',        bad: true  },
      { label: 'Reason',    value: '"Fintech turnaround story"', bad: true },
    ],
    question: 'You\'re down 19.5% on Paytm. Your original thesis was a fintech turnaround. The stock has been falling for 6 weeks. You\'ve been adding on the way down. What do you do now?',
    options: [
      { id: 'a', text: 'Hold — turnaround stories take time' },
      { id: 'b', text: 'Add one final tranche — this is the bottom for sure' },
      { id: 'c', text: 'Exit the full position — thesis-based averaging has failed' },
      { id: 'd', text: 'Sell 50% to reduce exposure, hold the rest' },
    ],
    answer: 'c',
    explanation: 'Six weeks of falling, repeated averaging, 19.5% down — this is the disposition effect in full display. "Turnaround story" doesn\'t protect you from further downside. The market has disagreed with your thesis for 6 weeks. Exiting may feel like admitting defeat, but it frees capital for setups that are actually working. Losers should be cut; only then can winners be held.',
  },
  {
    id: 5, type: 'context',
    context: [
      { label: 'Trade',     value: 'Nifty 50 day trade',   bad: false },
      { label: 'P&L',       value: '+₹4,100 (up 1.8%)',   bad: false },
      { label: 'Time',      value: '11:45 AM (3 hrs left)', bad: false },
      { label: 'Trend',     value: 'Intact — above VWAP', bad: false },
    ],
    question: 'You\'re up ₹4,100 on an intraday Nifty trade with 3 hours left in the session. Trend intact, above VWAP. Your target was ₹7,000. You feel satisfied and want to close early. What\'s right?',
    options: [
      { id: 'a', text: 'Book — ₹4,100 is a great day, don\'t push it' },
      { id: 'b', text: 'Raise stop to ₹2,000 profit and hold for target' },
      { id: 'c', text: 'Book 50%, trail stop on the rest to target' },
      { id: 'd', text: 'Exit and re-enter after lunch consolidation' },
    ],
    answer: 'c',
    explanation: '"I\'m satisfied with this profit" is not a trading signal. You had a plan — ₹7,000 target — and price hasn\'t told you to exit. Booking 50% satisfies the psychological need to lock in gains while the trailing stop on the rest keeps you in the trade if momentum continues. Exiting and re-entering adds transaction cost and execution risk for no reason.',
  },
  {
    id: 6, type: 'context',
    context: [
      { label: 'Option',    value: 'BankNifty 47000 PE',   bad: false },
      { label: 'Bought',    value: '₹210 (yesterday)',     bad: false },
      { label: 'Now',       value: '₹118 (-43%)',          bad: true  },
      { label: 'Expiry',    value: '2 days away',          bad: true  },
    ],
    question: 'Your BankNifty put option has decayed 43% in premium. Expiry is in 2 days. You believe BankNifty will fall but it hasn\'t moved. Do you hold or exit?',
    options: [
      { id: 'a', text: 'Hold — if BankNifty falls even 200 pts, I recover' },
      { id: 'b', text: 'Add more puts — double down on the view' },
      { id: 'c', text: 'Exit — theta is destroying premium daily, salvage what\'s left' },
      { id: 'd', text: 'Wait until tomorrow morning to decide' },
    ],
    answer: 'c',
    explanation: 'With 2 days to expiry, theta decay accelerates exponentially. Your option loses value every minute even if BankNifty doesn\'t move. Holding a 43%-down option "because the view is still valid" ignores the reality of time decay. Exit and salvage ₹118 today rather than ₹20 tomorrow. Views can be right and trades can still lose — time is your enemy here.',
  },
  {
    id: 7, type: 'context',
    context: [
      { label: 'Stock',     value: 'Tata Steel',           bad: false },
      { label: 'P&L',       value: '+₹18,000 (+8.2%)',    bad: false },
      { label: 'News',      value: 'Mildly negative analyst note', bad: false },
      { label: 'Price',     value: 'Barely moved on the news', bad: false },
    ],
    question: 'You\'re up ₹18,000 on Tata Steel when a mildly negative analyst note drops. The stock barely reacts — down 0.3%. Your instinct is to book before it gets worse. What should you do?',
    options: [
      { id: 'a', text: 'Book immediately — news can accelerate any time' },
      { id: 'b', text: 'Hold — price barely reacted, trend is intact' },
      { id: 'c', text: 'Book 30% as protection against news risk' },
      { id: 'd', text: 'Place a tighter stop 2% below current price and hold' },
    ],
    answer: 'd',
    explanation: 'Price barely reacted to the negative note — that\'s actually a bullish signal (bad news not scaring sellers). Don\'t let a narrative spook you out of a winning trade that price is defending. Tightening your stop protects most of the ₹18,000 gain while letting the trade run if the trend continues. Selling winners on noise is how traders leave the bulk of their gains on the table.',
  },
  {
    id: 8, type: 'context',
    context: [
      { label: 'Portfolio',  value: '5 open positions',   bad: false },
      { label: 'Position A', value: '+₹22,000 (+9%)',     bad: false },
      { label: 'Position B', value: '-₹8,500 (-4%)',      bad: true  },
      { label: 'Decision',   value: 'Need to free up margin', bad: false },
    ],
    question: 'You need to free up margin. You have a winner up ₹22,000 and a loser down ₹8,500. Which do you close to raise margin?',
    options: [
      { id: 'a', text: 'Close the winner — lock in the ₹22,000 profit' },
      { id: 'b', text: 'Close the loser — cut the bad position' },
      { id: 'c', text: 'Close half of each to balance the impact' },
      { id: 'd', text: 'Don\'t close either — adjust margin elsewhere' },
    ],
    answer: 'b',
    explanation: 'This is the classic disposition effect trap: traders instinctively close winners (to "lock in gains") and hold losers (to "avoid realising a loss"). The correct move is the opposite — cut the loser, ride the winner. The loser has already proven itself wrong; the winner is validating your thesis. Selling a winning trade to hold a losing one is the single most value-destructive habit in retail trading.',
  },
]

export default function ExitPsychologyPage() {
  return (
    <GameEngine
      title="Hold or Fold?"
      tag="Trading Psychology"
      tagColor="text-rose-400"
      description="Do you sell winners too early and hold losers too long? The Disposition Effect silently drains most traders' accounts. Find out if you have it."
      questions={questions}
    />
  )
}
