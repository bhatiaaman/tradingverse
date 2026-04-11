import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { sql } from '@/app/lib/db'
import { redis } from '@/app/lib/redis'

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

export async function POST(req) {
  const { token, password } = await req.json()

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Reset tokens live in Redis (15-min TTL, ephemeral)
  const email = await redis.get(`${NS}:reset:${token}`)
  if (!email) {
    return NextResponse.json({ error: 'Reset link is invalid or has expired' }, { status: 400 })
  }

  const rows = await sql`SELECT email FROM users WHERE email = ${email} LIMIT 1`
  if (!rows.length) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const hash = await bcrypt.hash(password, 12)
  await sql`UPDATE users SET hash = ${hash}, updated_at = now() WHERE email = ${email}`
  await redis.del(`${NS}:reset:${token}`) // one-time use

  return NextResponse.json({ ok: true })
}
