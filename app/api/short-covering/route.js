import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';
import { computeVWAP } from '@/app/lib/chart-indicators';
import { cachedRedisGet as redisGet, cachedRedisSet as redisSet } from '@/app/lib/cached-redis';

const NS          = process.env.REDIS_NAMESPACE || 'default';

const NIFTY_TOKEN  = 256265; // NSE:NIFTY 50 index token
const SNAP_KEY     = `${NS}:sc-snap:NIFTY`;
const SNAP_TTL     = 45 * 60; // 45 minutes
const RESULT_TTL   = 55;     // 55s cache — one tick behind the 60s poll

const SCORE_THRESHOLD = 7;
const MAX_SCORE       = 13;
const IST_OFF_MS      = 5.5 * 3600 * 1000;

// ── Resolve NIFTY near-month futures { ts, token } ────────────────────────────
// Returns both tradingsymbol (for getQuote/OI) and instrument_token (for getHistoricalData)
async function resolveFutSymbol(dp) {
  const cacheKey = `${NS}:sc-fut-sym:NIFTY`;
  const cached   = await redisGet(cacheKey);
  if (cached) return cached; // cached value is the full { ts, token } object

  const csvText = await dp.getNFOInstrumentsCSV();
  const lines   = csvText.trim().split('\n');
  const headers = lines[0].split(',');

  const tsIdx     = headers.indexOf('tradingsymbol');
  const tokenIdx  = headers.indexOf('instrument_token');
  const nameIdx   = headers.indexOf('name');
  const typeIdx   = headers.indexOf('instrument_type');
  const expiryIdx = headers.indexOf('expiry');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let best = null;
  for (let i = 1; i < lines.length; i++) {
    const cols   = lines[i].split(',');
    const name   = cols[nameIdx]?.replace(/"/g, '').trim();
    const type   = cols[typeIdx]?.replace(/"/g, '').trim();
    const expiry = cols[expiryIdx]?.replace(/"/g, '').trim();
    if (name !== 'NIFTY' || type !== 'FUT' || !expiry) continue;
    const expiryDate = new Date(expiry);
    if (expiryDate < today) continue;
    if (!best || expiryDate < new Date(best.expiry)) {
      best = {
        ts:    cols[tsIdx]?.replace(/"/g, '').trim(),
        token: parseInt(cols[tokenIdx]),
        expiry,
      };
    }
  }

  if (!best?.ts) return null;
  await redisSet(cacheKey, best, 6 * 3600); // cache the full object
  return best;
}

// ── Fetch 5-min NIFTY futures candles for today + yesterday ───────────────────
async function fetchIntraday(dp, futToken) {
  const now  = new Date(Date.now() + IST_OFF_MS);
  const pad  = n => String(n).padStart(2, '0');
  const toStr = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;

  const to   = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 2); // 2 days back covers weekend gaps

  const token = futToken ?? NIFTY_TOKEN; // fallback to index if futures token unavailable
  const raw = await dp.getHistoricalData(token, '5minute', toStr(from), toStr(to));
  if (!raw?.length) return [];

  // Keep only today's IST session (9:15 onwards)
  const todayIST = now.toISOString().slice(0, 10);
  const candles  = raw
    .map(c => ({
      time:   Math.floor(new Date(c.date).getTime() / 1000),
      open:   c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    }))
    .filter(c => {
      const d = new Date((c.time + 5.5 * 3600) * 1000).toISOString().slice(0, 10);
      return d === todayIST;
    });

  return candles;
}

// ── Fetch option chain ATM ±5 strikes (weekly expiry) ─────────────────────────
async function fetchOptionChain(dp, spot) {
  const STRIKE_GAP = 50;
  const atm        = Math.round(spot / STRIKE_GAP) * STRIKE_GAP;
  const minStrike  = atm - 5 * STRIKE_GAP;
  const maxStrike  = atm + 5 * STRIKE_GAP;

  // Get NFO instruments to find current weekly expiry for NIFTY
  const csvText = await dp.getNFOInstrumentsCSV();
  const lines   = csvText.trim().split('\n');
  const headers = lines[0].split(',');

  const tsIdx     = headers.indexOf('tradingsymbol');
  const nameIdx   = headers.indexOf('name');
  const typeIdx   = headers.indexOf('instrument_type');
  const strikeIdx = headers.indexOf('strike');
  const expiryIdx = headers.indexOf('expiry');

  // Find nearest expiry (weekly)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiries = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols[nameIdx]?.replace(/"/g, '').trim() !== 'NIFTY') continue;
    const exp = cols[expiryIdx]?.replace(/"/g, '').trim();
    if (exp && new Date(exp) >= today) expiries.add(exp);
  }
  const nearestExpiry = [...expiries].sort()[0];
  if (!nearestExpiry) return null;

  // Collect relevant option tradingsymbols
  const opts = [];
  for (let i = 1; i < lines.length; i++) {
    const cols   = lines[i].split(',');
    const name   = cols[nameIdx]?.replace(/"/g, '').trim();
    const type   = cols[typeIdx]?.replace(/"/g, '').trim();
    const expiry = cols[expiryIdx]?.replace(/"/g, '').trim();
    const strike = parseFloat(cols[strikeIdx]);
    const ts     = cols[tsIdx]?.replace(/"/g, '').trim();
    if (name !== 'NIFTY' || (type !== 'CE' && type !== 'PE')) continue;
    if (expiry !== nearestExpiry) continue;
    if (strike < minStrike || strike > maxStrike) continue;
    opts.push({ ts, type, strike });
  }
  if (!opts.length) return null;

  const quotes   = await dp.getQuote(opts.map(o => `NFO:${o.ts}`));
  const strikes  = {};
  let totalCEOI  = 0, totalPEOI = 0, totalOptVol = 0;

  for (const o of opts) {
    const q = quotes[`NFO:${o.ts}`];
    if (!q) continue;
    if (!strikes[o.strike]) strikes[o.strike] = {};
    strikes[o.strike][o.type] = { oi: q.oi || 0, ltp: q.last_price || 0, ts: o.ts, volume: q.volume || 0 };
    totalOptVol += (q.volume || 0);
    if (o.type === 'CE') totalCEOI += (q.oi || 0);
    else                  totalPEOI += (q.oi || 0);
  }

  const atmData  = strikes[atm];
  const pcr      = totalCEOI > 0 ? totalPEOI / totalCEOI : 0;

  // Find call resistance wall (highest CE OI above ATM)
  let ceWall = atm, maxCeOI = 0;
  for (const [strikeStr, data] of Object.entries(strikes)) {
    const s = parseFloat(strikeStr);
    if (s >= atm && data.CE && data.CE.oi > maxCeOI) { maxCeOI = data.CE.oi; ceWall = s; }
  }

  return {
    atm,
    atmCE: atmData?.CE || null,
    atmPE: atmData?.PE || null,
    ceWall,
    totalCEOI,
    totalPEOI,
    pcr: parseFloat(pcr.toFixed(2)),
    expiry: nearestExpiry,
    strikes,
    totalOptVol,
  };
}

// ── Signal scoring ─────────────────────────────────────────────────────────────

function scoreVwapReclaim(candles, vwapSeries) {
  if (candles.length < 6 || !vwapSeries.length) return { score: 0, detail: 'Insufficient candles' };

  const last       = candles.at(-1);
  const vwapMap    = Object.fromEntries(vwapSeries.map(v => [v.time, v.value]));
  const vwapNow    = vwapMap[last.time] ?? vwapSeries.at(-1)?.value;
  if (!vwapNow) return { score: 0, detail: 'VWAP unavailable' };

  // Was below VWAP in any of the last 2-6 candles (before the current)?
  const lookback = candles.slice(-6, -1);
  const wasBelow = lookback.some(c => {
    const v = vwapMap[c.time];
    return v && c.close < v;
  });
  const nowAbove    = last.close > vwapNow;
  const bodyAbove   = last.close > vwapNow && last.open < vwapNow; // actual cross candle
  const greenCandle = last.close > last.open;

  if (wasBelow && nowAbove && greenCandle) {
    return {
      score:     2,
      hit:       true,
      vwap:      vwapNow,
      detail:    `Crossed VWAP at ${vwapNow.toFixed(0)} — ${bodyAbove ? 'full-body cross' : 'close above'}`,
    };
  }
  if (nowAbove && !wasBelow) {
    return { score: 0, hit: false, vwap: vwapNow, detail: `Above VWAP but no prior dip` };
  }
  return {
    score:  0,
    hit:    false,
    vwap:   vwapNow,
    detail: `Price ${last.close.toFixed(0)} below VWAP ${vwapNow.toFixed(0)}`,
  };
}

function scoreFutOIDrop(snap, futOI, spot, candles = []) {
  if (!snap || snap.futOI == null || futOI == null) {
    return { score: 0, hit: false, detail: 'No OI snapshot yet — will score next poll' };
  }
  
  // Calculate price move since snapshot
  const pctSinceSnap = ((spot - snap.spot) / snap.spot * 100);
  
  // Also calculate price move since day's low for stability during long trends
  let pctSinceLow = 0;
  if (candles.length > 0) {
    const dayLow = Math.min(...candles.map(c => c.low));
    pctSinceLow = ((spot - dayLow) / dayLow * 100);
  }

  const priceMoved = pctSinceSnap > 0.015 || pctSinceLow > 0.04; 
  const oiFell     = futOI < snap.futOI * 0.998; // ≥0.2% drop from baseline (~30k-50k contracts)
  const oiPct      = snap.futOI > 0 ? ((futOI - snap.futOI) / snap.futOI * 100).toFixed(1) : '—';

  if (priceMoved && oiFell) {
    return {
      score:  4,
      hit:    true,
      detail: `Futures OI ↓${Math.abs(parseFloat(oiPct))}% while price up ${pctSinceLow > pctSinceSnap ? pctSinceLow.toFixed(2) : pctSinceSnap.toFixed(2)}%`,
    };
  }
  
  const pctFloat = parseFloat(oiPct);
  let statusTx = 'flat (0.0%)';
  if (pctFloat > 0.05) statusTx = `building (+${pctFloat}%)`;
  else if (pctFloat < -0.05) statusTx = `dropping (${pctFloat}%)`;
  else if (pctFloat !== 0) statusTx = `stable (${pctFloat > 0 ? '+' : ''}${pctFloat}%)`;

  if (!priceMoved) {
    const bestMove = Math.max(pctSinceSnap, pctSinceLow);
    return { score: 0, hit: false, detail: `Spot expansion (+${bestMove.toFixed(2)}%) insufficient for squeeze. OI ${statusTx}.` };
  }
  return { score: 0, hit: false, detail: `Futures OI ${statusTx}. Not falling enough to confirm short-covering.` };
}

function scoreOptOIBonus(snap, chain) {
  if (!snap || !chain?.strikes || snap.ceOI == null) {
    return { score: 0, hit: false, detail: 'No options OI baseline' };
  }
  
  let currentCEOI = 0;
  for (const [strikeStr, data] of Object.entries(chain.strikes)) {
    const s = parseFloat(strikeStr);
    if (s >= chain.atm && data.CE) currentCEOI += data.CE.oi;
  }
  
  if (currentCEOI < snap.ceOI * 0.97) { // >=3% drop in Call OI above ATM
    const pct = ((currentCEOI - snap.ceOI) / snap.ceOI * 100).toFixed(1);
    return { score: 2, hit: true, detail: `ATM/OTM Call OI ↓${Math.abs(pct)}% (Short Covering in options)` };
  }
  
  return { score: 0, hit: false, detail: 'Call OI stable above ATM' };
}

function scoreVolumeSpike(candles, totalOptVol = 0) {
  if (candles.length < 6) {
    if (totalOptVol > 50000) {
      return { score: 1, hit: true, detail: `Options volume elevated (${totalOptVol.toLocaleString()})` };
    }
    return { score: 0, hit: false, detail: 'Insufficient volume data' };
  }

  const curr    = candles.at(-1);
  const prev10  = candles.slice(-11, -1);
  const avgVol  = prev10.reduce((s, c) => s + c.volume, 0) / Math.max(prev10.length, 1);

  if (avgVol < 100 && totalOptVol > 100000) {
    return { score: 2, hit: true, detail: `Options proxy volume elevated (${totalOptVol.toLocaleString()})` };
  }

  if (avgVol < 100) return { score: 0, hit: false, detail: 'Volume too low to assess' };

  const mult    = curr.volume / avgVol;
  const ranges  = candles.slice(-6, -1).map(c => c.high - c.low);
  const avgRng  = ranges.reduce((s, r) => s + r, 0) / ranges.length;
  const wideRng = (curr.high - curr.low) > avgRng * 1.4;

  if (mult >= 1.5) {
    return {
      score:   2,
      hit:     true,
      detail:  `Nifty Fut volume ${mult.toFixed(1)}x avg${wideRng ? ' · wide-range candle' : ''}`,
      wideCnl: wideRng,
    };
  }
  return { score: 0, hit: false, detail: `Nifty Fut volume only ${mult.toFixed(1)}x avg (need 1.5x)` };
}

function scoreStraddleContraction(snap, chain, spot, candles = []) {
  if (!snap || !chain?.atmCE || !chain?.atmPE || snap.straddle == null) {
    return { score: 0, hit: false, detail: 'No straddle snapshot yet' };
  }
  
  const pctSinceSnap = ((spot - snap.spot) / snap.spot * 100);
  let pctSinceLow = 0;
  if (candles.length > 0) {
    const dayLow = Math.min(...candles.map(c => c.low));
    pctSinceLow = ((spot - dayLow) / dayLow * 100);
  }

  const currStraddle = chain.atmCE.ltp + chain.atmPE.ltp;
  const straddleFell = currStraddle < snap.straddle * 0.97;  // ≥3% drop
  const putFalling   = chain.atmPE.ltp < snap.atmPELTP * 0.95; // PE specifically crushed
  const callStable   = chain.atmCE.ltp >= snap.atmCELTP * 0.98;
  const priceMoved   = pctSinceSnap > 0.03 || pctSinceLow > 0.08;
  const pct          = snap.straddle > 0 ? ((currStraddle - snap.straddle) / snap.straddle * 100).toFixed(1) : '—';

  if (straddleFell && putFalling && callStable && priceMoved) {
    return {
      score:  3,
      hit:    true,
      detail: `Straddle ↓${Math.abs(pct)}% — PE crushed, CE holding (directional squeeze)`,
    };
  }
  if (straddleFell) {
    return {
      score:  1,
      hit:    true,
      detail: `Straddle ↓${Math.abs(pct)}% but not fully directional yet`,
    };
  }
  return { score: 0, hit: false, detail: `Straddle change (${pct}%)` };
}

function scorePCRSpike(snap, pcr) {
  if (!snap || snap.pcr == null) return { score: 0, hit: false, detail: 'No PCR snapshot' };
  const rose = pcr > snap.pcr * 1.05;
  if (rose) {
    return { score: 1, hit: true, detail: `PCR rose ${snap.pcr.toFixed(2)} → ${pcr.toFixed(2)} (put sellers exiting)` };
  }
  return { score: 0, hit: false, detail: `PCR ${pcr.toFixed(2)} (was ${snap.pcr.toFixed(2)})` };
}

// ── Trade suggestion ───────────────────────────────────────────────────────────
function buildTrade(spot, chain, vwap, candles) {
  if (!chain?.atmCE || !chain.atmCE.ltp) return null;

  const entry    = chain.atmCE.ltp;
  const symbol   = chain.atmCE.ts;
  const strike   = chain.atm;
  const DELTA    = 0.45; // ATM approximation

  // SL: below VWAP or breakout candle low, whichever gives a tighter stop
  const recentGreenIdx = candles.map((c, i) => ({ i, c }))
    .filter(({ c }) => c.close > vwap && c.close > c.open)
    .at(-1)?.i ?? (candles.length - 1);
  const brkLow   = candles[recentGreenIdx]?.low ?? (spot - 40);
  const indexSL  = Math.max(vwap - 5, brkLow - 5); // tighter of the two, with 5-pt buffer
  const slPts    = Math.max(spot - indexSL, 10);
  const ceSL     = Math.max(parseFloat((entry - slPts * DELTA).toFixed(1)), parseFloat((entry * 0.65).toFixed(1)));
  const pctRisk  = parseFloat(((entry - ceSL) / entry * 100).toFixed(0));

  // Targets: ceWall = T1, ceWall+50 = T2, ceWall+100 = T3
  const t1pts    = chain.ceWall - spot;
  const t2pts    = chain.ceWall + 50 - spot;
  const t3pts    = chain.ceWall + 100 - spot;
  const risk     = entry - ceSL;

  const ceT1     = parseFloat((entry + Math.max(t1pts, 20) * DELTA).toFixed(1));
  const ceT2     = parseFloat((entry + Math.max(t2pts, 40) * 0.42).toFixed(1));
  const ceT3     = parseFloat((entry + Math.max(t3pts, 60) * 0.38).toFixed(1));
  const rr       = (v) => risk > 0 ? `1:${((v - entry) / risk).toFixed(1)}` : '—';

  return {
    symbol,
    strike,
    expiry:  chain.expiry,
    entryLtp: entry,
    sl: { indexLevel: parseFloat(indexSL.toFixed(0)), cePremium: ceSL, pctRisk },
    targets: [
      { indexLevel: chain.ceWall,       cePremium: ceT1, pts: `+${Math.round(ceT1 - entry)}`, rr: rr(ceT1) },
      { indexLevel: chain.ceWall + 50,  cePremium: ceT2, pts: `+${Math.round(ceT2 - entry)}`, rr: rr(ceT2) },
      { indexLevel: chain.ceWall + 100, cePremium: ceT3, pts: `+${Math.round(ceT3 - entry)}`, rr: rr(ceT3) },
    ],
    note: `Buy ATM CE ${strike}. Exit if 5-min candle closes below VWAP (${Math.round(vwap)}).`,
  };
}

// ── GET handler ────────────────────────────────────────────────────────────────
export async function GET(request) {
  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite not connected', active: false }, { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const spotOverride     = searchParams.get('spot') ? parseFloat(searchParams.get('spot')) : null;

    // 1. Fetch NIFTY spot + futures OI in parallel
    const [spotQuote, futSymbol] = await Promise.all([
      dp.getOHLC(['NSE:NIFTY 50']),
      resolveFutSymbol(dp),
    ]);
    const spot = spotOverride || spotQuote['NSE:NIFTY 50']?.last_price;
    if (!spot) return NextResponse.json({ error: 'Could not fetch NIFTY spot', active: false });

    let futOI = null;
    if (futSymbol?.ts) {
      try {
        const futQ = await dp.getQuote([`NFO:${futSymbol.ts}`]);
        futOI = futQ[`NFO:${futSymbol.ts}`]?.oi ?? null;
      } catch { /* futures OI optional */ }
    }

    // 2. Fetch intraday candles (using futures token for real volume) + option chain in parallel
    const [candles, chain] = await Promise.all([
      fetchIntraday(dp, futSymbol?.token),
      fetchOptionChain(dp, spot),
    ]);

    if (candles.length < 5) {
      return NextResponse.json({ error: 'Insufficient intraday candles (pre-market?)', active: false });
    }

    // 3. Compute VWAP
    const vwapSeries = computeVWAP(candles);
    const vwapNow    = vwapSeries.at(-1)?.value ?? spot;

    // 4. Load rolling snapshot
    let snap = await redisGet(SNAP_KEY);

    // 5. Score each signal
    const sigVwap      = scoreVwapReclaim(candles, vwapSeries);
    const sigFutOI     = scoreFutOIDrop(snap, futOI, spot, candles);
    const sigOptOI     = scoreOptOIBonus(snap, chain);
    const sigVolume    = scoreVolumeSpike(candles, chain?.totalOptVol || 0);
    const sigStraddle  = scoreStraddleContraction(snap, chain, spot, candles);
    const sigPCR       = scorePCRSpike(snap, chain?.pcr ?? 0);

    const score = sigVwap.score + sigFutOI.score + sigOptOI.score +
                  sigVolume.score + sigStraddle.score + sigPCR.score;
    const active = score >= SCORE_THRESHOLD;

    // 6. Snapshot Management (Rolling Window & Expiry)
    let shouldResetSnap = false;
    const nowMs = Date.now();
    let snapToSave = null;

    if (!snap) {
      shouldResetSnap = true;
    } else {
      const ageSecs = (nowMs - snap.ts) / 1000;
      
      if (snap.activeSince) {
        // It's currently in an active window
        const activeDurationSecs = (nowMs - snap.activeSince) / 1000;
        if (activeDurationSecs > SNAP_TTL) {
          // Expire the signal after 45 mins to prevent it staying active all day
          shouldResetSnap = true;
        } else if (!active) {
          // It fell out of active state. Reset baseline so it requires a fresh buildup to trigger again.
          shouldResetSnap = true;
        }
      } else {
        // Not in an active window
        if (active) {
          // Just triggered! Mark activeSince
          snap.activeSince = nowMs;
          snapToSave = snap;
        } else if (ageSecs > SNAP_TTL) {
          // Refresh baseline every 45 mins if nothing is happening
          shouldResetSnap = true;
        }
      }
    }

    if (shouldResetSnap) {
      let snapCEOI = 0;
      if (chain?.strikes) {
        for (const [strikeStr, data] of Object.entries(chain.strikes)) {
          const s = parseFloat(strikeStr);
          if (s >= chain.atm && data.CE) snapCEOI += data.CE.oi;
        }
      }
      
      snapToSave = {
        spot,
        futOI,
        ceOI:      snapCEOI,
        pcr:       chain?.pcr ?? 0,
        straddle:  chain ? (chain.atmCE?.ltp ?? 0) + (chain.atmPE?.ltp ?? 0) : null,
        atmCELTP:  chain?.atmCE?.ltp ?? null,
        atmPELTP:  chain?.atmPE?.ltp ?? null,
        atmPEOI:   chain?.atmPE?.oi  ?? null,
        ts:        nowMs,
        activeSince: active && !shouldResetSnap ? nowMs : null,
      };
    }

    if (snapToSave) {
      redisSet(SNAP_KEY, snapToSave, 24 * 3600).catch(() => {});
      // Ensure we don't return negative snapshotAge if we just created it
      snap = snapToSave;
    }

    // 7. Build trade suggestion if active
    const trade = active ? buildTrade(spot, chain, vwapNow, candles) : null;

    const payload = {
      score,
      maxScore:  MAX_SCORE,
      threshold: SCORE_THRESHOLD,
      active,
      signals: {
        vwapReclaim:  { score: sigVwap.score,     hit: sigVwap.hit     ?? false, detail: sigVwap.detail     },
        futuresOI:    { score: sigFutOI.score,    hit: sigFutOI.hit    ?? false, detail: sigFutOI.detail    },
        optionsOI:    { score: sigOptOI.score,    hit: sigOptOI.hit    ?? false, detail: sigOptOI.detail    },
        volumeSpike:  { score: sigVolume.score,   hit: sigVolume.hit   ?? false, detail: sigVolume.detail   },
        straddle:     { score: sigStraddle.score, hit: sigStraddle.hit ?? false, detail: sigStraddle.detail },
        pcrSpike:     { score: sigPCR.score,      hit: sigPCR.hit      ?? false, detail: sigPCR.detail      },
      },
      context: {
        spot:   parseFloat(spot.toFixed(2)),
        vwap:   parseFloat(vwapNow.toFixed(2)),
        atm:    chain?.atm   ?? null,
        pcr:    chain?.pcr   ?? null,
        ceWall: chain?.ceWall ?? null,
        futSymbol: futSymbol?.ts ?? null,
      },
      trade,
      lastUpdated:  new Date().toISOString(),
      snapshotAge:  snap ? Math.round((Date.now() - snap.ts) / 1000) : null,
    };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': `s-maxage=${RESULT_TTL}, stale-while-revalidate=30` },
    });
  } catch (err) {
    console.error('Short covering error:', err);
    return NextResponse.json({ error: err.message, active: false });
  }
}
