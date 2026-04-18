import { NextResponse } from 'next/server';
import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';

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
  } catch (err) { console.error('[nifty-outlook] Redis set error:', err); }
}

export async function GET() {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();

  const weekKey  = getISOWeekKey();
  const cacheKey = `${NS}:nifty-outlook:${weekKey}`;
  const data     = await redisGet(cacheKey);

  return NextResponse.json({ outlook: data || null, weekKey });
}

export async function POST(req) {
  const { session, error } = await requireSession();
  if (error === 'database_error') return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const body = await req.json();

    // Support both new multi-source format { sources, merged } and legacy flat format
    const isMultiSource = body.merged && typeof body.merged === 'object';
    const src = isMultiSource ? body.merged : body;

    // Validate required fields
    if (!src.bias || !src.weeklyView) {
      return NextResponse.json({ error: 'bias and weeklyView are required' }, { status: 400 });
    }

    const merged = {
      bias:             String(src.bias).trim(),
      biasStrength:     src.biasStrength   ? String(src.biasStrength).trim()  : 'Moderate',
      weeklyView:       String(src.weeklyView).trim(),
      keySupport:       Array.isArray(src.keySupport)    ? src.keySupport.map(Number).filter(Boolean)    : [],
      keyResistance:    Array.isArray(src.keyResistance) ? src.keyResistance.map(Number).filter(Boolean) : [],
      niftyFridayClose: src.niftyFridayClose ? Number(src.niftyFridayClose) : null,
      fridayCloseDate:  src.fridayCloseDate  ? String(src.fridayCloseDate)   : null,
      watchFor:         src.watchFor   ? String(src.watchFor).trim()   : null,
      riskEvents:       src.riskEvents ? String(src.riskEvents).trim() : null,
      strategy:         src.strategy   ? String(src.strategy).trim()   : null,
      rawText:          src.rawText    ? String(src.rawText)            : null,
    };

    const outlook = {
      ...(isMultiSource
        ? { sources: Array.isArray(body.sources) ? body.sources : [], merged }
        : merged),
      savedAt: new Date().toISOString(),
    };

    const weekKey  = getISOWeekKey();
    const cacheKey = `${NS}:nifty-outlook:${weekKey}`;
    await redisSet(cacheKey, outlook);

    return NextResponse.json({ success: true, outlook, weekKey });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
