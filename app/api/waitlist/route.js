import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import { authLimiter, checkLimit } from '@/app/lib/rate-limit'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})
const NS = process.env.REDIS_NAMESPACE || 'tradingverse'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req) {
  const rl = await checkLimit(authLimiter, req)
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const { email } = await req.json()
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const key = `${NS}:waitlist`
  // SADD returns 1 if added, 0 if already a member
  const added = await redis.sadd(key, email.toLowerCase().trim())

  return NextResponse.json({ ok: true, alreadyJoined: added === 0 })
}
