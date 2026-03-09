import { Redis } from '@upstash/redis'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

/**
 * Role hierarchy:
 *   admin  — owner (matches OWNER_EMAIL env var). Full access: trading, settings, everything.
 *   trader — future paid users who connect their own broker. Can place orders (coming later).
 *   user   — free/registered users. Can access games, learn, investing. Cannot trade.
 *
 * Returns { email, role } if the request has a valid session, null otherwise.
 */
export async function requireSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value
  if (!token) return null

  const email = await redis.get(`${NS}:session:${token}`)
  if (!email) return null

  const role = resolveRole(email)
  return { email, role }
}

/**
 * Requires admin role (the owner). Use for all trading + settings routes.
 * Returns session or null.
 */
export async function requireOwner() {
  const session = await requireSession()
  if (!session || session.role !== 'admin') return null
  return session
}

/**
 * Future: requires trader or admin role. Use when paid trader accounts are added.
 * Returns session or null.
 */
export async function requireTrader() {
  const session = await requireSession()
  if (!session) return null
  if (session.role === 'admin' || session.role === 'trader') return session
  return null
}

/**
 * Determines role from email.
 * OWNER_EMAIL env var marks the admin. Stored role (future) can upgrade users to trader.
 */
function resolveRole(email) {
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase().trim()
  if (ownerEmail && email.toLowerCase() === ownerEmail) return 'admin'
  // Future: check Redis for stored role (trader/user) — for now everyone else is 'user'
  return 'user'
}

/** Standard 401 response for unauthenticated requests. */
export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/** 403 response for authenticated but insufficient role. */
export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
