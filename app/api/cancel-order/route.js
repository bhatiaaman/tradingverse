import { NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

export async function POST(request) {
  const { apiKey, accessToken } = await getKiteCredentials();
  if (!apiKey || !accessToken) {
    return NextResponse.json({ success: false, error: 'Kite not authenticated' }, { status: 401 });
  }

  try {
    const { order_id, variety = 'regular' } = await request.json();
    if (!order_id) {
      return NextResponse.json({ success: false, error: 'order_id required' }, { status: 400 });
    }

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const result = await kite.cancelOrder(variety, order_id);
    return NextResponse.json({ success: true, order_id: result.order_id });

  } catch (error) {
    console.error('Cancel order error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}