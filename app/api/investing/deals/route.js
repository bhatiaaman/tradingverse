import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';

const NS = 'tv';
const TTL_TODAY_MARKET = 300;
const TTL_TODAY_AFTER  = 3600;

function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function extractCookies(response) {
  const all = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return all.map(c => c.split(';')[0]).filter(Boolean).join('; ');
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function nseSession() {
  const home = await fetch('https://www.nseindia.com/', {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    signal: AbortSignal.timeout(8000),
  });
  const c1 = extractCookies(home);

  const page = await fetch('https://www.nseindia.com/market-data/exchange-statistics', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Cookie': c1, 'Referer': 'https://www.nseindia.com/' },
    signal: AbortSignal.timeout(8000),
  });
  const c2 = extractCookies(page);

  const merged = {};
  for (const c of [...c1.split('; '), ...c2.split('; ')]) {
    const idx = c.indexOf('=');
    if (idx > 0) merged[c.slice(0, idx).trim()] = c.slice(idx + 1);
  }
  return Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('; ');
}

// block-deal endpoint returns block deal window data (pre-market & afternoon window)
// No client names — shows which stocks traded in the institutional block deal window
function normaliseBlockWindow(item) {
  return {
    type: 'block',
    symbol: item.symbol || '',
    name:   item.symbol || '',
    session: item.session || '',
    series:  item.series || 'BL',
    price:   Number(item.lastPrice || 0),
    prevClose: Number(item.previousClose || 0),
    change:  Number(item.change || 0),
    pchange: Number(item.pchange || 0),
    qty:     Number(item.totalTradedVolume || 0),
    value:   Number(item.totalTradedValue || 0),
    time:    item.lastUpdateTime || '',
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get('refresh') === '1';

  const today    = todayIST();
  const cacheKey = `${NS}:nse-deals-v2:${today}`;

  if (!refresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return NextResponse.json({ ...parsed, cached: true });
    }
  }

  try {
    const cookies = await nseSession();

    const res = await fetch('https://www.nseindia.com/api/block-deal', {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/market-data/exchange-statistics',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`NSE ${res.status}`);
    const body = await res.text();
    if (body.trim().startsWith('<')) throw new Error('NSE_SESSION_REQUIRED');
    const raw = JSON.parse(body);

    const deals = (raw?.data || []).map(normaliseBlockWindow)
      .sort((a, b) => b.value - a.value);

    const payload = {
      deals,
      date: today,
      timestamp: raw.timestamp || '',
      count: deals.length,
      bulkAvailable: false,   // NSE bulk-deals endpoint has been removed
      blockWindowOnly: true,  // only block deal window data available
      nseBlocked: false,
      cached: false,
    };

    const ttl = isMarketHours() ? TTL_TODAY_MARKET : TTL_TODAY_AFTER;
    await redis.set(cacheKey, JSON.stringify(payload), { ex: ttl });

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[deals] error:', err.message);
    return NextResponse.json({
      nseBlocked: true,
      deals: [],
      date: today,
      count: 0,
      bulkAvailable: false,
      blockWindowOnly: true,
      cached: false,
      error: err.message,
    });
  }
}
