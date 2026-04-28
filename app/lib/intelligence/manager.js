// ─── Central Intelligence Manager ────────────────────────────────────────────
// Single source of truth for all 5-agent analysis.
// Direction-agnostic — scenario is market-condition-driven, not order-intent-driven.
// Consumers: /api/intelligence (chart pill), OrderModal (via prop), trades page.

import { getSector }             from '@/app/api/order-intelligence/lib/sector-map.js';
import { runBehavioralAgent }    from '@/app/api/order-intelligence/agents/behavioral.js';
import { runStructureAgent }     from '@/app/api/order-intelligence/agents/structure.js';
import { runPatternAgent }       from '@/app/api/order-intelligence/agents/pattern.js';
import { runStationAgent }       from '@/app/api/order-intelligence/agents/station.js';
import { runOIAgent }            from '@/app/api/order-intelligence/agents/oi.js';
import { runScenarioAgent }      from '@/app/api/order-intelligence/agents/scenario.js';
import { detectPatterns, analyzeVolume } from '@/app/api/order-intelligence/agents/pattern.js';
import { resolveToken }          from '@/app/api/order-intelligence/lib/resolve-token.js';
import { getDataProvider }       from '@/app/lib/providers';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

const INDEX_SYMBOLS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']);

// ── Redis helpers ─────────────────────────────────────────────────────────────
async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, exSeconds) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${key}/${encoded}?ex=${exSeconds}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch { /* silent */ }
}

// ── Bias normalisation ────────────────────────────────────────────────────────
function normaliseBias(bias) {
  if (!bias) return 'NEUTRAL';
  const b = bias.toLowerCase();
  if (b.includes('bullish')) return 'BULLISH';
  if (b.includes('bearish')) return 'BEARISH';
  return 'NEUTRAL';
}

function sectorChangeToBias(changePercent) {
  if (changePercent == null) return 'NEUTRAL';
  if (changePercent > 0.3)  return 'BULLISH';
  if (changePercent < -0.3) return 'BEARISH';
  return 'NEUTRAL';
}

