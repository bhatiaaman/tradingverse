// Test script — confirms Kite Connect modeFull (20-depth) is accessible
// Run: node scripts/test-modeFull.mjs
//
// What it does:
//   1. Connects to Kite WebSocket using credentials from .env.local
//   2. Subscribes Nifty Futures near-month token in modeFull
//   3. Waits for first tick and reports depth level count
//   4. Exits cleanly with a pass/fail verdict

import { createRequire } from 'module';
import { readFileSync }   from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath }  from 'url';

const require = createRequire(import.meta.url);
const __dir   = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local manually ──────────────────────────────────────────────────
const envPath = resolve(__dir, '../.env.local');
const envVars = readFileSync(envPath, 'utf8')
  .split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .reduce((acc, l) => {
    const idx = l.indexOf('=');
    acc[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
    return acc;
  }, {});

const API_KEY      = envVars.KITE_API_KEY;
const ACCESS_TOKEN = envVars.KITE_ACCESS_TOKEN;

if (!API_KEY || !ACCESS_TOKEN) {
  console.error('❌  KITE_API_KEY or KITE_ACCESS_TOKEN missing from .env.local');
  process.exit(1);
}

// ── Nifty Futures near-month token ───────────────────────────────────────────
// Token 11924738 is a common near-month Nifty Fut token — may need updating.
// The script resolves it from the instruments API if needed.
const NIFTY_FUT_TOKEN_FALLBACK = 11924738;

async function resolveNiftyFutToken() {
  try {
    const res = await fetch(
      'https://api.kite.trade/instruments/NFO',
      { headers: { 'X-Kite-Version': '3', Authorization: `token ${API_KEY}:${ACCESS_TOKEN}` } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv   = await res.text();
    const lines = csv.trim().split('\n');
    const hdrs  = lines[0].split(',');
    const tIdx  = hdrs.indexOf('instrument_token');
    const nIdx  = hdrs.indexOf('name');
    const tyIdx = hdrs.indexOf('instrument_type');
    const exIdx = hdrs.indexOf('expiry');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let best = null;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols[nIdx]?.replace(/"/g,'').trim()  !== 'NIFTY') continue;
      if (cols[tyIdx]?.replace(/"/g,'').trim() !== 'FUT')   continue;
      const exp = new Date(cols[exIdx]?.replace(/"/g,'').trim());
      if (exp < today) continue;
      if (!best || exp < new Date(best.expiry)) best = { token: parseInt(cols[tIdx]), expiry: exp };
    }
    return best?.token ?? NIFTY_FUT_TOKEN_FALLBACK;
  } catch (e) {
    console.warn(`⚠️  Could not resolve Nifty Fut token (${e.message}), using fallback ${NIFTY_FUT_TOKEN_FALLBACK}`);
    return NIFTY_FUT_TOKEN_FALLBACK;
  }
}

// ── Kite WebSocket binary frame parser (minimal) ─────────────────────────────
// modeFull packets start with instrument token (4 bytes) + last_price (4 bytes)
// + depth data. We just need to confirm depth levels are present.
function parseTick(buffer) {
  const view = new DataView(buffer.buffer ?? buffer);
  if (view.byteLength < 8) return null;

  const token    = view.getInt32(0, false);
  const lastPrice = view.getInt32(4, false) / 100;

  // Depth starts at offset 64 in modeFull packets (after all scalar fields)
  // Each depth entry: price (4B) + qty (4B) + orders (4B) = 12 bytes
  // 20 buy levels + 20 sell levels = 40 entries = 480 bytes
  // Full modeFull packet = 184 bytes; if < 184 → not full mode
  const isFullMode = view.byteLength >= 184;
  const depthLevels = isFullMode ? 20 : (view.byteLength >= 64 ? 5 : 0);

  return { token, lastPrice, depthLevels, packetSize: view.byteLength, isFullMode };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔍  Resolving Nifty Futures near-month token…');
  const token = await resolveNiftyFutToken();
  console.log(`📌  Using token: ${token}`);
  console.log('🔌  Connecting to Kite WebSocket…\n');

  const { default: WebSocket } = await import('ws').catch(() => {
    console.error('❌  ws package not found. Run: npm install ws');
    process.exit(1);
  });

  const wsUrl = `wss://ws.kite.trade?api_key=${API_KEY}&access_token=${ACCESS_TOKEN}`;
  const ws    = new WebSocket(wsUrl);
  let   timer = null;

  ws.on('open', () => {
    console.log('✅  WebSocket connected');

    // Set mode to full (20-depth)
    ws.send(JSON.stringify({ a: 'mode', v: ['full', [token]] }));
    // Subscribe
    ws.send(JSON.stringify({ a: 'subscribe', v: [token] }));
    console.log(`📡  Subscribed token ${token} in modeFull — waiting for tick…\n`);

    // Timeout if no tick after 15s (market closed / token wrong)
    timer = setTimeout(() => {
      console.log('⏱️  No tick received in 15s — market may be closed or token is wrong.');
      console.log('    Try running this script during market hours (9:15–15:30 IST).');
      ws.close();
    }, 15000);
  });

  ws.on('message', (data) => {
    // Kite sends a text "connected" message first, then binary ticks
    if (typeof data === 'string') {
      console.log(`📨  Text frame: ${data}`);
      return;
    }

    const buf  = Buffer.isBuffer(data) ? data : Buffer.from(data);
    // Kite wraps multiple ticks: first 2 bytes = number of packets,
    // next 2 bytes = packet length, then packet data
    if (buf.byteLength < 4) return;
    const numPackets = buf.readInt16BE(0);
    if (numPackets === 0) return;

    let offset = 2;
    for (let i = 0; i < numPackets; i++) {
      if (offset + 2 > buf.byteLength) break;
      const pktLen = buf.readInt16BE(offset); offset += 2;
      const pkt    = buf.slice(offset, offset + pktLen); offset += pktLen;
      const tick   = parseTick(pkt);
      if (!tick) continue;

      clearTimeout(timer);
      console.log('─'.repeat(50));
      console.log(`Token:       ${tick.token}`);
      console.log(`Last price:  ₹${tick.lastPrice}`);
      console.log(`Packet size: ${tick.packetSize} bytes`);
      console.log(`Depth levels: ${tick.depthLevels}`);
      console.log('');

      if (tick.isFullMode) {
        console.log('✅  modeFull CONFIRMED — 20-depth data accessible');
        console.log('✅  DOM module can be built on your current Kite plan');
      } else if (tick.depthLevels === 5) {
        console.log('⚠️  Only 5-depth received (modeQuote / not full mode)');
        console.log('    Your plan may not have modeFull enabled.');
        console.log('    Contact Zerodha support to confirm 20-depth eligibility.');
      } else {
        console.log('⚠️  Minimal tick received — depth data not present');
        console.log('    Try running during market hours or check your subscription.');
      }
      console.log('─'.repeat(50));
      ws.close();
      return;
    }
  });

  ws.on('error', (err) => {
    clearTimeout(timer);
    console.error(`❌  WebSocket error: ${err.message}`);
    if (err.message.includes('401') || err.message.includes('403')) {
      console.error('    Access token may be expired. Regenerate via Kite login.');
    }
    process.exit(1);
  });

  ws.on('close', (code, reason) => {
    clearTimeout(timer);
    if (code !== 1000) {
      console.log(`\nConnection closed — code ${code}: ${reason}`);
    }
    process.exit(0);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
