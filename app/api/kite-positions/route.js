import { NextResponse } from 'next/server';
import { getBroker } from '@/app/lib/providers';
import { requireOwner, unauthorized } from '@/app/lib/session';

function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 555 && mins <= 930; // 9:15 to 15:30
}

export async function GET() {
  try {
    if (!await requireOwner()) return unauthorized();

    const broker = await getBroker();

    if (!broker.isConnected()) {
      return NextResponse.json({ success: false, kiteError: 'Kite not connected — please authenticate via /api/kite-config', positions: [] });
    }

    let data;
    try {
      data = await broker.getPositionsRaw();
    } catch (err) {
      console.error('Kite positions error:', err.message);
      const msg = err.message?.includes('Incorrect') || err.message?.includes('403')
        ? 'Kite session expired — please re-login to Zerodha'
        : 'Failed to fetch positions from Kite';
      return NextResponse.json({ success: false, kiteError: msg, positions: [] });
    }

    if (data.status !== 'success') {
      return NextResponse.json({ success: false, kiteError: data.message || 'Unknown Kite error', positions: [] });
    }

    // Show positions relevant to today's trading session:
    //   MIS  → always intraday, show if non-zero net qty
    //   NRML/CNC → could be old carry-forward; only show if Kite reports
    //              activity today (day_buy_quantity or day_sell_quantity > 0)
    const positions = (data.data.net || []).filter(p => {
      if ((p.quantity || 0) === 0) return false;          // squared off / empty
      if (p.product === 'MIS') return true;               // MIS = always intraday
      const dayActivity = (p.day_buy_quantity || 0) + (p.day_sell_quantity || 0);
      return dayActivity > 0;                              // NRML/CNC: today only
    });

    if (positions.length === 0) {
      return NextResponse.json({ success: true, positions: [], livePrice: false });
    }

    // During market hours: enrich with live LTP in ONE batch call
    if (isMarketHours()) {
      try {
        const instruments = positions.map(p => `${p.exchange}:${p.tradingsymbol}`);
        const ltpData = await broker.getLTP(instruments);
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
      } catch (ltpErr) {
        console.error('LTP enrichment failed:', ltpErr.message);
      }
    }

    return NextResponse.json({ success: true, positions, livePrice: false });

  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json({ success: false, kiteError: 'Internal server error', positions: [] }, { status: 500 });
  }
}

