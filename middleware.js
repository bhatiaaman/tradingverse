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

// Routes that require a logged-in pro account
const PRO_PREFIXES   = ['/trades', '/investing', '/pre-market', '/settings', '/learn', '/games', '/orders', '/terminal', '/chart', '/stock-updates']
// Routes only the owner can access
const ADMIN_PREFIXES = ['/admin']

export async function middleware(req) {
  const { pathname } = req.nextUrl

  const isProPath   = PRO_PREFIXES.some(p => pathname.startsWith(p))
  const isAdminPath = ADMIN_PREFIXES.some(p => pathname.startsWith(p))

  if (!isProPath && !isAdminPath) return NextResponse.next()

  const token = req.cookies.get('tv_session')?.value

  // Not logged in → redirect to login
  if (!token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Resolve session
  const email = await redisGet(`${NS}:session:${token}`)
  if (!email) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  const isOwner = typeof email === 'string' && email.toLowerCase() === OWNER_EMAIL

  // Admin gate — owner only
  if (isAdminPath && !isOwner) {
    return NextResponse.redirect(new URL('/trades', req.url))
  }

  // Pro gate — owner always bypasses
  if (isProPath && !isOwner) {
    const user = await redisGet(`${NS}:user:${email}`)
    const plan = user?.plan || 'free'
    if (plan !== 'pro') {
      return NextResponse.redirect(new URL('/upgrade', req.url))
    }
  }

  return NextResponse.next()
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
    '/admin/:path*',
  ],
}
