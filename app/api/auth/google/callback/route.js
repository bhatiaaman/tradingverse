// Google OAuth callback
// GET /api/auth/google/callback?code=...&state=...

import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { randomBytes } from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS      = process.env.REDIS_NAMESPACE || 'tradingverse'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tradingverse.in'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const loginUrl = `${APP_URL}/login`

  if (error || !code || !state) {
    return NextResponse.redirect(`${loginUrl}?error=google_cancelled`)
  }

  // Verify state and recover the post-login redirect target
  const storedNext = await redis.get(`${NS}:oauth-state:${state}`)
  if (!storedNext) {
    return NextResponse.redirect(`${loginUrl}?error=invalid_state`)
  }
  await redis.del(`${NS}:oauth-state:${state}`)

  const safeNext = typeof storedNext === 'string' && storedNext.startsWith('/') && !storedNext.startsWith('//')
    ? storedNext
    : '/trades'

  try {
    // Exchange code for access token
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

    // Fetch Google user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`)
    const profile = await profileRes.json()

    const email    = profile.email?.toLowerCase()
    const name     = profile.name || email?.split('@')[0] || 'User'
    const googleId = profile.id

    if (!email) throw new Error('No email returned from Google')

    // Find or create user in Redis
    const userKey = `${NS}:user:${email}`
    const raw     = await redis.get(userKey)

    if (!raw) {
      // New user — create account (no hash; Google is the auth provider)
      const user = { name, email, createdAt: Date.now(), provider: 'google', googleId, plan: 'free' }
      await redis.set(userKey, JSON.stringify(user))
      await redis.sadd(`${NS}:users:all`, email)
    } else {
      // Existing user (password or Google) — link Google ID if not already set
      const user = typeof raw === 'string' ? JSON.parse(raw) : raw
      const updates = {}
      if (!user.googleId) updates.googleId = googleId
      if (!user.plan)     updates.plan = 'free'
      if (Object.keys(updates).length) {
        await redis.set(userKey, JSON.stringify({ ...user, ...updates }))
      }
      await redis.sadd(`${NS}:users:all`, email)
    }

    // Create 30-day session
    const token = randomBytes(32).toString('hex')
    await redis.set(`${NS}:session:${token}`, email, { ex: 60 * 60 * 24 * 30 })

    const res = NextResponse.redirect(`${APP_URL}${safeNext}`)
    res.cookies.set('tv_session', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 30,
      path:     '/',
    })
    return res

  } catch (err) {
    console.error('[google-callback] error:', err.message)
    return NextResponse.redirect(`${loginUrl}?error=google_failed`)
  }
}
