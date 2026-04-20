import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';
import { cachedRedisGet as redisGet, cachedRedisSet as redisSet } from '@/app/lib/cached-redis';

const NS          = process.env.REDIS_NAMESPACE || 'default';
const CACHE_KEY   = `${NS}:fno-movers`;
const CACHE_TTL   = 90; // 90s — matches UI poll interval

function isWeekend() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay(); // 0 = Sun, 6 = Sat in IST
  return day === 0 || day === 6;
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

    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite API not configured', gainers: [], losers: [] });
    }

    const instrumentKeys = FNO_STOCKS.map(s => `NSE:${s}`);
    const ohlcData = await dp.getOHLC(instrumentKeys);

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
    const gainers = movers.slice(0, 7);
    const losers  = movers.slice(-7).reverse();

    const response = { gainers, losers, timestamp: new Date().toISOString() };
    await redisSet(CACHE_KEY, response, CACHE_TTL);
    return NextResponse.json(response);

  } catch (error) {
    console.error('fno-movers error:', error.message);
    return NextResponse.json({ error: 'Internal server error', gainers: [], losers: [] });
  }
}
