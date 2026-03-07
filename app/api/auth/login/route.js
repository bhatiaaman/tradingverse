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
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const userKey = `${NS}:user:${email.toLowerCase()}`
  const raw = await redis.get(userKey)
  if (!raw) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const user = typeof raw === 'string' ? JSON.parse(raw) : raw
  const valid = await bcrypt.compare(password, user.hash)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const token = randomBytes(32).toString('hex')
  await redis.set(`${NS}:session:${token}`, email.toLowerCase(), { ex: 60 * 60 * 24 * 30 })

  const res = NextResponse.json({ ok: true, name: user.name })
  res.cookies.set('tv_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
