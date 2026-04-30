#!/usr/bin/env node
// ─── TradingVerse DOM WebSocket Bridge ───────────────────────────────────────
// Runs on VPS alongside kite-worker. Connects to Kite WebSocket in modeFull,
// accumulates order flow signals, writes dom:snapshot:{token} to Redis every 5s.
// Also serves a WebSocket server on port 8765 for the /dom browser page.
//
// Setup on VPS:
//   cd worker && npm install          (adds ws package)
//   pm2 start kite-ws-bridge.js --name kite-ws-bridge
//   pm2 save
//
// Nginx wss:// proxy (add to /etc/nginx/sites-available/dom):
//   server {
//     listen 443 ssl;
//     server_name dom.yourdomain.in;
//     ssl_certificate     /etc/letsencrypt/live/dom.yourdomain.in/fullchain.pem;
//     ssl_certificate_key /etc/letsencrypt/live/dom.yourdomain.in/privkey.pem;
//     location / {
//       proxy_pass http://localhost:8765;
//       proxy_http_version 1.1;
//       proxy_set_header Upgrade $http_upgrade;
//       proxy_set_header Connection "upgrade";
//       proxy_set_header Host $host;
//     }
//   }
//
// Required env vars (same .env as kite-worker):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   KITE_API_KEY
//   REDIS_NAMESPACE        (optional, default: 'default')
//   DOM_WS_PORT            (optional, default: 8765)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

require('dotenv').config();
const http           = require('http');
const { KiteTicker } = require('kiteconnect');
const WebSocket      = require('ws');

// ── Config ────────────────────────────────────────────────────────────────────
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const WS_PORT     = parseInt(process.env.DOM_WS_PORT || '8765', 10);
const SNAPSHOT_TTL = 60; // Redis TTL in seconds — bridge writes every 5s, so 60s = 12× margin

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error('[bridge] UPSTASH_REDIS_REST_URL / REDIS_TOKEN not set'); process.exit(1);
}

// ── Redis keys ────────────────────────────────────────────────────────────────
const KEY = {
  kiteToken:   () => `${NS}:kite:access_token`,
  kiteApiKey:  () => `${NS}:kite:api_key`,
  futToken:    (name) => `${NS}:fut-token-${name}`,
  snapshot:    (token) => `${NS}:dom:snapshot:${token}`,
  stockToken:  (sym)   => `${NS}:dom:stock-token:${sym}`,
  wsAuthToken: (tok)   => `${NS}:dom:ws-token:${tok}`,
  intraday:    () => {
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    return `${NS}:pre-market:intraday-watchlist:${ist.toISOString().slice(0, 10)}`;
  },
};

// ── Redis helpers ─────────────────────────────────────────────────────────────
async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json();
    if (!json.result) return null;
    try { return JSON.parse(json.result); } catch { return json.result; }
  } catch { return null; }
}

