import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { Resend } from 'resend'

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

// POST — admin actions (reset-password)
export async function POST(req) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, action } = await req.json()
  if (!email || action !== 'reset-password') {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const userKey = `${NS}:user:${email.toLowerCase()}`
  const raw     = await redis.get(userKey)
  if (!raw) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const user = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (user.provider === 'google') {
    return NextResponse.json({ error: 'Google accounts do not have passwords' }, { status: 400 })
  }

  const token    = randomBytes(32).toString('hex')
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL || 'https://tradingverse.in'
  const resetUrl = `${appUrl}/reset-password?token=${token}`
  await redis.set(`${NS}:reset:${token}`, email.toLowerCase(), { ex: 60 * 60 * 24 }) // 24h for admin-initiated

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:    process.env.RESEND_FROM_EMAIL || 'TradingVerse <noreply@tradingverse.in>',
      to:      email.toLowerCase(),
      subject: 'Set your TradingVerse password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d1829;color:#e2e8f0;border-radius:12px">
          <h2 style="margin:0 0 8px;font-size:22px;color:#fff">Set your password</h2>
          <p style="color:#94a3b8;margin:0 0 24px;font-size:15px">
            The TradingVerse team has sent you a password reset link. Click the button below to set your password.
            This link expires in <strong style="color:#e2e8f0">24 hours</strong>.
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">Set Password</a>
          <p style="color:#475569;margin:24px 0 0;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    })
  }

  return NextResponse.json({ ok: true, resetUrl })
}
