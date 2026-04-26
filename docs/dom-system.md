# DOM System — User Guide

## What is the DOM system?

DOM stands for **Depth of Market** — the live order book showing buyers and sellers queued at every price level for Nifty, BankNifty, and Sensex futures. Most traders only see the candle chart. The DOM system reads what is happening *inside* that candle — who is placing orders, where the walls are, and whether the buying or selling flow is real or a trap.

The system connects to Kite's WebSocket feed on a VPS, processes the 20-level order book at ~250ms ticks, and surfaces only the decision-relevant summary in plain English.

---

## Components

### 1. Live Market Bias strip (Third Eye `/eye`)

A persistent card above the setup cards showing the current market state at a glance.

**Example output:**
```
● ORDER BOOK BIAS                        7.2/10
Strong Bullish
Bid stacking · Buy side 2.1× heavier · Positive delta 8.4k
❗ Bias fades if delta turns negative or imbalance drops below 1.6
Sell wall at ₹24,090 — likely to cap upward moves unless absorbed
[Book ▾]
```

- **Bias label** — one of: Strong Bullish, Bullish, Mild Bullish, Strong Bearish, Bearish, Mild Bearish, Neutral, or Possible Bull/Bear Trap
- **Score (x/10)** — composite strength score: imbalance depth (0–3pts) + delta flow (0–3pts) + stacking (0–1.5pts) + iceberg detection (0–1pt)
- **Based on** — specific signals driving the bias in plain English
- **Invalidation** — exact condition that would flip or kill the current bias
- **Wall note** — shown separately if a significant bid/ask wall or iceberg is detected

Updates every 15 seconds. Disappears if bridge is offline or data is stale (>30s old).

---

### 2. DOM Ladder (Book ▾ inside the bias strip)

Click **Book ▾** in the Order Book Bias strip on `/eye` to expand the full order book inline.

**What you see:**
```
  price       bar            qty
  24,052  ░░░░████████████  21.4k        ← ask (furthest from spread)
  24,051  ░░░░░░░████████   15.8k
  24,050  ░░░░░░░░░███████  12.1k ⚡      ← iceberg absorption
  24,049  ░░░░░░░░░░░████    8.2k
  24,048  ░░░░░░░░░░░░███    4.6k        ← best ask (closest to spread)
          ───── 1.0pt ─────
  24,047  ███░░░░░░░░░░░░░   5.1k        ← best bid
  24,046  ██████░░░░░░░░░░   9.8k
  24,045  █████████░░░░░░░  13.3k
  24,044  ████████████░░░░  17.9k 🧱      ← large static wall
  24,043  ████░░░░░░░░░░░░   6.2k

  Imb 2.1×      δ5m +8.4k      δ30m +22k

  δ5m timeline
  ▂▃▅▄▆▇▅▆█▇▆▅▄▅▇▆▅▄▅▆   ← bar chart of recent net flow
```

**Reading the book:**
- **Red bars** = ask side (sellers). Taller bar = more quantity at that level.
- **Green bars** = bid side (buyers). Taller bar = more quantity at that level.
- **⚡ (iceberg)** — A large hidden order being repeatedly placed and hit at this price. Price is likely to stall here, but if it keeps getting absorbed, a breakout/breakdown is building.
- **🧱 (wall)** — A large visible static order. Price tends to respect these until they're pulled or absorbed.
- **Spread line** — the gap between the best bid and best ask.
- **Imb** — imbalance ratio. ≥1.6× = buyers dominating; ≤0.63× = sellers dominating; near 1× = balanced.
- **δ5m** — net cumulative delta over the last 5 minutes. Positive = net buying; negative = net selling.
- **δ30m** — same over 30 minutes. Divergence between δ5m and δ30m can signal a momentum shift.

**δ5m timeline** — mini bar chart of recent δ5m readings sampled every ~15s. Rising green bars = buying pressure building. Red bars falling = selling pressure. Flat/alternating = range, no edge.

**Update speed:** The ladder streams via SSE (Server-Sent Events), updating within ~1.5s of the VPS bridge writing new data to Redis. On environments where SSE is unavailable it falls back to 2s polling automatically.

---

### 3. DOM Intelligence card (Setup cards on `/eye`)

