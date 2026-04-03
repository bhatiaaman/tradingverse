import { NextResponse } from 'next/server';
import { requireSession, unauthorized, forbidden } from '@/app/lib/session';
import { redis } from '@/app/lib/redis';

const KEY = 'tradingverse:paper_orders';

function computePositions(orders) {
  const map = {};

  for (const order of orders) {
    if (order.status !== 'COMPLETE') continue;
    const key = order.tradingsymbol;
    if (!map[key]) {
      map[key] = {
        symbol: order.tradingsymbol,
        exchange: order.exchange,
        product: order.product,
        buys: [],
        sells: [],
        realizedPnl: 0,
      };
    }
    if (order.transaction_type === 'BUY') {
      map[key].buys.push({ qty: order.quantity, price: order.average_price });
    } else {
      map[key].sells.push({ qty: order.quantity, price: order.average_price });
    }
  }

  return Object.entries(map).map(([symbol, data]) => {
    const totalBuy = data.buys.reduce((s, x) => s + x.qty, 0);
    const totalSell = data.sells.reduce((s, x) => s + x.qty, 0);
    const netQty = totalBuy - totalSell;

    const avgBuy = totalBuy ? data.buys.reduce((s, x) => s + x.price * x.qty, 0) / totalBuy : 0;
    const avgSell = totalSell ? data.sells.reduce((s, x) => s + x.price * x.qty, 0) / totalSell : 0;

    const matchedQty = Math.min(totalBuy, totalSell);
    const realizedPnl = matchedQty > 0 ? (avgSell - avgBuy) * matchedQty : 0;

    return {
      symbol,
      exchange: data.exchange,
      product: data.product,
      netQty,
      avgBuy: totalBuy ? parseFloat(avgBuy.toFixed(2)) : null,
      avgSell: totalSell ? parseFloat(avgSell.toFixed(2)) : null,
      totalBuyQty: totalBuy,
      totalSellQty: totalSell,
      realizedPnl: parseFloat(realizedPnl.toFixed(2)),
    };
  }).filter(p => p.totalBuyQty > 0 || p.totalSellQty > 0);
}

export async function GET(request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const raw = await redis.lrange(KEY, 0, -1);
    const orders = raw.map(r => typeof r === 'string' ? JSON.parse(r) : r).reverse();
    const positions = computePositions(orders);
    const totalRealizedPnl = positions.reduce((s, p) => s + p.realizedPnl, 0);

    return NextResponse.json({
      orders,
      positions,
      totalRealizedPnl: parseFloat(totalRealizedPnl.toFixed(2)),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    await redis.del(KEY);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
