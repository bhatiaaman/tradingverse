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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function extractCookies(response) {
  const all = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return all.map(c => c.split(';')[0]).filter(Boolean).join('; ');
}

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

  const page = await fetch('https://www.nseindia.com/market-data/fii-dii-activity', {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,*/*',
      'Cookie': c1,
      'Referer': 'https://www.nseindia.com/',
    },
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

// Parse NSE date "20-Mar-2025" → Date object for sorting
function parseNseDate(str) {
  if (!str) return new Date(0);
  const months = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
  const [day, mon, year] = str.split('-');
  return new Date(parseInt(year), months[mon] ?? 0, parseInt(day));
}

function formatISODate(dateStr) {
  // "20-Mar-2025" → "2025-03-20"
  const d = parseNseDate(dateStr);
  return d.toISOString().slice(0, 10);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get('refresh') === '1';

  const today    = todayIST();
  const cacheKey = `${NS}:fii-dii:${today}`;

  if (!refresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return NextResponse.json({ ...parsed, cached: true });
    }
  }

  try {
    const cookies = await nseSession();

    const res = await fetch('https://www.nseindia.com/api/fiidiiTradeReact', {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/market-data/fii-dii-activity',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`NSE ${res.status}`);
    const body = await res.text();
    if (body.trim().startsWith('<')) throw new Error('NSE_SESSION_REQUIRED');
    const raw = JSON.parse(body);

    const arr = Array.isArray(raw) ? raw : (raw?.data || []);

    // Group by date — separate FII and DII
    const byDate = {};
    for (const item of arr) {
      const d = item.date || item.Date || '';
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d, fii: null, dii: null };
      const cat = (item.category || '').toUpperCase();
      const entry = {
        buy:  parseFloat(item.buyValue  || item.BuyValue  || 0),
        sell: parseFloat(item.sellValue || item.SellValue || 0),
        net:  parseFloat(item.netValue  || item.NetValue  || 0),
      };
      if (cat.includes('FII') || cat.includes('FPI')) {
        byDate[d].fii = entry;
      } else if (cat.includes('DII')) {
        byDate[d].dii = entry;
      }
    }

    // Sort descending by date, take last 30 days
    const data = Object.values(byDate)
      .sort((a, b) => parseNseDate(b.date) - parseNseDate(a.date))
      .slice(0, 30)
      .map(row => ({
        date:    row.date,
        isoDate: formatISODate(row.date),
        fii:     row.fii || { buy: 0, sell: 0, net: 0 },
        dii:     row.dii || { buy: 0, sell: 0, net: 0 },
      }));

    const payload = { data, date: today, nseBlocked: false, cached: false };
    const ttl = isMarketHours() ? TTL_MARKET : TTL_AFTER;
    await redis.set(cacheKey, JSON.stringify(payload), { ex: ttl });

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[fii-dii] error:', err.message);
    return NextResponse.json({
      nseBlocked: true,
      data: [],
      date: today,
      cached: false,
      error: err.message,
    });
  }
}
