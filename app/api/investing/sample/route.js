import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import { requireOwner } from '@/app/lib/session'

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

// GET /api/investing/sample?type=chart
//     /api/investing/sample?type=strategic-view&asset=nifty
//     /api/investing/sample?type=strategic-view&asset=gold
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const type  = searchParams.get('type')
  const asset = searchParams.get('asset') || 'nifty'

  let key
  if (type === 'chart') {
    key = `${NS}:sample:chart-analysis:nifty`
  } else if (type === 'strategic-view') {
    if (!['nifty', 'gold'].includes(asset)) return NextResponse.json({ error: 'Invalid asset' }, { status: 400 })
    key = `${NS}:sample:strategic-view:${asset}`
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const data = await redis.get(key)
  return NextResponse.json({ sample: data ?? null })
}

// POST /api/investing/sample  (admin only)
// Body: { type: 'chart' | 'strategic-view', asset?: 'nifty' | 'gold', data: <analysis JSON or string> }
export async function POST(req) {
  const session = await requireOwner()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const { type, asset = 'nifty', data } = body
  if (!data) return NextResponse.json({ error: 'No data provided' }, { status: 400 })

  let key
  if (type === 'chart') {
    key = `${NS}:sample:chart-analysis:nifty`
  } else if (type === 'strategic-view') {
    if (!['nifty', 'gold'].includes(asset)) return NextResponse.json({ error: 'Invalid asset' }, { status: 400 })
    key = `${NS}:sample:strategic-view:${asset}`
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  await redis.set(key, data)
  return NextResponse.json({ ok: true })
}
