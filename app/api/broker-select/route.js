import { NextResponse } from 'next/server';
import { requireSession, unauthorized, forbidden } from '@/app/lib/session';
import { redis } from '@/app/lib/redis';

const KEY = 'tradingverse:active_broker';
const VALID_BROKERS = ['kite', 'paper'];

export async function GET(request) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const active = (await redis.get(KEY)) || 'kite';
    return NextResponse.json({ broker: active });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const body = await request.json();
    const { broker } = body;

    if (!broker || !VALID_BROKERS.includes(broker)) {
      return NextResponse.json({ error: `Invalid broker. Must be one of: ${VALID_BROKERS.join(', ')}` }, { status: 400 });
    }

    await redis.set(KEY, broker);
    return NextResponse.json({ success: true, broker });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
