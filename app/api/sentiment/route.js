import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Kite instrument tokens
const NIFTY_TOKEN = 256265;

function isMarketHours() {
  const now = new Date();
  const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const h = istTime.getUTCHours();
  const m = istTime.getUTCMinutes();
  const total = h * 60 + m;
  return total >= 555 && total <= 930; // 9:15 to 15:30
}

// ─────────────────────────────────────────────
// KITE CANDLE FETCHER
// ─────────────────────────────────────────────
// Returns { candles, error } — error is null on success, string on failure
async function fetchKiteCandles(token, interval, days = 3) {
  try {
    const { apiKey, accessToken } = await getKiteCredentials();
    if (!apiKey || !accessToken) {
      console.log('[sentiment] Kite credentials missing - not logged in');
      return { candles: null, error: 'not_logged_in' };
    }
    console.log('[sentiment] Fetching Kite candles, token present:', !!accessToken);

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const fmt = (d) => {
      const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
      return ist.toISOString().slice(0, 19).replace('T', ' ');
    };

    const url = `https://api.kite.trade/instruments/historical/${token}/${interval}?from=${encodeURIComponent(fmt(fromDate))}&to=${encodeURIComponent(fmt(toDate))}`;

    const response = await fetch(url, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const msg = body?.message || body?.error || `HTTP ${response.status}`;
      console.error('[sentiment] Kite candles API error:', response.status, msg);
      return { candles: null, error: `kite_api_error: ${msg}` };
    }

    const data = await response.json();
    if (!data?.data?.candles?.length) {
      return { candles: null, error: 'no_candles' };
    }

    const candles = data.data.candles.map(([time, open, high, low, close, volume]) => ({
      time: new Date(time).getTime() / 1000,
      open, high, low, close, volume: volume || 0,
    }));

    console.log(`[sentiment] Kite candles fetched: ${candles.length} candles`);
    return { candles, error: null };
  } catch (err) {
    console.error('fetchKiteCandles error:', err.message);
    return { candles: null, error: err.message };
  }
}

