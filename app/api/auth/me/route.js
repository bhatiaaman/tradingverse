import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const NS = process.env.REDIS_NAMESPACE || 'tradingverse'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value

  if (!token) {
    return NextResponse.json({ user: null })
  }

  const email = await redis.get(`${NS}:session:${token}`)
  if (!email) {
    return NextResponse.json({ user: null })
  }

  const raw = await redis.get(`${NS}:user:${email}`)
  if (!raw) {
    return NextResponse.json({ user: null })
  }

  const user = typeof raw === 'string' ? JSON.parse(raw) : raw
  return NextResponse.json({ user: { name: user.name, email: user.email } })
}
