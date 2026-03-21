import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { cookies } from 'next/headers'

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS          = process.env.REDIS_NAMESPACE || 'tradingverse'
const OWNER_EMAIL = process.env.OWNER_EMAIL?.toLowerCase().trim()

async function requireAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value
  if (!token) return null
  const email = await redis.get(`${NS}:session:${token}`)
  if (!email || email.toLowerCase() !== OWNER_EMAIL) return null
  return email
}

// GET — list all users
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const emails = await redis.smembers(`${NS}:users:all`)
  if (!emails?.length) return NextResponse.json({ users: [] })

  const keys = emails.map(e => `${NS}:user:${e}`)
  const raws = await redis.mget(...keys)

  const users = raws
    .map((raw, i) => {
      if (!raw) return null
      const u = typeof raw === 'string' ? JSON.parse(raw) : raw
      return {
        email:     u.email || emails[i],
        name:      u.name  || '—',
        plan:      u.plan  || 'free',
        provider:  u.provider || 'email',
        createdAt: u.createdAt || null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  return NextResponse.json({ users, total: users.length })
}

// PATCH — update a user's plan
export async function PATCH(req) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, plan } = await req.json()
  if (!email || !['free', 'pro'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const userKey = `${NS}:user:${email.toLowerCase()}`
  const raw     = await redis.get(userKey)
  if (!raw) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const user = typeof raw === 'string' ? JSON.parse(raw) : raw
  await redis.set(userKey, JSON.stringify({ ...user, plan }))

  return NextResponse.json({ ok: true, email, plan })
}
