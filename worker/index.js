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
// Adaptive backoff: fast during market hours (1s), slow otherwise (10s).
// This keeps daily Redis calls ~30k vs ~108k at flat 800ms 24/7.
function marketHoursPollMs() {
  const ist  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return (mins >= 555 && mins <= 930) ? 1000 : 10000; // 9:15–15:30 IST = fast
}

async function brpop(key) {
  while (true) {
    const res  = await fetch(`${REDIS_URL}/rpop/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json();
    if (json.error) throw new Error(`Redis rpop error: ${json.error}`);
    if (json.result !== null && json.result !== undefined) return json.result;
    await new Promise(r => setTimeout(r, marketHoursPollMs()));
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

async function redisSmembers(key) {
  return redisCmd('smembers', key);
}

async function redisSadd(key, member) {
  return redisCmd('sadd', key, member);
}

async function redisSrem(key, member) {
  return redisCmd('srem', key, member);
}

// ─── Redis keys ───────────────────────────────────────────────────────────────
const NS           = process.env.REDIS_NAMESPACE || 'default';
const QUEUE_KEY    = 'tradingverse:order_queue';
const STATUS_PFX   = 'tradingverse:order_status:';
const DEDUP_PFX    = 'tradingverse:order_dedup:';
const EXEC_LOG_KEY = 'tradingverse:order_exec_log';
const EXEC_LOG_MAX = 500;
const KITE_TOKEN_KEY    = `${NS}:kite:access_token`;
const KITE_APIKEY_KEY   = `${NS}:kite:api_key`;
const BRACKET_PENDING   = 'tradingverse:bracket:pending';
const BRACKET_PFX       = 'tradingverse:bracket:';
const BRACKET_RESULT_PFX = 'tradingverse:bracket:result:';

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
  const apiKey      = await redisGet(KITE_APIKEY_KEY) || process.env.KITE_API_KEY;
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
          price, trigger_price, validity = 'DAY', tag,
          market_protection } = order;

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
  if (price)             params.price             = parseFloat(price);
  if (trigger_price)     params.trigger_price     = parseFloat(trigger_price);
  if (tag)               params.tag               = tag;
  if (market_protection) params.market_protection = parseFloat(market_protection);

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

// ─── Bracket order monitoring ─────────────────────────────────────────────────
async function placeBracketOrders(kite, kiteOrderId, bracket) {
  const { sl_price, tp_price, symbol, exchange, quantity, product, exit_type, variety } = bracket;
  const results = { status: 'done', sl_order_id: null, tp_order_id: null, errors: [], symbol, placed_at: Date.now() };

  if (sl_price) {
    try {
      const r = await kite.placeOrder(variety || 'regular', {
        tradingsymbol: symbol, exchange, transaction_type: exit_type,
        quantity, product, order_type: 'SL-M', trigger_price: parseFloat(sl_price), validity: 'DAY',
      });
      results.sl_order_id = r.order_id;
      console.log(`[bracket] SL placed: ${r.order_id} for ${symbol} @ trigger ${sl_price}`);
    } catch (e) {
      results.errors.push(`SL failed: ${e.message}`);
      console.error(`[bracket] SL failed for ${symbol}:`, e.message);
    }
  }

  if (tp_price) {
    try {
      const r = await kite.placeOrder(variety || 'regular', {
        tradingsymbol: symbol, exchange, transaction_type: exit_type,
        quantity, product, order_type: 'LIMIT', price: parseFloat(tp_price), validity: 'DAY',
      });
      results.tp_order_id = r.order_id;
      console.log(`[bracket] TP placed: ${r.order_id} for ${symbol} @ ${tp_price}`);
    } catch (e) {
      results.errors.push(`TP failed: ${e.message}`);
      console.error(`[bracket] TP failed for ${symbol}:`, e.message);
    }
  }

  await redisSrem(BRACKET_PENDING, kiteOrderId);
  await redisSet(`${BRACKET_RESULT_PFX}${kiteOrderId}`, JSON.stringify(results), 86400);
}

async function monitorBrackets() {
  console.log('[bracket] Bracket monitor started');
  while (true) {
    try {
      const members = await redisSmembers(BRACKET_PENDING);
      if (members && members.length > 0) {
        let kite;
        try { kite = await getKite(); } catch { /* credentials not ready yet */ }

        if (kite) {
          const allOrders = await kite.getOrders();
          for (const kiteOrderId of members) {
            const order = allOrders.find(o => o.order_id === kiteOrderId);
            if (!order) continue;

            if (order.status === 'COMPLETE') {
              const raw = await redisGet(`${BRACKET_PFX}${kiteOrderId}`);
              if (!raw) { await redisSrem(BRACKET_PENDING, kiteOrderId); continue; }
              try {
                const bracket = JSON.parse(raw);
                await placeBracketOrders(kite, kiteOrderId, bracket);
              } catch (e) {
                console.error('[bracket] placeBracketOrders error:', e.message);
              }
            } else if (order.status === 'CANCELLED' || order.status === 'REJECTED') {
              await redisSrem(BRACKET_PENDING, kiteOrderId);
              await redisSet(`${BRACKET_RESULT_PFX}${kiteOrderId}`,
                JSON.stringify({ status: 'entry_cancelled', reason: order.status, placed_at: Date.now() }), 86400);
              console.log(`[bracket] Entry ${order.status} — bracket cancelled for ${kiteOrderId}`);
            }
          }
        }
      }
    } catch (e) {
      console.error('[bracket] Monitor error:', e.message);
    }
    // 5s during market hours, 30s otherwise
    const pollMs = marketHoursPollMs() === 1000 ? 5000 : 30000;
    await new Promise(r => setTimeout(r, pollMs));
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

monitorBrackets().catch(err => {
  console.error('[bracket] Fatal error:', err);
  // Don't exit — order worker must keep running even if bracket monitor crashes
});
