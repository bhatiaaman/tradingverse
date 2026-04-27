import { NextResponse }                 from 'next/server';
import { requireSession, unauthorized } from '@/app/lib/session';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

async function redisSet(key, value, ttl) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url     = `${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}${ttl ? `?ex=${ttl}` : ''}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch {}
}

// POST /api/dom/subscribe-positions
// Body: { tokens: [instrument_token, ...] }
// Writes position tokens to Redis so the bridge subscribes them in modeFull.
// Bridge polls this key every 30s and calls dynamicSubscribe for any new tokens.
export async function POST(req) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  const { tokens } = await req.json();
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return NextResponse.json({ ok: true, subscribed: 0 });
  }

  const valid = tokens.map(Number).filter(t => t > 0);
  if (valid.length === 0) return NextResponse.json({ ok: true, subscribed: 0 });

  await redisSet(`${NS}:dom:position-tokens`, valid, 7200); // 2h TTL
  return NextResponse.json({ ok: true, subscribed: valid.length });
}
