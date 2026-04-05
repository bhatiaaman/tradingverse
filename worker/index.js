#!/usr/bin/env node
// ─── TradingVerse Order Worker ────────────────────────────────────────────────
// Runs on VPS with static IP. Pulls from Redis order_queue, calls Kite API,
// writes status + logs back to Redis.
//
// Setup:
//   npm install kiteconnect dotenv
//   cp .env.worker .env   (or set env vars directly)
//   pm2 start worker/index.js --name kite-worker
//   pm2 save
//   pm2 startup   ← makes it survive reboots
//
// Required env vars:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   KITE_API_KEY
//   KITE_ACCESS_TOKEN   ← read from Redis on each order (stays fresh)

'use strict';

require('dotenv').config();
const { KiteConnect } = require('kiteconnect');

// ─── Upstash Redis via REST (same as Next.js app — no native Redis needed) ───
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error('[worker] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set');
  process.exit(1);
}

async function redisCmd(...args) {
  const res = await fetch(`${REDIS_URL}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const json = await res.json();
  if (json.error) throw new Error(`Redis error: ${json.error}`);
  return json.result;
}

// Poll queue with RPOP — Upstash REST doesn't support blocking BRPOP reliably
// (infinite BRPOP causes EOF when Upstash closes the HTTP connection after ~30s)
async function brpop(key) {
  while (true) {
    const res  = await fetch(`${REDIS_URL}/rpop/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json();
    if (json.error) throw new Error(`Redis rpop error: ${json.error}`);
    if (json.result !== null && json.result !== undefined) return json.result;
    // Nothing in queue — wait 800ms before next poll
    await new Promise(r => setTimeout(r, 800));
  }
}

async function redisSet(key, value, exSeconds) {
  if (exSeconds) {
    return redisCmd('set', key, value, 'ex', String(exSeconds));
  }
  return redisCmd('set', key, value);
}

async function redisGet(key) {
  return redisCmd('get', key);
}

async function redisRpush(key, value) {
  return redisCmd('rpush', key, value);
}

async function redisLtrim(key, start, stop) {
  return redisCmd('ltrim', key, String(start), String(stop));
}

// ─── Redis keys ───────────────────────────────────────────────────────────────
// NS must match REDIS_NAMESPACE env var in the Next.js app (default: 'default')
const NS           = process.env.REDIS_NAMESPACE || 'default';
const QUEUE_KEY    = 'tradingverse:order_queue';
const STATUS_PFX   = 'tradingverse:order_status:';
const DEDUP_PFX    = 'tradingverse:order_dedup:';
const EXEC_LOG_KEY = 'tradingverse:order_exec_log';
const EXEC_LOG_MAX = 500;
const KITE_TOKEN_KEY  = `${NS}:kite:access_token`;
const KITE_APIKEY_KEY = `${NS}:kite:api_key`;

// ─── Logging ──────────────────────────────────────────────────────────────────
async function writeLog(entry) {
  const line = JSON.stringify({ ...entry, workerTs: Date.now() });
  console.log(line);
  try {
    await redisRpush(EXEC_LOG_KEY, line);
    await redisLtrim(EXEC_LOG_KEY, -EXEC_LOG_MAX, -1);
  } catch (e) {
    console.error('[worker] log write failed:', e.message);
  }
}

// ─── Get fresh Kite credentials from Redis ────────────────────────────────────
async function getKite() {
  const apiKey      = process.env.KITE_API_KEY || await redisGet(KITE_APIKEY_KEY);
  const accessToken = await redisGet(KITE_TOKEN_KEY);
  console.log(`[worker] api_key=${apiKey?.slice(0,8)}... token=${accessToken?.slice(0,8)}... key_source=${process.env.KITE_API_KEY ? 'env' : 'redis'}`);
  if (!apiKey || !accessToken) throw new Error('Kite credentials missing in Redis');
  const kite = new KiteConnect({ api_key: apiKey });
  kite.setAccessToken(accessToken);
  return kite;
}

// ─── Process one order ────────────────────────────────────────────────────────
async function processOrder(raw) {
  let order;
  try {
    order = JSON.parse(raw);
  } catch {
    console.error('[worker] invalid JSON in queue, skipping');
    return;
  }

  const { orderId, variety = 'regular', tradingsymbol, exchange,
          transaction_type, quantity, product, order_type,
          price, trigger_price, validity = 'DAY', tag } = order;

  if (!orderId) { console.error('[worker] order has no orderId, skipping'); return; }

  // Check dedup key — if missing the order is stale (>30s old) or already processed
  const dedupVal = await redisGet(`${DEDUP_PFX}${orderId}`);
  if (!dedupVal) {
    await writeLog({ event: 'REJECTED', orderId, reason: 'Dedup key expired — order too old or duplicate' });
    await redisSet(`${STATUS_PFX}${orderId}`, `REJECTED:Dedup expired`, 600);
    return;
  }

  await writeLog({ event: 'SENT', orderId, symbol: tradingsymbol, exchange, transaction_type, quantity, order_type });

  // Build Kite params
  const params = {
    tradingsymbol, exchange, transaction_type, quantity: parseInt(quantity),
    product, order_type, validity,
  };
  if (price)         params.price         = parseFloat(price);
  if (trigger_price) params.trigger_price = parseFloat(trigger_price);
  if (tag)           params.tag           = tag;

  try {
    const kite   = await getKite();
    const result = await kite.placeOrder(variety, params);
    const kiteId = result.order_id;

    await writeLog({ event: 'SUCCESS', orderId, kiteOrderId: kiteId, symbol: tradingsymbol });
    await redisSet(`${STATUS_PFX}${orderId}`, `SUCCESS:${kiteId}`, 600);

  } catch (err) {
    const msg = err.message || 'Unknown Kite error';
    await writeLog({ event: 'FAILED', orderId, symbol: tradingsymbol, error: msg });
    await redisSet(`${STATUS_PFX}${orderId}`, `FAILED:${msg}`, 600);
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────
async function main() {
  console.log('[worker] TradingVerse order worker started');
  console.log('[worker] Queue:', QUEUE_KEY);
  console.log('[worker] Redis:', REDIS_URL?.slice(0, 40) + '...');

  while (true) {
    try {
      console.log('[worker] Waiting for order...');
      const raw = await brpop(QUEUE_KEY);
      if (raw) await processOrder(raw);
    } catch (err) {
      console.error('[worker] Loop error:', err.message);
      // Brief pause before retrying to avoid tight error loop
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

main().catch(err => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
