import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const NS          = process.env.REDIS_NAMESPACE || 'tradingverse'
const OWNER_EMAIL = process.env.OWNER_EMAIL?.toLowerCase().trim()

// ── Neon (lazy init so Edge worker doesn't fail if env missing) ──────────────
let _sql
function getSql() {
  if (!_sql) _sql = neon(process.env.NEON_DB_URL)
  return _sql
}

// Session cache — avoids a Neon round-trip on every page navigation.
// Sessions are 30-day tokens; a 60s in-memory TTL is safe and invisible to users.
const SESSION_CACHE     = new Map()   // token → { email, plan, cachedAt }
const SESSION_CACHE_TTL = 60_000      // 60 seconds

function getCachedSession(token) {
  const entry = SESSION_CACHE.get(token)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > SESSION_CACHE_TTL) {
    SESSION_CACHE.delete(token)
    return null
  }
  return entry
}

async function getSessionEmail(token) {
  const cached = getCachedSession(token)
  if (cached) return cached.email
  try {
    const sql  = getSql()
    const rows = await sql`
      SELECT s.email, u.plan
      FROM sessions s
      LEFT JOIN users u ON u.email = s.email
      WHERE s.token = ${token} AND s.expires_at > now()
      LIMIT 1
    `
    if (!rows[0]) return null
    SESSION_CACHE.set(token, { email: rows[0].email, plan: rows[0].plan ?? 'free', cachedAt: Date.now() })
    return rows[0].email
  } catch { return null }
}

async function getUserPlan(email) {
  // Plan is already fetched alongside email in getSessionEmail — check cache
  for (const entry of SESSION_CACHE.values()) {
    if (entry.email === email && Date.now() - entry.cachedAt <= SESSION_CACHE_TTL) {
      return entry.plan
    }
  }
  try {
    const sql  = getSql()
    const rows = await sql`SELECT plan FROM users WHERE email = ${email} LIMIT 1`
    return rows[0]?.plan ?? 'free'
  } catch { return 'free' }
}

// ── Feature flags still come from Redis (short-lived cache, not session data) ─
async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    const data = await res.json()
    if (data.result === null || data.result === undefined) return null
    try { return JSON.parse(data.result) } catch { return data.result }
  } catch { return null }
}

// Page routes — order matters (more specific first)
const PAGE_ROUTES = [
  { key: 'pre-market',      prefix: '/pre-market'       },
  { key: 'stock-updates',   prefix: '/stock-updates'    },
  { key: 'trades',          prefix: '/trades'           },
  { key: 'terminal',        prefix: '/terminal'         },
  { key: 'investing',       prefix: '/investing'        },
  { key: 'learn',           prefix: '/learn'            },
  { key: 'games',           prefix: '/games'            },
  { key: 'orders',          prefix: '/orders'           },
  { key: 'settings',        prefix: '/settings'         },
  { key: 'chart',           prefix: '/chart'            },
  { key: 'options-expiry',  prefix: '/options/expiry'   },
  { key: 'options',         prefix: '/options'          },
]

const ADMIN_PREFIXES = ['/admin', '/eye']

// Module-level flags cache (per Edge instance, refreshes every 5s)
let _flags   = null
let _flagsAt = 0
const FLAGS_TTL = 5_000

async function getFlags() {
  if (_flags && Date.now() - _flagsAt < FLAGS_TTL) return _flags
  const data  = await redisGet(`${NS}:feature-flags`)
  const saved = data || {}
  const hasExplicitFreeAccess = Object.values(saved).some(f => f?.free === true)
  _flags   = hasExplicitFreeAccess ? saved : {}
  _flagsAt = Date.now()
  return _flags
}

function loginRedirect(pathname, req) {
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export async function middleware(req) {
  const { pathname } = req.nextUrl

  const isAdminPath = ADMIN_PREFIXES.some(p => pathname.startsWith(p))
  const pageRoute   = PAGE_ROUTES.find(r => pathname.startsWith(r.prefix))

  if (!isAdminPath && !pageRoute) return NextResponse.next()

  const token = req.cookies.get('tv_session')?.value

  // ── Admin gate ──────────────────────────────────────────────────────────────
  if (isAdminPath) {
    if (!token) return loginRedirect(pathname, req)
    const email = await getSessionEmail(token)
    if (!email) return loginRedirect(pathname, req)
    if (String(email).toLowerCase() !== OWNER_EMAIL) {
      return NextResponse.redirect(new URL('/trades', req.url))
    }
    return NextResponse.next()
  }

  // ── Page gate ────────────────────────────────────────────────────────────────
  const flags    = await getFlags()
  const pageFlag = flags[pageRoute.key] || { visitor: false, free: true }

  // No session → visitor
  if (!token) {
    return pageFlag.visitor
      ? NextResponse.next()
      : loginRedirect(pathname, req)
  }

  // Has session → resolve email
  const email = await getSessionEmail(token)
  if (!email) return loginRedirect(pathname, req)

  // Owner always passes
  if (OWNER_EMAIL && String(email).toLowerCase() === OWNER_EMAIL) {
    return NextResponse.next()
  }

  // Any logged-in user passes unless page is explicitly pro-only (free: false)
  if (pageFlag.free) return NextResponse.next()

  // Pro-only page — check plan
  const plan = await getUserPlan(email)
  if (plan === 'pro') return NextResponse.next()

  return NextResponse.redirect(new URL('/upgrade', req.url))
}

export const config = {
  matcher: [
    '/trades/:path*',
    '/investing/:path*',
    '/pre-market/:path*',
    '/settings/:path*',
    '/learn/:path*',
    '/games/:path*',
    '/orders/:path*',
    '/terminal/:path*',
    '/chart/:path*',
    '/stock-updates/:path*',
    '/options/:path*',
    '/admin/:path*',
    '/eye/:path*',
  ],
}
