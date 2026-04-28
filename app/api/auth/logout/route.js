import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/app/lib/db'
import { redis } from '@/app/lib/redis'

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value

  if (token) {
    await sql`DELETE FROM sessions WHERE token = ${token}`
    await redis.del(`${NS}:session:${token}`)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('tv_session', '', { maxAge: 0, path: '/' })
  return res
}
