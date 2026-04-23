// One-time schema migration endpoint — owner-only.
// Hit once after deploying to create all tables.
// Safe to re-run (all CREATE TABLE IF NOT EXISTS).

import { NextResponse } from 'next/server';
import { requireOwner } from '@/app/lib/session';
import { migrateSchema } from '@/app/lib/db';

export async function POST(req) {
  const session = await requireOwner(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await migrateSchema();
    return NextResponse.json({ ok: true, message: 'Schema migration complete' });
  } catch (err) {
    console.error('[db-migrate]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  return POST(req);
}
