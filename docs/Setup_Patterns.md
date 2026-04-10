# Human Eye — Setup & Pattern Library

## Strength Scale

| Strength | Meaning |
|---|---|
| 1 | Weak signal — context only |
| 2 | Basic candle read |
| 3 | Watchlist quality |
| 4 | Tradeable setup |
| 5 | High conviction setup |

Strength × 2 = base score. Context bonuses (VWAP, BOS, trend, volume, RSI) added on top.

---

## Layer 1 — Raw Candle Patterns

These fire on the current candle only. They feed into setup detection as confirmation inputs.

### 1-Candle

| Pattern | Direction | Strength | Condition |
|---|---|---|---|
| Doji | Neutral | 1 | Body < 10% of range |
| Inside Bar | Neutral | 1 | Entire candle within prior candle's high-low |
| Hammer | Bull | 2 | Lower wick ≥ 60%, body < 35%, no upper wick |
| Bull Pin | Bull | 2 | Lower wick ≥ 70% (broader hammer) |
| Shooting Star | Bear | 2 | Upper wick ≥ 60%, body < 35%, no lower wick |
| Bear Pin | Bear | 2 | Upper wick ≥ 70% (broader shooting star) |
| Bull Marubozu | Bull | 2 | Body ≥ 90% of range, bullish |
| Bear Marubozu | Bear | 2 | Body ≥ 90% of range, bearish |
| Liq. Sweep High | Bear | 3 | Wick beyond 15-bar swing high, closes back below |
| Liq. Sweep Low | Bull | 3 | Wick beyond 15-bar swing low, closes back above |

### 2-Candle

| Pattern | Direction | Strength | Condition |
|---|---|---|---|
| Bull Engulfing | Bull | 3 | Bullish body fully covers prior bearish body |
| Bear Engulfing | Bear | 3 | Bearish body fully covers prior bullish body |
| Tweezer Bottom | Bull | 3 | Two matching lows (within 0.05%), current bullish |
| Tweezer Top | Bear | 3 | Two matching highs (within 0.05%), current bearish |

### 3-Candle

| Pattern | Direction | Strength | Condition |
|---|---|---|---|
| Morning Star | Bull | 4 | Bearish → small body → bullish closing above midpoint |
| Evening Star | Bear | 4 | Bullish → small body → bearish closing below midpoint |
| Three White Soldiers | Bull | 3 | 3 consecutive bullish, each opens in prior body |
| Three Black Crows | Bear | 3 | 3 consecutive bearish, each opens in prior body |
| IB Breakout | Bull | 3 | Inside bar forms, current closes above mother bar (raw) |
| IB Breakdown | Bear | 3 | Inside bar forms, current closes below mother bar (raw) |

### Multi-Candle

| Pattern | Direction | Strength | Lookback | Condition |
|---|---|---|---|---|
| OB Retest (raw) | Bull/Bear | 4 | 20 bars | Price inside last opposing candle before BOS (basic version — superseded by S1) |
| Bull Flag Breakout | Bull | 4 | 15 bars | Pole ≥ 1.5%, flag ≤ 0.8% range, close above flag high |
| Bear Flag Breakdown | Bear | 4 | 15 bars | Pole ≥ 1.5%, flag ≤ 0.8% range, close below flag low |
| Bull Flag Forming | Bull | 3 | 15 bars | Pole detected, price still inside tight flag zone |
| Bear Flag Forming | Bear | 3 | 15 bars | Pole detected, price still inside tight flag zone |

---

## Layer 2 — Setups

Multi-condition setups. Each validates pattern + location + structure. Setups suppress their covered raw pattern to avoid duplicates.

### S1 — BOS + Order Block Retest
**Strength: 5** | Covers: `ob_retest`

| Field | Value |
|---|---|
| Trigger | BOS detected + price touches OB zone + rejection candle in BOS direction |
| Rejection candles | Hammer, pin bar, engulfing, doji, tweezer |
| SL | Through OB zone (0.15% beyond) |
| Target | BOS price + equal move extension |

---

