# Human Eye — Vision & Architecture

## What Is This

Human Eye is an autonomous trade observer and executor built into the trading terminal.
It watches the chart like an experienced trader — detecting setups from a curated setup library,
scoring conviction, validating through agents, and placing orders automatically via Kite.

It is **not** a signal alert system. It is a trading co-pilot that acts.

---

## How It Differs From Commentary

| | Commentary | Human Eye |
|---|---|---|
| Scope | Broad market narrative | Single instrument on screen |
| Trigger | Timer-based | Every candle close |
| Direction | Backward-looking | Forward-looking |
| Output | Market narrative text | Scored trade setup |
| Powered by | Claude AI | Rules + Setup Library + Agents |
| Actionable | No | Yes — places orders |

---

## Architecture Clarification — Light / Medium / Tight

**Light / Medium / Tight is the TRADING ENVIRONMENT** — set by the user as a toggle in the
Human Eye panel. It describes current market conditions, not a classification of patterns.

- **Light** — clear trend, strong momentum, easy reads. Score multiplier is relaxed.
- **Medium** — mixed signals, some noise, moderate confirmation needed. Default.
- **Tight** — choppy, low conviction, high-risk environment. Setup must score higher to qualify.

All patterns from the Setup Library are evaluated in every environment.
The environment affects the score multiplier and (in future phases) the agent threshold required before an order fires.

---

## The Full Stack

```
Candle closes
      ↓
Pattern Engine
  → scans Setup Library against latest candles (all 17+ setups)
  → checks positional context (VWAP, BOS, OB zone, trend)
  → checks volume context (confirmation, dry-up, climax)
      ↓
Score = pattern base strength
      + environment bonus (tight env rewards higher conviction)
      + location bonus (at BOS, VWAP, OB zone)
      + trend alignment bonus
      + volume confirmation bonus
      + RSI bonus / penalty
      + session time penalty (opening noise, closing risk)
      ↓
score ≥ 6 → Strong Setup (Phase 3+: routes to agent validation)
score 3–5 → Watch List (informational only)
score < 3 → Ignored
      ↓
[Phase 3+] Agent validation (Setup Intelligence)
  Light env  → no agent check, order fires directly
  Medium env → 2/4 agents must approve
  Tight env  → 3/4 agents must approve (structure + risk are hard veto)
      ↓
[Phase 3+] Order placed via Kite
  → entry limit order
  → GTT set for SL + target
  → notification fired
  → logged in terminal
```

---

## Setup Library

