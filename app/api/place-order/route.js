import { NextResponse } from 'next/server';
import { getBroker, getDataProvider } from '@/app/lib/providers';
import { orderLimiter, checkLimit } from '@/app/lib/rate-limit';
import { requireOwner, requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';
import { redis } from '@/app/lib/redis';
import { sql } from '@/app/lib/db';

// ─── Redis keys (queue + status only — logs moved to Neon) ────────────────────
const QUEUE_KEY  = 'tradingverse:order_queue';
const STATUS_PFX = 'tradingverse:order_status:';
const DEDUP_PFX  = 'tradingverse:order_dedup:';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genOrderId() {
  const hex = Math.random().toString(36).slice(2, 6);
  return `tv_${Date.now()}_${hex}`;
}

async function writeExecLog(entry) {
  try {
    await sql`INSERT INTO order_exec_log (ts, event, data) VALUES (${entry.ts ?? Date.now()}, ${entry.event}, ${JSON.stringify(entry)})`;
  } catch (e) {
    console.error('[place-order] exec log write failed:', e.message);
  }
}

async function writeOrderLog(entry) {
  try {
    await sql`
      INSERT INTO orders (order_id, paper, symbol, exchange, transaction_type, order_type, product, quantity, fill_price, status, ts, raw)
      VALUES (${entry.order_id ?? null}, false, ${entry.symbol}, ${entry.exchange},
              ${entry.transaction_type}, ${entry.order_type}, ${entry.product},
              ${entry.quantity}, ${entry.price ?? null}, ${entry.status},
              ${entry.ts}, ${JSON.stringify(entry)})
    `;
  } catch (e) {
    console.error('[place-order] order log write failed:', e.message);
  }
}

// Poll order_status:{orderId} until SUCCESS/FAILED/REJECTED or timeout.
// Returns { status, kiteOrderId?, error? }
async function pollStatus(orderId, timeoutMs = 12000) {
  const key      = `${STATUS_PFX}${orderId}`;
  const deadline = Date.now() + timeoutMs;
  const INTERVAL = 400; // ms between polls
  while (Date.now() < deadline) {
    const val = await redis.get(key);
    if (val && val !== 'QUEUED') return parseStatus(val);
    await new Promise(r => setTimeout(r, INTERVAL));
  }
  return { status: 'TIMEOUT' };
}

function parseStatus(val) {
  // val shape: "SUCCESS:{kiteOrderId}" | "FAILED:{msg}" | "REJECTED:{msg}"
  const colon = val.indexOf(':');
  if (colon === -1) return { status: val };
  const status = val.slice(0, colon);
  const rest   = val.slice(colon + 1);
  if (status === 'SUCCESS') return { status, kiteOrderId: rest };
  return { status, error: rest };
}

// ─── Market protection: SEBI-mandated non-zero value for API market orders ────
// Exchange-based defaults — 1% is a safe, conservative choice for liquid F&O
// and large-cap equities. Reject if price has moved more than 1% from LTP.
function getMarketProtection(exchange) {
  const ex = (exchange || '').toUpperCase();
  if (ex === 'NFO' || ex === 'BFO') return 1.0;  // F&O options/futures
  if (ex === 'NSE' || ex === 'BSE') return 1.0;  // equity
  if (ex === 'MCX')                 return 1.0;  // commodities
  return 1.0; // safe fallback
}

// ─── Validate and build order params ─────────────────────────────────────────
function buildOrderParams(body) {
  const {
    tradingsymbol, exchange = 'NSE', transaction_type, quantity,
    product = 'CNC', order_type = 'MARKET', price = null,
    trigger_price = null, validity = 'DAY', variety = 'regular',
    disclosed_quantity = 0, tag = '', source = 'unknown',
  } = body;

  if (!tradingsymbol)  throw Object.assign(new Error('Trading symbol is required'), { status: 400 });
  if (!transaction_type || !['BUY', 'SELL'].includes(transaction_type))
    throw Object.assign(new Error('Transaction type must be BUY or SELL'), { status: 400 });
  if (!quantity || quantity <= 0)
    throw Object.assign(new Error('Quantity must be a positive number'), { status: 400 });

  const parsedQty = parseInt(quantity, 10);
  if (isNaN(parsedQty) || parsedQty <= 0)
    throw Object.assign(new Error('Invalid quantity'), { status: 400 });

  const params = {
    tradingsymbol:    tradingsymbol.toUpperCase(),
    exchange:         exchange.toUpperCase(),
    transaction_type: transaction_type.toUpperCase(),
    quantity:         parsedQty,
    product:          product.toUpperCase(),
    order_type:       order_type.toUpperCase(),
    validity,
    variety,
  };
  if (order_type === 'MARKET') params.market_protection = getMarketProtection(exchange);
  if (order_type === 'LIMIT' && price) params.price = parseFloat(price);
  if (['SL', 'SL-M'].includes(order_type) && trigger_price) {
    const trigNum = Number(trigger_price);
    params.trigger_price = trigNum;
    if (price !== null && price !== undefined) {
      const priceNum = Number(price);
      params.price = priceNum;
      if (transaction_type === 'BUY'  && priceNum < trigNum)
        throw Object.assign(new Error('For SL/SL-M BUY orders, price must be ≥ trigger price.'), { status: 400 });
      if (transaction_type === 'SELL' && priceNum > trigNum)
        throw Object.assign(new Error('For SL/SL-M SELL orders, price must be ≤ trigger price.'), { status: 400 });
    }
  }
  if (disclosed_quantity > 0) {
    const dq = parseInt(disclosed_quantity, 10);
    if (!isNaN(dq) && dq > 0) params.disclosed_quantity = dq;
  }
  if (tag) params.tag = tag.replace(/[^a-zA-Z0-9 \-_.]/g, '').slice(0, 20);
  return { params, source };
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  const { session, error } = await requireSession();
  if (error) return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  const rl = await checkLimit(orderLimiter, request);
  if (rl.limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    // ── Safety gate: enforce server-side paper mode ────────────────────────────
    let activeBroker = 'kite';
    try {
      const rows = await sql`SELECT value FROM system_config WHERE key = 'active_broker'`;
      activeBroker = rows[0]?.value?.broker ?? 'kite';
    } catch { /* default kite */ }
    const isPaperMode = activeBroker === 'paper';

    if (isPaperMode) {
      body.paper = true; // force paper regardless of client flag
    }

    // ── Paper trade branch — direct execution, no queue ───────────────────────
    if (body.paper) {
      try {
        const { params } = buildOrderParams(body);
        let fillPrice = body.price ? parseFloat(body.price) : 0;
        if (!fillPrice || params.order_type === 'MARKET') {
          try {
            const dp      = await getDataProvider();
            const sym     = `${params.exchange}:${params.tradingsymbol}`;
            const ltpData = await dp.getLTP(sym);
            fillPrice = ltpData?.data?.[sym]?.last_price ?? fillPrice;
          } catch { /* keep fillPrice as-is */ }
        }
        const paperId = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await sql`
          INSERT INTO orders (order_id, paper, symbol, exchange, transaction_type, order_type, product, quantity, fill_price, status, ts, raw)
          VALUES (${paperId}, true, ${params.tradingsymbol}, ${params.exchange},
                  ${params.transaction_type}, ${params.order_type}, ${params.product},
                  ${params.quantity}, ${fillPrice}, 'COMPLETE', ${Date.now()},
                  ${{ price: params.price ?? null, trigger_price: params.trigger_price ?? null }})
        `;
        return NextResponse.json({
          success: true, paper: true, order_id: paperId, fill_price: fillPrice,
          message: `Paper ${params.transaction_type} executed at ₹${fillPrice}`,
        });
      } catch (e) {
        return NextResponse.json({ error: e.message || 'Paper order failed' }, { status: e.status ?? 500 });
      }
    }


    // ── Real order — queue via VPS worker ─────────────────────────────────────
    let params, source;
    try {
      ({ params, source } = buildOrderParams(body));
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
    }

    const orderId   = genOrderId();
    const dedupKey  = `${DEDUP_PFX}${orderId}`;
    const statusKey = `${STATUS_PFX}${orderId}`;
    const ts        = Date.now();

    // Write dedup key (30s) + initial QUEUED status (10min)
    await Promise.all([
      redis.set(dedupKey,  '1',       { ex: 30 }),
      redis.set(statusKey, 'QUEUED',  { ex: 600 }),
    ]);

    // Log RECEIVED
    await writeExecLog({
      event: 'RECEIVED', orderId, ts,
      symbol: params.tradingsymbol, exchange: params.exchange,
      transaction_type: params.transaction_type, order_type: params.order_type,
      product: params.product, quantity: params.quantity,
      price: params.price ?? null, trigger_price: params.trigger_price ?? null,
      source,
    });

    // Push to queue
    const payload = { orderId, ts, source, ...params };
    await redis.lpush(QUEUE_KEY, JSON.stringify(payload));

    // Poll for result
    const result = await pollStatus(orderId);

    if (result.status === 'SUCCESS') {
      await writeOrderLog({
        ts, status: 'success', order_id: result.kiteOrderId, orderId,
        symbol: params.tradingsymbol, exchange: params.exchange,
        transaction_type: params.transaction_type, order_type: params.order_type,
        product: params.product, quantity: params.quantity,
        price: params.price ?? null, trigger_price: params.trigger_price ?? null,
      });
      return NextResponse.json({
        success: true, order_id: result.kiteOrderId, orderId,
        message: `Order placed. Kite ID: ${result.kiteOrderId}`,
        details: params,
      });
    }

    if (result.status === 'TIMEOUT') {
      // Order is still in queue / being processed — return orderId so frontend can track
      return NextResponse.json({
        success: false, pending: true, orderId,
        error: 'Worker did not respond in time. Check Execution Log for status.',
      }, { status: 202 });
    }

    // FAILED or REJECTED
    const errMsg = result.error || 'Order failed';
    await writeOrderLog({
      ts, status: 'failed', order_id: null, orderId,
      symbol: params.tradingsymbol, exchange: params.exchange,
      transaction_type: params.transaction_type, order_type: params.order_type,
      product: params.product, quantity: params.quantity,
      price: params.price ?? null, trigger_price: params.trigger_price ?? null,
      error: errMsg,
    });
    return NextResponse.json({ success: false, error: errMsg, orderId }, { status: 400 });
  } catch (error) {
    console.error('[place-order] Fatal error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error: ' + error.message }, { status: 500 });
  }
}

// ─── GET handler (unchanged) ──────────────────────────────────────────────────
export async function GET(request) {
  const { session: getSession, error } = await requireSession();
  if (error) return serviceUnavailable(error);
  if (!getSession) return unauthorized();
  if (getSession.role !== 'admin') return forbidden();

  const broker = await getBroker();
  if (!broker.isConnected()) return NextResponse.json({ error: 'Kite API not configured' }, { status: 400 });

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'orders';
    let data;
    if (type === 'positions')  data = await broker.getPositions();
    else if (type === 'holdings') data = await broker.getHoldings();
    else                       data = await broker.getOrders();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching order data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