// ─────────────────────────────────────────────
// INDICATOR CALCULATORS
// ─────────────────────────────────────────────
function calcEMA(candles, period) {
  if (!candles || candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const recent = candles.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i].close - recent[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function calcVWAP(candles) {
  if (!candles || candles.length === 0) return null;
  // Only today's candles for accurate VWAP
  const now = new Date();
  const istMidnight = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  istMidnight.setUTCHours(0, 0, 0, 0);
  const midnightTs = istMidnight.getTime() / 1000;

  const todayCandles = candles.filter(c => c.time >= midnightTs);
  if (todayCandles.length === 0) return null;

  let tpvSum = 0, volSum = 0;
  for (const c of todayCandles) {
    const tp = (c.high + c.low + c.close) / 3;
    tpvSum += tp * c.volume;
    volSum += c.volume;
  }
  return volSum > 0 ? tpvSum / volSum : null;
}

function calcADX(candles, period = 14) {
  if (!candles || candles.length < period * 2) return null;
  const recent = candles.slice(-period * 2);
  let plusDM = 0, minusDM = 0, tr = 0;
  for (let i = 1; i < recent.length; i++) {
    const highDiff = recent[i].high - recent[i - 1].high;
    const lowDiff  = recent[i - 1].low - recent[i].low;
    plusDM  += (highDiff > lowDiff && highDiff > 0) ? highDiff : 0;
    minusDM += (lowDiff > highDiff && lowDiff > 0)  ? lowDiff  : 0;
    tr += Math.max(
      recent[i].high - recent[i].low,
      Math.abs(recent[i].high - recent[i - 1].close),
      Math.abs(recent[i].low  - recent[i - 1].close)
    );
  }
  if (tr === 0) return null;
  const plusDI  = (plusDM  / tr) * 100;
  const minusDI = (minusDM / tr) * 100;
  const adx = Math.abs(plusDI - minusDI) / (plusDI + minusDI + 0.001) * 100;
  return { adx, plusDI, minusDI };
}

// ─────────────────────────────────────────────
// INTRADAY BIAS FROM KITE CANDLES
// ─────────────────────────────────────────────
async function calculateIntradayBias(pcr) {
  const { candles, error } = await fetchKiteCandles(NIFTY_TOKEN, '5minute', 7); // 7 days covers weekends/holidays

  if (!candles || candles.length < 30) {
    // Fallback: PCR only — show accurate reason, not always "login"
    let score = 50;
    const signals = [];
    if (pcr != null) {
      if (pcr > 1.2)       { score += 15; signals.push({ factor: 'PCR', signal: 'bullish', detail: pcr.toFixed(2) }); }
      else if (pcr < 0.75) { score -= 15; signals.push({ factor: 'PCR', signal: 'bearish', detail: pcr.toFixed(2) }); }
      else                 { signals.push({ factor: 'PCR', signal: 'neutral', detail: pcr.toFixed(2) }); }
    }
    // Only show login prompt if actually not logged in
    if (error === 'not_logged_in') {
      signals.push({ factor: 'Note', signal: 'neutral', detail: 'Login to Kite for full intraday' });
    } else if (error) {
      signals.push({ factor: 'Note', signal: 'neutral', detail: `Kite: ${error}` });
    }
    score = Math.max(0, Math.min(100, score));
    const bias = score >= 55 ? 'slightly_bullish' : score <= 45 ? 'slightly_bearish' : 'neutral';
    return { bias, score: Math.round(score), signals, source: 'pcr_only' };
  }

  const last = candles[candles.length - 1];
  const price = last.close;

  const ema9   = calcEMA(candles, 9);
  const ema21  = calcEMA(candles, 21);
  const rsi    = calcRSI(candles, 14);
  const vwap   = calcVWAP(candles);
  const adxObj = calcADX(candles, 14);

  let score = 50;
  const signals = [];

  // 1. EMA 9/21 cross — 25 pts
  if (ema9 !== null && ema21 !== null) {
    const pAbove9   = price > ema9;
    const ema9Above = ema9 > ema21;
    const spread    = ((ema9 - ema21) / ema21 * 100).toFixed(2);
    if (pAbove9 && ema9Above) {
      score += 15;
      signals.push({ factor: 'EMA 9/21 (5m)', signal: 'bullish', detail: `+${spread}% spread` });
    } else if (!pAbove9 && !ema9Above) {
      score -= 15;
      signals.push({ factor: 'EMA 9/21 (5m)', signal: 'bearish', detail: `${spread}% spread` });
    } else {
      signals.push({ factor: 'EMA 9/21 (5m)', signal: 'mixed', detail: 'Crossover zone' });
    }
  }

  // 2. VWAP — 20 pts
  if (vwap !== null) {
    const distPct = ((price - vwap) / vwap * 100);
    if (distPct > 0.3) {
      score += 13;
      signals.push({ factor: 'VWAP', signal: 'bullish', detail: `+${distPct.toFixed(2)}% above` });
    } else if (distPct < -0.3) {
      score -= 13;
      signals.push({ factor: 'VWAP', signal: 'bearish', detail: `${distPct.toFixed(2)}% below` });
    } else {
      signals.push({ factor: 'VWAP', signal: 'neutral', detail: `${distPct.toFixed(2)}% (near)` });
    }
  }

  // 3. RSI — 15 pts
  if (rsi !== null) {
    if (rsi > 65)      { score += 10; signals.push({ factor: 'RSI (5m)', signal: 'bullish',          detail: rsi.toFixed(1) }); }
    else if (rsi < 35) { score -= 10; signals.push({ factor: 'RSI (5m)', signal: 'bearish',          detail: rsi.toFixed(1) }); }
    else if (rsi > 55) { score += 5;  signals.push({ factor: 'RSI (5m)', signal: 'slightly bullish', detail: rsi.toFixed(1) }); }
    else if (rsi < 45) { score -= 5;  signals.push({ factor: 'RSI (5m)', signal: 'slightly bearish', detail: rsi.toFixed(1) }); }
    else               {              signals.push({ factor: 'RSI (5m)', signal: 'neutral',           detail: rsi.toFixed(1) }); }
  }

  // 4. ADX trend strength — 10 pts
  if (adxObj !== null) {
    if (adxObj.adx > 25) {
      if (adxObj.plusDI > adxObj.minusDI) {
        score += 7;
        signals.push({ factor: 'ADX (5m)', signal: 'bullish', detail: `Trending ${adxObj.adx.toFixed(0)}` });
      } else {
        score -= 7;
        signals.push({ factor: 'ADX (5m)', signal: 'bearish', detail: `Trending ${adxObj.adx.toFixed(0)}` });
      }
    } else {
      signals.push({ factor: 'ADX (5m)', signal: 'neutral', detail: `Ranging ${adxObj.adx.toFixed(0)}` });
    }
  }

  // 5. PCR — 25 pts
  if (pcr != null) {
    if (pcr > 1.2)        { score += 13; signals.push({ factor: 'PCR', signal: 'bullish',          detail: pcr.toFixed(2) }); }
    else if (pcr < 0.75)  { score -= 13; signals.push({ factor: 'PCR', signal: 'bearish',          detail: pcr.toFixed(2) }); }
    else if (pcr > 1.0)   { score += 5;  signals.push({ factor: 'PCR', signal: 'slightly bullish', detail: pcr.toFixed(2) }); }
    else if (pcr < 0.9)   { score -= 5;  signals.push({ factor: 'PCR', signal: 'slightly bearish', detail: pcr.toFixed(2) }); }
    else                  {              signals.push({ factor: 'PCR', signal: 'neutral',           detail: pcr.toFixed(2) }); }
  }

  score = Math.max(0, Math.min(100, score));

  let bias = 'neutral';
  if (score >= 65)      bias = 'bullish';
  else if (score >= 55) bias = 'slightly_bullish';
  else if (score <= 35) bias = 'bearish';
  else if (score <= 45) bias = 'slightly_bearish';

  return {
    bias,
    score: Math.round(score),
    signals,
    source: 'kite',
    lastPrice: price,
    indicators: {
      ema9:  ema9?.toFixed(2)  || null,
      ema21: ema21?.toFixed(2) || null,
      rsi:   rsi?.toFixed(1)   || null,
      vwap:  vwap?.toFixed(2)  || null,
      adx:   adxObj?.adx?.toFixed(1) || null,
    },
  };
}

// ─────────────────────────────────────────────
// TRADINGVIEW DAILY
// ─────────────────────────────────────────────
async function fetchTradingViewDaily(symbol = 'NSE:NIFTY') {
  try {
    const response = await fetch('https://scanner.tradingview.com/india/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: [symbol], query: { types: [] } },
        columns: [
          'Recommend.All', 'Recommend.MA', 'Recommend.Other',
          'RSI', 'RSI[1]', 'close', 'EMA20', 'SMA20', 'EMA50', 'EMA200', 'SMA200',
        ],
      }),
    });
    if (!response.ok) throw new Error('TV fetch failed');
    const data = await response.json();
    if (!data.data?.length) return null;

    const v = data.data[0].d;
    const overall = v[0];
    const label = (val) => {
      if (val >= 0.5) return 'strong_buy';
      if (val >= 0.1) return 'buy';
      if (val <= -0.5) return 'strong_sell';
      if (val <= -0.1) return 'sell';
      return 'neutral';
    };
    return {
      overall: label(overall),
      overallScore: Math.round((overall + 1) * 50),
      ma: label(v[1]),
      maScore: Math.round((v[1] + 1) * 50),
      oscillators: label(v[2]),
      oscillatorsScore: Math.round((v[2] + 1) * 50),
      rsi: v[3], rsiPrev: v[4], close: v[5],
      ema20: v[6], sma20: v[7], ema50: v[8], ema200: v[9], sma200: v[10],
    };
  } catch (error) {
    console.error('TradingView daily error:', error.message);
    return null;
  }
}

