# Third Eye — Architecture Plan

**Scope**: Nifty-only intraday market intent system. Replaces Setup Eye in the `/eye` page UI.  
**Goal**: Mirror how a seasoned trader reads the market — state-aware, noise-resistant, options-informed, actionable.

---

## What Already Exists (Reuse)

| Asset | Location | Reuse |
|---|---|---|
| RSI, EMA, VWAP, ATR, BB, SMC | `app/lib/chart-indicators.js` | Extend to add ADX |
| Options: PCR, max pain, OI walls, market activity | `app/api/option-chain/` + `market-activity-detector.js` | Read from Redis cache directly |
| Bias 2-candle flip prevention | `app/lib/setupEye-bias.js` | Port pattern into ThirdEye engine |
| Rate limiter | `app/lib/rate-limit.js` | Reuse `intelligenceLimiter` |
| Setup Eye settings pattern | `app/eye/settings/` | Extend for ThirdEye config |
| Candle cache (5m) | Redis, 30s TTL | Reuse |

**ADX is missing** — must add to `chart-indicators.js`.  
**Bias TF candles (15m, 1hr)** — must add a cached fetch route.

---

## TF Pairing (Chart-Driven)

| Active Chart TF | Execution TF | Bias TF |
|---|---|---|
| 5m | 5m signals | 15m bias gate |
| 15m | 15m signals | 1hr bias gate |

The UI chart TF selector drives which pair is active. Both TF candle series are fetched on each scan. Bias TF is read-only — it gates and weights confidence, never fires signals directly.

---

## State Machine

```
NEUTRAL
    ↓ (first qualifying candle)
BUILDING
    ↓ (follow-through, ADX rising)       ↘ (reversal within 2 candles)
CONFIRMED                               TRAPPED
    ↓ (sustaining)
CONTINUING
    ↓ (retracing ≤50%, structure intact)
PULLBACK_HEALTHY
    ↓ (holds key level → resume)        ↘ (fails key level)
CONTINUING                             DEEP_PULLBACK
                                            ↓
                                        EXHAUSTED
                                            ↓ (opposing candle / VWAP loss)
                                        INVALIDATED

+ RANGING  (standalone — both scores low, ADX < 18, VWAP magnet)
```

**Transition rules:**
- All forward transitions: require **2 consecutive candle closes** in new state
- INVALIDATED and TRAPPED: fire on **1 candle** (decisive, no waiting)
- RANGING: enters when both smoothed scores < 35 for 3 consecutive candles

---

## Feature Engineering (Per Candle Close)

### Execution TF Features
| Feature | Calculation | Interpretation |
|---|---|---|
| Candle Strength | `body_size / ATR(14)` | > 1.2 impulsive, 0.6–1.2 normal, < 0.5 weak |
| VWAP Position | `close - VWAP` | Positive = bull territory |
| VWAP Distance | `abs(close - VWAP) / ATR` | Stretched if > 2.0 |
| RSI Zone | RSI(14) value | > 60 bull pressure, < 40 bear, 40–60 neutral |
| ADX Context | ADX(14) | > 25 trend, 20–25 forming, < 18 chop |
| ATR Regime | ATR(current) vs ATR(5-candle avg) | Rising = expansion |
| Recent Candle Profile | avg body/ATR of last 3 candles | Baseline for relative strength |
| Sequence Type | Candle N vs profile | Breakout vs continuation |
| Session Phase | IST time | See session gates below |

### Bias TF Features (same set, read-only)
Used to add/reduce confidence and annotate commentary with alignment status.

### Options Overlay (60s cache, not per-tick)
| Feature | Source | Use |
|---|---|---|
| PCR | `/api/option-chain` Redis cache | Score modifier ±5 |
| OI Call Wall | Highest call OI strike | Resistance ceiling level |
| OI Put Wall | Highest put OI strike | Support floor level |
| Max Pain | Option chain computation | Gravitational target commentary |
| Market Activity | `market-activity-detector.js` | Confirms direction or warns trap |
| Expiry Day | Date check (Tuesday) | Weight OI context 1.5× |

---

## Scoring System

### Raw Scores (0–100, Long and Short computed separately)

| Component | Weight | Condition |
|---|---|---|
| VWAP Position | 20 | Full if price above/below VWAP, 0 if opposite |
| Candle Strength | 20 | Scaled: `min(body/ATR, 2.0) / 2.0 × 20` |
| RSI | 15 | >60 (long) or <40 (short) → 15; crossing zone → 8; opposite → 0 |
| ADX | 15 | >25 → 15, 20–25 → 8, <20 → 0 |
| ATR Regime | 10 | Rising → 10, flat → 6, falling → 3 |
| Options / PCR | 20 | PCR >1.2 → +20 long side; PCR <0.8 → +20 short side; else scaled |

