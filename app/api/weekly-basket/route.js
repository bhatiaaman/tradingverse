import { NextResponse } from 'next/server';
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

function getISOWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
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
  } catch (err) { console.error('[weekly-basket] Redis set error:', err); }
}

function sanitizeTier(arr, limit) {
  if (!Array.isArray(arr)) return [];
  return arr.map(s => String(s).toUpperCase().trim()).filter(Boolean).slice(0, limit);
}

export async function GET() {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();

  const weekKey  = getISOWeekKey();
  const cacheKey = `${NS}:weekly-basket:${weekKey}`;
  const data     = await redisGet(cacheKey);

  // Migrate legacy flat stocks array → tiered object
  let basket = data?.basket ?? null;
  if (!basket && Array.isArray(data?.stocks)) {
    basket = { T1: data.stocks.slice(0, 3), T2: data.stocks.slice(3, 6), T3: data.stocks.slice(6, 10) };
  }
  basket = basket ?? { T1: [], T2: [], T3: [] };

  return NextResponse.json({ weekKey, basket });
}

export async function POST(req) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();

  const body = await req.json();
  const raw  = body.basket ?? {};

  const basket = {
    T1: sanitizeTier(raw.T1, 3),
    T2: sanitizeTier(raw.T2, 3),
    T3: sanitizeTier(raw.T3, 4),
  };

  const weekKey  = getISOWeekKey();
  const cacheKey = `${NS}:weekly-basket:${weekKey}`;
  await redisSet(cacheKey, { weekKey, basket, updatedAt: new Date().toISOString() });

  return NextResponse.json({ success: true, weekKey, basket });
}
