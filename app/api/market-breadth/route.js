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

const NIFTY_50_STOCKS = [
  'RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK',
  'HINDUNILVR','SBIN','BHARTIARTL','ITC','KOTAKBANK',
  'LT','AXISBANK','ASIANPAINT','MARUTI','HCLTECH',
  'SUNPHARMA','TITAN','BAJFINANCE','WIPRO','ULTRACEMCO',
  'NESTLEIND','NTPC','POWERGRID','M&M','TATAMOTORS',
  'TATASTEEL','ADANIENT','ADANIPORTS','TECHM','INDUSINDBK',
  'JSWSTEEL','HINDALCO','ONGC','BPCL','GRASIM',
  'DIVISLAB','DRREDDY','BRITANNIA','CIPLA','EICHERMOT',
  'COALINDIA','APOLLOHOSP','SBILIFE','TATACONSUM','BAJAJFINSV',
  'HEROMOTOCO','LTIM','SHRIRAMFIN','TRENT','BAJAJ-AUTO',
];

const CACHE_KEY = `${NS}:market-breadth`;
const CACHE_TTL = 60;

export async function GET() {
  try {
    const cached = await redisGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true });
    }

    const { apiKey, accessToken } = await getKiteCredentials();
    if (!apiKey || !accessToken) {
      return NextResponse.json({ advances: 0, declines: 0, unchanged: 0, ratio: '---', error: 'Kite API not configured' });
    }

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const instrumentKeys = NIFTY_50_STOCKS.map(symbol => `NSE:${symbol}`);
    const ohlcData = await kite.getOHLC(instrumentKeys);

    let advances = 0, declines = 0, unchanged = 0;

    for (const symbol of NIFTY_50_STOCKS) {
      const data = ohlcData[`NSE:${symbol}`];
      if (!data) continue;
      const lastPrice = data.last_price;
      const prevClose = data.ohlc?.close || lastPrice;
      if (lastPrice > prevClose) advances++;
      else if (lastPrice < prevClose) declines++;
      else unchanged++;
    }

    const total = advances + declines + unchanged;
    const advDeclineRatio = declines > 0 ? (advances / declines).toFixed(2) : advances.toString();

    const response = {
      advances, declines, unchanged, total,
      ratio: advDeclineRatio,
      display: `${advances}↑ ${declines}↓`,
      timestamp: new Date().toISOString(),
    };

    await redisSet(CACHE_KEY, response, CACHE_TTL);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching market breadth:', error.message);
    return NextResponse.json({ advances: 0, declines: 0, unchanged: 0, ratio: '---', error: error.message });
  }
}