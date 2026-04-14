// ─── Straddle Chart API ────────────────────────────────────────────────────────
// Returns intraday time series:
//   candles[]  — ATM straddle (CE+PE) per bar: { time, value, ce, pe }
//   spot[]     — Nifty 50 index candles: { time, value }
//   vix[]      — India VIX candles: { time, value }
//
// GET /api/options/straddle-chart?symbol=NIFTY&expiry=2025-01-30&strike=22450&interval=5minute

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
async function redisSet(key, value, ex) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url = ex ? `${REDIS_URL}/set/${key}/${encoded}?ex=${ex}` : `${REDIS_URL}/set/${key}/${encoded}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch {}
}

// Well-known Kite instrument tokens (NSE indices)
const INDEX_TOKENS = {
  NIFTY:    256265,   // NSE:NIFTY 50
  BANKNIFTY: 260105,  // NSE:NIFTY BANK
  VIX:      264969,   // NSE:INDIA VIX
};

const INSTRUMENTS_KEY = `${NS}:nfo-options-instruments`;

async function getNFOInstruments(dp) {
  const cached = await redisGet(INSTRUMENTS_KEY);
  if (cached) return cached;

  const csvText = await dp.getInstrumentsCSV('NFO');
  const lines   = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  const tokenIdx  = headers.indexOf('instrument_token');
  const tsIdx     = headers.indexOf('tradingsymbol');
  const nameIdx   = headers.indexOf('name');
  const expiryIdx = headers.indexOf('expiry');
  const strikeIdx = headers.indexOf('strike');
  const typeIdx   = headers.indexOf('instrument_type');

  const instruments = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const name = cols[nameIdx]?.replace(/"/g, '').trim();
    const type = cols[typeIdx]?.replace(/"/g, '').trim();
    if ((name === 'NIFTY' || name === 'BANKNIFTY') && (type === 'CE' || type === 'PE')) {
      instruments.push({
        token:  parseInt(cols[tokenIdx]) || 0,
        symbol: cols[tsIdx]?.replace(/"/g, '').trim(),
        name,
        expiry: cols[expiryIdx]?.replace(/"/g, '').trim() || '',
        strike: parseFloat(cols[strikeIdx]) || 0,
        type,
      });
    }
  }
  await redisSet(INSTRUMENTS_KEY, instruments, 2 * 3600);
  return instruments;
}

function toCandles(rawCandles) {
  // Raw Kite format: [isoTime, o, h, l, close, vol]
  return (rawCandles || []).map(c => ({
    time:  Math.floor(new Date(c[0]).getTime() / 1000),
    value: parseFloat(c[4].toFixed(2)),
  }));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol   = (searchParams.get('symbol')   || 'NIFTY').toUpperCase();
  const expiry   = searchParams.get('expiry')    || '';
  const interval = searchParams.get('interval')  || '5minute';

  // Straddle: single strike for both legs.
  // Strangle: ceStrike (OTM call) + peStrike (OTM put), different strikes.
  const strike   = parseFloat(searchParams.get('strike')   || '0');
  const ceStrike = parseFloat(searchParams.get('ceStrike') || '0') || strike;
  const peStrike = parseFloat(searchParams.get('peStrike') || '0') || strike;

  if (!expiry || (!strike && (!ceStrike || !peStrike))) {
    return NextResponse.json({ error: 'expiry and strike (or ceStrike+peStrike) required' }, { status: 400 });
  }

  const cacheKey = `${NS}:straddle-chart-v2-${symbol}-${expiry}-${ceStrike}-${peStrike}-${interval}`;
  const cached   = await redisGet(cacheKey);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) return NextResponse.json({ error: 'Kite disconnected' }, { status: 503 });

    const instruments = await getNFOInstruments(dp);
    const ce = instruments.find(i => i.name === symbol && i.expiry === expiry && i.strike === ceStrike && i.type === 'CE');
    const pe = instruments.find(i => i.name === symbol && i.expiry === expiry && i.strike === peStrike && i.type === 'PE');

    if (!ce || !pe) return NextResponse.json({ error: `Options not found for ${symbol} ${expiry} ${strike}` }, { status: 404 });

    // Fetch today's intraday data for both legs + Nifty spot + VIX
    const now   = new Date();
    const ist   = new Date(now.getTime() + 5.5 * 3600 * 1000);
    const pad   = n => n.toString().padStart(2, '0');
    const today = `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}`;
    const from  = encodeURIComponent(`${today} 09:15:00`);
    const to    = encodeURIComponent(`${today} 15:30:00`);

    const spotToken = INDEX_TOKENS[symbol] || INDEX_TOKENS.NIFTY;
    const vixToken  = INDEX_TOKENS.VIX;

    const [ceRaw, peRaw, spotRaw, vixRaw] = await Promise.all([
      dp.getHistoricalRaw(ce.token, interval, from, to),
      dp.getHistoricalRaw(pe.token, interval, from, to),
      dp.getHistoricalRaw(spotToken, interval, from, to).catch(() => null),
      dp.getHistoricalRaw(vixToken,  interval, from, to).catch(() => null),
    ]);

    const ceCandles  = ceRaw?.data?.candles  || [];
    const peCandles  = peRaw?.data?.candles  || [];
    const spotCandles = spotRaw?.data?.candles || [];
    const vixCandles  = vixRaw?.data?.candles  || [];

    if (!ceCandles.length && !peCandles.length) {
      console.log('[straddle-chart] no data:', symbol, expiry, ceStrike, today);
      return NextResponse.json({ candles: [], spot: [], vix: [], ceSymbol: ce.symbol, peSymbol: pe.symbol, strike: ceStrike });
    }

    // Merge CE + PE by Unix-second timestamp
    const peMap = new Map(peCandles.map(c => [Math.floor(new Date(c[0]).getTime() / 1000), c[4]]));
    const candles = ceCandles.map(c => {
      const ts      = Math.floor(new Date(c[0]).getTime() / 1000);
      const peClose = peMap.get(ts) || 0;
      return {
        time:  ts,
        value: parseFloat((c[4] + peClose).toFixed(2)),
        ce:    parseFloat(c[4].toFixed(2)),
        pe:    parseFloat(peClose.toFixed(2)),
      };
    }).filter(c => c.value > 0);

    const response = {
      symbol, expiry, ceStrike, peStrike, interval,
      ceSymbol: ce.symbol, peSymbol: pe.symbol,
      strike: ceStrike,
      candles,
      spot: toCandles(spotCandles),
      vix:  toCandles(vixCandles),
      timestamp: new Date().toISOString(),
    };

    await redisSet(cacheKey, response, 5 * 60); // 5-min cache
    return NextResponse.json(response);

  } catch (err) {
    const isAuth = /api_key|access_token|invalid.*token|unauthorized/i.test(err.message);
    if (!isAuth) console.error('straddle-chart error:', err.message);
    return NextResponse.json({ error: isAuth ? 'Kite disconnected' : err.message }, { status: 500 });
  }
}