Setups are grouped into three conviction levels. Each setup defines:
- **Trigger conditions** (what must be true to detect it)
- **Volume requirement** (confirmation threshold)
- **SL placement** (where structurally it's wrong)
- **Target logic** (R:R or next key level)

---

### LIGHT — No Agent Check Required

These are clean, well-defined setups with high standalone probability.
Signal fires directly to order execution.

---

**L1 — Strong Engulfing at Key Level**
> Bullish/bearish engulfing candle at a BOS level, VWAP, or daily S/R.
- Trigger: Engulfing body covers 100%+ of previous candle, at a mapped key level
- Volume: ≥ 1.5× 20-bar avg
- SL: Below engulfing candle low (bull) / above high (bear)
- Target: Next key level or 2:1 R:R

---

**L2 — VWAP Reclaim**
> Price lost VWAP, consolidates below, then closes back above with momentum candle.
- Trigger: 2+ candles closed below VWAP, current candle closes above with body ≥ 60%
- Volume: ≥ 1.3× avg on reclaim candle
- SL: Below VWAP by 0.1%
- Target: Previous high or 2:1 R:R

---

**L3 — Opening Range Breakout (ORB)**
> First 15-min high or low broken cleanly after 9:30 AM with volume.
- Trigger: Candle closes beyond ORB high/low, not a wick, full body close
- Volume: ≥ 2× avg (opens are noisy, need strong confirmation)
- SL: Opposite side of ORB range
- Target: ORB range projected (1× extension)

---

**L4 — Power Candle Pullback**
> After a power candle fires, price pulls back ~50% of the power candle's range, forms a base.
- Trigger: Power candle detected (existing system), price retraces 40–60% of PC range, then closes back in PC direction
- Volume: Pullback on declining volume, re-entry on expanding
- SL: Below power candle low (bull) / above high (bear)
- Target: Power candle high/low extension

---

**L5 — EMA Stack Bounce**
> In a clear trend (EMA 9 > 21 > 50 for bull), price pulls back to EMA 21 and holds.
- Trigger: EMAs stacked in trend direction, price touches EMA 21, bounces with bullish/bearish candle
- Volume: Bounce candle ≥ 1.2× avg
- SL: Below EMA 50
- Target: Previous swing high/low

---

**L6 — Trendline Break + Retest**
> A well-tested trendline (3+ touches) breaks, price retests the line from the other side.
- Trigger: Trendline break on close, then candle touches back and holds (within 0.1%)
- Volume: Break candle needs volume; retest should be on lower volume
- SL: Back through trendline by 0.2%
- Target: Measured move from trendline angle

---

### MEDIUM — Agents Checked (2 of 4 agreement)

More complex setups. Agents are consulted but a majority is sufficient.
Structure agent and Risk agent carry most weight.

---

**M1 — BOS + Pullback**
> Structure broken (BOS detected), price pulling back toward the breakout zone.
- Trigger: BOS fired on current chart, price retraces to within 0.3% of BOS level without re-breaking it
- Volume: Pullback on declining volume
- SL: Below/above the BOS level (if broken again, setup invalidated)
- Target: Next swing structure level
- Note: Not a full order block retest — that's a Tight setup (T1)

---

**M2 — Higher Low / Lower High Formation**
> In an established trend, a clear HL (bull) or LH (bear) forms at visible support/resistance.
- Trigger: Trend identified (2+ swing HH/HL or LH/LL), price pulls back, swing low holds above previous low
- Volume: Basing on low volume, breakout candle on high volume
- SL: Below the HL pivot low
- Target: Equal move to previous leg

---

**M3 — S/R Flip**
> Old resistance becomes support (or vice versa). Price returns to the flipped level.
- Trigger: Key resistance previously rejected price, now broken, price returns and holds as support
- Volume: Retest candle low volume, hold confirmation candle high volume
- SL: Back through the flipped level
- Target: Measured move from the original breakout

---

**M4 — Double Bottom / Double Top at Structure**
> Classic reversal at a BOS or major S/R level. Second touch holds with volume divergence.
- Trigger: Two touches of same price level within 0.2%, second touch on lower volume, reversal candle forms
- Volume: Volume divergence (second touch lighter than first)
- SL: Just below/above the double bottom/top
- Target: Neckline break + projection

---

**M5 — Inside Bar Breakout**
> Tight coiling inside bar breaks out with direction and volume.
- Trigger: Inside bar (bar 2 high/low entirely within bar 1), bar 3 breaks and closes beyond bar 1 range
- Volume: Bar 3 ≥ 1.5× avg
- SL: Opposite side of bar 1 range
- Target: Bar 1 range projected from breakout point

---

**M6 — VWAP + Key Level Confluence**
> Price sits at both VWAP and a mapped key level simultaneously.
- Trigger: Within 0.15% of both VWAP and a BOS/daily S/R level, confirmation candle forms
- Volume: Any decent volume
- SL: Beyond both levels (0.2% through both)
- Target: Next key level

---

### TIGHT — Full Agent Alignment (3 of 4, structure + risk are hard veto)

The most sophisticated setups. Incorporate SMC/ICT concepts.
All four agents consulted. Structure agent and Risk agent can independently kill the trade.

---

**T1 — BOS + Order Block Retest**
> The highest-conviction setup. Price breaks structure (BOS), the origin candle of that move becomes the Order Block. Price returns to the OB zone and holds.

- **Order Block definition:** The last opposing candle before the move that created the BOS.
  - Bullish BOS: last bearish candle before the up-move that broke structure
  - Bearish BOS: last bullish candle before the down-move that broke structure
- Trigger:
  1. BOS detected on current chart
  2. Price retraces back into OB zone (OB candle's high-low range)
  3. Rejection candle (wick, engulfing, doji) forms inside OB zone
  4. Does not close fully through OB zone
- Volume: Retest on declining volume, rejection candle on increasing volume
- SL: Fully through the OB zone (structure invalidated)
- Target: BOS level + equal move extension
- Context boost: +conviction if OB coincides with VWAP or daily S/R

---

**T2 — Liquidity Sweep + Change of Character (CHoCH)**
> Price engineers a stop hunt beyond a visible swing high/low, then sharply reverses — signalling the real move is opposite.

- **Liquidity sweep:** Wick extends beyond the last swing high (bull trap) or swing low (bear trap), then price rapidly reclaims
- **CHoCH:** First time in a downtrend price makes a higher high (or in uptrend makes a lower low) — early reversal signal before full BOS
- Trigger:
  1. Clear swing high/low visible (obvious liquidity)
  2. Candle wicks through it (sweep) but closes back on the other side
  3. Next candle breaks the swing in opposite direction (CHoCH confirmed)
- Volume: Sweep candle high volume (stop orders executing), CHoCH candle expanding
- SL: Beyond the sweep wick extreme
- Target: Next liquidity pool (previous swing in new direction)

---

**T3 — Fair Value Gap (FVG) Fill at Structure**
> A price imbalance (FVG) aligns with a BOS level or OB. Price returns to fill the gap at structure.

- **FVG definition:** 3-candle pattern where candle 1's wick and candle 3's wick don't overlap — leaving an uncovered gap in price. Acts as a magnet.
- Trigger:
  1. FVG identified (3-candle imbalance)
  2. FVG sits within 0.2% of a BOS level or OB zone
  3. Price returns into FVG zone
  4. Rejection candle forms at FVG midpoint or edge
- Volume: Entry into FVG on light volume, rejection on heavier
- SL: Fully through FVG (if gap fills completely and continues, setup failed)
- Target: Origin of the FVG move (the impulse candle's start)

---

**T4 — SMC Optimal Trade Entry (OTE)**
> After a BOS, price retraces to the 62–79% Fibonacci zone (premium for shorts, discount for longs) before continuing.

- Trigger:
  1. Clean BOS with impulse move (3%+ move)
  2. Price retraces into 62–79% of the impulse range
  3. Any PA confirmation at OTE zone (engulfing, pin bar, hammer)
- Volume: Retracement lighter than impulse
- SL: Beyond 79% level (if it retraces more, the move is likely over)
- Target: BOS level + 27% extension (1.27 fib extension)

---

**T5 — Wyckoff Spring / Upthrust**
> At a defined trading range support (Spring) or resistance (Upthrust), price briefly breaks through, finds no follow-through, snaps back.

- **Spring:** At support, price dips below, closes back inside range — weak hands shaken out
- **Upthrust:** At resistance, price pops above, closes back inside — late longs trapped
- Trigger:
  1. Visible trading range (at least 5 candles range-bound)
  2. Spring/Upthrust candle: closes back inside range with high wick
  3. Volume on Spring/Upthrust is moderate or climactic (not drying up)
  4. Next candle confirms with move away from range boundary
- SL: Beyond the Spring/Upthrust extreme
- Target: Opposite side of trading range

---

**T6 — Confluence Stack (4+ factors)**
> No single dominant pattern, but 4 or more independent factors align at the same price/time.

- Count each present factor as +1:
  - BOS level
  - Order Block zone
  - FVG present
  - VWAP
  - Daily S/R level
  - EMA confluence (21 or 50)
  - RSI oversold/overbought
  - Volume climax or dry-up
  - Power candle in direction
  - Liquidity sweep just occurred
- Trigger: ≥ 4 factors at current price, PA confirmation candle
- SL: Defined by the strongest structural level in the stack
- Target: Next cluster of factors (next confluence zone)

---

## Positional Context Scoring

Applied to every setup before conviction level is finalized.

| Context | Score |
|---|---|
| At mapped BOS level (within 0.2%) | +2 |
| At VWAP (within 0.15%) | +1 |
| At daily S/R level | +2 |
| Trend direction alignment | +2 |
| RSI confirming (oversold for bull, overbought for bear) | +1 |
| Volume confirming | +2 |
| Power candle fired against setup direction | −3 |
| Inside first 15 min of session | −2 |
| Opposing BOS active (broken structure) | −2 |
| Last 30 min of session | −1 |

Light setups need score ≥ 5 before firing.
Medium setups need score ≥ 6 before going to agents.
Tight setups need score ≥ 7 before going to agents.

---

## Agent Integration

### What Each Agent Checks

**Structure Agent**
- Does the broader trend support this direction?
- Is a BOS recently broken against this trade?
- Is price in a range or trending?
- Hard veto power on Tight setups.

**OI Agent**
- Does options OI support the direction? (PCR, max pain proximity)
- Is there unusual options activity signalling smart money positioning?
- Not a veto — adds or subtracts from overall approval score.

**Risk Agent**
- Is R:R ≥ 1.5:1?
- Is the SL placement structurally valid (not arbitrary)?
- Is the position size within daily risk limits?
- Hard veto power on all setups. No trade fires if Risk agent rejects.

**Momentum Agent**
- RSI alignment (trend + level)
- Is momentum diverging? (price making new high but RSI declining = warning)
- Is momentum just starting or already extended?
- Soft veto — rejection noted but doesn't independently block.

### Approval Logic

| Level | Agents Required |
|---|---|
| Light | No agent check |
| Medium | 2 of 4 approve (Risk agent must not reject) |
| Tight | 3 of 4 approve (Structure + Risk must both approve) |

---

## Order Execution

When conviction level + agent approval pass:

1. **Entry**: Limit order at current close or zone midpoint (not market — avoid slippage)
2. **SL**: GTT placed immediately after entry fill confirmed
3. **Target**: GTT placed at target level
4. **Notification**: Terminal alert + (later) push notification
5. **Log**: Trade appended to Human Eye log with full context dump (setup, score, agents)

---

## Kill Switch + Safeguards

- **Master toggle** in terminal header — Human Eye ON/OFF
- **Daily loss limit** — auto-disables if MTM loss exceeds defined threshold
- **Max concurrent trades** — default 1, configurable
- **Max orders per session** — default 3 (prevents overtrading on choppy days)
- **Minimum score override** — can raise the minimum score threshold without turning off entirely

---

## What Human Eye Is NOT

- Not a backtested strategy (setups are based on discretionary PA logic, not statistical edge verification)
- Not a recommendation system for other users (single-account, personal use only)
- Not a replacement for reading the market — it augments attention, doesn't replace judgment
- Not always right — the kill switch exists for a reason

---

## Build Phases

**Phase 1 — Pattern Engine**
Detect all Light + Medium setups client-side on candle close.
Score each setup with positional context.
Show in a Human Eye panel in terminal (no orders yet — observe and validate).

**Phase 2 — Agent Integration**
Route Medium/Tight setups through the 4 agents.
Build agent response aggregation and approval logic.

**Phase 3 — Light Auto-execution**
Light setups auto-fire orders.
Human Eye panel shows what fired and why.
Kill switch and daily loss limit in place.

**Phase 4 — Medium + Tight Execution**
Agent-validated setups execute.
Full setup library active.
Logging + performance tracking.

**Phase 5 — Setup Library Expansion**
New setups added based on what's working.
Setups can be toggled on/off individually.
Backtesting mode (run library against historical data, no orders).
