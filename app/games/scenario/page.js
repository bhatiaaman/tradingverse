import GameEngine from '../../components/GameEngine'

const questions = [
  {
    id: 1, type: 'context',
    context: [
      { label: 'Dow Jones',  value: '-1.8%',              bad: true  },
      { label: 'GIFT Nifty', value: '-180 pts',            bad: true  },
      { label: 'India VIX',  value: '18.4 ↑',             bad: true  },
      { label: 'Nifty',      value: 'Near weekly support', bad: false },
    ],
    question: 'Gap down open expected. Nifty is near a major weekly support. 9:15 AM. What do you do?',
    options: [
      { id: 'a', text: 'Short immediately — global cues are bearish' },
      { id: 'b', text: 'Wait 15–30 mins for directional confirmation' },
      { id: 'c', text: 'Buy the dip — weekly support will hold' },
      { id: 'd', text: 'Buy straddle — direction unclear' },
    ],
    answer: 'b',
    explanation: 'Opening volatility is highest in the first 15 mins. Weekly support could attract buyers OR break further. Waiting for confirmation is the professional move. Impulsive entries at open are how accounts blow up.',
  },
  {
    id: 2, type: 'context',
    context: [
      { label: 'Dow Jones',   value: '+0.4%',         bad: false },
      { label: 'Nifty trend', value: 'Bullish 3 days', bad: false },
      { label: 'India VIX',   value: '12.1 ↓',        bad: false },
      { label: 'PCR',         value: '1.3 (bullish)',  bad: false },
    ],
    question: 'You\'re up 2% on a long trade. Target is 1.5% away. VIX is low, trend intact. What do you do?',
    options: [
      { id: 'a', text: 'Hold for full target — trend is your friend' },
      { id: 'b', text: 'Book 50% now, trail stop on the rest' },
      { id: 'c', text: 'Add more — momentum is strong' },
      { id: 'd', text: 'Exit fully — 2% is enough' },
    ],
    answer: 'b',
    explanation: 'Partial booking locks in gains while letting the trade breathe. Adding without a plan turns winners into losers. Full exit gives up potential. Partial + trailing stop is textbook risk management.',
  },
  {
    id: 3, type: 'context',
    context: [
      { label: 'Event',       value: 'RBI Policy Day',  bad: false },
      { label: 'Expectation', value: 'No rate change',  bad: false },
      { label: 'India VIX',   value: '16.8 ↑',         bad: true  },
      { label: 'Time',        value: '9:45 AM',         bad: false },
    ],
    question: 'RBI policy announcement at 10 AM. You have a profitable long position from yesterday. What do you do?',
    options: [
      { id: 'a', text: 'Hold — no rate change expected, should be fine' },
      { id: 'b', text: 'Exit before 10 AM — don\'t hold through events' },
      { id: 'c', text: 'Add more — positive outcome expected' },
      { id: 'd', text: 'Buy a put as hedge and hold the long' },
    ],
    answer: 'b',
    explanation: '"Buy the rumour, sell the news." Even if the outcome matches expectations, markets often reverse on announcement day. VIX rising signals uncertainty. Protect profits and re-enter after the event if the setup remains valid.',
  },
  {
    id: 4, type: 'context',
    context: [
      { label: 'Setup',       value: 'Breakout above resistance', bad: false },
      { label: 'Volume',      value: '3x average',                bad: false },
      { label: 'Time',        value: '11:30 AM',                  bad: false },
      { label: 'Risk',        value: 'Stop 0.8% below entry',     bad: false },
    ],
    question: 'Nifty breaks out above a key resistance level with 3x volume. You missed the initial move — it\'s now 0.4% above breakout. What do you do?',
    options: [
      { id: 'a', text: 'Enter now — strong breakout, don\'t miss it' },
      { id: 'b', text: 'Wait for a retest of the breakout level to enter' },
      { id: 'c', text: 'Skip it — already moved too much' },
      { id: 'd', text: 'Short — likely to fade back to breakout level' },
    ],
    answer: 'b',
    explanation: 'Chasing 0.4% above breakout means your stop is wide and R:R is poor. Patient traders wait for a retest of the breakout level — price comes back to confirm support, then enters with a tight stop. Discipline over FOMO.',
  },
  {
    id: 5, type: 'context',
    context: [
      { label: 'Nifty',      value: 'Down 2.1% today',   bad: true  },
      { label: 'Your trade', value: '-₹8,400 on BankNifty', bad: true },
      { label: 'Stop',       value: 'Not placed',         bad: true  },
      { label: 'Feeling',    value: 'It will recover',    bad: true  },
    ],
    question: 'You\'re in a losing BankNifty position. No stop placed. Down ₹8,400. You believe it will recover. Market has 90 mins to close. What is the right move?',
    options: [
      { id: 'a', text: 'Hold — it always recovers by end of day' },
      { id: 'b', text: 'Average down — lower your cost basis' },
      { id: 'c', text: 'Exit now — you have no stop and no plan' },
      { id: 'd', text: 'Convert to overnight position and hope' },
    ],
    answer: 'c',
    explanation: '"It will recover" is hope, not a trading plan. No stop + no plan = gambling. The loss is already real. Averaging down on a losing trade with no defined risk has blown up countless accounts. Exit, accept the lesson, come back with a plan tomorrow.',
  },
]

export default function ScenarioChallengePage() {
  return (
    <GameEngine
      title="Scenario Challenge"
      tag="Decision Making"
      tagColor="text-blue-400"
      description="Read the market context and make the right trading decision. Tests judgment under realistic conditions."
      questions={questions}
    />
  )
}
