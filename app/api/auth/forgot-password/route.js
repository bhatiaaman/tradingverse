import { Redis } from '@upstash/redis'
import { Resend } from 'resend'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { authLimiter, checkLimit } from '@/app/lib/rate-limit'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'
const RESET_TTL = 60 * 15 // 15 minutes

export async function POST(req) {
  const rl = await checkLimit(authLimiter, req)
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  const { email } = await req.json()
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Always return success — don't reveal whether email exists
  const userKey = `${NS}:user:${email.toLowerCase()}`
  const raw = await redis.get(userKey)

  if (raw) {
    const token = randomBytes(32).toString('hex')
    await redis.set(`${NS}:reset:${token}`, email.toLowerCase(), { ex: RESET_TTL })

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://tradingverse.in'}/reset-password?token=${token}`

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'TradingVerse <noreply@tradingverse.in>',
      to: email.toLowerCase(),
      subject: 'Reset your TradingVerse password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d1829;color:#e2e8f0;border-radius:12px">
          <h2 style="margin:0 0 8px;font-size:22px;color:#fff">Reset your password</h2>
          <p style="color:#94a3b8;margin:0 0 24px;font-size:15px">Click the button below to set a new password. This link expires in <strong style="color:#e2e8f0">15 minutes</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">Reset Password</a>
          <p style="color:#475569;margin:24px 0 0;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    })
  }

  return NextResponse.json({ ok: true })
}
