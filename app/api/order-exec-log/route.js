import { NextResponse } from 'next/server';
import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';
import { sql } from '@/app/lib/db';

export async function GET() {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  const rows = await sql`
    SELECT id, ts, event, data, created_at
    FROM order_exec_log
    ORDER BY ts DESC NULLS LAST
    LIMIT 500
  `;
  const entries = rows.map(r => ({ ts: Number(r.ts), event: r.event, ...r.data }));
  return NextResponse.json({ entries });
}

export async function DELETE() {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  await sql`DELETE FROM order_exec_log`;
  return NextResponse.json({ ok: true });
}