async function redisSet(key, value, ttl) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url     = `${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}${ttl ? `?ex=${ttl}` : ''}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch { /* non-fatal */ }
}

async function redisDel(key) {
  try {
    await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch { /* non-fatal */ }
}

// ── In-memory state ───────────────────────────────────────────────────────────
const snapshots      = {};   // token → current computed snapshot
const prevSnaps      = {};   // token → snapshot from previous tick (stacking detection)
const prevTicks      = {};   // token → { last_price, volume_traded }
const deltaMinutes   = {};   // token → { minuteKey: netDelta } — minute-bucketed delta
const icebergTrack   = {};   // token → { price, bounces } — iceberg detection state
const futTokens      = {};   // 'NIFTY' | 'BANKNIFTY' | 'SENSEX' → instrument_token
let   subscribedSet  = new Set();

// ── Depth processing ──────────────────────────────────────────────────────────
function processDepth(depth) {
  const bids = (depth?.buy  ?? []).slice(0, 5);
  const asks = (depth?.sell ?? []).slice(0, 5);

  const topBidQty = bids.slice(0, 3).reduce((s, b) => s + (b.quantity ?? 0), 0);
  const topAskQty = asks.slice(0, 3).reduce((s, a) => s + (a.quantity ?? 0), 0);
  const imbalance = topAskQty > 0
    ? parseFloat((topBidQty / topAskQty).toFixed(2))
    : null;

  // Largest single level on each side = the "wall"
  const bidWall = bids.reduce((m, b) => (b.quantity > (m?.quantity ?? 0) ? b : m), null);
  const askWall = asks.reduce((m, a) => (a.quantity > (m?.quantity ?? 0) ? a : m), null);

  const spread = (asks[0]?.price && bids[0]?.price)
    ? parseFloat((asks[0].price - bids[0].price).toFixed(2))
    : null;

  return { bids, asks, imbalance, bidWall, askWall, spread };
}

// ── Delta accumulation (minute buckets, 30-min rolling window) ────────────────
function accumulateDelta(token, delta) {
  if (!deltaMinutes[token]) deltaMinutes[token] = {};
  const minKey = Math.floor(Date.now() / 60_000);
  deltaMinutes[token][minKey] = (deltaMinutes[token][minKey] ?? 0) + delta;

  // Prune anything older than 31 minutes
  const cutoff = minKey - 31;
  for (const k of Object.keys(deltaMinutes[token])) {
    if (parseInt(k) < cutoff) delete deltaMinutes[token][k];
  }
}

function getDelta(token, minutes) {
  if (!deltaMinutes[token]) return 0;
  const cutoff = Math.floor(Date.now() / 60_000) - minutes;
  return Object.entries(deltaMinutes[token])
    .filter(([k]) => parseInt(k) >= cutoff)
    .reduce((s, [, v]) => s + v, 0);
}

// ── Stacking detection — is the wall growing or shrinking tick-over-tick? ─────
function detectStacking(token, bidWallQty, askWallQty) {
  const prev = prevSnaps[token];
  if (!prev) return { bidStacking: 'neutral', askStacking: 'neutral' };
  const bidDiff = (bidWallQty ?? 0) - (prev.bidWallQty ?? 0);
  const askDiff = (askWallQty ?? 0) - (prev.askWallQty ?? 0);
  return {
    bidStacking: bidDiff >  500 ? 'up'   : bidDiff < -500 ? 'down' : 'neutral',
    askStacking: askDiff >  500 ? 'up'   : askDiff < -500 ? 'down' : 'neutral',
  };
}

// ── Iceberg detection — ask wall qty drops then bounces back repeatedly ───────
function detectIceberg(token, askWall) {
  if (!askWall?.price) { icebergTrack[token] = null; return null; }
  const track = icebergTrack[token];

  // Price level changed — reset tracker
  if (!track || track.price !== askWall.price) {
    icebergTrack[token] = { price: askWall.price, prevQty: askWall.quantity, bounces: 0 };
    return null;
  }

  // If qty dropped significantly and recovered → bounce
  if (track.prevQty > 0 && askWall.quantity < track.prevQty * 0.5) {
    // qty dropped — record the dip
    icebergTrack[token].dipped = true;
  } else if (track.dipped && askWall.quantity >= track.prevQty * 0.8) {
    // qty recovered → count as a bounce
    icebergTrack[token].bounces = (track.bounces ?? 0) + 1;
    icebergTrack[token].dipped  = false;
  }

  icebergTrack[token].prevQty = askWall.quantity;

  // 2+ bounces at the same level = iceberg with high confidence
  return (icebergTrack[token].bounces ?? 0) >= 2 ? askWall.price : null;
}

// ── Main tick handler ─────────────────────────────────────────────────────────
function onTick(ticks) {
  for (const tick of ticks) {
    const token = tick.instrument_token;
    if (!tick.depth) continue;

    const { bids, asks, imbalance, bidWall, askWall, spread } = processDepth(tick.depth);

    // Approximate delta: volume since last tick, signed by LTP direction
    const prev = prevTicks[token];
    let deltaTick = 0;
    if (prev) {
      const volDelta = (tick.volume_traded ?? 0) - (prev.volume_traded ?? 0);
      if (volDelta > 0) {
        const ltpMove = tick.last_price - prev.last_price;
        deltaTick = ltpMove > 0 ? volDelta : ltpMove < 0 ? -volDelta : 0;
      }
    }
    accumulateDelta(token, deltaTick);

    const { bidStacking, askStacking } = detectStacking(token, bidWall?.quantity, askWall?.quantity);
    const icebergAsk = detectIceberg(token, askWall);

    const delta5m  = getDelta(token, 5);
    const delta30m = getDelta(token, 30);

    const snap = {
      token,
      ltp:           tick.last_price,
      bids,
      asks,
      imbalance,
      bidWallPrice:  bidWall?.price    ?? null,
      bidWallQty:    bidWall?.quantity ?? null,
      askWallPrice:  askWall?.price    ?? null,
      askWallQty:    askWall?.quantity ?? null,
      bidStacking,
      askStacking,
      delta5m,
      delta30m,
      deltaDirection: delta5m > 500 ? 'bull' : delta5m < -500 ? 'bear' : 'neutral',
      spread,
      icebergAsk,
      icebergBid:    null,
      updatedAt:     Math.floor(Date.now() / 1000),
    };

    prevSnaps[token] = snapshots[token] ?? null;
    prevTicks[token] = { last_price: tick.last_price, volume_traded: tick.volume_traded ?? 0 };
    snapshots[token] = snap;
  }

  // Broadcast compact snapshot to /dom browser clients
  broadcastToClients(ticks.map(t => snapshots[t.instrument_token]).filter(Boolean));
}

// ── Flush snapshots to Redis every 5s ─────────────────────────────────────────
async function flushSnapshots() {
  await Promise.all(
    Object.entries(snapshots).map(([token, snap]) =>
      redisSet(KEY.snapshot(token), snap, SNAPSHOT_TTL)
    )
  );
}

// ── Instrument token resolution (symbol → NSE token) ─────────────────────────
let instrumentMap = null;

async function buildInstrumentMap(apiKey, accessToken) {
  try {
    const res = await fetch('https://api.kite.trade/instruments/NSE', {
      headers: { 'X-Kite-Version': '3', Authorization: `token ${apiKey}:${accessToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv   = await res.text();
    const lines = csv.trim().split('\n');
    const hdrs  = lines[0].split(',');
    const tIdx  = hdrs.indexOf('instrument_token');
    const sIdx  = hdrs.indexOf('tradingsymbol');
    const tyIdx = hdrs.indexOf('instrument_type');
    const map   = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols[tyIdx]?.replace(/"/g, '').trim() !== 'EQ') continue;
      const sym = cols[sIdx]?.replace(/"/g, '').trim();
      const tok = parseInt(cols[tIdx]);
      if (sym && tok) map[sym] = tok;
    }
    instrumentMap = map;
    console.log(`[bridge] Instrument map: ${Object.keys(map).length} NSE EQ tokens`);
  } catch (e) {
    console.error('[bridge] Instrument map failed:', e.message);
    instrumentMap = {};
  }
}

