import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

// ── In-memory + Redis cache for NSE EQ instruments ───────────────────────────
let instrumentsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const REDIS_KEY   = `${NS}:nse-instruments`;
const REDIS_TTL   = 86400; // 24 hours

async function redisCacheGet() {
  try {
    const res = await fetch(`${REDIS_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisCacheSet(value) {
  try {
    // Use POST pipeline — instruments list is too large for a URL-encoded GET
    await fetch(REDIS_URL, {
      method:  'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(['SET', REDIS_KEY, JSON.stringify(value), 'EX', REDIS_TTL]),
    });
  } catch { /* non-critical */ }
}

// ── In-memory cache for NFO options (CE/PE) — too large for Redis ─────────────
let optionsCache = null;          // flat array sorted by (underlying, expiry ASC, strike)
let optionsCacheTimestamp = null;

const INDICES = [
  { symbol: 'NIFTY',      name: 'Nifty 50',     exchange: 'NSE', type: 'INDEX', lotSize: 75 },
  { symbol: 'BANKNIFTY',  name: 'Bank Nifty',   exchange: 'NSE', type: 'INDEX', lotSize: 30 },
  { symbol: 'FINNIFTY',   name: 'Fin Nifty',    exchange: 'NSE', type: 'INDEX', lotSize: 65 },
  { symbol: 'MIDCPNIFTY', name: 'Midcap Nifty', exchange: 'NSE', type: 'INDEX', lotSize: 120 },
  { symbol: 'SENSEX',     name: 'Sensex',        exchange: 'BSE', type: 'INDEX', lotSize: 10 },
  { symbol: 'BANKEX',     name: 'Bankex',        exchange: 'BSE', type: 'INDEX', lotSize: 15 },
];

const FALLBACK_STOCKS = [
  { symbol: 'RELIANCE',   name: 'Reliance Industries',       exchange: 'NSE', type: 'EQ', lotSize: 250 },
  { symbol: 'TCS',        name: 'Tata Consultancy Services', exchange: 'NSE', type: 'EQ', lotSize: 150 },
  { symbol: 'HDFCBANK',   name: 'HDFC Bank',                 exchange: 'NSE', type: 'EQ', lotSize: 550 },
  { symbol: 'INFY',       name: 'Infosys',                   exchange: 'NSE', type: 'EQ', lotSize: 300 },
  { symbol: 'ICICIBANK',  name: 'ICICI Bank',                exchange: 'NSE', type: 'EQ', lotSize: 700 },
  { symbol: 'SBIN',       name: 'State Bank of India',       exchange: 'NSE', type: 'EQ', lotSize: 1500 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel',             exchange: 'NSE', type: 'EQ', lotSize: 500 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors',               exchange: 'NSE', type: 'EQ', lotSize: 1400 },
  { symbol: 'COFORGE',    name: 'Coforge',                   exchange: 'NSE', type: 'EQ', lotSize: 125 },
  { symbol: 'ITC',        name: 'ITC Ltd',                   exchange: 'NSE', type: 'EQ', lotSize: 1600 },
  { symbol: 'AXISBANK',   name: 'Axis Bank',                 exchange: 'NSE', type: 'EQ', lotSize: 625 },
  { symbol: 'KOTAKBANK',  name: 'Kotak Mahindra Bank',       exchange: 'NSE', type: 'EQ', lotSize: 400 },
  { symbol: 'LT',         name: 'Larsen & Toubro',           exchange: 'NSE', type: 'EQ', lotSize: 175 },
  { symbol: 'MARUTI',     name: 'Maruti Suzuki',             exchange: 'NSE', type: 'EQ', lotSize: 37 },
  { symbol: 'WIPRO',      name: 'Wipro',                     exchange: 'NSE', type: 'EQ', lotSize: 1500 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance',             exchange: 'NSE', type: 'EQ', lotSize: 125 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever',        exchange: 'NSE', type: 'EQ', lotSize: 300 },
  { symbol: 'TATASTEEL',  name: 'Tata Steel',                exchange: 'NSE', type: 'EQ', lotSize: 5500 },
  { symbol: 'SUNPHARMA',  name: 'Sun Pharma',                exchange: 'NSE', type: 'EQ', lotSize: 350 },
  { symbol: 'ADANIENT',   name: 'Adani Enterprises',         exchange: 'NSE', type: 'EQ', lotSize: 250 },
  { symbol: 'ADANIPORTS', name: 'Adani Ports',               exchange: 'NSE', type: 'EQ', lotSize: 1250 },
  { symbol: 'HAVELLS',    name: 'Havells India',             exchange: 'NSE', type: 'EQ', lotSize: 500 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints',              exchange: 'NSE', type: 'EQ', lotSize: 200 },
  { symbol: 'DRREDDY',    name: 'Dr Reddys Labs',            exchange: 'NSE', type: 'EQ', lotSize: 125 },
  { symbol: 'HCLTECH',    name: 'HCL Technologies',          exchange: 'NSE', type: 'EQ', lotSize: 350 },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv',             exchange: 'NSE', type: 'EQ', lotSize: 500 },
  { symbol: 'TECHM',      name: 'Tech Mahindra',             exchange: 'NSE', type: 'EQ', lotSize: 600 },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement',          exchange: 'NSE', type: 'EQ', lotSize: 100 },
  { symbol: 'NESTLEIND',  name: 'Nestle India',              exchange: 'NSE', type: 'EQ', lotSize: 40 },
];

// Proper CSV line parser — handles quoted fields with commas inside
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Format expiry date for display: "2025-03-27" → "27 Mar"
function fmtExpiry(expiry) {
  if (!expiry) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(expiry);
  if (isNaN(d)) return expiry;
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

async function fetchAndCacheInstruments(dp) {
  const now = Date.now();
  // L1: in-memory (same process, fast)
  if (instrumentsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return instrumentsCache;
  }
  // L2: Redis (survives restarts / multi-instance)
  const redisHit = await redisCacheGet();
  if (redisHit) {
    instrumentsCache = redisHit;
    cacheTimestamp   = now;
    return instrumentsCache;
  }

  // Fetch NSE equity instruments — provider returns CSV text directly
  const nseCsv = await dp.getInstrumentsCSV('NSE');
  if (!nseCsv || typeof nseCsv !== 'string') throw new Error('NSE instruments CSV empty');

  // Fetch NFO to get lot sizes — provider returns CSV text directly
  let nfoCsvText = null;
  try { nfoCsvText = await dp.getNFOInstrumentsCSV(); } catch { /* lot sizes optional */ }

  // Build lot size map: underlying symbol → lot size (from nearest FUT expiry)
  const lotSizeMap = {};
  if (nfoCsvText && typeof nfoCsvText === 'string') {
    const nfoLines = nfoCsvText.trim().split('\n');
    const nfoHdrs  = parseCSVLine(nfoLines[0]);
    const nameIdx  = nfoHdrs.indexOf('name');
    const typeIdx  = nfoHdrs.indexOf('instrument_type');
    const lotIdx   = nfoHdrs.indexOf('lot_size');

    for (let i = 1; i < nfoLines.length; i++) {
      const cols = parseCSVLine(nfoLines[i]);
      if (cols[typeIdx] === 'FUT') {
        const underlying = cols[nameIdx]?.trim();
        const lot = parseInt(cols[lotIdx]) || 0;
        if (underlying && lot > 0 && !lotSizeMap[underlying]) {
          lotSizeMap[underlying] = lot;
        }
      }
    }
  }

  // Parse NSE EQ instruments
  const nseLines = nseCsv.trim().split('\n');
  const nseHdrs  = parseCSVLine(nseLines[0]);
  const symIdx   = nseHdrs.indexOf('tradingsymbol');
  const nameIdx2 = nseHdrs.indexOf('name');
  const typeIdx2 = nseHdrs.indexOf('instrument_type');
  const exchIdx  = nseHdrs.indexOf('exchange');

  const instruments = [];
  for (let i = 1; i < nseLines.length; i++) {
    const cols   = parseCSVLine(nseLines[i]);
    const symbol = cols[symIdx];
    const type   = cols[typeIdx2];
    if (type === 'EQ' && symbol) {
      instruments.push({
        symbol,
        name:     cols[nameIdx2]?.trim() || '',
        exchange: cols[exchIdx],
        type,
        lotSize:  lotSizeMap[symbol] || 1,
      });
    }
  }

  instrumentsCache = instruments;
  cacheTimestamp   = now;
  redisCacheSet(instruments); // async, non-blocking
  return instruments;
}

// ── Options cache (in-memory only — NFO is too large for Redis) ───────────────
async function fetchAndCacheOptions(dp) {
  const now = Date.now();
  if (optionsCache && optionsCacheTimestamp && (now - optionsCacheTimestamp) < CACHE_DURATION) {
    return optionsCache;
  }

  const nfoCsvText = await dp.getNFOInstrumentsCSV();
  if (!nfoCsvText || typeof nfoCsvText !== 'string') throw new Error('NFO CSV empty');

  const nfoLines = nfoCsvText.trim().split('\n');
  const hdrs     = parseCSVLine(nfoLines[0]);
  const tsIdx    = hdrs.indexOf('tradingsymbol');
  const nameIdx  = hdrs.indexOf('name');           // underlying, e.g. LT
  const typeIdx  = hdrs.indexOf('instrument_type');
  const expiryIdx = hdrs.indexOf('expiry');
  const strikeIdx = hdrs.indexOf('strike');
  const lotIdx   = hdrs.indexOf('lot_size');

  const today = new Date().toISOString().slice(0, 10);
  const instruments = [];

  for (let i = 1; i < nfoLines.length; i++) {
    const cols = parseCSVLine(nfoLines[i]);
    const type = cols[typeIdx];
    if (type !== 'CE' && type !== 'PE') continue;

    const expiry = cols[expiryIdx]?.trim();
    if (!expiry || expiry < today) continue; // skip expired contracts

    const underlying = cols[nameIdx]?.trim();
    const tradingsymbol = cols[tsIdx]?.trim();
    const strike = parseFloat(cols[strikeIdx]) || 0;
    const lotSize = parseInt(cols[lotIdx]) || 1;

    if (!underlying || !tradingsymbol || strike <= 0) continue;

    instruments.push({
      symbol:     tradingsymbol,
      name:       `${underlying} ${strike % 1 === 0 ? strike : strike.toFixed(1)} ${type} ${fmtExpiry(expiry)}`,
      underlying,
      strike,
      optionType: type,
      expiry,
      exchange:   'NFO',
      type,
      lotSize,
    });
  }

  // Sort: underlying ASC, then expiry ASC (nearest first), then strike ASC
  instruments.sort((a, b) => {
    if (a.underlying !== b.underlying) return a.underlying < b.underlying ? -1 : 1;
    if (a.expiry !== b.expiry) return a.expiry < b.expiry ? -1 : 1;
    return a.strike - b.strike;
  });

  optionsCache = instruments;
  optionsCacheTimestamp = now;
  return instruments;
}

// ── Option query parser ───────────────────────────────────────────────────────
// Handles: "LT 3500 PE", "NIFTY 24000 CE", "LT 3500", "BANKNIFTY 51000"
// Returns null if not an option-style query
function parseOptionQuery(query) {
  // Full: SYMBOL STRIKE CE|PE  (e.g. "LT 3500 PE", "NIFTY24000CE")
  const full = query.match(/^([A-Z0-9&]+)\s*(\d{3,6}(?:\.\d+)?)\s*(CE|PE)$/);
  if (full) return { underlying: full[1], strike: parseFloat(full[2]), optType: full[3] };

  // Partial: SYMBOL STRIKE (no type yet — show both CE and PE)
  const partial = query.match(/^([A-Z0-9&]+)\s+(\d{4,6}(?:\.\d+)?)$/);
  if (partial) return { underlying: partial[1], strike: parseFloat(partial[2]), optType: null };

  return null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toUpperCase() || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '15') || 15, 50);

    if (!query || query.length < 1) {
      return NextResponse.json({ success: true, instruments: [] });
    }

    const dp = await getDataProvider();

    // ── Option search path ─────────────────────────────────────────────────────
    const optQuery = parseOptionQuery(query);
    if (optQuery && dp.isConnected()) {
      try {
        const allOptions = await fetchAndCacheOptions(dp);
        const { underlying, strike, optType } = optQuery;

        const matches = allOptions
          .filter(o => {
            if (o.underlying !== underlying) return false;
            if (strike !== null && Math.abs(o.strike - strike) > 0.01) return false;
            if (optType && o.optionType !== optType) return false;
            return true;
          })
          .slice(0, limit);

        return NextResponse.json({ success: true, instruments: matches, total: matches.length });
      } catch (err) {
        console.error('Options search error:', err.message);
        return NextResponse.json({ success: true, instruments: [], total: 0 });
      }
    }

    // ── Equity search path ────────────────────────────────────────────────────
    let equityInstruments = [];
    if (dp.isConnected()) {
      try {
        equityInstruments = await fetchAndCacheInstruments(dp);
      } catch (err) {
        console.error('Falling back to hardcoded list:', err.message);
        equityInstruments = FALLBACK_STOCKS;
      }
    } else {
      equityInstruments = FALLBACK_STOCKS;
    }

    // Deduplicate — indices first, then equity
    const seen = new Set();
    const allInstruments = [...INDICES, ...equityInstruments].filter(inst => {
      if (seen.has(inst.symbol)) return false;
      seen.add(inst.symbol);
      return true;
    });

    const matches = allInstruments
      .filter(inst =>
        inst.symbol.includes(query) ||
        inst.name.toUpperCase().includes(query)
      )
      .slice(0, limit);

    return NextResponse.json({ success: true, instruments: matches, total: matches.length });

  } catch (error) {
    console.error('Search instruments error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', instruments: [] }, { status: 500 });
  }
}
