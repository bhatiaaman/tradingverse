import { Redis } from '@upstash/redis'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/app/lib/session'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

export async function POST(req) {
  const session = await requireSession()
  if (!session) return unauthorized()

  const { currentPassword, newPassword } = await req.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both fields are required' }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
  }

  const userKey = `${NS}:user:${session.email}`
  const raw = await redis.get(userKey)
  if (!raw) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const user = typeof raw === 'string' ? JSON.parse(raw) : raw
  const valid = await bcrypt.compare(currentPassword, user.hash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
  }

  user.hash = await bcrypt.hash(newPassword, 12)
  await redis.set(userKey, JSON.stringify(user))

  return NextResponse.json({ ok: true })
}
