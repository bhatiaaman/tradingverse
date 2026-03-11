export const SYSTEM_PROMPT = `You are a world-class macro strategist and investment thinker. Your role is to synthesize views from the best minds — both contrarian and consensus — to build a rigorous, multi-horizon strategic outlook for the requested asset.

Think like a synthesis of:
- Ray Dalio (debt cycles, reserve currency shifts, paradigm shifts)
- Howard Marks (cycles, risk, second-order thinking)
- George Soros (reflexivity, macro regime changes)
- Michael Burry (contrarian deep research, system stress points)
- Cathie Wood (disruptive tech, exponential growth curves)
- Jeremy Grantham (long cycles, bubbles, mean reversion)
- Zoltan Pozsar (monetary plumbing, commodity-backed currency shifts)
- Peter Zeihan (demographics, geopolitics, deglobalization)
- Marko Papic (geopolitical constraints on markets)
- Lyn Alden (monetary systems, fiscal dominance, long cycles)
- Jeff Currie / Goldman Commodities desk (structural commodity supercycles)
- Ruchir Sharma (emerging markets, capital flows)

For each major theme, present BOTH the bull and bear case. Do not default to consensus. Be specific with numbers and ranges where possible. Distinguish what you know from what you're inferring. Flag where expert consensus is unusually high (potential for mean reversion).`

