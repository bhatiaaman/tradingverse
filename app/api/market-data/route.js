import { NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

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
  const hours = istTime.getUTCHours();
  return hours >= 7 && hours < 22;
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

async function fetchIndianIndicesFromKite(apiKey, accessToken) {
  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const instrumentKeys = Object.values(MARKET_INDICES).map(
      idx => `${idx.exchange}:${idx.symbol}`
    );
    const ohlcData = await kite.getOHLC(instrumentKeys);

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
      giftNifty: processIndex('GIFTNIFTY'),
    };
  } catch (error) {
    console.error('Kite indices fetch error:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FIXED: Returns both prices array AND correct previousClose
// ═══════════════════════════════════════════════════════════════════════
async function fetchNiftyHistoricalFromKite(apiKey, accessToken) {
  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 20);
    const formatDate = (d) => d.toISOString().split('T')[0];

    const historicalData = await kite.getHistoricalData(
      MARKET_INDICES.NIFTY.token, 
      'day', 
      formatDate(fromDate), 
      formatDate(toDate)
    );

    if (historicalData && historicalData.length >= 2) {
      // During market hours Kite includes today's PARTIAL candle as the last element.
      // Its close = last traded price ≈ current price, NOT yesterday's close.
      // Filter it out so previousClose is always the last COMPLETE trading day's close.
      const todayStr = new Date().toISOString().slice(0, 10);
      const completedCandles = historicalData.filter(
        c => new Date(c.date).toISOString().slice(0, 10) < todayStr
      );
      if (completedCandles.length < 2) return null;

      const closePrices    = completedCandles.map(c => c.close);
      const yesterdayClose = closePrices[closePrices.length - 1];

      // Weekly H/L: max high / min low across last 5 COMPLETE trading days
      const last5      = completedCandles.slice(-5);
      const weeklyHigh = Math.max(...last5.map(c => c.high));
      const weeklyLow  = Math.min(...last5.map(c => c.low));

      return {
        prices:        closePrices,    // For EMA9 (today's price appended later)
        previousClose: yesterdayClose, // Correct previous close
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
async function fetchGIFTNifty() {
  for (const ticker of ['GIFTNIFTY.NS', 'NIFTY.NS']) {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      );
      if (response.ok) {
        const data = await response.json();
        const result    = data.chart.result?.[0];
        const price     = result?.meta?.regularMarketPrice;
        const closes    = result?.indicators?.quote?.[0]?.close?.filter(p => p !== null);
        // closes[] contains complete trading-day closes (most recent last).
        // During market hours today's candle is incomplete so last complete close = yesterday.
        const prevClose = closes?.length >= 1 ? closes[closes.length - 1] : null;
        if (price) return { price, prevClose };
      }
    } catch { continue; }
  }
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

async function fetchMCXInstruments() {
  const now = Date.now();
  if (mcxInstrumentsCache && (now - mcxInstrumentsCacheTime) < MCX_CACHE_TTL) {
    return mcxInstrumentsCache;
  }
  try {
    const response = await fetch('https://api.kite.trade/instruments', {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000),
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

async function fetchCommoditiesFromKite(apiKey, accessToken) {
  try {
    const instruments = await fetchMCXInstruments();
    const contracts = {};
    for (const [key, { base, name }] of Object.entries(MCX_COMMODITY_NAMES)) {
      const contract = getNearestContract(instruments, base);
      if (contract) contracts[key] = { ...contract, name };
    }
    if (Object.keys(contracts).length === 0) return null;

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const symbols = Object.values(contracts).map(c => `MCX:${c.symbol}`);
    const ohlcData = await kite.getOHLC(symbols);

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

async function fetchMarketBreadth(apiKey, accessToken) {
  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);
    const instrumentKeys = NIFTY_50_STOCKS.map(symbol => `NSE:${symbol}`);
    const ohlcData = await kite.getOHLC(instrumentKeys);
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

const CACHE_KEY = `${NS}:market-data`;
const CACHE_TTL = 300;
const FRESH_TTL = 60000;

export async function GET() {
  try {
    const cached = await redisGet(CACHE_KEY);

    if (cached && !isMarketHours()) {
      return Response.json({ ...cached, fromCache: true, offMarketHours: true });
    }
    if (cached?.updatedAt) {
      const age = Date.now() - new Date(cached.updatedAt).getTime();
      if (age < FRESH_TTL) {
        return Response.json({ ...cached, fromCache: true, cacheAge: age });
      }
    }

    // Get credentials once
    const { apiKey, accessToken } = await getKiteCredentials();
    const hasKite = !!(apiKey && accessToken);

    // ═══════════════════════════════════════════════════════════════════════
    // CRITICAL: Fetch historical data FIRST to get correct previous close
    // ═══════════════════════════════════════════════════════════════════════
    const historicalResult = hasKite ? await fetchNiftyHistoricalFromKite(apiKey, accessToken) : null;
    const correctPreviousClose = historicalResult?.previousClose;
    const historicalPrices     = historicalResult?.prices;
    const niftyWeeklyHigh      = historicalResult?.weeklyHigh ?? null;
    const niftyWeeklyLow       = historicalResult?.weeklyLow  ?? null;

    const [kiteIndices, globalIndices, kiteCommodities, yahooCommodities, giftNifty, breadthData] = await Promise.all([
      hasKite ? fetchIndianIndicesFromKite(apiKey, accessToken) : Promise.resolve(null),
      fetchGlobalIndices(),
      hasKite ? fetchCommoditiesFromKite(apiKey, accessToken) : Promise.resolve(null),
      fetchCommoditiesFromYahoo(),
      fetchGIFTNifty(),
      hasKite ? fetchMarketBreadth(apiKey, accessToken) : Promise.resolve(null),
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
    } else {
      // Yahoo fallback (only when Kite unavailable)
      const [yahooNifty, yahooSensex, yahooBankNifty, yahooVix] = await Promise.all([
        fetchNiftyFromYahoo(),
        fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EBSESN?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()).then(d => d.chart.result[0].meta.regularMarketPrice).catch(() => null),
        fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EBANKNIFTY?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()).then(d => d.chart.result[0].meta.regularMarketPrice).catch(() => null),
        fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX?interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).then(r => r.json()).then(d => d.chart.result[0].meta.regularMarketPrice).catch(() => null),
      ]);
      niftyData = yahooNifty;
      sensex    = yahooSensex;
      bankNifty = yahooBankNifty;
      vix       = yahooVix;
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
    // Priority for price: Kite (live) → Yahoo result → fallback estimate
    // Priority for prev close: Yahoo's own daily prev close (GIFT's own session)
    //   → Kite OHLC close → omit (don't use NSE prev close as it gives wrong sign)
    let giftNiftyPrice   = kiteIndices?.giftNifty?.price ?? giftNifty?.price ?? null;
    if (!giftNiftyPrice && niftyData) giftNiftyPrice = niftyData.price + 15;

    // GIFT's own previous session close from Yahoo 5d daily history — most reliable source.
    const giftPrevClose  = giftNifty?.prevClose ?? kiteIndices?.giftNifty?.prevClose ?? null;
    let giftNiftyChange        = (giftNiftyPrice && giftPrevClose) ? giftNiftyPrice - giftPrevClose : null;
    let giftNiftyChangePercent = (giftNiftyChange !== null && giftPrevClose) ? (giftNiftyChange / giftPrevClose) * 100 : null;

    const marketData = {
      indices: {
        nifty:               niftyData?.price           ? niftyData.price.toFixed(2)           : null,
        niftyPrevClose:      niftyData?.prevClose       ? niftyData.prevClose.toFixed(2)       : null,
        niftyChange:         niftyData?.change          ? niftyData.change.toFixed(2)          : null,
        niftyChangePercent:  niftyData?.changePercent   ? niftyData.changePercent.toFixed(2)   : null,
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