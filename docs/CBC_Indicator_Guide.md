# Bias Score Indicator — User Guide

> **Where to find it:** Chart → Overlays → **Bias Score**
> **Available on:** 5-minute and 15-minute intraday charts only. Disabled on Daily/Weekly.

---

## What Is the Bias Score?

The Bias Score is a **single-number regime indicator** that replaces watching 5 separate indicators at once. It answers one question every bar:

> *"How many independent systems agree that price is trending right now, and in which direction?"*

It appears as a **histogram pane below the main chart** — similar to RSI — with a smooth average curve drawn through it.

```
┌────────────────────────────── Price Chart ──────────────────────────────┐
│                                                                          │
│  Candles, VWAP, CPR levels etc.                                         │
│                                                                          │
├──────────────────────────── Bias Score Pane ────────────────────────────┤
│  ████  ████                          ████  ████  ██                     │
│  ████  ████  ██                      ████  ████  ██  ▲ (bull arrow)     │
│  ──────────────────────── zero line ─────────────────────────────────   │
│              ▼ (bear arrow)                                              │
│              ██  ████  ██                                                │
└──────────────────────────────────────────────────────────────────────── ┘
```

---

## The Five Components

Each bar is a sum of **five independent conditions**, each contributing between −1 and +1:

| # | Component | How it scores | What it measures |
|---|-----------|---------------|------------------|
| 1 | **Price vs EMA 9** | `(close − EMA9) / ATR`, clamped ±1 | Short-term price position |
| 2 | **Price vs EMA 21** | `(close − EMA21) / ATR`, clamped ±1 | Medium-term trend direction |
| 3 | **Price vs VWAP** | `(close − VWAP) / ATR`, clamped ±1 | Institutional intraday reference |
| 4 | **ADX / DMI** | `(+DI − −DI) / 25`, clamped ±1 | Directional momentum *strength* |
| 5 | **Supertrend** | `+1` (bullish) or `−1` (bearish) | Trend *state* — trailing ATR stop |

**Total range: −5.0 to +5.0**

The components are designed to be genuinely independent:
- EMA 9/21 measure **price position** relative to moving averages
- VWAP measures **where institutions anchored** for today's session
- DMI measures **how decisively** the market is moving (not just direction)
- Supertrend measures **trend state** — only flips on confirmed ATR breakouts

This is why the old Kijun (Ichimoku baseline) was removed — it was mathematically similar to EMA 21 and added no new information.

---

## Reading the Histogram

### Bar Height = Strength of the Move

The bar height is proportional to the score magnitude:

```
+5  │ ████  → All 5 systems strongly bullish (price far above all lines)
+3  │ ███   → 3 systems fully aligned, 2 partially
+1  │ █     → Mild edge, marginal signals
 0  │ ─     → Neutral tick (grey)
−1  │ █     → Mild bearish edge
−3  │ ███   → 3 systems fully bearish
−5  │ ████  → All 5 systems strongly bearish
```

**Short bars (±0.5 to ±1.5):** Mixed signals. Not a strong regime. Reduce size or wait.
**Tall bars (±3.0 and above):** Strong confluence. Higher-probability entries in that direction.

### Bar Color = Direction + Intensity

| Score | Color | Interpretation |
|-------|-------|----------------|
| +4 to +5 | Deep green | Maximum bullish confluence |
| +2 to +4 | Green | Strong bull regime |
| +0.5 to +2 | Pale green | Mild bullish edge |
| −0.5 to +0.5 | Grey tick | Neutral — no bias |
| −0.5 to −2 | Pale red | Mild bearish edge |
| −2 to −4 | Red | Strong bear regime |
| −4 to −5 | Deep red | Maximum bearish confluence |

---

## The Average Curve (White Line)

The white line is a **9-bar EMA of the raw score**. It is slower to respond than individual bars but more reliable for trend identification.

```
Individual bars  → react to each candle, noisy in chop
Avg curve        → smooth trend of the bias, filters noise
```

### Key Avg Curve Signals

**Avg curve above zero and rising:**
Regime is bullish and strengthening. Look for long entries only. This is the "in trend" state.

