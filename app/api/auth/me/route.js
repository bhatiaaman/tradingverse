import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/app/lib/db'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value
  if (!token) return NextResponse.json({ user: null })

  const sessions = await sql`
    SELECT s.email, u.name, u.plan, u.google_id
    FROM sessions s
    JOIN users u ON u.email = s.email
    WHERE s.token = ${token} AND s.expires_at > now()
    LIMIT 1
  `
  if (!sessions.length) return NextResponse.json({ user: null })

  const { email, name, plan } = sessions[0]
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase().trim()
  const isOwner    = ownerEmail && email.toLowerCase() === ownerEmail
  const role       = isOwner ? 'admin' : 'user'
  const resolvedPlan = isOwner ? 'pro' : (plan || 'free')

  return NextResponse.json({ user: { name, email, role, plan: resolvedPlan } })
}
