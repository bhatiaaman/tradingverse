// ─── Options Chain with Greeks API ────────────────────────────────────────────
// Returns: strike table with IV, Delta, Gamma, Theta, Vega, probITM per option.
// Also returns: spot, ATM, HV30, expected move, expiries list.
//
// GET /api/options/chain-with-greeks?symbol=NIFTY&expiry=2025-01-30

import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';
import { computeIV, computeGreeks, computeHV, expectedMove, timeToExpiry } from '@/app/lib/options/black-scholes';

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

const UNDERLYING = {
  NIFTY:      { spotSymbol: 'NSE:NIFTY 50',          strikeGap: 50,  lotSize: 75,  token: 256265, optExchange: 'NFO' },
  BANKNIFTY:  { spotSymbol: 'NSE:NIFTY BANK',        strikeGap: 100, lotSize: 15,  token: 260105, optExchange: 'NFO' },
  FINNIFTY:   { spotSymbol: 'NSE:NIFTY FIN SERVICE', strikeGap: 50,  lotSize: 40,  token: 257801, optExchange: 'NFO' },
  MIDCPNIFTY: { spotSymbol: 'NSE:NIFTY MID SELECT',  strikeGap: 25,  lotSize: 75,  token: 258057, optExchange: 'NFO' },
  SENSEX:     { spotSymbol: 'BSE:SENSEX',             strikeGap: 100, lotSize: 10,  token: 265,    optExchange: 'BFO' },
  BANKEX:     { spotSymbol: 'BSE:BANKEX',             strikeGap: 100, lotSize: 15,  token: 271,    optExchange: 'BFO' },
};

// Valid CE/PE names per exchange
const VALID_NAMES_FOR = {
  NFO: new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']),
  BFO: new Set(['SENSEX', 'BANKEX', 'BSESENSEX', 'BSEBANKEX']),
};

const INSTRUMENTS_TTL = 2 * 3600;
const instrumentsKey  = (exchange) => `${NS}:${exchange.toLowerCase()}-options-instruments`;

