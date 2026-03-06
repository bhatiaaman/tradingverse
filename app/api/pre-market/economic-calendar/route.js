// app/api/pre-market/economic-calendar/route.js
// Fetches economic events from ForexFactory's free public JSON feed.
// No API key required.

import { NextResponse } from 'next/server';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const CACHE_KEY   = `${NS}:economic-calendar`;
const CACHE_TTL   = 30 * 60; // 30 minutes

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, {
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

// Currency → country display name
const CURRENCY_COUNTRY = {
  USD: 'US', EUR: 'Europe', GBP: 'UK', JPY: 'Japan',
  CNY: 'China', INR: 'India', AUD: 'Australia', CAD: 'Canada',
  NZD: 'New Zealand', CHF: 'Switzerland',
};

// ForexFactory impact → our labels
const IMPACT_MAP = {
  'High':   'HIGH',
  'Medium': 'MEDIUM',
  'Low':    'LOW',
  'Non-Economic': 'LOW',
};

// Currencies we care about (focus on market-relevant ones)
const RELEVANT_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR']);

async function fetchForexFactory() {
  const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`ForexFactory HTTP ${res.status}`);

  const events = await res.json();
  if (!Array.isArray(events)) throw new Error('Unexpected response format');
  return events;
}

function parseAndFilter(rawEvents, todayStr) {
  // Filter to today's events for relevant currencies, High/Medium impact only
  const today = new Date(todayStr + 'T00:00:00Z');
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  return rawEvents
    .filter(ev => {
      if (!ev.date) return false;
      const evDate = new Date(ev.date);
      // Keep only today's events
      if (evDate < today || evDate >= tomorrow) return false;
      // Keep relevant currencies
      if (!RELEVANT_CURRENCIES.has(ev.country)) return false;
      // Keep High and Medium impact only
      const impact = IMPACT_MAP[ev.impact] || 'LOW';
      if (impact === 'LOW') return false;
      return true;
    })
    .map(ev => {
      const dateObj = new Date(ev.date);
      // Convert to IST for display
      const istDate = new Date(dateObj.getTime() + 5.5 * 60 * 60 * 1000);
      const hh      = istDate.getUTCHours().toString().padStart(2, '0');
      const mm      = istDate.getUTCMinutes().toString().padStart(2, '0');
      const timeIST = `${hh}:${mm}`;

      const impact  = IMPACT_MAP[ev.impact] || 'LOW';
      const country = CURRENCY_COUNTRY[ev.country] || ev.country;

      return {
        time:     timeIST,
        event:    ev.title || 'Economic Event',
        impact,
        country,
        currency: ev.country,
        previous: ev.previous || null,
        forecast: ev.forecast || null,
        actual:   ev.actual   || null,
        _ts:      dateObj.getTime(),
      };
    })
    .sort((a, b) => a._ts - b._ts);
}

function enrichWithStatus(events) {
  const now    = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const currentMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

  return events.map(ev => {
    const [hh, mm]     = ev.time.split(':').map(Number);
    const eventMinutes = hh * 60 + mm;
    const minutesUntil = eventMinutes - currentMinutes;

    let status = 'UPCOMING';
    if (minutesUntil < 0)  status = 'COMPLETED';
    else if (minutesUntil < 30) status = 'SOON';

    return {
      ...ev,
      minutesUntil: minutesUntil > 0 ? minutesUntil : null,
      status,
    };
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country');
    const impact  = searchParams.get('impact');

    // Today's date in IST
    const now    = new Date();
    const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const todayStr = istNow.toISOString().split('T')[0]; // YYYY-MM-DD

    // Cache keyed by today's date so it auto-invalidates tomorrow
    const dateKey = `${CACHE_KEY}:${todayStr}`;
    const cached  = await redisGet(dateKey);
    let events = cached;

    if (!events) {
      try {
        const raw = await fetchForexFactory();
        events = parseAndFilter(raw, todayStr);
        await redisSet(dateKey, events, CACHE_TTL);
      } catch (err) {
        console.error('[calendar] ForexFactory fetch failed:', err.message);
        events = [];
      }
    }

    // Apply live status (COMPLETED / SOON / UPCOMING)
    let enriched = enrichWithStatus(events);

    // Apply filters
    if (country) enriched = enriched.filter(e => e.country === country);
    if (impact)  enriched = enriched.filter(e => e.impact  === impact);

    const summary = {
      total:     enriched.length,
      high:      enriched.filter(e => e.impact === 'HIGH').length,
      medium:    enriched.filter(e => e.impact === 'MEDIUM').length,
      low:       enriched.filter(e => e.impact === 'LOW').length,
      upcoming:  enriched.filter(e => e.status === 'UPCOMING' || e.status === 'SOON').length,
      completed: enriched.filter(e => e.status === 'COMPLETED').length,
    };

    const nextHighImpact = enriched.find(e => e.impact === 'HIGH' && e.status !== 'COMPLETED');

    return NextResponse.json({
      success: true,
      date:    todayStr,
      events:  enriched,
      summary,
      nextHighImpact,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Economic calendar error:', error);
    return NextResponse.json({
      success:   false,
      events:    [],
      summary:   { total: 0, high: 0, medium: 0, low: 0, upcoming: 0, completed: 0 },
      error:     error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// POST: manual event override (kept for future use)
export async function POST(request) {
  try {
    const { event } = await request.json();
    return NextResponse.json({ success: true, message: 'Event received', event });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
