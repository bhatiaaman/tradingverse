# Order Intelligence — Parking Lot

Ideas and future improvements that are not yet implemented.
Add items here instead of cluttering agent code with TODO comments.

---

## Structure Agent — Future Checks

### Relative Strength vs Index (EASY — add to SWING_EXTRA_CHECKS)
- Compare 20-day stock return vs NIFTY
- Already scaffolded as `checkRelativeStrength` in `structure.js`
- Just needs `niftyDaily` candles to be passed correctly via `structureData`

### MACD Confluence
- MACD histogram direction (15m for intraday, daily for swing) vs trade bias
- Source: `calcMACD(candles, fast=12, slow=26, signal=9)` — not yet implemented
- Add to intraday checks

### ATR-based Entry Quality
- If last candle range > 2× ATR(14), price has already moved too far
- Avoid entering after a large-range candle (late entry)
- Add as `checkEntryQuality` in intraday checks

### VIX Rate of Change
- Not just VIX level, but VIX spiking fast (>15% in 1 day) = panic regime
- Currently only VIX level is checked in behavioral agent
- Add as a structural check using VIX daily candles

### True BOS (Break of Structure) Detection
- Requires identifying the last significant swing high/low
- Then confirming a closed candle beyond it on 15m
- Needs `detectSwingHighs/Lows` from `sr-detector.js` — already available
- Complex to implement cleanly; skip for now

### Liquidity Sweep Detection
- Price briefly spikes beyond a swing high/low and reverses within the same candle
- Wicks > 60% of candle range touching a known S/R level
- Requires tick-level data ideally; candles give approximation only

### False Breakout Check
- Price crossed opening range high/low but returned inside it within 1-2 candles
- Needs last 3–5 candles context around OR boundaries

---

## Behavioral Agent — Future Rules

### Earnings Proximity
- Avoid entering swing trades within 3 days of results date
- Needs earnings calendar API — not currently in codebase
- NSE announces results schedule; consider scraping or a free API

### Delivery Volume Spike
- NSE delivery % data (from Bhavcopy) available next day only
- No real-time API — would need T-1 data from NSE website download

### Option OI / PCR at Strike Level
- Is the strike being bought already heavily written (OI > 5L)?
- High OI at your strike = strong wall; buying CE at max OI strike = hard to cross
- Already partially available via `strike-analysis` API

### Overtrading (too many trades today)
- Count trades placed today (from orders history)
- If > N trades already placed, fire a caution
- Needs `kite-orders` history with date filter

---

## Frontend Ideas

### Combined Risk Score
- Show behavioral + structure risk scores as a single blended score
- E.g. (behavioral × 0.5 + structure × 0.5)
- Display as a progress bar with colour zones

### Sector ETF Relative Strength
- Compare stock vs sector ETF (BANKBEES, ITBEES etc.) not just vs NIFTY
- Shows if stock is lagging within its own sector

### PCR at Strike Level for Structure
- Add PCR (from strike-analysis) as a structural confirmation signal
- High PCR at CE strike = bearish wall; Low PCR = bullish support

---

## Infrastructure

### Stream structure checks incrementally
- Currently structure is all-or-nothing (one POST, waits for all candles)
- Could stream partial results: send behavioral immediately, then stream structure checks as they complete
- Requires Server-Sent Events or streaming response

### Cache candle data for N minutes
- `collectStructureData` re-fetches Kite historical on every click
- Could cache `${symbol}-${interval}` in Redis with 5-min TTL
- Saves Kite API quota during repeated analysis runs
