import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';
import { sql } from '@/app/lib/db';

function computePositions(orders) {
  const map = {};
  for (const order of orders) {
    if (order.status !== 'COMPLETE') continue;
    const key = order.symbol;
    if (!map[key]) map[key] = { symbol: order.symbol, exchange: order.exchange, product: order.product, buys: [], sells: [] };
    if (order.transaction_type === 'BUY')  map[key].buys.push({ qty: order.quantity, price: Number(order.fill_price) });
    else                                   map[key].sells.push({ qty: order.quantity, price: Number(order.fill_price) });
  }
  return Object.values(map).map(data => {
    const totalBuy  = data.buys.reduce((s, x) => s + x.qty, 0);
    const totalSell = data.sells.reduce((s, x) => s + x.qty, 0);
    const avgBuy    = totalBuy  ? data.buys.reduce((s, x) => s + x.price * x.qty, 0)  / totalBuy  : 0;
    const avgSell   = totalSell ? data.sells.reduce((s, x) => s + x.price * x.qty, 0) / totalSell : 0;
    const matched   = Math.min(totalBuy, totalSell);
    return {
      symbol: data.symbol, exchange: data.exchange, product: data.product,
      netQty: totalBuy - totalSell,
      avgBuy:  totalBuy  ? parseFloat(avgBuy.toFixed(2))  : null,
      avgSell: totalSell ? parseFloat(avgSell.toFixed(2)) : null,
      totalBuyQty: totalBuy, totalSellQty: totalSell,
      realizedPnl: parseFloat(((avgSell - avgBuy) * matched).toFixed(2)),
    };
  }).filter(p => p.totalBuyQty > 0 || p.totalSellQty > 0);
}

export async function GET() {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  const rows = await sql`
    SELECT order_id, symbol, exchange, transaction_type, order_type,
           product, quantity, fill_price, status, ts, raw
    FROM orders
    WHERE paper = true
    ORDER BY ts DESC NULLS LAST
    LIMIT 500
  `;
  const orders = rows.map(r => ({
    order_id:         r.order_id,
    paper:            true,
    ts:               Number(r.ts),
    status:           r.status,
    symbol:           r.symbol,
    exchange:         r.exchange,
    transaction_type: r.transaction_type,
    order_type:       r.order_type,
    product:          r.product,
    quantity:         r.quantity,
    fill_price:       Number(r.fill_price),
    price:            r.raw?.price ?? null,
    trigger_price:    r.raw?.trigger_price ?? null,
  }));

  const positions        = computePositions(orders);
  const totalRealizedPnl = parseFloat(positions.reduce((s, p) => s + p.realizedPnl, 0).toFixed(2));
  return NextResponse.json({ orders, positions, totalRealizedPnl });
}

export async function DELETE() {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  await sql`DELETE FROM orders WHERE paper = true`;
  return NextResponse.json({ success: true });
}
