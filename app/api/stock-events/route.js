import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';

// GET /api/stock-events?symbol=RELIANCE&days=30
// Returns upcoming corporate events for a stock symbol.
// Caches per symbol for 4 hours.

const NS  = 'tv';
const TTL = 4 * 3600;

const UA_NSE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getISTToday() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
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

// NSE uses DD-MMM-YYYY (e.g. "26-JUL-2023") in corporate actions
// and DD-MM-YYYY in event-calendar API
function parseNSEDate(raw) {
  if (!raw || raw === '-') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const MONTHS = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };
  const p = raw.split('-');
  if (p.length === 3 && isNaN(p[1])) {
    // DD-MMM-YYYY
    const m = MONTHS[p[1]?.toUpperCase()];
    if (!m) return null;
    return `${p[2]}-${m}-${p[0].padStart(2, '0')}`;
  }
  if (p.length === 3) {
    // DD-MM-YYYY
    return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  }
  return null;
}

function daysAway(iso, today) {
  return Math.round((new Date(iso + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
}

function dateLabel(iso, today) {
  const d = daysAway(iso, today);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d < 0)  return `${Math.abs(d)}d ago`;
  const [, m, day] = iso.split('-');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1];
  return `${parseInt(day)} ${mon}`;
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

  const page = await fetch('https://www.nseindia.com/companies-listing/corporate-filings-actions', {
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

// ─── NSE corporate actions ────────────────────────────────────────────────────

async function fetchCorporateActions(cookies, symbol) {
  const url = `https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA_NSE,
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-actions',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookies,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`NSE corp-actions ${res.status}`);
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error('NSE_SESSION_REQUIRED');
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : (data?.data ?? []);
}

// ─── NSE event-calendar (filtered by symbol) ──────────────────────────────────

async function fetchEventCalendar(cookies, fromISO, toISO, symbol) {
  const url = `https://www.nseindia.com/api/event-calendar?from=${isoToNSE(fromISO)}&to=${isoToNSE(toISO)}`;
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
  const all  = Array.isArray(data) ? data : [];
  return all.filter(ev => (ev.symbol || '').toUpperCase() === symbol.toUpperCase());
}

// ─── Event categorisation ─────────────────────────────────────────────────────

function categoriseAction(purpose, subject) {
  const text = `${purpose} ${subject}`.toLowerCase();
  if (/result|quarterly|earnings|annual result|financial result/.test(text)) return 'result';
  if (/dividend/.test(text)) return 'dividend';
  if (/bonus/.test(text))    return 'bonus';
  if (/split|sub-divis/.test(text)) return 'split';
  if (/rights/.test(text))   return 'rights';
  if (/buy.?back|buyback/.test(text)) return 'buyback';
  if (/board/.test(text))    return 'board_meeting';
  if (/agm|annual general/.test(text)) return 'agm';
  return 'other';
}

const EVENT_LABELS = {
  result:       'Results',
  dividend:     'Dividend',
  bonus:        'Bonus',
  split:        'Stock Split',
  rights:       'Rights Issue',
  buyback:      'Buyback',
  board_meeting:'Board Meeting',
  agm:          'AGM',
  other:        'Corporate Action',
};

const EVENT_URGENCY = {
  result: 'high', dividend: 'medium', bonus: 'medium', split: 'medium',
  rights: 'medium', buyback: 'low', board_meeting: 'low', agm: 'low', other: 'low',
};

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol   = (searchParams.get('symbol') || '').toUpperCase().trim();
  const days     = Math.min(90,  Math.max(7,  parseInt(searchParams.get('days')     || '30', 10)));
  const lookback = Math.min(365, Math.max(7,  parseInt(searchParams.get('lookback') || '30', 10)));
  const refresh  = searchParams.get('refresh') === '1';

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const today    = getISTToday();
  const toDate   = addDays(today, days);
  const fromDate = addDays(today, -lookback);

  const cacheKey = `${NS}:stock-events:${symbol}:${today}:lb${lookback}`;

  if (!refresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return NextResponse.json({ ...parsed, cached: true });
    }
  }

  try {
    const cookies = await nseSession();

    // Fetch both in parallel
    const [corpActions, calendarEvents] = await Promise.all([
      fetchCorporateActions(cookies, symbol).catch(() => []),
      fetchEventCalendar(cookies, fromDate, toDate, symbol).catch(() => []),
    ]);

    const events = [];

    // Corporate actions — ex-date based
    for (const act of corpActions) {
      const dateRaw = act.exDate || act.bcStartDate || '';
      const dateISO = parseNSEDate(dateRaw);
      if (!dateISO) continue;

      const d = daysAway(dateISO, today);
      if (d < -lookback || d > days) continue;

      const purpose = (act.purpose || '').trim();
      const subject = (act.subject || '').trim();
      const type    = categoriseAction(purpose, subject);

      events.push({
        type,
        label:     EVENT_LABELS[type] || 'Action',
        urgency:   EVENT_URGENCY[type] || 'low',
        dateISO,
        dateLabel: dateLabel(dateISO, today),
        daysAway:  d,
        detail:    subject || purpose,
        source:    'corp-action',
        isPast:    d < 0,
      });
    }

    // Event-calendar (results, board meetings)
    for (const ev of calendarEvents) {
      const dateRaw = ev.date || ev.bm_date || '';
      const dateISO = parseNSEDate(dateRaw);
      if (!dateISO) continue;

      const d = daysAway(dateISO, today);
      if (d < -lookback || d > days) continue;

      const purpose = (ev.purpose || ev.bm_desc || '').trim();
      const type    = categoriseAction(purpose, '');

      // Skip duplicates already in corp-actions for same date+type
      const dup = events.find(e => e.dateISO === dateISO && e.type === type);
      if (dup) continue;

      events.push({
        type,
        label:     EVENT_LABELS[type] || 'Event',
        urgency:   EVENT_URGENCY[type] || 'low',
        dateISO,
        dateLabel: dateLabel(dateISO, today),
        daysAway:  d,
        detail:    purpose,
        source:    'event-calendar',
        isPast:    d < 0,
      });
    }

    // Sort by date
    events.sort((a, b) => a.dateISO.localeCompare(b.dateISO));

    // Upcoming only (not past) for the warning logic consumers care about
    const upcoming = events.filter(e => !e.isPast);
    const nearest  = upcoming[0] ?? null;

    const payload = {
      symbol,
      events,
      upcoming,
      nearest,
      count:    events.length,
      fromDate,
      toDate,
      today,
    };

    await redis.set(cacheKey, JSON.stringify(payload), { ex: TTL });
    return NextResponse.json({ ...payload, cached: false });

  } catch (err) {
    console.error(`[stock-events] ${symbol}:`, err.message);
    const stale = await redis.get(cacheKey);
    if (stale) {
      const parsed = typeof stale === 'string' ? JSON.parse(stale) : stale;
      return NextResponse.json({ ...parsed, cached: true, stale: true });
    }
    return NextResponse.json({
      symbol, events: [], upcoming: [], nearest: null,
      count: 0, today, error: err.message,
    });
  }
}
