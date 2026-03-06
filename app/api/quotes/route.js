import { NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

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
        .map(s => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
        .filter(Boolean)
    )].slice(0, 50);
    if (symbols.length === 0) {
      return NextResponse.json({ quotes: [] });
    }

    const cacheKey = `${NS}:quotes:${symbols.slice().sort().join('-')}`;
    const cached = await redisGet(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });

    const { apiKey, accessToken } = await getKiteCredentials();
    if (!apiKey || !accessToken) {
      return NextResponse.json({ quotes: [], error: 'Kite API not configured' });
    }

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const instrumentKeys = symbols.map(sym => INDEX_INSTRUMENTS[sym] || `NSE:${sym}`);
    const ohlcData = await kite.getOHLC(instrumentKeys);

    const quotes = [];
    for (const sym of symbols) {
      const key = INDEX_INSTRUMENTS[sym] || `NSE:${sym}`;
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
    return NextResponse.json(payload);
  } catch (err) {
    console.error('Quotes error:', err);
    return NextResponse.json({ quotes: [], error: 'Internal server error' });
  }
}
