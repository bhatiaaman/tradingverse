# Order Flow / DOM Module — Design Document

> Status: Planning complete. Ready to build Phase 1 when prioritised.

---

## Core Vision

DOM is not just a display feature — it is a **pre-trade intelligence layer** that gives the trader a clear, one-line verdict before every order.

The user should never have to read raw numbers and figure out what they mean. The system reads the DOM and tells them:

> *"Good entry — buyers stacking, no resistance to your target."*
> *"Wait — large ask wall just above entry. Let it clear first."*
> *"Avoid — sellers overwhelming. Delta negative last 3 minutes."*

This verdict-first design is the core UX principle. Every DOM surface shows a **clear intent message** before any numbers.

---

## Where DOM Shows (Surface Map)

| Instrument | DOM Source | Where it appears |
|---|---|---|
| Nifty | Nifty Futures (near-month) | Third Eye setup card |
| Sensex | Sensex Futures (near-month) | Third Eye setup card |
| BankNifty | BankNifty Futures (near-month) | Order modal |
| Intraday watchlist stocks | Stock's own NSE depth | Order modal |
| Nifty options (CE/PE) | Two layers — see below | Third Eye setup card + Order modal |

Index depth (Nifty 50, Sensex index) is thin and meaningless. Always use Futures as the proxy — that is where institutional size actually sits.

---

## Two-Layer DOM for Nifty Options

When trading Nifty options, two separate DOM signals are needed. They answer different questions.

**Layer 1 — Nifty Futures DOM (directional)**
*Should I be buying CE or PE right now?*
- Strong bid stacking on Nifty Fut → bullish pressure → supports CE buy
- Ask wall being absorbed on Nifty Fut → potential breakout → high conviction CE entry
- This is the stronger signal. Always check this first.
- Lives in Third Eye — shown on every setup card from 9:15 onwards.

**Layer 2 — ATM Option Contract DOM (fill quality)**
*Will this specific strike behave well when I enter?*
- Huge ask wall on 24050 CE → sellers defending → premium may stall even if Nifty moves up
- Thin ask side → option flows freely → premium reacts cleanly to underlying
- Wide bid/ask spread → poor liquidity → risk of bad fill
- Net sellers on this strike → market makers hedging against the move you expect

Layer 1 is about direction. Layer 2 is about execution quality. Both together give a complete picture.

### Honest Limitation on Option DOM
Options market makers refresh depth constantly — option DOM is noisier than futures. The most reliable signals from option contract DOM are:
- **Spread width** — wide = poor liquidity = bad fill risk
- **Net volume delta** — net buyers or net sellers on this strike right now
- **Ask wall size** — real supply capping the premium

The futures DOM (Layer 1) is the primary directional signal. The option DOM (Layer 2) is a fill quality and liquidity check layered on top.

---

## User-Friendly Verdict Messages

### Design Principle
One verdict line. One reason. One action if needed. No raw numbers in the headline — numbers go in the detail row below. Trader reads it in under 2 seconds.

```
[VERDICT ICON]  [Clear sentence what to do]
[One-line reason + key number if relevant]
```

### Verdict Levels

**✅ Good entry**
Conditions support the trade. Both underlying pressure and contract liquidity are aligned.
```
✅  Good entry — buyers in control, clear path to your target
    Nifty Fut bid 2.1× · 24050 CE ask side thin · spread ₹1.2
```

**⏳ Wait for one thing to clear**
Setup is good but one specific blocker exists. Tell the trader exactly what to watch.
```
⏳  Wait — ask wall at ₹24,065 (15pts above). Let it clear first.
    Once sellers lift from 24,065, entry looks strong.
```

**⚠️ Proceed carefully**
Mixed signals — trade is valid but size down or be quick.
```
⚠️  Proceed carefully — buyers present but delta fading last 3 min
    Consider half size or wait for delta to turn positive again.
```

**🚫 Avoid right now**
DOM actively contradicts the trade direction.
```
🚫  Avoid — sellers overwhelming buyers right now
    Ask 3.2× heavier than bid · Net selling on 24050 CE · Delta -9,400
    Wait for reversal or skip this signal.
```

**📊 No DOM data**
Stock not in intraday list or bridge not connected.
```
📊  No DOM data for this stock — add to intraday list for pre-trade insights
```

### Verdict Logic (CE buy example)

| Condition | Verdict |
|---|---|
| Fut bid > 1.8× AND delta positive AND no ask wall within target range AND spread tight | ✅ Good entry |
| Ask wall exists but > 20pts away AND bid pressure ok | ✅ Good entry (wall noted in detail) |
| Ask wall within 15pts of entry OR spread > ₹2.5 | ⏳ Wait |
| Delta turning negative last 3 candles OR imbalance neutral | ⚠️ Proceed carefully |
| Ask > 2.5× bid OR net sellers on option contract OR delta strongly negative | 🚫 Avoid |

