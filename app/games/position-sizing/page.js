import GameEngine from '../../components/GameEngine'

const questions = [
  {
    id: 1, type: 'context',
    context: [
      { label: 'Stock',     value: 'Reliance',          bad: false },
      { label: 'Position',  value: 'Half lot @ ₹2,800', bad: false },
      { label: 'Current',   value: '₹2,912 (+4%)',      bad: false },
      { label: 'Trend',     value: 'Strong — above all EMAs', bad: false },
    ],
    question: 'Your Reliance position is up 4%. Trend is intact, volume strong, and next resistance is ₹3,050. You have capital to add another half lot. What do you do?',
    options: [
      { id: 'a', text: 'Add the second half — pyramid into the strength' },
      { id: 'b', text: 'Hold as-is — don\'t add to an already profitable trade' },
      { id: 'c', text: 'Book 50% profit first, then maybe add later' },
      { id: 'd', text: 'Exit full — it\'s run enough' },
    ],
    answer: 'a',
    explanation: 'Pyramiding — adding to winning positions — is how big traders make big money. Your trade is already validated by price action. Adding here with a trail stop ensures you participate fully in the move. The error most traders make is doing the opposite: adding to losers instead.',
  },
  {
    id: 2, type: 'context',
    context: [
      { label: 'Stock',     value: 'HDFC Bank',          bad: false },
      { label: 'Position',  value: 'Bought @ ₹1,600',   bad: false },
      { label: 'Current',   value: '₹1,544 (-3.5%)',    bad: true  },
      { label: 'Thought',   value: '"Great bank, will bounce"', bad: true },
    ],
    question: 'HDFC Bank is down 3.5% from your entry. No stop was placed. You believe the fundamentals are strong. A colleague suggests averaging down to "lower your cost". What do you do?',
    options: [
      { id: 'a', text: 'Average down — lowers cost basis, good long-term bank' },
      { id: 'b', text: 'Hold and wait — sell only if it drops another 5%' },
      { id: 'c', text: 'Exit now — no stop, no plan, accept the loss' },
      { id: 'd', text: 'Average down with half the position only' },
    ],
    answer: 'c',
    explanation: 'Averaging down on a losing trade without a stop is the #1 account-killer. "Great company" is not a trading plan. You had no stop — that means you had no defined risk. Exit, reset, and re-enter only if a new valid setup appears. Throwing more money at a loser doubles your exposure to a broken trade.',
  },
  {
    id: 3, type: 'context',
    context: [
      { label: 'Trade',     value: 'Nifty 22500 CE',     bad: false },
      { label: 'Bought at', value: '₹95 (2 lots)',       bad: false },
      { label: 'Now',       value: '₹148 (+55%)',        bad: false },
      { label: 'Setup',     value: 'Consolidating near day high', bad: false },
    ],
    question: 'Your Nifty CE is up 55%. It\'s consolidating near the day high with 3 hours left. Nifty momentum is still bullish. You have margin for 2 more lots. What\'s your move?',
    options: [
      { id: 'a', text: 'Add 1 lot — partial pyramid with a tight stop' },
      { id: 'b', text: 'Add 2 lots — momentum is strong, go full size' },
      { id: 'c', text: 'Hold existing, no add — options are risky enough' },
      { id: 'd', text: 'Book 50%, add nothing' },
    ],
    answer: 'a',
    explanation: 'Adding 1 lot (not 2) is disciplined pyramiding. Options theta and gamma risk mean you don\'t go all-in on an add. A single-lot add with a tight stop on the add-on position lets you participate in further upside without putting your original 55% gain at risk. Full 2-lot add turns a controlled trade into an aggressive bet.',
  },
  {
    id: 4, type: 'context',
    context: [
      { label: 'Trade',     value: 'BankNifty Futures',  bad: false },
      { label: 'Entry',     value: '₹46,200 (long)',     bad: false },
      { label: 'Current',   value: '₹45,650 (-₹27,500)', bad: true },
      { label: 'Expiry',    value: 'Tomorrow',            bad: true },
    ],
    question: 'You\'re losing ₹27,500 on a BankNifty futures position expiring tomorrow. A friend says "add another lot at this level — it\'s a great average." What do you do?',
    options: [
      { id: 'a', text: 'Add one lot — ₹45,650 is a strong support zone' },
      { id: 'b', text: 'Hold and hope — don\'t add, don\'t exit' },
      { id: 'c', text: 'Exit the position — don\'t add to a loser near expiry' },
      { id: 'd', text: 'Add half lot and place a stop below support' },
    ],
    answer: 'c',
    explanation: 'Adding to a losing futures position with one day to expiry is extremely dangerous. Expiry-day volatility can spike and wipe you out before any recovery. The math of "averaging" works on paper but requires time — which you don\'t have. Cut the loss, protect capital, and trade again tomorrow with a fresh setup.',
  },
  {
    id: 5, type: 'context',
    context: [
      { label: 'Stock',     value: 'Tata Motors',        bad: false },
      { label: 'Position',  value: '100 shares @ ₹840',  bad: false },
      { label: 'Current',   value: '₹893 (+6.3%)',       bad: false },
      { label: 'Breakout',  value: 'Just crossed ₹890 resistance on volume', bad: false },
    ],
    question: 'Tata Motors just broke above a major resistance of ₹890 on strong volume. You already have 100 shares from ₹840. The next target is ₹960. Do you add?',
    options: [
      { id: 'a', text: 'Add 50 shares — breakout confirms the trade idea' },
      { id: 'b', text: 'Don\'t add — it\'s already up 6%, too late' },
      { id: 'c', text: 'Sell half and add back on a retest' },
      { id: 'd', text: 'Wait for a pullback to ₹870 before adding' },
    ],
    answer: 'a',
    explanation: 'A volume-confirmed breakout above a major resistance is a textbook pyramid entry. Your original trade is already right. Adding 50 shares (half the original size — smaller adds as price goes higher) is the professional move. Waiting for a pullback to ₹870 means missing the move; pulling back that far would suggest the breakout failed.',
  },
  {
    id: 6, type: 'context',
    context: [
      { label: 'Stock',     value: 'Zomato',             bad: false },
      { label: 'Bought',    value: '500 shares @ ₹220',  bad: false },
      { label: 'Current',   value: '₹196 (-10.9%)',      bad: true  },
      { label: 'Stop',      value: 'Was ₹208 — ignored', bad: true  },
    ],
    question: 'Zomato is down 11% from your entry. Your original stop was ₹208 but you didn\'t take it. Now at ₹196, you\'re thinking of buying 500 more shares to "average down to ₹208". What should you do?',
    options: [
      { id: 'a', text: 'Average down — ₹208 average is more manageable' },
      { id: 'b', text: 'Average down with just 250 shares' },
      { id: 'c', text: 'Exit the full position — you already missed your stop' },
      { id: 'd', text: 'Hold without adding — let it recover to ₹208' },
    ],
    answer: 'c',
    explanation: 'You already violated your own risk rule by not taking the stop at ₹208. Averaging down now doubles your exposure to a stock that has already proven you wrong by 11%. The correct lesson: when you miss a stop, exit at market — don\'t compound the mistake by adding size. The loss is real. Capital preservation matters more than being right.',
  },
  {
    id: 7, type: 'context',
    context: [
      { label: 'Stock',     value: 'IndiGo Airlines',    bad: false },
      { label: 'Position',  value: '200 shares @ ₹3,100', bad: false },
      { label: 'Current',   value: '₹3,280 (+5.8%)',    bad: false },
      { label: 'Signal',    value: 'Pullback to 20 EMA, held and bounced', bad: false },
    ],
    question: 'IndiGo pulled back to the 20 EMA and has bounced cleanly. You\'re already up 5.8% on your initial position. This pullback-hold is a classic pyramid add signal. What do you do?',
    options: [
      { id: 'a', text: 'Add 100 shares — pullback to EMA with bounce is ideal add point' },
      { id: 'b', text: 'Don\'t add — you\'re already profitable, protect the gain' },
      { id: 'c', text: 'Exit 50% and add 100 shares simultaneously' },
      { id: 'd', text: 'Wait for new highs before adding' },
    ],
    answer: 'a',
    explanation: 'A pullback to the 20 EMA that holds and bounces is the highest-probability pyramid entry in a trending stock. You\'re adding into a confirmed trend, at a logical support level, with price showing demand. This is exactly how professional traders scale in — not on the initial entry, but on validated continuation signals. Waiting for new highs to add means poor risk:reward.',
  },
  {
    id: 8, type: 'context',
    context: [
      { label: 'Stock',     value: 'IRCTC',              bad: false },
      { label: 'Bought',    value: '300 shares @ ₹740',  bad: false },
      { label: 'Current',   value: '₹698 (-5.7%)',       bad: true  },
      { label: 'Reasoning', value: '"Travel season coming — it will bounce"', bad: true },
    ],
    question: 'IRCTC is down 5.7% from your entry. You have no stop placed. Your reasoning is that travel season is upcoming so it will recover. A friend recommends adding 300 more shares. What do you do?',
    options: [
      { id: 'a', text: 'Add 300 shares — travel thesis is still valid' },
      { id: 'b', text: 'Add 150 shares only as a test' },
      { id: 'c', text: 'Don\'t add — but hold the existing position' },
      { id: 'd', text: 'Exit — no stop, thesis-based holding is not trading' },
    ],
    answer: 'd',
    explanation: '"Travel season will boost it" is a narrative, not a trade setup. Markets price in future events long before they happen. Trading on a narrative without a stop is not trading — it\'s hoping. The 5.7% loss is already a signal that the market disagrees with your thesis right now. Exit, wait for price action to confirm the thesis before re-entering.',
  },
]

export default function PositionSizingPage() {
  return (
    <GameEngine
      title="Pyramid or Average?"
      tag="Trade Management"
      tagColor="text-orange-400"
      description="Do you add to winning positions or losing ones? This game exposes the most dangerous habit in trading — and trains you to build positions the right way."
      questions={questions}
    />
  )
}
