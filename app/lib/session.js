import { sql } from '@/app/lib/db'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function requireSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('tv_session')?.value
  if (!token) return null

  let rows
  try {
    rows = await sql`
      SELECT s.email FROM sessions s
      WHERE s.token = ${token} AND s.expires_at > now()
      LIMIT 1
    `
  } catch (err) {
    // Neon cold-start timeout, connection error, etc.
    // Return null (treat as unauthenticated) rather than crashing the API route.
    console.error('[session] DB error in requireSession:', err?.message ?? err)
    return null
  }

  if (!rows.length) return null

  const email = rows[0].email
  const role  = resolveRole(email)
  return { email, role }
}


export async function requireOwner() {
  const session = await requireSession()
  if (!session || session.role !== 'admin') return null
  return session
}

export async function requireTrader() {
  const session = await requireSession()
  if (!session) return null
  if (session.role === 'admin' || session.role === 'trader') return session
  return null
}

function resolveRole(email) {
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase().trim()
  if (ownerEmail && email.toLowerCase() === ownerEmail) return 'admin'
  return 'user'
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
