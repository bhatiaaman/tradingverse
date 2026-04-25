# Future Build — Feature Backlog

## DOM System (remaining)

### DOM Page (`/dom`)
Full-screen live order book viewer. The ws-token auth route (`/api/dom/ws-token`) is already built.
- 20-level bid/ask depth ladder with quantity bars
- Live delta chart (5m rolling window)
- Absorption / iceberg detection indicator
- Bias score gauge (reuses pressure API)
- Multi-instrument tabs: Nifty Fut · BankNifty Fut · Sensex Fut

### Stock DOM Verdicts
Bridge already subscribes intraday watchlist stocks. Verdict engine (`dom-context.js`) accepts any token.
Gap: `getDomContext()` is only called in `third-eye/scan/route.js` for the Nifty futures token.
Fix: pass the stock's instrument token (from intraday list) into `getDomContext()` when a stock setup fires.

### Historical Pressure Log
Current bias score is point-in-time. A 30-min rolling Redis list of `{timestamp, direction, score}` would show:
- Whether bias has been consistently bullish or just flipped
- Trend confirmation (score rising = momentum building)
- Surface as a small sparkline in the pressure strip

### DOM Alerts
Notify when a significant DOM event happens without the trader watching the screen:
- Iceberg absorption detected at a user-defined price level
- Bias flips direction (bull → bear or vice versa)
- Score drops below threshold mid-trade (early exit signal)
Delivery: email via Resend (already installed) + browser push once push infra is built.

---

## Price Alerts
Full spec saved — ready to build.
- Price cross alerts (above / below)
- VWAP reclaim alerts
- Background checker via Vercel Cron (every 1 min, market hours)
- Email delivery via Resend (already installed — Phase A)
- Browser push via Web Push + VAPID + service worker (Phase B)
- Bell icon in Nav with unread badge
- Alert drawer UI + quick-add from terminal/chart

## Stock Scanner
Run Third Eye setup detection across a custom watchlist (20–50 stocks) or NSE 500 EOD.
- Custom watchlist CRUD in Redis
- Scanner API: batch candle fetch → Third Eye loop → results in ~15s
- NSE 500 EOD run after 3:30 PM, surfaced on pre-market page next morning
- Scanner page: setup picker, timeframe, list selector, results table
- Reuses `thirdEye.js` and `getDataProvider().getHistoricalData()` unchanged

## FII/DII Derivatives Tab
Extend `/investing/fii-dii` with a Derivatives tab. One new NSE endpoint, one new tab.
- Participant × Segment grid: FII / Pro / Client / DII × Index Fut / Index Opt / Stock Fut / Stock Opt
- Sentiment pills: Strong Bullish → Strong Bearish based on net OI delta thresholds
- Net OI + change shown below each pill
- Small change — ships in ~1 day

## Week Ahead Plan
Sunday cron → Claude → Redis → card on pre-market page + slide-over in terminal.
- Forward-looking weekly trading plan for Nifty + BankNifty
- Prompt already written (see `docs/weekly-plan-prompt.md`)
- Not chart analysis — macro + levels + key events for the week ahead
- Cron runs Sunday 6 PM IST, cached until next Sunday

## Natural Language Setup Conditions
Replace hardcoded `if` chains in `detectSetups()` with a JSON condition atom system.
- ~25 pre-built condition atoms (price_above_vwap, ema_stacked, candle_body_pct, etc.)
- Admin types plain English per setup → Claude parses → JSON conditions array saved to Redis
- `/eye/settings` condition editor UI with NL input + atom pill display
- Existing setups without conditions key fall back to current hardcoded logic

## Landing Page Improvements
Improvements and promotions for the public landing page.
- Mentioned as next focus (Mar 2026) — scope not yet defined

## Google OAuth → Production
One-click task before any public launch.
- Go to Google Cloud Console → OAuth consent screen → change from Testing → Production
- Only uses non-sensitive scopes (openid email profile) — should be immediate, no review
