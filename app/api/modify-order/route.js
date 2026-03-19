import { NextResponse } from 'next/server';
import { getBroker } from '@/app/lib/providers';
import { requireSession, unauthorized, forbidden } from '@/app/lib/session';

export async function POST(request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  const broker = await getBroker();
  if (!broker.isConnected()) {
    return NextResponse.json({ error: 'Kite API not configured' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { order_id, variety = 'regular', quantity, price, trigger_price, order_type } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const params = {};
    if (quantity)      params.quantity      = parseInt(quantity, 10);
    if (price)         params.price         = parseFloat(price);
    if (trigger_price) params.trigger_price = parseFloat(trigger_price);
    if (order_type)    params.order_type    = order_type;

    if (Object.keys(params).length === 0) {
      return NextResponse.json({ error: 'Nothing to modify' }, { status: 400 });
    }

    const result = await broker.modifyOrder(variety, order_id, params);
    return NextResponse.json({ success: true, order_id: result.order_id });

  } catch (error) {
    console.error('Modify order error:', error);
    return NextResponse.json({ error: error.message || 'Failed to modify order' }, { status: 500 });
  }
}