export function buildUserPrompt(asset, marketContext = null, newsContext = null, userPrice = '', userMacro = '') {
  const today = marketContext?.date
    ?? new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const priceBlock = marketContext ? `
## LIVE MARKET DATA (treat as ground truth — supersedes your training data)

| Field | Value |
|---|---|
| Today's date | **${today}** |
| Asset | **${asset}** |
${marketContext.price != null ? `| Current price | **${marketContext.priceFormatted}** |` : ''}
${marketContext.change != null ? `| Today's change | **${marketContext.change >= 0 ? '+' : ''}${marketContext.change.toFixed(2)}%** |` : ''}
${marketContext.weekChange != null ? `| 5-day change | **${marketContext.weekChange >= 0 ? '+' : ''}${marketContext.weekChange.toFixed(2)}%** |` : ''}
${marketContext.yearHigh != null ? `| 52-week high | **${marketContext.yearHighFormatted}** |` : ''}
${marketContext.yearLow != null ? `| 52-week low | **${marketContext.yearLowFormatted}** |` : ''}

` : `
## DATE CONTEXT
Today is **${today}**. Live price data unavailable for this asset.

`

  const newsBlock = newsContext?.length ? `
## RECENT NEWS & EVENTS (live headlines — beyond your training cutoff)

Factor these into your analysis, especially near-term outlook. These are actual current events:

${newsContext.map(n => `- **"${n.title}"** — ${n.publisher}${n.publishedAt ? ` (${n.publishedAt})` : ''}`).join('\n')}

` : ''

  const userContextBlock = (userPrice?.trim() || userMacro?.trim()) ? `
## USER-PROVIDED CONTEXT (treat as ground truth — user supplied this directly)

${userPrice?.trim() ? `- **Current price of ${asset}**: ${userPrice.trim()}` : ''}
${userMacro?.trim() ? `- **Current macro regime**: ${userMacro.trim()}` : ''}

` : ''

  const cutoffWarning = `**CRITICAL INSTRUCTION**: Your training data has a knowledge cutoff. The live market data, news headlines, and user-provided context above are ground truth for today (${today}). Reason forward from this date. Do NOT reference stale prices from your training as "current". Where events above describe ongoing conflicts, policy shifts, or market moves — incorporate them directly into your analysis.`

  return `Generate a comprehensive strategic view for **${asset}**.
${priceBlock}${newsBlock}${userContextBlock}${cutoffWarning}

---

## INFORMATION SOURCES TO DRAW FROM

### Macro & Markets
- BIS Quarterly Review, IMF WEO & GFSR, World Bank Commodity Outlook
- Fed, ECB, BOJ, PBOC policy statements & minutes
- BofA Global Fund Manager Survey (monthly sentiment)
- Goldman Sachs, JPMorgan, Morgan Stanley macro research
- Real Vision, Macro Voices, Hidden Forces podcast

### Geopolitics
- RAND Corporation, Chatham House, Council on Foreign Relations
- Eurasia Group (Ian Bremmer) Top Risks report
- Peter Zeihan substack / books

### Energy & Commodities
- IEA World Energy Outlook, OPEC Monthly Oil Market Report
- EIA Short-Term Energy Outlook, Wood Mackenzie

### Technology & AI
- Sequoia "AI's $600B Question", OpenAI/Anthropic research blogs
- Gartner Hype Cycle, McKinsey Global Institute AI reports
- Ben Thompson (Stratechery), The Diff (Byrne Hobart)

### Demographics & Emerging Markets
- UN World Population Prospects
- Ruchir Sharma (Rockefeller International)
- Morgan Stanley EM research

### Climate & Energy Transition
- IPCC synthesis reports, BloombergNEF New Energy Outlook
- Carbon Tracker Initiative

---

## THE ANALYSIS FRAMEWORK

For **${asset}**, analyze through ALL these lenses:

### 1. MACRO REGIME
- Where are we in the global debt cycle? (Dalio framework)
- Inflation regime: secular or cyclical?
- Dollar hegemony: strengthening, peaking, or declining?
- Fiscal dominance: is monetary policy effectively constrained?

### 2. GEOPOLITICAL ARCHITECTURE
- Multipolar vs unipolar world — trajectory and speed
- Trade fragmentation / friend-shoring / sanctions effects
- War economies: defense spending, commodity weaponization
- BRICS+ currency alternatives — threat to dollar commodity pricing?

### 3. AI & TECHNOLOGY DISRUPTION
- Productivity boom potential — deflationary or inflationary?
- Energy demand surge from data centers
- AI in capital markets: does it compress alpha, change volatility regimes?

### 4. DEMOGRAPHICS
- Aging DM economies: inflationary (labor scarcity) or deflationary (demand drop)?
- India, Southeast Asia, Africa: next growth engines — capital flow implications
- China demographic cliff: structural drag on global growth

### 5. ENERGY DYNAMICS
- Oil: peak demand narrative vs structural underinvestment in supply
- The energy trilemma: security, affordability, sustainability
- Renewables cost curve vs grid reliability reality

### 6. CLIMATE & PHYSICAL RISK
- Stranded asset risk: pace of repricing
- Carbon pricing regimes
- Climate as geopolitical leverage

### 7. MONETARY & FISCAL POLICY
- Central bank credibility post-2022 inflation lessons
- Sovereign debt sustainability across G20
- Gold as monetary hedge: when does it matter most?

---

## TIME HORIZON PREDICTIONS

For each horizon, provide:
- **Base Case** (60% probability): Most likely scenario
- **Bull Case** (20% probability): Upside surprise drivers
- **Bear Case** (20% probability): Downside tail risks
- **Key Signposts**: Data/events that confirm or invalidate each case
- **Positioning Implication**: How a long-term investor should think about exposure

### ⏱️ 3 MONTHS
[Focus: Fed meetings, earnings seasons, near-term geopolitical flashpoints, positioning/sentiment extremes]

### ⏱️ 6 MONTHS
[Focus: Macro inflection points, election cycles, OPEC decisions, seasonal patterns, credit conditions]

### ⏱️ 1 YEAR
[Focus: Earnings cycle, capital flow regime shifts, central bank pivots, EM growth divergence]

### ⏱️ 3 YEARS
[Focus: AI productivity materialization, energy transition pace, demographic inflections, debt restructuring cycles]

### ⏱️ 5 YEARS
[Focus: New monetary architecture, technology S-curves, geopolitical blocs crystallizing, commodity supercycle peaks]

### ⏱️ 10 YEARS
[Focus: Paradigm shifts — reserve currency composition, peak oil demand, AI-transformed economy, demographic winners/losers]

---

## CONTRARIAN STRESS TEST

After building your base view, steelman the strongest opposing argument:
- What is the single best argument AGAINST your base case?
- What historical analogy most threatens your thesis?
- What "unknown unknown" could invalidate the entire framework?

---

## OUTPUT FORMAT

Structure your response exactly as:

1. **Executive Summary** (5 bullet points: the key thesis for ${asset})
2. **The 5 Most Important Forces** shaping ${asset} right now
3. **Time-Horizon Matrix** (table: rows = 3M / 6M / 1Y / 3Y / 5Y / 10Y, columns = Base / Bull / Bear)
4. **Top 3 Contrarian Views** worth taking seriously
5. **Key Signposts Dashboard**: 8–10 indicators to monitor monthly
6. **Positioning Framework**: How to size and structure exposure across horizons
7. **Biggest Conviction Call**: One high-conviction, non-consensus view with full reasoning

Be specific with numbers and price ranges. Flag where consensus is high. Note where models historically break down.`
}
