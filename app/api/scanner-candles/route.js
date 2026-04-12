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
async function redisSet(key, value, ex) {
  try {
    const enc = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${key}/${enc}?ex=${ex}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch {}
}

const pad  = n => String(n).padStart(2, '0');
const fmt  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

function isMarketHours() {
  const now  = new Date(Date.now() + 5.5 * 3600000);
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const day  = now.getUTCDay();
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
}

const NSE_HOLIDAYS = [
  '2026-01-26','2026-03-03','2026-03-26','2026-03-31','2026-04-03',
  '2026-04-14','2026-05-01','2026-05-28','2026-06-26','2026-09-14',
  '2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25',
];
const isHoliday   = d => NSE_HOLIDAYS.includes(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
const isTradingDay = d => d.getDay() >= 1 && d.getDay() <= 5 && !isHoliday(d);

function prevTradingDay(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  while (!isTradingDay(d)) d.setDate(d.getDate() - 1);
  return d;
}

// Get NSE EQ instrument token for a symbol — cached 24h
async function getToken(symbol, dp) {
  const cacheKey = `${NS}:nse-eq-tokens`;
  let tokenMap = await redisGet(cacheKey);
  if (!tokenMap) {
    const csvText = await dp.getInstrumentsCSV('NSE');
    if (!csvText) throw new Error('NSE instruments CSV empty');
    tokenMap = {};
    const lines = csvText.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const cols  = lines[i].split(',');
      const token = parseInt(cols[0]);
      const sym   = cols[2]?.replace(/"/g, '').trim();
      const type  = cols[9]?.replace(/"/g, '').trim();
      if (type === 'EQ' && sym && token) tokenMap[sym] = token;
    }
    await redisSet(cacheKey, tokenMap, 86400);
  }
  return tokenMap[symbol] ?? null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol   = (searchParams.get('symbol') || '').toUpperCase().trim();
  const interval = searchParams.get('interval') || '15minute';

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  // Map interval string to Kite interval
  const kiteInterval = interval.replace('min', 'minute').replace('minute', 'minute');

  // Cache: 3 min during market hours, 1 hour after close
  const cacheTTL = isMarketHours() ? 180 : 3600;
  const cacheKey = `${NS}:scanner-candles:${symbol}:${interval}`;
  const cached   = await redisGet(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const dp = await getDataProvider();

    // Token lookup
    const token = await getToken(symbol, dp);
    if (!token) return NextResponse.json({ error: `No token for ${symbol}` }, { status: 404 });

    // Date range: prev trading day 9:15 AM → today now (IST)
    const nowIST  = new Date(Date.now() + 5.5 * 3600000);
    const todayIST = new Date(nowIST);
    todayIST.setUTCHours(3, 45, 0, 0); // 9:15 AM IST = 03:45 UTC

    const prevDay = prevTradingDay(new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate()));
    const fromIST = new Date(prevDay);
    fromIST.setUTCHours(3, 45, 0, 0); // 9:15 AM IST

    // Format for Kite API (IST strings, not UTC)
    const fromStr = `${prevDay.getFullYear()}-${pad(prevDay.getMonth()+1)}-${pad(prevDay.getDate())} 09:15:00`;
    const toStr   = fmt(nowIST);

    const raw = await dp.getHistoricalData(token, kiteInterval, fromStr, toStr);
    if (!raw?.length) return NextResponse.json({ error: 'No candles returned', candles: [] });

    // Convert to { t, o, h, l, c, v }
    const candles = raw.map(c => ({
      t: Math.floor(new Date(c.date).getTime() / 1000),
      o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume,
    }));

    // Find prev day boundary — first candle on today's date (IST)
    const todayDateStr = `${nowIST.getFullYear()}-${pad(nowIST.getMonth()+1)}-${pad(nowIST.getDate())}`;
    const todayStartIdx = candles.findIndex(c => {
      const d = new Date((c.t + 5.5 * 3600) * 1000);
      const ds = `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
      return ds === todayDateStr;
    });

    // CDH/CDL from today's candles
    const todayCandles = todayStartIdx >= 0 ? candles.slice(todayStartIdx) : [];
    const cdh = todayCandles.length ? Math.max(...todayCandles.map(c => c.h)) : null;
    const cdl = todayCandles.length ? Math.min(...todayCandles.map(c => c.l)) : null;

    // PDH/PDL from prev day candles
    const prevCandles = todayStartIdx > 0 ? candles.slice(0, todayStartIdx) : [];
    const pdh = prevCandles.length ? Math.max(...prevCandles.map(c => c.h)) : null;
    const pdl = prevCandles.length ? Math.min(...prevCandles.map(c => c.l)) : null;

    const result = { candles, todayStartIdx, pdh, pdl, cdh, cdl, symbol, interval };
    await redisSet(cacheKey, result, cacheTTL);
    return NextResponse.json(result);

  } catch (err) {
    console.error('scanner-candles error:', err.message);
    return NextResponse.json({ error: err.message, candles: [] }, { status: 500 });
  }
}
