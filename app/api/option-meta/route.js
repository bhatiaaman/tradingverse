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

const META_TTL    = 7200; // 2h — covers expiry rollovers
const SYMBOLS_KEY = `${NS}:fno-symbols`;
const EXPIRY_PFX  = `${NS}:fno-expiries:`;
const STRIKES_PFX = `${NS}:fno-strikes:`;

// Known strike gaps for indices; everything else derived from CSV
const KNOWN_GAPS = {
  NIFTY: 50, BANKNIFTY: 100, FINNIFTY: 50,
  MIDCPNIFTY: 25, SENSEX: 100, BANKEX: 100,
};

// Only NIFTY has weekly options; all others are monthly
const WEEKLY_SYMBOLS = new Set(['NIFTY']);

// Which exchange to use for order placement per symbol
const OPT_EXCHANGE = {
  SENSEX: 'BFO', BANKEX: 'BFO',
  // everything else defaults to NFO
};

// Kite instrument keys for index spot prices
const SPOT_KEYS = {
  NIFTY:       'NSE:NIFTY 50',
  BANKNIFTY:   'NSE:NIFTY BANK',
  FINNIFTY:    'NSE:NIFTY FIN SERVICE',
  MIDCPNIFTY:  'NSE:NIFTY MID SELECT',
  SENSEX:      'BSE:SENSEX',
  BANKEX:      'BSE:BANKEX',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Parse NFO + BFO CSVs, populate three cache levels ────────────────────────
async function parseAndCacheNFO(dp) {
  // Fetch NFO (Nifty/BankNifty etc.) and BFO (Sensex/Bankex) in parallel
  const [nfoCsv, bfoCsv] = await Promise.all([
    dp.getInstrumentsCSV('NFO'),
    dp.getInstrumentsCSV('BFO').catch(() => ''), // BFO may not always be available
  ]);

  // Parse a single CSV block and merge rows into allLines
  function parseCSV(csv) {
    if (!csv?.trim()) return { headers: [], rows: [] };
    const ls = csv.trim().split('\n');
    return { headers: ls[0].split(','), rows: ls.slice(1) };
  }

  const nfo = parseCSV(nfoCsv);
  const bfo = parseCSV(bfoCsv);

  // Use NFO headers as canonical (same schema); re-map BFO rows to NFO column order
  const headers = nfo.headers;

  // Helper: given a set of rows with their own headers, yield lines aligned to `headers`
  function* alignedRows(rows, srcHeaders) {
    const idxMap = headers.map(h => srcHeaders.indexOf(h));
    for (const row of rows) {
      const cols = row.split(',');
      yield idxMap.map(i => (i === -1 ? '' : (cols[i] ?? '')));
    }
  }

  // Merge: all NFO rows + BFO rows re-mapped to NFO column order
  const allRows = [
    ...alignedRows(nfo.rows, nfo.headers),
    ...(bfo.headers.length ? alignedRows(bfo.rows, bfo.headers) : []),
  ];

  const tokenIdx   = headers.indexOf('instrument_token');
  const tsIdx      = headers.indexOf('tradingsymbol');
  const nameIdx    = headers.indexOf('name');
  const expiryIdx  = headers.indexOf('expiry');
  const strikeIdx  = headers.indexOf('strike');
  const typeIdx    = headers.indexOf('instrument_type');
  const lotSizeIdx = headers.indexOf('lot_size');

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // symbolMap: name → { expiries: Set<string>, strikesByExpiry: {expiry: Set<number>}, tsTokenMap: {ts: token} }
  const symbolMap = {};

  for (const cols of allRows) {
    const type = cols[typeIdx]?.replace(/"/g, '').trim();
    if (type !== 'CE' && type !== 'PE') continue;

    const name    = cols[nameIdx]?.replace(/"/g, '').trim();
    const expiry  = cols[expiryIdx]?.replace(/"/g, '').trim();
    const strike  = parseFloat(cols[strikeIdx]) || 0;
    const ts      = cols[tsIdx]?.replace(/"/g, '').trim();
    const token   = parseInt(cols[tokenIdx]) || 0;
    const lotSize = parseInt(cols[lotSizeIdx]) || 0;

    if (!name || !expiry || !strike || !ts) continue;
    if (new Date(expiry) < today) continue;

    if (!symbolMap[name]) {
      symbolMap[name] = { expiries: new Set(), strikesByExpiry: {}, tsTokenMap: {}, lotSize: 0 };
    }
    if (lotSize && !symbolMap[name].lotSize) symbolMap[name].lotSize = lotSize;
    symbolMap[name].expiries.add(expiry);
    if (type === 'CE') { // CE side is sufficient for strikes list
      if (!symbolMap[name].strikesByExpiry[expiry]) {
        symbolMap[name].strikesByExpiry[expiry] = new Set();
      }
      symbolMap[name].strikesByExpiry[expiry].add(strike);
    }
    if (token) symbolMap[name].tsTokenMap[ts] = token;
    // Also build reverse lookup: {strike_TYPE: tradingsymbol}
    if (!symbolMap[name].nameLookup) symbolMap[name].nameLookup = {};
    if (!symbolMap[name].nameLookup[expiry]) symbolMap[name].nameLookup[expiry] = {};
    symbolMap[name].nameLookup[expiry][`${strike}_${type}`] = ts;
  }

  // ── Build symbols list ─────────────────────────────────────────────────────
  const symbols = Object.keys(symbolMap).sort().map(name => {
    const allExpiries = [...symbolMap[name].expiries]
      .sort((a, b) => new Date(a) - new Date(b));

    // Monthly = last expiry in each calendar month
    const monthlyExpiries = new Set(allExpiries.filter((exp, _, arr) => {
      const nextExpiry = arr.find(e => new Date(e) > new Date(exp));
      if (!nextExpiry) return true;
      const [ey, em] = exp.split('-').map(Number);
      const [ny, nm] = nextExpiry.split('-').map(Number);
      return ny !== ey || nm !== em;
    }));

    // Derive strike gap for non-index symbols
    let strikeGap = KNOWN_GAPS[name];
    if (!strikeGap && allExpiries[0]) {
      const strikes = [...(symbolMap[name].strikesByExpiry[allExpiries[0]] || [])].sort((a, b) => a - b);
      if (strikes.length >= 2) {
        const diffs = strikes.slice(1).map((s, i) => s - strikes[i]).filter(d => d > 0);
        strikeGap = diffs.length ? Math.min(...diffs) : 50;
      } else {
        strikeGap = 50;
      }
    }

    // Which expiries to show
    const visibleExpiries = WEEKLY_SYMBOLS.has(name) ? allExpiries : [...monthlyExpiries].sort();

    const labeledExpiries = visibleExpiries.map(exp => {
      const d = new Date(exp);
      return {
        date:       exp,
        label:      `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        shortLabel: `${d.getDate()} ${MONTHS[d.getMonth()]}${!monthlyExpiries.has(exp) ? ' (W)' : ''}`,
        isMonthly:  monthlyExpiries.has(exp),
      };
    });

    return { name, strikeGap: strikeGap || 50, expiries: labeledExpiries, optExchange: OPT_EXCHANGE[name] ?? 'NFO' };
  });

  // ── Cache: symbols list ────────────────────────────────────────────────────
  await redisSet(SYMBOLS_KEY, symbols, META_TTL);

  // ── Cache: per-symbol expiries + per-symbol+expiry strikes ────────────────
  // (batched, no await — fire and forget for speed)
  const cachePromises = [];
  for (const sym of symbols) {
    cachePromises.push(
      redisSet(`${EXPIRY_PFX}${sym.name}`, sym.expiries, META_TTL),
      // Cache exchange per symbol so atm-quick-order can look it up
      redisSet(`${NS}:fno-exchange:${sym.name}`, sym.optExchange, META_TTL),
    );
  }
  for (const [name, data] of Object.entries(symbolMap)) {
    for (const [expiry, strikeSet] of Object.entries(data.strikesByExpiry)) {
      const strikes = [...strikeSet].sort((a, b) => a - b);
      cachePromises.push(
        redisSet(`${STRIKES_PFX}${name}:${expiry}`, strikes, META_TTL)
      );
    }
    // Also cache the tradingsymbol→token map per symbol
    cachePromises.push(
      redisSet(`${NS}:fno-ts-tokens:${name}`, data.tsTokenMap, META_TTL)
    );
    // Cache lot size per symbol name
    if (data.lotSize) {
      cachePromises.push(
        redisSet(`${NS}:fno-lotsize:${name}`, data.lotSize, META_TTL)
      );
    }
    // Cache reverse lookup per symbol+expiry: {strike_TYPE: tradingsymbol}
    for (const [exp, lookup] of Object.entries(data.nameLookup || {})) {
      cachePromises.push(
        redisSet(`${NS}:fno-name-lookup:${name}:${exp}`, lookup, META_TTL)
      );
    }
  }
  await Promise.all(cachePromises);

  return { symbols, symbolMap };
}

// ── GET /api/option-meta?action=symbols|expiries|strikes ──────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'symbols';
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const expiry = searchParams.get('expiry'); // YYYY-MM-DD
  const bust   = searchParams.get('bust') === '1';

  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite disconnected' }, { status: 503 });
    }

    if (action === 'symbols') {
      if (!bust) {
        const cached = await redisGet(SYMBOLS_KEY);
        if (cached) return NextResponse.json({ symbols: cached });
      }
      const { symbols } = await parseAndCacheNFO(dp);
      return NextResponse.json({ symbols });
    }

    if (action === 'expiries') {
      if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });
      if (!bust) {
        const cached = await redisGet(`${EXPIRY_PFX}${symbol}`);
        if (cached) return NextResponse.json({ expiries: cached });
      }
      const { symbols } = await parseAndCacheNFO(dp);
      const sym = symbols.find(s => s.name === symbol);
      if (!sym) return NextResponse.json({ error: `No FnO data for ${symbol}` }, { status: 404 });
      return NextResponse.json({ expiries: sym.expiries });
    }

    if (action === 'strikes') {
      if (!symbol || !expiry) return NextResponse.json({ error: 'symbol and expiry required' }, { status: 400 });
      const cacheKey = `${STRIKES_PFX}${symbol}:${expiry}`;
      if (!bust) {
        const cached = await redisGet(cacheKey);
        if (cached) return NextResponse.json({ strikes: cached });
      }
      await parseAndCacheNFO(dp);
      const strikes = await redisGet(cacheKey);
      if (!strikes) return NextResponse.json({ error: `No strikes found for ${symbol} ${expiry}` }, { status: 404 });
      return NextResponse.json({ strikes });
    }

    // Returns the exact Kite tradingsymbol for a given symbol+expiry+strike+type
    if (action === 'tradingsymbol') {
      const type   = searchParams.get('type')?.toUpperCase();
      const strike = parseFloat(searchParams.get('strike') || '0');
      if (!symbol || !expiry || !strike || !type) {
        return NextResponse.json({ error: 'symbol, expiry, strike, type required' }, { status: 400 });
      }
      const lookupKey = `${NS}:fno-name-lookup:${symbol}:${expiry}`;
      let lookup = bust ? null : await redisGet(lookupKey);
      if (!lookup) {
        await parseAndCacheNFO(dp);
        lookup = await redisGet(lookupKey);
      }
      if (!lookup) return NextResponse.json({ error: `No data for ${symbol} ${expiry}` }, { status: 404 });
      const ts = lookup[`${strike}_${type}`];
      if (!ts) return NextResponse.json({ error: `No tradingsymbol for ${symbol} ${strike} ${type} expiry ${expiry}` }, { status: 404 });
      
      const optExchange = OPT_EXCHANGE[symbol] ?? 'NFO';
      const instrument  = `${optExchange}:${ts}`;
      const [ohlcRes, lotSizeRes] = await Promise.all([
        dp.getOHLC([instrument]),
        redisGet(`${NS}:fno-lotsize:${symbol}`)
      ]);

      let lotSize = lotSizeRes;
      if (lotSize === null) {
        try { const { symbolMap } = await parseAndCacheNFO(dp); lotSize = symbolMap[symbol]?.lotSize ?? null; } catch { /* non-critical */ }
      }
      const ltp = ohlcRes?.[instrument]?.last_price ?? null;
      
      return NextResponse.json({ tradingSymbol: ts, lotSize, ltp });
    }

    // Returns lot size for a symbol from cache
    if (action === 'lotsize') {
      if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });
      let lotSize = await redisGet(`${NS}:fno-lotsize:${symbol}`);
      if (lotSize === null) {
        try { const { symbolMap } = await parseAndCacheNFO(dp); lotSize = symbolMap[symbol]?.lotSize ?? null; } catch { /* non-critical */ }
      }
      return NextResponse.json({ lotSize });
    }

    // Returns current spot/LTP for an underlying — used to auto-select ATM strike
    if (action === 'spot') {
      if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });
      const kiteKey = SPOT_KEYS[symbol] || `NSE:${symbol}`;
      const ohlc = await dp.getOHLC([kiteKey]);
      const ltp  = ohlc?.[kiteKey]?.last_price ?? null;
      return NextResponse.json({ ltp, symbol });
    }

    // New: Returns real-time quotes for FnO symbols in bulk or specific symbols
    if (action === 'quotes') {
      const targetSymbolsStr = searchParams.get('symbols'); // comma-separated
      const QUOTES_CACHE_KEY = targetSymbolsStr ? null : `${NS}:fno-quotes-all`;
      
      if (QUOTES_CACHE_KEY && !bust) {
        const cached = await redisGet(QUOTES_CACHE_KEY);
        if (cached) return NextResponse.json({ symbols: cached, fromCache: true });
      }

      // 1. Determine symbols list
      let symbolsToFetch = [];
      if (targetSymbolsStr) {
        symbolsToFetch = targetSymbolsStr.split(',').map(s => ({ name: s.trim().toUpperCase() }));
      } else {
        let symbols = await redisGet(SYMBOLS_KEY);
        if (!symbols) {
          const meta = await parseAndCacheNFO(dp);
          symbols = meta.symbols;
        }
        symbolsToFetch = symbols;
      }

      if (!symbolsToFetch.length) return NextResponse.json({ symbols: [] });

      // 2. Fetch OHLC in bulk
      const instrumentKeys = symbolsToFetch.map(s => `NSE:${s.name}`);
      const ohlcData = await dp.getOHLC(instrumentKeys);

      // 3. Map to final format
      const result = symbolsToFetch.map(s => {
        const key = `NSE:${s.name}`;
        const data = ohlcData[key];
        if (!data) return { symbol: s.name, lastPrice: null, changePercent: null };

        const lp = data.last_price;
        const pc = data.ohlc?.close;
        const cp = pc ? ((lp - pc) / pc) * 100 : 0;

        return {
          symbol: s.name,
          lastPrice: lp,
          changePercent: parseFloat(cp.toFixed(2))
        };
      });

      // 4. Cache if it's the full list
      if (QUOTES_CACHE_KEY) {
        await redisSet(QUOTES_CACHE_KEY, result, 60);
      }
      return NextResponse.json({ symbols: result });
    }

    // Prefetch: expiries + strikes for first expiry + spot — all in one call from cache.
    // Used by options chart page to preload all symbols on mount so symbol switches are instant.
    if (action === 'prefetch') {
      if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

      // Expiries from cache
      let expiries = await redisGet(`${EXPIRY_PFX}${symbol}`);
      if (!expiries?.length) {
        const { symbols } = await parseAndCacheNFO(dp);
        const sym = symbols.find(s => s.name === symbol);
        expiries = sym?.expiries ?? [];
      }
      if (!expiries?.length) return NextResponse.json({ expiries: [], strikes: [], ltp: null });

      // Strikes for first expiry from cache
      const firstExpiry = expiries[0].date;
      let strikes = await redisGet(`${STRIKES_PFX}${symbol}:${firstExpiry}`);
      if (!strikes) {
        await parseAndCacheNFO(dp);
        strikes = await redisGet(`${STRIKES_PFX}${symbol}:${firstExpiry}`) ?? [];
      }

      // Spot — fire independently, don't block if slow
      let ltp = null;
      try {
        const kiteKey = SPOT_KEYS[symbol] || `NSE:${symbol}`;
        const ohlc = await dp.getOHLC([kiteKey]);
        ltp = ohlc?.[kiteKey]?.last_price ?? null;
      } catch {}

      return NextResponse.json({ expiries, strikes, ltp, firstExpiry });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (err) {
    console.error('[option-meta]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
