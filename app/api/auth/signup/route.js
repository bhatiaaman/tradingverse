import { Redis } from '@upstash/redis'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

export async function POST(req) {
  const { name, email, password } = await req.json()

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const userKey = `${NS}:user:${email.toLowerCase()}`
  const existing = await redis.get(userKey)
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  const hash = await bcrypt.hash(password, 12)
  const user = { name, email: email.toLowerCase(), hash, createdAt: Date.now() }
  await redis.set(userKey, JSON.stringify(user))

  // Create session
  const token = randomBytes(32).toString('hex')
  await redis.set(`${NS}:session:${token}`, email.toLowerCase(), { ex: 60 * 60 * 24 * 30 })

  const res = NextResponse.json({ ok: true, name })
  res.cookies.set('tv_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
