// app/api/pre-market/generate-plan/route.js
// Supports two modes:
//   mode: 'template'  — fast, deterministic, rule-based plan
//   mode: 'ai'        — Claude-powered narrative plan (requires ANTHROPIC_API_KEY)

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request) {
  try {
    const {
      gapData,
      keyLevels,
      globalMarkets,
      calendar,
      optionsData,
      symbol = 'NIFTY',
      mode   = 'template',   // 'template' | 'ai'
    } = await request.json();

    // Fetch live OI + VIX for both modes (best-effort, cached by market-data TTL)
    const liveCtx = await fetchLiveContext(request, symbol);
    const enrichedOptions = liveCtx?.oi || optionsData;
    const vix = liveCtx?.vix || null;

    if (mode === 'ai') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        const plan = generateTemplatePlan(gapData, keyLevels, globalMarkets, calendar, enrichedOptions, symbol, vix);
        return NextResponse.json({ success: true, plan, method: 'template-fallback', timestamp: new Date().toISOString() });
      }

      const plan = await generateAIPlan(gapData, keyLevels, globalMarkets, calendar, enrichedOptions, symbol, apiKey, vix);
      return NextResponse.json({ success: true, plan, method: 'ai', timestamp: new Date().toISOString() });
    }

    // Template mode (default)
    const plan = generateTemplatePlan(gapData, keyLevels, globalMarkets, calendar, enrichedOptions, symbol, vix);
    return NextResponse.json({ success: true, plan, method: 'template', timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('Plan generation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      fallbackPlan: getFallbackPlan(),
    }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────
// Fetch live OI + VIX in parallel (best-effort, silent on failure)
// ─────────────────────────────────────────────────────────────────────
async function fetchLiveContext(request, symbol) {
  try {
    const base = new URL(request.url).origin;
    const [oiRes, mdRes] = await Promise.allSettled([
      fetch(`${base}/api/option-chain?underlying=${symbol}&expiry=weekly`, {
        signal: AbortSignal.timeout(6000),
      }).then(r => r.json()),
      fetch(`${base}/api/market-data`, {
        signal: AbortSignal.timeout(5000),
      }).then(r => r.json()),
    ]);

    let oi = null;
    if (oiRes.status === 'fulfilled' && oiRes.value?.pcr) {
      const d = oiRes.value;
      oi = {
        pcr:            d.pcr,
        maxPain:        d.maxPain,
        support:        d.support,
        supportOI:      d.supportOI,
        resistance:     d.resistance,
        resistanceOI:   d.resistanceOI,
        totalCallOI:    d.totalCallOI,
        totalPutOI:     d.totalPutOI,
        activityType:   d.marketActivity?.activity  || null,
        activityDesc:   d.marketActivity?.description || null,
        spotPrice:      d.spotPrice,
      };
    }

    let vix = null;
    if (mdRes.status === 'fulfilled') {
      vix = parseFloat(mdRes.value?.indices?.vix) || null;
    }

    return { oi, vix };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// AI Plan Generator (Claude Haiku)
// ─────────────────────────────────────────────────────────────────────
async function generateAIPlan(gapData, keyLevels, globalMarkets, calendar, optionsData, symbol, apiKey, vix) {
  const client = new Anthropic({ apiKey });

  const istDate = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const dateStr = istDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const ctx     = buildMarketContext(gapData, keyLevels, globalMarkets, calendar, optionsData, vix);

  const prompt = `You are Raj, a seasoned Indian intraday trader with 15 years of experience. You're sharing your pre-market analysis for ${symbol} with a fellow trader on ${dateStr}.

MARKET DATA:
${ctx}

Write a conversational, narrative pre-market brief — NOT a structured template. Think of it as your personal morning briefing, like you're explaining your read on the market to a friend. Use a natural voice, reference the actual numbers, and explain your reasoning.

Structure loosely like this (but write it as flowing paragraphs, not bullet lists):

AI PRE-MARKET BRIEF — ${symbol} (${dateStr})
==================================================

[Opening paragraph: What's the overall picture today? Gap, global cues, your gut feeling on the market bias. Be direct — bullish, bearish, or uncertain?]

[Analysis paragraph: Explain WHY you think this — what the gap tells you, what global markets suggest, any important levels to respect. Use specific numbers from the data.]

[Trade plan paragraph: What's your primary setup? Where exactly would you enter, what do you expect, where's your stop? Then cover the "what if I'm wrong" scenario.]

[Closing paragraph: One or two key things to watch — specific risks, timing, events. Your final advice in plain language.]

==================================================
⚡ [End with one sharp, personal reminder — not generic]

Rules:
- Write as flowing narrative text, not bullet points
- Use "I would", "I'm watching", "my read is" type language
- Reference specific numbers from the data
- No invented prices — only use numbers given
- Under 350 words total
- Plain text only, no markdown symbols like ** or ##`;

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 900,
    messages:   [{ role: 'user', content: prompt }],
  });

  return message.content[0]?.text || getFallbackPlan();
}

function buildMarketContext(gapData, keyLevels, globalMarkets, calendar, optionsData, vix) {
  const lines = [];

  if (gapData?.success) {
    lines.push(`Gap: ${gapData.gap.type} | ${gapData.gap.size} | ${n(gapData.gap.points) > 0 ? '+' : ''}${n(gapData.gap.points).toFixed(0)} pts (${n(gapData.gap.percent) > 0 ? '+' : ''}${n(gapData.gap.percent).toFixed(2)}%)`);
    lines.push(`Previous Close: ${n(gapData.previousClose).toFixed(2)} | Expected Open: ${n(gapData.expectedOpen).toFixed(2)}`);
  } else {
    lines.push('Gap data: unavailable');
  }

  if (keyLevels?.standard) {
    const s = keyLevels.standard;
    lines.push(`Levels: R3=${s.r3} R2=${s.r2} R1=${s.r1} | Pivot=${s.pivot} | S1=${s.s1} S2=${s.s2} S3=${s.s3}`);
  }

  if (globalMarkets?.markets) {
    const us = globalMarkets.markets.filter(m => m.region === 'US');
    const summary = us.map(m => `${m.name}: ${m.changePercent > 0 ? '+' : ''}${m.changePercent?.toFixed(2)}%`).join(', ');
    if (summary) lines.push(`US Markets (last close): ${summary}`);
  }

  if (vix) {
    const vixLabel = vix > 20 ? 'High — reduce size' : vix > 15 ? 'Elevated' : 'Normal';
    lines.push(`India VIX: ${vix.toFixed(1)} (${vixLabel})`);
  }

  if (optionsData?.pcr) {
    const pcr = optionsData.pcr;
    const pcrSentiment = pcr > 1.2 ? 'Bullish' : pcr < 0.8 ? 'Bearish' : 'Neutral';
    lines.push(`PCR: ${pcr.toFixed(2)} (${pcrSentiment})`);
  }
  if (optionsData?.maxPain)      lines.push(`Max Pain: ${optionsData.maxPain}`);
  if (optionsData?.support && optionsData?.supportOI) {
    const oi = (optionsData.supportOI / 100000).toFixed(1);
    lines.push(`Support: ${optionsData.support} (Put wall ${oi}L OI)`);
  }
  if (optionsData?.resistance && optionsData?.resistanceOI) {
    const oi = (optionsData.resistanceOI / 100000).toFixed(1);
    lines.push(`Resistance: ${optionsData.resistance} (Call wall ${oi}L OI)`);
  }
  if (optionsData?.totalCallOI && optionsData?.totalPutOI) {
    lines.push(`Total Call OI: ${(optionsData.totalCallOI / 100000).toFixed(1)}L | Total Put OI: ${(optionsData.totalPutOI / 100000).toFixed(1)}L`);
  }
  if (optionsData?.activityType)  lines.push(`Market Activity: ${optionsData.activityType}${optionsData.activityDesc ? ` — ${optionsData.activityDesc}` : ''}`);

  if (calendar?.events) {
    const hi = calendar.events.filter(e => e.impact === 'HIGH' && e.status !== 'COMPLETED');
    if (hi.length) lines.push(`High impact events: ${hi.map(e => `${e.time} ${e.event} (${e.country})`).join(', ')}`);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Template Plan Generator
// ─────────────────────────────────────────────────────────────────────

// Safe number coercion
function n(v) { return parseFloat(v) || 0; }

function generateTemplatePlan(gapData, keyLevels, globalMarkets, calendar, optionsData, symbol, vix) {
  const istDate = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const date    = istDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  let plan = `TRADING PLAN - ${symbol} (${date})\n`;
  plan += `${'='.repeat(50)}\n\n`;

  // Section 1: Market Overview
  plan += `📊 MARKET OVERVIEW\n`;
  plan += `${'-'.repeat(50)}\n`;

  if (globalMarkets?.markets) {
    const usMarkets = globalMarkets.markets.filter(m => m.region === 'US').slice(0, 2);
    const globalBias = usMarkets.length === 0 ? 'Unknown'
      : usMarkets.every(m => m.changePercent > 0) ? 'Positive'
      : usMarkets.every(m => m.changePercent < 0) ? 'Negative'
      : 'Mixed';
    plan += `Global Cues: ${globalBias}\n`;
    usMarkets.forEach(m => {
      plan += `  • ${m.name}: ${m.changePercent > 0 ? '+' : ''}${m.changePercent?.toFixed(2)}%\n`;
    });
  }

  if (gapData?.success) {
    const gpts = n(gapData.gap.points);
    const gpct = n(gapData.gap.percent);
    plan += `\nExpected Opening: ${gapData.gap.type.replace(/_/g, ' ')}\n`;
    plan += `  • Gap Size: ${gapData.gap.size} (${gpts > 0 ? '+' : ''}${gpts.toFixed(0)} pts / ${gpct > 0 ? '+' : ''}${gpct.toFixed(2)}%)\n`;
    plan += `  • Previous Close: ${n(gapData.previousClose).toFixed(2)}\n`;
    plan += `  • Expected Open: ${n(gapData.expectedOpen).toFixed(2)}\n`;
  } else {
    plan += `\nGap data unavailable - using pivot as reference\n`;
  }

  plan += `\n`;

  // Section 2: Key Levels
  plan += `🎯 KEY LEVELS\n`;
  plan += `${'-'.repeat(50)}\n`;

  if (keyLevels?.standard) {
    plan += `Resistance Levels:\n`;
    plan += `  • R3: ${keyLevels.standard.r3} (Strong)\n`;
    plan += `  • R2: ${keyLevels.standard.r2}\n`;
    plan += `  • R1: ${keyLevels.standard.r1} (Immediate)\n`;
    plan += `\n`;
    plan += `Pivot: ${keyLevels.standard.pivot}\n`;
    plan += `\n`;
    plan += `Support Levels:\n`;
    plan += `  • S1: ${keyLevels.standard.s1} (Immediate)\n`;
    plan += `  • S2: ${keyLevels.standard.s2}\n`;
    plan += `  • S3: ${keyLevels.standard.s3} (Strong)\n`;
  }

  plan += `\n`;

  // Section 3: Trading Strategy
  plan += `📈 TRADING STRATEGY\n`;
  plan += `${'-'.repeat(50)}\n`;

  if (gapData?.gap) {
    const eo  = n(gapData.expectedOpen);
    const pc  = n(gapData.previousClose);
    const pts = Math.abs(n(gapData.gap.points));

    if (gapData.gap.type === 'GAP_UP') {
      if (gapData.gap.size === 'Large') {
        plan += `Gap Up Strategy (Large):\n`;
        plan += `  • Wait for profit booking (9:15-9:30 AM)\n`;
        plan += `  • Enter longs ONLY if holds above ${pc.toFixed(0)}\n`;
        plan += `  • Avoid chasing - let price come to you\n\n`;
        plan += `Entry Levels:\n`;
        plan += `  • Long: ${(eo - pts * 0.3).toFixed(0)} (after pullback)\n`;
        plan += `  • Target 1: ${keyLevels?.standard?.r1 || (eo + 50).toFixed(0)} (book 50%)\n`;
        plan += `  • Target 2: ${keyLevels?.standard?.r2 || (eo + 100).toFixed(0)} (trail remaining)\n`;
        plan += `  • Stop Loss: ${(pc - 20).toFixed(0)} (below previous close)\n`;
      } else if (gapData.gap.size === 'Medium') {
        plan += `Gap Up Strategy (Medium):\n`;
        plan += `  • Observe first 15 minutes for confirmation\n`;
        plan += `  • Buy dips if sustains above ${pc.toFixed(0)}\n\n`;
        plan += `Entry Levels:\n`;
        plan += `  • Long: ${(eo - 15).toFixed(0)} (on minor dip)\n`;
        plan += `  • Target 1: ${keyLevels?.standard?.r1 || (eo + 50).toFixed(0)}\n`;
        plan += `  • Target 2: ${keyLevels?.standard?.r2 || (eo + 80).toFixed(0)}\n`;
        plan += `  • Stop Loss: ${(pc - 15).toFixed(0)}\n`;
      } else {
        plan += `Gap Up Strategy (Small):\n`;
        plan += `  • Momentum trade - follow trend\n`;
        plan += `  • Buy on breakout above opening range high\n\n`;
        plan += `Entry Levels:\n`;
        plan += `  • Long: Opening high + 10 points\n`;
        plan += `  • Target: ${keyLevels?.standard?.r1 || (eo + 50).toFixed(0)}\n`;
        plan += `  • Stop Loss: Opening low\n`;
      }
    } else if (gapData.gap.type === 'GAP_DOWN') {
      if (gapData.gap.size === 'Large') {
        plan += `Gap Down Strategy (Large):\n`;
        plan += `  • High probability of bounce - AVOID SHORTS initially\n`;
        plan += `  • Look for reversal signals\n`;
        plan += `  • Consider longs if reclaims ${pc.toFixed(0)}\n\n`;
        plan += `Entry Levels:\n`;
        plan += `  • Long: ${(eo + pts * 0.5).toFixed(0)} (on bounce)\n`;
        plan += `  • Target: ${pc.toFixed(0)} (gap fill)\n`;
        plan += `  • Stop Loss: ${(eo - 20).toFixed(0)}\n`;
      } else {
        plan += `Gap Down Strategy:\n`;
        plan += `  • Weakness likely to continue\n`;
        plan += `  • Sell rallies if fails to reclaim ${pc.toFixed(0)}\n\n`;
        plan += `Entry Levels:\n`;
        plan += `  • Short: ${(eo + 20).toFixed(0)} (on bounce)\n`;
        plan += `  • Target: ${keyLevels?.standard?.s1 || (eo - 50).toFixed(0)}\n`;
        plan += `  • Stop Loss: ${pc.toFixed(0)}\n`;
      }
    } else {
      // NEUTRAL
      const r1 = keyLevels?.standard?.r1;
      const s1 = keyLevels?.standard?.s1;
      const r2 = keyLevels?.standard?.r2;
      const s2 = keyLevels?.standard?.s2;
      plan += `Flat Opening Strategy:\n`;
      plan += `  • Range-bound session expected\n`;
      plan += `  • Trade within yesterday's range OR wait for breakout\n\n`;
      plan += `Entry Levels:\n`;
      plan += `  • Long above: ${r1 || 'opening high'} → Target: ${r2 || 'R2'}\n`;
      plan += `  • Short below: ${s1 || 'opening low'} → Target: ${s2 || 'S2'}\n`;
      plan += `  • Stay neutral between ${s1 || 'S1'} - ${r1 || 'R1'}\n`;
    }
  } else {
    // No gap data — derive strategy purely from key levels
    const pivot = n(keyLevels?.standard?.pivot);
    const r1    = n(keyLevels?.standard?.r1);
    const r2    = n(keyLevels?.standard?.r2);
    const s1    = n(keyLevels?.standard?.s1);
    const s2    = n(keyLevels?.standard?.s2);
    plan += `Pivot-Based Strategy:\n`;
    plan += `  • Wait for 9:30 AM to let opening range form\n`;
    plan += `  • Key decision level: Pivot ${pivot || '---'}\n\n`;
    if (r1 && s1) {
      plan += `IF BULLISH (above pivot):\n`;
      plan += `  • Long above: ${r1} → Target: ${r2 || (r1 + 50).toFixed(0)}\n`;
      plan += `  • Stop Loss: ${(r1 - 25).toFixed(0)}\n\n`;
      plan += `IF BEARISH (below pivot):\n`;
      plan += `  • Short below: ${s1} → Target: ${s2 || (s1 - 50).toFixed(0)}\n`;
      plan += `  • Stop Loss: ${(s1 + 25).toFixed(0)}\n`;
    }
  }

  plan += `\n`;

  // Section 4: Risk Management
  plan += `⚠️ RISK MANAGEMENT\n`;
  plan += `${'-'.repeat(50)}\n`;
  plan += `  • Max risk per trade: 2% of capital\n`;
  plan += `  • Position size: Based on stop loss distance\n`;
  plan += `  • Move SL to breakeven after Target 1\n`;
  plan += `  • Book partial profits at T1 (50%)\n`;
  plan += `  • Trail remaining position with 30-40 point SL\n`;
  plan += `  • NO AVERAGING in losing positions\n`;
  plan += `  • Exit all positions 15 mins before close (3:15 PM)\n`;
  plan += `\n`;

  // Section 5: Important Notes
  plan += `📌 IMPORTANT NOTES\n`;
  plan += `${'-'.repeat(50)}\n`;
  plan += `  • AVOID trading first 15 minutes (9:15-9:30 AM)\n`;
  plan += `  • Let opening range form before entering\n`;
  plan += `  • DO NOT counter-trend trade before 10:00 AM\n`;

  if (vix) {
    plan += `  • India VIX: ${vix.toFixed(1)} — ${vix > 20 ? '⚠️ High volatility, reduce position size' : vix > 15 ? 'Elevated, use tight stops' : 'Normal range'}\n`;
  }
  if (optionsData?.pcr) {
    plan += `  • Options PCR: ${optionsData.pcr.toFixed(2)} (${optionsData.pcr > 1.2 ? 'Bullish' : optionsData.pcr < 0.8 ? 'Bearish' : 'Neutral'})\n`;
  }
  if (optionsData?.support)    plan += `  • OI Put Wall (Support): ${optionsData.support}\n`;
  if (optionsData?.resistance) plan += `  • OI Call Wall (Resistance): ${optionsData.resistance}\n`;
  if (optionsData?.maxPain)    plan += `  • Max Pain: ${optionsData.maxPain}\n`;

  if (calendar?.events) {
    const highImpact = calendar.events.filter(e => e.impact === 'HIGH' && e.status !== 'COMPLETED');
    if (highImpact.length > 0) {
      plan += `\n📅 HIGH IMPACT EVENTS TODAY:\n`;
      highImpact.forEach(e => {
        plan += `  • ${e.time}: ${e.event} (${e.country})\n`;
      });
      plan += `  → Expect volatility around these times\n`;
    }
  }

  plan += `\n${'='.repeat(50)}\n`;
  plan += `⚡ Remember: Plan your trade, Trade your plan!\n`;

  return plan;
}

function getFallbackPlan() {
  const istDate = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const date    = istDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `TRADING PLAN (${date})

📊 MARKET BIAS: Wait for confirmation

🎯 STRATEGY:
1. Observe first 15 minutes (9:15-9:30 AM)
2. Note opening range high/low
3. Trade breakout direction

📈 IF BREAKOUT UP:
• Entry: Opening high + 20 points
• Target: 0.5-1% move
• Stop: Opening low

📉 IF BREAKDOWN:
• Entry: Opening low - 20 points
• Target: 0.5-1% move
• Stop: Opening high

⚠️ RISK MANAGEMENT:
• Max 2% risk per trade
• Exit at 3:15 PM
• No counter-trend trades before 10 AM

📌 REMEMBER:
Plan your trade, Trade your plan!`;
}
