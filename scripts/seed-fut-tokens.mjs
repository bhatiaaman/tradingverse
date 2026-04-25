// Seed Redis with near-month futures tokens for NIFTY, SENSEX, BANKNIFTY.
// Run once before starting kite-ws-bridge, or whenever the Redis key is missing.
//
//   node scripts/seed-fut-tokens.mjs
//
// Reads credentials from .env.local. Writes to the same Upstash Redis the
// bridge and app use.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ───────────────────────────────────────────────────────────
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
const REDIS_URL    = envVars.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN  = envVars.UPSTASH_REDIS_REST_TOKEN;
const NS           = process.env.REDIS_NAMESPACE || envVars.REDIS_NAMESPACE || 'default';
const TTL          = 6 * 3600; // 6 hours

if (!API_KEY || !ACCESS_TOKEN) { console.error('Missing KITE_API_KEY or KITE_ACCESS_TOKEN in .env.local'); process.exit(1); }
if (!REDIS_URL || !REDIS_TOKEN) { console.error('Missing Upstash Redis env vars in .env.local'); process.exit(1); }

// ── Instruments to resolve ────────────────────────────────────────────────────
const TARGETS = [
  { name: 'NIFTY',     exchange: 'NFO' },
  { name: 'SENSEX',    exchange: 'BFO' },
  { name: 'BANKNIFTY', exchange: 'NFO' },
];

// ── Redis SET ─────────────────────────────────────────────────────────────────
async function redisSet(key, value) {
  const encoded = encodeURIComponent(String(value));
  const url = `${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}?ex=${TTL}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  const json = await res.json();
  return json.result === 'OK';
}

// ── Resolve near-month futures token from Kite instruments CSV ────────────────
async function resolveToken(name, exchange) {
  const url = `https://api.kite.trade/instruments/${exchange}`;
  const res = await fetch(url, {
    headers: { 'X-Kite-Version': '3', Authorization: `token ${API_KEY}:${ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Kite instruments HTTP ${res.status} for ${exchange}`);

  const csv     = await res.text();
  const lines   = csv.trim().split('\n');
  const headers = lines[0].split(',');
  const tokIdx  = headers.indexOf('instrument_token');
  const nameIdx = headers.indexOf('name');
  const typeIdx = headers.indexOf('instrument_type');
  const expIdx  = headers.indexOf('expiry');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let best = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols[nameIdx]?.replace(/"/g, '').trim() !== name) continue;
    if (cols[typeIdx]?.replace(/"/g, '').trim() !== 'FUT') continue;
    const exp = cols[expIdx]?.replace(/"/g, '').trim();
    if (!exp) continue;
    const expiryDate = new Date(exp);
    if (expiryDate < today) continue;
    if (!best || expiryDate < new Date(best.expiry)) {
      best = { token: parseInt(cols[tokIdx]), expiry: exp };
    }
  }

  return best;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`Seeding futures tokens → Redis namespace: ${NS}\n`);

for (const { name, exchange } of TARGETS) {
  process.stdout.write(`${name} (${exchange})... `);
  try {
    const result = await resolveToken(name, exchange);
    if (!result) { console.log('✗  No near-month future found'); continue; }
    const key = `${NS}:fut-token-${name}`;
    const ok  = await redisSet(key, result.token);
    console.log(`✓  token=${result.token}  expiry=${result.expiry}  redis=${ok ? 'OK' : 'FAIL'}`);
  } catch (e) {
    console.log(`✗  ${e.message}`);
  }
}

console.log('\nDone. Restart kite-ws-bridge:\n  pm2 restart kite-ws-bridge');
