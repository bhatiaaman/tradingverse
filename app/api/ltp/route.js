import { NextResponse } from 'next/server';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

const REDIS_URL    = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN  = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS           = process.env.REDIS_NAMESPACE || 'default';
const LOT_SIZE_KEY = `${NS}:lot-size-map-v2`;
const LOT_SIZE_TTL = 86400; // 24 hours

const INDEX_INSTRUMENTS = {
  'NIFTY':      'NSE:NIFTY 50',
  'BANKNIFTY':  'NSE:NIFTY BANK',
  'FINNIFTY':   'NSE:NIFTY FIN SERVICE',
  'MIDCPNIFTY': 'NSE:NIFTY MID SELECT',
  'SENSEX':     'BSE:SENSEX',
  'BANKEX':     'BSE:BANKEX',
};

const FALLBACK_LOT_SIZES = {
  NIFTY: 65, BANKNIFTY: 30, FINNIFTY: 40, MIDCPNIFTY: 120,
  SENSEX: 10, BANKEX: 15, RELIANCE: 250, TCS: 150, INFY: 300,
  HDFCBANK: 550, ICICIBANK: 700, SBIN: 1500, HDFC: 300,
  BHARTIARTL: 500, COFORGE: 375, LT: 175, HAVELLS: 500,
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

// Shared Redis key with lot-size/route.js — if either route has already warmed the cache, both benefit
async function getLotSizeMap(apiKey, accessToken) {
  const cached = await redisGet(LOT_SIZE_KEY);
  if (cached) return cached;

  try {
    const nfoRes = await fetch('https://api.kite.trade/instruments/NFO', {
      headers: { 'Authorization': `token ${apiKey}:${accessToken}` },
    });
    if (!nfoRes.ok) return FALLBACK_LOT_SIZES;

    const lines   = (await nfoRes.text()).trim().split('\n');
    const headers = lines[0].split(',');
    const nameIdx = headers.indexOf('name');
    const typeIdx = headers.indexOf('instrument_type');
    const lotIdx  = headers.indexOf('lot_size');

    const map = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols[typeIdx] === 'FUT') {
        const name = cols[nameIdx]?.replace(/"/g, '').trim();
        const lot  = parseInt(cols[lotIdx]) || 0;
        if (name && lot > 0 && !map[name]) map[name] = lot;
      }
    }
    // Merge fallbacks for symbols not found in NFO (indices, less-liquid stocks)
    for (const [sym, ls] of Object.entries(FALLBACK_LOT_SIZES)) {
      if (!map[sym]) map[sym] = ls;
    }

    await redisSet(LOT_SIZE_KEY, map, LOT_SIZE_TTL);
    return map;
  } catch {
    return FALLBACK_LOT_SIZES;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Symbol required' }, { status: 400 });
    }

    const clean = symbol.includes(':') ? symbol.split(':')[1] : symbol;
    const upper = clean.toUpperCase();

    const { apiKey, accessToken } = await getKiteCredentials();
    if (!apiKey || !accessToken) {
      return NextResponse.json({ success: false, error: 'Kite not authenticated' }, { status: 401 });
    }

    const instrument = INDEX_INSTRUMENTS[upper] || `NSE:${upper}`;

    // Fetch LTP and lot size map in parallel
    const [kiteRes, lotSizeMap] = await Promise.all([
      fetch(`https://api.kite.trade/quote/ltp?i=${encodeURIComponent(instrument)}`, {
        headers: {
          'Authorization': `token ${apiKey}:${accessToken}`,
          'X-Kite-Version': '3',
        },
      }),
      getLotSizeMap(apiKey, accessToken),
    ]);

    if (!kiteRes.ok) {
      const err = await kiteRes.text();
      console.error('Kite LTP error:', err);
      return NextResponse.json({ success: false, error: 'Kite API error' }, { status: 502 });
    }

    const kiteData = await kiteRes.json();
    const ltp = kiteData.data?.[instrument]?.last_price || null;

    if (!ltp) {
      return NextResponse.json({ success: false, error: 'Symbol not found or no price' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ltp,
      lotSize: lotSizeMap[upper] || 1,
      symbol: upper,
    });

  } catch (error) {
    console.error('LTP route error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}