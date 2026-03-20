import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';

const NS  = 'tv';
const TTL = 4 * 3600; // 4 hours

const UA_NSE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const UA_YF  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getISTToday() {
  const ist  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const yyyy = ist.getUTCFullYear();
  const mm   = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(ist.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoToNSE(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function parseNSEDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const months = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };
  const p = raw.split('-');
  if (p.length === 3) return `${p[2]}-${months[p[1]?.toUpperCase()] || '00'}-${p[0].padStart(2,'0')}`;
  return null;
}

function dateLabel(iso, today) {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  const [, m, d] = iso.split('-');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1];
  return `${parseInt(d)} ${mon}`;
}

function daysAway(iso, today) {
  return Math.round((new Date(iso + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
}

// India fiscal year Apr–Mar: infer which quarter the result announcement covers
function inferQuarter(iso) {
  const month = parseInt(iso.split('-')[1]);
  const year  = parseInt(iso.split('-')[0]);
  if (month >= 4 && month <= 6)   return `Q4 FY${String(year).slice(2)}`;
  if (month >= 7 && month <= 9)   return `Q1 FY${String(year + 1).slice(2)}`;
  if (month >= 10 && month <= 12) return `Q2 FY${String(year + 1).slice(2)}`;
  return `Q3 FY${String(year).slice(2)}`;
}

// ─── NSE session ──────────────────────────────────────────────────────────────

function extractCookies(res) {
  const all = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie') || ''];
  const merged = {};
  for (const c of all) {
    const part = c.split(';')[0];
    const idx  = part.indexOf('=');
    if (idx > 0) merged[part.slice(0, idx).trim()] = part.slice(idx + 1);
  }
  return Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function nseSession() {
  const home = await fetch('https://www.nseindia.com/', {
    headers: { 'User-Agent': UA_NSE, 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.5' },
    signal: AbortSignal.timeout(8000),
  });
  const c1 = extractCookies(home);

  const page = await fetch('https://www.nseindia.com/market-data/upcoming-results', {
    headers: { 'User-Agent': UA_NSE, 'Accept': 'text/html,*/*', 'Cookie': c1, 'Referer': 'https://www.nseindia.com/' },
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

// ─── NSE event-calendar ───────────────────────────────────────────────────────

async function fetchNSECalendar(cookies, fromNSE, toNSE) {
  const url = `https://www.nseindia.com/api/event-calendar?from=${fromNSE}&to=${toNSE}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA_NSE,
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.nseindia.com/market-data/upcoming-results',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookies,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`NSE event-calendar ${res.status}`);
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error('NSE_SESSION_REQUIRED');
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [];
}

// ─── Yahoo Finance batch quote ────────────────────────────────────────────────
// v7/finance/quote: single request for all symbols — no auth, no crumb needed
// Returns map: { [SYMBOL]: { lastEPS, epsEstimate, trailingPE, forwardPE } }

async function fetchYahooBatch(symbols) {
  if (!symbols.length) return {};
  const tickers = symbols.map(s => `${s}.NS`).join(',');
  const fields   = 'trailingPE,forwardPE,epsTrailingTwelveMonths,epsForward';
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers)}&fields=${fields}&crumb=`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers)}&fields=${fields}&crumb=`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA_YF,
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://finance.yahoo.com/',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const json    = await res.json();
      const results = json?.quoteResponse?.result || [];
      if (!results.length) continue;

      const map = {};
      for (const r of results) {
        const sym = (r.symbol || '').replace(/\.NS$/i, '');
        const lastEPS     = r.epsTrailingTwelveMonths ?? null;
        const epsEstimate = r.epsForward              ?? null;
        const trailingPE  = r.trailingPE              ?? null;
        const forwardPE   = r.forwardPE               ?? null;
        if (lastEPS !== null || epsEstimate !== null || trailingPE !== null) {
          map[sym] = { lastEPS, epsEstimate, trailingPE, forwardPE, lastPeriod: null };
        }
      }
      return map;
    } catch { /* try next URL */ }
  }
  return {};
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get('refresh') === '1';

  const today    = getISTToday();
  const cacheKey = `${NS}:earnings-calendar-v3:${today}`; // v3 — Yahoo Finance v7 batch

  if (!refresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return NextResponse.json({ ...parsed, cached: true });
    }
  }

  try {
    const cookies = await nseSession();

    const toDate    = addDays(today, 45);
    const rawEvents = await fetchNSECalendar(cookies, isoToNSE(today), isoToNSE(toDate));

    // Filter to result events only, normalise
    const resultEvents = rawEvents
      .map(ev => {
        const dateRaw = ev.date || ev.bm_date || '';
        const dateIso = parseNSEDate(dateRaw);
        if (!dateIso || dateIso < today || dateIso > toDate) return null;

        const purpose  = (ev.purpose || ev.bm_desc || '').trim();
        const isResult = /quarterly|result|earnings|financial result|annual result/i.test(purpose);
        if (!isResult) return null;

        return {
          symbol:     ev.symbol  || '',
          company:    ev.company || ev.comp || ev.symbol || '',
          dateIso,
          dateLabel:  dateLabel(dateIso, today),
          daysAway:   daysAway(dateIso, today),
          quarter:    inferQuarter(dateIso),
          purpose,
          type:       /annual/i.test(purpose) ? 'Annual' : 'Quarterly',
          lastEPS:     null,
          epsEstimate: null,
          lastPeriod:  null,
          trailingPE:  null,
          forwardPE:   null,
        };
      })
      .filter(Boolean)
      .filter((e, i, arr) => arr.findIndex(x => x.symbol === e.symbol && x.dateIso === e.dateIso) === i)
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    // Fetch EPS + P/E from Yahoo Finance — single batch request for all symbols
    const uniqueSymbols = [...new Set(resultEvents.map(e => e.symbol))];
    const yahooMap      = await fetchYahooBatch(uniqueSymbols);
    for (const ev of resultEvents) {
      const d = yahooMap[ev.symbol];
      if (d) {
        ev.lastEPS     = d.lastEPS;
        ev.epsEstimate = d.epsEstimate;
        ev.lastPeriod  = d.lastPeriod;
        ev.trailingPE  = d.trailingPE;
        ev.forwardPE   = d.forwardPE;
      }
    }

    const payload = {
      events:   resultEvents,
      count:    resultEvents.length,
      fromDate: today,
      toDate,
      date:     today,
      cached:   false,
    };

    await redis.set(cacheKey, JSON.stringify(payload), { ex: TTL });
    return NextResponse.json(payload);

  } catch (err) {
    console.error('[earnings-calendar] error:', err.message);
    const stale = await redis.get(cacheKey);
    if (stale) {
      const parsed = typeof stale === 'string' ? JSON.parse(stale) : stale;
      return NextResponse.json({ ...parsed, cached: true, stale: true });
    }
    return NextResponse.json({
      events: [], count: 0, date: getISTToday(),
      error: err.message, cached: false,
    });
  }
}
