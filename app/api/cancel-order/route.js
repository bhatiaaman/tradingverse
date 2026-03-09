import { NextResponse } from 'next/server';
import { getBroker } from '@/app/lib/providers';
import { requireOwner, unauthorized } from '@/app/lib/session';

export async function POST(request) {
  if (!await requireOwner()) return unauthorized();

  const broker = await getBroker();
  if (!broker.isConnected()) {
    return NextResponse.json({ success: false, error: 'Kite not authenticated' }, { status: 401 });
  }

  try {
    const { order_id, variety = 'regular' } = await request.json();
    if (!order_id) {
      return NextResponse.json({ success: false, error: 'order_id required' }, { status: 400 });
    }

    const result = await broker.cancelOrder(variety, order_id);
    return NextResponse.json({ success: true, order_id: result.order_id });

  } catch (error) {
    console.error('Cancel order error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
