import { NextResponse } from 'next/server';
import { getBroker } from '@/app/lib/providers';
import { requireOwner, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';

export async function GET(request) {
  try {
    const { session, error } = await requireOwner();
    if (error === 'database_error') return serviceUnavailable(error);
    if (!session) return unauthorized();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50') || 50, 1), 200);

    const broker = await getBroker();
    if (!broker.isConnected()) {
      return NextResponse.json({ success: false, kiteError: 'Kite not connected — please authenticate via /api/kite-config', orders: [] });
    }

    let orders;
    try {
      orders = await broker.getOrdersRaw(limit);
    } catch (err) {
      console.error('Kite orders error:', err.message);
      // Surface the Kite error message so UI can show "token expired" vs generic failure
      const msg = err.message?.includes('Incorrect') || err.message?.includes('403')
        ? 'Kite session expired — please re-login to Zerodha'
        : 'Failed to fetch orders from Kite';
      return NextResponse.json({ success: false, kiteError: msg, orders: [] }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      orders,
      total: orders.length,
    });

  } catch (error) {
    console.error('kite-orders error:', error);
    return NextResponse.json({ success: false, kiteError: 'Internal server error', orders: [] }, { status: 500 });
  }
}