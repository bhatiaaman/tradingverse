// ─── In-memory TTL cache ──────────────────────────────────────────────────────
// Shared across all API routes in the same serverless process instance.
// Eliminates repeated Redis roundtrips for stable market data.
//
// Keys excluded from caching (need real-time accuracy):
//   order_queue / order_status / order_dedup — order lifecycle
//   kite:* — Kite credentials must always be fresh
//   session:* — session tokens
//   oi-snapshot / session-recent — OI comparison baselines (need real delta)

const store = new Map(); // key → { value, expiresAt }

export function shouldMemCache(key) {
  const k = String(key ?? '');
  if (k.includes(':order_'))        return false;
  if (k.includes(':kite:'))         return false;
  if (k.includes(':session:'))      return false;
  if (k.includes('oi-snapshot'))    return false;
  if (k.includes('session-recent')) return false;
  if (k.includes('session-open'))   return false;
  return true;
}

export function memGet(key) {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { store.delete(key); return null; }
  return e.value;
}

export function memSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Periodic cleanup — remove expired entries (runs every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of store) {
    if (now > e.expiresAt) store.delete(k);
  }
}, 5 * 60 * 1000);
