// app/api/pre-market/economic-calendar/route.js
// India-first calendar: upcoming RBI dates + NSE results this week + USD macro

import { NextResponse } from 'next/server';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const CACHE_TTL   = 60 * 60; // 1 hour

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

// ─────────────────────────────────────────────────────────────────────
// RBI MPC Dates — announcement days (add new dates when RBI publishes)
// ─────────────────────────────────────────────────────────────────────
const RBI_DATES = [
  '2025-04-09', '2025-06-06', '2025-08-07', '2025-10-08', '2025-12-05',
  '2026-02-06', '2026-04-09', '2026-06-05', '2026-08-07', '2026-10-08', '2026-12-04',
];

// ─────────────────────────────────────────────────────────────────────
// NSE Board Meetings / Results (two-step session fetch)
// ─────────────────────────────────────────────────────────────────────
async function fetchNSEEvents(fromNSE, toNSE) {
  // fromNSE / toNSE: DD-MM-YYYY
  try {
    const sessionRes = await fetch('https://www.nseindia.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(6000),
    });
    const cookies = (sessionRes.headers.get('set-cookie') || '')
      .split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');

    const calRes = await fetch(
      `https://www.nseindia.com/api/event-calendar?from=${fromNSE}&to=${toNSE}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.nseindia.com/',
          'X-Requested-With': 'XMLHttpRequest',
          ...(cookies ? { Cookie: cookies } : {}),
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!calRes.ok) return [];
    const data = await calRes.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[calendar] NSE fetch failed:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────
// ForexFactory — USD/EUR High only (this week)
// ─────────────────────────────────────────────────────────────────────
async function fetchForexFactory(fromIso, toIso) {
  try {
    const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const events = await res.json();
    if (!Array.isArray(events)) return [];

    const from = new Date(fromIso + 'T00:00:00Z');
    const to   = new Date(toIso   + 'T23:59:59Z');

    return events
      .filter(ev => {
        if (!ev.date || !['USD', 'EUR'].includes(ev.country)) return false;
        if (ev.impact !== 'High') return false;
        const d = new Date(ev.date);
        return d >= from && d <= to;
      })
      .map(ev => {
        const d   = new Date(ev.date);
        const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
        const hh  = ist.getUTCHours().toString().padStart(2, '0');
        const mm  = ist.getUTCMinutes().toString().padStart(2, '0');
        const dd  = String(ist.getUTCDate()).padStart(2, '0');
        const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][ist.getUTCMonth()];
        return {
          dateLabel: `${dd} ${mon}`,
          dateIso:   ist.toISOString().slice(0, 10),
          time:      `${hh}:${mm}`,
          event:     ev.title,
          country:   ev.country === 'USD' ? 'US' : 'Europe',
          impact:    'HIGH',
          type:      'global',
          previous:  ev.previous || null,
          forecast:  ev.forecast || null,
          _ts:       d.getTime(),
        };
      })
      .sort((a, b) => a._ts - b._ts);
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function getISTToday() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const yyyy = ist.getUTCFullYear();
  const mm   = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(ist.getUTCDate()).padStart(2, '0');
  return { iso: `${yyyy}-${mm}-${dd}`, dd, mm: String(ist.getUTCMonth() + 1).padStart(2,'0'), yyyy };
}

function isoToNSE(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function parseNSEDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD-MON-YYYY
  const months = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };
  const p = raw.split('-');
  if (p.length === 3) return `${p[2]}-${months[p[1]?.toUpperCase()] || '00'}-${p[0].padStart(2,'0')}`;
  return null;
}

function dateLabel(iso, todayIso) {
  if (iso === todayIso) return 'Today';
  if (iso === addDays(todayIso, 1)) return 'Tomorrow';
  const [y, m, d] = iso.split('-');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1];
  return `${d} ${mon}`;
}

// ─────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const { iso } = getISTToday();
    const weekEnd  = addDays(iso, 6);
    const cacheKey = `${NS}:india-cal2:${iso}`;

    const cached = await redisGet(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });

    // 1. Upcoming RBI dates (next 2)
    const rbiUpcoming = RBI_DATES
      .filter(d => d >= iso)
      .slice(0, 2)
      .map(d => ({
        dateIso:   d,
        dateLabel: dateLabel(d, iso),
        time:      '10:00',
        event:     'RBI MPC Policy Decision',
        country:   'India',
        impact:    'HIGH',
        type:      'rbi',
      }));

    // 2. NSE results this week
    const nseRaw   = await fetchNSEEvents(isoToNSE(iso), isoToNSE(weekEnd));
    const nseEvents = nseRaw
      .map(ev => {
        const d    = parseNSEDate(ev.date || ev.bm_date || '');
        if (!d || d < iso || d > weekEnd) return null;
        const purpose = (ev.purpose || ev.bm_desc || '').trim();
        const isResult = /quarterly|result|earnings|financial|annual/i.test(purpose);
        return {
          dateIso:   d,
          dateLabel: dateLabel(d, iso),
          time:      '—',
          event:     purpose || 'Board Meeting',
          company:   ev.company || ev.comp || ev.symbol || '',
          symbol:    ev.symbol  || '',
          country:   'India',
          impact:    isResult ? 'HIGH' : 'MEDIUM',
          type:      isResult ? 'result' : 'board',
        };
      })
      .filter(Boolean)
      .filter((e, i, arr) => arr.findIndex(x => x.symbol === e.symbol && x.dateIso === e.dateIso) === i)
      .slice(0, 25);

    // 3. Global macro this week
    const globalEvents = await fetchForexFactory(iso, weekEnd);

    // Combine
    const allEvents = [...rbiUpcoming, ...nseEvents, ...globalEvents]
      .sort((a, b) => {
        if (a.dateIso !== b.dateIso) return a.dateIso.localeCompare(b.dateIso);
        return (a.time || '').localeCompare(b.time || '');
      });

    const payload = {
      success:      true,
      todayIso:     iso,
      weekEnd,
      allEvents,
      rbiCount:     rbiUpcoming.length,
      nseCount:     nseEvents.length,
      globalCount:  globalEvents.length,
      timestamp:    new Date().toISOString(),
    };

    await redisSet(cacheKey, payload, CACHE_TTL);
    return NextResponse.json(payload);

  } catch (error) {
    console.error('India calendar error:', error);
    return NextResponse.json({
      success: false, allEvents: [], rbiCount: 0, nseCount: 0, globalCount: 0,
      error: error.message,
    }, { status: 500 });
  }
}
