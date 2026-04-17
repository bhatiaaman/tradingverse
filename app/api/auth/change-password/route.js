import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session'
import { sql } from '@/app/lib/db'

export async function POST(req) {
  const { session, error } = await requireSession()
  if (error === 'database_error') return serviceUnavailable(error)
  if (!session) return unauthorized()

  const { currentPassword, newPassword } = await req.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both fields are required' }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
  }

  const rows = await sql`SELECT hash FROM users WHERE email = ${session.email} LIMIT 1`
  if (!rows.length) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const valid = await bcrypt.compare(currentPassword, rows[0].hash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
  }

  const hash = await bcrypt.hash(newPassword, 12)
  await sql`UPDATE users SET hash = ${hash}, updated_at = now() WHERE email = ${session.email}`

  return NextResponse.json({ ok: true })
}
