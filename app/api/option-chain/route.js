import { NextResponse } from 'next/server';
import { detectMarketActivity, generateActionableInsights } from './lib/market-activity-detector.js';
import { getDataProvider } from '@/app/lib/providers';
import { sql } from '@/app/lib/db';
import { cachedRedisGet as redisGet, cachedRedisSet as redisSet } from '@/app/lib/cached-redis';

const NS = process.env.REDIS_NAMESPACE || 'default';

async function neonLog(entry) {
  const { type, ts, symbol = null, ...rest } = entry;
  try {
    await sql`INSERT INTO signal_logs (type, ts, symbol, data) VALUES (${type}, ${ts}, ${symbol}, ${JSON.stringify(rest)})`;
  } catch (e) { console.error('[signal-log] neon error:', e.message); }
}

function isMarketHours() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hours = istTime.getUTCHours();
  return hours >= 7 && hours < 22;
}

const CACHE_TTL = 60;
const HISTORY_TTL = 3600;
const INSTRUMENTS_CACHE_TTL = 7200; // 2h — refreshes intraday, handles expiry rollovers
const instrumentsCacheKey = (exchange) => `${NS}:${exchange.toLowerCase()}-instruments-all`;

const UNDERLYING_CONFIG = {
  NIFTY:     { spotSymbol: 'NIFTY 50',   name: 'NIFTY',     lotSize: 25, strikeGap: 50,  spotExchange: 'NSE', optExchange: 'NFO' },
  BANKNIFTY: { spotSymbol: 'NIFTY BANK', name: 'BANKNIFTY', lotSize: 15, strikeGap: 100, spotExchange: 'NSE', optExchange: 'NFO' },
  SENSEX:    { spotSymbol: 'SENSEX',     name: 'SENSEX',    lotSize: 10, strikeGap: 100, spotExchange: 'BSE', optExchange: 'BFO' },
};

function formatOI(oi) { return (oi / 100000).toFixed(1) + 'L'; }
function roundToStrike(price, gap) { return Math.round(price / gap) * gap; }

function generateCommentary(current, previous, underlying) {
  const alerts = [];
  // Force time in IST as 'HH:mm IST' (24-hour)
  const now = new Date();
  // Convert to IST
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(utc + istOffset);
  const hh = ist.getHours().toString().padStart(2, '0');
  const mm = ist.getMinutes().toString().padStart(2, '0');
  const timestamp = `${hh}:${mm} IST`;

  if (!previous) {
    return [{ type: 'info', time: timestamp, message: `${underlying} options data initialized. Tracking OI changes...` }];
  }

  const pcrChange = current.pcr - previous.pcr;
  if (Math.abs(pcrChange) >= 0.05) {
    const direction = pcrChange > 0 ? 'increased' : 'decreased';
    const sentiment = pcrChange > 0 ? 'bullish' : 'bearish';
    alerts.push({ type: pcrChange > 0 ? 'bullish' : 'bearish', time: timestamp, message: `PCR ${direction} from ${previous.pcr.toFixed(2)} → ${current.pcr.toFixed(2)} (${sentiment} shift)` });
  }

  if (current.support !== previous.support) {
    const direction = current.support > previous.support ? 'moved up' : 'moved down';
    alerts.push({ type: current.support > previous.support ? 'bullish' : 'bearish', time: timestamp, message: `Support ${direction}: ${previous.support} → ${current.support}` });
  }

  if (current.resistance !== previous.resistance) {
    const direction = current.resistance > previous.resistance ? 'moved up' : 'moved down';
    alerts.push({ type: current.resistance > previous.resistance ? 'bullish' : 'bearish', time: timestamp, message: `Resistance ${direction}: ${previous.resistance} → ${current.resistance}` });
  }

  if (current.maxPain !== previous.maxPain) {
    const direction = current.maxPain > previous.maxPain ? 'higher' : 'lower';
    alerts.push({ type: 'info', time: timestamp, message: `Max Pain shifted ${direction}: ${previous.maxPain} → ${current.maxPain}` });
  }

  const supportOIChange = current.supportOI - previous.supportOI;
  const supportOIChangePct = previous.supportOI > 0 ? (supportOIChange / previous.supportOI) * 100 : 0;
  if (Math.abs(supportOIChangePct) >= 5) {
    if (supportOIChange < 0) {
      alerts.push({ type: 'warning', time: timestamp, message: `⚠️ Support ${current.support} weakening: Put OI dropped ${formatOI(Math.abs(supportOIChange))} (${Math.abs(supportOIChangePct).toFixed(1)}%)` });
    } else {
      alerts.push({ type: 'bullish', time: timestamp, message: `Support ${current.support} strengthening: Put OI added ${formatOI(supportOIChange)} (+${supportOIChangePct.toFixed(1)}%)` });
    }
  }

  const resistanceOIChange = current.resistanceOI - previous.resistanceOI;
  const resistanceOIChangePct = previous.resistanceOI > 0 ? (resistanceOIChange / previous.resistanceOI) * 100 : 0;
  if (Math.abs(resistanceOIChangePct) >= 5) {
    if (resistanceOIChange < 0) {
      alerts.push({ type: 'bullish', time: timestamp, message: `Resistance ${current.resistance} weakening: Call OI dropped ${formatOI(Math.abs(resistanceOIChange))} (${Math.abs(resistanceOIChangePct).toFixed(1)}%)` });
    } else {
      alerts.push({ type: 'warning', time: timestamp, message: `⚠️ Resistance ${current.resistance} strengthening: Call OI added ${formatOI(resistanceOIChange)} (+${resistanceOIChangePct.toFixed(1)}%)` });
    }
  }

  const totalOIChange = (current.totalCallOI + current.totalPutOI) - (previous.totalCallOI + previous.totalPutOI);
  const totalOIChangePct = (previous.totalCallOI + previous.totalPutOI) > 0
    ? (totalOIChange / (previous.totalCallOI + previous.totalPutOI)) * 100 : 0;
  if (Math.abs(totalOIChangePct) >= 3) {
    const direction = totalOIChange > 0 ? 'added' : 'unwound';
    alerts.push({ type: 'info', time: timestamp, message: `Total OI ${direction}: ${formatOI(Math.abs(totalOIChange))} (${totalOIChange > 0 ? '+' : ''}${totalOIChangePct.toFixed(1)}%)` });
  }

  return alerts;
}

