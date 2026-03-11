import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';

const NS = 'tv';
const TTL_TODAY_MARKET = 300;
const TTL_TODAY_AFTER  = 3600;
const TTL_HISTORICAL   = 86400;

function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function toNSEDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function daysAgo(n) {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function extractCookies(response) {
  const all = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return all.map(c => c.split(';')[0]).filter(Boolean).join('; ');
}

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

async function nseSession() {
  const home = await fetch('https://www.nseindia.com/', { headers: BASE_HEADERS });
  const homeCookies = extractCookies(home);

  const page = await fetch('https://www.nseindia.com/companies-listing/corporate-filings-insider-trading', {
    headers: { ...BASE_HEADERS, 'Cookie': homeCookies, 'Referer': 'https://www.nseindia.com/' },
  });
  const pageCookies = extractCookies(page);

  const merged = {};
  for (const c of [...homeCookies.split('; '), ...pageCookies.split('; ')]) {
    const [k, v] = c.split('=');
    if (k && v !== undefined) merged[k.trim()] = v;
  }
  return Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('; ');
}

function normaliseTransactionType(raw) {
  if (!raw) return 'UNKNOWN';
  const s = raw.trim().toUpperCase();
  if (s.includes('BUY') || s.includes('ACQUI') || s.includes('PURCH')) return 'BUY';
  if (s.includes('SELL') || s.includes('DISP')) return 'SELL';
  if (s.includes('PLEDGE')) return 'PLEDGE';
  if (s.includes('REVOK') || s.includes('INVOK')) return 'REVOKE';
  return raw.trim();
}

function normaliseInsider(item) {
  const secAcq  = Number(item.secAcq  || 0);
  const secSell = Number(item.secSell || 0);
  const secHeld = Number(item.noSecs  || item.secHeld || 0);
  const acqMode = normaliseTransactionType(item.tdpTransactionType || item.acqMode || '');

  return {
    symbol:    item.symbol || '',
    name:      item.company || item.companyName || '',
    person:    item.acqName || item.personName || '',
    category:  item.personCategory || item.acqCategory || '',
    txType:    acqMode,
    secAcq,
    secSell,
    secHeld,
    value:     Number(item.val || item.totAcqDisp || 0),
    dateTraded:  item.xDt   || item.tradingDate || '',
    dateFiled:   item.date  || item.filedDate || '',
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const refresh   = searchParams.get('refresh') === '1';
  const period    = searchParams.get('period') || 'week';
  const fromParam = searchParams.get('from');
  const toParam   = searchParams.get('to');

  const today = todayIST();
  let fromDate, toDate;

  if (fromParam && toParam) {
    fromDate = fromParam;
    toDate   = toParam;
  } else if (period === 'month') {
    fromDate = daysAgo(30);
    toDate   = today;
  } else {
    // default: 1 week
    fromDate = daysAgo(7);
    toDate   = today;
  }

  const isToday  = fromDate === today && toDate === today;
  const cacheKey = `${NS}:nse-insider:${fromDate}:${toDate}`;

  if (!refresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return NextResponse.json({ ...parsed, cached: true });
    }
  }

  try {
    const cookies = await nseSession();
    const dateParams = `from_date=${toNSEDate(fromDate)}&to_date=${toNSEDate(toDate)}`;
    const url = `https://www.nseindia.com/api/corporates-pit?index=equities&${dateParams}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-insider-trading',
        'Origin': 'https://www.nseindia.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Cookie': cookies,
      },
    });

    if (!res.ok) throw new Error(`NSE returned ${res.status}`);
    const body = await res.text();
    if (body.trim().startsWith('<')) throw new Error('NSE_SESSION_REQUIRED');
    const raw = JSON.parse(body);

    const trades = (raw?.data || raw || [])
      .map(normaliseInsider)
      .sort((a, b) => {
        const va = a.secAcq > 0 ? a.secAcq : a.secSell;
        const vb = b.secAcq > 0 ? b.secAcq : b.secSell;
        return vb - va;
      });

    const payload = { trades, fromDate, toDate, period, count: trades.length, cached: false };

    const ttl = isToday ? (isMarketHours() ? TTL_TODAY_MARKET : TTL_TODAY_AFTER) : TTL_HISTORICAL;
    await redis.set(cacheKey, JSON.stringify(payload), { ex: ttl });

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[insider] error:', err.message);
    return NextResponse.json({ nseBlocked: true, trades: [], fromDate, toDate, count: 0, cached: false, error: err.message });
  }
}
