import { requireSession } from '@/app/lib/session';

export const dynamic = 'force-dynamic';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const STALE_SEC   = 30;
const POLL_MS     = 1500;  // bridge writes every 5s; 1.5s polling gives ≤1.5s latency
const MAX_LIFE_MS = 50_000; // close before Vercel 60s function timeout; client auto-reconnects

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

async function readSnap(underlying) {
  const futToken = await redisGet(`${NS}:fut-token-${underlying}`);
  if (!futToken) return null;
  const snap = await redisGet(`${NS}:dom:snapshot:${futToken}`);
  if (!snap) return null;
  const ageSeconds = snap.updatedAt
    ? Math.floor(Date.now() / 1000) - snap.updatedAt
    : 999;
  if (ageSeconds > STALE_SEC) return null;
  return { ...snap, ageSeconds };
}

function snapToPayload(snap) {
  return {
    available:      true,
    ltp:            snap.ltp,
    bids:           (snap.bids  ?? []).slice(0, 5),
    asks:           (snap.asks  ?? []).slice(0, 5),
    spread:         snap.spread,
    imbalance:      snap.imbalance,
    delta5m:        snap.delta5m,
    delta30m:       snap.delta30m,
    deltaDirection: snap.deltaDirection,
    icebergAsk:     snap.icebergAsk,
    icebergBid:     snap.icebergBid,
    bidStacking:    snap.bidStacking,
    askStacking:    snap.askStacking,
    bidWallPrice:   snap.bidWallPrice,
    bidWallQty:     snap.bidWallQty,
    askWallPrice:   snap.askWallPrice,
    askWallQty:     snap.askWallQty,
    ageSeconds:     snap.ageSeconds,
  };
}

// GET /api/dom/live?underlying=NIFTY
// Server-Sent Events stream — pushes DOM snapshot updates every 1.5s.
// Auto-closes at 50s so client reconnects cleanly before Vercel timeout.
// Client uses EventSource which auto-reconnects on close.
export async function GET(req) {
  const { session } = await requireSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  if (process.env.DOM_ENABLED !== 'true') {
    return new Response('DOM disabled', { status: 503 });
  }

  const url        = new URL(req.url);
  const underlying = (url.searchParams.get('underlying') ?? 'NIFTY').toUpperCase();

  const enc     = new TextEncoder();
  let   stopped = false;

  const stream = new ReadableStream({
    async start(ctrl) {
      const push = (obj) => {
        if (stopped) return;
        try {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          stopped = true;
        }
      };

      const tick = async () => {
        if (stopped) return;
        const snap = await readSnap(underlying);
        push(snap ? snapToPayload(snap) : { available: false });
      };

      // Initial tick + interval
      await tick();
      const iv = setInterval(tick, POLL_MS);

      // Graceful close: signal client to reconnect, then close stream
      const closing = setTimeout(() => {
        stopped = true;
        clearInterval(iv);
        try { push({ type: 'reconnect' }); ctrl.close(); } catch {}
      }, MAX_LIFE_MS);

      // Clean up on client disconnect
      req.signal?.addEventListener('abort', () => {
        stopped = true;
        clearInterval(iv);
        clearTimeout(closing);
        try { ctrl.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'X-Accel-Buffering': 'no', // disable nginx buffering on proxied deployments
    },
  });
}
