# TradingVerse — Monetisation Plan

_Last updated: March 2026. This month's focus: freemium tier promotion only._

---

## Tier Decision: 2 Tiers (recommended)

**Free → Pro at ₹499/month.**

Start simple. At early stage (sub-100 users) a second paid tier adds pricing confusion, more gating code, and support overhead. Once you have 200+ users and know which features they actually use, add a second tier based on real data — not guesses.

---

## Tier Structure

### Free / Freemium
Everything that builds habit and shows value. No credit card ever.

| Feature | Access |
|---|---|
| Trading Games | All games, unlimited plays |
| Book summaries | All 4 books |
| Articles | All articles |
| Investing suite page | View (tool list only) |
| Pre-market dashboard | Indices strip + global cues (delayed, read-only) |
| Chart Analyser | **3 analyses/month** — main conversion trigger |
| Market commentary | Delayed 30 mins |
| Broker connection | Not available |
| Order placement | Not available |

### Pro — ~₹499/month
One paid tier. Everything unlocked.

| Feature | Access |
|---|---|
| Chart Analyser | Unlimited |
| Pre-market AI daily plan | ✓ |
| Market commentary | Real-time |
| Broker connection (Kite) | ✓ — dashboard, positions, watchlists |
| Behavioural Agent | Unlimited |
| **Order placement** | ✓ (Kite) |
| Portfolio X-Ray | ✓ when built |
| Stock Screener | ✓ when built |
| Saved watchlists | Unlimited |
| Daily email brief | 8:30 AM pre-market |
| Priority support | WhatsApp |

---

## What's Public vs Login-Gated

### No login needed (public)
- Home page — full
- Learn (books, articles) — full
- Games — full ← **best free hook, zero friction**
- Investing suite page (tool descriptions) — full
- Pre-market dashboard indices strip (delayed)

**Rule:** If it can be screenshotted/shared and brings new users → keep public.

### Free login required
- Chart Analyser (3 free uses/month)
- Full pre-market dashboard (sectors, breadth, commentary)
- Game streaks / score saving (when built)
- Settings / broker connection

**Rule:** The login is your list. Daily-habit features go behind free login, not a paywall.

### Pro subscription required
- Chart Analyser beyond 3/month → **main paywall trigger**
- Pre-market AI plan
- Real-time commentary
- Order placement
- Portfolio / screener tools

---

## Promotion Strategy — Month 1 (Freemium only)

**Goal:** 500+ registered free users. These become the paid conversion pool next month.

### Channels

**1. Reddit**
- r/IndiaInvestments, r/Zerodha, r/IndianStockMarket
- Post a real Chart Analyser output (screenshot + brief) — "I built this, first 3 analyses free"
- Don't post product links directly — add value first, mention the tool when relevant

**2. Telegram / WhatsApp trading groups**
- Share the pre-market brief as a screenshot every morning
- Caption: "Full context at TradingVerse — free signup"
- One good Telegram group = 50 signups

**3. LinkedIn / Medium**
- Publish 2–3 articles from the Learn section ("Why most breakout trades fail", "The revenge trade trap")
- Each ends with: "Practice this scenario free on TradingVerse →"
- These rank on Google over time — compound returns

**4. Twitter / X**
- Daily: one-line pre-market note (Nifty gap, key level, one thing to watch)
- Weekly: share a Chart Analyser sample with the stock redacted → drives curiosity

### Conversion Hook
After a user's 3rd free Chart Analyser use:

> *"You've used all 3 free analyses this month.*
> *Upgrade to Pro for ₹499/month — less than one bad F&O trade."*

This is the moment they want it most. Don't gate earlier.

---

## Revenue at 100 Paid Users

| Scenario | MRR |
|---|---|
| 100 users × ₹499 | ₹49,900 (~$600) |
| 50 users × ₹499 (conservative) | ₹24,950 |

Not the goal yet — the goal this month is the free user base that makes the paid number possible next month.

---

## Build Priority (when ready to monetise)

1. **Razorpay subscription + auth gating** — nothing else matters without this
2. **Chart Analyser usage counter** — 3 free/month, hard gate after
3. **Daily email pre-market brief** — retention, reduces churn
4. **Game streak counter** — DAU driver, habit loop
5. **Stock Screener** — Pro flagship feature

---

## Notes / Decisions Log

- Multiple broker support: architecture supports it (provider abstraction layer built), but not a selling point for now
- Order placement: **Pro only** — not in free or a hypothetical mid-tier
- 2 tiers chosen over 3 for simplicity at this stage — revisit at 200+ users
