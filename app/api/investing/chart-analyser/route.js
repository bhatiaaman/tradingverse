import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are an expert technical analyst specialising in Indian equities (NSE/BSE) with deep knowledge of:
- Price action, chart patterns, and Stan Weinstein stage analysis
- IBD-style relative strength vs Nifty 50 and sector benchmarks
- Volume and institutional footprint analysis
- Sector rotation and macro context for India markets
- Medium to long-term position building (swing to positional)

Analyse the chart image provided and respond with ONLY a valid JSON object matching this exact structure — no markdown, no extra text:

{
  "ticker": "Stock or index name if visible on chart, else 'Unknown'",
  "timeframe": "Daily or Weekly (infer from chart if not told)",
  "verdict": {
    "rating": "STRONG BUY | BUY | NEUTRAL | AVOID | SELL",
    "score": <integer 1-10>,
    "summary": "2-3 sentence overall verdict"
  },
  "technical": {
    "trend": "Uptrend | Downtrend | Sideways | Early Uptrend | Late Stage | Distribution",
    "stage": "Stage 1 (Basing) | Stage 2 (Uptrend) | Stage 3 (Topping) | Stage 4 (Decline)",
    "patterns": ["pattern description 1", "pattern description 2"],
    "keyLevels": {
      "support": "price level or description",
      "resistance": "price level or description"
    },
    "movingAverages": "observation about MA alignment if visible",
    "volume": "volume trend and any notable accumulation or distribution",
    "strength": "Strong | Moderate | Weak"
  },
  "relativeStrength": {
    "vsNifty": "Outperforming | Underperforming | In-line",
    "trend": "Improving | Deteriorating | Stable",
    "notes": "1-2 sentences on how price action compares to broader market"
  },
  "sector": {
    "likely": "sector name based on chart context or stock name",
    "position": "Leading | Lagging | Neutral",
    "notes": "sector context and rotation view"
  },
  "sentiment": {
    "overall": "Bullish | Bearish | Cautiously Bullish | Cautiously Bearish | Neutral",
    "institutionalClues": "volume spikes, large candles, accumulation or distribution patterns visible",
    "notes": "2-3 sentences on the sentiment story visible in the chart"
  },
  "story": {
    "theme": "5-8 word headline narrative",
    "positives": ["positive 1", "positive 2", "positive 3"],
    "negatives": ["negative 1", "negative 2"],
    "horizon": "3-6 months | 6-12 months | 12-24 months",
    "narrative": "2-3 sentences building the medium to long-term investment case or warning"
  },
  "watchFor": ["key trigger or level to watch 1", "trigger 2", "trigger 3"]
}

Be specific, honest, and actionable. If the chart is weak or in distribution, say so clearly.`

export async function POST(req) {
  try {
    const { image, mediaType = 'image/jpeg', timeframe } = await req.json()

    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(mediaType)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 })
    }

    const userPrompt = timeframe
      ? `This is a ${timeframe} chart. Analyse it for technical structure, relative strength vs Nifty, sector view, sentiment, and build a medium to long-term story. Return only the JSON.`
      : 'Analyse this chart for technical structure, relative strength vs Nifty, sector view, sentiment, and build a medium to long-term story. Return only the JSON.'

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: image },
            },
            { type: 'text', text: userPrompt },
          ],
        },
      ],
    })

    const text = message.content[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse analysis response')

    const analysis = JSON.parse(jsonMatch[0])
    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('Chart analyser error:', err)
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 })
  }
}
