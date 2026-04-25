# DOM System — User Guide

## What is the DOM system?

DOM stands for **Depth of Market** — the live order book showing buyers and sellers queued at every price level for Nifty, BankNifty, and Sensex futures. Most traders only see the candle chart. The DOM system reads what is happening *inside* that candle — who is placing orders, where the walls are, and whether the buying or selling flow is real or a trap.

The system connects to Kite's WebSocket feed on a VPS, processes the 20-level order book at ~250ms ticks, and surfaces only the decision-relevant summary in plain English.

---

## Components

### 1. Live Market Bias strip (Third Eye `/eye`)

A persistent strip above the setup cards that shows the current market state at a glance.

**Example output:**
```
● LIVE MARKET BIAS
Strong Bullish (7.5/10)
Based on: Bid stacking · Buy side 2.1× heavier · Positive delta 8.4k
❗ Bias fades if delta turns negative or imbalance drops below 1.6
Sell wall at ₹24,090 — likely to cap upward moves unless absorbed
```

- **Bias label** — one of: Strong Bullish, Bullish, Mild Bullish, Strong Bearish, Bearish, Mild Bearish, Neutral, or Possible Bull/Bear Trap
- **Score (x/10)** — composite strength score based on imbalance depth (0–3pts), delta flow (0–3pts), order stacking (0–1.5pts), and iceberg detection (0–1pt)
- **Based on** — the specific signals driving the bias, in plain English
- **Invalidation** — the exact condition that would flip or kill the current bias
- **Wall note** — shown separately if a significant bid/ask wall or iceberg is detected

Updates every 15 seconds. Disappears if the bridge is offline or data is stale (>30s old).

---

### 2. DOM Intelligence card (Setup cards on `/eye`)

Every time a setup fires — VWAP Cross, Momentum Drive, Power Candle, Pullback Resume, ATR Expansion, ORB — the DOM verdict is evaluated for that specific setup's direction, entry price, target, and current VWAP. The card shows a structured verdict inside the setup card.

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
- **Invalidation** — the exact condition that would flip this verdict

---

### 3. Bridge status indicator (Trades page `/trades`)

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

2. **Read the DOM verdict inside the setup card.** A ✅ GO with HIGH confidence means DOM, delta, and stacking all agree with the setup direction. A 🚫 AVOID means the order book is strongly fighting you — skip the setup.

3. **Look at the invalidation line before you enter.** This tells you the exact condition that kills the current bias. If that condition is close (e.g., "imbalance drops below 1.6" and it is currently 1.7), the setup has thin edge.

### Score interpretation

| Score | Reading |
|-------|---------|
| 7–10 | Strong edge — multiple signals aligned, good follow-through probability |
| 4–6 | Moderate edge — 1–2 signals aligned, use normal sizing |
| 0–3 | Weak edge — order book neutral or noisy, reduce size or skip |

### Wall notes

A sell wall above your entry means price is likely to stall there even if the trade is moving in your favour. Two scenarios:

- **Wall holding, not absorbing** → WAIT verdict. Avoid entering until the wall clears with volume.
- **Wall absorbing (iceberg detected)** → GO verdict with elevated breakout probability. Enter but watch for wall to hold.

A buy wall below your short entry means support is nearby. The verdict will flag this as a WAIT until that support pulls or breaks.

---

## Infrastructure

The DOM data pipeline:

```
Kite WebSocket (modeFull, 250ms ticks)
  ↓
VPS bridge (kite-ws-bridge.js, pm2, port 8765)
  ↓
Upstash Redis  dom:snapshot:{token}  (5s TTL)
  ↓
Next.js APIs (/api/dom/pressure, /api/dom/status)
  ↓
/eye pressure strip + setup card verdicts
```

The bridge subscribes to Nifty, BankNifty, and Sensex near-month futures automatically on connect, resolving the current expiry token directly from the Kite instruments CSV. It also subscribes to your intraday watchlist stocks and polls for late additions between 8–10 AM IST.

### Enabling / disabling

The entire DOM system is gated by a single env var:

```
DOM_ENABLED=true   # enable bridge, pressure API, and verdicts
DOM_ENABLED=false  # silently disabled — pressure strip hidden, verdicts null
```

### Dev / testing mode

Add `?dev` to the Third Eye URL to see mock DOM data without the bridge running:

```
/eye?dev
```

This bypasses `DOM_ENABLED` and injects a static bullish scenario so you can see how the pressure strip and setup card DOM verdicts look.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Pressure strip not showing | `DOM_ENABLED` not set, or bridge offline | Check bridge status dot on `/trades`; test with `?dev` |
| DOM verdict showing "No DOM data yet" | Token not subscribed or bridge not connected | Restart bridge on VPS: `pm2 restart kite-ws-bridge` |
| Bridge connecting with 0 tokens | Futures token not in Redis | Run seed script: `REDIS_NAMESPACE=tradingverse node scripts/seed-fut-tokens.mjs` |
| Data stale (>30s) | Bridge dropped WebSocket | Kite access token may have expired — regenerate and update VPS env |
| Setup card showing no DOM verdict | `DOM_ENABLED` is off or token lookup failed | Enable DOM or check Redis for `fut-token-NIFTY` key |
