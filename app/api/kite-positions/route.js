import { NextResponse } from 'next/server';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 555 && mins <= 930; // 9:15 to 15:30
}

export async function GET() {
  try {
    const { apiKey, accessToken } = await getKiteCredentials();

    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'Kite not connected', positions: [] });
    }

    // Fetch positions
    const res = await fetch('https://api.kite.trade/portfolio/positions', {
      headers: {
        'Authorization': `token ${apiKey}:${accessToken}`,
        'X-Kite-Version': '3',
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Kite positions error:', errorText);
      return NextResponse.json({ success: false, error: 'Failed to fetch positions', positions: [] });
    }

    const data = await res.json();

    if (data.status !== 'success') {
      return NextResponse.json({ success: false, error: data.message || 'Unknown error', positions: [] });
    }

    // Filter open positions (MIS or NFO, non-zero qty)
    const positions = (data.data.net || []).filter(p => {
      const isMIS = p.product === 'MIS';
      const isNFO = p.exchange === 'NFO';
      const isOpen = (p.quantity || 0) !== 0;
      return (isMIS || isNFO) && isOpen;
    });

    if (positions.length === 0) {
      return NextResponse.json({ success: true, positions: [], livePrice: false });
    }

    // During market hours: enrich with live LTP in ONE batch call
    if (isMarketHours()) {
      try {
        const instruments = positions.map(p => `${p.exchange}:${p.tradingsymbol}`);
        const query = instruments.map(i => `i=${encodeURIComponent(i)}`).join('&');
        const ltpRes = await fetch(`https://api.kite.trade/quote/ltp?${query}`, {
          headers: {
            'Authorization': `token ${apiKey}:${accessToken}`,
            'X-Kite-Version': '3',
          },
        });

        if (ltpRes.ok) {
          const ltpData = await ltpRes.json();
          const ltpMap = ltpData.data || {};

          positions.forEach(p => {
            const key = `${p.exchange}:${p.tradingsymbol}`;
            const live = ltpMap[key]?.last_price;
            if (live != null) {
              p.last_price = live;
              p.pnl = (live - (p.average_price || 0)) * p.quantity;
              p.live_price = true;
            }
          });

          return NextResponse.json({ success: true, positions, livePrice: true });
        }
      } catch (ltpErr) {
        console.error('LTP enrichment failed:', ltpErr.message);
      }
    }

    return NextResponse.json({ success: true, positions, livePrice: false });

  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', positions: [] }, { status: 500 });
  }
}