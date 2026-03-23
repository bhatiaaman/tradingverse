import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS = process.env.REDIS_NAMESPACE || 'default';

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, exSeconds) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url = exSeconds
      ? `${REDIS_URL}/set/${key}/${encoded}?ex=${exSeconds}`
      : `${REDIS_URL}/set/${key}/${encoded}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch (e) { console.error('Redis set error:', e); }
}

const SYMBOLS = {
  NIFTY:        { token: 256265,  name: 'NIFTY 50',        exchange: 'NSE' },
  BANKNIFTY:    { token: 260105,  name: 'BANK NIFTY',      exchange: 'NSE' },
  NIFTYFUT:     { token: null,    name: 'NIFTY FUT',       exchange: 'NFO', futName: 'NIFTY' },
  BANKNIFTYFUT: { token: null,    name: 'BANKNIFTY FUT',   exchange: 'NFO', futName: 'BANKNIFTY' },
};

// Resolve near-month futures token from NFO instruments CSV.
// Cached in Redis for 6 hours (rolls automatically after expiry).
async function resolveFuturesToken(dp, futName) {
  const cacheKey = `${NS}:fut-token-${futName}`;
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  const csvText = await dp.getInstrumentsCSV('NFO');
  const lines   = csvText.trim().split('\n');
  const headers = lines[0].split(',');

  const tokenIdx  = headers.indexOf('instrument_token');
  const nameIdx   = headers.indexOf('name');
  const typeIdx   = headers.indexOf('instrument_type');
  const expiryIdx = headers.indexOf('expiry');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let best = null;
  for (let i = 1; i < lines.length; i++) {
    const cols   = lines[i].split(',');
    const name   = cols[nameIdx]?.replace(/"/g, '').trim();
    const type   = cols[typeIdx]?.replace(/"/g, '').trim();
    const expiry = cols[expiryIdx]?.replace(/"/g, '').trim();
    if (name !== futName || type !== 'FUT' || !expiry) continue;
    const expiryDate = new Date(expiry);
    if (expiryDate < today) continue;
    if (!best || expiryDate < new Date(best.expiry)) {
      best = { token: parseInt(cols[tokenIdx]), expiry };
    }
  }

  if (!best) return null;
  await redisSet(cacheKey, best.token, 6 * 3600);
  return best.token;
}

const INTERVALS = {
  '5minute':  '5minute',
  '15minute': '15minute',
  'day':      'day',
  'week':     'week',
};

const CACHE_TTL = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol   = searchParams.get('symbol')   || 'NIFTY';
  const interval = searchParams.get('interval') || '15minute';
  const days     = parseInt(searchParams.get('days') || '5');

  const symbolConfig = SYMBOLS[symbol.toUpperCase()];
  if (!symbolConfig) {
    return NextResponse.json({ candles: [], error: `Unknown symbol: ${symbol}. Supported: ${Object.keys(SYMBOLS).join(', ')}` });
  }

  const kiteInterval = INTERVALS[interval];
  if (!kiteInterval) {
    return NextResponse.json({ candles: [], error: `Unknown interval: ${interval}. Supported: ${Object.keys(INTERVALS).join(', ')}` });
  }

  // Helper to get IST date
  function getISTDate(offsetDays = 0) {
    // Get current UTC time, add 5.5 hours for IST
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (5.5 * 60 * 60 * 1000));
    if (offsetDays !== 0) ist.setDate(ist.getDate() + offsetDays);
    return ist;
  }

  try {
    const cacheKey = `${NS}:chart-${symbol}-${interval}-${days}`;
    const cached   = await redisGet(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true });
    }

    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ candles: [], error: 'Kite API not configured' });
    }

    // Resolve futures token dynamically if needed
    let token = symbolConfig.token;
    if (token === null && symbolConfig.futName) {
      token = await resolveFuturesToken(dp, symbolConfig.futName);
      if (!token) return NextResponse.json({ candles: [], error: `Could not resolve ${symbol} near-month futures token` });
    }

    // Use IST for all date calculations
    let toDate = getISTDate();
    let fromDate = getISTDate();

    if (interval === 'week') {
      fromDate.setDate(fromDate.getDate() - Math.max(days * 7, 365));
    } else if (interval === 'day') {
      fromDate.setDate(fromDate.getDate() - Math.max(days, 60));
    } else {
      fromDate.setDate(fromDate.getDate() - days);
    }

    const formatDate = (d) => {
      const pad = (n) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const historicalData = await dp.getHistoricalData(
      token, kiteInterval, formatDate(fromDate), formatDate(toDate)
    );

    if (!historicalData || historicalData.length === 0) {
      return NextResponse.json({ candles: [], error: 'No historical data available' });
    }

    const candles = historicalData.map(candle => ({
      time:   Math.floor(new Date(candle.date).getTime() / 1000),
      open:   candle.open,
      high:   candle.high,
      low:    candle.low,
      close:  candle.close,
      volume: candle.volume,
    }));

    const response = {
      candles,
      symbol:   symbolConfig.name,
      interval: kiteInterval,
      fromDate: fromDate.toISOString(),
      toDate:   toDate.toISOString(),
      timestamp: new Date().toISOString(),
    };

    await redisSet(cacheKey, response, CACHE_TTL);
    return NextResponse.json(response);

  } catch (error) {
    const isAuthError = /api_key|access_token|invalid.*token|unauthorized/i.test(error.message)
    if (!isAuthError) console.error(`Error fetching ${symbol} chart data:`, error.message)
    return NextResponse.json({ candles: [], error: isAuthError ? 'Kite disconnected' : error.message });
  }
}