### S2 — VWAP Reclaim / VWAP Break
**Strength: 3**

| Field | Value |
|---|---|
| Trigger | 2 prior candles on one side of VWAP, current crosses with body ≥ 55% |
| Reclaim | Bull — 2 below, current above |
| Break | Bear — 2 above, current below |
| SL | 0.1% through VWAP |
| Target | Previous high/low |

---

### S3 — Opening Range Breakout
**Strength: 4**

| Field | Value |
|---|---|
| Trigger | Post 9:30, body fully closes beyond ORB high or low |
| Volume | ≥ 1.8× avg |
| SL | Back inside ORB range |
| Target | ORB range projected (1× extension) |

---

### S4 — Power Candle Pullback
**Strength: 3–4** (4 if volume expanding on re-entry)

| Field | Value |
|---|---|
| Power candle | Body ≥ 65%, move ≥ 0.8%, vol ≥ 1.3× — detected in last 15 bars |
| Trigger | Price retraces 35–65% of power candle range + re-entry candle in PC direction |
| Volume | Expanding on re-entry vs prior 2 candles avg → strength 4 |
| SL | Beyond power candle extreme |
| Target | Power candle high (bull) / low (bear) |

---

### S5 — EMA Stack Bounce
**Strength: 3**

| Field | Value |
|---|---|
| Trigger | EMAs stacked (9 > 21 > 50 bull / 9 < 21 < 50 bear) + price within 0.2% of EMA 21 + bounce candle body ≥ 40% |
| SL | Beyond EMA 50 |
| Target | Previous swing high/low |

---

### S6 — Strong Engulfing at Key Level
**Strength: 4** | Covers: `bull_engulfing` / `bear_engulfing`

| Field | Value |
|---|---|
| Trigger | Bull or Bear engulfing candle at BOS level (within 0.3%), VWAP (within 0.15%), or OB zone |
| Volume | ≥ 1.4× avg |
| SL | Beyond engulfing candle extreme |
| Target | Next key level |

---

### S7 — BOS Pullback
**Strength: 3**

| Field | Value |
|---|---|
| Trigger | Most recent BOS + price within 0.3% of BOS level + not re-broken |
| Volume | Declining on pullback |
| SL | 0.3% through BOS level |
| Target | Next swing structure level |

---

### S8 — Higher Low / Lower High
**Strength: 3**

| Field | Value |
|---|---|
| Trigger (bull) | Confirmed uptrend swing sequence (HH+HL) + price within 0.5% of last HL + bullish candle |
| Trigger (bear) | Confirmed downtrend swing sequence (LH+LL) + price within 0.5% of last LH + bearish candle |
| SL | Below the HL pivot (bull) / above the LH (bear) |
| Target | Equal move to previous leg |

---

### S9 — S/R Flip Retest
**Strength: 4**

| Field | Value |
|---|---|
| Trigger | BOS level that had 2+ prior touches before breaking + price retests within 0.3% |
| SL | 0.3% through the flipped level |
| Target | Measured move from original breakout |
| Note | Stronger version of S7 — requires level to have been tested (not just broken) |

---

### S10 — Double Bottom / Double Top
**Strength: 4**

| Field | Value |
|---|---|
| Trigger | Two swing lows/highs within 0.3% of each other + second touch on lower volume + reversal candle |
| Volume divergence | Second touch volume < first touch volume |
| SL | Below/above the double level |
| Target | Neckline break + projection |

---

### S11 — Inside Bar Breakout (with volume)
**Strength: 4** | Covers: `ib_breakout` / `ib_breakdown`

| Field | Value |
|---|---|
| Trigger | Inside bar pattern + current closes beyond mother bar range |
| Volume | ≥ 1.5× avg (upgrades from raw pattern strength 3 to setup strength 4) |
| SL | Opposite side of mother bar range |
| Target | Mother bar range projected |

---

### S12 — VWAP + Level Confluence
**Strength: 4**

| Field | Value |
|---|---|
| Trigger | Within 0.15% of VWAP AND within 0.2% of BOS level simultaneously + confirmation candle body ≥ 35% |
| SL | Beyond both levels |
| Target | Next key level |

