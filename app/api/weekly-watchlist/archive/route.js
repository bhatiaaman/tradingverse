import { NextResponse } from 'next/server';
import { sql } from '@/app/lib/db';
import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const WATCHLIST_KEY = `${NS}:weekly-watchlist`;
const MAX_WEEKS     = 12; // rolling 3-month display cap (older rows kept in DB)

// ── Redis helper (read-only — live watchlist is still in Redis) ───────────────
async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
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
  const [year, wPart] = isoWeekKey.split('-W');
  const weekNo = parseInt(wPart, 10);
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

// Derive the ISO week key for the week the stocks are FOR (from fridayCloseDate).
// Stocks analysed on Friday's close are "for" the following Mon–Fri week.
function getTargetWeekKey(watchlistData) {
  const allStocks = [
    ...(watchlistData.aiResearch      ?? []),
    ...(watchlistData.expertsResearch ?? []),
    ...(watchlistData.chartink        ?? []),
  ];
  const dates = allStocks.map(s => s.fridayCloseDate).filter(Boolean).sort();
  if (!dates.length) return getISOWeekKey();

  const friday     = new Date(dates[dates.length - 1]);
  const nextMonday = new Date(Date.UTC(
    friday.getUTCFullYear(),
    friday.getUTCMonth(),
    friday.getUTCDate() + 3,
  ));
  return getISOWeekKey(nextMonday);
}

// ── GET /api/weekly-watchlist/archive ─────────────────────────────────────────
// ?week=2026-W17  → load that week's snapshot
// (no params)     → return index of saved weeks with labels
export async function GET(request) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get('week');

  try {
    if (weekParam) {
      const rows = await sql`
        SELECT week_key, week_label, snapshot
        FROM weekly_watchlist_archive
        WHERE week_key = ${weekParam}
        LIMIT 1
      `;
      if (!rows.length) return NextResponse.json({ error: 'Week not found' }, { status: 404 });
      const row = rows[0];
      return NextResponse.json({
        week:     row.week_key,
        label:    row.week_label ?? getWeekLabel(row.week_key),
        snapshot: row.snapshot,
      });
    }

    // Return index — most recent MAX_WEEKS entries
    const rows = await sql`
      SELECT week_key, week_label
      FROM weekly_watchlist_archive
      ORDER BY saved_at DESC
      LIMIT ${MAX_WEEKS}
    `;
    const index  = rows.map(r => r.week_key);
    const labels = Object.fromEntries(rows.map(r => [r.week_key, r.week_label ?? getWeekLabel(r.week_key)]));
    return NextResponse.json({ index, labels });

  } catch (err) {
    console.error('[archive GET]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── POST /api/weekly-watchlist/archive ────────────────────────────────────────
// Snapshots the current live watchlist under the week the stocks are FOR
// (derived from fridayCloseDate), not the current calendar week.
export async function POST(request) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    let body = {};
    try {
      body = await request.json();
    } catch {}

    const current = await redisGet(WATCHLIST_KEY);
    if (!current) {
      return NextResponse.json({ error: 'No watchlist to archive' }, { status: 400 });
    }

    const weekKey   = getTargetWeekKey(current);
    const weekLabel = getWeekLabel(weekKey);
    const snapshot  = { 
      ...current, 
      savedAt: new Date().toISOString(), 
      weekLabel,
      archivedPerformance: body.performanceData || null 
    };

    await sql`
      INSERT INTO weekly_watchlist_archive (week_key, week_label, snapshot, saved_at, updated_at)
      VALUES (${weekKey}, ${weekLabel}, ${JSON.stringify(snapshot)}, now(), now())
      ON CONFLICT (week_key) DO UPDATE SET
        week_label = EXCLUDED.week_label,
        snapshot   = EXCLUDED.snapshot,
        updated_at = now()
    `;

    return NextResponse.json({ success: true, week: weekKey, label: weekLabel });

  } catch (err) {
    console.error('[archive POST]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
