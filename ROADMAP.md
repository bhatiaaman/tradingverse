# TradingVerse — Product Roadmap

## Goal
Best tool for independent traders in India — regime-aware, context-rich, fast to execute.

---

## Phase 1 — Speed & Clarity (2–3 weeks)
*Cut the noise. Make the most important things instant.*

### 1.1 Terminal Declutter
- Collapse intelligence agents into a single tabbed panel (Pattern / Structure / Behavioral / Station) — not 4 separate expanding cards
- Move Scenario card to top of the intel panel, not buried at the bottom
- Add a "Quick Summary" line per agent: 1 sentence, color-coded, visible without expanding

### 1.2 Trade Execution Speed
- One-click order from Scenario card: pre-fills instrument, direction, qty from scenario
- "Last Used" order settings memory per symbol (strike, qty, product type)
- Keyboard shortcut: B = buy modal, S = sell modal, Esc = close

### 1.3 Regime Summary Improvements
- Show regime bar at top of terminal (always visible, not inside a card)
- Regime tooltip on hover: what this regime means + what to do / avoid
- VWAP distance in points + % alongside the badge

---

## Phase 2 — Price Alerts & Watchlist (3–4 weeks)
*The #1 missing feature — traders need to be notified, not glued to screen.*

### 2.1 Price Alerts
- Set alert from terminal: click price level on chart → set alert
- Alert types: price crosses, VWAP reclaim, regime change, scenario trigger
- Delivery: browser push notification + in-app bell icon

### 2.2 Watchlist
- Persistent watchlist (saved to Redis per user)
- Compact row per instrument: LTP, % change, regime dot, scenario badge
- Click row → loads full terminal for that symbol
- Regime change highlights row (e.g. flashes amber on TREND_DAY_UP trigger)

### 2.3 Scanner / Screener
- Pre-built scans: "Trend Day Up", "Near VWAP", "High Vol Breakout", "Range Bound"
- Runs every 5 min during market hours, results in a panel
- Click result → opens terminal

---

## Phase 3 — Chart Integration (4–6 weeks)
*Intelligence needs to be on the chart, not beside it.*

### 3.1 Embedded Chart
- Replace static NIFTY chart with a live TradingView Lightweight Charts chart
- Overlay: VWAP line, Opening Range band (OR high/low), regime-colored candles (background tint)
- Key levels from Structure agent drawn as horizontal lines

### 3.2 Agent Overlays
- Pattern agent: mark detected pattern visually on chart
- Station agent: draw zone box (support/resistance band) on chart
- Scenario: entry zone + target + stop as price annotations

### 3.3 Per-Symbol Chart in Terminal
- Currently only NIFTY has a chart — every symbol should have a chart
- 5-min intraday default, toggle to daily

---

## Phase 4 — Regime Intelligence Upgrade (3–4 weeks)
*Make the regime engine smarter — from descriptive to predictive.*

### 4.1 Volume Analysis
- Volume profile per session (POC, VAH, VAL) from 5-min data
- Show volume climax / exhaustion signals in regime card
- Delta divergence (up-close on down-volume = hidden selling)

### 4.2 Regime Memory & Stats
- Track regime per symbol per day in Redis (rolling 30 days)
- Show: "Trend Day Up 4× in last 10 sessions" — base rate context
- Pattern: "3 consecutive Range Days → breakout rate 60%"

### 4.3 Cross-Asset Signals
- FII/DII net data from NSE (scrape daily) → shown in trades summary
- SGX Nifty / Dow futures at open → morning brief card
- USD/INR, crude as macro context badges

### 4.4 Predictive Regime Hints
- Gap + OR direction → likely regime classification (ML-free rule engine)
- "Opening Gap Up + OR holds → 70% Trend Day Up historically"
- Show as probability bar in regime card, not hard prediction

---

## Phase 2.5 — Position Exit Intelligence
*Warn the user when the original trade thesis is unwinding.*

The problem: You enter a JINDALSTEL short when Metal sector is -2%, regime is TREND_DAY_DOWN, ORB broke down. An hour later sector is drifting toward -0.3%, regime is softening. Nothing tells you — until you're underwater.

### 2.5.1 Position Health Engine (client-side, no new API)
- `usePositionHealth` hook: for each open position, compute a health status (`ok` / `watch` / `exit`)
- Direction from `transaction_type` (BUY = long, SELL = short)
- Sector alignment: look up symbol sector, check current sector % vs position direction
  - Short + sector > -0.3% (was bearish) → "sector tailwind fading"
  - Short + sector > +0.5% → "sector now headwind"
- Regime alignment: reuse `computeRegimeAlignment` logic against position direction
  - Short + regime shifts to SHORT_SQUEEZE or TREND_DAY_UP → "regime flipped"
  - Short + regime shifts to RANGE_DAY → "trend conviction lost"
- Sector velocity: poll sector every 3 min, store last 2 readings, detect rapid drift
  - "Metal sector moved +1.2% in last 3 min — short at risk"

### 2.5.2 Positions Tab UI Changes
- Each position row gets an inline health dot (green / amber / red)
- Hover → tooltip showing the specific reason(s): "Sector: Metal drifting to neutral (+0.8% in 3 min)"
- Click dot → loads symbol in Place Order tab for quick exit/adjustment

### 2.5.3 Position Alert Banner
- Dismissible banner at top of Positions panel when any position status is `watch` or `exit`
- "1 position needs attention — JINDALSTEL short (sector turning)"
- Per-position dismiss, re-triggers if conditions worsen further

### Future additions to Position Intelligence (need other work first)
- **Zone proximity alert**: warn when price is approaching the nearest support/resistance zone
  — blocked on: merging station agent zone data into `/api/stock-context` response
  — the station agent already computes key zones; stockContext just needs to include the nearest
    zone level + type so client-side distance check is possible
- **Per-stock VWAP reclaim**: flag when a held stock crosses VWAP against position
  — blocked on: per-symbol VWAP in stockContext (currently only NIFTY VWAP is in regime data)
- **Intraday sector trend line**: track sector % every 15 min, show mini sparkline on position row

---

## Phase 5 — Multi-Symbol & Portfolio View (4–6 weeks)
*From single-symbol terminal to portfolio-aware platform.*

### 5.1 Options Dashboard
- Show all open option positions with Greeks (delta, theta, gamma)
- P&L by leg, net delta of portfolio
- Regime overlay on options: "Trend Day — gamma scalp caution"

### 5.2 Trade Journal
- Auto-log every placed order with regime + scenario at time of order
- Review screen: "You placed 8 TREND_DAY_UP trades — 6W 2L"
- Tag trades manually: "followed plan", "FOMO", "revenge"

### 5.3 Multi-Symbol Regime Board
- Grid of 10–20 symbols, each with: price, regime dot, scenario badge
- Sort by regime type, confidence, or % move
- Like a prop desk overview — full market picture at a glance

---

## Quick Wins (can do anytime)
- [ ] Regime card: add "What to do today" 1-liner based on regime type
- [ ] Scenario card: show risk:reward ratio if stop + target available from agents
- [ ] Orders page: show regime at time of each order (from Redis timeline)
- [ ] Terminal: "Copy to clipboard" for scenario setup text (share with Discord/WhatsApp)
- [ ] Mobile: at minimum, trades summary + watchlist must be usable on phone

---

## Non-Goals (won't do)
- Multi-user / social features
- Backtesting engine (too complex, not differentiated)
- Algo / automated execution (regulatory complexity)
- Fundamental analysis (out of scope for intraday tool)

