// app/api/pre-market/global-markets/route.js
import { NextResponse } from 'next/server';

const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

let cache = { data: null, timestamp: 0 };

const MARKET_SYMBOLS = [
  { symbol: '^DJI',      name: 'DOW',       region: 'US' },
  { symbol: '^IXIC',     name: 'NASDAQ',    region: 'US' },
  { symbol: '^GSPC',     name: 'S&P 500',   region: 'US' },
  { symbol: '^N225',     name: 'Nikkei',    region: 'Asia' },
  { symbol: '^HSI',      name: 'Hang Seng', region: 'Asia' },
  { symbol: '000001.SS', name: 'Shanghai',  region: 'Asia' },
  { symbol: '^FTSE',     name: 'FTSE 100',  region: 'Europe' },
  { symbol: '^GDAXI',    name: 'DAX',       region: 'Europe' },
  { symbol: '^FCHI',     name: 'CAC 40',    region: 'Europe' },
];

const CURRENCY_SYMBOLS = [
  { symbol: 'USDINR=X', name: 'USD/INR', base: 'USD', quote: 'INR' },
  { symbol: 'EURUSD=X', name: 'EUR/USD', base: 'EUR', quote: 'USD' },
  { symbol: 'DX-Y.NYB', name: 'DXY',    base: 'USD', quote: 'Index' },
];

const COMMODITY_SYMBOLS = [
  { symbol: 'CL=F', name: 'Crude Oil', unit: 'USD/barrel' },
  { symbol: 'GC=F', name: 'Gold',      unit: 'USD/oz' },
  { symbol: 'SI=F', name: 'Silver',    unit: 'USD/oz' },
];

export async function GET() {
  try {
    const now = Date.now();
    if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
      return NextResponse.json({ success: true, cached: true, ...cache.data });
    }

    const [markets, currencies, commodities] = await Promise.all([
      fetchGroup(MARKET_SYMBOLS),
      fetchGroup(CURRENCY_SYMBOLS, (r, idx) => ({ ...r, base: CURRENCY_SYMBOLS[idx].base, quote: CURRENCY_SYMBOLS[idx].quote })),
      fetchGroup(COMMODITY_SYMBOLS, (r, idx) => ({ ...r, unit: COMMODITY_SYMBOLS[idx].unit })),
    ]);

    const result = { markets, currencies, commodities, timestamp: new Date().toISOString() };
    cache = { data: result, timestamp: now };

    return NextResponse.json({ success: true, cached: false, ...result });
  } catch (error) {
    console.error('Global markets error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      cached: !!cache.data,
      ...cache.data,
    }, { status: 500 });
  }
}

async function fetchGroup(symbolList, transform) {
  const results = await Promise.allSettled(
    symbolList.map(s => fetchYahooChart(s.symbol, s.name, s.region ?? null))
  );
  return results
    .map((r, idx) => {
      if (r.status !== 'fulfilled') return null;
      return transform ? transform(r.value, idx) : r.value;
    })
    .filter(Boolean);
}

// ─── Yahoo Finance v8/chart — minimal headers to avoid rate-limiting ─────────
// Extra headers like Referer or Accept-Language trigger Yahoo's rate limiter.
// Uses meta.chartPreviousClose (most reliable field for true previous session).
async function fetchYahooChart(symbol, name, region) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No chart result');

    const meta  = result.meta;
    const price = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;

    if (!price || !previousClose) throw new Error('Missing price data');

    const change        = price - previousClose;
    const changePercent = (change / previousClose) * 100;
    const isOpen        = meta.marketState === 'REGULAR';

    return {
      symbol,
      name,
      region,
      price:         parseFloat(price.toFixed(2)),
      change:        parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      previousClose: parseFloat(previousClose.toFixed(2)),
      isOpen,
      status:   isOpen ? 'OPEN' : 'CLOSED',
      currency: meta.currency || 'USD',
    };
  } catch (error) {
    console.error(`[global-markets] ${symbol} error:`, error.message);
    return { symbol, name, region, price: null, change: null, changePercent: null, status: 'ERROR' };
  }
}
