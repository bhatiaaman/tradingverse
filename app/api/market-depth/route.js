import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const instrument = searchParams.get('instrument'); // e.g. "NSE:INFY" or "NFO:INFY26APR1260CE"
    if (!instrument) return NextResponse.json({ error: 'Missing instrument' }, { status: 400 });

    const dp = await getDataProvider();
    if (!dp.isConnected()) return NextResponse.json({ error: 'Kite not connected' }, { status: 401 });

    const data = await dp.getQuote([instrument]);
    const q = data?.data?.[instrument] ?? data?.[instrument];
    if (!q) return NextResponse.json({ error: 'No data' }, { status: 404 });

    return NextResponse.json({
      ltp:    q.last_price ?? null,
      volume: q.volume_traded ?? null,
      depth: {
        buy:  (q.depth?.buy  || []).slice(0, 5).map(l => ({ price: l.price, quantity: l.quantity, orders: l.orders })),
        sell: (q.depth?.sell || []).slice(0, 5).map(l => ({ price: l.price, quantity: l.quantity, orders: l.orders })),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
