// ── Scan Enrichment ────────────────────────────────────────────────────────────
// Fetches 15m + daily candles per stock, classifies the signal type from the
// 4 sub-conditions in the Chartink bullish scan, computes SL/target from ATR
// and key levels, and stores results in Redis for the scanner page to consume.

import { redis } from './redis';
import { getDataProvider } from './providers';

const NS = process.env.REDIS_NAMESPACE || 'default';

// ── Redis helpers (using SDK) ─────────────────────────────────────────────────
async function rGet(key)          { try { return await redis.get(key); } catch { return null; } }
async function rSet(key, val, ex) { try { await redis.set(key, val, { ex }); } catch {} }

// ── Date helpers (IST) ────────────────────────────────────────────────────────
function getIST(offsetDays = 0) {
  const now = new Date();
  const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000);
  if (offsetDays) ist.setDate(ist.getDate() + offsetDays);
  return ist;
}

function fmtDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function todayISTStr() {
  const ist = getIST();
  const p = n => String(n).padStart(2, '0');
  return `${ist.getFullYear()}-${p(ist.getMonth() + 1)}-${p(ist.getDate())}`;
}

// ── NSE EQ token map (reuse chart-data cache) ─────────────────────────────────
async function getNSETokenMap(dp) {
  const cacheKey = `${NS}:nse-eq-tokens`;
  const cached = await rGet(cacheKey);
  if (cached) return cached;

  const csvText = await dp.getInstrumentsCSV('NSE');
  const lines = csvText.trim().split('\n');
  const tokenMap = {};
  for (let i = 1; i < lines.length; i++) {
    const cols  = lines[i].split(',');
    const token = parseInt(cols[0]);
    const sym   = cols[2]?.replace(/"/g, '').trim();
    const type  = cols[9]?.replace(/"/g, '').trim();
    if (type === 'EQ' && sym && token) tokenMap[sym] = token;
  }
  await rSet(cacheKey, tokenMap, 86400);
  return tokenMap;
}

// ── Indicator computations ────────────────────────────────────────────────────

function computeATR(candles, period = 14) {
  if (candles.length < 2) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function computeRSI(candles, period = 12) {
  if (candles.length < period + 1) return null;
  const closes = candles.map(c => c.close);
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const ag = gains / period, al = losses / period;
  if (al === 0) return 100;
  return parseFloat((100 - 100 / (1 + ag / al)).toFixed(1));
}

function computeVWAP(candles) {
  let sumTP = 0, sumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    sumTP += tp * (c.volume || 0);
    sumVol += (c.volume || 0);
  }
  return sumVol > 0 ? sumTP / sumVol : null;
}

function computeVolRatio(todayCandles, histCandles, period = 20) {
  if (!todayCandles?.length) return null;
  const recent = todayCandles[todayCandles.length - 1]?.volume || 0;
  const hist   = histCandles.slice(-period).filter((_, i, a) => i < a.length - 1); // exclude latest
  if (!hist.length) return null;
  const avg = hist.reduce((s, c) => s + (c.volume || 0), 0) / hist.length;
  return avg > 0 ? parseFloat((recent / avg).toFixed(2)) : null;
}

// Ichimoku Cloud Top at current bar (uses the cloud projected from 26 bars ago)
// Requires at least 78 candles (26 + 52)
function computeIchimokuCloudTop(candles) {
  const refEnd = candles.length - 26; // 26 bars ago index (exclusive)
  if (refEnd < 52) return null;

  const sub = candles.slice(0, refEnd);

  const conv9 = sub.slice(-9);
  const convH = Math.max(...conv9.map(c => c.high));
  const convL = Math.min(...conv9.map(c => c.low));
  const convLine = (convH + convL) / 2;

  const base26 = sub.slice(-26);
  const baseH = Math.max(...base26.map(c => c.high));
  const baseL = Math.min(...base26.map(c => c.low));
  const baseLine = (baseH + baseL) / 2;

  const spanA = (convLine + baseLine) / 2;

  const span52 = sub.slice(-52);
  const spanBH = Math.max(...span52.map(c => c.high));
  const spanBL = Math.min(...span52.map(c => c.low));
  const spanB  = (spanBH + spanBL) / 2;

  return Math.max(spanA, spanB);
}

// ── Session filter: keep only 9:15–15:30 IST bars for a given date string ─────
const IST_MS = 330 * 60 * 1000;

function filterSessionCandles(candles, dateStr) {
  return candles.filter(c => {
    const ist  = new Date(new Date(c.date).getTime() + IST_MS);
    const cStr = ist.toISOString().slice(0, 10);
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return cStr === dateStr && mins >= 555 && mins <= 930; // 9:15–15:30
  });
}

// ── Signal classification (maps to the 4 scan sub-conditions) ─────────────────
// S1: PDH BO (full candle + RSI>70 + large candle) → PDH_BO_STRONG ★★★★
// S2: VWAP+RSI crossover                           → VWAP_RSI_BO   ★★★
// S3: PDL Reclaim                                  → PDL_RECLAIM   ★★★
// S4: PDH BO + Cloud                               → PDH_BO_CLOUD  ★★★★
function classifySignal({ triggerPrice, prevClose15m, pdh, pdl, vwap, prevVwap, cloudTop, rsi, prevRsi }) {
  const aboveVwap   = vwap     != null && triggerPrice > vwap;
  const aboveCloud  = cloudTop != null && triggerPrice > cloudTop;
  const brokeAbovePDH = pdh != null && triggerPrice > pdh && prevClose15m != null && prevClose15m < pdh;
  const brokeAbovePDL = pdl != null && triggerPrice > pdl && prevClose15m != null && prevClose15m < pdl;
  const vwapCrossed = vwap != null && prevVwap != null && prevClose15m != null
                        && prevClose15m <= prevVwap && triggerPrice > vwap;
  const rsiCrossed70 = rsi != null && prevRsi != null && prevRsi <= 70 && rsi > 70;

  // S4 / S1: PDH breakout — strongest signal
  if (brokeAbovePDH && aboveVwap && aboveCloud) {
    return { type: 'PDH_BO_CLOUD', label: 'PDH Breakout', stars: 4, slBase: 'cloud', dir: 'bull' };
  }
  if (brokeAbovePDH && aboveVwap && rsi != null && rsi > 70) {
    return { type: 'PDH_BO_STRONG', label: 'PDH Breakout', stars: 4, slBase: 'cloud_or_vwap', dir: 'bull' };
  }
  // S3: PDL Reclaim
  if (brokeAbovePDL && aboveVwap) {
    return { type: 'PDL_RECLAIM', label: 'PDL Reclaim', stars: 3, slBase: 'pdl', dir: 'bull' };
  }
  // S2: VWAP + RSI crossover
  if ((vwapCrossed || aboveVwap) && (rsiCrossed70 || (rsi != null && rsi > 70))) {
    return { type: 'VWAP_RSI_BO', label: 'VWAP+RSI BO', stars: 3, slBase: 'vwap', dir: 'bull' };
  }
  // PDH breakout without full confirmation
  if (brokeAbovePDH) {
    return { type: 'PDH_BO', label: 'PDH Breakout', stars: 3, slBase: 'vwap', dir: 'bull' };
  }
  // Generic
  return { type: 'MOMENTUM', label: 'Momentum', stars: 2, slBase: 'atr', dir: 'bull' };
}

// ── SL + target derivation ────────────────────────────────────────────────────
// Strategy: find the nearest structure level BELOW entry price, add a small buffer.
// Priority: PDH (now support) > VWAP > Cloud top > PDL > ATR fallback
// The SL must be at least 0.3% below entry and at most 3% below entry.
function computeLevels({ triggerPrice, atr15m, vwap, cloudTop, pdh, pdl, signal }) {
  const minSlDist = triggerPrice * 0.003; // at least 0.3% risk
  const maxSlDist = triggerPrice * 0.03;  // cap at 3% risk

  // Collect candidate support levels that are BELOW trigger price with a small buffer
  const candidates = [];
  if (pdh  && pdh  < triggerPrice && triggerPrice - pdh  <= maxSlDist) candidates.push(pdh  - minSlDist * 0.3);
  if (vwap && vwap < triggerPrice && triggerPrice - vwap <= maxSlDist) candidates.push(vwap - minSlDist * 0.3);
  if (cloudTop && cloudTop < triggerPrice && triggerPrice - cloudTop <= maxSlDist) candidates.push(cloudTop - minSlDist * 0.3);
  if (pdl  && pdl  < triggerPrice && triggerPrice - pdl  <= maxSlDist) candidates.push(pdl  - minSlDist * 0.3);

  // Pick the nearest (highest) support level below entry
  let sl = candidates.length > 0
    ? Math.max(...candidates)
    : null;

  // If no structure level is within 3% — or structure-based SL is too tight — use ATR
  if (!sl || triggerPrice - sl < minSlDist) {
    sl = atr15m
      ? triggerPrice - atr15m * 1.5
      : triggerPrice * 0.985;
  }

  // Hard cap: never more than 3% risk
  if (triggerPrice - sl > maxSlDist) sl = triggerPrice - maxSlDist;

  sl = parseFloat(sl.toFixed(2));

  const risk    = triggerPrice - sl;
  const target1 = parseFloat((triggerPrice + risk * 1.5).toFixed(2));
  const target2 = parseFloat((triggerPrice + risk * 3.0).toFixed(2));
  const riskPct = parseFloat((risk / triggerPrice * 100).toFixed(2));

  return { entry: parseFloat(triggerPrice.toFixed(2)), sl, target1, target2, riskPct, rrRatio: 1.5 };
}

// ── Enrich a single stock ─────────────────────────────────────────────────────
async function enrichStock(symbol, triggerPrice, dp, tokenMap) {
  const token = tokenMap[symbol];
  if (!token) return { symbol, triggerPrice, enrichFailed: true, reason: 'token not found' };

  const now    = getIST();
  const today  = fmtDate(now);
  const from5d = fmtDate(getIST(-6));   // 6 calendar days → ~4–5 trading days of 15m
  const from10d= fmtDate(getIST(-12));  // 12 calendar days → ~8 trading days for daily

  const [candles15m, candlesDay] = await Promise.all([
    dp.getHistoricalData(token, '15minute', from5d, today).catch(() => []),
    dp.getHistoricalData(token, 'day',      from10d, today).catch(() => []),
  ]);

  if (!candles15m?.length) {
    return { symbol, triggerPrice, enrichFailed: true, reason: 'no 15m candles' };
  }

  const todayStr     = todayISTStr();
  const todayCandles = filterSessionCandles(candles15m, todayStr);

  // If Chartink didn't send a price, use the last candle close as trigger price
  if (!triggerPrice || triggerPrice <= 0) {
    const lastCandle = todayCandles.length > 0
      ? todayCandles[todayCandles.length - 1]
      : candles15m[candles15m.length - 1];
    triggerPrice = lastCandle?.close || 0;
  }

  if (!triggerPrice) {
    return { symbol, triggerPrice: 0, enrichFailed: true, reason: 'could not determine price' };
  }

  // For indicators requiring history (RSI, ATR, Ichimoku): use all recent candles
  const histCandles = candles15m.slice(-120); // up to 120 bars (~4 trading days of 15m)

  // PDH and PDL from daily — second-to-last bar is previous trading day
  const pdh = candlesDay.length >= 2 ? candlesDay[candlesDay.length - 2].high  : null;
  const pdl = candlesDay.length >= 2 ? candlesDay[candlesDay.length - 2].low   : null;

  // Indicator values
  const atr15m   = computeATR(histCandles, 14);
  const rsi      = computeRSI(histCandles, 12);
  const prevRsi  = histCandles.length >= 14 ? computeRSI(histCandles.slice(0, -1), 12) : null;
  const vwap     = todayCandles.length > 0  ? computeVWAP(todayCandles) : null;
  // VWAP at previous bar: compute from today's candles excluding the last one
  const prevVwap = todayCandles.length > 1  ? computeVWAP(todayCandles.slice(0, -1)) : null;
  const cloudTop = histCandles.length >= 78 ? computeIchimokuCloudTop(histCandles) : null;
  const volRatio = computeVolRatio(todayCandles, histCandles, 20);

  // Previous 15m close (bar before trigger)
  const prevClose15m = todayCandles.length >= 2
    ? todayCandles[todayCandles.length - 2].close
    : (histCandles.length >= 2 ? histCandles[histCandles.length - 2].close : null);

  // Signal classification
  const signal = classifySignal({ triggerPrice, prevClose15m, pdh, pdl, vwap, prevVwap, cloudTop, rsi, prevRsi });

  // Trade levels
  const levels = computeLevels({ triggerPrice, atr15m, vwap, cloudTop, pdh, pdl, signal });

  // Context chips (what conditions are confirmed)
  const aboveVwap  = vwap     != null ? triggerPrice > vwap     : null;
  const aboveCloud = cloudTop != null ? triggerPrice > cloudTop : null;
  const volSpike   = volRatio != null ? volRatio > 1.5          : null;

  return {
    symbol,
    triggerPrice,
    signal: { type: signal.type, label: signal.label, stars: signal.stars, dir: signal.dir },
    context: {
      aboveVwap,
      aboveCloud,
      rsi,
      rsiStrong: rsi != null ? rsi > 60 : null,
      volRatio,
      volSpike,
      vwap:     vwap     != null ? parseFloat(vwap.toFixed(2))     : null,
      cloudTop: cloudTop != null ? parseFloat(cloudTop.toFixed(2)) : null,
      pdh,
      pdl,
      atr15m:   atr15m   != null ? parseFloat(atr15m.toFixed(2))   : null,
    },
    levels,
    enrichedAt: new Date().toISOString(),
    enrichFailed: false,
  };
}

// ── Main: enrich all stocks in a scan (called from webhook via after()) ────────
export async function enrichScan(scanId, stocks) {
  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      console.log('[scan-enrich] Kite not connected, skipping enrichment');
      return;
    }

    const tokenMap = await getNSETokenMap(dp);
    const results  = [];
    const BATCH    = 4; // parallel requests per batch — avoid overwhelming Kite

    for (let i = 0; i < stocks.length; i += BATCH) {
      const batch = stocks.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(({ symbol, price }) => {
          // Chartink free plan sends no prices — tp will be 0; enrichStock handles fallback
          const tp = parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0;
          if (!symbol) return Promise.resolve({ symbol, enrichFailed: true, reason: 'missing symbol' });
          return enrichStock(symbol, tp, dp, tokenMap)
            .catch(e => ({ symbol, triggerPrice: tp, enrichFailed: true, reason: e.message }));
        })
      );
      results.push(...batchResults);
    }

    const key = `${NS}:scan-enriched:${scanId}`;
    await rSet(key, results, 86400); // 24h TTL

    const ok = results.filter(r => !r.enrichFailed).length;
    console.log(`[scan-enrich] ${ok}/${stocks.length} stocks enriched for scan ${scanId}`);
  } catch (e) {
    console.error('[scan-enrich] fatal:', e.message);
  }
}

// ── Fetch enriched data for a scan ───────────────────────────────────────────
export async function getScanEnriched(scanId) {
  if (!scanId) return null;
  return await rGet(`${NS}:scan-enriched:${scanId}`);
}
