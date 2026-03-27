import { NextResponse } from 'next/server'

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const NS          = process.env.REDIS_NAMESPACE || 'tradingverse'
const OWNER_EMAIL = process.env.OWNER_EMAIL?.toLowerCase().trim()

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

// Module-level flags cache (per Edge instance, refreshes every 60s)
let _flags    = null
let _flagsAt  = 0
const FLAGS_TTL = 5_000

async function getFlags() {
  if (_flags && Date.now() - _flagsAt < FLAGS_TTL) return _flags
  const data  = await redisGet(`${NS}:feature-flags`)
  const saved = data || {}
  // If no page has free:true, the stored data is the old default state (all false).
  // Treat it as empty so the per-page fallback (free:true) applies everywhere.
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

  // ── Admin gate ──────────────────────────────────────────────────────────
  if (isAdminPath) {
    if (!token) return loginRedirect(pathname, req)
    const email = await redisGet(`${NS}:session:${token}`)
    if (!email) return loginRedirect(pathname, req)
    if (String(email).toLowerCase() !== OWNER_EMAIL) {
      return NextResponse.redirect(new URL('/trades', req.url))
    }
    return NextResponse.next()
  }

  // ── Page gate ───────────────────────────────────────────────────────────
  const flags    = await getFlags()
  // Default: visitors blocked, logged-in users (free or pro) allowed.
  // Admins can explicitly set free:false on a page to make it pro-only.
  const pageFlag = flags[pageRoute.key] || { visitor: false, free: true }

  // No session → visitor
  if (!token) {
    return pageFlag.visitor
      ? NextResponse.next()
      : loginRedirect(pathname, req)
  }

  // Has session → resolve email
  const email = await redisGet(`${NS}:session:${token}`)
  if (!email) return loginRedirect(pathname, req)

  // Owner always passes
  if (OWNER_EMAIL && String(email).toLowerCase() === OWNER_EMAIL) {
    return NextResponse.next()
  }

  // Any logged-in user passes unless page is explicitly pro-only (free: false)
  if (pageFlag.free) return NextResponse.next()

  // Pro-only page — check plan
  const user = await redisGet(`${NS}:user:${email}`)
  if ((user?.plan || 'free') === 'pro') return NextResponse.next()

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
