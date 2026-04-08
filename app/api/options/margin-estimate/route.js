import { NextResponse } from 'next/server';
import { getBroker } from '@/app/lib/providers';
import { requireSession, unauthorized, forbidden } from '@/app/lib/session';

// POST { exchange, tradingsymbol, transaction_type, order_type, product, quantity, price?, trigger_price? }
export async function POST(req) {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const body = await req.json();
    const {
      exchange = 'NFO',
      tradingsymbol,
      transaction_type,
      order_type,
      product = 'MIS',
      quantity,
      price,
      trigger_price,
    } = body ?? {};

    if (!tradingsymbol || !exchange || !transaction_type || !order_type || !quantity) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const broker = await getBroker();
    if (!broker?.isConnected?.()) {
      return NextResponse.json({ error: 'Kite not connected' }, { status: 401 });
    }

    const order = {
      exchange,
      tradingsymbol,
      transaction_type,
      order_type,
      product,
      quantity,
      ...(price != null ? { price } : {}),
      ...(trigger_price != null ? { trigger_price } : {}),
      variety: 'regular',
    };

    const margins = await broker.getOrderMargins([order]);
    return NextResponse.json({ ok: true, order, margins });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Margin estimate failed' }, { status: 500 });
  }
}

