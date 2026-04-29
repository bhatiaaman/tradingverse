import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const LOT_SIZE_KEY = `${NS}:lot-size-map-v3`;
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
  NIFTY: 65, BANKNIFTY: 30, FINNIFTY: 40, MIDCPNIFTY: 120,
  SENSEX: 10, BANKEX: 15, RELIANCE: 250, TCS: 150, INFY: 300,
  HDFCBANK: 550, ICICIBANK: 700, SBIN: 1500, HDFC: 300,
  BHARTIARTL: 500, COFORGE: 375, LT: 175, HAVELLS: 500,
};

// Fetch NFO instruments and build lot-size map; cache in Redis (24h)
async function getLotSizeMap(dp) {
  const cached = await redisGet(LOT_SIZE_KEY);
  if (cached) return cached;

  try {
    const csvText = await dp.getNFOInstrumentsCSV();
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
  } catch (e) {
    console.error('Lot size map fetch failed:', e.message, '— using fallback');
    return FALLBACK_LOT_SIZES;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase();

    if (!symbol) {
      return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
    }

    const dp = await getDataProvider();

    if (!dp.isConnected()) {
      return NextResponse.json({ symbol, lotSize: FALLBACK_LOT_SIZES[symbol] || 1, source: 'fallback' });
    }

    const lotMap = await getLotSizeMap(dp);

    return NextResponse.json({ symbol, lotSize: lotMap[symbol] || 1, source: 'kite' });

  } catch (error) {
    console.error('Lot size error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
