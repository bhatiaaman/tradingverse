import { NextResponse } from 'next/server';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const LOT_SIZE_KEY = `${NS}:lot-size-map-v2`;
const LOT_SIZE_TTL = 86400; // 24 hours

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

const FALLBACK_LOT_SIZES = {
  NIFTY: 75, BANKNIFTY: 30, FINNIFTY: 40, MIDCPNIFTY: 75,
  SENSEX: 10, BANKEX: 15,
  RELIANCE: 250, TCS: 175, HDFCBANK: 550, INFY: 400,
  ICICIBANK: 700, SBIN: 1500, BHARTIARTL: 475, TATAMOTORS: 1400,
  ITC: 1600, AXISBANK: 900, KOTAKBANK: 400, LT: 150,
  MARUTI: 50, WIPRO: 1500, BAJFINANCE: 125, HINDUNILVR: 300,
};

// Fetch NFO instruments and build lot-size map; cache in Redis (24h)
async function getLotSizeMap(apiKey, accessToken) {
  const cached = await redisGet(LOT_SIZE_KEY);
  if (cached) return cached;

  const res = await fetch('https://api.kite.trade/instruments/NFO', {
    headers: { 'Authorization': `token ${apiKey}:${accessToken}` },
  });
  if (!res.ok) return FALLBACK_LOT_SIZES;

  const csvText = await res.text();
  const lines   = csvText.trim().split('\n');
  const headers = lines[0].split(',');

  const lotSizeIdx = headers.indexOf('lot_size');
  const nameIdx    = headers.indexOf('name');
  const typeIdx    = headers.indexOf('instrument_type');

  const instruments = {};
  for (let i = 1; i < lines.length; i++) {
    const cols    = lines[i].split(',');
    const type    = cols[typeIdx];
    const lotSize = parseInt(cols[lotSizeIdx]) || 0;
    if (type === 'FUT' && lotSize > 0) {
      const name = cols[nameIdx]?.replace(/"/g, '').trim();
      if (name && !instruments[name]) instruments[name] = lotSize;
    }
  }
  // Merge fallbacks for symbols not found in NFO (indices, less-liquid stocks)
  for (const [sym, ls] of Object.entries(FALLBACK_LOT_SIZES)) {
    if (!instruments[sym]) instruments[sym] = ls;
  }

  await redisSet(LOT_SIZE_KEY, instruments, LOT_SIZE_TTL);
  return instruments;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase();

    if (!symbol) {
      return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
    }

    const { apiKey, accessToken } = await getKiteCredentials();

    if (!accessToken) {
      return NextResponse.json({ symbol, lotSize: FALLBACK_LOT_SIZES[symbol] || 1, source: 'fallback' });
    }

    const lotMap = await getLotSizeMap(apiKey, accessToken);

    return NextResponse.json({ symbol, lotSize: lotMap[symbol] || 1, source: 'kite' });

  } catch (error) {
    console.error('Lot size error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
