# Order Flow / DOM Module — Design Notes

> Parked for future implementation. Need to verify Kite Connect subscription tier first.

---

## What Is Order Flow (SMB Style)

Order flow analysis studies **who is doing what, at what price, and in what size** — in real time. Unlike candle charts which show *what happened*, order flow shows *how* it happened.

SMB Capital teaches reading:
- **Absorption** — Large limit orders on bid/ask that prevent price from moving. Reveals iceberg orders.
- **Sweeping the book** — Large buyer hitting every ask level rapidly = urgency = institutional chase.
- **Stacking** — Bid keeps refreshing with large size as price ticks up = institution defending a level.

Key insight: Chart shows a breakout level. Order flow tells you if the breakout is **genuine** (real buyers absorbing all supply) or **fake** (no follow-through, sellers matching every tick).

---

## What Kite Connect Provides

### ✅ 20-Depth via `modeFull` — Already Accessible

Kite Connect's `modeFull` WebSocket subscription gives **20 levels** of bid/ask depth (Level 3 data):
- Available to anyone generating **≥ ₹100 brokerage every 4 weeks** (active traders qualify automatically)
- Included in Kite Connect subscription (₹500/month) — **no separate add-on needed**
- Updated every 3 days for eligibility check
- Streaming via WebSocket in real-time

> **Verdict**: As an active trader you almost certainly already have access. **Confirmed — we can build the full DOM module.**

### WebSocket `modeFull` Payload
```json
{
  "last_price": 24550,
  "volume": 1234567,
  "depth": {
    "buy": [
      { "price": 24549, "quantity": 150, "orders": 3 },
      { "price": 24548, "quantity": 400, "orders": 7 },
      // ... up to 20 levels
    ],
    "sell": [
      { "price": 24551, "quantity": 80, "orders": 2 },
      // ... up to 20 levels
    ]
  }
}
```

---

## Features We Can Build

### 1. DOM Ladder / Market Depth Heatmap
Live price ladder showing bid/ask walls. Thick levels that absorb price = institutional defense zones.

```
SELL SIDE (Asks)
24560  |████████| 1,200 qty  ← big wall
24558  |██| 180 qty
24555  |███| 320 qty
───────── 24554 LAST ──────────
24553  |████| 450 qty
24550  |██████████| 2,100 qty  ← large bid support
24548  |█| 60 qty
BUY SIDE (Bids)
```

### 2. Bid/Ask Imbalance Indicator
```
Imbalance = (Total Bid Qty Lvl 1-3) / (Total Ask Qty Lvl 1-3)
```
- Ratio > 2.0 → Strong buy-side stacking → bullish signal
- Ratio < 0.5 → Ask crushing bid → bearish signal

### 3. Volume Delta (per candle)
Infer aggressor side from tick direction:
- LTP moved up AND bid qty decreased → buyer swept the ask (aggressor buy)
- LTP moved down AND ask qty decreased → seller hit the bid (aggressor sell)

Accumulate per candle → **Volume Delta bar chart** displayed below price chart.  
Green bars = net buying, Red bars = net selling. Divergences = hidden pressure.

### 4. Live Tape / Time & Sales Strip
Every LTP WebSocket tick = one tape print. Scrolling strip:
```
24554  |  ▲  |  350  | 14:32:05  | 🟢 BUY
24553  |  ▼  |  120  | 14:32:04  | 🔴 SELL
24554  |  ▲  |  800  | 14:32:04  | 🟢 BUY  ← large print highlighted
```

---

## Architecture — Using Existing Vultr VPS

**We already have a Vultr VPS** used for the static IP that is whitelisted with Kite Connect.  
This is the perfect home for the WebSocket bridge — same IP, already authorised, no new cost.

```
Kite WebSocket (modeFull, ~250ms ticks)
        ↓
Vultr VPS — kite-ws-bridge.js (Node.js, managed by pm2)
        ↓  WebSocket server  e.g. port 8765
Browser — connects directly, receives live 20-depth DOM ticks
```

### Why This Works Perfectly
- Kite already whitelists the Vultr IP → no new IP approval needed
- pm2 keeps the bridge process alive and auto-restarts on crash
- Vercel (Next.js) handles auth, charts, option chain as before
- Vultr bridge **only** handles the live tick stream — small, single-purpose process

### Implementation Sketch

**`kite-ws-bridge.js`** (~100 lines, runs on Vultr):
```js
// 1. Connect to Kite WebSocket with API key + access token
// 2. Subscribe requested tokens in modeFull
// 3. On each tick: broadcast to all connected browser clients
// 4. Handle reconnection automatically
```

**Browser side**:
```js
// 1. Next.js issues a short-lived token after login check
// 2. Browser opens: ws://[vultr-ip]:8765?token=xxx
// 3. Sends: { subscribe: ['NSE:NIFTY 50'] }
// 4. Receives 20-depth ticks every ~250ms → renders DOM
```

### Security
- Vultr bridge validates a short-lived token (issued by Next.js after auth check)
- Or: restrict WebSocket connections to known Origin header
- Port 8765 firewalled to only accept from browser IPs (optional, can open to all)

---

## Build Priority (once data access confirmed)

| Feature | Difficulty | Value | Notes |
|---|---|---|---|
| Bid/Ask Imbalance indicator | Low | High | Easy win, needs only Level 1 |
| DOM Heatmap (5-depth) | Medium | Very High | Core feature |
| Volume Delta per candle | Medium | Very High | Most useful for chart confirmation |
| Live Tape strip | Medium | High | UX differentiator |
| Full 20-depth ladder | High | Very High | Power user feature |

**Volume Delta + DOM Heatmap** is the priority combo — no Indian retail platform currently shows this.

---

## Action Items Before Building

- [ ] Verify active Kite Connect subscription tier
- [ ] Test if `full` mode WebSocket gives depth data on current plan
- [ ] Check if 20-depth endpoint is accessible (usually requires higher tier or add-on)
- [ ] Decide: SSE vs sidecar WebSocket for production architecture
