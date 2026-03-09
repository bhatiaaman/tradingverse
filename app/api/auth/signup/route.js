import { Redis } from '@upstash/redis'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { authLimiter, checkLimit } from '@/app/lib/rate-limit'
import { Resend } from 'resend'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req) {
  const rl = await checkLimit(authLimiter, req)
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  const { name, email, password } = await req.json()

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
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

  // Send welcome email (fire-and-forget — don't block registration if it fails)
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tradingverse.in'
    resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'TradingVerse <noreply@tradingverse.in>',
      to: email.toLowerCase(),
      subject: `Welcome to TradingVerse, ${name.split(' ')[0]}!`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#0d1829;color:#e2e8f0;border-radius:12px">
          <h1 style="margin:0 0 6px;font-size:26px;font-weight:900;color:#fff">
            Welcome to Trading<span style="color:#60a5fa">Verse</span>
          </h1>
          <p style="color:#94a3b8;margin:0 0 28px;font-size:15px">
            Hi ${name.split(' ')[0]}, your account is ready.
          </p>

          <p style="color:#cbd5e1;font-size:15px;line-height:1.7;margin:0 0 24px">
            Here's what you can explore right away:
          </p>
          <ul style="color:#94a3b8;font-size:14px;line-height:2;padding-left:20px;margin:0 0 28px">
            <li><strong style="color:#e2e8f0">Trading Terminal</strong> — live market data, option chain, indices</li>
            <li><strong style="color:#e2e8f0">Order Intelligence</strong> — AI analysis before every trade</li>
            <li><strong style="color:#e2e8f0">Trading Games</strong> — test your psychology, bias-free</li>
            <li><strong style="color:#e2e8f0">Book Summaries</strong> — learn from the best traders</li>
          </ul>

          <a href="${appUrl}/trades" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:700;font-size:15px">
            Open TradingVerse →
          </a>

          <p style="color:#334155;margin:32px 0 0;font-size:12px">
            You're receiving this because you signed up at tradingverse.in.<br/>
            If this wasn't you, you can safely ignore this email.
          </p>
        </div>
      `,
    }).catch(() => {}) // silent fail — registration already succeeded
  }

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
