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
      const msg = err.message?.includes('Incorrect') || err.message?.includes('403')
        ? 'Kite session expired — please re-login to Zerodha'
        : 'Failed to fetch orders from Kite';
      return NextResponse.json({ success: false, kiteError: msg, orders: [] }, { status: 502 });
    }

    // Enrich open orders with LTP
    const OPEN_STATUSES = ['OPEN', 'TRIGGER PENDING', 'PUT ORDER REQ RECEIVED', 'VALIDATION PENDING', 'OPEN PENDING', 'MODIFY PENDING', 'MODIFY VALIDATION PENDING', 'MODIFIED', 'CANCEL PENDING', 'AMO REQ RECEIVED'];
    const openOrders = orders.filter(o => OPEN_STATUSES.includes(o.status?.toUpperCase()));

    if (openOrders.length > 0) {
      try {
        const instruments = [...new Set(openOrders.map(o => `${o.exchange}:${o.tradingsymbol}`))];
        const ltpRes = await broker.getLTP(instruments);
        const ltpMap = ltpRes.data || {};
        
        orders.forEach(o => {
          const key = `${o.exchange}:${o.tradingsymbol}`;
          const live = ltpMap[key]?.last_price;
          if (live != null) {
            o.last_price = live;
          }
        });
      } catch (ltpErr) {
        console.error('Kite LTP enrichment failed for orders:', ltpErr.message);
      }
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