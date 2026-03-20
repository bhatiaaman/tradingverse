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

function pctChange(current, base) {
  if (!base || base === 0) return 0;
  return ((current - base) / base) * 100;
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

    // 2. Fetch historical data for each sector (35 calendar days for ~25 trading days)
    const fromDate = dateNDaysAgo(35);
    const toDate   = today;

    const historicalResults = await Promise.allSettled(
      SECTORS.map(s => dp.getHistoricalData(s.token, 'day', fromDate, toDate))
    );

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
        // candles are [{date, open, high, low, close, volume}, ...] sorted ascending
        if (candles.length > 0) {
          const latestClose = candles[candles.length - 1]?.close ?? lastPrice;

          // 1W = 5 trading days back
          const idx1W = Math.max(0, candles.length - 1 - 5);
          const close1W = candles[idx1W]?.close ?? 0;
          change1W = pctChange(latestClose, close1W);

          // 1M = 20 trading days back
          const idx1M = Math.max(0, candles.length - 1 - 20);
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

    const payload = { sectors, timestamp: new Date().toISOString(), cached: false };
    await redis.set(cacheKey, JSON.stringify(payload), { ex: TTL });

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[sector-rotation] error:', err.message);
    return NextResponse.json(
      { error: err.message, sectors: [], cached: false },
      { status: 500 }
    );
  }
}