Reverse all conditions for PE buy (bear setup).

### In Third Eye Setup Card

Before (raw data — confusing):
```
ATM 24050 CE · Primary
┌─ Underlying ──────────────────┐
│  Bid 2.1×  ↑Stacking  +8,400 │
│  No major ask wall in range   │
└───────────────────────────────┘
┌─ Contract (24050 CE) ─────────┐
│  Ask side thin · Spread ₹1.5  │
│  Volume ↑ vs avg              │
└───────────────────────────────┘
```

After (verdict-first — clear intent):
```
ATM 24050 CE · Primary

✅  Good entry — buyers in control, path clear to 24,080
    Nifty Fut stacking · CE ask thin · spread ₹1.5

    Qty  [65]    [ BUY CE ]
```

Expandable detail row (tap to see):
```
  Underlying   Bid 2.1×  ↑Stacking  Delta +8,400
  Contract     Spread ₹1.5  Volume ↑  No wall in range
```

### In Order Modal (stock / BankNifty)

```
Placing order — RELIANCE  MIS  BUY  100 qty

⏳  Wait — large ask wall at ₹1,432 (11pts above entry)
    85,000 qty defending. May cap upside on this move.
    Watch for wall to clear, then enter.

    [ Place anyway ]    [ Cancel ]
```

---

## Intraday Focus List — Daily Setup Ritual

User selects up to 10 stocks each morning (or the night before). These are the only stocks monitored in modeFull. Quality over quantity — 10 well-monitored stocks beat 100 with stale data.

### Daily Flow

```
Night before / pre-market
  User selects up to 10 stocks → stored in Redis as intraday:list
        ↓
8:45–9:00 AM
  VPS bridge reads intraday:list
  Subscribes all tokens in modeFull (+ Nifty/Sensex/BankNifty Fut always)
        ↓
9:15 AM — Market opens
  Depth starts accumulating for all subscribed instruments
  dom:snapshot:{token} written to Redis every 5s per instrument
        ↓
User searches "Reliance" in order entry
  Token matched against intraday list
  DOM badge shown on search result instantly:
  "RELIANCE  ₹1,421  ⏳ Ask wall ₹1,432"
        ↓
User opens order modal
  Full pre-trade verdict shown (see above)
        ↓
User confirms → order placed
```

### Where User Selects the List
- **Pre-market page** — "Today's Focus" card, search and pin up to 10 stocks. Resets daily.
- **From scanner results** — "Add to today's list" button on scanner hits
- **Carry forward** — option to copy yesterday's list as starting point

---

## Dynamic Option Strike Subscription

Cannot pre-subscribe all option strikes (hundreds exist). Subscribe dynamically when Third Eye fires a setup.

```
Third Eye setup fires
  strike = 24050, optType = CE
        ↓
Resolve instrument token for "NIFTY 24050 CE [near expiry]"
  (same logic as nifty-chart route's resolveFuturesToken)
        ↓
Send subscribe message to VPS bridge:
  { subscribe: [token_24050_CE, token_24000_CE, token_24100_CE] }
  (ATM + one strike each side for context)
        ↓
Bridge subscribes in modeFull
  First tick arrives in ~250ms
  dom:snapshot:{token} available within 1-2s
        ↓
Scan route reads snapshot → appends DOM verdict to scalpSetup
  scalpSetup.domVerdict = { level: 'go', message: 'Good entry...', detail: {...} }
        ↓
Subscription expires after 20 minutes of inactivity
```

### Subscription Pools

| Pool | Tokens | Managed |
|---|---|---|
| Static | Nifty Fut, Sensex Fut, BankNifty Fut, intraday 10 stocks | Pre-subscribed from 8:45 AM, always-on |
| Dynamic | ATM ± 1 CE and PE strikes | Subscribed when setup fires, expire after 20 min |
| Total | ~16–20 tokens maximum | Well within Kite modeFull limits |

---

## getDomContext() — The Verdict Engine

A server-side utility function called by any route that needs DOM context. Not a full agent — just a Redis reader + verdict formatter.

```js
getDomContext(token, tradeDirection, entryPrice, targetPrice)
→ {
    verdict:  'go' | 'wait' | 'caution' | 'avoid' | 'no-data',
    message:  'Good entry — buyers in control, path clear to 24,080',
    detail:   'Nifty Fut stacking · CE ask thin · spread ₹1.5',
    numbers:  { imbalance, delta, spreadWidth, wallLevel, wallQty },
    fresh:    true | false,   // false if snapshot > 30s old
  }
```