function calculateMaxPain(optionData, spotPrice, config) {
  const strikes = [...new Set(optionData.map(o => o.strike))].sort((a, b) => a - b);
  let minPain = Infinity;
  let maxPainStrike = roundToStrike(spotPrice, config.strikeGap);

  for (const testStrike of strikes) {
    let totalPain = 0;
    for (const option of optionData) {
      if (option.type === 'CE') {
        if (testStrike < option.strike) totalPain += option.oi * config.lotSize * (option.strike - testStrike);
      } else {
        if (testStrike > option.strike) totalPain += option.oi * config.lotSize * (testStrike - option.strike);
      }
    }
    if (totalPain < minPain) { minPain = totalPain; maxPainStrike = testStrike; }
  }
  return maxPainStrike;
}

function findSupportResistance(optionData, spotPrice, config) {
  const atmStrike = roundToStrike(spotPrice, config.strikeGap);
  const putsBelow  = optionData.filter(o => o.type === 'PE' && o.strike <= atmStrike).sort((a, b) => b.oi - a.oi);
  const callsAbove = optionData.filter(o => o.type === 'CE' && o.strike >= atmStrike).sort((a, b) => b.oi - a.oi);
  return {
    support:    { level: putsBelow[0]?.strike  || atmStrike - (2 * config.strikeGap), oi: putsBelow[0]?.oi  || 0 },
    support2:   { level: putsBelow[1]?.strike  || atmStrike - (3 * config.strikeGap), oi: putsBelow[1]?.oi  || 0 },
    resistance: { level: callsAbove[0]?.strike || atmStrike + (2 * config.strikeGap), oi: callsAbove[0]?.oi || 0 },
    resistance2:{ level: callsAbove[1]?.strike || atmStrike + (3 * config.strikeGap), oi: callsAbove[1]?.oi || 0 },
  };
}

// Valid option names per exchange
const VALID_NAMES = {
  NFO: new Set(['NIFTY', 'BANKNIFTY']),
  BFO: new Set(['SENSEX']),
};

