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

const pad = n => String(n).padStart(2, '0');

// All date logic works in IST (UTC+5:30).
// We shift epoch by +5.5h so UTC getters give IST values.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Returns an object with IST year/month/day/hour/min from an epoch ms
function toIST(epochMs) {
  const d = new Date(epochMs + IST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1,
    day:  d.getUTCDate(),     dow:   d.getUTCDay(),
    hour: d.getUTCHours(),    min:   d.getUTCMinutes(),
    dateStr: `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`,
  };
}

function isMarketHours() {
  const ist  = toIST(Date.now());
  const mins = ist.hour * 60 + ist.min;
  return ist.dow >= 1 && ist.dow <= 5 && mins >= 555 && mins <= 930;
}

const NSE_HOLIDAYS = [
  '2026-01-26','2026-03-03','2026-03-26','2026-03-31','2026-04-03',
  '2026-04-14','2026-05-01','2026-05-28','2026-06-26','2026-09-14',
  '2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25',
];
const isHoliday    = ist => NSE_HOLIDAYS.includes(ist.dateStr);
const isTradingIST = ist => ist.dow >= 1 && ist.dow <= 5 && !isHoliday(ist);

function prevTradingDayEpoch(epochMs) {
  let e = epochMs - 24 * 3600000;
  while (!isTradingIST(toIST(e))) e -= 24 * 3600000;
  return e;
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

  // Kite expects e.g. "15minute" — pass through as-is (frontend already sends that)
  const kiteInterval = interval;

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

    // Date range: prev trading day 9:15 AM IST → now IST
    const nowEpoch   = Date.now();
    const nowISTInfo = toIST(nowEpoch);

    // Previous trading day epoch
    const prevDayEpoch   = prevTradingDayEpoch(nowEpoch);
    const prevDayISTInfo = toIST(prevDayEpoch);

    // Format for Kite API: "YYYY-MM-DD HH:MM:SS" in IST
    const fromStr = `${prevDayISTInfo.dateStr} 09:15:00`;
    const toStr   = `${nowISTInfo.dateStr} ${pad(nowISTInfo.hour)}:${pad(nowISTInfo.min)}:00`;

    const raw = await dp.getHistoricalData(token, kiteInterval, fromStr, toStr);
    if (!raw?.length) return NextResponse.json({ error: 'No candles returned', candles: [] });

    // Convert to { t, o, h, l, c, v }
    const candles = raw.map(c => ({
      t: Math.floor(new Date(c.date).getTime() / 1000),
      o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume,
    }));

    // Find prev day boundary — first candle on today's IST date
    const todayDateStr  = nowISTInfo.dateStr;
    const todayStartIdx = candles.findIndex(c => toIST(c.t * 1000).dateStr === todayDateStr);

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
