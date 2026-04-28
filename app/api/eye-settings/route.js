import { NextResponse } from 'next/server';
import { sql } from '@/app/lib/db';
import { requireOwner, forbidden, serviceUnavailable } from '@/app/lib/session';

const CONFIG_KEY = 'eye-setup-config';

export async function GET() {
  const { session, error } = await requireOwner();
  if (error)    return serviceUnavailable(error);
  if (!session) return forbidden();

  const rows   = await sql`SELECT value FROM system_config WHERE key = ${CONFIG_KEY}`;
  const config = rows[0]?.value ?? {};
  return NextResponse.json({ config });
}

export async function POST(req) {
  const { session, error } = await requireOwner();
  if (error)    return serviceUnavailable(error);
  if (!session) return forbidden();

  let body;
  try {
    body = await req.json();
    if (typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: 'Invalid config' }, { status: 400 });
  }

  await sql`
    INSERT INTO system_config (key, value, updated_at)
    VALUES (${CONFIG_KEY}, ${body}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}