---

### S13 — Liquidity Sweep + CHoCH
**Strength: 4** | Covers: `liq_sweep_high` / `liq_sweep_low`

| Field | Value |
|---|---|
| Trigger | Prior candle swept a 15-bar swing high/low (wick through, closed back) + current candle breaks prior candle's extreme in sweep direction |
| Volume | Sweep candle high volume; CHoCH candle expanding |
| SL | Beyond sweep wick extreme |
| Target | Next liquidity pool |

---

### S14 — FVG Fill at Structure
**Strength: 4**

| Field | Value |
|---|---|
| FVG definition | 3-candle gap: candle[i-2].high < candle[i].low (bull) or candle[i-2].low > candle[i].high (bear) |
| Trigger | Price enters unmitigated FVG zone that sits within 0.5% of a BOS level or OB zone + rejection candle |
| SL | Fully through FVG zone |
| Target | Origin of the FVG impulse move |

---

### S15 — OTE Fibonacci Retracement
**Strength: 4**

| Field | Value |
|---|---|
| Trigger | BOS with impulse move ≥ 2% + price retraces into 62–79% fib zone + PA confirmation candle |
| Confirmation | Engulfing, pin bar, hammer, doji, morning/evening star |
| SL | Beyond 79% level |
| Target | 1.27 extension of impulse |

---

### S16 — Wyckoff Spring / Upthrust
**Strength: 4**

| Field | Value |
|---|---|
| Range requirement | Trading range detected (last 10 candles within 1.5%) |
| Spring trigger | Candle wicks below range low, closes back inside with snap ≥ 50% of range |
| Upthrust trigger | Candle wicks above range high, closes back inside with snap ≥ 50% of range |
| SL | Beyond wick extreme |
| Target | Opposite side of trading range |

---

### S17 — Confluence Stack
**Strength: 5**

Counts independent factors at current price. Fires when ≥ 4 align.

| Factor | Condition |
|---|---|
| BOS level | Within 0.2% |
| Order Block | Price in OB zone |
| FVG | Price inside unmitigated FVG |
| VWAP | Within 0.15% |
| EMA confluence | At EMA 21 or EMA 50 |
| RSI oversold | RSI < 30 (bull bias) |
| RSI overbought | RSI > 70 (bear bias) |
| Volume event | Climax or dry-up |
| Power candle | Recent power candle in last 15 bars |
| Liquidity sweep | Sweep pattern in current candle |
| Range boundary | Price at trading range high or low (within 0.2%) |

Requires PA confirmation candle in the direction. No single dominant pattern needed.

---

## Environment Routing (post-score)

The environment toggle determines agent validation — not which setups fire.

| Environment | Score threshold | Agent routing |
|---|---|---|
| Light | ≥ 5 | No agents — fires directly |
| Medium | ≥ 6 | 2 of 4 agents must approve |
| Tight | ≥ 7 | 3 of 4 must approve (Structure + Risk are hard vetoes) |

---

## Why "Top Setup" Cards Are Rare (AI Constraint Behavior)

The Third Eye commentary engine separates the noise of standard candlestick patterns from structurally tradeable signals using a strict two-tier gating system.

1. **Layer 2 (Base Patterns):** Hundreds of common patterns (Doijs, Hammers, Engulfings) occur daily. The engine aggregates these into a `rawPatterns` list. They are **deliberately suppressed from generating Action Cards**. Instead, these base patterns are injected silently into the psychological "Observe / Hold" narrative text to provide context.
2. **Layer 4 (Structural Setups):** Only mathematical alignments matching `S1` through `S21` (e.g. crossing exactly at the VWAP band on a >1.4x volume climax) can be promoted to the `topSetup` array.

Because the system requires `topSetup !== null` and a `score >= 6` to print a formal setup alert in the log interface, the UI will often stay quietly in "Observe" or "Hold Bias" phases for extended periods during choppy markets. The system is designed to mathematically veto anything that lacks structural and volumetric alignment to prevent false-positive whipsaw alerts.
