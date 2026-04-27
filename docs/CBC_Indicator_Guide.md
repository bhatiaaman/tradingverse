# 📊 Composite Bias Curve (CBC) — User Guide

> **Where to find it:** Chart → Settings (⚙) → Overlays → **Bias Curve (CBC)**
> **Available on:** 5-minute and 15-minute intraday charts only. Disabled on Daily/Weekly.

---

## What Is the CBC?

The Composite Bias Curve is a **single adaptive indicator** that answers one question:

> *"Is the market in a tradeable trend right now, and which direction?"*

Instead of watching 4–5 separate indicators (VWAP, EMA, Kijun, ATR, ADX), the CBC combines them into **one visual system** with three zones:

```
  ━━━━━━━━━━━━━━━━━━━  Upper Band (green dashed)
  ████ BULLISH ZONE ████   → Take longs here
  ━━━━━━━━━━━━━━━━━━━  Base Curve (white solid)
  ▒▒▒▒  CHOP ZONE  ▒▒▒▒   → No trade, wait
  ━━━━━━━━━━━━━━━━━━━  Lower Band (red dashed)
  ████ BEARISH ZONE ████   → Take shorts here
```

---

## The Math (Plain English)

### Base Curve
```
Base = (40% × VWAP) + (30% × EMA 21) + (20% × Kijun) + (10% × EMA 9)
```

| Component | Weight | Why |
|-----------|--------|-----|
| VWAP      | 40%    | Institutional anchor — most money references VWAP |
| EMA 21    | 30%    | Intraday trend direction |
| Kijun (Ichimoku) | 20% | Market equilibrium / fair value |
| EMA 9     | 10%    | Short-term momentum |

The result is a **smooth, adaptive curve** that moves with the market's true centre of gravity.

### Volatility Bands
```
Upper Band = Base + (Multiplier × ATR)
Lower Band = Base − (Multiplier × ATR)
```

Default multiplier is **0.5×**. On highly volatile days (e.g. budget/RBI), widen to **0.75× or 1.0×** in settings so the bands breathe with the market.

---

## Visual Guide

### 🟢 Bullish Regime
**Conditions met:**
- Price closes **above the Upper Band**
- EMA 9 is above EMA 21

**What you see:** Price candles sitting in the green fill zone, upper band line acting as support on pullbacks.

**Action:** Look for long entries on pullbacks to the Upper Band or Base Curve. Hold existing longs. Do not short.

---

### 🔴 Bearish Regime
**Conditions met:**
- Price closes **below the Lower Band**
- EMA 9 is below EMA 21

**What you see:** Price candles deep in the red fill zone, lower band acting as resistance on bounces.

**Action:** Look for short entries on bounces to the Lower Band or Base Curve. Hold existing shorts. Do not buy dips.

---

### 🔘 Chop Zone (Grey)
**Conditions met:**
- Price is between the Upper and Lower Bands

**What you see:** Candles whipsawing around the white Base Curve line.

**Action:** **No trade.** Wait for a breakout above Upper Band or breakdown below Lower Band. The grey zone is where most retail traders get trapped — avoid it.

---

## ADX Strength Diamonds 🔶

When **ADX ≥ 20** (trend is confirmed), small **amber diamond markers** appear on the Base Curve.

```
  ◇  ◇     ◇  ◇  ◇
━━━━━━━━━━━━━━━━━━━━━━━  ← Base Curve
```

**Meaning:**
- Diamonds present → Trend has real strength → Trust the regime signal → Higher conviction entries
- No diamonds → ADX < 20 → Low trend strength → Regime signal is weaker → Reduce size or skip

**Rule:** Only take fresh entries when diamonds are showing. In choppy low-ADX markets, the CBC zones are less reliable.

> **Config:** Toggle off in Settings if you find the chart too cluttered.

---

## RSI Divergence Dots

Divergence is the most powerful signal on the CBC. It warns you when a trend is **losing steam** — before price reverses — giving you early exit or counter-trade setups.

---

### What Is RSI Divergence?

RSI measures the **speed and strength** of price movement, not price itself.

When price and RSI disagree about direction, it is called **divergence**. This disagreement often precedes a reversal.

---

### 🔴 Bearish Divergence (Red Dot + ▼)

**Definition:** Price makes a **higher high**, but RSI makes a **lower high**.

```
Price:   Low ──── High ──────── HIGHER HIGH  ← price still going up
RSI:     Low ──── High ─── lower high        ← RSI weakening
                                    🔴▼       ← Red dot appears on Upper Band
```

**What it means:**
The rally is running out of buyers. Each push higher is happening with less momentum. Smart money is likely distributing (selling into strength).

**Example — Nifty 5-minute chart:**

```
09:30  Nifty: 24,000 │ RSI: 62
09:45  Nifty: 24,050 │ RSI: 67   ← both going up, normal
10:00  Nifty: 24,120 │ RSI: 71   ← higher high
10:30  Nifty: 24,180 │ RSI: 65   ← HIGHER price but LOWER RSI = DIVERGENCE 🔴
```

