import { NextResponse } from 'next/server';
import { getBroker } from '@/app/lib/providers';
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session';

export async function POST(req) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  try {
    const { symbol, qty } = await req.json();
    if (!symbol || !qty) {
      return NextResponse.json({ error: 'Missing symbol or qty' }, { status: 400 });
    }

    const broker   = await getBroker();
    const exchange = symbol.startsWith('SENSEX') ? 'BFO' : 'NFO';
    const order    = await broker.placeOrder('regular', {
      tradingsymbol:     symbol,
      exchange,
      transaction_type:  'SELL',
      order_type:        'MARKET',
      product:           'MIS',
      quantity:          qty,
      market_protection: 1.0,
    });

    return NextResponse.json({ ok: true, orderId: order.order_id });
  } catch (err) {
    console.error('[setup-eye/exit]', err.message);
    return NextResponse.json({ error: err.message || 'Exit failed' }, { status: 500 });
  }
}