Every time a setup fires — VWAP Cross, Momentum Drive, Power Candle, Pullback Resume, ATR Expansion, ORB — the DOM verdict is evaluated for that specific setup's direction, entry price, target, and current VWAP. The card appears automatically inside the setup card.

**Verdict levels:**

| Level | Icon | When |
|-------|------|------|
| GO | ✅ | DOM confirms the setup direction |
| WAIT | ⏳ | Wall in path, or absorption/trapped-trader signal detected |
| CAUTION | ⚠️ | Mixed signals, fading momentum, or wide spread |
| AVOID | 🚫 | DOM strongly opposes the setup direction |

**Card fields:**
- **Signal combination** — e.g. "Bid stacking + Positive delta + VWAP support → Strong bullish bias"
- **Confidence badge** — LOW / MEDIUM / HIGH based on number of aligned signals (1 / 2 / 3+)
- **Bias + Context** — e.g. "Strong Bullish (High) · VWAP support"
- **Meaning** — what the order book is actually showing
- **Implication** — what is likely to happen if the setup plays out
- **Action** — specific entry guidance
- **Invalidation** — exact condition that would flip this verdict

No action needed — the verdict is automatically attached to each setup when the scan runs.

---

### 4. DOM Stock Subscriptions (Third Eye Settings `/eye/settings`)

The bridge tracks Nifty, BankNifty, and Sensex futures automatically. To also track individual stocks via DOM, go to **`/eye/settings`** → scroll to **DOM Stock Subscriptions** at the bottom.

- Type an NSE symbol (e.g. `HDFCBANK`) and click **Add**
- The bridge picks up the updated list within its next poll cycle (~60s)
- Once tracking, the symbol shows a green ● pulse dot and live LTP
- Grey dot = bridge not sending data for that symbol yet (may need restart)
- Maximum 10 symbols

Stock DOM data is then available via `/api/dom/stock-verdict?symbol=HDFCBANK&direction=bull&entry=820&target=840&vwap=818`.

---

### 5. Bridge status indicator (Trades page `/trades`)

A small pulse dot in the sub-bar (admin only) shows whether the VPS bridge is live:

- 🟢 **DOM Live** — bridge connected, data fresh
- 🔴 **DOM Offline** — bridge disconnected or data stale
- Hidden if `DOM_ENABLED` is off

---

## Signal glossary

| Signal | What it means |
|--------|---------------|
| **Bid heavy / Ask heavy** | The top-3 bid or ask levels have significantly more total quantity than the other side (imbalance ≥1.6× or ≤0.63×) |
| **Bid stacking / Ask stacking** | The bid or ask side is growing tick-over-tick — buyers or sellers are adding orders |
| **Positive delta / Negative delta** | Net buying or selling flow over the last 5 minutes (estimated from order book fills) |
| **VWAP support / VWAP resistance** | Price is within ₹15 of VWAP and the dominant side is defending it |
| **Resistance absorbed / Support absorbed** | An iceberg wall at a key level is being repeatedly hit and refilled — hidden large orders |
| **Possible Bull/Bear trap** | Heavy delta flow but order book not confirming — the aggressive side may be getting absorbed and will panic-exit if price turns |

---

## How to use it in your trading

### Before placing a setup

1. **Check the Live Market Bias strip first.** If it says "Strong Bearish" and a CALL setup fires, that is a conflict. The setup may still work but the probability is lower.

2. **Open the Book ladder (Book ▾).** Look at who is heavier on the side your trade needs to go. If you're buying a CE and the ask side is thin while bids stack — good sign. If there's a large sell wall between your entry and target — wait for it to absorb.

3. **Read the DOM verdict inside the setup card.** A ✅ GO with HIGH confidence means DOM, delta, and stacking all agree with the setup direction. A 🚫 AVOID means the order book is strongly fighting you — skip the setup.

4. **Look at the δ5m timeline.** Consistent green bars over the last 15–20 readings = sustained buying pressure. A recent flip from green to red = momentum fading, extra caution warranted.

5. **Look at the invalidation line before you enter.** This tells you the exact condition that kills the current bias. If that condition is close (e.g., "imbalance drops below 1.6" and it is currently 1.7), the setup has thin edge.

