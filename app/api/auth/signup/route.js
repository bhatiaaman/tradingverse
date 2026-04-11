import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { authLimiter, checkLimit } from '@/app/lib/rate-limit'
import { Resend } from 'resend'
import { sql } from '@/app/lib/db'

const SESSION_TTL_DAYS = 30;
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

  const existing = await sql`SELECT email FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`
  if (existing.length > 0) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  const hash = await bcrypt.hash(password, 12)
  await sql`
    INSERT INTO users (email, name, hash, plan)
    VALUES (${email.toLowerCase()}, ${name}, ${hash}, 'free')
  `

  // Welcome email (fire-and-forget)
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
          <p style="color:#94a3b8;margin:0 0 28px;font-size:15px">Hi ${name.split(' ')[0]}, your account is ready.</p>
          <a href="${appUrl}/trades" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:700;font-size:15px">
            Open TradingVerse →
          </a>
        </div>
      `,
    }).catch(() => {})
  }

  const token     = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000)
  await sql`INSERT INTO sessions (token, email, expires_at) VALUES (${token}, ${email.toLowerCase()}, ${expiresAt})`

  const res = NextResponse.json({ ok: true, name })
  res.cookies.set('tv_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_DAYS * 24 * 3600,
    path: '/',
  })
  return res
}
