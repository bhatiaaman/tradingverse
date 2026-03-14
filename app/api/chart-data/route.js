import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, ttl) {
  try {
    const enc = encodeURIComponent(JSON.stringify(value));
    const url = ttl ? `${REDIS_URL}/set/${key}/${enc}?ex=${ttl}` : `${REDIS_URL}/set/${key}/${enc}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch {}
}

// ── IST helpers ───────────────────────────────────────────────────────────────
const IST_OFFSET_MS = 330 * 60 * 1000;

function getIST(offsetDays = 0) {
  const now = new Date();
  const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000);
  if (offsetDays) ist.setDate(ist.getDate() + offsetDays);
  return ist;
}

function fmtDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

// ── Hardcoded index tokens ────────────────────────────────────────────────────
const INDEX_TOKENS = {
  NIFTY:     256265,
  BANKNIFTY: 260105,
  SENSEX:    265,
};

// ── Cache TTLs by interval ────────────────────────────────────────────────────
const CACHE_TTL = {
  '5minute':  60,
  '15minute': 120,
  '60minute': 300,
  'day':      3600,
};

// ── NSE EQ token map: fetch CSV, parse, cache in Redis for 24h ───────────────
async function getNSETokenMap(dp) {
  const cacheKey = `${NS}:nse-eq-tokens`;
  const cached   = await redisGet(cacheKey);
  if (cached) return cached;

  const csvText = await dp.getInstrumentsCSV('NSE');
  if (!csvText || typeof csvText !== 'string') throw new Error('NSE instruments CSV empty');

  const lines   = csvText.trim().split('\n');
  // columns: instrument_token(0), exchange_token(1), tradingsymbol(2), name(3),
  //          last_price(4), expiry(5), strike(6), tick_size(7), lot_size(8),
  //          instrument_type(9), segment(10), exchange(11)
  const tokenMap = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const token = parseInt(cols[0]);
    const sym   = cols[2]?.replace(/"/g, '').trim();
    const type  = cols[9]?.replace(/"/g, '').trim();
    if (type === 'EQ' && sym && token) {
      tokenMap[sym] = token;
    }
  }

  await redisSet(cacheKey, tokenMap, 86400);
  return tokenMap;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol   = (searchParams.get('symbol') || 'NIFTY').toUpperCase();
  const interval = searchParams.get('interval') || '5minute';
  const days     = parseInt(searchParams.get('days') || '0') || 0;

  const validIntervals = ['5minute', '15minute', '60minute', 'day'];
  if (!validIntervals.includes(interval)) {
    return NextResponse.json({ error: `Invalid interval. Use: ${validIntervals.join(', ')}` }, { status: 400 });
  }

  // ── Cache check ─────────────────────────────────────────────────────────────
  const cacheKey = `${NS}:chart-data:${symbol}:${interval}`;
  const cached   = await redisGet(cacheKey);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite disconnected' }, { status: 503 });
    }

    // ── Resolve token ─────────────────────────────────────────────────────────
    let token = INDEX_TOKENS[symbol];
    if (!token) {
      const tokenMap = await getNSETokenMap(dp);
      token = tokenMap[symbol];
    }
    if (!token) {
      return NextResponse.json({ error: `Token not found for symbol: ${symbol}` }, { status: 404 });
    }

    // ── Date range ───────────────────────────────────────────────────────────
    const toDate   = getIST();
    let   fromDate;

    if (interval === 'day') {
      fromDate = getIST(-(days || 365));
    } else if (interval === '60minute') {
      fromDate = getIST(-(days || 30));
    } else if (interval === '15minute') {
      fromDate = getIST(-(days || 5));
    } else {
      // 5minute — fetch enough days to cover intraday + fallback
      fromDate = getIST(-(days || 3));
    }

    const raw = await dp.getHistoricalData(token, interval, fmtDate(fromDate), fmtDate(toDate));
    if (!raw?.length) {
      return NextResponse.json({ error: 'No candle data returned' }, { status: 503 });
    }

    // ── Intraday session filter (5min / 15min) ───────────────────────────────
    let candles;
    if (interval === '5minute' || interval === '15minute') {
      const todayStr = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
      const todayCandles = raw.filter(c => {
        const ist     = new Date(new Date(c.date).getTime() + IST_OFFSET_MS);
        const dateStr = ist.toISOString().slice(0, 10);
        const mins    = ist.getUTCHours() * 60 + ist.getUTCMinutes();
        return dateStr === todayStr && mins >= 555 && mins <= 930; // 9:15–15:30
      });

      if (todayCandles.length >= 5) {
        candles = todayCandles;
      } else {
        // Weekend / holiday — return last 78 candles
        candles = raw.slice(-78);
      }
    } else {
      candles = raw;
    }

    const mapped = candles.map(c => ({
      time:   Math.floor(new Date(c.date).getTime() / 1000),
      open:   c.open,
      high:   c.high,
      low:    c.low,
      close:  c.close,
      volume: c.volume,
    }));

    const response = {
      candles:   mapped,
      symbol,
      interval,
      timestamp: new Date().toISOString(),
    };

    await redisSet(cacheKey, response, CACHE_TTL[interval]);
    return NextResponse.json(response);

  } catch (err) {
    const isAuth = /api_key|access_token|invalid.*token|unauthorized/i.test(err.message);
    if (!isAuth) console.error('[chart-data]', err.message);
    return NextResponse.json({ error: isAuth ? 'Kite disconnected' : err.message }, { status: 500 });
  }
}
