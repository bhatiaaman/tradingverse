// ── POST /api/third-eye/scan ──────────────────────────────────────────────────
// Server-side Third Eye scan engine.
//
// Architecture:
//   1. Fetch candles from /api/nifty-chart (Redis-cached, no direct Kite calls)
//   2. Read bias state from Redis (persists across page refreshes)
//   3. Detect new trading day → auto-reset bias to NEUTRAL
//   4. Run thirdEye.js scan for each unsealed candle newer than last processed
//   5. Apply bias transitions via thirdEye-bias.js (guarded, no flip-flopping)
//   6. Generate narrative via thirdEye-narrative.js (decisive labels)
//   7. Write updated bias + rolling log back to Redis
//   8. Return { biasState, log, live, scanStatus }
//
// Called by the Third Eye panel every 30 seconds.
// The page is a read-only consumer — no bias logic in the client.

import { NextResponse } from 'next/server';
import { requireSession, unauthorized } from '@/app/lib/session';
import { intelligenceLimiter, checkLimit } from '@/app/lib/rate-limit';
import { runThirdEye, precompute, buildContext } from '@/app/lib/thirdEye.js';
import { applyBiasTransition, freshBiasState, isNewTradingDay, todayIST } from '@/app/lib/thirdEye-bias.js';
import { buildNarrative } from '@/app/lib/thirdEye-narrative.js';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

const BIAS_KEY    = (sym) => `${NS}:third-eye:bias:${sym}`;
const LOG_KEY     = (sym, date) => `${NS}:third-eye:log:${sym}:${date}`;
const LIVE_KEY    = (sym) => `${NS}:third-eye:live:${sym}`;

const BIAS_TTL    = 86400;     // 24h — auto-expires overnight
const LOG_TTL     = 86400;     // 24h — log expires at end of day
const LIVE_TTL    = 90;        // 90s — live entry is always current
const LOG_MAX     = 15;        // max entries in rolling log
const CANDLE_CACHE_TTL = 30;   // seconds — how fresh nifty-chart data is

// ─────────────────────────────────────────────────────────────────────────────
// Redis helpers
// ─────────────────────────────────────────────────────────────────────────────

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return null;
    try { return JSON.parse(data.result); } catch { return data.result; }
  } catch { return null; }
}

