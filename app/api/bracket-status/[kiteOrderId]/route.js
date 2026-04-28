import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session';

export async function GET(_req, { params }) {
  const { session, error } = await requireSession();
  if (error)    return serviceUnavailable(error);
  if (!session) return unauthorized();

  const { kiteOrderId } = await params;

  const [resultRaw, isPending] = await Promise.all([
    redis.get(`tradingverse:bracket:result:${kiteOrderId}`),
    redis.sismember('tradingverse:bracket:pending', kiteOrderId),
  ]);

  if (resultRaw) {
    const result = typeof resultRaw === 'string' ? JSON.parse(resultRaw) : resultRaw;
    return NextResponse.json({ status: 'done', result });
  }

  if (isPending) {
    return NextResponse.json({ status: 'monitoring' });
  }

  return NextResponse.json({ status: 'not_found' });
}