async function getOptionsInstruments(dp, exchange) {
  const cacheKey = instrumentsCacheKey(exchange);
  const cached   = await redisGet(cacheKey);
  if (cached) return cached;

  // Use raw CSV fetch + manual parse to avoid Kite SDK's fragile content-type check
  const csvText = await dp.getInstrumentsCSV(exchange);
  const lines   = csvText.trim().split('\n');
  const headers = lines[0].split(',');

  const tsIdx     = headers.indexOf('tradingsymbol');
  const nameIdx   = headers.indexOf('name');
  const expiryIdx = headers.indexOf('expiry');
  const strikeIdx = headers.indexOf('strike');
  const typeIdx   = headers.indexOf('instrument_type');

  const validNames = VALID_NAMES[exchange] ?? new Set();
  const options = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const name = cols[nameIdx]?.replace(/"/g, '').trim();
    const type = cols[typeIdx]?.replace(/"/g, '').trim();
    if (validNames.has(name) && (type === 'CE' || type === 'PE')) {
      options.push({
        tradingsymbol:   cols[tsIdx]?.replace(/"/g, '').trim(),
        name,
        expiry:          cols[expiryIdx]?.replace(/"/g, '').trim() || '',
        strike:          parseFloat(cols[strikeIdx]) || 0,
        instrument_type: type,
      });
    }
  }

  await redisSet(cacheKey, options, INSTRUMENTS_CACHE_TTL);
  return options;
}

// ── Resolve near-month futures { ts, token } ──────────────────────────────────
async function resolveFutSymbol(dp, underlying) {
  const cacheKey = `${NS}:sc-fut-sym:${underlying}`;
  const cached   = await redisGet(cacheKey);
  if (cached) return cached;

  const csvText = await dp.getNFOInstrumentsCSV();
  const lines   = csvText.trim().split('\n');
  const headers = lines[0].split(',');

  const tsIdx     = headers.indexOf('tradingsymbol');
  const nameIdx   = headers.indexOf('name');
  const typeIdx   = headers.indexOf('instrument_type');
  const expiryIdx = headers.indexOf('expiry');

  const today = new Date(); today.setHours(0, 0, 0, 0);

  let best = null;
  for (let i = 1; i < lines.length; i++) {
    const cols   = lines[i].split(',');
    const name   = cols[nameIdx]?.replace(/"/g, '').trim();
    const type   = cols[typeIdx]?.replace(/"/g, '').trim();
    const expiry = cols[expiryIdx]?.replace(/"/g, '').trim();
    if (name !== underlying || type !== 'FUT' || !expiry) continue;
    const expiryDate = new Date(expiry);
    if (expiryDate < today) continue;
    if (!best || expiryDate < new Date(best.expiry)) {
      best = { ts: cols[tsIdx]?.replace(/"/g, '').trim(), expiry };
    }
  }
  if (!best?.ts) return null;
  await redisSet(cacheKey, best, 6 * 3600);
  return best;
}

function getExpiries(options, underlyingName) {
  const underlyingOptions = options.filter(o => o.name === underlyingName);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // expiry is always a string (normalized in getNFOInstruments); deduplicate by string value
  const allExpiries = [...new Set(underlyingOptions.map(o => String(o.expiry)))]
    .filter(exp => new Date(exp) >= today)
    .sort((a, b) => new Date(a) - new Date(b));

  const weeklyExpiry = allExpiries[0];

  const monthlyExpiries = allExpiries.filter(exp => {
    const date = new Date(exp);
    const nextExpiry = allExpiries.find(e => new Date(e) > date);
    if (!nextExpiry) return true;
    const nextDate = new Date(nextExpiry);
    return nextDate.getMonth() !== date.getMonth() || nextDate.getFullYear() !== date.getFullYear();
  });

  const monthlyExpiry = monthlyExpiries[0] || weeklyExpiry;
  return { weekly: weeklyExpiry, monthly: monthlyExpiry, all: allExpiries.slice(0, 8) };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const underlying = searchParams.get('underlying') || 'NIFTY';
  const expiryType = searchParams.get('expiry') || 'weekly';

  const config = UNDERLYING_CONFIG[underlying];
  if (!config) return NextResponse.json({ error: 'Invalid underlying' }, { status: 400 });

  const cacheKey      = `${NS}:option-chain-${underlying}-${expiryType}`;
  const historyKey    = `${NS}:option-history-${underlying}-${expiryType}`;
  const sessionKey    = `${NS}:session-open-${underlying}-${expiryType}`;
  const forceRefresh  = searchParams.get('refresh') === '1';

  const cached = await redisGet(cacheKey);

  try {
    if (cached && !forceRefresh && !isMarketHours()) {
      return NextResponse.json({ ...cached, fromCache: true, offMarketHours: true });
    }
    if (cached && !forceRefresh) {
      return NextResponse.json({ ...cached, fromCache: true });
    }

    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite API not configured', pcr: null, maxPain: null, support: null, resistance: null });
    }

    const spotOverride = searchParams.get('spot') ? parseFloat(searchParams.get('spot')) : null;

    const spotKey      = `${config.spotExchange}:${config.spotSymbol}`;
    const optExchange  = config.optExchange;
    // Sensex has no futures on NFO; skip futSym fetch to avoid errors
    const [spotData, allOptions, futSym] = await Promise.all([
      dp.getOHLC([spotKey]),
      getOptionsInstruments(dp, optExchange),
      optExchange === 'NFO' ? resolveFutSymbol(dp, underlying) : Promise.resolve(null),
    ]);
    const spotPrice = spotOverride || spotData[spotKey]?.last_price;
    if (!spotPrice) throw new Error(`Could not fetch ${underlying} spot price`);
    const spot = spotPrice;

    // Fetch Futures OI if available
    let futOI = null;
    if (futSym?.ts) {
      try {
        const futQ = await dp.getQuote([`NFO:${futSym.ts}`]);
        futOI = futQ[`NFO:${futSym.ts}`]?.oi || null;
      } catch (e) { console.error('Futures OI fetch error:', e); }
    }
    const expiries      = getExpiries(allOptions, config.name);
    const selectedExpiry = expiryType === 'monthly' ? expiries.monthly : expiries.weekly;

    const atmStrike = roundToStrike(spotPrice, config.strikeGap);
    const minStrike = atmStrike - (10 * config.strikeGap);
    const maxStrike = atmStrike + (10 * config.strikeGap);

    const relevantOptions = allOptions.filter(o =>
      o.name === config.name &&
      String(o.expiry) === String(selectedExpiry) &&
      o.strike >= minStrike &&
      o.strike <= maxStrike
    );

    if (relevantOptions.length === 0) throw new Error(`No ${underlying} option contracts found for ${expiryType} expiry`);

    const quoteSymbols = relevantOptions.map(o => `${optExchange}:${o.tradingsymbol}`);
    const allQuotes = {};
    const batches = [];
    for (let i = 0; i < quoteSymbols.length; i += 500) batches.push(quoteSymbols.slice(i, i + 500));
    const batchResults = await Promise.all(batches.map(batch => dp.getQuote(batch)));
    batchResults.forEach(quotes => Object.assign(allQuotes, quotes));

    const optionData = [];
    let totalCallOI = 0;
    let totalPutOI  = 0;

    for (const option of relevantOptions) {
      const symbol = `NFO:${option.tradingsymbol}`;
      const data   = allQuotes[symbol];
      if (!data) continue;
      const oi     = data.oi || 0;
      const ltp    = data.last_price || 0;
      const volume = data.volume || 0;
      optionData.push({ strike: option.strike, type: option.instrument_type, symbol: option.tradingsymbol, oi, ltp, volume });
      if (option.instrument_type === 'CE') totalCallOI += oi;
      else totalPutOI += oi;
    }

    const pcr = totalCallOI > 0 ? (totalPutOI / totalCallOI) : 0;

    // If all OI is zero (expiry day settlement / stale instruments cache), bust cache
    const isExpiryDayZeroOI = (totalCallOI === 0 || totalPutOI === 0) && relevantOptions.length > 0;
    if (isExpiryDayZeroOI) {
      await redisSet(instrumentsCacheKey(optExchange), null, 1); // force re-fetch next request
    }

    const maxPain = calculateMaxPain(optionData, spotPrice, config);
    const { support, support2, resistance, resistance2 } = findSupportResistance(optionData, spotPrice, config);

    const historyData    = await redisGet(historyKey);
    const previousData   = historyData?.current || null;
    let alertHistory     = historyData?.alerts || [];

    const currentMetrics = {
      pcr: parseFloat(pcr.toFixed(2)),
      maxPain,
      support: support.level,
      supportOI: support.oi,
      resistance: resistance.level,
      resistanceOI: resistance.oi,
      totalCallOI,
      totalPutOI,
      spot: spotPrice,
      timestamp: new Date().toISOString(),
    };

    const newAlerts = generateCommentary(currentMetrics, previousData, underlying);

    if (newAlerts.length > 0) alertHistory = [...newAlerts, ...alertHistory].slice(0, 10);

    await redisSet(historyKey, { current: currentMetrics, alerts: alertHistory }, HISTORY_TTL);

    // ── Session-open baseline for meaningful activity detection ──
    // Compare current OI vs session-open (9:15 AM) instead of 60s-ago snapshot.
    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const istH = istNow.getUTCHours(), istM = istNow.getUTCMinutes();
    const istMins = istH * 60 + istM;
    const isMarketSession = istMins >= 555 && istMins <= 930; // 9:15 – 15:30 IST

    // ── Market Activity Detection ──
    let marketActivity;

    if (!isMarketSession) {
      // Outside market hours — no live OI movement to measure
      const isPreMarket = istMins < 555;
      marketActivity = {
        activity: isPreMarket ? 'Pre-Market' : 'Market Closed',
        strength: 0,
        description: isPreMarket
          ? 'Market opens at 9:15 AM — showing last session OI data'
          : 'Session ended — OI data reflects closing positions',
        actionable: isPreMarket ? 'Watch GIFT Nifty for gap direction' : 'Review today\'s activity before tomorrow',
        emoji: isPreMarket ? '🌅' : '🔔',
      };
    } else {
      const recentKey = `${NS}:session-recent-${underlying}-${expiryType}`;
      const snapshot = { totalCallOI, totalPutOI, spot: spotPrice, futOI };

      // Session-open baseline — captured once at 9:15
      let sessionOpen = await redisGet(sessionKey);
      if (!sessionOpen) {
        sessionOpen = snapshot;
        await redisSet(sessionKey, sessionOpen, 8 * 3600);
      }

      // Rolling 15-min snapshots (array of minute-by-minute captures)
      let recentSnaps = await redisGet(recentKey);
      if (!Array.isArray(recentSnaps)) {
        if (recentSnaps?.totalCallOI) recentSnaps = [recentSnaps]; // migrate old single-object cache
        else recentSnaps = [];
      }

      const nowMs = Date.now();
      const lastSnap = recentSnaps[recentSnaps.length - 1];
      const ageOfLastMs = lastSnap?.capturedAt ? (nowMs - lastSnap.capturedAt) : Infinity;

      // Append snapshot if at least 60s has passed
      if (ageOfLastMs >= 60000) {
        recentSnaps.push({ ...snapshot, capturedAt: nowMs });
        // Filter out snapshots older than 15 minutes (900000 ms)
        recentSnaps = recentSnaps.filter(s => (nowMs - s.capturedAt) <= 15 * 60000);
        await redisSet(recentKey, recentSnaps, 3600); // 1h TTL
      }

      const hasOpen   = sessionOpen?.totalCallOI !== undefined;
      // We need a baseline that is at least a few minutes old to prevent instantaneous 0-deltas.
      // If the array is building up, we just use the oldest one (index 0).
      const oldestSnap = recentSnaps[0];
      const hasRecent = oldestSnap?.totalCallOI  !== undefined;

      if (hasRecent) {
        // Calculate Futures delta if available
        let futDelta = 0;
        if (futOI != null && oldestSnap.futOI != null && oldestSnap.futOI > 0) {
          futDelta = ((futOI - oldestSnap.futOI) / oldestSnap.futOI) * 100;
        }

        // Primary: rolling 15-min activity
        marketActivity = detectMarketActivity(
          snapshot,
          { totalCallOI: oldestSnap.totalCallOI, totalPutOI: oldestSnap.totalPutOI, spot: oldestSnap.spot },
          false,
          futDelta
        );

        // STICKY TREND LOGIC: If recent activity is neutral/conservative but session-long trend is huge (>0.75%),
        // upgrade the activity to reflect the broader trend.
        const dayPriceChangePct = ((spotPrice - sessionOpen.spot) / sessionOpen.spot) * 100;
        if (marketActivity.activity === 'Consolidation' && Math.abs(dayPriceChangePct) > 0.75) {
          const sessionActivity = detectMarketActivity(
            snapshot,
            { totalCallOI: sessionOpen.totalCallOI, totalPutOI: sessionOpen.totalPutOI, spot: sessionOpen.spot },
            true
          );
          if (sessionActivity.activity !== 'Consolidation') {
            marketActivity = {
              ...sessionActivity,
              activity: `${sessionActivity.activity} (Session Trend)`,
              description: `Last 15m quiet but session trend is ${sessionActivity.activity}. ${sessionActivity.description}`,
            };
          }
        }
      } else if (hasOpen) {
        marketActivity = detectMarketActivity(
          snapshot,
          { totalCallOI: sessionOpen.totalCallOI, totalPutOI: sessionOpen.totalPutOI, spot: sessionOpen.spot },
          true
        );
      } else {
        marketActivity = { activity: 'Initializing', strength: 0, description: 'Building session baseline…', actionable: '', emoji: '⏳' };
      }
    }

    // ── Log Short Covering to admin signal log ──
    if (marketActivity?.activity === 'Short Covering' && marketActivity.strength >= 4) {
      neonLog({
        type: 'SC',
        ts: Date.now(),
        symbol: underlying,
        expiry: expiryType,
        spot: spotPrice,
        strength: marketActivity.strength,
        description: marketActivity.description,
        actionable: marketActivity.actionable,
      }).catch(() => {});
    }

    // ── Actionable Insights — pass marketActivity so signals can be synthesized ──
    const actionableInsights = generateActionableInsights(
      { support: support.level, resistance: resistance.level, maxPain, pcr, strikeGap: config.strikeGap },
      spot,
      marketActivity
    );

    // ── Per-strike ΔOI from session-open baseline ────────────────────────────────
    // Stores per-strike OI at session open (9:15 AM) and annotates each option
    // with oiChange = current - baseline. Null outside market hours.
    if (isMarketSession) {
      const sessionStrikesKey = `${NS}:session-strikes-${underlying}-${expiryType}`;
      let sessionStrikes = await redisGet(sessionStrikesKey);
      if (!sessionStrikes) {
        sessionStrikes = {};
        for (const opt of optionData) sessionStrikes[`${opt.strike}_${opt.type}`] = opt.oi;
        await redisSet(sessionStrikesKey, sessionStrikes, 8 * 3600);
      }
      for (const opt of optionData) {
        const base = sessionStrikes[`${opt.strike}_${opt.type}`];
        opt.oiChange = (base != null && base > 0) ? opt.oi - base : null;
      }
    }

    // ── PCR rolling history (last 10 readings) ───────────────────────────────────
    const pcrHistKey = `${NS}:pcr-history-${underlying}-${expiryType}`;
    let pcrHistory   = await redisGet(pcrHistKey) || [];
    pcrHistory       = [...pcrHistory, { v: parseFloat(pcr.toFixed(2)), t: Date.now() }].slice(-10);
    await redisSet(pcrHistKey, pcrHistory, HISTORY_TTL);

    const response = {
      underlying, expiryType,
      spotPrice: spotPrice.toFixed(2),
      atmStrike,
      expiry: selectedExpiry,
      isExpiryDayZeroOI,
      expiries: { weekly: expiries.weekly, monthly: expiries.monthly },
      pcr: parseFloat(pcr.toFixed(2)),
      pcrHistory,
      maxPain,
      support: support.level, supportOI: support.oi,
      support2: support2.level, support2OI: support2.oi,
      resistance: resistance.level, resistanceOI: resistance.oi,
      resistance2: resistance2.level, resistance2OI: resistance2.oi,
      totalCallOI, totalPutOI,
      futuresOI: futOI,
      marketActivity,
      actionableInsights,
      alerts: alertHistory,
      optionChain: optionData.sort((a, b) => a.strike - b.strike),
      timestamp: new Date().toISOString(),
    };

    // Don't cache zero-OI responses during market hours — retry next request
    const cacheTTL = (isExpiryDayZeroOI && isMarketHours()) ? 0 : (isMarketHours() ? CACHE_TTL : 3600);
    if (cacheTTL > 0) await redisSet(cacheKey, response, cacheTTL);
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    });

  } catch (error) {
    console.error('Error fetching option chain:', error.message);
    // Serve stale cache on live-fetch failure so the UI stays functional
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true, staleOnError: true });
    }
    return NextResponse.json({ error: 'Internal server error', underlying, expiryType, pcr: null, maxPain: null, support: null, resistance: null }, { status: 500 });
  }
}