### Score interpretation

| Score | Reading |
|-------|---------|
| 7–10 | Strong edge — multiple signals aligned, good follow-through probability |
| 4–6 | Moderate edge — 1–2 signals aligned, use normal sizing |
| 0–3 | Weak edge — order book neutral or noisy, reduce size or skip |

### Wall notes

A sell wall above your entry means price is likely to stall there even if the trade is moving in your favour. Two scenarios:

- **Wall holding, not absorbing** → WAIT verdict. Avoid entering until the wall clears with volume.
- **Wall absorbing (iceberg detected ⚡)** → GO verdict with elevated breakout probability. Enter but watch for wall to hold.

A buy wall below your short entry means support is nearby. The verdict will flag this as a WAIT until that support pulls or breaks.

---

## Infrastructure

The DOM data pipeline:

```
Kite WebSocket (modeFull, 250ms ticks)
  ↓
VPS bridge (kite-ws-bridge.js, pm2, Vultr Mumbai 65.20.81.173)
  → Writes dom:snapshot:{token} to Redis every 5s
  → Polls ${NS}:dom:subscriptions for extra stock symbols (~60s)
  ↓
Upstash Redis
  dom:snapshot:{futToken}          — raw bids/asks/delta/walls (5s bridge write)
  dom:delta-history-{underlying}   — rolling 40 delta5m readings (written by /api/dom/pressure every 15s)
  dom:subscriptions                — JSON array of subscribed stock symbols
  dom:stock-token:{symbol}         — instrument token for a subscribed stock
  ↓
Next.js API routes
  /api/dom/pressure     → bias summary for the strip (polled every 15s by client)
  /api/dom/live         → SSE stream for the ladder (1.5s Redis polls, 50s lifetime then client reconnects)
  /api/dom/snapshot     → one-shot raw book + delta history (fallback for ladder if SSE unavailable)
  /api/dom/subscriptions→ GET/POST/DELETE stock symbol list
  /api/dom/stock-verdict→ full DOM verdict for any subscribed stock
  /api/dom/status       → bridge heartbeat (no auth)
  ↓
UI
  DomPressureStrip   — Order Book Bias summary + Book ▾ → DomLadder
  DomLadder          — live bid/ask book + delta timeline
  SetupZone          — DOM verdict card inside each setup (automatic)
  /eye/settings      — DOM Stock Subscriptions manager (bottom of page)
```

### Enabling / disabling

The entire DOM system is gated by a single env var:

```
DOM_ENABLED=true   # enable bridge, pressure API, verdicts, and ladder
DOM_ENABLED=false  # silently disabled — strip hidden, verdicts null, subscriptions still accessible
```

### Dev / testing mode

Add `?dev` to the Third Eye URL to see mock DOM data without the bridge running:

```
/eye?dev
```

This injects a static bullish scenario so you can preview the strip, ladder, and setup DOM verdict.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Order Book Bias strip not showing | `DOM_ENABLED` not set, or bridge offline | Check bridge status dot on `/trades`; test with `/eye?dev` |
| DOM verdict showing "No DOM data yet" | Token not subscribed or bridge not connected | Restart bridge: `pm2 restart kite-ws-bridge` on VPS |
| Bridge connecting with 0 tokens | Futures token not in Redis | Run seed script: `REDIS_NAMESPACE=tradingverse node scripts/seed-fut-tokens.mjs` |
| Data stale (>30s) | Bridge dropped WebSocket | Kite access token may have expired — regenerate and update VPS env |
| Setup card showing no DOM verdict | `DOM_ENABLED` is off or token lookup failed | Enable DOM or check Redis for `fut-token-NIFTY` key |
| Book ladder shows "Order book unavailable" | Bridge not running or SSE + polling both failing | Verify bridge with `/api/dom/status`; check Vercel function logs |
| Stock symbol shows grey dot after adding | Bridge hasn't polled subscriptions list yet | Wait ~60s or restart bridge; check `dom:stock-token:{symbol}` key exists in Redis |
| δ5m timeline is empty | Delta history not yet accumulated | Appears after `/api/dom/pressure` is polled a few times (~2–3 min after bridge connects) |