Called by:
1. **Third Eye scan route** — after detectScalpSetup() fires, appends domVerdict to setup object
2. **Order placement route** — pre-trade check for any order on a subscribed instrument
3. **Search API** — one-line badge for search results

---

## Architecture

### VPS WebSocket Bridge

```
Kite WebSocket (modeFull, ~250ms ticks)
        ↓
Vultr VPS — kite-ws-bridge.js (Node.js, pm2)
  Responsibilities:
  - Subscribe static pool at startup (reads Redis intraday:list)
  - Accept dynamic subscribe/unsubscribe commands via Redis pub/sub
  - Accumulate candle-level volume delta per instrument
  - Detect patterns: iceberg, stacking, pulling, divergence
  - Write dom:snapshot:{token} to Redis every 5s
  - On browser reconnect: send delta backfill (history not lost)
  - Pull fresh Kite token from Redis at 6 AM (auto-refresh)
        ↓ wss:// (nginx + Let's Encrypt SSL)
Browser — connects via wss://dom.tradingverse.in
  For /dom page only (live ladder, tape, delta chart)
  Third Eye and order modal read via Redis, not WebSocket
```

### Critical Infrastructure Notes

**wss:// not ws://** — Site runs on HTTPS (Vercel). Browsers block mixed-content ws:// from HTTPS pages. Must use nginx reverse proxy on VPS with Let's Encrypt SSL → `wss://dom.tradingverse.in`.

**Kite token refresh** — Kite API token expires at 6 AM IST. Bridge pulls current token from the same Redis key that kite-worker writes. On 6 AM: reconnect with fresh token automatically.

**Delta backfill** — Delta is accumulated on the VPS bridge, not in the browser. On reconnect, browser receives candle-level delta history so chart is not blank after page refresh.

**Auth** — Next.js issues a 60s short-lived token → stored in Redis → browser opens wss://?token=xxx → bridge validates against Redis.

### Rendering — Canvas Not React State

20 price levels × 4 updates/second = 80 renders/sec in naive React → stutters. DOM ladder must render on **canvas**. Only the verdict message string and delta total go through React state.

---

## DOM Page (/dom)

Dedicated page for traders who want continuous monitoring on a second screen.

Shows for active instrument (user switches between subscribed tokens):
- Full 20-level DOM heatmap (canvas, colour intensity = quantity)
- Live tape / T&S strip with large print highlighting
- Delta bar chart (per 5-min candle, below price)
- Bid/ask imbalance gauge
- Stacking / pulling indicator per major level
- Iceberg markers 🧊 on levels that keep refreshing

This is a power-user feature. The primary value is in the verdict messages embedded in Third Eye and the order modal — most users will never open /dom directly.

---

## Advanced Signals (Phase 2)

**Iceberg detection 🧊**
Bid/ask quantity at a price refreshes back to large size immediately after trades execute → iceberg order. Market tried to break level, couldn't. High probability bounce/rejection.

**Stacking vs Pulling**
Track tick-by-tick whether a wall is growing or shrinking:
- `↑ stacking` — institution adding size, conviction
- `↓ pulling` — wall about to disappear, possibly spoofing

**Delta Divergence**
- Price making new session highs + delta turning negative → distribution (selling into rally) → avoid long
- Price making new session lows + delta turning positive → accumulation (buying dip) → look for reversal

**Large Print Alert**
Trade size > 3× rolling average → highlighted in tape + subtle audio cue. Institutions leave footprints.

---

## Build Phases

| Phase | What | Outcome |
|---|---|---|
| 1 | VPS bridge + wss:// + Kite token refresh + static subscriptions | Live depth flowing to Redis |
| 2 | Intraday list UI (pre-market page) + Redis management | User can select 10 stocks |
| 3 | getDomContext() utility + verdict engine | Verdict messages ready |
| 4 | DOM context in Third Eye setup card (Nifty/Sensex) | Setup card shows ✅/⏳/⚠️/🚫 |
| 5 | Dynamic option strike subscription at signal time | ATM CE/PE DOM at setup |
| 6 | Pre-trade DOM check in order modal | Verdict before every order |
| 7 | DOM badge on stock search results | Instant signal in search |
| 8 | /dom page — heatmap + tape + delta chart (canvas) | Full monitoring page |
| 9 | Iceberg + stacking + delta divergence detection | Advanced signals |

**Minimum viable wow: Phases 1–6.** Setup card showing a clean verdict message ("✅ Good entry") before a Nifty options trade is immediately useful and unique.

---

## Pre-Build Checklist

- [ ] Run `node scripts/test-modeFull.mjs` during market hours to confirm 20-depth access
- [ ] Decide subdomain for wss:// (`dom.tradingverse.in` or similar)
- [ ] Set up nginx + Let's Encrypt on Vultr VPS
- [ ] Confirm intraday list UI location (pre-market page recommended)
