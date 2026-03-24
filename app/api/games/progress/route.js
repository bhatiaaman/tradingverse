import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

async function getEmail() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value
  if (!token) return null
  return await redis.get(`${NS}:session:${token}`)
}

// GET /api/games/progress?game=regime-detector
export async function GET(request) {
  const email = await getEmail()
  if (!email) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const game = searchParams.get('game')
  if (!game) return NextResponse.json({ error: 'Missing game param' }, { status: 400 })

  const raw = await redis.get(`${NS}:game-progress:${email}`)
  const all = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}
  const data = all[game] ?? null

  return NextResponse.json(data ?? { bestScore: null, bestPct: null, totalPlayed: 0 })
}

// POST /api/games/progress  { game, score, total }
export async function POST(request) {
  const email = await getEmail()
  if (!email) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const { game, score, total } = await request.json()
  if (!game || score == null || !total) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const raw = await redis.get(`${NS}:game-progress:${email}`)
  const all = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}
  const prev = all[game] ?? { bestScore: null, bestPct: null, totalPlayed: 0 }

  const pct = Math.round((score / total) * 100)
  const isNewBest = prev.bestScore == null || score > prev.bestScore

  all[game] = {
    bestScore:   isNewBest ? score    : prev.bestScore,
    bestPct:     isNewBest ? pct      : prev.bestPct,
    totalPlayed: (prev.totalPlayed || 0) + 1,
    lastPlayed:  new Date().toISOString().slice(0, 10),
  }

  await redis.set(`${NS}:game-progress:${email}`, JSON.stringify(all))

  return NextResponse.json({ ...all[game], isNewBest })
}
