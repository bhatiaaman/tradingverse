import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const CACHE_TTL   = 15; // 15 seconds

const INDEX_INSTRUMENTS = {
  'NIFTY':      'NSE:NIFTY 50',
  'BANKNIFTY':  'NSE:NIFTY BANK',
  'FINNIFTY':   'NSE:NIFTY FIN SERVICE',
  'MIDCPNIFTY': 'NSE:NIFTY MID SELECT',
  'SENSEX':     'BSE:SENSEX',
  'BANKEX':     'BSE:BANKEX',
};

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');
    if (!symbolsParam) {
      return NextResponse.json({ quotes: [], error: 'symbols param required' });
    }

    const symbols = [...new Set(
      symbolsParam.split(',')
        .map(s => s.trim().toUpperCase().replace(/[^A-Z0-9&-]/g, ''))
        .filter(Boolean)
    )].slice(0, 50);
    if (symbols.length === 0) {
      return NextResponse.json({ quotes: [] });
    }

    const cacheKey = `${NS}:quotes:${symbols.slice().sort().join('-')}`;
    const cached = await redisGet(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });

    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ quotes: [], error: 'Kite API not configured' });
    }

    // Option symbols contain digits (e.g. NIFTY2640722600BCE) → NFO exchange
    // Equity/index symbols are uppercase letters only → use INDEX_INSTRUMENTS or NSE
    const isOptionSym = (s) => /\d/.test(s) && !INDEX_INSTRUMENTS[s];
    const instrumentKeys = symbols.map(sym =>
      INDEX_INSTRUMENTS[sym] || (isOptionSym(sym) ? `NFO:${sym}` : `NSE:${sym}`)
    );
    const ohlcData = await dp.getOHLC(instrumentKeys);

    const quotes = [];
    for (const sym of symbols) {
      const key = INDEX_INSTRUMENTS[sym] || (isOptionSym(sym) ? `NFO:${sym}` : `NSE:${sym}`);
      const d = ohlcData[key];
      if (!d) continue;
      const ltp       = d.last_price;
      const prevClose = d.ohlc?.close ?? d.last_price;
      const change    = ltp - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
      quotes.push({ symbol: sym, ltp, change: parseFloat(change.toFixed(2)), changePct: parseFloat(changePct.toFixed(2)), prevClose });
    }

    const payload = { quotes, timestamp: new Date().toISOString() };
    await redisSet(cacheKey, payload, CACHE_TTL);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 's-maxage=15, stale-while-revalidate=10' },
    });
  } catch (err) {
    console.error('Quotes error:', err);
    return NextResponse.json({ quotes: [], error: 'Internal server error' });
  }
}
