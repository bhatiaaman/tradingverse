import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { SYSTEM_PROMPT, TIMEFRAME_DETECT_PROMPT, buildUserPrompt } from '@/app/lib/prompts/chart-analyser'
import { requireSession, unauthorized } from '@/app/lib/session'
import { intelligenceLimiter, checkLimit } from '@/app/lib/rate-limit'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
const NS = process.env.REDIS_NAMESPACE || 'tradingverse'
const FREE_DAILY_LIMIT = 3

async function callClaude({ system, userPrompt, image, mediaType, maxTokens }) {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: userPrompt },
      ],
    }],
  })
  const text = msg.content[0].text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse response')
  return JSON.parse(jsonMatch[0])
}

export async function POST(req) {
  const session = await requireSession()
  if (!session) return unauthorized()

  const rl = await checkLimit(intelligenceLimiter, req)
  if (rl.limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  // Free users: 3 analyses per day (admin = unlimited)
  if (session.role !== 'admin') {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const usageKey = `${NS}:usage:chart-analyser:${session.email}:${today}`
    const used = await redis.incr(usageKey)
    if (used === 1) await redis.expire(usageKey, 86400) // expire at end of day
    if (used > FREE_DAILY_LIMIT) {
      return NextResponse.json({
        error: 'Daily limit reached',
        limitReached: true,
        used: FREE_DAILY_LIMIT,
        limit: FREE_DAILY_LIMIT,
      }, { status: 429 })
    }
  }

  try {
    const { image, mediaType = 'image/jpeg', timeframe, detectOnly = false } = await req.json()

    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(mediaType)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 })
    }

    if (detectOnly) {
      const result = await callClaude({
        system: TIMEFRAME_DETECT_PROMPT,
        userPrompt: 'What is the timeframe/interval of this chart? Return only the JSON.',
        image,
        mediaType,
        maxTokens: 64,
      })
      return NextResponse.json({ timeframe: result.timeframe })
    }

    const analysis = await callClaude({
      system: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(timeframe),
      image,
      mediaType,
      maxTokens: 2048,
    })
    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('Chart analyser error:', err)
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 })
  }
}