async function redisSet(key, value, ttl) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url = `${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}${ttl ? `?ex=${ttl}` : ''}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// VWAP calculator (intraday only — resets at session start each day)
// ─────────────────────────────────────────────────────────────────────────────

function computeVWAP(candles) {
  const IST_S = 5.5 * 3600;
  const todayStr = new Date(Date.now() + IST_S * 1000).toISOString().slice(0, 10);
  const todayCandles = candles.filter(c => {
    const d = new Date((c.time + IST_S) * 1000).toISOString().slice(0, 10);
    return d === todayStr;
  });
  const src = todayCandles.length ? todayCandles : candles;
  let cumTPV = 0, cumVol = 0;
  return src.map(c => {
    const tp  = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1; // index instruments have 0 volume
    cumTPV += tp * vol;
    cumVol += vol;
    return { time: c.time, value: parseFloat((cumTPV / cumVol).toFixed(2)) };
  });
}

// RSI(14) — last value only
function computeLastRSI(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  return avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
}

// RSI value at candle index idx
function computeRSIAt(candles, idx, period = 14) {
  return computeLastRSI(candles.slice(0, idx + 1), period);
}

// ─────────────────────────────────────────────────────────────────────────────
// Time helpers
// ─────────────────────────────────────────────────────────────────────────────

function candleTimeStr(candle) {
  const d = new Date((candle.time + 19800) * 1000);
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

function candleDateIST(candle) {
  return new Date((candle.time + 19800) * 1000).toISOString().slice(0, 10);
}

function isMarketHours() {
  const ist  = new Date(Date.now() + 5.5 * 3600 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const day  = ist.getUTCDay();
  return day !== 0 && day !== 6 && mins >= 555 && mins <= 960;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req) {
  if (!await requireSession()) return unauthorized();

  const rl = await checkLimit(intelligenceLimiter, req);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfter: rl.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  try {
    const body     = await req.json().catch(() => ({}));
    const symbol   = (body.symbol   || 'NIFTY').toUpperCase();
    const interval = body.interval  || '5minute';
    const env      = body.env       || 'medium';
    const cfg      = body.cfg       || {};  // setup config from eye-settings

    // ── Validate inputs ─────────────────────────────────────────────────────
    if (!/^[A-Z0-9]{1,20}$/.test(symbol)) {
      return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
    }
    if (!['5minute', '15minute'].includes(interval)) {
      return NextResponse.json({ error: 'Invalid interval (5minute or 15minute)' }, { status: 400 });
    }

    // ── Fetch candles via cached nifty-chart ─────────────────────────────────
    // Uses the existing Redis cache (60s TTL) — no direct Kite calls.
    // This keeps us within API rate limits even with 30s polling.
    const baseUrl = `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('host')}`;
    const chartRes = await fetch(`${baseUrl}/api/nifty-chart?symbol=${symbol}&interval=${interval}&days=5`, {
      headers: { Cookie: req.headers.get('cookie') || '' },
      cache: 'no-store',
    });
    const chartData = await chartRes.json();

    if (!chartData.candles?.length) {
      return NextResponse.json({ error: chartData.error || 'No candle data', biasState: null, log: [], live: null });
    }

    const allCandles = chartData.candles;
    const today = todayIST();

    // ── Load or initialise bias state ───────────────────────────────────────
    let biasState = await redisGet(BIAS_KEY(symbol));
    if (!biasState || isNewTradingDay(biasState.date)) {
      biasState = freshBiasState();
      // Write fresh state immediately so even if scan fails we have a clean slate
      await redisSet(BIAS_KEY(symbol), biasState, BIAS_TTL);
    }

    // ── Load existing log for today ─────────────────────────────────────────
    let log = await redisGet(LOG_KEY(symbol, today)) || [];

    // ── Market hours check ──────────────────────────────────────────────────
    if (!isMarketHours()) {
      const liveEntry = await redisGet(LIVE_KEY(symbol));
      return NextResponse.json({
        biasState,
        log,
        live:       liveEntry,
        scanStatus: { marketClosed: true },
        today,
      });
    }

    // ── Determine which sealed candles haven't been processed yet ─────────────
    const todayCandles = allCandles.filter(c => candleDateIST(c) === today);
    // All candles except the current forming one are "sealed"
    const sealedCandles = todayCandles.slice(0, -1);
    const lastProcessedTime = biasState.lastUpdated
      ? sealedCandles.findIndex(c => candleTimeStr(c) > biasState.lastUpdated) === -1
        ? 'processed_all'
        : null
      : null;

    // Find sealed candles not yet in log (compare by HH:MM string)
    const loggedTimes = new Set(log.map(e => e.time));
    const toProcess = sealedCandles.filter(c => !loggedTimes.has(candleTimeStr(c)));

    // Precompute VWAP over all candles (resets to today's session automatically)
    const vwapData = computeVWAP(allCandles);

    // ── Process each new sealed candle ──────────────────────────────────────
    const newEntries = [];
    let quietCount = 0; // consecutive candles with no strong setup

    for (const targetCandle of toProcess) {
      const timeStr  = candleTimeStr(targetCandle);
      const candleIdx = allCandles.indexOf(targetCandle);
      const candlesUpTo = allCandles.slice(0, candleIdx + 1);
      if (candlesUpTo.length < 3) continue;

      try {
        const rsiVal = computeRSIAt(allCandles, candleIdx);
        const result = runThirdEye(candlesUpTo, vwapData, rsiVal, env, cfg);
        const context = result.context;
        const topSetup = result.strongSetups?.[0] ?? result.watchList?.[0] ?? null;

        // Apply bias state machine
        const newBiasState = applyBiasTransition(biasState, result, context);

        // Track quiet candle count
        if (!topSetup || (topSetup?.score ?? 0) < 4) {
          quietCount++;
        } else {
          quietCount = 0;
        }

        // Build narrative using new bias state
        const narrative = buildNarrative(
          { time: timeStr, topSetup, context, candle: targetCandle, rawPatterns: result.rawPatterns },
          newBiasState,
          quietCount
        );

        // Update bias state (add since/date tracking)
        if (newBiasState.changed || !biasState.since) {
          biasState = {
            ...newBiasState,
            date:        today,
            since:       newBiasState.changed ? timeStr : biasState.since,
            lastUpdated: timeStr,
          };
        } else {
          biasState = { ...biasState, ...newBiasState, date: today, lastUpdated: timeStr };
        }

        newEntries.push({
          time:        timeStr,
          topSetup,
          context,
          candle:      { open: targetCandle.open, high: targetCandle.high, low: targetCandle.low, close: targetCandle.close },
          rawPatterns: result.rawPatterns ?? [],
          narrative,
          bias:        biasState.bias,
          biasChanged: newBiasState.changed,
          biasReason:  newBiasState.reason,
        });

      } catch (err) {
        console.error(`[third-eye/scan] candle ${timeStr} error:`, err.message);
        // Advance past failed candle — don't retry forever
        biasState.lastUpdated = timeStr;
      }
    }

    // ── Live candle (current forming, not yet sealed) ─────────────────────────
    const liveCandle = todayCandles[todayCandles.length - 1];
    let liveEntry = null;
    if (liveCandle && allCandles.length >= 3) {
      try {
        const liveRSI    = computeLastRSI(allCandles);
        const liveResult = runThirdEye(allCandles, vwapData, liveRSI, env, cfg);
        const liveTimeStr = candleTimeStr(liveCandle);
        const now = new Date(Date.now() + 19800 * 1000);
        const nowStr = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;
        liveEntry = {
          time:       liveTimeStr,
          updatedAt:  nowStr,
          topSetup:   liveResult.strongSetups?.[0] ?? liveResult.watchList?.[0] ?? null,
          context:    liveResult.context,
          candle:     { open: liveCandle.open, high: liveCandle.high, low: liveCandle.low, close: liveCandle.close },
          rawPatterns: liveResult.rawPatterns ?? [],
          bias:       biasState.bias,
          isLive:     true,
          // Live narrative reflects current bias + current forming candle
          narrative:  buildNarrative(
            { time: liveTimeStr, topSetup: liveResult.strongSetups?.[0] ?? null, context: liveResult.context, candle: liveCandle },
            { ...biasState, changed: false, reason: null, prevBias: biasState.bias },
            quietCount
          ),
        };
        await redisSet(LIVE_KEY(symbol), liveEntry, LIVE_TTL);
      } catch { /* live card failure is non-fatal */ }
    }

    // ── Merge new entries into log (newest-first, deduplicated, capped) ───────
    if (newEntries.length > 0) {
      const merged = [...[...newEntries].reverse(), ...log];
      const seen = new Set();
      log = merged.filter(e => {
        if (seen.has(e.time)) return false;
        seen.add(e.time); return true;
      }).slice(0, LOG_MAX);

      await Promise.all([
        redisSet(LOG_KEY(symbol, today), log, LOG_TTL),
        redisSet(BIAS_KEY(symbol), biasState, BIAS_TTL),
      ]);
    } else if (newEntries.length === 0 && toProcess.length === 0) {
      // Nothing new — persist bias in case it was freshly initialised
      await redisSet(BIAS_KEY(symbol), biasState, BIAS_TTL);
    }

    return NextResponse.json({
      biasState: {
        bias:        biasState.bias,
        since:       biasState.since,
        pendingFlip: biasState.pendingFlip,
        date:        biasState.date,
      },
      log,
      live:       liveEntry,
      scanStatus: {
        processed:  newEntries.length,
        pending:    toProcess.length,
        lastTime:   biasState.lastUpdated,
        today,
      },
    });

  } catch (err) {
    console.error('[third-eye/scan]', err.message);
    return NextResponse.json({ error: 'Scan failed', detail: err.message }, { status: 500 });
  }
}
