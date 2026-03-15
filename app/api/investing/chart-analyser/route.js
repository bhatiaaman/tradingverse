import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { SYSTEM_PROMPT, TIMEFRAME_DETECT_PROMPT, buildUserPrompt } from '@/app/lib/prompts/chart-analyser'
import { requireSession } from '@/app/lib/session'
import { intelligenceLimiter, checkLimit } from '@/app/lib/rate-limit'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

const GUEST_DAILY_LIMIT = 1   // no login
const FREE_DAILY_LIMIT  = 5   // free account

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
  const session = await requireSession()   // null if not logged in — intentional

  const rl = await checkLimit(intelligenceLimiter, req)
  if (rl.limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  // Parse body early so we can skip limit check for detectOnly (timeframe detection is
  // a cheap pre-flight call, not a full analysis — shouldn't count against quota)
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const { image, mediaType = 'image/jpeg', timeframe, detectOnly = false } = body

  if (!detectOnly) {
    // IST date for consistent daily reset at midnight IST regardless of server timezone
    const istDate = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

    if (!session) {
      // Guest (no login): 1 analysis/day per IP
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      const key = `${NS}:usage:chart-analyser:ip:${ip}:${istDate}`
      const used = await redis.incr(key)
      if (used === 1) await redis.expire(key, 86400)
      if (used > GUEST_DAILY_LIMIT) {
        return NextResponse.json({
          error: 'You\'ve used your free analysis for today.',
          limitReached: true,
          used: GUEST_DAILY_LIMIT,
          limit: GUEST_DAILY_LIMIT,
          guestLimit: true,  // frontend uses this to show "sign up for 5/day" CTA
        }, { status: 429 })
      }
    } else if (session.role !== 'admin' && session.role !== 'trader') {
      // Free account: 5 analyses/day
      const key = `${NS}:usage:chart-analyser:${session.email}:${istDate}`
      const used = await redis.incr(key)
      if (used === 1) await redis.expire(key, 86400)
      if (used > FREE_DAILY_LIMIT) {
        return NextResponse.json({
          error: 'You\'ve used all 5 analyses for today.',
          limitReached: true,
          used: FREE_DAILY_LIMIT,
          limit: FREE_DAILY_LIMIT,
        }, { status: 429 })
      }
    }
    // admin / trader: unlimited — no counter
  }

  try {

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
