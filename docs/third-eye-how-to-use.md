# Third Eye — How to Use

Go to `/eye` — the Third Eye panel is in the right column where Setup Eye used to be.

---

## The 4 Zones (top to bottom)

**Zone 1 — Intent Meter**
Two score bars: LONG and SHORT (0–100). Glance at these first.
- One bar clearly dominant (≥65) → directional pressure building
- Both bars low (≤35) → ranging, no trade
- Scores are EMA-smoothed — they don't spike on a single candle

**Zone 2 — State + Indicators**
- **State name** — what the market is doing right now (e.g. `CONFIRMED LONG`, `PULLBACK LONG`, `RANGING`)
- **Qualifier** — `strengthening / weakening / holding / stretched` — tells you if the state is gaining or losing conviction without the headline flipping
- **Candle count** — how long the state has been active (e.g. `4 candles · 20m`)
- **Live price + VWAP** — both shown inline
- **TF alignment** — whether the bias TF (15m or 1hr) agrees with the execution TF signal
- **ADX / RSI / Candle Strength** — mini indicators, colour-coded

**Zone 3 — Commentary**
Click the headline to expand/collapse. Three lines:
- **Headline** — locked to state, only changes on confirmed transition
- **WATCH** — the specific level or condition to monitor (always a number, never vague)
- **RISK** — exact invalidation condition with price

**Zone 4 — Options**
- PCR reading (bullish / bearish / neutral)
- Call wall (resistance ceiling) and Put wall (support floor) strike levels
- Max pain proximity on expiry days (Tuesday)
- OI activity label when significant (e.g. `OI: Short Covering (str 7/10)`)

---

## Quick Decision Workflow

```
Look at bars → dominant side?
  Yes → check State (BUILDING / CONFIRMED / CONTINUING?)
          CONFIRMED or CONTINUING → read Watch level
          PULLBACK → wait for absorption at Watch level
          TRAPPED / INVALIDATED → stand aside
  No → RANGING → don't trade momentum
```

**What each state means for you:**

| State | Action |
|---|---|
| `BUILDING` | Early — wait for confirmation, don't chase |
| `CONFIRMED` | Setup live — entry zone, check Watch level |
| `CONTINUING` | Trend active — hold / trail, dips get bought/sold |
| `PULLBACK HEALTHY` | Retrace in trend — potential re-entry near Watch level |
| `DEEP PULLBACK` | Structure stressed — reduce / step aside |
| `EXHAUSTED` | Exit or tighten stop — move fading |
| `INVALIDATED` | Thesis broken — out |
| `TRAPPED` | Failed breakout — opposite side taking over |
| `RANGING` | No trade — wait for a state to form |

---

## Settings (gear icon, top right of panel)

Two things worth configuring before first use:

1. **Chart TF** — set to `5m → 15m bias` for intraday scalping, `15m → 1hr bias` for swing-within-day trades
2. **Options overlay** — toggle on/off (on by default, only relevant for Nifty)

Everything else (ADX threshold, RSI zones, confirmation candles) can stay at defaults until you've watched it for a few sessions and want to tune it.

---

## Update Cadence

- **30 seconds** — full scan, state machine runs on candle closes only
- **10 seconds** — live price refresh only (no state changes mid-candle)
- Commentary headline only changes when a new state is confirmed for 2 consecutive closes — no flickering
