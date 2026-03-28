// ─── VIX Messaging — single source of truth ───────────────────────────────────
// India VIX bands:
//   Very Low  < 11    — extreme complacency
//   Low       11–14   — calm, below historical average
//   Normal    14–18   — no interrupt (healthy range)
//   Elevated  18–22   — caution (premium expanding)
//   High      22–28   — warning (significant fear)
//   Extreme   > 28    — danger (crisis / panic)
//
// Instrument keys: EQ_BUY, EQ_SELL, CE_BUY, CE_SELL, PE_BUY, PE_SELL
//
// Usage:
//   import { getVIXInsight } from '@/app/lib/vix-messaging'
//   const insight = getVIXInsight(vix, instrumentType, transactionType)
//   // insight = { band, severity, riskScore, title, detail } | null

const BANDS = {
  VERY_LOW: { min: 0,  max: 11,  severity: 'info',    riskScore: 0  },
  LOW:      { min: 11, max: 14,  severity: 'info',    riskScore: 0  },
  NORMAL:   { min: 14, max: 18,  severity: null,       riskScore: 0  },
  ELEVATED: { min: 18, max: 22,  severity: 'caution', riskScore: 8  },
  HIGH:     { min: 22, max: 28,  severity: 'warning', riskScore: 18 },
  EXTREME:  { min: 28, max: Infinity, severity: 'warning', riskScore: 25 },
};

function getBand(vix) {
  for (const [name, b] of Object.entries(BANDS)) {
    if (vix >= b.min && vix < b.max) return name;
  }
  return 'EXTREME';
}

