import { sql } from '@/app/lib/db'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// ── In-memory session cache (matches middleware.js behaviour) ─────────────────
// API routes call requireSession() on every request (orders every 30s, positions
// every 15s, etc.). Without caching every poll hits Neon cold — any transient
// DB error → silent 401 → empty orders/positions panel.
// Cache the token → { email, role } for 60 seconds so Neon is only hit once per
// session per minute. Sessions are 30-day tokens, so 60s staleness is safe.
const SESSION_CACHE     = new Map();   // token → { email, role, cachedAt }
const SESSION_CACHE_TTL = 60_000;      // 60 seconds

function getCached(token) {
  const entry = SESSION_CACHE.get(token);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > SESSION_CACHE_TTL) { SESSION_CACHE.delete(token); return null; }
  return entry;
}

export async function requireSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value
  if (!token) return null

  // Cache hit → skip Neon round-trip entirely
  const cached = getCached(token);
  if (cached) return { email: cached.email, role: cached.role };

  let rows
  try {
    rows = await sql`
      SELECT s.email FROM sessions s
      WHERE s.token = ${token} AND s.expires_at > now()
      LIMIT 1
    `
  } catch (err) {
    // Neon cold-start, connection error, etc.
    // Return null (unauthenticated) rather than crashing the API route.
    console.error('[session] DB error in requireSession:', err?.message ?? err)
    return null
  }

  if (!rows.length) return null

  const email = rows[0].email
  const role  = resolveRole(email)

  // Store in cache so next poll within 60s skips Neon
  SESSION_CACHE.set(token, { email, role, cachedAt: Date.now() });

  return { email, role }
}


export async function requireOwner() {
  const session = await requireSession()
  if (!session || session.role !== 'admin') return null
  return session
}

export async function requireTrader() {
  const session = await requireSession()
  if (!session) return null
  if (session.role === 'admin' || session.role === 'trader') return session
  return null
}

function resolveRole(email) {
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase().trim()
  if (ownerEmail && email.toLowerCase() === ownerEmail) return 'admin'
  return 'user'
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
