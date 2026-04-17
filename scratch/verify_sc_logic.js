
const candles = [
  { low: 24000, high: 24010, close: 24005 },
  { low: 23990, high: 24005, close: 24000 }, // Day low is 23990
  { low: 24020, high: 24050, close: 24040 },
];

const snap = { spot: 24035, futOI: 1000000 };
const spot = 24045;
const futOI = 980000;

function scoreFutOIDrop(snap, futOI, spot, candles = []) {
  if (!snap || snap.futOI == null || futOI == null) {
    return { score: 0, hit: false, detail: 'No OI snapshot yet' };
  }
  
  const pctSinceSnap = ((spot - snap.spot) / snap.spot * 100);
  
  let pctSinceLow = 0;
  if (candles.length > 0) {
    const dayLow = Math.min(...candles.map(c => c.low));
    pctSinceLow = ((spot - dayLow) / dayLow * 100);
  }

  const priceMoved = pctSinceSnap > 0.03 || pctSinceLow > 0.08; 
  const oiFell     = futOI < snap.futOI * 0.985; 
  const oiPct      = snap.futOI > 0 ? ((futOI - snap.futOI) / snap.futOI * 100).toFixed(1) : '—';

  if (priceMoved && oiFell) {
    return {
      score:  4,
      hit:    true,
      detail: `Futures OI ↓${Math.abs(oiPct)}% while price up ${pctSinceLow > pctSinceSnap ? pctSinceLow.toFixed(2) : pctSinceSnap.toFixed(2)}%`,
    };
  }
  
  if (!priceMoved) {
    const bestMove = Math.max(pctSinceSnap, pctSinceLow);
    return { score: 0, hit: false, detail: `Spot expansion (+${bestMove.toFixed(2)}%) insufficient` };
  }
  return { score: 0, hit: false, detail: `Futures OI unchanged (${oiPct}%)` };
}

console.log(scoreFutOIDrop(snap, futOI, spot, candles));
