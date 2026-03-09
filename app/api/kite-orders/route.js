import { NextResponse } from 'next/server';
import { getBroker } from '@/app/lib/providers';
import { requireOwner, unauthorized } from '@/app/lib/session';

export async function GET(request) {
  if (!await requireOwner()) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50') || 50, 1), 200);

    const broker = await getBroker();
    if (!broker.isConnected()) {
      return NextResponse.json({ success: false, error: 'Kite not authenticated' }, { status: 401 });
    }

    let orders;
    try {
      orders = await broker.getOrdersRaw(limit);
    } catch (err) {
      console.error('Kite orders error:', err.message);
      return NextResponse.json({ success: false, error: 'Failed to fetch orders' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      orders,
      total: orders.length,
    });

  } catch (error) {
    console.error('kite-orders error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}