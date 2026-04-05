import { NextResponse } from 'next/server';
import { getBroker, getDataProvider } from '@/app/lib/providers';

// ── Expiry helpers ────────────────────────────────────────────────────────────

function getLastTuesdayOfMonth(year, month) {
  // month is 0-indexed. Returns UTC Date at midnight.
  // Nifty/BankNifty monthly expiry = last Tuesday of the month.
  let d = new Date(Date.UTC(year, month + 1, 0)); // last day of month
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function getNearestTuesdayExpiry() {
  // Work in IST (UTC+5:30) to get the correct date.
  // Nifty/BankNifty weekly expiry = every Tuesday.
  const istMs = Date.now() + 5.5 * 60 * 60 * 1000;
  const ist   = new Date(istMs);
  const day   = ist.getUTCDay(); // 0=Sun, 2=Tue
  let daysToTuesday = (2 - day + 7) % 7;

  // If today IS Tuesday but market is effectively closed (≥ 15:20 IST), roll to next week
  if (daysToTuesday === 0) {
    const h = ist.getUTCHours(), m = ist.getUTCMinutes();
    if (h > 15 || (h === 15 && m >= 20)) daysToTuesday = 7;
  }

  const expiryIst = new Date(istMs + daysToTuesday * 86400000);
  // Return as a UTC Date with the IST calendar date components (time = midnight UTC)
  return new Date(Date.UTC(
    expiryIst.getUTCFullYear(),
    expiryIst.getUTCMonth(),
    expiryIst.getUTCDate(),
  ));
}

// ── Symbol builder ────────────────────────────────────────────────────────────

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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req) {
  try {
    const { niftyPrice, direction, qty, niftySl } = await req.json();

    if (!niftyPrice || !['bull', 'bear'].includes(direction)) {
      return NextResponse.json({ error: 'Missing or invalid niftyPrice / direction' }, { status: 400 });
    }

    const quantity = Math.max(65, parseInt(qty) || 65);

    const expiry     = getNearestTuesdayExpiry();
    const symbol     = buildNiftyKiteSymbol(niftyPrice, direction, expiry);
    const instrument = `NFO:${symbol}`;

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

    // ── Place entry order ─────────────────────────────────────────────────────
    const broker      = await getBroker();
    const entryOrder  = await broker.placeOrder('regular', {
      tradingsymbol:    symbol,
      exchange:         'NFO',
      transaction_type: 'BUY',
      order_type:       'LIMIT',
      product:          'MIS',
      quantity:         quantity,
      price:            entryLimit,
    });

    // ── Place SL order immediately after entry ────────────────────────────────
    // SL-LIMIT SELL: triggers when premium drops to slTrigger, exits at slLimit
    let slOrder = null;
    let slError = null;
    try {
      slOrder = await broker.placeOrder('regular', {
        tradingsymbol:    symbol,
        exchange:         'NFO',
        transaction_type: 'SELL',
        order_type:       'SL',
        product:          'MIS',
        quantity:         quantity,
        trigger_price:    slTrigger,
        price:            slLimit,
      });
    } catch (e) {
      // SL placement failure is non-fatal — entry still went through
      slError = e.message;
      console.error('[third-eye/place] SL order failed:', e.message);
    }

    return NextResponse.json({
      ok:         true,
      symbol,
      strike:     Math.round(niftyPrice / 50) * 50,
      optionType: direction === 'bull' ? 'CE' : 'PE',
      ltp,
      entryLimit,
      slTrigger,
      slLimit,
      niftySl:    niftySl ?? null,
      orderId:    entryOrder.order_id,
      slOrderId:  slOrder?.order_id ?? null,
      slError:    slError ?? null,
      expiry:     expiry.toISOString().split('T')[0],
    });

  } catch (err) {
    console.error('[third-eye/place]', err.message);
    return NextResponse.json({ error: err.message || 'Order placement failed' }, { status: 500 });
  }
}
