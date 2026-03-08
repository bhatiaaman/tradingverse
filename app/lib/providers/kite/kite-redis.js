// Shared Redis helpers scoped to the kite: namespace.
// Extracted from the duplicated redisGet/Set/Del pattern across ~20 API routes.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

export const kiteKey = (name) => `${NS}:kite:${name}`;

export async function kiteRedisGet(name) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res  = await fetch(`${REDIS_URL}/get/${kiteKey(name)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ?? null;
  } catch { return null; }
}

export async function kiteRedisSet(name, value, ttl) {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  try {
    const encoded = encodeURIComponent(String(value));
    const url     = ttl
      ? `${REDIS_URL}/set/${kiteKey(name)}/${encoded}?ex=${ttl}`
      : `${REDIS_URL}/set/${kiteKey(name)}/${encoded}`;
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result === 'OK';
  } catch { return false; }
}

export async function kiteRedisDel(name) {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  try {
    const res  = await fetch(`${REDIS_URL}/del/${kiteKey(name)}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return (data.result ?? 0) >= 0;
  } catch { return false; }
}
