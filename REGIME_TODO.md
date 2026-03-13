# Market Regime Detection — v2 Backlog

Phase 1 (intraday) and Phase 2 (swing) are live.
Items below are the planned v2 enhancements.

---

## Volume & Participation Analysis (Step 3)

- [ ] **Institutional vs retail fingerprinting**
  Classify candles as institutional (large body, low wick, high volume) vs retail
  (choppy, high wick ratio). Requires per-candle body/wick/volume heuristics.

- [ ] **Absorption detection**
  Price barely moves despite spike in volume = institutional absorbing supply/demand.
  Signal: ATR < 0.3× OR range but volume > 2× average.

- [ ] **Volume divergence**
  Price making new session high but volume declining = distribution signal.
  Useful for early TRAP_DAY or DISTRIBUTION phase detection.

- [ ] **Breakout volume confirmation**
  Require ≥1.5× average volume on OR break candle to upgrade BREAKOUT_DAY confidence
  from MEDIUM → HIGH.

---

## Liquidity Sweep & Stop Hunt Detection (Step 4)

- [ ] **Liquidity grab above/below previous day high/low**
  Spike beyond PDH/PDL followed by close back inside range within 1–2 candles.
  Requires fetching previous day OHLC (already in market-data route).

- [ ] **False breakout pattern**
  OR break that reverses within 3 candles and closes back inside — current TRAP_DAY
  detection is basic; add PDH/PDL context to improve accuracy.

- [ ] **Stop hunt at round numbers / OI walls**
  Cross-reference price spike with known OI walls from `/api/option-chain`.
  Spike to OI wall then reversal = high-confidence TRAP_DAY.

---

## Cross-Asset Regime Correlation

- [ ] **CRUDE + GOLD on MCX**
  Tokens: CRUDE (Kite MCX token TBD), GOLD (MCX).
  Verify data pipeline handles MCX `day` candles via `getDataProvider()`.
  Add to `/api/market-regime` route as additional symbols.

- [ ] **Correlation score**
  When NIFTY, BANKNIFTY, and CRUDE all agree on regime direction → upgrade
  confidence. When they diverge → add "mixed macro" signal.

- [ ] **US futures / SGX Nifty pre-market signal**
  Use Yahoo Finance fallback (already in market-data route) to pull DOW / SGX
  overnight and estimate opening regime before 9:15am.

---

## Regime Memory & Learning

- [ ] **Daily regime log**
  Store each day's final regime classification + outcome in Redis with 90-day TTL.
  Key: `regime:log:NIFTY:YYYY-MM-DD` → `{ regime, confidence, dayResult }`.

- [ ] **Historical hit rate**
  Surface on RegimeCard: "Last 10 TRAP_DAY classifications: 7/10 reversed".
  Requires the daily log above to be populated for a few weeks first.

- [ ] **Regime transition probability from history**
  "Last 5 times NIFTY opened gap-down and reclaimed VWAP by 10am → TREND_DAY_UP 4/5".
  Build lookup table from log data once sufficient history exists.

---

## Predictive Next-Session Regime

- [ ] **End-of-day close pattern analysis**
  Analyse last 30–45 min of today's session (distribution vs accumulation close)
  to estimate tomorrow's opening regime probability.
  Show on pre-market page: "65% probability TREND_DAY_UP open tomorrow".

- [ ] **Gap classification at open**
  Classify gap (flat / gap-up / gap-down / large gap) at 9:15 and immediately
  seed the regime detection with the appropriate prior.

---

## Real-Time Push (Infrastructure)

- [ ] **Server-Sent Events (SSE) for regime shifts**
  Currently polls every 5 minutes. Replace with SSE endpoint that pushes a regime
  change event the moment it is detected.
  Route: `GET /api/market-regime/stream?symbol=NIFTY`

- [ ] **In-terminal regime shift toast notification**
  When regime transitions (e.g. RANGE_DAY → TRAP_DAY), show a dismissible toast
  at the top of the terminal intelligence panel.

---

## FII / DII Flow Integration

- [ ] **NSE FII/DII provisional data**
  NSE publishes intraday provisional data around 3:30pm.
  Fetch and surface on the investing page Market Phase section:
  "FII net buyer ₹1,240 Cr today" → upgrades MARKUP confidence.

- [ ] **Cumulative FII flow trend**
  5-day / 20-day FII net flow as a swing phase signal.
  Heavy sustained FII selling → increase DISTRIBUTION / MARKDOWN confidence.

---

## Pre-market Page Integration

- [ ] **Predicted day regime on pre-market page**
  Run intraday regime analysis on previous day's data + gap direction at open
  to show a "likely today" regime card on `/trades/pre-market`.

- [ ] **Regime briefing in pre-market AI plan**
  Include current swing phase + predicted intraday regime in the `/api/pre-market/generate-plan`
  prompt so the AI plan is regime-aware.