**Avg curve above zero but bars falling toward it:**
Trend is intact but momentum is fading. Tighten stops on open longs. Do not add.

**Avg curve below zero and falling:**
Regime is bearish and strengthening. Look for short entries only.

**Avg curve near zero, flat:**
Market is in chop. No reliable bias. Skip trades.

**Bars significantly ahead of avg curve (e.g. bars at +4, avg at +2):**
The raw score has run ahead of its own average. Either momentum will continue and avg catches up, or bars will pull back toward avg. Not ideal for fresh entries — risk of a pullback.

---

## The Regime-Change Arrows

A **▲ green arrow** or **▼ red arrow** appears in the pane when the avg curve crosses zero with bar confirmation:

### ▲ Bull Arrow — Avg crosses above zero, bars positive

```
Before:  avg was negative (red bars) → Market in bear regime
Trigger: avg ticks above zero + current bar is green
Signal:  Regime has officially shifted to BULLISH
```

**This is the highest-quality signal from this indicator.** It means:
- At least 3–4 of 5 systems have flipped bullish
- The shift has been sustained long enough for the EMA to cross
- Raw bars confirm (not a noise tick)

**Action:**
- Fresh long entry on the next pullback
- Set stop below the last swing low or below Supertrend line
- Look to hold through the trend, not scalp

---

### ▼ Bear Arrow — Avg crosses below zero, bars negative

```
Before:  avg was positive (green bars) → Market in bull regime
Trigger: avg ticks below zero + current bar is red
Signal:  Regime has officially shifted to BEARISH
```

**Action:**
- Exit any open longs immediately
- Look for short entries on the next bounce
- Set stop above the last swing high

---

## Using Bias Score With CPR

This is where the indicator becomes a proper trading system.

**CPR tells you WHERE the key price levels are.**
**Bias Score tells you WHICH DIRECTION momentum favors.**

Together they give you both a direction *and* a reference level for entry/stop.

### High-Probability Setups

**Setup 1 — Bull Arrow + CPR Reclaim**
```
1. Bias avg crosses above zero (▲ appears)
2. Price simultaneously reclaims CPR Top Central (TC)
3. Entry: Long on first pullback to TC from above
4. Stop: Below CPR Pivot Point (PP)
5. Target: Previous resistance or R1
```

**Setup 2 — Bear Arrow + CPR Rejection**
```
1. Bias avg crosses below zero (▼ appears)
2. Price simultaneously breaks below CPR Bottom Central (BC)
3. Entry: Short on first bounce back to BC (now resistance)
4. Stop: Above CPR PP
5. Target: Previous support or S1
```

**Setup 3 — Strong Bias + CPR Level as Entry**
```
1. Bars holding at +3 or above all morning
2. Price pulls back to CPR PP or TC
3. Entry: Long at CPR level — bias confirms the pullback is a buy
4. Stop: Below CPR BC
```

**Setup 4 — Chop Warning**
```
1. Avg curve flat near zero, bars alternating red/green
2. Price trading between CPR BC and TC
3. Action: No trade. Both indicators agree — no edge.
```

---

## Practical Examples

### Example 1 — Morning Breakout (Nifty 15m)

```
Time    Price    Score   Avg     Arrow   CPR context
09:15   24,100   +0.8    +0.3           Just opened, neutral
09:30   24,180   +2.1    +0.9           Price above VWAP + EMA9
09:45   24,250   +3.4    +1.8    ▲      Avg crosses zero! Price breaks CPR TC (24,200)
10:00   24,230   +3.1    +2.2           Pullback to TC — ENTRY ZONE
10:15   24,290   +3.8    +2.7           Bars tall green, avg rising — hold
10:30   24,340   +4.1    +3.1           Deep green, trend confirmed
```

**Reading:** The ▲ at 09:45 with CPR TC breakout was the setup. Pullback to TC at 10:00 was the entry. Bars stayed tall green the whole way — no reason to exit early.

---

### Example 2 — Afternoon Reversal (Nifty 15m)

