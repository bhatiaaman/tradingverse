import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';
import { requireSession, unauthorized } from '@/app/lib/session';

export async function GET(request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const symbol   = searchParams.get('symbol')?.toUpperCase();
  const exchange = (searchParams.get('exchange') || 'NSE').toUpperCase();

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite not connected' }, { status: 400 });
    }

    const key     = `${exchange}:${symbol}`;
    const quotes  = await dp.getQuote([key]);
    const q       = quotes?.[key];

    if (!q) return NextResponse.json({ error: 'No data for symbol' }, { status: 404 });

    const rawBuy  = q.depth?.buy  ?? [];
    const rawSell = q.depth?.sell ?? [];

    // Normalise to 5 levels, fill missing with nulls
    const buy  = Array.from({ length: 5 }, (_, i) => rawBuy[i]  ? { price: rawBuy[i].price,  qty: rawBuy[i].quantity,  orders: rawBuy[i].orders  } : null);
    const sell = Array.from({ length: 5 }, (_, i) => rawSell[i] ? { price: rawSell[i].price, qty: rawSell[i].quantity, orders: rawSell[i].orders } : null);

    const bestBid  = buy[0]?.price  ?? null;
    const bestAsk  = sell[0]?.price ?? null;
    const spread   = (bestBid != null && bestAsk != null) ? parseFloat((bestAsk - bestBid).toFixed(2)) : null;
    const spreadPct = (spread != null && bestAsk) ? parseFloat(((spread / bestAsk) * 100).toFixed(2)) : null;

    const totalBuyQty  = buy.reduce((s, l)  => s + (l?.qty  ?? 0), 0);
    const totalSellQty = sell.reduce((s, l) => s + (l?.qty ?? 0), 0);
    const totalQty     = totalBuyQty + totalSellQty;
    const buyPct       = totalQty > 0 ? Math.round((totalBuyQty / totalQty) * 100) : 50;

    return NextResponse.json({
      symbol,
      exchange,
      lastPrice: q.last_price ?? null,
      bestBid,
      bestAsk,
      spread,
      spreadPct,
      buy,
      sell,
      totalBuyQty,
      totalSellQty,
      buyPct,
    });
  } catch (e) {
    console.error('depth fetch error:', e);
    return NextResponse.json({ error: 'Failed to fetch depth' }, { status: 500 });
  }
}
