# TradingVerse Landing Page — Master Plan

_Last updated: 16 Mar 2026_

---

## The Core Message

**83% of traders lose. Not because of bad charts. Because of bad inputs.**

They trade on:
- **Emotions** — FOMO at the top, panic at the bottom, revenge after a loss
- **Tips** — WhatsApp groups, TV noise, Twitter calls with no context
- **Instinct without foundation** — no pre-market prep, no regime awareness, no plan

The 17% who consistently win share one habit: they trade with **context, intelligence, and knowledge** — in that order.

TradingVerse is built around that habit.

---

## The Three Pillars (platform = solution to the three problems)

| Problem | Pillar | What TradingVerse gives |
|---------|--------|------------------------|
| Trading blind (no context) | **Context** | Pre-market intelligence, global cues, sector rotation, key S/R levels, live commentary |
| Trading impulsively (emotions/tips) | **Intelligence** | Order Intelligence, 4 agents, regime detection, scenario synthesis — before every trade |
| Trading without a mental framework | **Knowledge** | Trading games (psychology training), book summaries, articles, behavioural agent |

**The outcome:** Better trading psychology. Calmer decisions. The right trade at the right time.

---

## Messaging Framework

### Headline options (pick one)
- *"83% of traders lose. The other 17% trade with context."*
- *"Trade with context. Not emotions. Not tips."*
- *"Stop trading on tips. Start trading with intelligence."*
- *"Your edge starts before the market opens."*

**Current front-runner:** *"Trade with context. Not emotions. Not tips."* — directly names the enemy (emotions, tips), positions the solution (context) in one line.

### Subheadline (one line)
> Context before the open. Intelligence at execution. Knowledge to keep improving.

This maps directly to the three pillars.

### Supporting copy (hero section)
> Most traders don't lose because they lack data. They lose because they have the wrong inputs — tips from groups, emotional reactions to price, no understanding of what the market is actually doing that day. TradingVerse fixes the inputs.

---

## Page Structure

Seven sections. Lean. Not crowded.

### 1. Hero
- Headline (from options above)
- Subheadline (the three-pillar line)
- CTA: "Start Free" + "See how it works ↓"
- Visual: Real screenshot of terminal — full width, device frame, slight tilt

### 2. The Hook — Why traders lose
- The **83% stat** — large, prominent
- Three reasons: emotions / tips / no context (3 small callout boxes)
- Transition line: *"The 17% do one thing differently — they understand the full picture before placing a trade."*

### 3. The Workflow — How TradingVerse fixes it
Three phases. Each: real screenshot + 3 bullets max.

**Phase 1 — Context before the open** (Pre-market)
- Global cues: Dow, Nasdaq, crude, DXY, GIFT Nifty
- Key S/R levels for Nifty & BankNifty
- Sector rotation heatmap, economic calendar
- Screenshot: pre-market page (global cues + key levels section)

**Phase 2 — Intelligence at execution** (Terminal + Commentary + Order Intelligence)
- Live terminal: chart, option chain, watchlist, positions
- Running commentary every 30 min: regime, breadth, OR levels, bias trail, sentiment sparkline
- Chartink scanner webhooks → auto-watchlist
- Before every order: 4 agents review the trade (trend, volatility, behavioural, order flow)
- Scenario synthesis: Bull/Base/Bear with probabilities
- Screenshots: terminal 3-col view, commentary section, order intelligence panel

**Phase 3 — Knowledge to keep improving** (Learn + Games)
- Scenario games: test decisions on real setups without capital at risk
- Book summaries: Market Wizards, Trading in the Zone, Reminiscences
- Articles on options, F&O, market structure, psychology
- Screenshot: trading game scenario question

### 4. What you get at each level
Show as a *user journey*, not a checkbox table.

```
EXPLORE                    TRADE FREE               GO PRO
No account needed          Free login               ₹499/mo

Sample Nifty chart         Everything in Explore    Everything in Free
  analysis (AI)            + Live terminal          + Order placement (Kite)
Sample Strategic View      + Option chain viewer    + Unlimited AI analysis
  (Nifty + Gold)           + Chart analyser 3/day   + Chartink webhooks
All trading games          + Order intelligence     + Behavioural agent live
All articles & books         3/day                  + Pre-market movers
                           + Pre-market basic       + Positions & P&L
```

Each column has a real cropped screenshot of the relevant feature, not checkboxes. The visual shows the experience, the list explains it.

### 5. The Intelligence Layer (Order Intelligence — standalone)
- "Before you place a trade, four agents review it."
- 4 agents explained:
  1. **Trend Agent** — Is this trade aligned with the 5m / 15m / daily structure?
  2. **Volatility & Regime Agent** — What is the intraday regime? Is IV high or low?
  3. **Behavioural Agent** — FOMO? Revenge trading? Overconfidence? Flagged in real time.
  4. **Order Flow Agent** — PCR, breadth, BankNifty relative strength, OI buildup.
