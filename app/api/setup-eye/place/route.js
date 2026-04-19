import { NextResponse } from 'next/server';
import { getDataProvider, getBroker } from '@/app/lib/providers';
import { redis } from '@/app/lib/redis';
import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';

// ── VPS queue helpers (same as place-order) ───────────────────────────────────
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
  await redis.lpush(QUEUE_KEY, JSON.stringify({ orderId, ts: Date.now(), source: 'setup-eye', variety: 'regular', ...params }));

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

// ── Expiry helpers ────────────────────────────────────────────────────────────

// ── Expiry day helpers ────────────────────────────────────────────────────────
// Nifty/BankNifty: weekly = every Tuesday, monthly = last Tuesday of the month
// Sensex/Bankex:   weekly = every Thursday, monthly = last Thursday of the month
// (SEBI rationalisation effective September 2025)

function getLastWeekdayOfMonth(year, month, weekday) {
  // month is 0-indexed. weekday: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu …
  let d = new Date(Date.UTC(year, month + 1, 0)); // last day of month
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

// Kept for Nifty backward compat (calls new helper)
function getLastTuesdayOfMonth(year, month) {
  return getLastWeekdayOfMonth(year, month, 2);
}

function getNearestWeeklyExpiry(weekday) {
  // Work in IST (UTC+5:30) to get the correct date.
  const istMs = Date.now() + 5.5 * 60 * 60 * 1000;
  const ist   = new Date(istMs);
  const day   = ist.getUTCDay();
  let daysToExpiry = (weekday - day + 7) % 7;

  // If today IS the expiry day but market is effectively closed (≥ 15:20 IST), roll to next week
  if (daysToExpiry === 0) {
    const h = ist.getUTCHours(), m = ist.getUTCMinutes();
    if (h > 15 || (h === 15 && m >= 20)) daysToExpiry = 7;
  }

  const expiryIst = new Date(istMs + daysToExpiry * 86400000);
  return new Date(Date.UTC(
    expiryIst.getUTCFullYear(),
    expiryIst.getUTCMonth(),
    expiryIst.getUTCDate(),
  ));
}

function getNearestTuesdayExpiry()  { return getNearestWeeklyExpiry(2); } // Nifty
function getNearestThursdayExpiry() { return getNearestWeeklyExpiry(4); } // Sensex

// ── Symbol builders ───────────────────────────────────────────────────────────

// Kite weekly format : NIFTY25317{STRIKE}CE  (YY + single-char month + DD + STRIKE + type)
// Kite monthly format: NIFTY25MAR{STRIKE}CE  (YY + 3-letter month + STRIKE + type)
// Monthly = last Tuesday of that month (Nifty/BankNifty).
// Month codes for weekly: 1-9 for Jan-Sep, O=Oct, N=Nov, D=Dec

const WEEKLY_MONTH_CODES  = '123456789OND'; // index 0=Jan … 11=Dec
const MONTHLY_MONTH_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function buildNiftyKiteSymbol(niftyPrice, direction, expiry) {
  const strike  = Math.round(niftyPrice / 50) * 50;
  const optType = direction === 'bull' ? 'CE' : 'PE';
  const year    = expiry.getUTCFullYear();
  const month   = expiry.getUTCMonth();   // 0-indexed
  const day     = expiry.getUTCDate();
  const yy      = String(year).slice(-2);

  const lastThursday = getLastTuesdayOfMonth(year, month);
  const isMonthly    = lastThursday.getUTCDate() === day;

  if (isMonthly) {
    return `NIFTY${yy}${MONTHLY_MONTH_NAMES[month]}${strike}${optType}`;
  } else {
    const mCode = WEEKLY_MONTH_CODES[month];
    const dd    = String(day).padStart(2, '0');
    return `NIFTY${yy}${mCode}${dd}${strike}${optType}`;
  }
}

// Sensex weekly + monthly options on BFO (effective Sep 2025: expiry = every Thursday).
// Weekly format : SENSEX25417{STRIKE}CE  (YY + single-char month + DD + STRIKE + type)
// Monthly format: SENSEX25APR{STRIKE}CE  (YY + 3-letter month + STRIKE + type)
// Monthly = last Thursday of the month.
function buildSensexKiteSymbol(price, direction, expiry) {
  const strike  = Math.round(price / 100) * 100;
  const optType = direction === 'bull' ? 'CE' : 'PE';
  const year    = expiry.getUTCFullYear();
  const month   = expiry.getUTCMonth();
  const day     = expiry.getUTCDate();
  const yy      = String(year).slice(-2);

  const lastThursday = getLastWeekdayOfMonth(year, month, 4);
  const isMonthly    = lastThursday.getUTCDate() === day;

  if (isMonthly) {
    return `SENSEX${yy}${MONTHLY_MONTH_NAMES[month]}${strike}${optType}`;
  } else {
    const mCode = WEEKLY_MONTH_CODES[month];
    const dd    = String(day).padStart(2, '0');
    return `SENSEX${yy}${mCode}${dd}${strike}${optType}`;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  try {
    const { niftyPrice, direction, qty, niftySl, underlying: rawUnderlying } = await req.json();
    const underlying = rawUnderlying === 'SENSEX' ? 'SENSEX' : 'NIFTY';

    if (!niftyPrice || !['bull', 'bear'].includes(direction)) {
      return NextResponse.json({ error: 'Missing or invalid niftyPrice / direction' }, { status: 400 });
    }

    // Lot size defaults: NIFTY=65, SENSEX=10
    const minQty   = underlying === 'SENSEX' ? 10 : 65;
    const quantity = Math.max(minQty, parseInt(qty) || minQty);

    let symbol, instrument;
    if (underlying === 'SENSEX') {
      const expiry = getNearestThursdayExpiry();
      symbol     = buildSensexKiteSymbol(niftyPrice, direction, expiry);
      instrument = `BFO:${symbol}`;
    } else {
      const expiry = getNearestTuesdayExpiry();
      symbol     = buildNiftyKiteSymbol(niftyPrice, direction, expiry);
      instrument = `NFO:${symbol}`;
    }
    const optExchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';

    // ── Fetch option LTP ──────────────────────────────────────────────────────
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
      return NextResponse.json({ error: `No price found for ${symbol} — symbol may not exist yet` }, { status: 404 });
    }

    // Entry: LIMIT at LTP + ₹2 (aggressive limit — ensures fill, acts like market)
    const entryLimit = parseFloat((ltp + 2).toFixed(1));

    // SL: derived from S21's Nifty structure SL level
    // nifty_sl_distance × ATM delta (≈0.5) = premium drop at SL
    // Fallback: 40% of premium if no Nifty SL passed
    let slTrigger;
    if (niftySl && Math.abs(niftyPrice - niftySl) > 0) {
      const niftySlDist  = Math.abs(niftyPrice - niftySl);
      const premiumDrop  = niftySlDist * 0.5; // ATM delta ≈ 0.5
      slTrigger = parseFloat(Math.max(ltp - premiumDrop, ltp * 0.30).toFixed(1)); // floor at 70% loss
    } else {
      slTrigger = parseFloat((ltp * 0.60).toFixed(1)); // fallback: 40% loss
    }
    const slLimit = parseFloat((slTrigger - 2).toFixed(1));

    // ── Entry order → VPS queue ───────────────────────────────────────────────
    const entryResult = await pushAndPoll({
      tradingsymbol: symbol, exchange: optExchange,
      transaction_type: 'BUY', order_type: 'LIMIT',
      product: 'MIS', quantity, price: entryLimit,
    });

    if (!entryResult.ok) {
      return NextResponse.json({
        ok: false, symbol, underlying, ltp, entryLimit,
        error: entryResult.error,
        orderId: entryResult.orderId,
      }, { status: entryResult.timeout ? 202 : 400 });
    }

    const kiteEntryId = entryResult.kiteOrderId;

    // ── Poll Kite fill confirmation before placing SL ─────────────────────────
    let filled  = false;
    let slError = null;
    let slKiteId = null;
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
            ok: false, symbol, ltp, entryLimit,
            error: `Entry ${entry.status}: ${entry.status_message ?? ''}`,
            orderId: entryResult.orderId, kiteOrderId: kiteEntryId,
          }, { status: 400 });
        }
      } catch { /* keep polling */ }
    }

    const strikeStep = underlying === 'SENSEX' ? 100 : 50;
    if (!filled) {
      return NextResponse.json({
        ok: true, symbol, underlying,
        strike: Math.round(niftyPrice / strikeStep) * strikeStep,
        optionType: direction === 'bull' ? 'CE' : 'PE',
        ltp, entryLimit, slTrigger, slLimit, niftySl: niftySl ?? null,
        orderId: entryResult.orderId, kiteOrderId: kiteEntryId,
        slOrderId: null,
        slError: 'Entry not filled in 10s — SL not placed. Set manually in Kite.',
        expiry: expiry.toISOString().split('T')[0],
      });
    }

    // ── SL order → VPS queue (only after fill confirmed) ─────────────────────
    try {
      const slResult = await pushAndPoll({
        tradingsymbol: symbol, exchange: optExchange,
        transaction_type: 'SELL', order_type: 'SL',
        product: 'MIS', quantity,
        trigger_price: slTrigger, price: slLimit,
      });
      if (slResult.ok) slKiteId = slResult.kiteOrderId;
      else slError = slResult.error;
    } catch (e) {
      slError = e.message;
    }

    return NextResponse.json({
      ok: true, symbol, underlying,
      strike:     Math.round(niftyPrice / strikeStep) * strikeStep,
      optionType: direction === 'bull' ? 'CE' : 'PE',
      ltp, entryLimit, slTrigger, slLimit, niftySl: niftySl ?? null,
      orderId:    entryResult.orderId, kiteOrderId: kiteEntryId,
      slOrderId:  slKiteId ?? null,
      slError:    slError ?? null,
    });

  } catch (err) {
    console.error('[setup-eye/place]', err.message);
    return NextResponse.json({ error: err.message || 'Order placement failed' }, { status: 500 });
  }
}
