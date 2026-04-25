import { NextResponse } from 'next/server';
import { requireSession, unauthorized } from '@/app/lib/session';

const DOM_ENABLED = process.env.DOM_ENABLED === 'true';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

const TOKEN_TTL = 60; // seconds — bridge validates and discards immediately on connect

async function redisSet(key, value, ttl) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ value, ex: ttl }),
    cache:   'no-store',
  });
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// POST /api/dom/ws-token
// Returns a 60-second one-time token for opening the /dom WebSocket connection.
// Requires DOM_ENABLED=true in env.
export async function POST() {
  if (!DOM_ENABLED) return NextResponse.json({ error: 'DOM feature not enabled' }, { status: 503 });

  const { session } = await requireSession();
  if (!session) return unauthorized();

  const tok = randomHex(16);
  const key = `${NS}:dom:ws-token:${tok}`;
  await redisSet(key, session.email, TOKEN_TTL);

  return NextResponse.json({ token: tok, ttl: TOKEN_TTL });
}
