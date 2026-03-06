import { NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS = process.env.REDIS_NAMESPACE || 'default';

// Simple Redis helpers (no SDK needed)
async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, exSeconds) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url = exSeconds
      ? `${REDIS_URL}/set/${key}/${encoded}?ex=${exSeconds}`
      : `${REDIS_URL}/set/${key}/${encoded}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch (e) { console.error('Redis set error:', e); }
}

function isMarketHours() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hours = istTime.getUTCHours();
  return hours >= 7 && hours < 22;
}

const SECTOR_INDICES = [
  { token: 260105, symbol: 'NIFTY BANK',        name: 'Bank Nifty',  exchange: 'NSE', tvSymbol: 'BANKNIFTY' },
  { token: 259849, symbol: 'NIFTY IT',           name: 'IT',          exchange: 'NSE', tvSymbol: 'CNXIT' },
  { token: 257801, symbol: 'NIFTY FIN SERVICE',  name: 'Financial',   exchange: 'NSE', tvSymbol: 'CNXFINANCE' },
  { token: 263433, symbol: 'NIFTY AUTO',         name: 'Auto',        exchange: 'NSE', tvSymbol: 'CNXAUTO' },
  { token: 262409, symbol: 'NIFTY PHARMA',       name: 'Pharma',      exchange: 'NSE', tvSymbol: 'CNXPHARMA' },
  { token: 263689, symbol: 'NIFTY METAL',        name: 'Metal',       exchange: 'NSE', tvSymbol: 'CNXMETAL' },
  { token: 261897, symbol: 'NIFTY FMCG',         name: 'FMCG',       exchange: 'NSE', tvSymbol: 'CNXFMCG' },
  { token: 261129, symbol: 'NIFTY REALTY',       name: 'Realty',      exchange: 'NSE', tvSymbol: 'CNXREALTY' },
  { token: 261641, symbol: 'NIFTY ENERGY',       name: 'Energy',      exchange: 'NSE', tvSymbol: 'CNXENERGY' },
  { token: 263945, symbol: 'NIFTY MEDIA',        name: 'Media',       exchange: 'NSE', tvSymbol: 'CNXMEDIA' },
  { token: 262921, symbol: 'NIFTY PSU BANK',     name: 'PSU Bank',    exchange: 'NSE', tvSymbol: 'CNXPSUBANK' },
  { token: 261385, symbol: 'NIFTY INFRA',        name: 'Infra',       exchange: 'NSE', tvSymbol: 'CNXINFRA' },
];

const CACHE_KEY = `${NS}:sector-performance`;
const CACHE_TTL = 300;          // 5 minutes — Redis TTL (seconds)
const FRESH_TTL = 300 * 1000;   // 5 minutes — serve cache within this window (ms)
// FRESH_TTL must equal CACHE_TTL×1000; previously 60 s → hit Kite 5× per cache cycle → rate limits

export async function GET() {
  try {
    const cached = await redisGet(CACHE_KEY);

    // Off-market hours — always return cache if available
    if (cached && !isMarketHours()) {
      return NextResponse.json({ ...cached, fromCache: true, offMarketHours: true });
    }

    // Return if cache is fresh (< 1 min old)
    if (cached?.timestamp) {
      const age = Date.now() - new Date(cached.timestamp).getTime();
      if (age < FRESH_TTL) {
        return NextResponse.json({ ...cached, fromCache: true });
      }
    }

    // Get credentials from Redis (not process.env directly)
    const { apiKey, accessToken } = await getKiteCredentials();

    if (!apiKey || !accessToken) {
      console.error('Kite credentials missing');
      if (cached) return NextResponse.json({ ...cached, fromCache: true, error: 'Kite not connected' });
      return NextResponse.json({ sectors: [], error: 'Kite API not configured' });
    }

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const instrumentKeys = SECTOR_INDICES.map(s => `${s.exchange}:${s.symbol}`);
    const ohlcData = await kite.getOHLC(instrumentKeys);

    const sectorData = SECTOR_INDICES.map(sector => {
      const key = `${sector.exchange}:${sector.symbol}`;
      const data = ohlcData[key];
      if (!data) return null;

      const prevClose    = data.ohlc?.close || 0;
      const lastPrice    = data.last_price || 0;
      const changePercent = prevClose > 0
        ? ((lastPrice - prevClose) / prevClose) * 100
        : 0;

      return {
        name:      sector.name,
        symbol:    sector.symbol,
        tvSymbol:  sector.tvSymbol,
        value:     parseFloat(changePercent.toFixed(2)),
        lastPrice,
        prevClose,
        change:    lastPrice - prevClose,
      };
    }).filter(Boolean);

    sectorData.sort((a, b) => b.value - a.value);

    const result = { sectors: sectorData, timestamp: new Date().toISOString() };

    await redisSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error fetching sector performance:', error.message);
    const cached = await redisGet(CACHE_KEY);
    if (cached) return NextResponse.json({ ...cached, fromCache: true, error: error.message });
    return NextResponse.json({ sectors: [], error: error.message });
  }
}