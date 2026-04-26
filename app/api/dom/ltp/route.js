import { NextResponse }                 from 'next/server';
import { requireSession, unauthorized } from '@/app/lib/session';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

const POLL_MS     = 1500;
const MAX_LIFE_MS = 50_000;

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return null;
    try { return JSON.parse(data.result); } catch { return data.result; }
  } catch { return null; }
}

export const dynamic = 'force-dynamic';

// GET /api/dom/ltp
// SSE stream of { [instrument_token]: ltp } for all bridge-subscribed tokens.
// Clients look up live LTP by instrument_token (present in Kite positions response).
// Auto-closes at 50s so EventSource reconnects before Vercel timeout.
export async function GET(req) {
  const { session } = await requireSession();
  if (!session) return unauthorized();

  if (process.env.DOM_ENABLED !== 'true') {
    return NextResponse.json({ available: false, reason: 'disabled' });
  }

  const encoder = new TextEncoder();
  const started = Date.now();
  let   closed  = false;

  const stream = new ReadableStream({
    async start(controller) {
      req.signal.addEventListener('abort', () => {
        closed = true;
        try { controller.close(); } catch {}
      });

      const send = (obj) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };

      while (!closed) {
        if (Date.now() - started > MAX_LIFE_MS) {
          send({ type: 'reconnect' });
          break;
        }

        const map = await redisGet(`${NS}:dom:ltp-map`);
        if (map && typeof map === 'object') {
          send({ type: 'ltp', data: map });
        }

        await new Promise(r => setTimeout(r, POLL_MS));
      }

      try { controller.close(); } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
