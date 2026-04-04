#!/usr/bin/env node
// Find Nifty Futures instrument token from Kite
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envVars = readFileSync(envPath, 'utf-8').split('\n');
for (const line of envVars) {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim();
}

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'tradingverse-local';

async function redisGet(key) {
  const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const json = await res.json();
  return json.result ?? null;
}

const API_KEY      = process.env.KITE_API_KEY || await redisGet(`${NS}:kite:api_key`);
const ACCESS_TOKEN = await redisGet(`${NS}:kite:access_token`) || process.env.KITE_ACCESS_TOKEN;

const headers = {
  'X-Kite-Version': '3',
  Authorization: `token ${API_KEY}:${ACCESS_TOKEN}`,
};

// Fetch NFO instruments CSV and find Nifty futures
const res  = await fetch('https://api.kite.trade/instruments/NFO', { headers });
const text = await res.text();
const lines = text.split('\n');
const header = lines[0].split(',');

const tokenIdx      = header.indexOf('instrument_token');
const symbolIdx     = header.indexOf('tradingsymbol');
const nameIdx       = header.indexOf('name');
const instrTypeIdx  = header.indexOf('instrument_type');
const expiryIdx     = header.indexOf('expiry');
const segmentIdx    = header.indexOf('segment');

console.log('Header cols:', header);
console.log('Sample line:', lines[1]);
console.log('\nAll FUT instruments (first 20):');
for (const line of lines.slice(1, 21)) {
  if (!line.trim()) continue;
  const cols = line.split(',');
  if (cols[instrTypeIdx] === 'FUT') {
    console.log(`name="${cols[nameIdx]}" symbol="${cols[symbolIdx]}" type="${cols[instrTypeIdx]}" token="${cols[tokenIdx]}" expiry="${cols[expiryIdx]}"`);
  }
}
