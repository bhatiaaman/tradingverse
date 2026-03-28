import { NextResponse } from 'next/server';
import { requireSession, unauthorized, forbidden } from '@/app/lib/session';
import { redis } from '@/app/lib/redis';

const ORDER_LOG_KEY = 'tradingverse:order_log';

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const raw = await redis.lrange(ORDER_LOG_KEY, 0, -1);
    const entries = raw
      .map(item => {
        try { return typeof item === 'string' ? JSON.parse(item) : item; }
        catch { return null; }
      })
      .filter(Boolean)
      .reverse(); // newest first

    return NextResponse.json({ entries });
  } catch (e) {
    console.error('order log read failed:', e);
    return NextResponse.json({ error: 'Failed to read order log' }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    await redis.del(ORDER_LOG_KEY);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to clear log' }, { status: 500 });
  }
}
