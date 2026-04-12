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

  // Tighter proximity window for intraday charts — daily pivots far away aren't relevant on a 5m chart
  const maxDistancePct = ['5minute','15minute'].includes(interval) ? 0.02
                       : interval === '60minute'                   ? 0.04
                       : 0.08; // day / week

  const cacheKey = `${NS}:sl-clusters:${symbol}:${interval}`;
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

    // Resolve current price — prefer query param, fall back to LTP
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
    const [raw15m, raw1H, raw1D, resolvedPrice] = await Promise.all([
      dp.getHistoricalData(token, '15minute', istDateStr(-15),  toStr),
      dp.getHistoricalData(token, '60minute', istDateStr(-30),  toStr),
      dp.getHistoricalData(token, 'day',      istDateStr(-100), toStr),
      resolvePrice(),
    ]);

    const currentPrice = resolvedPrice ?? 22500; // fallback only if LTP unavailable (market closed)

    const prox    = Math.max(1, currentPrice * 0.000625);
    const maxRng  = Math.max(2, currentPrice * 0.00208);
    let roundStep = 500;
    if (currentPrice < 250)   roundStep = 5;
    else if (currentPrice < 1000)  roundStep = 10;
    else if (currentPrice < 4000)  roundStep = 50;
    else if (currentPrice < 15000) roundStep = 100;

    const engine = new StopLossEngine({ proximityTolerance: prox, clusterMaxRange: maxRng, roundNumberStep: roundStep });

    const mapCandles = arr => (arr || []).map(c => ({
      timestamp: new Date(c.date).getTime(),
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    }));

    const clusters = engine.buildClusters({
      currentPrice,
      maxDistancePct,
      data15m: mapCandles(raw15m),
      data1H:  mapCandles(raw1H),
      data1D:  mapCandles(raw1D),
      optionsData: [], // hookable to /api/option-chain later
    });

    const bslClusters = clusters.filter(c => c.side === 'BSL');
    const sslClusters = clusters.filter(c => c.side === 'SSL');

    const result = {
      symbol, currentPrice,
      metrics: { totalClustersIdentified: clusters.length, bslCount: bslClusters.length, sslCount: sslClusters.length },
      topBSLZones: bslClusters.slice(0, 3),
      topSSLZones: sslClusters.slice(0, 3),
    };

    await redisSet(cacheKey, result);
    return NextResponse.json(result);

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