// ── Kite candle fetch (5-min Redis TTL) ───────────────────────────────────────
async function fetchKiteCandles(token, interval, days, apiKey, accessToken) {
  const cacheKey = `${NS}:candles:${token}:${interval}:${days}`;
  const cached   = await redisGet(cacheKey);
  if (cached) return cached;

  try {
    const toDate   = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const pad2    = n => String(n).padStart(2, '0');
    const IST     = 5.5 * 60 * 60 * 1000;
    const toIST   = new Date(toDate.getTime()   + IST);
    const fromIST = new Date(fromDate.getTime() + IST);
    const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} 00:00:00`;
    const fmtNow  = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} 23:59:59`;

    const url = `https://api.kite.trade/instruments/historical/${token}/${interval}?from=${encodeURIComponent(fmtDate(fromIST))}&to=${encodeURIComponent(fmtNow(toIST))}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `token ${apiKey}:${accessToken}`, 'X-Kite-Version': '3' },
    });
    if (!res.ok) return null;

    const d   = await res.json();
    const raw = d.data?.candles;
    if (!Array.isArray(raw)) return null;

    const candles = raw.map(c => ({
      time: new Date(c[0]).getTime() / 1000,
      open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5],
    }));
    await redisSet(cacheKey, candles, 300);
    return candles;
  } catch { return null; }
}

// ── Data collectors (mirrors order-intelligence/route.js) ─────────────────────
async function collectBehavioralData(symbol, base) {
  const [positionsRes, ordersRes, sentimentRes, sectorRes, marketDataRes] = await Promise.allSettled([
    fetch(`${base}/api/kite-positions`, { cache: 'no-store' }),
    fetch(`${base}/api/kite-orders?limit=50`, { cache: 'no-store' }),
    fetch(`${base}/api/sentiment`, { cache: 'no-store' }),
    fetch(`${base}/api/sector-performance`, { cache: 'no-store' }),
    fetch(`${base}/api/market-data`, { cache: 'no-store' }),
  ]);

  let allPositions = [];
  try {
    if (positionsRes.status === 'fulfilled' && positionsRes.value.ok) {
      const d = await positionsRes.value.json();
      allPositions = d.positions || [];
    }
  } catch {}

  const openPositions = allPositions.filter(p => p.quantity !== 0);
  const sameSymbol    = openPositions.find(
    p => p.tradingsymbol?.toUpperCase() === symbol?.toUpperCase() ||
         p.tradingsymbol?.startsWith(symbol?.toUpperCase())
  ) ?? null;

  let openOrders = [];
  try {
    if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) {
      const d = await ordersRes.value.json();
      openOrders = (d.orders || []).filter(o =>
        ['OPEN', 'TRIGGER PENDING', 'AMO REQ RECEIVED'].includes(o.status?.toUpperCase())
      );
    }
  } catch {}

  let sentiment = { overallBias: 'NEUTRAL', intradayBias: 'NEUTRAL', overallScore: 50, intradayScore: 50 };
  try {
    if (sentimentRes.status === 'fulfilled' && sentimentRes.value.ok) {
      const d = await sentimentRes.value.json();
      sentiment = {
        overallBias:   normaliseBias(d.timeframes?.daily?.bias),
        intradayBias:  normaliseBias(d.timeframes?.intraday?.bias),
        overallScore:  d.timeframes?.daily?.score   ?? 50,
        intradayScore: d.timeframes?.intraday?.score ?? 50,
      };
    }
  } catch {}

  let sector = { name: null, change: null, bias: 'NEUTRAL' };
  try {
    if (sectorRes.status === 'fulfilled' && sectorRes.value.ok) {
      const d           = await sectorRes.value.json();
      const symbolSector = getSector(symbol);
      if (symbolSector && Array.isArray(d.sectors)) {
        const match = d.sectors.find(s => s.name === symbolSector);
        if (match) sector = { name: match.name, change: match.value, bias: sectorChangeToBias(match.value) };
      }
    }
  } catch {}

  let vix = null;
  try {
    if (marketDataRes.status === 'fulfilled' && marketDataRes.value.ok) {
      const d = await marketDataRes.value.json();
      if (d.indices?.vix != null) vix = parseFloat(d.indices.vix);
    }
  } catch {}

  return {
    positions: { all: openPositions, count: openPositions.length, sameSymbol },
    orders:    { open: openOrders, openCount: openOrders.length },
    sentiment,
    sector,
    vix,
  };
}

async function collectStructureData(symbol, base) {
  const token = await resolveToken(symbol);
  if (!token) return null;
  const dp = await getDataProvider();
  const { apiKey, accessToken } = await dp.getAuth();
  if (!apiKey || !accessToken) return null;

  const [candles15m, candlesDaily, niftyDaily, breadthJson] = await Promise.all([
    fetchKiteCandles(token,  '15minute', 7,  apiKey, accessToken),
    fetchKiteCandles(token,  'day',      90, apiKey, accessToken),
    fetchKiteCandles(256265, 'day',      90, apiKey, accessToken), // NIFTY
    fetch(`${base}/api/market-breadth`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);

  let breadth = null;
  try {
    if (breadthJson) {
      const adv = breadthJson.advances ?? breadthJson.data?.advances;
      const dec = breadthJson.declines ?? breadthJson.data?.declines;
      if (adv != null && dec != null) breadth = { advances: adv, declines: dec };
    }
  } catch {}

  return {
    candles15m:    candles15m    ?? [],
    candlesDaily:  candlesDaily  ?? [],
    niftyDaily:    niftyDaily    ?? [],
    candlesWeekly: [],
    breadth,
    cDay: candlesDaily ?? [],
  };
}

async function collectPatternData(symbol) {
  const token = await resolveToken(symbol);
  if (!token) return null;
  const dp = await getDataProvider();
  const { apiKey, accessToken } = await dp.getAuth();
  if (!apiKey || !accessToken) return null;

  const [c15m, cDaily] = await Promise.all([
    fetchKiteCandles(token, '15minute', 3,  apiKey, accessToken),
    fetchKiteCandles(token, 'day',      30, apiKey, accessToken),
  ]);
  return { candles15m: c15m ?? [], candlesDaily: cDaily ?? [] };
}

async function collectStationData(symbol) {
  const token = await resolveToken(symbol);
  if (!token) return null;
  const dp = await getDataProvider();
  const { apiKey, accessToken } = await dp.getAuth();
  if (!apiKey || !accessToken) return null;

  const [c15m, cDaily] = await Promise.all([
    fetchKiteCandles(token, '15minute', 7,  apiKey, accessToken),
    fetchKiteCandles(token, 'day',      60, apiKey, accessToken),
  ]);
  return { candles15m: c15m ?? [], candlesDaily: cDaily ?? [] };
}

async function collectOIData(symbol, base) {
  const OI_INDEX_MAP = { NIFTY: 'NIFTY', BANKNIFTY: 'BANKNIFTY' };
  const underlying = OI_INDEX_MAP[symbol?.toUpperCase()];
  if (!underlying) return null;
  try {
    const r    = await fetch(`${base}/api/option-chain?underlying=${underlying}&expiry=weekly`, { cache: 'no-store' });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.pcr) return null;
    return {
      underlying,
      pcr: data.pcr, maxPain: data.maxPain, spotPrice: parseFloat(data.spotPrice),
      atmStrike: data.atmStrike, expiry: data.expiry,
      support: data.support,       supportOI: data.supportOI,
      support2: data.support2,     support2OI: data.support2OI,
      resistance: data.resistance, resistanceOI: data.resistanceOI,
      resistance2: data.resistance2, resistance2OI: data.resistance2OI,
      totalCallOI: data.totalCallOI, totalPutOI: data.totalPutOI,
      marketActivity: data.marketActivity,
    };
  } catch { return null; }
}

// ── Public API ────────────────────────────────────────────────────────────────
// Returns unified intelligence for a symbol. Always runs all 5 agents.
// base: internal base URL (e.g. 'http://localhost:3000') — needed for internal API calls.
export async function getIntelligence(symbol, { base, interval = '15minute', transactionType, instrumentType, spotPrice, productType } = {}) {
  const sym      = symbol.toUpperCase();
  const isIndex  = INDEX_SYMBOLS.has(sym);
  const regimeSym = (sym === 'BANKNIFTY') ? 'BANKNIFTY' : 'NIFTY';

  // Use real direction when provided (order modal); fall back to neutral stub (chart pill)
  const order = {
    symbol:          sym,
    exchange:        instrumentType && ['CE','PE'].includes(instrumentType?.toUpperCase()) ? 'NFO' : 'NSE',
    instrumentType:  instrumentType ?? 'EQ',
    transactionType: transactionType ?? 'BUY',
    productType:     productType ?? 'MIS',
    spotPrice:       spotPrice,
  };

  // 1. Collect behavioral data + run all data collectors in parallel
  const [behavioralData, structureData, patternData, stationData, oiData, regimeRes] =
    await Promise.allSettled([
      collectBehavioralData(sym, base),
      collectStructureData(sym, base),
      collectPatternData(sym),
      collectStationData(sym),
      isIndex ? collectOIData(sym, base) : Promise.resolve(null),
      base ? fetch(`${base}/api/market-regime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: regimeSym, type: 'intraday' }),
        cache: 'no-store',
      }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
    ]);

  const bd = behavioralData.status === 'fulfilled' ? behavioralData.value : null;
  const sd = structureData.status  === 'fulfilled' ? structureData.value  : null;
  const pd = patternData.status    === 'fulfilled' ? patternData.value    : null;
  let   td = stationData.status    === 'fulfilled' ? stationData.value    : null;
  const od = oiData.status         === 'fulfilled' ? oiData.value         : null;
  const regime = regimeRes.status  === 'fulfilled' ? regimeRes.value      : null;

  // Validate station candles — if the last candle close diverges >15% from the known spot
  // price the cache contains data for the wrong symbol; bust it so the next call re-fetches.
  if (spotPrice && td?.candles15m?.length) {
    const lastClose    = td.candles15m.at(-1)?.close;
    const divergencePct = lastClose ? Math.abs(lastClose - spotPrice) / spotPrice * 100 : 0;
    if (divergencePct > 15) {
      console.warn(`[manager] stale candles for ${sym}: last close ${lastClose} vs spot ${spotPrice} (${divergencePct.toFixed(1)}% off) — busting cache`);
      const token = await resolveToken(sym).catch(() => null);
      if (token) {
        await Promise.allSettled([
          redisSet(`${NS}:candles:${token}:15minute:7`, null, 1),
          redisSet(`${NS}:candles:${token}:day:60`,     null, 1),
        ]);
      }
      td = null; // don't use this data; station agent will degrade gracefully
    }
  }

  // 2. Build agent inputs
  const agentBase = { order, ...(bd ?? { positions: {}, orders: {}, sentiment: {}, sector: {}, vix: null }) };

  // 3. Run all 5 agents
  const behavioral = runBehavioralAgent(agentBase);

  const structure = sd
    ? runStructureAgent({ order, structureData: sd, sector: agentBase.sector })
    : { behaviors: [], checks: [], verdict: 'clear', riskScore: 0, unavailable: true };

  const pattern = pd
    ? runPatternAgent({ order, patternData: pd })
    : { behaviors: [], checks: [], verdict: 'clear', riskScore: 0, unavailable: true };

  const station = td
    ? runStationAgent({ order, stationData: td })
    : { behaviors: [], checks: [], verdict: 'clear', riskScore: 0, unavailable: true };

  const oi = od
    ? runOIAgent({ order, oiData: od })
    : null;

  // 4. Scenario synthesis
  const scenario = runScenarioAgent({
    order,
    sentiment:       agentBase.sentiment,
    stationOutput:   station,
    oiData:          od,
    structureChecks: structure?.checks ?? null,
    marketRegime:    regime?.regime ?? null,
  });

  // 5. Combined risk score (sum of all agent scores, capped at 100)
  //    Deduplication FIRST — suppress structural/pattern checks that repeat the same
  //    "wrong direction" signal already captured by Behavioral's AGAINST_TREND.
  const behavioralFiredTrendConflict = behavioral.behaviors?.some(b => b.type === 'AGAINST_TREND');

  // Types in Structure / Pattern that are redundant when AGAINST_TREND is already flagged
  const TREND_REDUNDANT_TYPES = new Set([
    'EMA_MISALIGNED',          // Structure: EMAs bearish / bullish — same as AGAINST_TREND
    'EMA_PARTIAL_CONFLICT',    // Structure: mild EMA conflict
    'RSI_OVERBOUGHT',          // Structure: overbought on 15m (trend following, not reversal risk)
    'RSI_OVERSOLD',            // Structure: oversold on 15m
    'VOLUME_DIVERGENCE_15M',   // Pattern: price-volume divergence in trend direction
    'VOLUME_WEAK_MOVE_15M',    // Pattern: weak move conflicting with trade
  ]);

  function deduplicateAgent(agent) {
    if (!behavioralFiredTrendConflict) return agent;
    const deduped = agent.checks.map(c => {
      if (!c.passed && TREND_REDUNDANT_TYPES.has(c.type)) {
        return { ...c, passed: true, _deduped: true,
          title: `${c.title} (covered by trend-conflict check)` };
      }
      return c;
    });
    const triggered  = deduped.filter(c => !c.passed);
    const newScore   = triggered.reduce((sum, b) => sum + (b.riskScore ?? 0), 0);
    return { ...agent, checks: deduped, behaviors: triggered, riskScore: newScore };
  }

  const structureD = deduplicateAgent(structure);
  const patternD   = deduplicateAgent(pattern);

  const riskScore = Math.min(100, [behavioral, structureD, patternD, station, oi]
    .filter(Boolean)
    .reduce((sum, a) => sum + (a.riskScore ?? 0), 0));

  // 6. Raw price action — direction-agnostic, for chart pill display
  const pa15m = pd?.candles15m?.length ? pd.candles15m : null;
  const priceAction = pa15m ? {
    patterns:     detectPatterns(pa15m),
    volumeSignal: analyzeVolume(pa15m),
  } : null;

  return {
    symbol:      sym,
    interval,
    computedAt:  Date.now(),
    regime,
    scenario,
    riskScore,
    agents: { behavioral, structure: structureD, pattern: patternD, station, oi },
    priceAction,
    // Raw context — needed by OrderModal verdict card and terminal page
    positions:  bd?.positions  ?? { all: [], count: 0, sameSymbol: null },
    orders:     bd?.orders     ?? { open: [], openCount: 0 },
    sentiment:  bd?.sentiment  ?? { overallBias: 'NEUTRAL', intradayBias: 'NEUTRAL', overallScore: 50, intradayScore: 50 },
    sector:     bd?.sector     ?? { name: null, change: null, bias: 'NEUTRAL' },
    vix:        bd?.vix        ?? null,
    niftyContext: {
      regime,
      sentiment:  bd?.sentiment ?? null,
      sector:     bd?.sector    ?? null,
      vix:        bd?.vix       ?? null,
    },
  };
}
