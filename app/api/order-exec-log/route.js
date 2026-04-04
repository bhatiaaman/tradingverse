import { NextResponse } from 'next/server';
import { requireSession, unauthorized, forbidden } from '@/app/lib/session';
import { redis } from '@/app/lib/redis';

const EXEC_LOG_KEY = 'tradingverse:order_exec_log';

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const raw     = await redis.lrange(EXEC_LOG_KEY, 0, -1);
    const entries = raw.map(r => typeof r === 'string' ? JSON.parse(r) : r).reverse();
    return NextResponse.json({ entries });
  } catch (e) {
    console.error('[order-exec-log] read error:', e);
    return NextResponse.json({ entries: [] });
  }
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    await redis.del(EXEC_LOG_KEY);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
