import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value

  if (token) {
    await redis.del(`${NS}:session:${token}`)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('tv_session', '', { maxAge: 0, path: '/' })
  return res
}
