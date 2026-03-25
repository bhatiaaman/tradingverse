import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { cookies } from 'next/headers'

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS          = process.env.REDIS_NAMESPACE || 'tradingverse'
const OWNER_EMAIL = process.env.OWNER_EMAIL?.toLowerCase().trim()
const FLAGS_KEY   = `${NS}:feature-flags`

export const PAGES = [
  { key: 'trades',        label: 'Trading Dashboard' },
  { key: 'terminal',      label: 'Live Terminal'      },
  { key: 'pre-market',    label: 'Pre-Market'         },
  { key: 'investing',     label: 'Investing'          },
  { key: 'learn',         label: 'Learn'              },
  { key: 'games',         label: 'Trading Games'      },
  { key: 'orders',        label: 'Orders'             },
  { key: 'settings',      label: 'Settings'           },
  { key: 'stock-updates', label: 'Stock Updates'      },
]

// Default: visitors blocked, logged-in free users allowed.
// Set free:false on a page to make it pro-only.
export const DEFAULTS = Object.fromEntries(
  PAGES.map(p => [p.key, { visitor: false, free: true }])
)

async function requireAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value
  if (!token) return null
  const email = await redis.get(`${NS}:session:${token}`)
  if (!email || String(email).toLowerCase() !== OWNER_EMAIL) return null
  return email
}

// GET — return current flags merged with defaults
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw   = await redis.get(FLAGS_KEY)
  const saved = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}
  const flags = { ...DEFAULTS, ...saved }

  return NextResponse.json({ flags, pages: PAGES })
}

// PATCH — update a single flag: { page, userType: 'visitor'|'free', enabled }
export async function PATCH(req) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { page, userType, enabled } = await req.json()
  if (!page || !['visitor', 'free'].includes(userType) || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const raw   = await redis.get(FLAGS_KEY)
  const flags = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { ...DEFAULTS }

  flags[page] = { ...(flags[page] || { visitor: false, free: false }), [userType]: enabled }
  await redis.set(FLAGS_KEY, JSON.stringify(flags))

  return NextResponse.json({ ok: true })
}
