import { NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

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
  NIFTY:     { token: 256265, name: 'NIFTY 50',   exchange: 'NSE' },
  BANKNIFTY: { token: 260105, name: 'BANK NIFTY', exchange: 'NSE' },
};

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

    const { apiKey, accessToken } = await getKiteCredentials();
    if (!apiKey || !accessToken) {
      return NextResponse.json({ candles: [], error: 'Kite API not configured' });
    }

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

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

    const historicalData = await kite.getHistoricalData(
      symbolConfig.token, kiteInterval, formatDate(fromDate), formatDate(toDate)
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
    console.error(`Error fetching ${symbol} chart data:`, error.message);
    return NextResponse.json({ candles: [], error: error.message });
  }
}