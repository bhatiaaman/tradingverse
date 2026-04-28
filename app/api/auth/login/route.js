import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { authLimiter, checkLimit } from '@/app/lib/rate-limit'
import { sql } from '@/app/lib/db'
import { redis } from '@/app/lib/redis'

const SESSION_TTL_DAYS = 30;
const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

export async function POST(req) {
  const rl = await checkLimit(authLimiter, req)
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  const { email, password } = await req.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`
  const user = rows[0]
  if (!user || !user.hash) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.hash)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const token     = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000)
  await sql`INSERT INTO sessions (token, email, expires_at) VALUES (${token}, ${user.email}, ${expiresAt})`
  await redis.set(`${NS}:session:${token}`, user.email, { ex: SESSION_TTL_DAYS * 24 * 3600 })

  const res = NextResponse.json({ ok: true, name: user.name })
  res.cookies.set('tv_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_DAYS * 24 * 3600,
    path: '/',
  })
  return res
}