async function fetchMultiSymbolSentiment(symbols) {
  try {
    const response = await fetch('https://scanner.tradingview.com/india/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: symbols, query: { types: [] } },
        columns: ['Recommend.All', 'Recommend.MA', 'Recommend.Other', 'RSI', 'close', 'change', 'change_abs'],
      }),
    });
    if (!response.ok) throw new Error('Multi-symbol failed');
    const data = await response.json();
    const results = {};
    const label = (val) => {
      if (val >= 0.5) return 'strong_buy';
      if (val >= 0.1) return 'buy';
      if (val <= -0.5) return 'strong_sell';
      if (val <= -0.1) return 'sell';
      return 'neutral';
    };
    (data.data || []).forEach((item) => {
      const v = item.d;
      results[item.s] = {
        sentiment: label(v[0]),
        score: Math.round((v[0] + 1) * 50),
        rsi: v[3], price: v[4], change: v[5], changeAbs: v[6],
      };
    });
    return results;
  } catch (error) {
    console.error('Multi-symbol error:', error.message);
    return {};
  }
}

// ─────────────────────────────────────────────
// FII/DII
// ─────────────────────────────────────────────
async function fetchFIIDIIData() {
  try {
    const res = await fetch('https://www.nseindia.com/api/fiidiiTradeReact', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/reports-indices-equities',
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error('Primary failed');
    return await res.json();
  } catch {
    try {
      const alt = await fetch('https://www.nseindia.com/api/fiiAndDiiData', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.nseindia.com/',
        },
      });
      if (!alt.ok) return null;
      return await alt.json();
    } catch { return null; }
  }
}

