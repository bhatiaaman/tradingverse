import { Redis } from '@upstash/redis'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

export async function POST(req) {
  const { token, password } = await req.json()

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const resetKey = `${NS}:reset:${token}`
  const email = await redis.get(resetKey)
  if (!email) {
    return NextResponse.json({ error: 'Reset link is invalid or has expired' }, { status: 400 })
  }

  const userKey = `${NS}:user:${email}`
  const raw = await redis.get(userKey)
  if (!raw) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const user = typeof raw === 'string' ? JSON.parse(raw) : raw
  user.hash = await bcrypt.hash(password, 12)

  await redis.set(userKey, JSON.stringify(user))
  await redis.del(resetKey) // one-time use

  return NextResponse.json({ ok: true })
}
