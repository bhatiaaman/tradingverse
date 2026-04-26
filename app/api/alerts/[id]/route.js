import { NextResponse }                from 'next/server';
import { requireSession, unauthorized } from '@/app/lib/session';
import { sql }                          from '@/app/lib/db';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

async function redisSet(key, value, ttl) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url     = `${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}${ttl ? `?ex=${ttl}` : ''}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch {}
}

async function syncActiveToRedis() {
  const rows = await sql`SELECT id, symbol, instrument_token, threshold::float AS threshold, direction FROM alerts WHERE status = 'active'`;
  await redisSet(`${NS}:alerts:active`, rows, 300);
}

// DELETE /api/alerts/[id] — cancel an alert
export async function DELETE(req, { params }) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await sql`UPDATE alerts SET status = 'cancelled' WHERE id = ${id}`;
  await syncActiveToRedis();
  return NextResponse.json({ ok: true });
}
