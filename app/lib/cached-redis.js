// ─── Cached Redis (REST) ──────────────────────────────────────────────────────
// Wraps raw Upstash REST API calls with the in-memory layer.
// Import cachedRedisGet / cachedRedisSet in high-frequency routes instead of
// doing raw fetch() calls against the REST URL directly.
//
// Memory TTL is capped at 25 s so reads are always at most 25 s stale.
// The underlying Redis TTL (set by callers) is unchanged.

import { shouldMemCache, memGet, memSet } from './mem-cache.js';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const MEM_TTL_MS = 25_000; // 25 s in-memory TTL

export async function cachedRedisGet(key) {
  if (shouldMemCache(key)) {
    const hit = memGet(key);
    if (hit !== null) return hit;
  }

  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json();
    if (!json.result) return null;

    const value = (() => {
      try { return JSON.parse(json.result); } catch { return json.result; }
    })();

    if (shouldMemCache(key) && value !== null) {
      memSet(key, value, MEM_TTL_MS);
    }
    return value;
  } catch {
    return null;
  }
}

export async function cachedRedisSet(key, value, exSeconds) {
  // Write to memory first (cap at MEM_TTL_MS)
  if (shouldMemCache(key) && exSeconds) {
    memSet(key, value, Math.min(exSeconds * 1000, MEM_TTL_MS));
  }

  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url = exSeconds
      ? `${REDIS_URL}/set/${key}/${encoded}?ex=${exSeconds}`
      : `${REDIS_URL}/set/${key}/${encoded}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch (e) {
    console.error('[cached-redis] set error:', e.message);
  }
}
