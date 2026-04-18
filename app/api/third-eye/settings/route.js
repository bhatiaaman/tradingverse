// ── GET/POST /api/third-eye/settings ─────────────────────────────────────────
// Persist user-configurable Third Eye parameters to Redis.
// GET  → returns current settings (merged with defaults)
// POST → saves partial or full settings update

import { NextResponse }    from 'next/server';
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session';
import { DEFAULT_CONFIG }  from '@/app/lib/thirdEye';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const SETTINGS_KEY = `${NS}:te:settings`;

// Fields the user is allowed to configure (whitelist)
const ALLOWED_FIELDS = new Set([
  'adxStrong', 'adxForming',
  'rsiBull', 'rsiBear',
  'candleStrengthImpulsive', 'candleStrengthWeak',
  'confirmationCandles', 'scoreSmoothing', 'staleGuardCandles',
  'buildingThreshold', 'confirmedThreshold', 'continuingThreshold',
  'invalidationScore', 'rangingThreshold', 'rangingMinCandles',
  'pullbackRetrace',
  'optionsOverlay',      // boolean
  'pcrBullThreshold', 'pcrBearThreshold',
  'sessionGateOpening',  // 'suppress' | 'warn' | 'allow'
  'sessionGateLull',
  'sessionGateClose',
  'activeTf',            // '5minute' | '15minute'
]);

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return null;
    try { return JSON.parse(data.result); } catch { return null; }
  } catch { return null; }
}

async function redisSet(key, value, ttl) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url = ttl
      ? `${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}?ex=${ttl}`
      : `${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch { /* silent */ }
}

export async function GET(req) {
  const { session, error } = await requireSession();
  if (error)    return serviceUnavailable(error);
  if (!session) return unauthorized();

  const saved    = await redisGet(SETTINGS_KEY) ?? {};
  const settings = { ...DEFAULT_CONFIG, activeTf: '5minute', optionsOverlay: true, ...saved };
  return NextResponse.json({ settings });
}

export async function POST(req) {
  const { session, error } = await requireSession();
  if (error)    return serviceUnavailable(error);
  if (!session) return unauthorized();

  let body = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Filter to allowed fields only
  const update = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) update[k] = v;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
  }

  const existing = await redisGet(SETTINGS_KEY) ?? {};
  const merged   = { ...existing, ...update };
  await redisSet(SETTINGS_KEY, merged); // no TTL — persists indefinitely

  return NextResponse.json({ ok: true, settings: merged });
}