// ── Parse & cache options instruments (CE/PE, includes instrument_token) ──────
async function getOptionsInstruments(dp, exchange) {
  const cacheKey = instrumentsKey(exchange);
  const cached   = await redisGet(cacheKey);
  if (cached) return cached;

  const csvText = await dp.getInstrumentsCSV(exchange);
  const lines   = csvText.trim().split('\n');
  const headers = lines[0].split(',');

  const tokenIdx  = headers.indexOf('instrument_token');
  const tsIdx     = headers.indexOf('tradingsymbol');
  const nameIdx   = headers.indexOf('name');
  const expiryIdx = headers.indexOf('expiry');
  const strikeIdx = headers.indexOf('strike');
  const typeIdx   = headers.indexOf('instrument_type');

  const validNames = VALID_NAMES_FOR[exchange] ?? new Set();
  const instruments = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    let name = cols[nameIdx]?.replace(/"/g, '').trim();
    if (name === 'BSESENSEX') name = 'SENSEX';
    if (name === 'BSEBANKEX') name = 'BANKEX';

    const type = cols[typeIdx]?.replace(/"/g, '').trim();
    if (validNames.has(name) && (type === 'CE' || type === 'PE')) {
      instruments.push({
        token:    parseInt(cols[tokenIdx]) || 0,
        symbol:   cols[tsIdx]?.replace(/"/g, '').trim(),
        name,
        expiry:   cols[expiryIdx]?.replace(/"/g, '').trim() || '',
        strike:   parseFloat(cols[strikeIdx]) || 0,
        type,
      });
    }
  }

  await redisSet(cacheKey, instruments, INSTRUMENTS_TTL);
  return instruments;
}

// ── Get upcoming expiries for a symbol ───────────────────────────────────────
function getExpiries(instruments, name) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const all   = [...new Set(
    instruments.filter(i => i.name === name).map(i => i.expiry)
  )].filter(e => new Date(e) >= today).sort();

  const weekly  = all[0];
  // Monthly = last expiry of each calendar month
  const monthlyAll = all.filter((e, _, arr) => {
    const next = arr.find(x => new Date(x) > new Date(e));
    return !next || new Date(next).getMonth() !== new Date(e).getMonth();
  });
  const monthly = monthlyAll[0] || weekly;
  const nextMonthly = monthlyAll[1] || monthly;

  return { weekly, monthly, nextMonthly, monthlyAll: monthlyAll.slice(0, 6), all: all.slice(0, 8) };
}

// ── Fetch spot price via OHLC ─────────────────────────────────────────────────
async function getSpot(dp, symbol) {
  try {
    const cfg  = UNDERLYING[symbol];
    const ohlc = await dp.getOHLC([cfg.spotSymbol]);
    const key  = Object.keys(ohlc || {})[0];
    return ohlc?.[key]?.last_price || ohlc?.[key]?.ohlc?.close || 0;
  } catch { return 0; }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol   = (searchParams.get('symbol') || 'NIFTY').toUpperCase();
  const expiry   = searchParams.get('expiry') || '';   // 'YYYY-MM-DD' or 'weekly'/'monthly'

  const cfg = UNDERLYING[symbol];
  if (!cfg) return NextResponse.json({ error: 'Unknown symbol' }, { status: 400 });

  const cacheKey = `${NS}:options-greeks-${symbol}-${expiry}`;
  const cached   = await redisGet(cacheKey);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) return NextResponse.json({ error: 'Kite disconnected' }, { status: 503 });

    // ── Resolve expiry ────────────────────────────────────────────────────────
    const [instruments, spot] = await Promise.all([
      getOptionsInstruments(dp, cfg.optExchange),
      getSpot(dp, symbol),
    ]);

    const expiries    = getExpiries(instruments, symbol);
    let resolvedExpiry = expiry;
    if (expiry === 'weekly' || !expiry)  resolvedExpiry = expiries.weekly;
    if (expiry === 'monthly')            resolvedExpiry = expiries.monthly;
    if (!resolvedExpiry) return NextResponse.json({ error: 'No upcoming expiry found' }, { status: 404 });

    const T = timeToExpiry(resolvedExpiry);

    // ── Filter strikes ±15 around ATM ────────────────────────────────────────
    const atm         = Math.round(spot / cfg.strikeGap) * cfg.strikeGap;
    const strikeRange = cfg.strikeGap * 15;
    const expOptions  = instruments.filter(
      i => i.name === symbol && i.expiry === resolvedExpiry &&
           i.strike >= atm - strikeRange && i.strike <= atm + strikeRange
    );
    if (!expOptions.length) return NextResponse.json({ error: 'No options found for expiry' }, { status: 404 });

    // ── Fetch quotes in batches of 200 ────────────────────────────────────────
    const optExchange    = cfg.optExchange;
    const instrumentKeys = expOptions.map(i => `${optExchange}:${i.symbol}`);
    const batchSize      = 200;
    const quoteMap       = {};
    for (let i = 0; i < instrumentKeys.length; i += batchSize) {
      const batch  = instrumentKeys.slice(i, i + batchSize);
      const quotes = await dp.getQuote(batch);
      Object.assign(quoteMap, quotes || {});
    }

    // ── Build strike table with BS Greeks ────────────────────────────────────
    const strikeMap = {};
    for (const opt of expOptions) {
      const key   = `${optExchange}:${opt.symbol}`;
      const quote = quoteMap[key];
      const ltp   = quote?.last_price || 0;
      const oi    = quote?.oi || 0;
      const vol   = quote?.volume || 0;

      const iv      = ltp > 0 ? computeIV(ltp, spot, opt.strike, T, undefined, undefined, opt.type === 'CE') : null;
      const greeks  = iv ? computeGreeks(spot, opt.strike, T, undefined, undefined, iv, opt.type === 'CE') : null;

      if (!strikeMap[opt.strike]) strikeMap[opt.strike] = { strike: opt.strike };
      strikeMap[opt.strike][opt.type === 'CE' ? 'ce' : 'pe'] = {
        ltp, oi, volume: vol,
        iv:      iv     ? parseFloat((iv * 100).toFixed(2))    : null,  // as %
        delta:   greeks ? parseFloat(greeks.delta.toFixed(4))  : null,
        gamma:   greeks ? parseFloat(greeks.gamma.toFixed(6))  : null,
        theta:   greeks ? parseFloat(greeks.theta.toFixed(2))  : null,
        vega:    greeks ? parseFloat(greeks.vega.toFixed(2))   : null,
        probITM: greeks ? parseFloat((greeks.probITM * 100).toFixed(1)) : null,
        token:   opt.token,
        symbol:  opt.symbol,
      };
    }

    const strikes = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);

    // ── ATM IV (average of CE + PE at ATM) ───────────────────────────────────
    const atmRow   = strikeMap[atm] || strikes.find(s => s.strike === atm);
    const atmIVCE  = atmRow?.ce?.iv  || null;
    const atmIVPE  = atmRow?.pe?.iv  || null;
    const atmIV    = (atmIVCE && atmIVPE) ? (atmIVCE + atmIVPE) / 2 : (atmIVCE || atmIVPE);
    const straddlePremium = ((atmRow?.ce?.ltp || 0) + (atmRow?.pe?.ltp || 0));

    // ── HV30 from NIFTY daily closes ─────────────────────────────────────────
    let hv30 = null;
    try {
      const today   = new Date();
      const fromD   = new Date(today); fromD.setDate(fromD.getDate() - 60);
      const pad     = n => n.toString().padStart(2, '0');
      const fmt     = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 09:00:00`;
      const history = await dp.getHistoricalData(cfg.token, 'day', fmt(fromD), fmt(today));
      if (history?.length) {
        const closes = history.map(c => c.close);
        hv30 = computeHV(closes, 30);
      }
    } catch {}

    // ── Expected move ─────────────────────────────────────────────────────────
    const expMove = atmIV ? expectedMove(spot, T, atmIV / 100) : null;

    const response = {
      symbol, expiry: resolvedExpiry, spot, atm,
      atmIV, hv30: hv30 ? parseFloat((hv30 * 100).toFixed(2)) : null,
      ivHvRatio: (atmIV && hv30) ? parseFloat((atmIV / (hv30 * 100)).toFixed(2)) : null,
      straddlePremium: parseFloat(straddlePremium.toFixed(2)),
      expectedMove: expMove ? {
        pct:    parseFloat((expMove.pct * 100).toFixed(2)),
        points: expMove.points,
        upper:  parseFloat(expMove.upper.toFixed(2)),
        lower:  parseFloat(expMove.lower.toFixed(2)),
      } : null,
      expiries,
      strikes,
      timestamp: new Date().toISOString(),
    };

    await redisSet(cacheKey, response, 60);  // 60s cache
    return NextResponse.json(response);

  } catch (err) {
    const isAuth = /api_key|access_token|invalid.*token|unauthorized/i.test(err.message);
    if (!isAuth) console.error('chain-with-greeks error:', err.message);
    return NextResponse.json({ error: isAuth ? 'Kite disconnected' : err.message }, { status: 500 });
  }
}
