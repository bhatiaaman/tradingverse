import { NextResponse } from 'next/server';
import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';
import { sql } from '@/app/lib/db';

const CONFIG_KEY    = 'active_broker';
const VALID_BROKERS = ['kite', 'paper'];

export async function GET() {
  const { session, error } = await requireSession();
  if (error)   return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  const rows   = await sql`SELECT value FROM system_config WHERE key = ${CONFIG_KEY}`;
  const broker = rows[0]?.value?.broker ?? 'kite';
  return NextResponse.json({ broker });
}

export async function POST(request) {
  const { session, error } = await requireSession();
  if (error)   return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  const { broker } = await request.json();
  if (!broker || !VALID_BROKERS.includes(broker)) {
    return NextResponse.json({ error: `Invalid broker. Must be one of: ${VALID_BROKERS.join(', ')}` }, { status: 400 });
  }

  await sql`
    INSERT INTO system_config (key, value, updated_at)
    VALUES (${CONFIG_KEY}, ${JSON.stringify({ broker })}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  return NextResponse.json({ success: true, broker });
}
