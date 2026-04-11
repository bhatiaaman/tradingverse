import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/app/lib/db'

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value

  if (token) {
    await sql`DELETE FROM sessions WHERE token = ${token}`
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('tv_session', '', { maxAge: 0, path: '/' })
  return res
}