### Score Smoothing
- Apply **EMA(3)** on raw scores across candle closes
- State machine reads **smoothed scores** only
- Prevents single-candle spikes from changing state

### State Thresholds (configurable)
| State trigger | Default threshold |
|---|---|
| BUILDING starts | Dominant score ≥ 55 |
| CONFIRMED | Dominant score ≥ 65 for 2 candles |
| CONTINUING | Dominant score ≥ 60 |
| EXHAUSTED | Dominant score 45–55 (weakening zone) |
| INVALIDATED | Opposite score ≥ 65 in 1 candle |
| RANGING | Both scores < 35 for 3 candles |

---

## Session Gates

| Window | Phase | Behaviour |
|---|---|---|
| 09:15–09:45 | Opening range | Suppress state transitions. BUILDING allowed but flagged "high-risk/opening." |
| 09:45–11:30 | Primary window | Full weight. Preferred entry zone. |
| 11:30–13:00 | Lull | Score weight ×0.8. Flag "lull zone — lower conviction." |
| 13:00–14:45 | Secondary window | Full weight. |
| 15:00–15:30 | Square-off | Suppress new BUILDING/CONFIRMED. Show "approaching close" in commentary. |

---

## Commentary Stability

### Four Mechanisms

**1. Score smoothing** (EMA-3) — already described above.

**2. Transition confirmation** — 2 candles required (except INVALIDATED/TRAPPED).

**3. Qualifier system** — state headline stays locked; only qualifiers update each candle:
- `strengthening` — score rising, ADX rising
- `holding` — no significant change
- `weakening` — score dropping, RSI diverging
- `stretched` — VWAP distance > 2 ATR

Commentary updates the qualifier text within the existing state, not the headline. Headline only changes on confirmed state transition.

**4. Stale guard** — if state hasn't changed in N candles (default 8), append candle count to context line: *"Continuation in progress (12 candles). No new catalyst."*

### Update Cadence
- **Candle close only** for state transitions and score updates
- **Tick updates** only update: live price vs key levels, time elapsed in state
- Never transition state mid-candle

---

## Commentary Templates

Each state × qualifier combination has a 4-part template:

```
Headline:  One bold line — current market intent
Context:   1–2 lines — what indicators are saying (with values interpolated)
Watch:     Forward-looking — key level to hold or break
Risk:      Explicit invalidation condition with price
```

### Example Templates

**CONFIRMED_LONG / holding**
```
Headline: "Bulls in control above VWAP"
Context:  "Follow-through buying on {tf}. ADX {adx} and rising. RSI {rsi} — momentum intact. {bias_tf} bias: {bias_state}."
Watch:    "Hold above {vwap} VWAP and {swing_low}. Next target {swing_high}."
Risk:     "Invalidated on {tf} close below VWAP ({vwap_price})."
```

**PULLBACK_HEALTHY / holding**
```
Headline: "Healthy pullback — structure intact"
Context:  "Retracing {retrace_pct}% of the move. Holding above {key_level}. Momentum slowing but bias {bias_dir}."
Watch:    "Watch for absorption near {key_level}. Resumption above {trigger_high} confirms continuation."
Risk:     "Pullback deepens on close below {key_level}."
```

**TRAPPED / —**
```
Headline: "Breakout failed — potential trap"
Context:  "Push above {level} reversed within {trap_candles} candles. Strong counter move suggests absorption."
Watch:    "Monitor for further selling below {vwap}."
Risk:     "Trap confirmed on close below {vwap}."
```

**RANGING / —**
```
Headline: "No directional conviction"
Context:  "ADX {adx} — no trend. VWAP acting as magnet. RSI oscillating {rsi_range}. Both sides weak."
Watch:    "Wait for clean break and hold above {range_high} or below {range_low}."
Risk:     "Momentum trades in ranging market have low probability."
```

### Options Overlay (appended when triggered)
- Price within 0.5% of call wall: *"Approaching call wall at {strike} — significant resistance."*
- Price within 0.5% of put wall: *"Put support at {strike} — likely to act as floor."*
- PCR extreme: *"PCR at {pcr} — {interpretation}."*
- Max pain proximity: *"Within {dist} pts of max pain {strike} — pin risk on expiry."*
- Market activity confirmation: *"OI data: {activity_desc}."*

---

## UI Layout — ThirdEyePanel

