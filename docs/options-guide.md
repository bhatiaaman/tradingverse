# Options Analytics — Trader Guide

**Page:** `/options` · accessible from the main nav and the **Options** button in the Trading Dashboard chart toolbar.

---

## What This Page Shows

The Options Analytics page gives you five tools in one view:

1. **ATM Summary bar** — snapshot of key numbers right now
2. **Intraday Straddle Chart** — how the combined straddle premium has moved today
3. **Probability Calculator** — model-based answers to "will price reach X?"
4. **Price Distribution Chart** — visual bell curve of where price could be at expiry
5. **Greeks Table** — strike-by-strike IV, Delta, Gamma, Theta, and probability
6. **Payoff Diagram** — P&L curve for a straddle or strangle at expiry

---

## ATM Summary Bar

| Field | What it means |
|---|---|
| **Spot** | Current Nifty / BankNifty index price |
| **ATM** | At-the-money strike (nearest 50/100 to spot) |
| **Straddle** | Cost of buying ATM CE + ATM PE right now |
| **ATM IV** | Implied volatility of ATM options (average of CE + PE) |
| **HV30** | Actual 30-day historical volatility of the index |
| **IV/HV** | How expensive options are vs. realised vol. >1.2x = elevated IV; sellers have an edge. <0.9x = cheap IV; buyers have edge |
| **±1σ Move** | Market-implied 1-standard-deviation move by expiry (68% confidence band) |

**Practical use:** If IV/HV > 1.3x, consider selling premium (straddles, iron condors). If IV/HV < 0.9x, consider buying premium before an expected event.

---

## Intraday Straddle Chart

Shows how the ATM straddle value (CE LTP + PE LTP) has changed throughout the trading session in 5-minute bars.

- **Rising straddle** → market expecting a bigger move; premium getting expensive
- **Falling straddle** → theta decay or directional move reducing the losing leg faster than the winning leg rises
- **Sharp spike** → news event, expiry pressure, sudden vol expansion

**Practical use:** Sell the straddle when the chart shows a local peak with declining momentum. Buy when straddle compresses to the day's low ahead of a known catalyst.

---

## Probability Calculator

Answers two distinct questions using the Black-Scholes lognormal model:

### Question 1: Probability at a specific time
> "What is the probability that Nifty is **above / below** [price] in **N days**?"

This uses the forward lognormal distribution. It tells you where price is *likely to be* at a single future moment — it does **not** say it'll stay there.

### Question 2: Probability of touching before expiry
> "What is the probability that Nifty **touches** [price] at any point before expiry?"

This uses the reflection principle (barrier probability formula). It is **always higher** than the at-time probability because it counts any path that crosses the level, not just the final value.

### How to use it

1. Type a target price (e.g. 22,500) or **click anywhere on the distribution chart** to set it
2. Set the time horizon in days (e.g. 3 = 3 trading sessions from now)
3. Click **Calculate**

**Practical examples:**

- *"I sold a 22,500 CE. What's the probability it finishes ITM?"* → Enter 22,500, direction = Above, days = days to expiry → read Prob at time
- *"Will price touch my stop-loss at 22,000 before Thursday?"* → Enter 22,000, direction = Below, use "Prob Touch before expiry"
- *"Is this strangle safe?"* → Check probITM column for both legs in the Greeks table

### Important caveat

These are **risk-neutral model probabilities**, not real-world forecasts. They assume:
- Constant implied volatility (IV doesn't change during the period)
- Log-normal price distribution (no fat tails / jumps)
- Risk-free rate 6.5%, dividend yield 1.5% (Indian market defaults)

Real markets have fat tails, vol clustering, and gap openings. Use these as a framework, not a guarantee.

---

## Price Distribution Chart

A log-normal probability density function (PDF) visualised as a bell curve, showing **where price could be at expiry** given current IV.

- **Yellow line** = current spot price
- **Shaded bands** = 1σ (darker) and 2σ (lighter) ranges; 68% and 95% of outcomes respectively
- **Vertical dashes** = individual strikes from the chain; green = likely OTM (safe for sellers), red = likely ITM (risky)
- **Purple line** = your target price (set via probability panel or click)

**Practical use:** If a strike you've sold sits well outside the 1σ band, it has a ~16% chance of finishing ITM. If it's inside the 1σ band, that rises to >50%.

---

## Greeks Table

Strike-by-strike breakdown for ±15 strikes around ATM.

| Column | Definition | Practical meaning |
|---|---|---|
| **IV** | Implied volatility for this specific option | Compare across strikes to see the volatility smile/skew |
| **Δ (Delta)** | Rate of change of option price per ₹1 move in spot | CE delta ~0.5 at ATM. Deep ITM → 1. Deep OTM → 0 |
| **Γ (Gamma)** | Rate of change of Delta per ₹1 move | High gamma = Delta changes fast. ATM gamma is highest — positions flip quickly |
| **Θ (Theta/day)** | Daily time decay in ₹ | How much the option loses per calendar day from time alone. Negative for buyers, positive for sellers |
| **Prob ITM** | Risk-neutral probability of finishing in the money | ≈ Delta for calls. Useful shorthand: "this option has a 25% chance of finishing ITM" |
| **OI** | Open interest in contracts | High OI = strong reference level for support/resistance |

**Reading the table:**
- ATM row is highlighted — this is your straddle anchor
- CE Delta + |PE Delta| ≈ 1 for any given strike (arbitrage relationship)
- Theta accelerates as you approach expiry — the last week is when time decay is most aggressive
- Deep OTM strikes with high IV relative to ATM = elevated put skew (fear) or call skew (rally expectations)

---

## Payoff Diagram

Shows the profit/loss profile of a **straddle** or **strangle** strategy **at expiry**.

### Straddle
Buy ATM CE + ATM PE at the same strike. Maximum loss = combined premium. Profit when price moves far enough in either direction.

- Breakeven points = ATM Strike ± total premium
- Max loss = total premium (if price expires exactly at ATM)

### Strangle
Buy OTM PE (lower strike) + OTM CE (upper strike). Cheaper than a straddle but requires a larger move to profit.

- Set put strike and call strike using the inputs in the toolbar
- Breakeven = Put strike − premium / Call strike + premium

**Practical use:** Check whether your expected ±1σ move (shown in the summary bar) exceeds the breakeven. If the expected move is ±350 points but the straddle costs ₹300, the market is pricing in a smaller move — potential buy opportunity.

---

## Symbol & Expiry Selection

- **NIFTY / BANKNIFTY** — switches the underlying index
- **Weekly** — nearest Thursday expiry (Nifty) or Wednesday (BankNifty)
- **Monthly** — last Thursday of the month
- Additional expiry dates shown for the next 2 months

The page auto-refreshes data every time you change symbol or expiry. Use **↻ Refresh** to manually pull latest quotes.

---

## Data & Accuracy Notes

- Options LTP comes from Kite live quotes (same as your broker)
- IV is computed server-side using the Newton-Raphson Black-Scholes solver (±0.01% accuracy)
- HV30 is computed from the last 30 daily closes of the index
- Straddle chart shows today's 5-minute bars — only available during market hours
- All data is cached for 60 seconds to avoid excessive API calls

---

## Link from Trading Dashboard

The **Options** button (purple) sits in the chart toolbar next to TradingView. It takes you directly to `/options` pre-loaded with NIFTY weekly data.
