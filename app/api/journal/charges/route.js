import { NextResponse } from 'next/server';
import { sql } from '@/app/lib/db';
import { getBroker } from '@/app/lib/providers';
import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';

export async function POST(request) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const body = await request.json();
    const { date, trades } = body; // date + array of trades from client state

    if (!date || !trades || !trades.length) {
      return NextResponse.json({ error: 'Date and trades are required' }, { status: 400 });
    }

    const broker = await getBroker();
    if (!broker || !broker.isConnected()) {
      return NextResponse.json({ error: 'Broker not connected' }, { status: 502 });
    }

    // 1. Fetch exact charges for each trade from Kite
    const chargesData = await broker.getOrderCharges(trades);

    // 2. Map charges back to trade_id and update DB
    // Zerodha returns the charges in the SAME ORDER as the input array.
    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i];
      const chargeInfo = chargesData[i]?.charges;
      if (!chargeInfo) continue;

      const safeNum = (v) => {
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
      };

      const brokerage = safeNum(chargeInfo.brokerage);
      // Sum up EVERYTHING else from the charges object (STT, GST, SEBI, Stamp, etc)
      let otherCharges = 0;
      for (const [key, val] of Object.entries(chargeInfo)) {
        if (key !== 'brokerage' && key !== 'total' && typeof val === 'number') {
           otherCharges += val;
        } else if (key !== 'brokerage' && key !== 'total' && typeof val === 'string') {
           // Handle string numbers just in case
           const n = parseFloat(val);
           if (!isNaN(n)) otherCharges += n;
        }
      }

      console.log(`[journal-charges] ${trade.tradingsymbol}: brokerage=${brokerage}, others=${otherCharges.toFixed(2)}`);

      console.log(`[journal-charges] ${trade.tradingsymbol}: brokerage=${brokerage}, others=${otherCharges}`);

      // We use symbol-based ID if trade_id is missing, or specific trade identifier
      const tradeId = trade.order_id || `${date}_${trade.tradingsymbol}`;

      await sql`
        INSERT INTO journal_trades (trade_id, date, symbol, brokerage, other_charges, updated_at)
        VALUES (${tradeId}, ${date}, ${trade.tradingsymbol}, ${brokerage}, ${otherCharges}, now())
        ON CONFLICT (trade_id) DO UPDATE SET
          brokerage = EXCLUDED.brokerage,
          other_charges = EXCLUDED.other_charges,
          updated_at = EXCLUDED.updated_at
      `;
    }

    return NextResponse.json({ success: true, charges: chargesData });

  } catch (err) {
    console.error('[journal-charges] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