```
┌─────────────────────────────────────────────┐
│  INTENT METER                               │
│  LONG  [████████░░]  76                     │
│  SHORT [███░░░░░░░]  24                     │
├─────────────────────────────────────────────┤
│  STATE      CONFIRMED LONG                  │
│  QUALIFIER  strengthening                   │
│  SINCE      4 candles  ·  10:23             │
│  TF ALIGN   5m ↑  15m ↑  ✓ aligned         │
│  SESSION    Primary window                  │
├─────────────────────────────────────────────┤
│  Bulls in control above VWAP                │
│                                             │
│  Follow-through buying on 5m. ADX 27        │
│  rising. RSI 63 — momentum intact.          │
│  15m bias: BULLISH.                         │
│                                             │
│  WATCH  Hold above 24,180 VWAP.             │
│  RISK   Invalidated below 24,162.           │
├─────────────────────────────────────────────┤
│  OPTIONS  PCR 1.31 — bullish tilt           │
│           Call wall 24,300 · Put wall 24,000│
└─────────────────────────────────────────────┘
```

**Zone 1** — 1-second read: Are buyers or sellers winning?  
**Zone 2** — 2-second read: What state, how long, TF alignment?  
**Zone 3** — Full commentary: only when a decision is needed  
**Zone 4** — Options context: PCR + walls, updated every 60s

---

## Settings (Configurable Parameters)

Accessible via a settings icon on the panel. Persisted in Redis per-user.

| Parameter | Default | Description |
|---|---|---|
| ADX trend threshold | 25 | Score full marks above this |
| ADX forming threshold | 20 | Score partial below this |
| RSI bull zone | 60 | Above = bullish pressure |
| RSI bear zone | 40 | Below = bearish pressure |
| Candle strength (impulsive) | 1.2 | body/ATR above this = impulsive |
| Candle strength (weak) | 0.5 | body/ATR below this = noise |
| State confirmation candles | 2 | Candles required before state transition |
| Score smoothing (EMA period) | 3 | Smoothing window for scores |
| Stale guard candles | 8 | Candles before "no new catalyst" shown |
| Options overlay | on | Toggle PCR/OI context |
| PCR bull threshold | 1.2 | PCR above this = bullish tilt |
| PCR bear threshold | 0.8 | PCR below this = bearish tilt |
| Session gate: opening | suppress | suppress / warn / allow |
| Session gate: lull | warn | suppress / warn / allow |
| Session gate: close | suppress | suppress / warn / allow |
| Active chart TF | 5m | 5m or 15m |

---

## Files to Create / Modify

### New Files
| File | Purpose |
|---|---|
| `app/lib/thirdEye.js` | Main engine: feature engineering, state machine, scoring, session gates |
| `app/lib/thirdEye-commentary.js` | Template registry, variable interpolation, qualifier resolution, stale guard |
| `app/lib/thirdEye-options.js` | Options context reader: PCR modifier, wall detection, max pain proximity |
| `app/api/third-eye/scan/route.js` | Main scan (30s cadence): fetch 2 TF candle series, run engine, persist state |
| `app/api/third-eye/tick/route.js` | Tick update (10s): live price vs levels, elapsed time only |
| `app/api/third-eye/settings/route.js` | GET/POST user settings to Redis |
| `app/api/nifty-chart-15m/route.js` | Cached 15m candle fetch (5m TTL) |
| `app/api/nifty-chart-1hr/route.js` | Cached 1hr candle fetch (10m TTL) |
| `app/eye/components/ThirdEyePanel.js` | UI: 4-zone layout, polling, settings flyout |

### Modify
| File | Change |
|---|---|
| `app/lib/chart-indicators.js` | Add `calculateADX(candles, period=14)` |
| `app/eye/page.js` | Swap `SetupEyePanel` → `ThirdEyePanel` (SetupEye hidden, not deleted) |

### Hide (not delete)
- `SetupEyePanel` import in `app/eye/page.js` — comment out, keep file intact

---

## Rate Limit Check

| Call | Frequency | Kite hits | Risk |
|---|---|---|---|
| 5m candles (existing cache) | 30s scan | 0 (Redis cache) | None |
| 15m candles (new cache, 5m TTL) | ~12/hr | ~12/hr | Low |
| 1hr candles (new cache, 10m TTL) | ~6/hr | ~6/hr | Low |
| Options chain (60s TTL, existing) | 1/min | 0 (Redis cache) | None |
| Setup Eye scan (now replaced) | -2/min | saved | Net positive |

Total new Kite calls: ~18–20/hr. Well within limits.

---

## Implementation Order

1. `calculateADX` in `chart-indicators.js`
2. Bias TF candle fetch routes (15m, 1hr) with Redis caching
3. `thirdEye-options.js` — read existing Redis cache, no new fetches
4. `thirdEye.js` — feature engineering + scoring + state machine
5. `thirdEye-commentary.js` — template system + stability mechanisms
6. `app/api/third-eye/scan/route.js` + `tick/route.js`
7. `ThirdEyePanel.js` UI component
8. Settings route + flyout UI
9. Swap in `app/eye/page.js`
