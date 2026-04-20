import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';
import { cachedRedisGet as redisGet, cachedRedisSet as redisSet } from '@/app/lib/cached-redis';

const NS = process.env.REDIS_NAMESPACE || 'default';

const INSTRUMENTS = {
  NIFTY:     { token: 256265, ohlcKey: 'NSE:NIFTY 50' },
  BANKNIFTY: { token: 260105, ohlcKey: 'NSE:NIFTY BANK' },
};

function calculateEMA(prices, period) {
  if (!prices || prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function isMarketHours() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const day = istTime.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hours = istTime.getUTCHours();
  return hours >= 9 && hours < 16;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') === 'BANKNIFTY' ? 'BANKNIFTY' : 'NIFTY';
  const inst = INSTRUMENTS[symbol];

  const cacheKey = `${NS}:key-levels:${symbol.toLowerCase()}`;
  const cached = await redisGet(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite not connected' }, { status: 503 });
    }

    const formatDate = (d) => d.toISOString().split('T')[0];
    const today = new Date();
    const from250 = new Date();
    from250.setDate(from250.getDate() - 365); // fetch ~365 days to get 250 trading days

    // 1. Fetch daily candles (250+ days for EMA200)
    const dailyCandles = await dp.getHistoricalData(inst.token, 'day', formatDate(from250), formatDate(today));
    if (!dailyCandles || dailyCandles.length < 50) {
      return NextResponse.json({ error: 'Insufficient historical data' }, { status: 503 });
    }

    // Filter to completed candles only (exclude today's partial)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const todayIST = new Date(Date.now() + istOffset).toISOString().slice(0, 10);
    const completedDaily = dailyCandles.filter(c => {
      const candleDateIST = new Date(new Date(c.date).getTime() + istOffset).toISOString().slice(0, 10);
      return candleDateIST < todayIST;
    });

    if (completedDaily.length < 5) {
      return NextResponse.json({ error: 'Insufficient completed candles' }, { status: 503 });
    }

    // Previous day = last completed candle
    const prevDay = completedDaily[completedDaily.length - 1];
    const PDH = prevDay.high;
    const PDL = prevDay.low;
    const PDC = prevDay.close;

    // Pivot points
    const PP = (PDH + PDL + PDC) / 3;
    const R1 = 2 * PP - PDL;
    const R2 = PP + (PDH - PDL);
    const R3 = PDH + 2 * (PP - PDL);
    const S1 = 2 * PP - PDH;
    const S2 = PP - (PDH - PDL);
    const S3 = PDL - 2 * (PDH - PP);

    // Weekly H/L (last 5 trading days)
    const last5 = completedDaily.slice(-5);
    const weeklyHigh = Math.max(...last5.map(c => c.high));
    const weeklyLow  = Math.min(...last5.map(c => c.low));

    // Monthly H/L (last 22 trading days ≈ 1 month)
    const last22 = completedDaily.slice(-22);
    const monthlyHigh = Math.max(...last22.map(c => c.high));
    const monthlyLow  = Math.min(...last22.map(c => c.low));

    // EMAs from close prices of completed candles
    const closes = completedDaily.map(c => c.close);
    const ema9   = calculateEMA(closes, 9);
    const ema21  = calculateEMA(closes, 21);
    const ema50  = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);

    // 2. Fetch today's 15-min candles for OR + today's H/L
    let todayHigh = null;
    let todayLow = null;
    let orHigh = null;
    let orLow = null;
    let spot = null;

    try {
      // Get live OHLC for current price + today's high/low
      const ohlcData = await dp.getOHLC([inst.ohlcKey]);
      const ohlc = ohlcData?.[inst.ohlcKey];
      if (ohlc) {
        spot = ohlc.last_price;
        todayHigh = ohlc.ohlc?.high;
        todayLow = ohlc.ohlc?.low;
      }
    } catch { /* ignore */ }

    // Fetch 15-min candles for OR (first 30 min = 9:15 + 9:30 candles)
    if (isMarketHours()) {
      try {
        const fromToday = formatDate(today);
        const intraday = await dp.getHistoricalData(inst.token, '15minute', fromToday, fromToday);
        if (intraday && intraday.length >= 2) {
          // OR = first two 15-min candles (9:15 and 9:30)
          const orCandles = intraday.slice(0, 2);
          orHigh = Math.max(...orCandles.map(c => c.high));
          orLow  = Math.min(...orCandles.map(c => c.low));
        }
      } catch { /* ignore */ }
    }

    // 3. Build levels array — only PP/R1/S1 from pivots; nearest 2 EMAs only
    const emaOptions = [
      ema9   ? { label: 'EMA9',   price: Math.round(ema9   * 100) / 100, category: 'ema' } : null,
      ema21  ? { label: 'EMA21',  price: Math.round(ema21  * 100) / 100, category: 'ema' } : null,
      ema50  ? { label: 'EMA50',  price: Math.round(ema50  * 100) / 100, category: 'ema' } : null,
      ema200 ? { label: 'EMA200', price: Math.round(ema200 * 100) / 100, category: 'ema' } : null,
    ].filter(Boolean);

    // Pick the 2 EMAs closest to spot
    const nearestEmas = spot
      ? emaOptions
          .map(e => ({ ...e, absDist: Math.abs(e.price - spot) }))
          .sort((a, b) => a.absDist - b.absDist)
          .slice(0, 2)
          .map(({ absDist: _, ...e }) => e)
      : emaOptions.slice(0, 2);

    const allLevels = [
      { label: 'PDH', price: PDH, category: 'pd' },
      { label: 'PDL', price: PDL, category: 'pd' },
      { label: 'PDC', price: PDC, category: 'pd' },
      { label: 'PP',  price: PP,  category: 'pivot' },
      { label: 'R1',  price: R1,  category: 'pivot' },
      { label: 'S1',  price: S1,  category: 'pivot' },
      { label: 'WkH', price: weeklyHigh,  category: 'weekly' },
      { label: 'WkL', price: weeklyLow,   category: 'weekly' },
      { label: 'MoH', price: monthlyHigh, category: 'monthly' },
      { label: 'MoL', price: monthlyLow,  category: 'monthly' },
      ...nearestEmas,
      todayHigh ? { label: 'TdH', price: todayHigh, category: 'today' } : null,
      todayLow  ? { label: 'TdL', price: todayLow,  category: 'today' } : null,
      orHigh ? { label: 'ORH', price: orHigh, category: 'or' } : null,
      orLow  ? { label: 'ORL', price: orLow,  category: 'or' } : null,
    ].filter(Boolean);

    // Attach distance from spot (% and direction)
    const levelsWithDist = allLevels.map(l => ({
      ...l,
      price: Math.round(l.price * 100) / 100,
      dist: spot ? ((l.price - spot) / spot) * 100 : null,
    }));

    // Sort by proximity to spot
    const sorted = spot
      ? [...levelsWithDist].sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist))
      : levelsWithDist;

    const result = { levels: sorted, spot, updatedAt: Date.now() };

    // Cache for 5 min during market hours, 15 min otherwise
    const ttl = isMarketHours() ? 300 : 900;
    await redisSet(cacheKey, result, ttl);

    return NextResponse.json(result);
  } catch (err) {
    console.error('key-levels error:', err.message);
    return NextResponse.json({ error: 'Failed to compute key levels' }, { status: 500 });
  }
}
