import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

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

function isMarketHours() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const day = istTime.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const hours = istTime.getUTCHours();
  return hours >= 9 && hours < 16; // 9:00–16:00 IST covers market (9:15–15:30)
}

const MARKET_INDICES = {
  NIFTY:     { symbol: 'NIFTY 50',          exchange: 'NSE', token: 256265 },
  BANKNIFTY: { symbol: 'NIFTY BANK',        exchange: 'NSE', token: 260105 },
  SENSEX:    { symbol: 'SENSEX',            exchange: 'BSE', token: 265 },
  VIX:       { symbol: 'INDIA VIX',         exchange: 'NSE', token: 264969 },
  FINNIFTY:  { symbol: 'NIFTY FIN SERVICE', exchange: 'NSE', token: 257801 },
  MIDCAP:    { symbol: 'NIFTY MIDCAP 100',  exchange: 'NSE', token: 256777 },
  GIFTNIFTY: { symbol: 'GIFT NIFTY',        exchange: 'NSEIX', token: 291849 },
};

async function fetchIndianIndicesFromKite(dp) {
  try {
    const instrumentKeys = Object.values(MARKET_INDICES).map(
      idx => `${idx.exchange}:${idx.symbol}`
    );
    const ohlcData = await dp.getOHLC(instrumentKeys);

    const processIndex = (key) => {
      const idx = MARKET_INDICES[key];
      const data = ohlcData[`${idx.exchange}:${idx.symbol}`];
      if (!data) return null;
      const lastPrice = data.last_price;
      let prevClose = data.ohlc?.close || null;
      const change = (prevClose !== null) ? lastPrice - prevClose : null;
      const changePercent = (prevClose && prevClose !== 0) ? (change / prevClose) * 100 : null;
      return { price: lastPrice, prevClose, change, changePercent, open: data.ohlc?.open, high: data.ohlc?.high, low: data.ohlc?.low };
    };

    return {
      nifty:     processIndex('NIFTY'),
      bankNifty: processIndex('BANKNIFTY'),
      sensex:    processIndex('SENSEX'),
      vix:       processIndex('VIX'),
      finNifty:  processIndex('FINNIFTY'),
      midcap:    processIndex('MIDCAP'),
      // GIFTNIFTY excluded — Kite's NSEIX feed is unreliable; Yahoo used instead
    };
  } catch (error) {
    console.error('Kite indices fetch error:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FIXED: Returns both prices array AND correct previousClose
// ═══════════════════════════════════════════════════════════════════════
async function fetchNiftyHistoricalFromKite(dp) {
  try {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 20);
    const formatDate = (d) => d.toISOString().split('T')[0];

    const historicalData = await dp.getHistoricalData(
      MARKET_INDICES.NIFTY.token,
      'day',
      formatDate(fromDate),
      formatDate(toDate)
    );

    if (historicalData && historicalData.length >= 2) {
      // During market hours Kite includes today's PARTIAL candle as the last element.
      // Its close = last traded price ≈ current price, NOT yesterday's close.
      // Filter it out so previousClose is always the last COMPLETE trading day's close.
      //
      // IMPORTANT: Kite returns dates in IST (e.g. "2026-03-13T00:00:00+0530").
      // Comparing against UTC today would make today's IST candle appear as yesterday
      // in UTC (IST is UTC+5:30, so midnight IST = 6:30 PM previous UTC day),
      // causing it to pass the filter and become a false "previous close".
      // Fix: compare both candle dates and today's date in IST.
      const istOffset = 5.5 * 60 * 60 * 1000;
      const todayIST = new Date(Date.now() + istOffset).toISOString().slice(0, 10);
      const completedCandles = historicalData.filter(c => {
        const candleDateIST = new Date(new Date(c.date).getTime() + istOffset).toISOString().slice(0, 10);
        return candleDateIST < todayIST;
      });
      if (completedCandles.length < 2) return null;

      const closePrices = completedCandles.map(c => c.close);
      // During market hours: previousClose = last completed day's close (yesterday)
      //   niftyData.price = live ≠ yesterdayClose → correct change%
      // Outside market hours: niftyData.price = last traded = closePrices[-1] (today is closed)
      //   If we use closePrices[-1] as previousClose, change = 0 — wrong.
      //   Use closePrices[-2] (day before last) so we show the last trading day's actual move.
      const yesterdayClose = isMarketHours()
        ? closePrices[closePrices.length - 1]
        : closePrices[closePrices.length - 2];

      // Weekly H/L: max high / min low across last 5 COMPLETE trading days
      const last5      = completedCandles.slice(-5);
      const weeklyHigh = Math.max(...last5.map(c => c.high));
      const weeklyLow  = Math.min(...last5.map(c => c.low));

      return {
        prices:           closePrices,                          // For EMA9 (today's price appended later)
        previousClose:    yesterdayClose,                       // For Nifty change % display
        lastSessionClose: closePrices[closePrices.length - 1],  // Always last trading day's close — for gap calc
        weeklyHigh,
        weeklyLow,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Kite historical data error:', error.message);
    return null;
  }
}

function calculateEMA9(prices) {
  if (!prices || prices.length < 9) return null;
  const k = 2 / (9 + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * k) + (ema * (1 - k));
  }
  return ema;
}

// Yahoo Finance fallback (only when Kite is unavailable)
async function fetchNiftyFromYahoo() {
  try {
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=1mo',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) throw new Error('Yahoo Nifty fetch failed');
    const data = await response.json();
    const result = data.chart.result[0];
    const meta = result.meta;
    const closePrices = result.indicators.quote[0].close.filter(p => p !== null);
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose || closePrices[closePrices.length - 2];
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    return { price: currentPrice, previousClose, change, changePercent, historicalPrices: closePrices.slice(-20) };
  } catch (error) {
    console.error('Yahoo Nifty fetch error:', error);
    return null;
  }
}

// Fetch GIFT Nifty current price + its own previous session close (5d daily history).
// Using GIFT's own prev close (not NSE NIFTY's) gives the correct change% that
// matches what SGX/NSE IFSC shows and correctly reflects the expected NIFTY gap.
const GIFT_CACHE_KEY = `${NS}:gift-nifty-v2`;
const GIFT_CACHE_TTL = 10 * 60; // 10 min — stale data is better than nothing

async function fetchGIFTNifty() {
  // Try Yahoo Finance: multiple tickers × both query domains to beat rate-limits
  const tickers = ['GIFTNIFTY.NS', 'NIFTYIFSC.NS', 'NIFTY.NS'];
  const domains  = ['query1', 'query2'];

  for (const domain of domains) {
    for (const ticker of tickers) {
      try {
        const res = await fetch(
          `https://${domain}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(6000),
          }
        );
        if (!res.ok) continue;
        const data  = await res.json();
        const meta  = data.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice;
        // chartPreviousClose = Yahoo's last completed session — correct for pre-market
        const prevClose = meta?.chartPreviousClose ?? meta?.previousClose ?? null;
        if (price && price > 10000) {           // sanity: GIFT Nifty is always >10k
          const result = { price, prevClose, ticker };
          await redisSet(GIFT_CACHE_KEY, result, GIFT_CACHE_TTL);
          return result;
        }
      } catch { continue; }
    }
  }

  // All live fetches failed — serve stale Redis value so the UI shows something
  const stale = await redisGet(GIFT_CACHE_KEY);
  if (stale?.price) return { ...stale, stale: true };

  return null;
}

async function fetchGlobalIndices() {
  try {
    const [dow, nasdaq, dax] = await Promise.all([
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EDJI?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGDAXI?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()),
    ]);
    function extract(meta) {
      const price = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose || meta.previousClose;
      const change = price - prevClose;
      const changePercent = (change / prevClose) * 100;
      return { price, prevClose, change, changePercent };
    }
    return {
      dow: extract(dow.chart.result[0].meta),
      nasdaq: extract(nasdaq.chart.result[0].meta),
      dax: extract(dax.chart.result[0].meta),
    };
  } catch (error) {
    console.error('Global indices fetch error:', error);
    return null;
  }
}

const MCX_COMMODITY_NAMES = {
  CRUDEOIL:   { base: 'CRUDEOIL',   name: 'Crude Oil' },
  GOLD:       { base: 'GOLD',       name: 'Gold' },
  SILVER:     { base: 'SILVER',     name: 'Silver' },
  NATURALGAS: { base: 'NATURALGAS', name: 'Natural Gas' },
};

let mcxInstrumentsCache = null;
let mcxInstrumentsCacheTime = 0;
const MCX_CACHE_TTL = 24 * 60 * 60 * 1000;

async function fetchMCXInstruments(dp) {
  const now = Date.now();
  if (mcxInstrumentsCache && (now - mcxInstrumentsCacheTime) < MCX_CACHE_TTL) {
    return mcxInstrumentsCache;
  }
  try {
    const { apiKey, accessToken } = await dp.getAuth();
    const response = await fetch('https://api.kite.trade/instruments', {
      headers: {
        'Authorization': `token ${apiKey}:${accessToken}`,
        'X-Kite-Version': '3',
      },
      signal: AbortSignal.timeout(8000),
    });
    const csvText = await response.text();
    const lines = csvText.split('\n');
    const mcxFutures = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes(',MCX') || !line.includes('FUT')) continue;
      const parts = line.split(',');
      if (parts.length < 6) continue;
      const [token, , symbol, , , expiry] = parts;
      if (expiry) mcxFutures.push({ token: parseInt(token), symbol, expiry: new Date(expiry) });
    }
    mcxInstrumentsCache = mcxFutures;
    mcxInstrumentsCacheTime = now;
    return mcxFutures;
  } catch (error) {
    console.error('Failed to fetch MCX instruments:', error.message);
    return mcxInstrumentsCache || [];
  }
}

function getNearestContract(instruments, baseName) {
  const now = new Date();
  const contracts = instruments.filter(inst => {
    const symbolUpper = inst.symbol.toUpperCase();
    const regex = new RegExp(`^${baseName}\\d{2}[A-Z]{3}FUT$`);
    return regex.test(symbolUpper) && inst.expiry > now;
  });
  if (contracts.length === 0) return null;
  contracts.sort((a, b) => a.expiry - b.expiry);
  return { symbol: contracts[0].symbol, token: contracts[0].token, expiry: contracts[0].expiry };
}

async function fetchCommoditiesFromKite(dp) {
  try {
    const instruments = await fetchMCXInstruments(dp);
    const contracts = {};
    for (const [key, { base, name }] of Object.entries(MCX_COMMODITY_NAMES)) {
      const contract = getNearestContract(instruments, base);
      if (contract) contracts[key] = { ...contract, name };
    }
    if (Object.keys(contracts).length === 0) return null;

    const symbols = Object.values(contracts).map(c => `MCX:${c.symbol}`);
    const ohlcData = await dp.getOHLC(symbols);

    const processComm = (key) => {
      const contract = contracts[key];
      if (!contract) return null;
      const data = ohlcData[`MCX:${contract.symbol}`];
      if (!data) return null;
      const lastPrice = data.last_price;
      const prevClose = data.ohlc?.close || lastPrice;
      const change = lastPrice - prevClose;
      const changePercent = prevClose ? ((change / prevClose) * 100) : 0;
      return { price: lastPrice, change, changePercent, name: contract.name, contract: contract.symbol };
    };

    return {
      crude:  processComm('CRUDEOIL'),
      gold:   processComm('GOLD'),
      silver: processComm('SILVER'),
      natGas: processComm('NATURALGAS'),
    };
  } catch (error) {
    console.error('Kite commodities fetch error:', error.message);
    return null;
  }
}

async function fetchCommoditiesFromYahoo() {
  try {
    const [crude, gold] = await Promise.all([
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()),
    ]);
    return {
      crude: { price: crude.chart.result[0].meta.regularMarketPrice, change: null, changePercent: null },
      gold:  { price: gold.chart.result[0].meta.regularMarketPrice,  change: null, changePercent: null },
    };
  } catch (error) {
    console.error('Yahoo commodities fetch error:', error);
    return null;
  }
}

const NIFTY_50_STOCKS = [
  'RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','HINDUNILVR','SBIN','BHARTIARTL','ITC','KOTAKBANK',
  'LT','AXISBANK','ASIANPAINT','MARUTI','HCLTECH','SUNPHARMA','TITAN','BAJFINANCE','WIPRO','ULTRACEMCO',
  'NESTLEIND','NTPC','POWERGRID','M&M','TATAMOTORS','TATASTEEL','ADANIENT','ADANIPORTS','TECHM','INDUSINDBK',
  'JSWSTEEL','HINDALCO','ONGC','BPCL','GRASIM','DIVISLAB','DRREDDY','BRITANNIA','CIPLA','EICHERMOT',
  'COALINDIA','APOLLOHOSP','SBILIFE','TATACONSUM','BAJAJFINSV','HEROMOTOCO','LTIM','SHRIRAMFIN','TRENT','BAJAJ-AUTO',
];

async function fetchMarketBreadth(dp) {
  try {
    const instrumentKeys = NIFTY_50_STOCKS.map(symbol => `NSE:${symbol}`);
    const ohlcData = await dp.getOHLC(instrumentKeys);
    let advances = 0, declines = 0, unchanged = 0;
    for (const symbol of NIFTY_50_STOCKS) {
      const data = ohlcData[`NSE:${symbol}`];
      if (!data) continue;
      const lastPrice = data.last_price;
      const prevClose = data.ohlc?.close || lastPrice;
      if (lastPrice > prevClose) advances++;
      else if (lastPrice < prevClose) declines++;
      else unchanged++;
    }
    return { advances, declines, unchanged, display: `${advances}↑ ${declines}↓` };
  } catch (error) {
    console.error('Market breadth error:', error.message);
    return null;
  }
}

const CACHE_KEY       = `${NS}:market-data`;
const CACHE_TTL       = 300;
const FRESH_TTL       = 60000;
const YAHOO_CACHE_KEY = `${NS}:market-data-yahoo-fallback`;
const YAHOO_CACHE_TTL = 300; // 5 min — Yahoo data is delayed anyway

export async function GET() {
  try {
    const cached = await redisGet(CACHE_KEY);

    if (cached?.updatedAt) {
      const age = Date.now() - new Date(cached.updatedAt).getTime();
      // Pre-market (8–9 AM weekdays): 3 min — GIFT Nifty moves; stale data gives wrong gap
      // Market hours: 1 min — live data, refresh fast
      // After close / weekends: 15 min — indices don't move
      const istNow2 = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const istHour = istNow2.getUTCHours();
      const istDay2 = istNow2.getUTCDay();
      const isWeekday = istDay2 >= 1 && istDay2 <= 5;
      const isPreMarketWindow = isWeekday && istHour >= 7 && istHour < 9;
      const maxAge = isMarketHours() ? FRESH_TTL : isPreMarketWindow ? 3 * 60 * 1000 : 15 * 60 * 1000;
      if (age < maxAge) {
        return Response.json({ ...cached, fromCache: true, offMarketHours: !isMarketHours(), cacheAge: age });
      }
    }

    // Get data provider once
    const dp = await getDataProvider();
    const hasKite = dp.isConnected();

    // ═══════════════════════════════════════════════════════════════════════
    // CRITICAL: Fetch historical data FIRST to get correct previous close
    // ═══════════════════════════════════════════════════════════════════════
    const historicalResult    = hasKite ? await fetchNiftyHistoricalFromKite(dp) : null;
    const correctPreviousClose = historicalResult?.previousClose;
    const niftyLastSessionClose = historicalResult?.lastSessionClose ?? null; // Last trading day close (for gap calc)
    const historicalPrices     = historicalResult?.prices;
    const niftyWeeklyHigh      = historicalResult?.weeklyHigh ?? null;
    const niftyWeeklyLow       = historicalResult?.weeklyLow  ?? null;

    const [kiteIndices, globalIndices, kiteCommodities, yahooCommodities, giftNifty, breadthData] = await Promise.all([
      hasKite ? fetchIndianIndicesFromKite(dp) : Promise.resolve(null),
      fetchGlobalIndices(),
      hasKite ? fetchCommoditiesFromKite(dp) : Promise.resolve(null),
      fetchCommoditiesFromYahoo(),
      fetchGIFTNifty(),
      hasKite ? fetchMarketBreadth(dp) : Promise.resolve(null),
    ]);

    let niftyData, sensex, bankNifty, vix;

    if (kiteIndices) {
      niftyData = kiteIndices.nifty;
      bankNifty = kiteIndices.bankNifty;
      sensex    = kiteIndices.sensex;
      vix       = kiteIndices.vix;

      // ═══════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Override stale prevClose with correct historical data
      // ═══════════════════════════════════════════════════════════════════════
      if (correctPreviousClose && niftyData) {
        niftyData.prevClose = correctPreviousClose;
        niftyData.change = niftyData.price - correctPreviousClose;
        niftyData.changePercent = ((niftyData.price - correctPreviousClose) / correctPreviousClose) * 100;
      }

      // Bank Nifty Yahoo fallback — Kite sometimes returns null for NIFTY BANK on weekends
      if (!bankNifty) {
        try {
          const bnRes = await fetch(
            'https://query1.finance.yahoo.com/v8/finance/chart/%5EBANKNIFTY?interval=1d&range=5d',
            { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) }
          );
          if (bnRes.ok) {
            const bnJson = await bnRes.json();
            const bnMeta = bnJson.chart?.result?.[0]?.meta;
            if (bnMeta?.regularMarketPrice) {
              const bnPrice = bnMeta.regularMarketPrice;
              const bnPrev  = bnMeta.chartPreviousClose || bnMeta.previousClose || null;
              bankNifty = {
                price:         bnPrice,
                prevClose:     bnPrev,
                change:        bnPrev ? bnPrice - bnPrev : null,
                changePercent: bnPrev ? ((bnPrice - bnPrev) / bnPrev) * 100 : null,
              };
            }
          }
        } catch { /* leave bankNifty null */ }
      }
    } else {
      // Yahoo fallback (only when Kite unavailable) — cached 5 min to avoid repeated 8s fetches
      const yahooCached = await redisGet(YAHOO_CACHE_KEY);
      if (yahooCached) {
        niftyData = yahooCached.niftyData;
        sensex    = yahooCached.sensex;
        bankNifty = yahooCached.bankNifty;
        vix       = yahooCached.vix;
      } else {
        const [yahooNifty, yahooSensex, yahooBankNifty, yahooVix] = await Promise.all([
          fetchNiftyFromYahoo(),
          fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EBSESN?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()).then(d => d.chart.result[0].meta.regularMarketPrice).catch(() => null),
          fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EBANKNIFTY?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()).then(d => d.chart.result[0].meta.regularMarketPrice).catch(() => null),
          fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()).then(d => d.chart.result[0].meta.regularMarketPrice).catch(() => null),
        ]);
        // Normalize Yahoo key (previousClose → prevClose) so rest of pipeline works identically
        niftyData = yahooNifty ? { ...yahooNifty, prevClose: yahooNifty.previousClose } : null;
        sensex    = yahooSensex;
        bankNifty = yahooBankNifty;
        vix       = yahooVix;
        redisSet(YAHOO_CACHE_KEY, { niftyData, sensex, bankNifty, vix }, YAHOO_CACHE_TTL);
      }
    }

    // EMA9 calculation
    let bias = 'Neutral';
    let niftyEMA9 = null;
    
    if (historicalPrices && historicalPrices.length >= 9) {
      const pricesWithCurrent = [...historicalPrices];
      if (niftyData?.price) pricesWithCurrent.push(niftyData.price);
      niftyEMA9 = calculateEMA9(pricesWithCurrent);
      if (niftyEMA9 && niftyData?.price) {
        bias = niftyData.price > niftyEMA9 ? 'Bullish' : 'Bearish';
      }
    } else if (niftyData?.changePercent) {
      if (niftyData.changePercent > 0.5) bias = 'Bullish';
      else if (niftyData.changePercent < -0.5) bias = 'Bearish';
    }

    // GIFT Nifty handling
    // Price: Yahoo only — Kite's NSEIX feed returns stale/wrong values for GIFT NIFTY.
    // Yahoo GIFTNIFTY.NS tracks the continuous front-month contract reliably.
    let giftNiftyPrice = giftNifty?.price ?? null;

    // Prev close for change%: use NSE Nifty's last session close — this is what SGX/NSE IFSC
    // uses and what traders care about (implied gap on open). GIFT's own session close
    // (e.g. yesterday evening NSEIX close ~23,208) gives a misleading +0.4% when the real
    // gap vs NSE is -2%.
    const giftPrevClose = niftyLastSessionClose ?? giftNifty?.prevClose ?? kiteIndices?.giftNifty?.prevClose ?? null;
    let giftNiftyChange        = (giftNiftyPrice && giftPrevClose) ? giftNiftyPrice - giftPrevClose : null;
    let giftNiftyChangePercent = (giftNiftyChange !== null && giftPrevClose) ? (giftNiftyChange / giftPrevClose) * 100 : null;

    const marketData = {
      indices: {
        nifty:               niftyData?.price           ? niftyData.price.toFixed(2)           : null,
        niftyPrevClose:      niftyData?.prevClose       ? niftyData.prevClose.toFixed(2)       : null,
        niftyChange:         niftyData?.change          != null ? niftyData.change.toFixed(2)          : null,
        niftyChangePercent:  niftyData?.changePercent   != null ? niftyData.changePercent.toFixed(2)   : null,
        niftyHigh:           niftyData?.high            ? niftyData.high.toFixed(2)            : null,
        niftyLow:            niftyData?.low             ? niftyData.low.toFixed(2)             : null,
        sensex:              sensex?.price              ? sensex.price.toFixed(2)              : (typeof sensex === 'number' ? sensex.toFixed(2) : null),
        sensexChange:        sensex?.change             ? sensex.change.toFixed(2)             : null,
        sensexChangePercent: sensex?.changePercent      ? sensex.changePercent.toFixed(2)      : null,
        bankNifty:           bankNifty?.price           ? bankNifty.price.toFixed(2)           : (typeof bankNifty === 'number' ? bankNifty.toFixed(2) : null),
        bankNiftyChange:     bankNifty?.change          ? bankNifty.change.toFixed(2)          : null,
        bankNiftyChangePercent: bankNifty?.changePercent ? bankNifty.changePercent.toFixed(2) : null,
        bankNiftyPrevClose:  bankNifty?.prevClose       ? bankNifty.prevClose.toFixed(2)       : null,
        giftNifty:           giftNiftyPrice             ? (typeof giftNiftyPrice === 'number' ? giftNiftyPrice.toFixed(2) : giftNiftyPrice) : null,
        giftNiftyChange:     (giftNiftyChange !== undefined && giftNiftyChange !== null) ? giftNiftyChange.toFixed(2) : null,
        giftNiftyChangePercent: (giftNiftyChangePercent !== undefined && giftNiftyChangePercent !== null) ? giftNiftyChangePercent.toFixed(2) : null,
        niftyLastSessionClose: niftyLastSessionClose      ? niftyLastSessionClose.toFixed(2)     : null,
        niftyWeeklyHigh:     niftyWeeklyHigh            ? niftyWeeklyHigh.toFixed(2)           : null,
        niftyWeeklyLow:      niftyWeeklyLow             ? niftyWeeklyLow.toFixed(2)            : null,
        vix:                 vix?.price                 ? vix.price.toFixed(2)                 : (typeof vix === 'number' ? vix.toFixed(2) : null),
        vixChange:           vix?.change                ? vix.change.toFixed(2)                : null,
        niftyEMA9:           niftyEMA9                  ? niftyEMA9.toFixed(2)                 : null,
      },
      global: {
        dow:    globalIndices?.dow?.price           ? globalIndices.dow.price.toFixed(2)           : null,
        dowChange: globalIndices?.dow?.change       ? globalIndices.dow.change.toFixed(2)          : null,
        dowChangePercent: globalIndices?.dow?.changePercent ? globalIndices.dow.changePercent.toFixed(2) : null,
        nasdaq: globalIndices?.nasdaq?.price        ? globalIndices.nasdaq.price.toFixed(2)        : null,
        nasdaqChange: globalIndices?.nasdaq?.change ? globalIndices.nasdaq.change.toFixed(2)       : null,
        nasdaqChangePercent: globalIndices?.nasdaq?.changePercent ? globalIndices.nasdaq.changePercent.toFixed(2) : null,
        dax:    globalIndices?.dax?.price           ? globalIndices.dax.price.toFixed(2)           : null,
        daxChange: globalIndices?.dax?.change       ? globalIndices.dax.change.toFixed(2)          : null,
        daxChangePercent: globalIndices?.dax?.changePercent ? globalIndices.dax.changePercent.toFixed(2) : null,
      },
      sentiment: {
        bias:       bias,
        advDecline: breadthData?.display || '---',
        advances:   breadthData?.advances || 0,
        declines:   breadthData?.declines || 0,
        pcr:        '---',
      },
      commodities: {
        crude:       kiteCommodities?.crude?.price    ? `₹${kiteCommodities.crude.price.toFixed(2)}`   : (yahooCommodities?.crude?.price  ? `$${yahooCommodities.crude.price.toFixed(2)}`  : '---'),
        crudeChange: kiteCommodities?.crude?.changePercent   ?? null,
        gold:        kiteCommodities?.gold?.price     ? `₹${kiteCommodities.gold.price.toFixed(2)}`    : (yahooCommodities?.gold?.price   ? `$${yahooCommodities.gold.price.toFixed(2)}`   : '---'),
        goldChange:  kiteCommodities?.gold?.changePercent    ?? null,
        silver:      kiteCommodities?.silver?.price   ? `₹${kiteCommodities.silver.price.toFixed(2)}`  : '---',
        silverChange:kiteCommodities?.silver?.changePercent  ?? null,
        natGas:      kiteCommodities?.natGas?.price   ? `₹${kiteCommodities.natGas.price.toFixed(2)}`  : '---',
        natGasChange:kiteCommodities?.natGas?.changePercent  ?? null,
      },
      source:    hasKite ? 'kite' : 'yahoo',
      updatedAt: new Date().toISOString(),
      fromCache: false,
    };

    await redisSet(CACHE_KEY, marketData, CACHE_TTL);

    return Response.json(marketData);

  } catch (error) {
    console.error('Market data API error:', error);
    const staleCache = await redisGet(CACHE_KEY);
    if (staleCache) return Response.json({ ...staleCache, fromCache: true, stale: true });
    return Response.json({
      indices: { nifty: null, sensex: null, bankNifty: null, giftNifty: null, vix: null, niftyEMA9: null, niftyChange: null, niftyChangePercent: null, niftyPrevClose: null },
      global: { dow: null, nasdaq: null, dax: null },
      sentiment: { bias: 'Neutral', advDecline: '---', pcr: '---' },
      commodities: { crude: '---', gold: '---', silver: '---', natGas: '---' },
      updatedAt: new Date().toISOString(),
      error: true,
    }, { status: 500 });
  }
}