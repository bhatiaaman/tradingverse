import { NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { detectMarketActivity, generateActionableInsights } from './lib/market-activity-detector.js';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS = process.env.REDIS_NAMESPACE || 'default';

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, exSeconds) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url = exSeconds
      ? `${REDIS_URL}/set/${key}/${encoded}?ex=${exSeconds}`
      : `${REDIS_URL}/set/${key}/${encoded}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch (e) { console.error('Redis set error:', e); }
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
const INSTRUMENTS_CACHE_KEY = `${NS}:nfo-instruments-all`;
const INSTRUMENTS_CACHE_TTL = 86400;

const UNDERLYING_CONFIG = {
  NIFTY: { spotSymbol: 'NIFTY 50', name: 'NIFTY', lotSize: 25, strikeGap: 50 },
  BANKNIFTY: { spotSymbol: 'NIFTY BANK', name: 'BANKNIFTY', lotSize: 15, strikeGap: 100 },
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

async function getNFOInstruments(kite) {
  const cached = await redisGet(INSTRUMENTS_CACHE_KEY);
  if (cached) {
    console.log('Using cached NFO instruments');
    return cached;
  }

  console.log('Fetching NFO instruments from Kite...');
  const instruments = await kite.getInstruments('NFO');
  const options = instruments.filter(i =>
    (i.name === 'NIFTY' || i.name === 'BANKNIFTY') &&
    (i.instrument_type === 'CE' || i.instrument_type === 'PE')
  );
  console.log(`Filtered options: ${options.length}`);
  await redisSet(INSTRUMENTS_CACHE_KEY, options, INSTRUMENTS_CACHE_TTL);
  return options;
}

function getExpiries(options, underlyingName) {
  const underlyingOptions = options.filter(o => o.name === underlyingName);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allExpiries = [...new Set(underlyingOptions.map(o => o.expiry))]
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

  try {
    const cached = await redisGet(cacheKey);

    if (cached && !isMarketHours()) {
      return NextResponse.json({ ...cached, fromCache: true, offMarketHours: true });
    }
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true });
    }

    const { apiKey, accessToken } = await getKiteCredentials();
    if (!apiKey || !accessToken) {
      return NextResponse.json({ error: 'Kite API not configured', pcr: null, maxPain: null, support: null, resistance: null });
    }

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const spotData = await kite.getOHLC([`NSE:${config.spotSymbol}`]);
    const spotPrice = spotData[`NSE:${config.spotSymbol}`]?.last_price;
    if (!spotPrice) throw new Error(`Could not fetch ${underlying} spot price`);
    const spot = spotPrice;

    const allOptions    = await getNFOInstruments(kite);
    const expiries      = getExpiries(allOptions, config.name);
    const selectedExpiry = expiryType === 'monthly' ? expiries.monthly : expiries.weekly;

    const atmStrike = roundToStrike(spotPrice, config.strikeGap);
    const minStrike = atmStrike - (10 * config.strikeGap);
    const maxStrike = atmStrike + (10 * config.strikeGap);

    const relevantOptions = allOptions.filter(o =>
      o.name === config.name &&
      o.expiry === selectedExpiry &&
      o.strike >= minStrike &&
      o.strike <= maxStrike
    );

    if (relevantOptions.length === 0) throw new Error(`No ${underlying} option contracts found for ${expiryType} expiry`);

    const quoteSymbols = relevantOptions.map(o => `NFO:${o.tradingsymbol}`);
    const allQuotes = {};
    const batches = [];
    for (let i = 0; i < quoteSymbols.length; i += 500) batches.push(quoteSymbols.slice(i, i + 500));
    const batchResults = await Promise.all(batches.map(batch => kite.getQuote(batch)));
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
      let sessionOpen = await redisGet(sessionKey);
      if (!sessionOpen) {
        // First fetch of this session — capture as open baseline (expires after 8h)
        sessionOpen = { totalCallOI, totalPutOI, spot: spotPrice };
        await redisSet(sessionKey, sessionOpen, 8 * 3600);
      }

      if (sessionOpen.totalCallOI !== undefined && sessionOpen.totalPutOI !== undefined && sessionOpen.spot !== undefined) {
        marketActivity = detectMarketActivity(
          { totalCallOI, totalPutOI, spot: spotPrice },
          { totalCallOI: sessionOpen.totalCallOI, totalPutOI: sessionOpen.totalPutOI, spot: sessionOpen.spot },
          true // sinceOpen = always true during session
        );
      } else {
        marketActivity = { activity: 'Initializing', strength: 0, description: 'Building session baseline…', actionable: '', emoji: '⏳' };
      }
    }

    // ── Actionable Insights ──
    const actionableInsights = generateActionableInsights(
      { support: support.level, resistance: resistance.level, maxPain, pcr }, 
      spot
    );

    const response = {
      underlying, expiryType,
      spotPrice: spotPrice.toFixed(2),
      atmStrike,
      expiry: selectedExpiry,
      expiries: { weekly: expiries.weekly, monthly: expiries.monthly },
      pcr: parseFloat(pcr.toFixed(2)),
      maxPain,
      support: support.level, supportOI: support.oi,
      support2: support2.level, support2OI: support2.oi,
      resistance: resistance.level, resistanceOI: resistance.oi,
      resistance2: resistance2.level, resistance2OI: resistance2.oi,
      totalCallOI, totalPutOI,
      marketActivity,        // NEW - Activity type (Long Buildup, Short Covering, etc.)
      actionableInsights,    // NEW - Array of actionable messages
      alerts: alertHistory,
      optionChain: optionData.sort((a, b) => a.strike - b.strike),
      timestamp: new Date().toISOString(),
    };

    const cacheTTL = isMarketHours() ? CACHE_TTL : 3600;
    await redisSet(cacheKey, response, cacheTTL);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching option chain:', error.message);
    return NextResponse.json({ error: 'Internal server error', underlying, expiryType, pcr: null, maxPain: null, support: null, resistance: null }, { status: 500 });
  }
}