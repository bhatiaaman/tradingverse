// Shared helper — reads Kite credentials from Redis overrides + process.env
// No internal HTTP calls, works on Vercel without NEXT_PUBLIC_BASE_URL

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Namespace keys by environment so staging and prod don't clash in same Redis db
// Set REDIS_NAMESPACE=staging or REDIS_NAMESPACE=prod in Vercel env vars
const NS = process.env.REDIS_NAMESPACE || 'default';

function key(name) {
  return `${NS}:kite:${name}`;
}

async function redisGet(k) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/get/${k}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ?? null;
  } catch {
    return null;
  }
}

// Module-level cache — Vercel reuses warm instances across requests.
// Credentials are valid for 30s before re-checking Redis.
// Trade-off: a kite-config disconnect takes up to 30s to propagate.
let _cred   = null;
let _credTs = 0;
const CRED_CACHE_TTL = 30_000; // 30 seconds

export async function getKiteCredentials() {
  if (_cred && Date.now() - _credTs < CRED_CACHE_TTL) return _cred;

  // Fetch all 3 Redis keys in parallel instead of sequentially
  const [redisApiKey, redisAccessToken, disconnected] = await Promise.all([
    redisGet(key('api_key')),
    redisGet(key('access_token')),
    redisGet(key('disconnected')),
  ]);

  const apiKey = redisApiKey || process.env.KITE_API_KEY || '';

  const accessToken = (disconnected === '1')
    ? ''
    : (redisAccessToken || process.env.KITE_ACCESS_TOKEN || '');

  _cred   = { apiKey, accessToken };
  _credTs = Date.now();
  return _cred;
}

// Call this after kite-config changes so the next request re-fetches from Redis
export function invalidateCredentialsCache() {
  _cred   = null;
  _credTs = 0;
}