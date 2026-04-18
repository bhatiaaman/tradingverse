import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, ttl) {
  try {
    const enc = encodeURIComponent(JSON.stringify(value));
    const url = ttl ? `${REDIS_URL}/set/${key}/${enc}?ex=${ttl}` : `${REDIS_URL}/set/${key}/${enc}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch {}
}

const SYMBOLS_CACHE_KEY = `${NS}:all-nse-symbols`;
const CACHE_TTL = 86400; // 24 hours

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.toUpperCase() || '';

  if (query.length < 2) {
    return NextResponse.json({ symbols: [] });
  }

  try {
    // 1. Check cache first
    let allSymbols = await redisGet(SYMBOLS_CACHE_KEY);

    if (!allSymbols) {
      // 2. Fetch from Kite if cache is empty
      const dp = await getDataProvider();
      if (!dp.isConnected()) {
        return NextResponse.json({ error: 'Kite disconnected' }, { status: 503 });
      }

      const csvText = await dp.getInstrumentsCSV('NSE');
      const lines = csvText.trim().split('\n');
      const headers = lines[0].split(',');
      const tsIdx = headers.indexOf('tradingsymbol');
      const typeIdx = headers.indexOf('instrument_type');

      // Extract unique EQ (Equity) symbols
      const symbolSet = new Set();
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const type = cols[typeIdx]?.replace(/"/g, '').trim();
        if (type !== 'EQ') continue;

        const ts = cols[tsIdx]?.replace(/"/g, '').trim();
        if (ts) symbolSet.add(ts);
      }

      allSymbols = Array.from(symbolSet).sort();
      // 3. Cache the processed list
      await redisSet(SYMBOLS_CACHE_KEY, allSymbols, CACHE_TTL);
    }

    // 4. Perform search (prefix match first, then includes)
    const exactMatches = allSymbols.filter(s => s.startsWith(query));
    const partialMatches = allSymbols.filter(s => !s.startsWith(query) && s.includes(query));
    
    const results = [...exactMatches, ...partialMatches].slice(0, 10);

    return NextResponse.json({ symbols: results });

  } catch (err) {
    console.error('[search-symbols]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