function analyzeFIIDII(data) {
  if (!data) return null;
  try {
    let fiiData = null, diiData = null;
    if (Array.isArray(data)) {
      fiiData = data.find(d => d.category === 'FII/FPI' || d.category === 'FII');
      diiData = data.find(d => d.category === 'DII');
    } else if (data.fpiData) {
      fiiData = data.fpiData;
      diiData = data.diiData;
    }
    if (!fiiData && !diiData) return null;

    const fiiNet = parseFloat(fiiData?.netValue || fiiData?.net || 0);
    const diiNet = parseFloat(diiData?.netValue || diiData?.net || 0);
    const totalNet = fiiNet + diiNet;

    let sentiment = 'neutral', score = 50;
    if      (fiiNet > 500 && diiNet > 500)                    { sentiment = 'very_bullish';    score = 85; }
    else if (fiiNet > 500 || (fiiNet > 0 && diiNet > 500))    { sentiment = 'bullish';          score = 70; }
    else if (fiiNet < -500 && diiNet < -500)                  { sentiment = 'very_bearish';    score = 15; }
    else if (fiiNet < -500 || (fiiNet < 0 && diiNet < -500))  { sentiment = 'bearish';          score = 30; }
    else if (totalNet > 200)                                   { sentiment = 'slightly_bullish'; score = 60; }
    else if (totalNet < -200)                                  { sentiment = 'slightly_bearish'; score = 40; }

    return {
      fii: { buy: fiiData?.buyValue || 0, sell: fiiData?.sellValue || 0, net: fiiNet },
      dii: { buy: diiData?.buyValue || 0, sell: diiData?.sellValue || 0, net: diiNet },
      totalNet, sentiment, score,
      date: fiiData?.date || new Date().toISOString().split('T')[0],
    };
  } catch { return null; }
}

function calculateOverallMood(fiiDii, tradingView, optionsPCR) {
  let totalScore = 0;
  const factors = [];

  const fiiScore = fiiDii?.score ?? 50;
  totalScore += fiiScore * 0.4;
  factors.push({ name: 'FII/DII Flow', score: fiiScore, weight: 40, detail: (fiiDii?.sentiment ?? 'neutral').replace(/_/g, ' ') });

  const tvScore = tradingView?.overallScore ?? 50;
  totalScore += tvScore * 0.35;
  factors.push({ name: 'Technical (Daily)', score: tvScore, weight: 35, detail: (tradingView?.overall ?? 'neutral').replace(/_/g, ' ') });

  let pcrScore = 50;
  if (optionsPCR != null) {
    if      (optionsPCR >= 0.8 && optionsPCR <= 1.0)  pcrScore = 70;
    else if (optionsPCR > 1.0 && optionsPCR <= 1.3)   pcrScore = 55;
    else if (optionsPCR > 1.3)                         pcrScore = 40;
    else if (optionsPCR < 0.7)                         pcrScore = 35;
  }
  totalScore += pcrScore * 0.25;
  factors.push({ name: 'Options PCR', score: pcrScore, weight: 25, detail: optionsPCR != null ? optionsPCR.toFixed(2) : '—' });

  let mood = 'neutral';
  if      (totalScore >= 70) mood = 'very_bullish';
  else if (totalScore >= 60) mood = 'bullish';
  else if (totalScore >= 55) mood = 'slightly_bullish';
  else if (totalScore <= 30) mood = 'very_bearish';
  else if (totalScore <= 40) mood = 'bearish';
  else if (totalScore <= 45) mood = 'slightly_bearish';

  return { score: Math.round(totalScore), mood, factors };
}