```
Time    Price    Score   Avg     Arrow   Note
13:00   24,300   +3.2    +2.8           Strong green trend since morning
13:15   24,320   +1.8    +2.6           Bars falling, avg still positive
13:30   24,290   +0.4    +2.1           Bars nearly neutral — warning
13:45   24,240   −1.2    +1.4           Bars gone red, avg losing ground
14:00   24,200   −2.8    +0.3           Avg approaching zero — exit longs
14:15   24,160   −3.5    −0.8    ▼      Avg crosses zero — confirmed bear
14:30   24,190   −2.1    −1.2           Bounce to CPR area — SHORT ENTRY
```

**Reading:** Bars started fading at 13:15 while avg was still positive — that was the first warning (tighten stops). The ▼ at 14:15 confirmed the shift. The bounce at 14:30 back to CPR was the short entry.

---

### Example 3 — Chop Day (Nifty 15m)

```
Time    Price    Score   Avg     Note
09:30   24,050   +1.2    +0.6    Mildly positive start
09:45   24,030   −0.4    +0.3    Dropped below EMA9
10:00   24,060   +0.8    +0.4    Back above, small green bars
10:15   24,040   −0.2    +0.3    Back below — bars tiny, avg flat
10:30   24,055   +0.5    +0.3    Nothing happening
```

**Reading:** Bars never exceeded ±1.5, avg flat near 0. This is a no-trade day in the morning. No arrows, no conviction. Wait for a CPR breakout or go flat.

---

## Quick Reference Card

```
WHAT YOU SEE                            WHAT TO DO
────────────────────────────────────────────────────────────────
▲ arrow (avg crosses above 0)           Look for long entry on next pullback
▼ arrow (avg crosses below 0)           Exit longs, look for short on bounce
Tall green bars (+3 to +5)              Trend is strong — hold longs, no shorting
Tall red bars (−3 to −5)               Trend is strong — hold shorts, no buying
Short mixed bars (±0–1.5), avg flat    Chop — no trade
Bars fading toward avg from above      Momentum cooling — tighten long stops
Bars at +4, avg only at +1.5           Extended — wait for pullback before adding
▲ arrow + price above CPR TC           High-conviction long setup
▼ arrow + price below CPR BC           High-conviction short setup
```

---

## Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Avg Period | 9 bars (fixed) | EMA of raw scores |
| Supertrend | ATR 10, Mult 3 | Standard parameters |
| DMI | Period 14 | Wilder's smoothing |
| EMA | 9 and 21 | Standard intraday periods |
| VWAP | Session-reset daily | Resets each day at 09:15 |

No configuration needed. Parameters are set to intraday-optimised defaults.

---

## Common Mistakes

**1. Treating every bar flip as a signal**
Individual bars react to every candle. Only the *avg curve* crossing zero — confirmed by an arrow — is a meaningful regime signal. Bars alone are context, not triggers.

**2. Entering on the arrow candle itself**
The arrow marks the candle where the shift was confirmed. Enter on the *next* pullback to a CPR level or moving average — not at the moment the arrow prints.

**3. Ignoring the bar-vs-avg gap**
When bars are at +4 and avg is at +1.5, the raw reading is far ahead of its trend. This is an *extended* state. It can persist, but adding fresh longs here has poor risk/reward. Wait for the avg to catch up.

**4. Using it on daily charts**
The VWAP component resets each session and is only meaningful intraday. The indicator is disabled on Daily/Weekly deliberately.

**5. Using it standalone without a price context**
The Bias Score tells you *direction and strength*. It does not tell you *where to enter*. Always combine with CPR levels, S/R, or VWAP as your entry reference.

---

## Indicator Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.0 | Apr 2026 | Redesigned as histogram pane. Kijun removed. DMI + Supertrend added. Continuous ATR-normalised scoring. Avg curve + arrows. |
| 2.0 | Apr 2026 | RSI divergence moved to RSI pane. ADX threshold raised to 25. Pivot lookback raised to ±5 bars. |
| 1.0 | Mar 2026 | Initial release — band-based overlay on price chart (VWAP + EMA21 + Kijun + EMA9 base curve with ATR bands). |

---

*Last updated: April 2026 | Indicator version: 3.0*