// Per-band, per-instrument messages.
// null means "no interrupt" for that combo.
const MESSAGES = {
  VERY_LOW: {
    EQ_BUY:  null,
    EQ_SELL: { title: 'VIX very low — equity shorts face headwinds',
               detail: 'India VIX below 11. Market is extremely complacent — trending higher. Shorting in low-vol uptrends usually ends badly. Be very selective.' },
    CE_BUY:  { title: 'VIX very low — calls are cheap but slow',
               detail: 'India VIX below 11. Call premiums are low (great cost), but slow grinding markets mean theta will erode your position fast. Directional move must be sharp.' },
    CE_SELL: { title: 'VIX very low — thin premium for call sellers',
               detail: 'India VIX below 11. Low IV means you collect very little premium. Risk-reward for selling calls is unfavourable right now.' },
    PE_BUY:  { title: 'VIX very low — puts are cheap but hard to time',
               detail: 'India VIX below 11. Fear is absent. Puts cost little but timing a reversal in a complacent, trending market is very difficult. High theta-burn risk.' },
    PE_SELL: { title: 'VIX very low — ideal environment for put sellers',
               detail: 'India VIX below 11. Complacent market, high win-rate for premium sellers. Premium is thin but the probability of expiry worthless is very high.' },
  },

  LOW: {
    EQ_BUY:  null,
    EQ_SELL: { title: 'VIX low — calm market favours longs over shorts',
               detail: 'India VIX 11–14. Low-volatility regimes tend to trend higher. Shorting equities here requires a strong catalyst.' },
    CE_BUY:  null,
    CE_SELL: { title: 'VIX low — selling calls yields modest premium',
               detail: 'India VIX 11–14. Premium is below average. Call sellers earn less but risk of violent gap-up is also reduced. Reasonable environment.' },
    PE_BUY:  { title: 'VIX low — put buying faces theta headwind',
               detail: 'India VIX 11–14. Puts are inexpensive but low fear means the market may not provide the down-move needed to overcome decay.' },
    PE_SELL: { title: 'VIX low — good conditions for put sellers',
               detail: 'India VIX 11–14. Calm market favours premium collection. Maintain defined-risk structures (spreads) to stay protected if VIX spikes.' },
  },

  NORMAL: {}, // all null — no interrupt

  ELEVATED: {
    EQ_BUY:  { title: (v) => `VIX elevated (${v}) — size down on equity longs`,
               detail: (v) => `India VIX at ${v} — above the 14–18 normal range. Price gaps and whipsaws are more frequent. Consider buying with a defined stop and reduce size by 20–30%.` },
    EQ_SELL: { title: (v) => `VIX elevated (${v}) — volatility cuts both ways`,
               detail: (v) => `India VIX at ${v}. Elevated volatility benefits shorts when trend is down, but sharp counter-rallies are common. Wider stop needed — or tighter size.` },
    CE_BUY:  { title: (v) => `VIX elevated (${v}) — you're paying above-average premium`,
               detail: (v) => `India VIX at ${v}. Call premiums are inflated vs the 14–18 normal range. The move must be decisive and fast to overcome IV drag and theta. Consider bull spreads.` },
    CE_SELL: { title: (v) => `VIX elevated (${v}) — good premium for call sellers`,
               detail: (v) => `India VIX at ${v}. Above-average premium creates a cushion for sellers. But elevated VIX also means sharper moves are possible — keep a hedge or stop in place.` },
    PE_BUY:  { title: (v) => `VIX elevated (${v}) — puts are pricier than usual`,
               detail: (v) => `India VIX at ${v}. Put premiums are above average. A real move down will pay off, but don't chase premium spikes — wait for a confirmed reversal signal first.` },
    PE_SELL: { title: (v) => `VIX elevated (${v}) — put selling in rising VIX is risky`,
               detail: (v) => `India VIX at ${v} and possibly rising. Selling puts as VIX expands is catching a falling knife — a sharp leg down can blow past your strike quickly. Use spreads, not naked puts.` },
  },

  HIGH: {
    EQ_BUY:  { title: (v) => `VIX high (${v}) — catching falling knives is dangerous`,
               detail: (v) => `India VIX at ${v}. Significant fear in the market. Long equity positions face elevated gap risk. Wait for VIX to stabilise below 20 before adding. Cut size 30–50%.` },
    EQ_SELL: { title: (v) => `VIX high (${v}) — short-selling in panic: size down sharply`,
               detail: (v) => `India VIX at ${v}. Shorting works in fear regimes but counter-rallies are violent. Reduce to 30–50% of normal size. Trail stop aggressively.` },
    CE_BUY:  { title: (v) => `VIX high (${v}) — call buyers pay a steep premium`,
               detail: (v) => `India VIX at ${v}. Very expensive premiums mean you need a sharp, fast directional move. A slow or sideways market will destroy the trade through IV crush + theta. Prefer bull call spreads.` },
    CE_SELL: { title: (v) => `VIX high (${v}) — naked call selling is extremely dangerous`,
               detail: (v) => `India VIX at ${v}. Panic often ends in violent short-covering spikes. Naked call selling has unlimited risk here. Use call spreads or avoid entirely.` },
    PE_BUY:  { title: (v) => `VIX high (${v}) — puts are expensive, but move can pay`,
               detail: (v) => `India VIX at ${v}. Downside moves in high-VIX regimes can be fast and large — puts can pay well. Set a target and exit; don't hold through a VIX mean-reversion bounce.` },
    PE_SELL: { title: (v) => `VIX high (${v}) — selling puts is very high risk`,
               detail: (v) => `India VIX at ${v}. A panic leg down can blow through strikes in one session. Naked put selling is reckless at this VIX level. Use wide defined-risk spreads only.` },
  },

  EXTREME: {
    EQ_BUY:  { title: (v) => `VIX extreme (${v}) — possible capitulation, but extreme risk`,
               detail: (v) => `India VIX above 28 — market in panic mode. This may be a capitulation entry, but value traps are common at peaks. Only risk capital you can afford to lose. Size 50%+ below normal.` },
    EQ_SELL: { title: (v) => `VIX extreme (${v}) — maximum fear, but reversals are violent`,
               detail: (v) => `India VIX above 28. Shorting captures maximum fear premium, but crisis reversals spike 5–10% in a day. Trail stop tightly. Do not hold short into stabilisation.` },
    CE_BUY:  { title: (v) => `VIX extreme (${v}) — IV crush will devastate call buyers`,
               detail: (v) => `India VIX above 28. Call premiums are at crisis levels — any stabilisation triggers massive IV crush. Even if direction is right, the trade can lose money. Spreads strongly preferred.` },
    CE_SELL: { title: (v) => `VIX extreme (${v}) — do NOT sell naked calls`,
               detail: (v) => `India VIX above 28. Short squeezes in extreme-VIX environments are violent and fast. Unlimited risk is unacceptable here. Avoid completely or use tight spreads only.` },
    PE_BUY:  { title: (v) => `VIX extreme (${v}) — expensive puts, massive IV crush risk`,
               detail: (v) => `India VIX above 28. Puts pay off handsomely if the crash continues — but any hint of stabilisation causes immediate, massive IV crush. Set a target and exit quickly; don't get greedy.` },
    PE_SELL: { title: (v) => `VIX extreme (${v}) — STOP: selling puts here is catastrophic risk`,
               detail: (v) => `India VIX above 28. A single panic leg down can wipe out months of premium collected. Naked put selling at extreme VIX is one of the most dangerous trades possible. Avoid completely.` },
  },
};

/**
 * Returns a VIX insight object for the given order context, or null if no
 * message applies (normal range, or buyer in very-low/low bands).
 *
 * @param {number} vix               India VIX value
 * @param {string} instrumentType    CE | PE | EQ | FUT
 * @param {string} transactionType   BUY | SELL
 * @returns {{ band, severity, riskScore, title, detail } | null}
 */
export function getVIXInsight(vix, instrumentType = 'EQ', transactionType = 'BUY') {
  if (vix == null || isNaN(vix)) return null;

  const band     = getBand(vix);
  const bandMeta = BANDS[band];
  if (!bandMeta.severity) return null; // NORMAL → no interrupt

  const key     = `${instrumentType}_${transactionType}`;
  const msg     = MESSAGES[band]?.[key] ?? null;
  if (!msg) return null;

  const v = vix.toFixed(1);
  return {
    band,
    severity:  bandMeta.severity,
    riskScore: bandMeta.riskScore,
    title:  typeof msg.title  === 'function' ? msg.title(v)  : msg.title,
    detail: typeof msg.detail === 'function' ? msg.detail(v) : msg.detail,
  };
}
