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

    // 1. Group trades by order_id to avoid multiple brokerage charges and overwriting split taxes
    const ordersMap = {};
    trades.forEach(t => {
      const oid = t.order_id || `${date}_${t.tradingsymbol}`;
      if (!ordersMap[oid]) {
        ordersMap[oid] = { ...t, quantity: 0, total_value: 0 };
      }
      const q = Math.abs(parseFloat(t.quantity || 0));
      const p = parseFloat(t.average_price || t.price || 0);
      ordersMap[oid].quantity += q;
      ordersMap[oid].total_value += (q * p);
    });

    // 2. Map back to array and ensure correct price (weighted average)
    const groupedOrders = Object.values(ordersMap).map(o => ({
      ...o,
      price: o.total_value / o.quantity
    }));

    // 3. Fetch exact charges for each unique order from Kite
    const chargesData = await broker.getOrderCharges(groupedOrders);

    // 4. Map charges back and update DB
    for (let i = 0; i < groupedOrders.length; i++) {
      const order = groupedOrders[i];
      const chargeInfo = chargesData[i]?.charges;
      if (!chargeInfo) continue;

      const safeNum = (v) => {
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
      };

      const total = safeNum(chargeInfo.total);
      const brokerage = safeNum(chargeInfo.brokerage);
      
      // Use the total - brokerage logic to ensure we catch every single tax/levy
      let otherCharges = Math.max(0, total - brokerage);

      // Add DP Charges for CNC Sells (approx 15.93)
      if (order.product === 'CNC' && order.transaction_type === 'SELL') {
        otherCharges += 15.93;
      }

      console.log(`[journal-charges] ${order.tradingsymbol}: total=${total}, brokerage=${brokerage}, others=${otherCharges.toFixed(2)}`);

      const dbTradeId = order.order_id || `${date}_${order.tradingsymbol}`;
      await sql`
        INSERT INTO journal_trades (trade_id, date, symbol, brokerage, other_charges, updated_at)
        VALUES (${dbTradeId}, ${date}, ${order.tradingsymbol}, ${brokerage}, ${otherCharges}, now())
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
