import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const CACHE_KEY   = `${NS}:weekly-watchlist`;

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value) {
  try {
    const res = await fetch(`${REDIS_URL}/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", key, JSON.stringify(value)]),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("Redis Set Failed:", txt);
    }
  } catch (err) {
    console.error("Redis Set Error:", err);
  }
}

export async function GET() {
  let data = await redisGet(CACHE_KEY);
  
  // Migrate legacy array to object structure
  if (Array.isArray(data)) {
    data = { aiResearch: data, expertsResearch: [], chartink: [] };
    await redisSet(CACHE_KEY, data);
  }

  return NextResponse.json({ 
    watchlist: data || {
      aiResearch: [],
      expertsResearch: [],
      chartink: []
    } 
  });
}

export async function POST(request) {
  try {
    const { tab, list } = await request.json();
    
    if (!['aiResearch', 'expertsResearch', 'chartink'].includes(tab)) {
      return NextResponse.json({ error: "Invalid tab specified." }, { status: 400 });
    }
    if (!Array.isArray(list)) {
      return NextResponse.json({ error: "Invalid data format. Expected an array." }, { status: 400 });
    }

    let currentData = await redisGet(CACHE_KEY);
    
    // Migrate legacy array before mutating
    if (Array.isArray(currentData)) {
      currentData = { aiResearch: currentData, expertsResearch: [], chartink: [] };
    }
    if (!currentData) {
      currentData = { aiResearch: [], expertsResearch: [], chartink: [] };
    }

    // ── Build Ref Price Map ──────────────────────────────────────────────────
    const missingRef = list.filter(s => !s.referencePrice && s.symbol);
    const refPrices = {};

    if (missingRef.length > 0) {
      try {
        const dp = await getDataProvider();
        if (dp.isConnected()) {
          // Force uppercase symbols for Kite request
          const instrumentKeys = [...new Set(missingRef.map(s => `NSE:${s.symbol.toUpperCase()}`))];
          const quotes = await dp.getOHLC(instrumentKeys);
          Object.keys(quotes).forEach(key => {
            const sym = key.split(':')[1].toUpperCase();
            refPrices[sym] = quotes[key].ohlc?.close || quotes[key].last_price;
          });
        }
      } catch (err) {
        console.error('Failed to fetch reference prices:', err);
      }
    }
    
    // Stamp dateAdded and referencePrice
    const stampedList = list.map(s => {
      // Normalize current symbol for comparison
      const upperSymbol = (s.symbol || '').toUpperCase();
      
      const existing = (currentData[tab] || []).find(ex => (ex.symbol || '').toUpperCase() === upperSymbol);
      let refPrice = s.referencePrice || existing?.referencePrice;
      
      // If still missing and we have a fresh quote, use it (lookup by upper key)
      if (!refPrice && refPrices[upperSymbol]) {
        refPrice = refPrices[upperSymbol];
      }

      return {
        ...s,
        symbol: upperSymbol, // Ensure symbol itself is normalized in the DB
        dateAdded: s.dateAdded ?? existing?.dateAdded ?? new Date().toISOString(),
        referencePrice: refPrice || null,
      };
    });

    // Update the specific tab entirely
    currentData[tab] = stampedList;
    
    await redisSet(CACHE_KEY, currentData);
    
    return NextResponse.json({ success: true, watchlist: currentData });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
