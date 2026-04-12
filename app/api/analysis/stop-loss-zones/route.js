import { NextResponse } from 'next/server';
import { StopLossEngine } from '../../../lib/analysis/stopLossEngine';
import { getDataProvider } from '@/app/lib/providers';

const INDEX_TOKENS = {
  NIFTY: 256265,
  BANKNIFTY: 260105,
  'NIFTY BANK': 260105,
  SENSEX: 265,
};

async function getToken(symbol, dp) {
  if (INDEX_TOKENS[symbol]) return INDEX_TOKENS[symbol];
  if (symbol === 'NIFTY 50') return 256265;

  // Dynamic fallback for EQ instruments (e.g. RELIANCE, TCS)
  try {
    const csv = await dp.getInstrumentsCSV('NSE');
    const lines = csv.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const sym  = cols[2]?.replace(/"/g, '').trim();
      const type = cols[9]?.replace(/"/g, '').trim();
      if (sym === symbol && type === 'EQ') return parseInt(cols[0], 10);
    }
  } catch { }
  return null;
}

// All date math in IST using UTC getters on a shifted epoch (Vercel runs UTC)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const pad = n => String(n).padStart(2, '0');

function istDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + IST_OFFSET_MS + offsetDays * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}

// Redis cache (same pattern as other routes)
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const CACHE_TTL   = 5 * 60; // 5 minutes

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}
async function redisSet(key, value) {
  try {
    const enc = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${key}/${enc}?ex=${CACHE_TTL}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch { }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol          = (searchParams.get('symbol') || 'NIFTY').toUpperCase().trim();
  const interval        = searchParams.get('interval') || '15minute';
  const currentPriceStr = searchParams.get('currentPrice');

  // Per-interval config:
  //   isIntraday   — 5m/15m: use 15m+1H data, skip daily dominance
  //   isHourly     — 1H: use 1H+daily data, skip 15m noise
  //   isDaily      — day/week: use daily data only, long lookback
  const isIntraday = ['5minute', '15minute'].includes(interval);
  const isHourly   = interval === '60minute';

  // maxDistancePct: how far from current price a cluster can be and still show.
  // Daily/weekly use no cap (null) — major S/R from monthly pivots can be far away.
  const maxDistancePct = isIntraday ? 0.02 : isHourly ? 0.04 : null;

  // minDistancePct: ignore clusters too close to current price (they're noise, not S/R ahead).
  const minDistancePct = isIntraday ? 0.002 : isHourly ? 0.004 : 0.006;

  const cacheKey = `${NS}:sl-clusters:v3:${symbol}:${interval}`;
  const cached   = await redisGet(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const dp = await getDataProvider();
    if (!dp?.isConnected()) {
      return NextResponse.json({ error: 'Kite not connected' }, { status: 503 });
    }

    const token = await getToken(symbol, dp);
    if (!token) {
      return NextResponse.json({ error: `Token not found for symbol: ${symbol}` }, { status: 400 });
    }

    async function resolvePrice() {
      if (currentPriceStr) return parseFloat(currentPriceStr);
      try {
        let ltpSym = symbol;
        if (ltpSym === 'BANKNIFTY') ltpSym = 'NIFTY BANK';
        if (ltpSym === 'NIFTY')     ltpSym = 'NIFTY 50';
        const q = await dp.getLTP(`NSE:${ltpSym}`);
        return q?.data?.[`NSE:${ltpSym}`]?.last_price ?? null;
      } catch { return null; }
    }

    const toStr = istDateStr(0);

    // Fetch data relevant to chart interval + current price in parallel
    let raw15m = [], raw1H = [], raw1D = [], resolvedPrice;
    if (isIntraday) {
      [raw15m, raw1H, resolvedPrice] = await Promise.all([
        dp.getHistoricalData(token, '15minute', istDateStr(-20), toStr),
        dp.getHistoricalData(token, '60minute', istDateStr(-40), toStr),
        resolvePrice(),
      ]);
    } else if (isHourly) {
      [raw1H, raw1D, resolvedPrice] = await Promise.all([
        dp.getHistoricalData(token, '60minute', istDateStr(-60),  toStr),
        dp.getHistoricalData(token, 'day',      istDateStr(-150), toStr),
        resolvePrice(),
      ]);
    } else {
      // day / week — long lookback daily only; no 15m/1H noise
      [raw1D, resolvedPrice] = await Promise.all([
        dp.getHistoricalData(token, 'day', istDateStr(-365), toStr),
        resolvePrice(),
      ]);
    }

    const currentPrice = resolvedPrice ?? 22500;

    const prox    = Math.max(1, currentPrice * 0.000625);
    const maxRng  = Math.max(2, currentPrice * 0.00208);
    let roundStep = 500;
    if (currentPrice < 250)        roundStep = 5;
    else if (currentPrice < 1000)  roundStep = 10;
    else if (currentPrice < 4000)  roundStep = 50;
    else if (currentPrice < 15000) roundStep = 100;

    const engine = new StopLossEngine({ proximityTolerance: prox, clusterMaxRange: maxRng, roundNumberStep: roundStep });

    const mapCandles = arr => (arr || []).map(c => ({
      timestamp: new Date(c.date).getTime(),
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    }));

    const allClusters = engine.buildClusters({
      currentPrice,
      maxDistancePct,
      minDistancePct,
      data15m: mapCandles(raw15m),
      data1H:  mapCandles(raw1H),
      data1D:  mapCandles(raw1D),
      optionsData: [],
    });

    // Split by side, then sort each by distance to current price (nearest first)
    // so the most immediately relevant zones are returned, not just the highest-scored ones
    const byDist = c => Math.abs((c.range.min + c.range.max) / 2 - currentPrice);

    const bslClusters = allClusters
      .filter(c => c.side === 'BSL')
      .sort((a, b) => byDist(a) - byDist(b));

    const sslClusters = allClusters
      .filter(c => c.side === 'SSL')
      .sort((a, b) => byDist(a) - byDist(b));

    const result = {
      symbol, currentPrice, interval,
      metrics: {
        totalClustersIdentified: allClusters.length,
        bslCount: bslClusters.length,
        sslCount: sslClusters.length,
      },
      topBSLZones: bslClusters.slice(0, 3),
      topSSLZones: sslClusters.slice(0, 3),
    };

    await redisSet(cacheKey, result);
    return NextResponse.json(result);

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
