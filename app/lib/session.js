import { Redis } from '@upstash/redis'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

/**
 * Returns the session email if the request is authenticated, null otherwise.
 * Reads the tv_session HTTP-only cookie and validates it against Redis.
 */
export async function requireSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value
  if (!token) return null
  const email = await redis.get(`${NS}:session:${token}`)
  return email || null
}

/** Standard 401 response for unauthenticated requests. */
export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
