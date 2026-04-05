import { NextResponse } from 'next/server';
import { getDataProvider, getBroker } from '@/app/lib/providers';
import { requireSession, unauthorized, forbidden } from '@/app/lib/session';
import { redis } from '@/app/lib/redis';

const QUEUE_KEY  = 'tradingverse:order_queue';
const STATUS_PFX = 'tradingverse:order_status:';
const DEDUP_PFX  = 'tradingverse:order_dedup:';

function genOrderId() {
  return `tv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function pushAndPoll(params, timeoutMs = 10000) {
  const orderId   = genOrderId();
  const statusKey = `${STATUS_PFX}${orderId}`;
  await Promise.all([
    redis.set(`${DEDUP_PFX}${orderId}`, '1',      { ex: 30  }),
    redis.set(statusKey,                 'QUEUED', { ex: 600 }),
  ]);
  await redis.lpush(QUEUE_KEY, JSON.stringify({ orderId, ts: Date.now(), source: 'quick-order', ...params }));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await redis.get(statusKey);
    if (val && val !== 'QUEUED') {
      const colon  = val.indexOf(':');
      const status = colon === -1 ? val : val.slice(0, colon);
      const rest   = colon === -1 ? ''  : val.slice(colon + 1);
      return status === 'SUCCESS'
        ? { ok: true,  kiteOrderId: rest, orderId }
        : { ok: false, error: rest || 'Order failed', orderId };
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return { ok: false, error: 'Worker timeout — check Execution Log', orderId, timeout: true };
}

// POST { tradingsymbol, exchange, qty, transaction_type }
export async function POST(req) {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const { tradingsymbol, exchange = 'NFO', qty, transaction_type } = await req.json();

    if (!tradingsymbol || !['BUY', 'SELL'].includes(transaction_type)) {
      return NextResponse.json({ error: 'Missing tradingsymbol or invalid transaction_type' }, { status: 400 });
    }

    const quantity   = Math.max(1, parseInt(qty) || 1);
    const instrument = `${exchange}:${tradingsymbol}`;

    // ── Fetch LTP (data read — OK from Vercel) ────────────────────────────────
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite not connected — reconnect and retry' }, { status: 401 });
    }

    let ltp;
    try {
      const ltpData = await dp.getLTP(instrument);
      ltp = ltpData.data?.[instrument]?.last_price;
    } catch (e) {
      return NextResponse.json({ error: `LTP fetch failed: ${e.message}` }, { status: 502 });
    }

    if (!ltp) {
      return NextResponse.json({ error: `No price found for ${tradingsymbol}` }, { status: 404 });
    }

    const isBuy      = transaction_type === 'BUY';
    const entryLimit = parseFloat((isBuy ? ltp + 2 : ltp - 2).toFixed(1));
    const slTrigger  = parseFloat((isBuy ? ltp * 0.60 : ltp * 1.40).toFixed(1));
    const slLimit    = parseFloat((isBuy ? slTrigger - 2 : slTrigger + 2).toFixed(1));
    const slSide     = isBuy ? 'SELL' : 'BUY';

    // ── Entry order → VPS queue ───────────────────────────────────────────────
    const entryResult = await pushAndPoll({
      tradingsymbol, exchange,
      transaction_type, order_type: 'LIMIT',
      product: 'MIS', quantity, price: entryLimit,
      variety: 'regular',
    });

    if (!entryResult.ok) {
      return NextResponse.json({
        ok: false, ltp, entryLimit, slTrigger, slLimit,
        error: entryResult.error,
        orderId: entryResult.orderId,
      }, { status: entryResult.timeout ? 202 : 400 });
    }

    const kiteEntryId = entryResult.kiteOrderId;

    // ── Poll Kite fill confirmation (data read — OK from Vercel) ─────────────
    // LTP+2 is aggressive — usually fills in <1s, but wait up to 10s
    let filled  = false;
    let slResult = null;
    let slError  = null;
    const pollStart = Date.now();

    while (Date.now() - pollStart < 10000) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const broker = await getBroker();
        const orders = await broker.getOrders();
        const entry  = (orders.data ?? orders).find(o => o.order_id === kiteEntryId);
        if (entry?.status === 'COMPLETE') { filled = true; break; }
        if (entry?.status === 'REJECTED' || entry?.status === 'CANCELLED') {
          return NextResponse.json({
            ok: false, ltp, entryLimit, slTrigger,
            orderId: entryResult.orderId, kiteOrderId: kiteEntryId,
            error: `Entry ${entry.status}: ${entry.status_message ?? ''}`,
          }, { status: 400 });
        }
      } catch { /* ignore poll errors, keep trying */ }
    }

    if (!filled) {
      return NextResponse.json({
        ok: true, ltp, entryLimit, slTrigger, slLimit,
        orderId: entryResult.orderId, kiteOrderId: kiteEntryId,
        slOrderId: null,
        slError: 'Entry not filled in 10s — SL not placed. Set manually in Kite.',
      });
    }

    // ── SL order → VPS queue (only after fill confirmed) ─────────────────────
    try {
      slResult = await pushAndPoll({
        tradingsymbol, exchange,
        transaction_type: slSide, order_type: 'SL',
        product: 'MIS', quantity,
        trigger_price: slTrigger, price: slLimit,
        variety: 'regular',
      });
      if (!slResult.ok) slError = slResult.error;
    } catch (e) {
      slError = e.message;
    }

    return NextResponse.json({
      ok: true, ltp, entryLimit, slTrigger, slLimit,
      orderId:    entryResult.orderId,
      kiteOrderId: kiteEntryId,
      slOrderId:  slResult?.kiteOrderId ?? null,
      slError:    slError ?? null,
    });

  } catch (err) {
    console.error('[options/quick-order]', err.message);
    return NextResponse.json({ error: err.message || 'Order placement failed' }, { status: 500 });
  }
}