// Resolve near-month futures token from instruments CSV, update Redis cache.
async function resolveFutToken(apiKey, accessToken, name, exchange) {
  try {
    const res = await fetch(`https://api.kite.trade/instruments/${exchange}`, {
      headers: { 'X-Kite-Version': '3', Authorization: `token ${apiKey}:${accessToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv     = await res.text();
    const lines   = csv.trim().split('\n');
    const headers = lines[0].split(',');
    const tokIdx  = headers.indexOf('instrument_token');
    const nameIdx = headers.indexOf('name');
    const typeIdx = headers.indexOf('instrument_type');
    const expIdx  = headers.indexOf('expiry');
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    let best = null;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols[nameIdx]?.replace(/"/g,'').trim() !== name) continue;
      if (cols[typeIdx]?.replace(/"/g,'').trim() !== 'FUT') continue;
      const exp = cols[expIdx]?.replace(/"/g,'').trim();
      if (!exp) continue;
      const expiryDate = new Date(exp);
      if (expiryDate <= today) continue;
      if (!best || expiryDate < new Date(best.expiry)) best = { token: parseInt(cols[tokIdx]), expiry: exp };
    }
    if (best) {
      await redisSet(KEY.futToken(name), best.token, 6 * 3600);
      futTokens[name] = best.token;
      console.log(`[bridge] ${name} Fut token: ${best.token} (expiry ${best.expiry})`);
      return best.token;
    }
    console.warn(`[bridge] ${name} Fut: no near-month contract found`);
  } catch (e) {
    console.warn(`[bridge] ${name} Fut resolve failed: ${e.message}`);
  }
  return null;
}

const FUT_EXCHANGES = { NIFTY: 'NFO', SENSEX: 'BFO', BANKNIFTY: 'NFO' };

// Backoff state — set when instruments API returns 429 so we stop hammering it.
let instrumentsBackoffUntil = 0;

async function resolveTokens(apiKey, accessToken) {
  const tokens = new Set();
  const now    = Date.now();
  const inBackoff = now < instrumentsBackoffUntil;

  for (const [name, exchange] of Object.entries(FUT_EXCHANGES)) {
    // 1. In-memory (survives reconnects within the same process)
    if (futTokens[name]) { tokens.add(futTokens[name]); continue; }

    // 2. Redis cache (survives process restarts, 6h TTL)
    const cached = await redisGet(KEY.futToken(name));
    if (cached) {
      futTokens[name] = cached;
      tokens.add(cached);
      console.log(`[bridge] ${name} Fut token from cache: ${cached}`);
      continue;
    }

    // 3. Instruments API — skip if we're in a 429 backoff window
    if (inBackoff) {
      const waitMin = Math.ceil((instrumentsBackoffUntil - now) / 60_000);
      console.warn(`[bridge] ${name} Fut resolve skipped — instruments API in cooldown (${waitMin}min left)`);
      continue;
    }

    const t = await resolveFutToken(apiKey, accessToken, name, exchange);
    if (t) {
      tokens.add(t);
    } else {
      // Back off 30 min on failure (covers 429 and auth errors)
      instrumentsBackoffUntil = now + 30 * 60_000;
      console.warn('[bridge] Instruments API failed — backing off 30min');
    }
  }

  // Intraday stock list
  const watchlist = await redisGet(KEY.intraday()) ?? [];
  if (watchlist.length > 0) {
    if (!instrumentMap) await buildInstrumentMap(apiKey, accessToken);
    for (const stock of watchlist) {
      const sym = (stock.symbol ?? '').replace(/['"]/g, '').trim().toUpperCase();
      const tok = instrumentMap?.[sym];
      if (tok) {
        tokens.add(tok);
        await redisSet(KEY.stockToken(sym), tok, 86400);
        console.log(`[bridge] Stock ${sym}: ${tok}`);
      } else {
        console.warn(`[bridge] Token not found for ${sym}`);
      }
    }
  }

  return [...tokens];
}

// ── KiteTicker lifecycle ──────────────────────────────────────────────────────
let ticker         = null;
let reconnectTimer = null;

async function connect() {
  const apiKey      = await redisGet(KEY.kiteApiKey()) || process.env.KITE_API_KEY;
  const accessToken = await redisGet(KEY.kiteToken());

  console.log(`[bridge] connect() NS=${NS} token=${accessToken ? accessToken.slice(0,8)+'...' : 'MISSING'}`);

  if (!apiKey || !accessToken || accessToken.trim() === '') {
    console.warn('[bridge] Kite credentials not found in Redis — retrying in 60s');
    reconnectTimer = setTimeout(connect, 60_000);
    return;
  }

  const tokens = await resolveTokens(apiKey, accessToken);
  console.log(`[bridge] Connecting with ${tokens.length} tokens`);
  subscribedSet = new Set(tokens);

  if (ticker) {
    try { ticker.disconnect(); } catch { /* ignore */ }
    ticker = null;
  }

  ticker = new KiteTicker({ api_key: apiKey, access_token: accessToken });
  ticker.autoReconnect(true, 10, 5); // 10 attempts, 5s apart

  ticker.on('connect', () => {
    console.log('[bridge] Kite WebSocket connected ✓');
    // Re-read subscribedSet so a token-refresh reconnect picks up fresh tokens
    const live = [...subscribedSet];
    if (live.length > 0) {
      ticker.subscribe(live);
      ticker.setMode(ticker.modeFull, live);
      console.log(`[bridge] Subscribed ${live.length} tokens in modeFull`);
    }
  });

  ticker.on('ticks', onTick);

  ticker.on('disconnect', (err) => {
    console.warn('[bridge] Disconnected:', err?.message ?? 'reason unknown');
    scheduleReconnect(30_000);
  });

  ticker.on('error', (err) => console.error('[bridge] Ticker error:', err?.message));

  ticker.on('close', () => {
    console.warn('[bridge] Connection closed by Kite');
    scheduleReconnect(30_000);
  });

  ticker.on('noreconnect', () => {
    console.warn('[bridge] Max auto-reconnects reached — scheduling manual reconnect');
    scheduleReconnect(60_000);
  });

  ticker.connect();
}

function scheduleReconnect(delayMs = 30_000) {
  if (reconnectTimer) return;
  console.log(`[bridge] Reconnecting in ${delayMs / 1000}s (allows token refresh to propagate)`);
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delayMs);
}

// ── Dynamic subscription (from /dom browser page) ─────────────────────────────
function dynamicSubscribe(newTokens) {
  if (!ticker || !newTokens?.length) return;
  const fresh = newTokens.map(Number).filter(t => !subscribedSet.has(t));
  if (!fresh.length) return;
  ticker.subscribe(fresh);
  ticker.setMode(ticker.modeFull, fresh);
  fresh.forEach(t => subscribedSet.add(t));
  console.log('[bridge] Dynamic subscribe:', fresh);
}

// ── HTTP server for Next.js → read snapshots without Redis ───────────────────
// GET http://localhost:3001/dom?underlying=NIFTY
// Next.js /api/dom/pressure reads from here instead of Redis.
// Eliminates ~5M Redis writes/month from flushSnapshots.
function startHttpServer() {
  const port = parseInt(process.env.BRIDGE_HTTP_PORT || '3001', 10);
  console.log(`[bridge] startHttpServer called, port=${port}`);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname !== '/dom') { res.writeHead(404); res.end('Not found'); return; }

    const underlying = url.searchParams.get('underlying') || 'NIFTY';
    const token      = futTokens[underlying];
    const snap       = token ? snapshots[token] : null;
    const ageSeconds = snap?.updatedAt ? Math.floor(Date.now() / 1000) - snap.updatedAt : 999;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (!token || !snap || ageSeconds > 30) {
      res.end(JSON.stringify({ available: false }));
    } else {
      res.end(JSON.stringify({ available: true, snap }));
    }
  });
  server.on('error', err => {
    console.error(`[bridge] HTTP server failed to start on port ${port}: ${err.message}`);
  });
  server.listen(port, () => {
    console.log(`[bridge] HTTP server listening on port ${port}`);
  });
}

// ── WebSocket server for /dom page ────────────────────────────────────────────
let wsServer = null;

function broadcastToClients(data) {
  if (!wsServer || !data.length) return;
  const msg = JSON.stringify({ type: 'ticks', data });
  for (const client of wsServer.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch { /* ignore dropped client */ }
    }
  }
}

function startWsServer() {
  wsServer = new WebSocket.Server({ port: WS_PORT });
  console.log(`[bridge] DOM WS server listening on port ${WS_PORT}`);

  wsServer.on('connection', async (ws, req) => {
    // Validate short-lived auth token (issued by Next.js /api/dom/ws-token)
    const url   = new URL(req.url ?? '/', `http://localhost:${WS_PORT}`);
    const token = url.searchParams.get('token');
    const valid = token && await redisGet(KEY.wsAuthToken(token));

    if (!valid) {
      console.warn('[bridge] Rejected unauthenticated /dom connection');
      ws.close(1008, 'Unauthorized');
      return;
    }

    console.log('[bridge] /dom client connected');

    // Backfill: send current snapshots so page is not blank on load
    ws.send(JSON.stringify({ type: 'backfill', data: Object.values(snapshots) }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.subscribe) dynamicSubscribe(msg.subscribe);
      } catch { /* ignore malformed */ }
    });

    ws.on('close', () => console.log('[bridge] /dom client disconnected'));
    ws.on('error', (e) => console.error('[bridge] WS client error:', e.message));
  });
}

