import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { authLimiter, checkLimit } from '@/app/lib/rate-limit'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})
const NS       = process.env.REDIS_NAMESPACE || 'tradingverse'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req) {
  const rl = await checkLimit(authLimiter, req)
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const { email, name } = await req.json()
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const key   = `${NS}:waitlist`
  const added = await redis.sadd(key, email.toLowerCase().trim())

  // Notify owner on every new unique request
  if (added === 1 && process.env.RESEND_API_KEY && process.env.OWNER_EMAIL) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from:    process.env.RESEND_FROM_EMAIL || 'TradingVerse <noreply@tradingverse.in>',
        to:      process.env.OWNER_EMAIL,
        subject: `New access request — ${email}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d1829;color:#e2e8f0;border-radius:12px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#fff">New Access Request</h2>
            <p style="color:#94a3b8;margin:0 0 20px;font-size:15px">
              Someone wants access to TradingVerse.
            </p>
            <div style="background:#ffffff08;border:1px solid #ffffff12;border-radius:8px;padding:16px 20px;margin-bottom:24px">
              <p style="margin:0 0 4px;font-size:13px;color:#64748b">Email</p>
              <p style="margin:0;font-size:16px;color:#fff;font-weight:600">${email}</p>
              ${name ? `<p style="margin:8px 0 0;font-size:13px;color:#94a3b8">${name}</p>` : ''}
            </div>
            <a href="https://tradingverse.in/admin/users" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-weight:600;font-size:14px">
              Open Admin Panel
            </a>
          </div>
        `,
      })
    } catch (e) {
      console.error('[waitlist] email failed:', e.message)
    }
  }

  return NextResponse.json({ ok: true, alreadyJoined: added === 0 })
}