- Real screenshot of Order Intelligence panel

### 6. Learn & Train (brief)
- Interactive scenario game widget (keep from `app/page.js` — best interactive element)
- 4 book cards with hover-to-quote (from `app/page.js`)

### 7. CTA + Footer
- Email waitlist form
- "Or create a free account now →"
- No testimonials until real ones exist

---

## What to Cut

| Element | Why cut |
|---------|---------|
| Fake testimonials (3 quotes) | Not real users yet — visible |
| "Give a man a fish" quote | Editorial but off-brand for a product page |
| "Three Paths" Know/Train/Learn cards | Replaced by the 3-phase workflow |
| Flat 6-card feature grid | Redundant — every feature is covered in workflow |
| Duplicate feature descriptions | Each feature should appear once |
| Light mode sections in hero | Mixed dark/light feels like two different products |

---

## What to Keep (best elements from each page)

| Element | Source | Why keep |
|---------|--------|---------|
| 83% stat + 17% insight | `app/page.js` | Strongest hook |
| Interactive scenario game | `app/page.js` | Only interactive element, proven concept |
| Chartink webhook callout | `landing2/` | Real differentiator, no other platform has it |
| 4-agent breakdown | `landing2/` | Best product explanation we have |
| Scenario probability bars | `landing/` | Clearest visual of Order Intelligence |
| 3-column terminal mockup | `landing2/` | Most faithful visual (to be replaced by real screenshot) |
| Free vs Pro pricing columns | `landing/` | Structure is right |

---

## AI vs Rules/Algo — Messaging Accuracy (important)

**AI (Claude API) is used ONLY for three features:**
- Chart Analyser — image → Claude → analysis
- Strategic View / Connect the Dots — Claude generates macro outlook
- Pre-Market AI Plan — Claude generates the trading plan (8:00–9:15 AM only)

**Everything else is rules/algo — do NOT call it AI in copy:**

| Feature | What to call it |
|---------|----------------|
| Order Intelligence | "Algo-powered pre-trade analysis" |
| 4 Agents (Trend, Volatility, Behavioural, Order Flow) | "Real-time analysis" / "Intelligent checks" |
| Intraday Regime detection | "Algo regime classification" |
| Market Commentary | "Rules-based live commentary" |
| Reversal detector (RSI velocity, MACD, candles) | "Technical signal detection" |
| Scenario synthesis (Bull/Base/Bear) | "Probabilistic scenario engine" |
| Pre-market data (global cues, key levels, sectors) | "Live data + calculated levels" |

In the landing page copy, this means:
- `AI VISION` tag is correct only on Chart Analyser
- `AI MACRO` tag is correct only on Strategic View
- Order Intelligence section should say "Algo-powered" or "Intelligent" — not "AI"
- The 4 agents are rules engines, not LLMs — describe what they do, don't call them AI

---

## Real Screenshots Needed (6)

Save to `/public/screenshots/`:

1. `pre-market.png` — global cues grid + key levels side by side
2. `terminal.png` — full 3-column terminal during market hours
3. `commentary.png` — commentary section: bias pill + regime + breadth + sparkline
4. `order-intelligence.png` — 4-agent grid + scenario probability bars
5. `chart-analyser.png` — a real Nifty chart analysis output (score + tags + story)
6. `game.png` — a scenario question with options shown

---

## Design Principles

- **Dark throughout** — no light mode sections in the landing page
- **One accent color per section** — emerald (pre-market), sky (terminal), amber (order intelligence), violet (learn/invest)
- **Screenshots in real browser frames** — the window chrome with dots makes it look like a live product
- **Max 2 columns** — no 3-col content grids (too dense on mobile)
- **Breathing room** — `landing2/` density is the right model
- **No fake numbers** — don't say "10,000 traders" or "trusted by" until real

---

## Iteration Plan

1. Take 6 screenshots from live app
2. Create `app/landing3/page.js` using this structure with real screenshots
3. Review on mobile — screenshot sizing is the hardest part
4. Finalise headline copy (the one-liner is everything)
5. A/B test: narrative-led vs stat-led hero
6. When satisfied, replace `app/page.js` with the winner

---

## Files

| File | Status | Notes |
|------|--------|-------|
| `app/page.js` | Live (current home) | Keep running. Strong copy, weak product visuals |
| `app/landing/page.js` | Live at `/landing` | Good feature coverage, flat structure |
| `app/landing2/page.js` | Live at `/landing2` | Best narrative, faithful mockups, slightly long |
| `app/landing3/page.js` | To build | The unified version using this plan + real screenshots |
