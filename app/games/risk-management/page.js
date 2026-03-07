import GameEngine from '../../components/GameEngine'

const questions = [
  {
    id: 1, type: 'context',
    context: [
      { label: 'Position',  value: 'Long Nifty CE',     bad: false },
      { label: 'Entry',     value: '₹120',              bad: false },
      { label: 'Current',   value: '₹84 (-30%)',        bad: true  },
      { label: 'Stop set?', value: 'No',                bad: true  },
    ],
    question: 'You entered a Nifty call option at ₹120. It is now ₹84. You have no stop. Expiry is 3 days away. What do you do?',
    options: [
      { id: 'a', text: 'Hold — 3 days left, it can recover' },
      { id: 'b', text: 'Average down at ₹80 to lower cost basis' },
      { id: 'c', text: 'Exit immediately — you broke the rules, accept the loss' },
      { id: 'd', text: 'Sell half and hold half as a hedge' },
    ],
    answer: 'c',
    explanation: 'No stop = no plan. A 30% loss on an option 3 days from expiry is serious time decay risk. Averaging down on a losing option near expiry can turn a -30% loss into a -100% loss. The lesson here is to always define your stop before entering.',
  },
  {
    id: 2, type: 'context',
    context: [
      { label: 'Trade',     value: 'Short BankNifty',   bad: false },
      { label: 'Stop loss', value: '1% above entry',    bad: false },
      { label: 'P&L',       value: '+1.4% in profit',   bad: false },
      { label: 'Target',    value: '2% (not reached)',  bad: false },
    ],
    question: 'Your short trade is running at +1.4% profit. Your original target was 2%. The last candle showed a strong bullish reversal. Stop is still at original level. What do you do?',
    options: [
      { id: 'a', text: 'Hold for the full 2% target — stick to the plan' },
      { id: 'b', text: 'Trail your stop to breakeven and let it run' },
      { id: 'c', text: 'Book profit now — reversal candle is a warning' },
      { id: 'd', text: 'Add to the short — temporary bounce before continuation' },
    ],
    answer: 'c',
    explanation: 'A strong bullish reversal candle when you\'re short is the market telling you the move may be over. Booking +1.4% when you targeted 2% is not a loss — it\'s discipline. Ignoring reversal signals to hit exact targets is how profits turn into losses.',
  },
  {
    id: 3, type: 'context',
    context: [
      { label: 'Today',     value: '3 consecutive losses', bad: true  },
      { label: 'P&L',       value: '-₹12,000',             bad: true  },
      { label: 'Setup',     value: 'New signal just formed', bad: false },
      { label: 'Feeling',   value: 'Need to recover',       bad: true  },
    ],
    question: 'You\'ve had 3 consecutive losses today. Down ₹12,000. A new setup just formed that looks promising. You feel the urge to recover the loss. What do you do?',
    options: [
      { id: 'a', text: 'Take the trade — it\'s a valid setup' },
      { id: 'b', text: 'Take the trade but with double size to recover faster' },
      { id: 'c', text: 'Stop trading for today — you\'re in a losing state' },
      { id: 'd', text: 'Take the trade but reduce size to half' },
    ],
    answer: 'c',
    explanation: 'The desire to "recover" losses is one of the most dangerous states in trading. After 3 losses, your judgment is compromised — you\'re trading emotionally. The professional move is to stop, review what went wrong, and come back tomorrow. Protecting capital on bad days is a skill.',
  },
  {
    id: 4, type: 'context',
    context: [
      { label: 'Capital',   value: '₹5,00,000',              bad: false },
      { label: 'Trade',     value: 'Long Nifty Futures',      bad: false },
      { label: 'Size',      value: '5 lots (₹3.5L margin)',   bad: true  },
      { label: 'Stop',      value: '40 pts = ₹10,000 loss',   bad: false },
    ],
    question: 'Your account is ₹5 lakhs. You want to enter a Nifty trade with 5 lots. Your stop would result in a ₹10,000 (2%) loss if hit. Is this position sizing correct?',
    options: [
      { id: 'a', text: 'Yes — 2% risk per trade is standard' },
      { id: 'b', text: 'No — using 70% of capital for margin is too leveraged' },
      { id: 'c', text: 'No — position size should be even larger to maximize returns' },
      { id: 'd', text: 'Yes — more lots = more potential profit' },
    ],
    answer: 'b',
    explanation: 'While 2% risk per trade is acceptable, using 70% of capital as margin is dangerous. A few gaps or unexpected moves can trigger margin calls or force exits at worst prices. Keep margin usage under 30-40% of capital so you can withstand volatility without being forced out.',
  },
  {
    id: 5, type: 'context',
    context: [
      { label: 'Position',  value: 'Long since 9:30 AM',  bad: false },
      { label: 'Profit',    value: '+₹18,000 (3.6%)',      bad: false },
      { label: 'Time',      value: '3:10 PM',              bad: false },
      { label: 'Market',    value: 'Near day\'s high',      bad: false },
    ],
    question: 'You\'re long since the morning, sitting on ₹18,000 profit. It\'s 3:10 PM, 20 minutes to close. Market is near the day\'s high. No stop trailed. What do you do?',
    options: [
      { id: 'a', text: 'Hold overnight — strong trend, might open higher' },
      { id: 'b', text: 'Exit at least 75% before close, trail stop on rest' },
      { id: 'c', text: 'Hold till 3:25 PM, then decide' },
      { id: 'd', text: 'Add more — end of day rally likely' },
    ],
    answer: 'b',
    explanation: 'Intraday gains need to be protected before close. Holding overnight exposes you to gap risk — news, global events, anything can happen. Locking in 75%+ at 3:10 with 20 mins left is disciplined profit management. A trailing stop on the remainder costs nothing and protects a good day\'s work.',
  },
]

export default function RiskManagementPage() {
  return (
    <GameEngine
      title="Risk Management"
      tag="Risk & Psychology"
      tagColor="text-amber-400"
      description="A position is going against you. What do you do? Tests your ability to protect capital under pressure."
      questions={questions}
    />
  )
}
