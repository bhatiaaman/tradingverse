# Third Eye — Setup Cards (Scalp Signals)

The Third Eye engine runs continuously and monitors for high-probability entry conditions on every candle close. When one is detected, a **Setup Card** appears at the bottom of the `/eye` panel. This is your actionable signal — everything above it (state, commentary, scores) is context; this card is the trigger.

---

## Where the Card Appears

Bottom of the Third Eye panel on `/eye`, below the commentary section. It replaces itself when a new setup fires and disappears when you act on it or skip it. Only one card is shown at a time — the most recent unactioned signal.

**The card only appears if:**
- Market is in primary or secondary session (9:45–11:30, 13:00–15:00)
- Engine state is not EXHAUSTED, INVALIDATED, TRAPPED, or RANGING
- Enough time has passed since the last signal (cooldown per setup type)

---

## The 4 Setup Types

---

### 1. VWAP Cross

**What it is:** Price crosses VWAP with a meaningful candle body — the market has flipped sides relative to the day's average price. The most common intraday momentum trigger.

**Conditions:**
- Previous candle was on one side of VWAP, current candle closes on the other
- Candle body is real (strength ≥ 0.7) — not a hairline wick cross
- Candle direction matches the cross direction (bull candle for upward cross)
- RSI is in a reasonable range (not overbought on a bull cross, not oversold on bear)

**Confidence:** Always fires as HIGH.

**How to use:**
Enter at the open of the next candle in the direction of the cross. This is a fresh momentum entry — you're joining a directional shift. SL is 30 Nifty points below/above your entry. Target is 30 points.

Best in **primary session** (9:45–11:30). VWAP crosses in the lull (11:30–13:00) have lower follow-through.

---

### 2. Power Candle

**What it is:** An unusually large candle — at least 1.2× the recent 3-candle average body size — in the direction of an already established trend. The market is accelerating, not just drifting.

**Conditions:**
- Engine state is BUILDING, CONFIRMED, or CONTINUING (trend already established)
- Candle body ≥ 1.2× recent profile (impulsive, not noise)
- Price is on the correct side of VWAP (above for long states, below for short)
- Candle direction matches the trend

**Confidence:** MEDIUM (single-candle signal within a trend).

**How to use:**
Enter at the open of the next candle. This is a momentum continuation trade — the trend is already running and this candle shows participants are actively adding. SL is 30 points. Target is 30 points.

Do NOT enter if the state is PULLBACK or EXHAUSTED — the Power Candle guard already blocks this, but as a sanity check, glance at the state badge above the card.

---

### 3. Pullback Resume

**What it is:** The market was in a confirmed trend, pulled back (state moved to PULLBACK), and is now showing a strong resumption candle in the original direction. The classic "buy the dip in an uptrend" entry.

**Conditions:**
- Engine state is PULLBACK LONG or PULLBACK SHORT
- Strong candle in the original trend direction (strength ≥ 0.9)
- Price is back on the correct side of VWAP
- RSI is not at an extreme

**Confidence:** HIGH (pullback + resume is the highest-quality pattern).

**How to use:**
This is your best entry in a trending day. The pullback has absorbed sellers (or buyers), and the trend is resuming. Enter at the open of the next candle. SL is 30 points. Target is 30 points.

On a strong trend day, you may see 2–3 of these. Each one is valid — don't skip them just because you missed the first entry.

---

### 4. ATR Expansion

**What it is:** Price has broken outside the day's ATR expansion zone (`day open ± 14-period ATR`) with an impulsive candle. This signals a volatility expansion event — stops are getting triggered, new participants are entering, and option premiums are about to move fast. This is specifically designed for option buyers.

**Conditions:**
- Price close is beyond `day open + ATR` (bull) or below `day open − ATR` (bear)
- Current candle is ≥ 1.5× larger than recent candles AND ATR itself is growing
- VWAP aligned with direction AND/OR recent swing high/low broken (structural confirmation)
- ADX ≥ 16 (some trend forming)
- **Sensex only:** fires on Thursdays (expiry day) — higher liquidity, IV expansion in play
- **Nifty:** fires any trading day

**Confidence:** HIGH if ≥ 3 of: VWAP aligned, range breakout, candle ≥ 2× average, volume spike. Otherwise MEDIUM.

**Additional badges:**
- `HIGH` — strong multi-factor confirmation
- `⚡ Vol` — futures volume spiked on this candle (short covering / stop cascade in progress)

**SL and target are ATR-based** (not fixed 30pts) — wider because you're buying into expansion:
- SL = ~0.8× ATR in Nifty points
- Target = ~1.5× ATR in Nifty points

**The expansion zone** is shown on the card: `Expansion zone 24,150 – 24,850`. This tells you exactly where the breakout happened and gives context for how far price has already moved.

**How to use — two valid entries:**

**Option A — Momentum entry** (when `⚡ Vol` is present and confidence is HIGH):
Enter at market open of the next candle. The volume spike and multi-factor confirmation suggest the move is likely to extend without a clean pullback. Use ATM option.

**Option B — Pullback entry** (preferred when `⚡ Vol` is absent or confidence is MEDIUM):
Skip this card. Let price pull back 1–2 candles after the expansion. When the trend resumes, a **Pullback Resume** card will fire — that's your actual entry. You get a better price and reduced risk of buying the top of the expansion candle.

**What you're capturing:** Stop loss cascades, short covering / long unwinding, volatility spikes. These are the moments when ATM option premiums move 20–50% in 15 minutes. Buying the expansion candle directly is high risk; buying the first pullback is the cleaner trade.

---

## Summary Table

| Setup | When it fires | Session | Confidence | SL | Best use |
|---|---|---|---|---|---|
| VWAP Cross | VWAP flip with body | Primary, Secondary | HIGH | 30 pts | Momentum entry on direction change |
| Power Candle | Impulsive candle in trend | Primary, Secondary | MEDIUM | 30 pts | Trend continuation add |
| Pullback Resume | Strong candle after pullback | Primary, Secondary | HIGH | 30 pts | Best re-entry in an established trend |
| ATR Expansion | Price breaks dayOpen ± ATR | Primary, Secondary (not Opening) | HIGH / MEDIUM | ~0.8× ATR | Volatility expansion — option buyers only |

---

## Common Mistakes

**Ignoring the state above the card.** The card is filtered, but a glance at the state badge tells you the conviction. A VWAP Cross in NEUTRAL state is weaker than one in BUILDING LONG — they look the same on the card.

**Acting on ATR Expansion without a pullback plan.** The expansion candle is often near the local high/low. Entering at its close means your SL may be tested immediately. Always decide before the card appears: are you a momentum buyer or a pullback buyer?

**Skipping Pullback Resume because it "looks late."** It's not late — it's exactly the right moment. The pullback has already happened; you're entering the resumption.

**Trading during Opening Range (9:15–9:45).** The engine doesn't fire setups in this window. The first 30 minutes are for observing direction — the real setups come after 9:45.

---

## Underlying Toggle (NIFTY / SENSEX)

The toggle in the Third Eye panel header switches between Nifty and Sensex. All four setups work for both. The differences:

- **Strike step:** Nifty = 50, Sensex = 100
- **Default qty:** Nifty = 75, Sensex = 10
- **ATR Expansion:** Nifty fires any day; Sensex fires Thursday only (expiry day)
- **Expiry:** Nifty weekly = every Tuesday; Sensex weekly = every Thursday

Switch to Sensex on Thursday mornings when Sensex expiry liquidity and IV conditions are optimal for ATR expansion trades.
