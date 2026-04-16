import { NextResponse } from 'next/server';
import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';
import { sql } from '@/app/lib/db';

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  const rows = await sql`
    SELECT id, order_id, paper, symbol, exchange, transaction_type,
           order_type, product, quantity, fill_price, status, ts, raw, created_at
    FROM orders
    WHERE paper = false
    ORDER BY ts DESC NULLS LAST
    LIMIT 200
  `;
  // Normalise shape to match what the frontend expects
  const entries = rows.map(r => ({
    ts:               Number(r.ts),
    status:           r.status,
    order_id:         r.order_id,
    symbol:           r.symbol,
    exchange:         r.exchange,
    transaction_type: r.transaction_type,
    order_type:       r.order_type,
    product:          r.product,
    quantity:         r.quantity,
    price:            r.raw?.price ?? null,
    trigger_price:    r.raw?.trigger_price ?? null,
    error:            r.raw?.error ?? null,
    ...r.raw,
  }));
  return NextResponse.json({ entries });
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  await sql`DELETE FROM orders WHERE paper = false`;
  return NextResponse.json({ success: true });
}
