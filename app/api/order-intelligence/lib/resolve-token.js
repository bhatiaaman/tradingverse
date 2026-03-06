// Copyright (c) 2025 Amandeep Bhatia — TradePreflight
// Licensed under Apache 2.0 — https://github.com/amanbhatia/tradepreflight
import { getKiteCredentials } from '@/app/lib/kite-credentials';

// ─────────────────────────────────────────────────────────────────────────────
// Hardcoded tokens for indices (not in NSE instruments list as EQ type)
// ─────────────────────────────────────────────────────────────────────────────
const INDEX_TOKENS = {
  NIFTY:       256265,
  BANKNIFTY:   260105,
  FINNIFTY:    257801,
  MIDCPNIFTY:  288009,
  SENSEX:      265,
};

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const REDIS_KEY   = `${NS}:nse-token-map`;
const REDIS_TTL   = 24 * 60 * 60; // 24 hours

// ─────────────────────────────────────────────────────────────────────────────
// Redis helpers (same pattern as other routes)
// ─────────────────────────────────────────────────────────────────────────────
async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, exSeconds) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${key}/${encoded}?ex=${exSeconds}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch (e) { console.error('resolve-token: redis set error', e); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build symbol→token map from Kite NSE instruments CSV
// ─────────────────────────────────────────────────────────────────────────────
async function buildTokenMap(apiKey, accessToken) {
  const res = await fetch('https://api.kite.trade/instruments/NSE', {
    headers: {
      'Authorization':  `token ${apiKey}:${accessToken}`,
      'X-Kite-Version': '3',
    },
  });
  if (!res.ok) {
    console.error('resolve-token: instruments fetch failed', res.status);
    return {};
  }

  const csv  = await res.text();
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return {};

  const hdrs   = lines[0].split(',');
  const symIdx = hdrs.indexOf('tradingsymbol');
  const tokIdx = hdrs.indexOf('instrument_token');
  const typIdx = hdrs.indexOf('instrument_type');

  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols[typIdx]?.trim() === 'EQ') {
      const sym = cols[symIdx]?.trim().toUpperCase();
      const tok = parseInt(cols[tokIdx], 10);
      if (sym && !isNaN(tok)) map[sym] = tok;
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — returns instrument_token for symbol, or null on failure
// Caches in Redis (24h TTL) so Vercel serverless invocations share the map.
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveToken(symbol) {
  const upper = symbol?.toUpperCase();
  if (!upper) return null;

  // Indices: return hardcoded token immediately
  if (INDEX_TOKENS[upper] != null) return INDEX_TOKENS[upper];

  // Try Redis first — shared across all Vercel invocations
  let tokenMap = await redisGet(REDIS_KEY);

  if (!tokenMap) {
    try {
      const { apiKey, accessToken } = await getKiteCredentials();
      if (!apiKey || !accessToken) return null;
      tokenMap = await buildTokenMap(apiKey, accessToken);
      if (Object.keys(tokenMap).length > 0) {
        await redisSet(REDIS_KEY, tokenMap, REDIS_TTL);
      }
    } catch (e) {
      console.error('resolve-token: cache build failed', e);
      return null;
    }
  }

  return tokenMap[upper] ?? null;
}
