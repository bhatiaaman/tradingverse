import { NextResponse } from 'next/server'
import { sql } from '@/app/lib/db'
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session'

// GET /api/games/progress?game=regime-detector
export async function GET(request) {
  const { session, error } = await requireSession()
  if (error)    return serviceUnavailable(error)
  if (!session) return unauthorized()

  const { searchParams } = new URL(request.url)
  const game = searchParams.get('game')
  if (!game) return NextResponse.json({ error: 'Missing game param' }, { status: 400 })

  const rows = await sql`
    SELECT data FROM game_progress
    WHERE email = ${session.email} AND game = ${game}
  `
  const data = rows[0]?.data ?? null
  return NextResponse.json(data ?? { bestScore: null, bestPct: null, totalPlayed: 0 })
}

// POST /api/games/progress  { game, score, total }
export async function POST(request) {
  const { session, error } = await requireSession()
  if (error)    return serviceUnavailable(error)
  if (!session) return unauthorized()

  const { game, score, total } = await request.json()
  if (!game || score == null || !total) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const rows = await sql`
    SELECT data FROM game_progress
    WHERE email = ${session.email} AND game = ${game}
  `
  const prev = rows[0]?.data ?? { bestScore: null, bestPct: null, totalPlayed: 0 }

  const pct      = Math.round((score / total) * 100)
  const isNewBest = prev.bestScore == null || score > prev.bestScore

  const updated = {
    bestScore:   isNewBest ? score : prev.bestScore,
    bestPct:     isNewBest ? pct   : prev.bestPct,
    totalPlayed: (prev.totalPlayed || 0) + 1,
    lastPlayed:  new Date().toISOString().slice(0, 10),
  }

  await sql`
    INSERT INTO game_progress (email, game, data, updated_at)
    VALUES (${session.email}, ${game}, ${JSON.stringify(updated)}, now())
    ON CONFLICT (email, game) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `
  return NextResponse.json({ ...updated, isNewBest })
}
