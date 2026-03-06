// app/api/pre-market/movers/route.js
// Fetches NSE Pre-Open session data (9:00-9:15 AM)

import { NextResponse } from 'next/server';
import { getKiteCredentials } from '@/app/lib/kite-credentials';
import { KiteConnect } from 'kiteconnect';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS = process.env.REDIS_NAMESPACE || 'default';

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

// Top liquid stocks for pre-market tracking
const LIQUID_STOCKS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'SBIN', 
  'BHARTIARTL', 'ITC', 'KOTAKBANK', 'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI',
  'HCLTECH', 'SUNPHARMA', 'TITAN', 'BAJFINANCE', 'WIPRO', 'ULTRACEMCO',
  'NESTLEIND', 'NTPC', 'POWERGRID', 'M&M', 'TATAMOTORS', 'TATASTEEL',
  'ADANIENT', 'ADANIPORTS', 'TECHM', 'INDUSINDBK', 'JSWSTEEL', 'HINDALCO',
  'ONGC', 'BPCL', 'GRASIM', 'DIVISLAB', 'DRREDDY', 'BRITANNIA', 'CIPLA',
  'EICHERMOT', 'COALINDIA', 'APOLLOHOSP', 'SBILIFE', 'TATACONSUM'
];

function isPreMarketTime() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  
  // Pre-market: 9:00 AM to 9:15 AM IST
  return (hours === 9 && minutes >= 0 && minutes < 15) ||
         (hours === 3 && minutes >= 30 && minutes < 45); // UTC equivalent
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const sortBy = searchParams.get('sortBy') || 'percent'; // percent, volume, value
    
    const CACHE_KEY = `${NS}:pre-market-movers`;
    
    // Check cache (1 minute TTL during pre-market)
    const cached = await redisGet(CACHE_KEY);
    if (cached) {
      const age = Date.now() - new Date(cached.timestamp).getTime();
      if (age < 60000) { // 1 minute
        return NextResponse.json({ ...cached, fromCache: true, cacheAge: age });
      }
    }

    const { apiKey, accessToken } = await getKiteCredentials();
    
    if (!apiKey || !accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Kite credentials not available',
        fallback: 'Please login to Kite to see pre-market movers'
      }, { status: 401 });
    }

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    // Fetch OHLC for all liquid stocks
    const instrumentKeys = LIQUID_STOCKS.map(symbol => `NSE:${symbol}`);
    const ohlcData = await kite.getOHLC(instrumentKeys);

    // Fetch quotes for additional data (volume, buy/sell pressure)
    const quotesData = await kite.getQuote(instrumentKeys);

    const movers = [];

    for (const symbol of LIQUID_STOCKS) {
      const key = `NSE:${symbol}`;
      const ohlc = ohlcData[key];
      const quote = quotesData[key];
      
      if (!ohlc || !quote) continue;

      const lastPrice = ohlc.last_price;
      const prevClose = ohlc.ohlc?.close || lastPrice;
      const change = lastPrice - prevClose;
      const changePercent = (change / prevClose) * 100;
      
      // Volume data
      const volume = quote.volume || 0;
      const avgVolume = quote.average_price ? volume : null;
      
      // Depth data for buy/sell pressure
      const depth = quote.depth || {};
      const buyQty = depth.buy?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      const sellQty = depth.sell?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      const buySellRatio = sellQty > 0 ? buyQty / sellQty : buyQty > 0 ? 999 : 1;
      
      // Try to find news/reason for move
      const reason = getReasonForMove(symbol, changePercent, volume, avgVolume);

      movers.push({
        symbol,
        lastPrice: parseFloat(lastPrice.toFixed(2)),
        prevClose: parseFloat(prevClose.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
        volume,
        volumeRatio: avgVolume ? parseFloat((volume / avgVolume).toFixed(2)) : null,
        buyQty,
        sellQty,
        buySellRatio: parseFloat(buySellRatio.toFixed(2)),
        pressure: buySellRatio > 1.2 ? 'BUYING' : buySellRatio < 0.8 ? 'SELLING' : 'NEUTRAL',
        reason,
        timestamp: new Date().toISOString(),
      });
    }

    // Sort based on criteria
    if (sortBy === 'percent') {
      movers.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    } else if (sortBy === 'volume') {
      movers.sort((a, b) => b.volume - a.volume);
    }

    // Split into gainers and losers
    const gainers = movers
      .filter(m => m.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, limit);
    
    const losers = movers
      .filter(m => m.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, limit);

    const result = {
      success: true,
      isPreMarketTime: isPreMarketTime(),
      gainers,
      losers,
      summary: {
        totalGainers: movers.filter(m => m.changePercent > 0).length,
        totalLosers: movers.filter(m => m.changePercent < 0).length,
        totalUnchanged: movers.filter(m => m.changePercent === 0).length,
        avgChangePercent: parseFloat((movers.reduce((sum, m) => sum + m.changePercent, 0) / movers.length).toFixed(2)),
      },
      timestamp: new Date().toISOString(),
    };

    // Cache for 1 minute
    await redisSet(CACHE_KEY, result, 60);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Pre-market movers error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      fallback: 'Unable to fetch pre-market data'
    }, { status: 500 });
  }
}

function getReasonForMove(symbol, changePercent, volume, avgVolume) {
  // Placeholder - you can integrate with news API or maintain a manual list
  const absChange = Math.abs(changePercent);
  
  if (absChange > 5) {
    return 'Unusual move - check news';
  } else if (absChange > 3) {
    return 'Strong movement';
  } else if (volume && avgVolume && (volume / avgVolume) > 2) {
    return 'High volume activity';
  } else if (absChange > 1) {
    return 'Above average move';
  }
  
  return null;
}