// ─────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbols      = searchParams.get('symbols')?.split(',') || [];
    const includePCR   = searchParams.get('pcr');
    const forceRefresh = !!searchParams.get('refresh');
    const pcrValue     = includePCR ? parseFloat(includePCR) : null;

    const NS = process.env.REDIS_NAMESPACE || 'prod';
    const cacheKey = `${NS}:sentiment:market`;

    // Serve cache unless force-refresh during market hours
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached && (!forceRefresh || !isMarketHours())) {
      if (!isMarketHours() && cached) cached.offMarketHours = true;
      if (symbols.length > 0) {
        const stockKey = `${NS}:sentiment:stocks:${symbols.join(',')}`;
        let stockSentiment = await redis.get(stockKey).catch(() => null);
        if (!stockSentiment) {
          const tvSymbols = symbols.map(s => s.includes(':') ? s : `NSE:${s}`);
          stockSentiment = await fetchMultiSymbolSentiment(tvSymbols);
          await redis.set(stockKey, stockSentiment, { ex: 300 }).catch(() => {});
        }
        return NextResponse.json({ ...cached, stocks: stockSentiment, cached: true });
      }
      return NextResponse.json({ ...cached, cached: true });
    }

    // Fetch all in parallel
    const [fiiDiiRaw, niftyDaily, bankNiftyDaily, intradayBias] = await Promise.all([
      fetchFIIDIIData(),
      fetchTradingViewDaily('NSE:NIFTY'),
      fetchTradingViewDaily('NSE:BANKNIFTY'),
      calculateIntradayBias(pcrValue),   // ← Real Kite candles
    ]);

    const fiiDii    = analyzeFIIDII(fiiDiiRaw);
    const dailyMood = calculateOverallMood(fiiDii, niftyDaily, pcrValue);

    const divergence = (dailyMood.score >= 55) !== (intradayBias.score >= 55);

    const result = {
      timestamp: new Date().toISOString(),
      fiiDii,
      indices: { nifty: niftyDaily, bankNifty: bankNiftyDaily },
      overall: dailyMood,
      timeframes: {
        daily: {
          bias: dailyMood.mood,
          score: dailyMood.score,
          source: 'tradingview_daily',
        },
        intraday: {
          bias:       intradayBias.bias,
          score:      intradayBias.score,
          signals:    intradayBias.signals,
          source:     intradayBias.source,       // 'kite' or 'pcr_only'
          indicators: intradayBias.indicators || null,
          lastPrice:  intradayBias.lastPrice  || null,
        },
        divergence,
      },
      telegram: { available: false },
    };

    const cacheTTL = isMarketHours() ? 300 : 1800;
    await redis.set(cacheKey, result, { ex: cacheTTL }).catch(() => {});

    if (symbols.length > 0) {
      const tvSymbols = symbols.map(s => s.includes(':') ? s : `NSE:${s}`);
      const stockSentiment = await fetchMultiSymbolSentiment(tvSymbols);
      const stockKey = `${NS}:sentiment:stocks:${symbols.join(',')}`;
      await redis.set(stockKey, stockSentiment, { ex: 300 }).catch(() => {});
      result.stocks = stockSentiment;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Sentiment API error:', error);
    return NextResponse.json({ error: 'Failed to fetch sentiment data', details: error.message }, { status: 500 });
  }
}