// ── Morning token rotation (9:00 IST) — picks up new intraday list ────────────
function scheduleMorningRotation() {
  const now = Date.now() + 5.5 * 3600 * 1000; // IST
  const ist = new Date(now);
  const nextNine = new Date(Date.UTC(
    ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 3, 30 // 9:00 IST = 03:30 UTC
  ));
  if (nextNine <= new Date(now)) nextNine.setUTCDate(nextNine.getUTCDate() + 1);
  const msUntil = nextNine - new Date(now);
  console.log(`[bridge] Morning rotation scheduled in ${Math.round(msUntil / 60000)} min`);
  setTimeout(async () => {
    console.log('[bridge] Morning rotation — refreshing intraday token list');
    instrumentMap = null; // force rebuild
    // Clear fut-token caches so expiring contracts are not reused
    for (const k of Object.keys(futTokens)) delete futTokens[k];
    for (const name of Object.keys(FUT_EXCHANGES)) await redisDel(KEY.futToken(name));
    await connect();      // re-reads watchlist + futures tokens
    scheduleMorningRotation();
  }, msUntil);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[bridge] TradingVerse DOM WebSocket Bridge starting');
  console.log('[bridge] Redis:', REDIS_URL?.slice(0, 40) + '...');

  startHttpServer();
  startWsServer();
  await connect();

  // Flush in-memory snapshots to Redis every 5s — dom-context.js reads from Redis by token.
  setInterval(flushSnapshots, 5_000);

  // Poll intraday watchlist every 5 min between 8:00–10:00 IST — picks up late additions
  setInterval(async () => {
    const istHour = (new Date(Date.now() + 5.5 * 3600 * 1000)).getUTCHours();
    if (istHour < 8 || istHour >= 10) return;
    const watchlist = await redisGet(KEY.intraday()) ?? [];
    if (!watchlist.length || !ticker) return;
    if (!instrumentMap) await buildInstrumentMap(
      process.env.KITE_API_KEY || await redisGet(KEY.kiteApiKey()),
      await redisGet(KEY.kiteToken()),
    );
    const fresh = [];
    for (const stock of watchlist) {
      const sym = (stock.symbol ?? '').replace(/['"]/g, '').trim().toUpperCase();
      const tok = instrumentMap?.[sym];
      if (tok && !subscribedSet.has(tok)) {
        fresh.push(tok);
        await redisSet(KEY.stockToken(sym), tok, 86400);
      }
    }
    if (fresh.length) {
      ticker.subscribe(fresh);
      ticker.setMode(ticker.modeFull, fresh);
      fresh.forEach(t => subscribedSet.add(t));
      console.log('[bridge] Watchlist poll — subscribed new stocks:', fresh);
    }
  }, 5 * 60 * 1000);

  // Schedule daily 9 AM token rotation
  scheduleMorningRotation();
}

main().catch(err => {
  console.error('[bridge] Fatal error:', err);
  process.exit(1);
});
