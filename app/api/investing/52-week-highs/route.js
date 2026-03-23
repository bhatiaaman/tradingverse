import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';

const NS = 'tv';
const TTL_MARKET = 300;
const TTL_AFTER  = 3600;

function isMarketHours() {
  const ist  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-IN,en-GB;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-user': '?1',
  'sec-fetch-dest': 'document',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

function extractCookies(response) {
  const all = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return all.map(c => c.split(';')[0]).filter(Boolean).join('; ');
}

async function nseSession() {
  const home = await fetch('https://www.nseindia.com/', {
    headers: {
      ...COMMON_HEADERS,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(10000),
  });
  const c1 = extractCookies(home);

  const page = await fetch('https://www.nseindia.com/market-data/new-52-week-high-low', {
    headers: {
      ...COMMON_HEADERS,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Cookie': c1,
      'Referer': 'https://www.nseindia.com/',
    },
    signal: AbortSignal.timeout(10000),
  });
  const c2 = extractCookies(page);

  const merged = {};
  for (const c of [...c1.split('; '), ...c2.split('; ')]) {
    const idx = c.indexOf('=');
    if (idx > 0) merged[c.slice(0, idx).trim()] = c.slice(idx + 1);
  }
  return Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('; ');
}

function normaliseItem(item) {
  return {
    symbol:    item.symbol       || '',
    series:    item.series       || 'EQ',
    ltp:       parseFloat(item.ltp           || 0),
    change:    parseFloat(item.netPrice      || 0),
    volume:    parseInt(item.tradeVolume     || 0),
    high52w:   parseFloat(item['52wHigh']    || 0),
    low52w:    parseFloat(item['52wLow']     || 0),
    prevClose: parseFloat(item.previousClose || 0),
  };
}

async function fetchList(cookies, index, referer) {
  const url = `https://www.nseindia.com/api/live-analysis-variations?index=${index}`;
  const res = await fetch(url, {
    headers: {
      ...COMMON_HEADERS,
      'Accept': 'application/json, text/plain, */*',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'sec-fetch-site': 'same-origin',
      'Referer': referer,
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookies,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`NSE ${res.status} for ${index}`);
  const body = await res.text();
  if (body.trim().startsWith('<')) throw new Error('NSE_SESSION_REQUIRED');
  const raw = JSON.parse(body);
  const arr = Array.isArray(raw) ? raw : (raw?.data || raw?.highs || raw?.lows || []);
  return arr.map(normaliseItem);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get('refresh') === '1';

  const today    = todayIST();
  const cacheKey = `${NS}:52w-highs:${today}`;

  if (!refresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return NextResponse.json({ ...parsed, cached: true });
    }
  }

  try {
    const cookies = await nseSession();
    const referer = 'https://www.nseindia.com/market-data/new-52-week-high-low';

    const [highs, lows] = await Promise.all([
      fetchList(cookies, 'new52Week',    referer),
      fetchList(cookies, 'new52WeekLow', referer),
    ]);

    const payload = { highs, lows, date: today, nseBlocked: false, cached: false };
    const ttl = isMarketHours() ? TTL_MARKET : TTL_AFTER;
    await redis.set(cacheKey, JSON.stringify(payload), { ex: ttl });

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[52w-highs] error:', err.message);
    return NextResponse.json({
      nseBlocked: true,
      highs: [],
      lows:  [],
      date:  today,
      cached: false,
      error: err.message,
    });
  }
}
