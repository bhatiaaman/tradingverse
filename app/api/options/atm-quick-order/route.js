import { NextResponse } from 'next/server';
import { getDataProvider, getBroker } from '@/app/lib/providers';
import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';
import { redis } from '@/app/lib/redis';

// ── VPS queue helpers ─────────────────────────────────────────────────────────
const QUEUE_KEY  = 'tradingverse:order_queue';
const STATUS_PFX = 'tradingverse:order_status:';
const DEDUP_PFX  = 'tradingverse:order_dedup:';
const NS         = process.env.REDIS_NAMESPACE || 'default';

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
  await redis.lpush(QUEUE_KEY, JSON.stringify({ orderId, ts: Date.now(), source: 'atm-quick', variety: 'regular', ...params }));

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

// ── Redis helpers ─────────────────────────────────────────────────────────────
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

// ── POST { symbol, price, optionType, qty } ───────────────────────────────────
// Resolves ATM tradingsymbol for the given index + places via VPS queue
export async function POST(req) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  // ── Paper mode safety gate ────────────────────────────────────────────────
  try {
    const activeBroker = (await redis.get('tradingverse:active_broker')) || 'kite';
    if (activeBroker === 'paper') {
      return NextResponse.json({
        error: '🧪 Paper mode is active — use the main order form which supports paper execution.',
        paperMode: true,
      }, { status: 403 });
    }
  } catch { /* if Redis fails, allow through */ }

  try {

    const { symbol, price, optionType, qty } = await req.json();

    if (!symbol || !price || !['CE', 'PE'].includes(optionType)) {
      return NextResponse.json({ error: 'symbol, price, optionType (CE/PE) required' }, { status: 400 });
    }

    // ── Resolve nearest expiry ────────────────────────────────────────────────
    const expiries = await redisGet(`${NS}:fno-expiries:${symbol}`);
    if (!expiries?.length) {
      return NextResponse.json({ error: `No expiry data for ${symbol} — option chain not loaded yet` }, { status: 404 });
    }

    // Pick nearest future expiry
    const today    = new Date().toISOString().split('T')[0];
    const expiry   = expiries.find(e => (e.date ?? e) >= today);
    if (!expiry) return NextResponse.json({ error: 'No upcoming expiry found' }, { status: 404 });
    const expiryDate = expiry.date ?? expiry;

    // ── Resolve ATM strike ────────────────────────────────────────────────────
    const STRIKE_STEPS = { NIFTY: 50, BANKNIFTY: 100, FINNIFTY: 50, MIDCPNIFTY: 25, SENSEX: 100, BANKEX: 100 };
    const step         = STRIKE_STEPS[symbol] ?? 50;
    const atmStrike    = Math.round(price / step) * step;

    // ── Resolve tradingsymbol from cache ──────────────────────────────────────
    const lookup = await redisGet(`${NS}:fno-name-lookup:${symbol}:${expiryDate}`);
    if (!lookup) {
      return NextResponse.json({ error: `Option chain not cached for ${symbol} ${expiryDate} — open options chart first` }, { status: 404 });
    }

    const tradingsymbol = lookup[`${atmStrike}_${optionType}`];
    if (!tradingsymbol) {
      return NextResponse.json({ error: `No ${optionType} found at strike ${atmStrike} for ${expiryDate}` }, { status: 404 });
    }

    // Look up the correct exchange (NFO for Nifty/BankNifty, BFO for Sensex/Bankex)
    const optExchange = (await redisGet(`${NS}:fno-exchange:${symbol}`)) ?? 'NFO';

    const lotSizeFallback = symbol === 'BANKNIFTY' ? 35 : symbol === 'SENSEX' ? 10 : 65;
    const lotSize = await redisGet(`${NS}:fno-lotsize:${symbol}`) ?? lotSizeFallback;
    const quantity = Math.max(lotSize, parseInt(qty) || lotSize);

    // ── Fetch LTP ─────────────────────────────────────────────────────────────
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite not connected' }, { status: 401 });
    }

    const instrument = `${optExchange}:${tradingsymbol}`;
    let ltp;
    try {
      const ltpData = await dp.getLTP(instrument);
      ltp = ltpData.data?.[instrument]?.last_price;
    } catch (e) {
      return NextResponse.json({ error: `LTP fetch failed: ${e.message}` }, { status: 502 });
    }
    if (!ltp) return NextResponse.json({ error: `No LTP for ${tradingsymbol}` }, { status: 404 });

    const entryLimit = parseFloat((ltp + 2).toFixed(1));
    const slTrigger  = parseFloat((ltp * 0.60).toFixed(1));
    const slLimit    = parseFloat((slTrigger - 2).toFixed(1));

    // ── Entry via queue ───────────────────────────────────────────────────────
    const entryResult = await pushAndPoll({
      tradingsymbol, exchange: optExchange,
      transaction_type: 'BUY', order_type: 'LIMIT',
      product: 'MIS', quantity, price: entryLimit,
    });

    if (!entryResult.ok) {
      return NextResponse.json({
        ok: false, tradingsymbol, atmStrike, ltp, entryLimit,
        error: entryResult.error, orderId: entryResult.orderId,
      }, { status: entryResult.timeout ? 202 : 400 });
    }

    // ── Poll for fill ─────────────────────────────────────────────────────────
    let filled = false;
    let slError = null, slKiteId = null;
    const pollStart = Date.now();

    while (Date.now() - pollStart < 10000) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const broker = await getBroker();
        const orders = await broker.getOrders();
        const entry  = (orders.data ?? orders).find(o => o.order_id === entryResult.kiteOrderId);
        if (entry?.status === 'COMPLETE') { filled = true; break; }
        if (entry?.status === 'REJECTED' || entry?.status === 'CANCELLED') {
          return NextResponse.json({
            ok: false, tradingsymbol, ltp, entryLimit,
            error: `Entry ${entry.status}: ${entry.status_message ?? ''}`,
            orderId: entryResult.orderId, kiteOrderId: entryResult.kiteOrderId,
          }, { status: 400 });
        }
      } catch { /* keep polling */ }
    }

    if (!filled) {
      return NextResponse.json({
        ok: true, tradingsymbol, atmStrike, expiryDate,
        ltp, entryLimit, slTrigger, slLimit,
        orderId: entryResult.orderId, kiteOrderId: entryResult.kiteOrderId,
        slOrderId: null, slError: 'Entry not filled in 10s — SL not placed. Set manually in Kite.',
      });
    }

    // ── SL via queue ──────────────────────────────────────────────────────────
    try {
      const slResult = await pushAndPoll({
        tradingsymbol, exchange: optExchange,
        transaction_type: 'SELL', order_type: 'SL',
        product: 'MIS', quantity,
        trigger_price: slTrigger, price: slLimit,
      });
      if (slResult.ok) slKiteId = slResult.kiteOrderId;
      else slError = slResult.error;
    } catch (e) { slError = e.message; }

    return NextResponse.json({
      ok: true, tradingsymbol, atmStrike, expiryDate,
      ltp, entryLimit, slTrigger, slLimit,
      orderId: entryResult.orderId, kiteOrderId: entryResult.kiteOrderId,
      slOrderId: slKiteId ?? null, slError: slError ?? null,
    });

  } catch (err) {
    console.error('[atm-quick-order]', err.message);
    return NextResponse.json({ error: err.message || 'Order failed' }, { status: 500 });
  }
}
