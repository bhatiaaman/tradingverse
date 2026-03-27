import { NextResponse } from 'next/server';
import { getBroker } from '@/app/lib/providers';

export async function POST(req) {
  try {
    const { symbol, qty } = await req.json();
    if (!symbol || !qty) {
      return NextResponse.json({ error: 'Missing symbol or qty' }, { status: 400 });
    }

    const broker = await getBroker();
    const order  = await broker.placeOrder('regular', {
      tradingsymbol:    symbol,
      exchange:         'NFO',
      transaction_type: 'SELL',
      order_type:       'MARKET',
      product:          'MIS',
      quantity:         qty,
    });

    return NextResponse.json({ ok: true, orderId: order.order_id });
  } catch (err) {
    console.error('[third-eye/exit]', err.message);
    return NextResponse.json({ error: err.message || 'Exit failed' }, { status: 500 });
  }
}