> Red dot appears on the Upper Band at the 10:30 candle.

**What to do:**
- If long: **tighten stop loss** or book partial profits
- If not in trade: **do not initiate new longs** — wait for breakdown below Upper Band
- Advanced: Enter short only after price **closes below the Upper Band** (the divergence dot is a warning, not a signal by itself)

---

### 🟢 Bullish Divergence (Green Dot + ▲)

**Definition:** Price makes a **lower low**, but RSI makes a **higher low**.

```
Price:  High ──── Low ──────── LOWER LOW    ← price still falling
RSI:    High ──── Low ─── higher low        ← RSI strengthening
                                  🟢▲        ← Green dot appears on Lower Band
```

**What it means:**
The sell-off is losing sellers. Each push lower happens with less downside momentum. Buyers are quietly absorbing the supply — a bounce or reversal is likely near.

**Example — Nifty 5-minute chart:**

```
10:00  Nifty: 24,100 │ RSI: 38
10:15  Nifty: 24,050 │ RSI: 35   ← both falling, normal
10:30  Nifty: 24,010 │ RSI: 32   ← lower low
11:00  Nifty: 23,970 │ RSI: 36   ← LOWER price but HIGHER RSI = DIVERGENCE 🟢
```

> Green dot appears on the Lower Band at the 11:00 candle.

**What to do:**
- If short: **tighten stop loss** or book partial profits
- If not in trade: **do not initiate new shorts** — wait for breakout above Lower Band
- Advanced: Enter long only after price **closes above the Lower Band**

---

### ⚠️ Divergence Rules (Do Not Break)

| Rule | Why |
|------|-----|
| Divergence is a **warning, not a signal** | Price can continue trending despite divergence for multiple candles |
| Wait for **price confirmation** — a candle close that breaks the band | Entry on dot alone gets you stopped out often |
| Divergence is strongest when **ADX diamonds are absent** | When trend is weak AND divergence appears, reversal probability is high |
| Ignore divergence **during strong ADX trends** | In trending markets, bearish divergence can appear 3–4 times before any reversal |
| **Look at the bigger picture** — check CPR levels | If bearish divergence appears near a major resistance (CPR TC / Call wall), reversal probability is much higher |

---

## Configuration Settings

| Setting | Default | Range | What It Does |
|---------|---------|-------|--------------|
| ATR Period | 14 | 5–50 | Lookback for ATR calculation. Lower = more reactive bands; Higher = smoother, wider |
| Band Multiplier | 0.5× | 0.1–2.0 | How wide the bands are. Widen on volatile days (0.75–1.0) |
| RSI Divergence Dots | ON | Toggle | Show/hide the 🟢🔴 divergence markers |
| ADX Strength Diamonds | ON | Toggle | Show/hide the 🔶 ADX confirmation markers |

---

## Combining CBC With Other Indicators

### CBC + CPR
- Bearish divergence **near CPR Top Central (TC)** = High-confidence short setup
- Bullish divergence **near CPR Bottom Central (BC)** = High-confidence long setup

### CBC + VWAP
- Entering longs when price is in the **bullish zone AND above VWAP** = Double confirmation
- Bearish zone AND below VWAP = Strong directional alignment, hold shorts

### CBC + Order Book (Third Eye DOM)
- Bullish regime on CBC + DOM score > 7 = Institutional buying aligns with technical bias
- Chop zone + DOM neutral = Stay flat, no edge

---

## Quick Reference Card

```
SCENARIO                         │ ACTION
─────────────────────────────────┼──────────────────────────────────
Price in green zone + diamonds   │ Look for long entries
Price in red zone + diamonds     │ Look for short entries
Price in grey chop zone          │ No trade, wait for breakout
Red dot (🔴▼) on Upper Band      │ Tighten long stops, no new longs
Green dot (🟢▲) on Lower Band    │ Tighten short stops, no new shorts
Dot + price confirms + no diamond│ Highest reversal probability
Strong divergence during diamonds│ Trust trend, ignore dot for now
```

---

## Common Mistakes to Avoid

1. **Trading the chop zone** — The grey middle zone looks tradeable. It is not. Skip every candle that closes between the bands.

2. **Treating divergence as an immediate entry** — A divergence dot means *momentum is weakening*, not that price has reversed. Always wait for the candle to close back inside the band before acting.

3. **Using CBC on Daily/Weekly charts** — The indicator is designed for intraday (5m/15m). It is automatically disabled on daily and weekly intervals.

4. **Ignoring the ADX diamonds** — A bullish regime with no diamonds means the move has no trend strength and may be a false breakout. Scale down size significantly.

5. **Widening bands too much** — Setting the multiplier above 1.5× makes the chop zone so narrow that price is almost always in a "regime" — eliminating the filter's usefulness.

---

*Last updated: April 2026 | Indicator version: 1.0*
