import { NextResponse } from 'next/server';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50') || 50, 1), 200);

    const { apiKey, accessToken } = await getKiteCredentials();
    if (!apiKey || !accessToken) {
      return NextResponse.json({ success: false, error: 'Kite not authenticated' }, { status: 401 });
    }

    const kiteRes = await fetch('https://api.kite.trade/orders', {
      headers: {
        'Authorization': `token ${apiKey}:${accessToken}`,
        'X-Kite-Version': '3',
      },
    });

    if (!kiteRes.ok) {
      const err = await kiteRes.text();
      console.error('Kite orders error:', err);
      return NextResponse.json({ success: false, error: 'Failed to fetch orders' }, { status: kiteRes.status });
    }

    const data = await kiteRes.json();
    const orders = data.data || [];

    return NextResponse.json({
      success: true,
      orders: orders.slice(0, limit),
      total: orders.length,
    });

  } catch (error) {
    console.error('kite-orders error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}