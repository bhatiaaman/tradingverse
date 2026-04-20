import { NextResponse } from 'next/server'
import { sql } from '@/app/lib/db'
import { requireOwner, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session'

const CONFIG_KEY = 'feature-flags'

export const PAGES = [
  { key: 'trades',         label: 'Trading Dashboard'       },
  { key: 'terminal',       label: 'Live Terminal'            },
  { key: 'pre-market',     label: 'Pre-Market'               },
  { key: 'options',        label: 'Options'                  },
  { key: 'options-expiry', label: 'Options Expiry Dashboard' },
  { key: 'investing',      label: 'Investing'                },
  { key: 'learn',          label: 'Learn'                    },
  { key: 'games',          label: 'Trading Games'            },
  { key: 'orders',         label: 'Orders'                   },
  { key: 'settings',       label: 'Settings'                 },
  { key: 'stock-updates',  label: 'Chartink Scanner'         },
]

export const DEFAULTS = Object.fromEntries(
  PAGES.map(p => [p.key, { visitor: false, free: true }])
)

async function getFlags() {
  const rows = await sql`SELECT value FROM system_config WHERE key = ${CONFIG_KEY}`
  const saved = rows[0]?.value ?? {}
  const hasExplicitFreeAccess = Object.values(saved).some(f => f?.free === true)
  return hasExplicitFreeAccess ? { ...DEFAULTS, ...saved } : { ...DEFAULTS }
}

export async function GET() {
  const { session, error } = await requireOwner()
  if (error)    return serviceUnavailable(error)
  if (!session) return forbidden()

  const flags = await getFlags()
  return NextResponse.json({ flags, pages: PAGES })
}

export async function PATCH(req) {
  const { session, error } = await requireOwner()
  if (error)    return serviceUnavailable(error)
  if (!session) return forbidden()

  const { page, userType, enabled } = await req.json()
  if (!page || !['visitor', 'free'].includes(userType) || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const flags = await getFlags()
  flags[page] = { ...(flags[page] || { visitor: false, free: false }), [userType]: enabled }

  await sql`
    INSERT INTO system_config (key, value, updated_at)
    VALUES (${CONFIG_KEY}, ${JSON.stringify(flags)}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `
  return NextResponse.json({ ok: true })
}
