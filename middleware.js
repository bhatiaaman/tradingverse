import { NextResponse } from 'next/server'

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const NS          = process.env.REDIS_NAMESPACE || 'tradingverse'
const OWNER_EMAIL = process.env.OWNER_EMAIL?.toLowerCase().trim()

// Session cache — avoids a Redis round-trip on every page navigation.
const SESSION_CACHE     = new Map()   // token → { email, plan, cachedAt }
const SESSION_CACHE_TTL = 300_000      // 5 minutes

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
    const email = await redisGet(`${NS}:session:${token}`)
    if (!email) return null
    SESSION_CACHE.set(token, { email, plan: 'free', cachedAt: Date.now() })
    return email
  } catch { return null }
}

async function getUserPlan(email) {
  // Plan is already fetched alongside email in getSessionEmail — check cache
  for (const entry of SESSION_CACHE.values()) {
    if (entry.email === email && Date.now() - entry.cachedAt <= SESSION_CACHE_TTL) {
      return entry.plan
    }
  }
  // Fallback: all authenticated users are treated as free unless cached plan says otherwise
  return 'free'
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
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - worker/.* (web workers, if any are placed differently)
     *
     * Also omit explicitly public paths:
     * - /login
     * - /options/chart
     * - /api/cron/*
     */
    '/((?!api|_next/static|_next/image|favicon.ico|login|options/chart).*)',
  ],
};
