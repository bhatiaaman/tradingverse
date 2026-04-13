import { NextResponse } from 'next/server';
import { requireSession, unauthorized } from '@/app/lib/session';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const TTL         = 86400; // 24h — auto-expires at midnight+

function todayIST() {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD in IST
}

function cacheKey() {
  return `${NS}:third-eye-log:${todayIST()}`;
}

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, ttl) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${key}/${encoded}?ex=${ttl}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch { /* silent */ }
}

// GET — restore today's log on page load
export async function GET(req) {
  if (!await requireSession()) return unauthorized();
  const entries = await redisGet(cacheKey());
  return NextResponse.json({ entries: entries ?? [], date: todayIST() });
}

// POST — save latest log (called after every new candle entry)
export async function POST(req) {
  if (!await requireSession()) return unauthorized();
  try {
    const { entries } = await req.json();
    if (!Array.isArray(entries)) return NextResponse.json({ error: 'entries must be array' }, { status: 400 });
    await redisSet(cacheKey(), entries.slice(0, 12), TTL);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
