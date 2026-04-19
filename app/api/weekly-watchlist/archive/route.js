import { NextResponse } from 'next/server';
import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

const WATCHLIST_KEY   = `${NS}:weekly-watchlist`;
const ARCHIVE_INDEX   = `${NS}:weekly-watchlist:archive-index`;
const MAX_WEEKS       = 12; // rolling 3-month cap

// ── Redis helpers ──────────────────────────────────────────────────────────────
async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value) {
  try {
    await fetch(`${REDIS_URL}/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, JSON.stringify(value)]),
    });
  } catch (err) { console.error('Redis set error:', err); }
}

// ── Week utilities ─────────────────────────────────────────────────────────────
function getISOWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekLabel(isoWeekKey) {
  // Parse "2025-W16" → Mon/Fri dates
  const [year, wPart] = isoWeekKey.split('-W');
  const weekNo = parseInt(wPart, 10);
  // Jan 4 is always in week 1 per ISO
  const jan4 = new Date(Date.UTC(parseInt(year, 10), 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
  const mon = new Date(week1Mon);
  mon.setUTCDate(week1Mon.getUTCDate() + (weekNo - 1) * 7);
  const fri = new Date(mon);
  fri.setUTCDate(mon.getUTCDate() + 4);
  const fmt = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return `${fmt(mon)} – ${fmt(fri)} ${fri.getUTCFullYear()}`;
}

// ── GET /api/weekly-watchlist/archive
// ?week=2025-W16  → load that week's snapshot
// (no params)     → return index of saved weeks with labels
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get('week');

  if (weekParam) {
    // Load specific week's snapshot
    const snapshot = await redisGet(`${NS}:weekly-watchlist:archive:${weekParam}`);
    if (!snapshot) {
      return NextResponse.json({ error: 'Week not found' }, { status: 404 });
    }
    return NextResponse.json({ week: weekParam, label: getWeekLabel(weekParam), snapshot });
  }

  // Return index
  const index = await redisGet(ARCHIVE_INDEX) ?? [];
  const labels = {};
  index.forEach(k => { labels[k] = getWeekLabel(k); });
  return NextResponse.json({ index, labels });
}

// ── Derive the ISO week key for the week these stocks are FOR.
// Uses fridayCloseDate from the stock entries — the stocks are analysed on
// Friday's close and are "for" the following Mon–Fri week.
// Falls back to current calendar week if no fridayCloseDate is present.
function getTargetWeekKey(watchlistData) {
  const allStocks = [
    ...(watchlistData.aiResearch      ?? []),
    ...(watchlistData.expertsResearch ?? []),
    ...(watchlistData.chartink        ?? []),
  ];
  const dates = allStocks.map(s => s.fridayCloseDate).filter(Boolean).sort();
  if (!dates.length) return getISOWeekKey(); // fallback

  // friday = most recent fridayCloseDate; target week starts next Monday
  const friday     = new Date(dates[dates.length - 1]);
  const nextMonday = new Date(Date.UTC(
    friday.getUTCFullYear(),
    friday.getUTCMonth(),
    friday.getUTCDate() + 3, // Friday + 3 = Monday
  ));
  return getISOWeekKey(nextMonday);
}

// ── POST /api/weekly-watchlist/archive
// Snapshots the current live watchlist using the week the stocks are FOR
// (derived from fridayCloseDate), not the current calendar week.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST() {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    // Fetch current live watchlist
    const current = await redisGet(WATCHLIST_KEY);
    if (!current) {
      return NextResponse.json({ error: 'No watchlist to archive' }, { status: 400 });
    }

    // Use the week the stocks are FOR (from fridayCloseDate), not today's week
    const weekKey     = getTargetWeekKey(current);
    const calWeekKey  = getISOWeekKey(); // current calendar week
    const archiveKey  = `${NS}:weekly-watchlist:archive:${weekKey}`;

    // Save snapshot
    await redisSet(archiveKey, {
      ...current,
      savedAt:   new Date().toISOString(),
      weekLabel: getWeekLabel(weekKey),
    });

    // Update index (prepend, dedupe, cap at MAX_WEEKS)
    let index = await redisGet(ARCHIVE_INDEX) ?? [];

    // If the calendar-week key differs from the target-week key, remove the
    // stale calendar-week entry from the index (prevents ghost entries).
    if (calWeekKey !== weekKey) {
      index = index.filter(k => k !== calWeekKey);
    }

    index = [weekKey, ...index.filter(k => k !== weekKey)].slice(0, MAX_WEEKS);
    await redisSet(ARCHIVE_INDEX, index);

    return NextResponse.json({
      success: true,
      week:    weekKey,
      label:   getWeekLabel(weekKey),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
