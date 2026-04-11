// Google OAuth callback
// GET /api/auth/google/callback?code=...&state=...

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { sql } from '@/app/lib/db'
import { redis } from '@/app/lib/redis'

const NS      = process.env.REDIS_NAMESPACE || 'tradingverse'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tradingverse.in'
const SESSION_TTL_DAYS = 30

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const loginUrl = `${APP_URL}/login`

  if (error || !code || !state) {
    return NextResponse.redirect(`${loginUrl}?error=google_cancelled`)
  }

  // State lives in Redis (short-lived OAuth CSRF token — correct use of Redis)
  const storedNext = await redis.get(`${NS}:oauth-state:${state}`)
  if (!storedNext) return NextResponse.redirect(`${loginUrl}?error=invalid_state`)
  await redis.del(`${NS}:oauth-state:${state}`)

  const safeNext = typeof storedNext === 'string' && storedNext.startsWith('/') && !storedNext.startsWith('//')
    ? storedNext : '/trades'

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${APP_URL}/api/auth/google/callback`,
        grant_type:    'authorization_code',
      }),
    })
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`)
    const { access_token } = await tokenRes.json()

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`)
    const profile = await profileRes.json()

    const email    = profile.email?.toLowerCase()
    const name     = profile.name || email?.split('@')[0] || 'User'
    const googleId = profile.id
    if (!email) throw new Error('No email returned from Google')

    // Upsert user
    await sql`
      INSERT INTO users (email, name, google_id, plan)
      VALUES (${email}, ${name}, ${googleId}, 'free')
      ON CONFLICT (email) DO UPDATE
        SET google_id  = COALESCE(users.google_id, EXCLUDED.google_id),
            updated_at = now()
    `

    const token     = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000)
    await sql`INSERT INTO sessions (token, email, expires_at) VALUES (${token}, ${email}, ${expiresAt})`

    const res = NextResponse.redirect(`${APP_URL}${safeNext}`)
    res.cookies.set('tv_session', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   SESSION_TTL_DAYS * 24 * 3600,
      path:     '/',
    })
    return res

  } catch (err) {
    console.error('[google-callback] error:', err.message)
    return NextResponse.redirect(`${loginUrl}?error=google_failed`)
  }
}
