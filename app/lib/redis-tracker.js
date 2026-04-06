// ─────────────────────────────────────────────────────────────────────────────
// Redis Command Tracker
// Wraps a Redis client (or raw fetch-based helpers) to count every command
// made per caller tag. Stats accumulate in module-level state for the lifetime
// of a serverless instance (warm cache between invocations on the same worker).
//
// Usage:
//   import { trackRedis, getRedisStats, resetRedisStats } from '@/app/lib/redis-tracker';
//   const result = await trackRedis('market-commentary', () => redis.get(key));
//
// The admin endpoint /api/admin/redis-stats reads getRedisStats().
// ─────────────────────────────────────────────────────────────────────────────

// Module-level accumulator — survives warm serverless invocations on same worker
const stats = {
  // perCaller: { [callerTag]: { calls: N, lastCalledAt: iso } }
  perCaller: {},
  // total commands across all callers since this worker started
  totalCalls: 0,
  // worker start time
  startedAt: new Date().toISOString(),
  // rolling log of last 50 calls (ring buffer)
  recentLog: [],
};

const LOG_SIZE = 50;

/**
 * Wraps a Redis operation with tracking.
 * @param {string} caller   - Label for the API/route making the call (e.g. 'market-commentary')
 * @param {Function} fn     - Async function that performs the Redis operation and returns a value
 * @param {string} [op]     - Optional operation name for the log (e.g. 'get', 'set')
 * @returns {Promise<any>}  - Whatever fn() returns
 */
export async function trackRedis(caller, fn, op = 'cmd') {
  const start = Date.now();
  let error = null;
  try {
    return await fn();
  } catch (e) {
    error = e.message;
    throw e;
  } finally {
    const ms = Date.now() - start;

    // Update per-caller bucket
    if (!stats.perCaller[caller]) {
      stats.perCaller[caller] = { calls: 0, errors: 0, totalMs: 0, lastCalledAt: null };
    }
    stats.perCaller[caller].calls++;
    stats.perCaller[caller].totalMs += ms;
    stats.perCaller[caller].lastCalledAt = new Date().toISOString();
    if (error) stats.perCaller[caller].errors++;

    stats.totalCalls++;

    // Ring buffer log entry
    const entry = {
      t: new Date().toISOString(),
      caller,
      op,
      ms,
      ...(error ? { error } : {}),
    };
    stats.recentLog.push(entry);
    if (stats.recentLog.length > LOG_SIZE) stats.recentLog.shift();

    // Console log — shows up in Vercel function logs
    if (error) {
      console.error(`[redis] ${caller}:${op} ERROR in ${ms}ms — ${error}`);
    } else if (ms > 300) {
      // Log slow calls
      console.warn(`[redis-slow] ${caller}:${op} took ${ms}ms`);
    }
  }
}

/**
 * Returns a snapshot of the current stats.
 */
export function getRedisStats() {
  const callerList = Object.entries(stats.perCaller)
    .map(([name, s]) => ({
      caller:      name,
      calls:       s.calls,
      errors:      s.errors,
      avgMs:       s.calls > 0 ? Math.round(s.totalMs / s.calls) : 0,
      lastCalledAt: s.lastCalledAt,
    }))
    .sort((a, b) => b.calls - a.calls); // highest call count first

  return {
    totalCalls:  stats.totalCalls,
    startedAt:   stats.startedAt,
    uptimeMin:   Math.round((Date.now() - new Date(stats.startedAt).getTime()) / 60000),
    callerList,
    recentLog:   [...stats.recentLog].reverse(), // newest first
  };
}

/**
 * Resets accumulated stats (useful for admin "clear" action).
 */
export function resetRedisStats() {
  stats.perCaller  = {};
  stats.totalCalls = 0;
  stats.startedAt  = new Date().toISOString();
  stats.recentLog  = [];
}

/**
 * Convenience: wrap a plain fetch-based redisGet/redisSet helper pattern.
 * Use when you can't import the shared Redis client (e.g. middleware runs in Edge).
 *
 * Example:
 *   const val = await trackedFetch('middleware', 'get', () =>
 *     fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
 *       .then(r => r.json()).then(d => d.result)
 *   );
 */
export const trackedFetch = trackRedis;
