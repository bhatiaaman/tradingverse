import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';
import { getDataProvider } from '@/app/lib/providers';

const NS  = 'tv';
const TTL = 3600;

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateNDaysAgo(n) {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const SECTORS = [
  { token: 260105, symbol: 'NIFTY BANK',        name: 'Bank',      exchange: 'NSE' },
  { token: 259849, symbol: 'NIFTY IT',           name: 'IT',        exchange: 'NSE' },
  { token: 257801, symbol: 'NIFTY FIN SERVICE',  name: 'Financial', exchange: 'NSE' },
  { token: 263433, symbol: 'NIFTY AUTO',         name: 'Auto',      exchange: 'NSE' },
  { token: 262409, symbol: 'NIFTY PHARMA',       name: 'Pharma',    exchange: 'NSE' },
  { token: 263689, symbol: 'NIFTY METAL',        name: 'Metal',     exchange: 'NSE' },
  { token: 261897, symbol: 'NIFTY FMCG',         name: 'FMCG',      exchange: 'NSE' },
  { token: 261129, symbol: 'NIFTY REALTY',       name: 'Realty',    exchange: 'NSE' },
  { token: 261641, symbol: 'NIFTY ENERGY',       name: 'Energy',    exchange: 'NSE' },
  { token: 263945, symbol: 'NIFTY MEDIA',        name: 'Media',     exchange: 'NSE' },
  { token: 262921, symbol: 'NIFTY PSU BANK',     name: 'PSU Bank',  exchange: 'NSE' },
  { token: 261385, symbol: 'NIFTY INFRA',        name: 'Infra',     exchange: 'NSE' },
];

// NIFTY 50 benchmark
const BENCHMARK = { token: 256265, symbol: 'NIFTY 50', name: 'NIFTY 50', exchange: 'NSE' };

function pctChange(current, base) {
  if (!base || base === 0) return 0;
  return ((current - base) / base) * 100;
}

// ── RRG Computation ────────────────────────────────────────────────────────────
// For each sector compute:
//   rsRatio   = normalized relative strength vs benchmark (centered at 100)
//   rsMomentum = normalized rate of change of RS (centered at 100)
// We do this for today + last 4 weeks (tail) to show rotation direction.
//
// RS series = sectorClose[i] / benchmarkClose[i]
// rsRatio   = mean-zero normalized over the 25-day window then scaled 90-110
// rsMomentum = 5-day rate-of-change of the RS series, similarly normalized

function computeRRGSeries(sectorCandles, benchCandles, tailLen = 4) {
  // Align both candle arrays by date
  const benchMap = {};
  for (const c of benchCandles) benchMap[c.date?.slice(0, 10) || ''] = c.close;

  // Build RS ratio series from aligned dates
  const aligned = sectorCandles
    .filter(c => {
      const d = c.date?.slice(0, 10) || '';
      return benchMap[d] && benchMap[d] > 0;
    })
    .map(c => {
      const d = c.date?.slice(0, 10) || '';
      return { date: d, rs: c.close / benchMap[d] };
    });

  if (aligned.length < 6) return null;

  // Normalize RS to JdK-style (100 = neutral)
  const rsValues = aligned.map(a => a.rs);
  const rsMean = rsValues.reduce((s, v) => s + v, 0) / rsValues.length;
  const rsStd  = Math.sqrt(rsValues.reduce((s, v) => s + (v - rsMean) ** 2, 0) / rsValues.length) || 1;

  const normalized = aligned.map(a => ({
    date:     a.date,
    rsRatio:  100 + ((a.rs - rsMean) / rsStd) * 5, // scale ±2σ → ~90-110
  }));

  // Compute RS momentum = 5-period RoC of rsRatio
  const withMom = normalized.map((n, i) => {
    if (i < 5) return { ...n, rsMomentum: 100 };
    const roc = ((n.rsRatio - normalized[i - 5].rsRatio) / Math.abs(normalized[i - 5].rsRatio)) * 100;
    return { ...n, rsMomentum: 100 + roc * 2 }; // amplify for readability
  });

  // Return last `tailLen` points as the tail (oldest first) + current
  const tail = withMom.slice(-(tailLen + 1));
  return tail;
}

function getQuadrant(rsRatio, rsMomentum) {
  if (rsRatio >= 100 && rsMomentum >= 100) return 'Leading';
  if (rsRatio >= 100 && rsMomentum <  100) return 'Weakening';
  if (rsRatio <  100 && rsMomentum >= 100) return 'Improving';
  return 'Lagging';
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get('refresh') === '1';

  const today    = todayIST();
  const cacheKey = `${NS}:sector-rotation:${today}`;

  if (!refresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return NextResponse.json({ ...parsed, cached: true });
    }
  }

  try {
    const dp = await getDataProvider();

    // Build instrument keys for OHLC
    const instrumentKeys = SECTORS.map(s => `${s.exchange}:${s.symbol}`);

    // 1. Get 1D OHLC data
    const ohlcData = await dp.getOHLC(instrumentKeys);

    // 2. Fetch historical data for each sector + benchmark (42 days = ~30 trading days for tails)
    const fromDate = dateNDaysAgo(42);
    const toDate   = today;

    const [benchResult, ...historicalResults] = await Promise.allSettled([
      dp.getHistoricalData(BENCHMARK.token, 'day', fromDate, toDate),
      ...SECTORS.map(s => dp.getHistoricalData(s.token, 'day', fromDate, toDate))
    ]);

    const benchCandles = benchResult.status === 'fulfilled' ? (benchResult.value || []) : [];

    // 3. Build sector results
    const sectors = SECTORS.map((sector, i) => {
      const key  = `${sector.exchange}:${sector.symbol}`;
      const ohlc = ohlcData?.[key];

      const lastPrice   = ohlc?.last_price     ?? 0;
      const prevClose   = ohlc?.ohlc?.close    ?? 0;
      const change1D    = pctChange(lastPrice, prevClose);

      let change1W = 0;
      let change1M = 0;

      const histResult = historicalResults[i];
      if (histResult.status === 'fulfilled') {
        const candles = histResult.value || [];
        if (candles.length > 0) {
          const latestClose = candles[candles.length - 1]?.close ?? lastPrice;

          const idx1W   = Math.max(0, candles.length - 1 - 5);
          const close1W = candles[idx1W]?.close ?? 0;
          change1W = pctChange(latestClose, close1W);

          const idx1M   = Math.max(0, candles.length - 1 - 20);
          const close1M = candles[idx1M]?.close ?? 0;
          change1M = pctChange(latestClose, close1M);
        }
      }

      return {
        name:      sector.name,
        symbol:    sector.symbol,
        lastPrice,
        change1D:  parseFloat(change1D.toFixed(2)),
        change1W:  parseFloat(change1W.toFixed(2)),
        change1M:  parseFloat(change1M.toFixed(2)),
      };
    });

    // 4. Build RRG data (only if benchmark data is available)
    let rrgData = [];
    if (benchCandles.length > 6) {
      rrgData = SECTORS.map((sector, i) => {
        const histResult = historicalResults[i];
        if (histResult.status !== 'fulfilled') return null;
        const sectorCandles = histResult.value || [];
        if (sectorCandles.length < 6) return null;

        const tail = computeRRGSeries(sectorCandles, benchCandles, 4);
        if (!tail || tail.length === 0) return null;

        const current = tail[tail.length - 1];
        return {
          name:        sector.name,
          rsRatio:     parseFloat(current.rsRatio.toFixed(3)),
          rsMomentum:  parseFloat(current.rsMomentum.toFixed(3)),
          quadrant:    getQuadrant(current.rsRatio, current.rsMomentum),
          tail:        tail.map(t => ({
            rsRatio:    parseFloat(t.rsRatio.toFixed(3)),
            rsMomentum: parseFloat(t.rsMomentum.toFixed(3)),
          })),
        };
      }).filter(Boolean);
    }

    const payload = { sectors, rrgData, timestamp: new Date().toISOString(), cached: false };
    await redis.set(cacheKey, JSON.stringify(payload), { ex: TTL });

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[sector-rotation] error:', err.message);
    return NextResponse.json(
      { error: err.message, sectors: [], rrgData: [], cached: false },
      { status: 500 }
    );
  }
}
