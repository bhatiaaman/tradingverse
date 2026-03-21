// Initiates Google OAuth flow
// GET /api/auth/google?next=/trades

import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { randomBytes } from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const next = searchParams.get('next') || '/trades'

  // State = CSRF protection + carries the post-login redirect target
  const state = randomBytes(16).toString('hex')
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/trades'
  await redis.set(`${NS}:oauth-state:${state}`, safeNext, { ex: 300 }) // 5 min

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    access_type:   'online',
    prompt:        'select_account',
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  )
}
