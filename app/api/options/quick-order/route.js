import { NextResponse } from 'next/server';
import { getDataProvider, getBroker } from '@/app/lib/providers';
import { requireSession, unauthorized, forbidden } from '@/app/lib/session';
import { redis } from '@/app/lib/redis';

const QUEUE_KEY  = 'tradingverse:order_queue';
const STATUS_PFX = 'tradingverse:order_status:';
const DEDUP_PFX  = 'tradingverse:order_dedup:';
const NS         = process.env.REDIS_NAMESPACE || 'default';
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function roundToTick(v, tick = 0.05) {
  if (v == null || isNaN(v)) return null;
  return Math.round(v / tick) * tick;
}

function defaultBufferPts(ltp) {
  // Keep it simple + safe. Index options often tick fast; allow a slightly larger buffer.
  if (ltp == null) return 1;
  if (ltp < 25)  return 0.5;
  if (ltp < 80)  return 1;
  return 2;
}

async function redisGet(key) {
  try {
    // Use Upstash REST directly (same storage backing as option-meta cache).
    if (!REDIS_URL || !REDIS_TOKEN) return null;
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

function baseUrl(req) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function resolveTradingSymbol({ symbol, expiry, strike, type }) {
  // First try the cached strike->tradingsymbol map.
  const lookupKey = `${NS}:fno-name-lookup:${symbol}:${expiry}`;
  let lookup = await redisGet(lookupKey);
  if (lookup?.[`${strike}_${type}`]) return lookup[`${strike}_${type}`];

  // Fallback: ask option-meta to resolve (it will parse/cache NFO if needed).
  // This handles weekly vs monthly expiry symbols without requiring a prior page visit.
  return null;
}

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

// POST
// - Either: { tradingsymbol, exchange, qty, transaction_type }
// - Or:     { symbol, expiry, strike, type, exchange, qty, transaction_type }
// Plus:
// - entryOrderType: 'LIMIT' | 'SL' (default LIMIT)
// - entryLimitPrice: number (optional; auto-filled with buffer)
// - entryTriggerPrice: number (required for SL entry; optional if auto-filled)
export async function POST(req) {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const body = await req.json();
    const {
      tradingsymbol: tsIn,
      symbol,
      expiry,
      strike,
      type,
      exchange = 'NFO',
      qty,
      transaction_type,
      entryOrderType = 'LIMIT',
      entryLimitPrice,
      entryTriggerPrice,
    } = body ?? {};

    if (!['BUY', 'SELL'].includes(transaction_type)) {
      return NextResponse.json({ error: 'Invalid transaction_type' }, { status: 400 });
    }
    if (!['LIMIT', 'SL'].includes(String(entryOrderType).toUpperCase())) {
      return NextResponse.json({ error: 'Invalid entryOrderType (LIMIT|SL)' }, { status: 400 });
    }

    let resolvedTs = tsIn || (symbol && expiry && strike && type
      ? await resolveTradingSymbol({ symbol, expiry, strike, type })
      : null);

    if (!resolvedTs && symbol && expiry && strike && type) {
      try {
        const qs = new URLSearchParams({
          action: 'tradingsymbol',
          symbol: String(symbol).toUpperCase(),
          expiry: String(expiry).slice(0, 10),
          strike: String(strike),
          type: String(type).toUpperCase(),
          bust: '0',
        });
        const r = await fetch(`${baseUrl(req)}/api/option-meta?${qs.toString()}`, { cache: 'no-store' });
        const d = await r.json();
        if (r.ok && d?.tradingSymbol) resolvedTs = d.tradingSymbol;
      } catch { /* ignore */ }
    }

    if (!resolvedTs) {
      return NextResponse.json({ error: 'Could not resolve tradingsymbol for this expiry/strike. Try refreshing option-meta cache and retry.' }, { status: 404 });
    }

    const quantity   = Math.max(1, parseInt(qty) || 1);
    const tradingsymbol = resolvedTs;
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

    const isBuy = transaction_type === 'BUY';

    const bufPts = defaultBufferPts(ltp);
    const entryType = String(entryOrderType).toUpperCase();

    // Entry defaults:
    // LIMIT: BUY slightly above LTP, SELL slightly below.
    // SL (breakout): BUY trigger above LTP, SELL trigger below; limit a bit beyond trigger.
    const autoLimit = roundToTick(isBuy ? ltp + bufPts : ltp - bufPts);
    const autoTrig  = roundToTick(isBuy ? ltp + bufPts : ltp - bufPts);
    const autoSLim  = roundToTick(isBuy ? (autoTrig + bufPts) : (autoTrig - bufPts));

    const entryPrice = entryLimitPrice != null ? roundToTick(Number(entryLimitPrice)) : autoLimit;
    const trigPrice  = entryTriggerPrice != null ? roundToTick(Number(entryTriggerPrice)) : autoTrig;
    const slEntryPrice = entryPrice != null ? entryPrice : autoSLim;

    // Protective SL defaults (post-entry). Keep existing heuristic but tick-align.
    const slTrigger  = roundToTick(isBuy ? ltp * 0.60 : ltp * 1.40);
    const slLimit    = roundToTick(isBuy ? slTrigger - bufPts : slTrigger + bufPts);
    const slSide     = isBuy ? 'SELL' : 'BUY';

    // ── Entry order → VPS queue ───────────────────────────────────────────────
    const entryResult = await pushAndPoll({
      tradingsymbol, exchange,
      transaction_type, order_type: entryType,
      product: 'MIS', quantity,
      ...(entryType === 'LIMIT'
        ? { price: entryPrice }
        : { trigger_price: trigPrice, price: slEntryPrice }),
      variety: 'regular',
    });

    if (!entryResult.ok) {
      return NextResponse.json({
        ok: false,
        tradingsymbol,
        ltp,
        entry: { order_type: entryType, price: entryPrice, trigger_price: entryType === 'SL' ? trigPrice : null },
        slTrigger, slLimit,
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
        ok: true,
        tradingsymbol,
        ltp,
        entry: { order_type: entryType, price: entryPrice, trigger_price: entryType === 'SL' ? trigPrice : null },
        slTrigger, slLimit,
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
      ok: true,
      tradingsymbol,
      ltp,
      entry: { order_type: entryType, price: entryPrice, trigger_price: entryType === 'SL' ? trigPrice : null },
      slTrigger, slLimit,
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
