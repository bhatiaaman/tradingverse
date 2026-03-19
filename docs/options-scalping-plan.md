# Options Scalping Strategy — Nifty
**Goal:** ₹3,000–4,000/day | 2–4 trades | ₹1–1.5L capital

---

## Capital & Math

- Instrument: Weekly Nifty ATM options (0DTE or 1DTE — Thursday expiry)
- 2 lots ATM call/put @ ₹150 premium = ₹22,500 per trade
- Active capital needed: ₹1–1.5L (covers 3–4 positions + buffer)
- Per trade target: +₹30 move in premium → +₹4,500 (2 × 75 × 30)
- Per trade stop: -₹20 → -₹3,000
- 1 winning trade = done for the day

---

## Strategy: VWAP Pullback + Regime Filter

### Rule 1 — Regime filter (only trade on TREND days)
- Regime = TREND_DAY_UP or TREND_DAY_DOWN (HIGH or MEDIUM confidence)
- RANGE_DAY / LOW_VOL_DRIFT = NO TRADE (theta kills option buyers)

### Rule 2 — Strike selection
- Weekly expiry (current week Thursday)
- ATM strike = closest to spot
- Regime HIGH confidence → ATM
- Regime MEDIUM confidence → 1 strike OTM (cheaper, higher leverage)

### Rule 3 — Entry signal (VWAP pullback)
```
TREND_DAY_UP:
  - Nifty pulls back toward VWAP on 5m
  - 5m candle closes back ABOVE VWAP
  - 15m bias = BULLISH or NEUTRAL (not bearish)
  → BUY ATM CALL

TREND_DAY_DOWN:
  - Nifty bounces toward VWAP on 5m
  - 5m candle closes back BELOW VWAP
  - 15m bias = BEARISH or NEUTRAL
  → BUY ATM PUT
```

### Rule 4 — Exit
- Target: +25–35% gain on premium (e.g. ₹150 → ₹200)
- Stop: -20% loss on premium (e.g. ₹150 → ₹120)
- Time stop: force exit at 1:30 PM regardless (theta accelerates post 2 PM)
- Trail: after +20% gain, move stop to entry price (free trade)

### Rule 5 — Session rules
- Entry window: 9:30 AM – 1:00 PM only
- Max 3 trades/day
- Stop trading if: -₹5,000 on the day (2 stop outs)
- Stop trading if: +₹4,000 on the day (lock it in)
- No trades on expiry morning until 10 AM (spreads too wide)

---

## When NOT to Trade

| Situation | Action |
|---|---|
| VIX > 18 | Reduce size (premiums inflated, stops hit easily) |
| Regime = RANGE_DAY | Skip the day |
| 15m bias conflicts with 5m | Skip the trade |
| Already hit +₹4,000 | Log off |
| First trade was a stop-out | Wait 30 mins before next |
| Budget / RBI policy / F&O expiry AM | No fresh entries |

---

## Realistic Monthly P&L (on ₹1.5L capital)

| Days | Outcome | Total |
|---|---|---|
| 8 trend days | +₹3,500 avg | +₹28,000 |
| 6 partial days | +₹1,500 avg | +₹9,000 |
| 5 stop-out days | -₹2,500 avg | -₹12,500 |
| 3 no-trade days (range) | ₹0 | ₹0 |
| **Net** | | **~₹24,500** |

~16% monthly on good months, 8–10% average. Returns are excellent if rules are followed strictly.

---

## What's Already Built (maps directly to this strategy)

| Strategy need | Already built |
|---|---|
| Regime filter | `detectIntradayRegime` |
| VWAP position | `vwapPosition` in regime output |
| 15m bias confirmation | `fetchFifteenMinBias` |
| Synthesis (aligned/conflicting) | commentary panel |
| Order placement | `/api/place-order` |
| Instrument/strike search | `/api/search-instruments` |

---

## What Needs to Be Built

1. **Signal engine** (cron every 1m during market hours)
   - Fetch 1m + 5m candles
   - Check regime + VWAP pullback condition
   - Check 15m bias alignment
   - Fire signal only when all 3 align

2. **Strike lookup**
   - Use `/api/search-instruments` to find ATM weekly strike
   - Auto-select call or put based on direction

3. **Auto order placement**
   - Place buy order via `/api/place-order`
   - Immediately set SL and target as separate orders
   - Store position in Redis

4. **Position monitor** (cron every 30s)
   - Track premium P&L
   - Trail stop after +20% gain
   - Force exit at 1:30 PM or daily limits hit

5. **Scalper dashboard widget on /trades**
   - Today's algo trades, entry/exit, P&L
   - Status: Active / Stopped / Daily limit hit
   - Manual kill switch
