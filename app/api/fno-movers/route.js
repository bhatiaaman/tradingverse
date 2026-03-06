import { NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const CACHE_KEY   = `${NS}:fno-movers`;
const CACHE_TTL   = 300; // 5 minutes

function isWeekend() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay(); // 0 = Sun, 6 = Sat in IST
  return day === 0 || day === 6;
}

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, exSeconds) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${key}/${encoded}?ex=${exSeconds}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch (e) { console.error('Redis set error:', e); }
}

// Curated list of liquid FnO stocks
const FNO_STOCKS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'SBIN', 'AXISBANK', 'KOTAKBANK', 'BHARTIARTL', 'LT',
  'TATAMOTORS', 'MARUTI', 'BAJFINANCE', 'BAJAJFINSV', 'HINDUNILVR',
  'ITC', 'WIPRO', 'HCLTECH', 'TECHM', 'ADANIENT',
  'ADANIPORTS', 'SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB',
  'TITAN', 'TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'COALINDIA',
  'ONGC', 'BPCL', 'NTPC', 'POWERGRID', 'GAIL',
  'M&M', 'EICHERMOT', 'HEROMOTOCO', 'INDUSINDBK', 'TATACONSUM',
  'APOLLOHOSP', 'DLF', 'GODREJPROP', 'VEDL', 'ULTRACEMCO',
  'ASIANPAINT', 'NESTLEIND', 'BRITANNIA', 'SHRIRAMFIN', 'TRENT',
];

export async function GET() {
  try {
    const cached = await redisGet(CACHE_KEY);

    // Weekend: never hit Kite — serve cached Friday data or empty
    if (isWeekend()) {
      if (cached) return NextResponse.json({ ...cached, fromCache: true, weekend: true });
      return NextResponse.json({ gainers: [], losers: [], weekend: true });
    }

    if (cached) return NextResponse.json({ ...cached, fromCache: true });

    const { apiKey, accessToken } = await getKiteCredentials();
    if (!apiKey || !accessToken) {
      return NextResponse.json({ error: 'Kite API not configured', gainers: [], losers: [] });
    }

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const instrumentKeys = FNO_STOCKS.map(s => `NSE:${s}`);
    const ohlcData = await kite.getOHLC(instrumentKeys);

    const movers = [];
    for (const symbol of FNO_STOCKS) {
      const data = ohlcData[`NSE:${symbol}`];
      if (!data) continue;
      const ltp       = data.last_price;
      const prevClose = data.ohlc?.close || ltp;
      if (!prevClose) continue;
      const change    = ltp - prevClose;
      const changePct = (change / prevClose) * 100;
      movers.push({ symbol, ltp, prevClose, change, changePct });
    }

    movers.sort((a, b) => b.changePct - a.changePct);
    const gainers = movers.slice(0, 5);
    const losers  = movers.slice(-5).reverse();

    const response = { gainers, losers, timestamp: new Date().toISOString() };
    await redisSet(CACHE_KEY, response, CACHE_TTL);
    return NextResponse.json(response);

  } catch (error) {
    console.error('fno-movers error:', error.message);
    return NextResponse.json({ error: 'Internal server error', gainers: [], losers: [] });
  }
}
