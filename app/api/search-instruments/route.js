import { NextResponse } from 'next/server';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

// Cache instruments for 24 hours
let instrumentsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

const INDICES = [
  { symbol: 'NIFTY',      name: 'Nifty 50',     exchange: 'NSE', type: 'INDEX', lotSize: 65 },
  { symbol: 'BANKNIFTY',  name: 'Bank Nifty',   exchange: 'NSE', type: 'INDEX', lotSize: 30 },
  { symbol: 'FINNIFTY',   name: 'Fin Nifty',    exchange: 'NSE', type: 'INDEX', lotSize: 40 },
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

async function fetchAndCacheInstruments(apiKey, accessToken) {
  const now = Date.now();
  if (instrumentsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return instrumentsCache;
  }

  // Fetch NSE equity instruments
  const nseRes = await fetch('https://api.kite.trade/instruments/NSE', {
    headers: { 'Authorization': `token ${apiKey}:${accessToken}` },
  });
  if (!nseRes.ok) throw new Error(`NSE fetch failed: ${nseRes.status}`);
  const nseCsv = await nseRes.text();

  // Fetch NFO to get lot sizes — use tradingsymbol to extract underlying
  const nfoRes = await fetch('https://api.kite.trade/instruments/NFO', {
    headers: { 'Authorization': `token ${apiKey}:${accessToken}` },
  });

  // Build lot size map: underlying symbol → lot size
  // Key insight: for FUT rows, tradingsymbol is like "COFORGE25FEBFUT"
  // We extract the underlying by stripping the date+FUT suffix
  const lotSizeMap = {};
  if (nfoRes.ok) {
    const nfoCsv   = await nfoRes.text();
    const nfoLines = nfoCsv.trim().split('\n');
    const nfoHdrs  = parseCSVLine(nfoLines[0]);
    const tsIdx    = nfoHdrs.indexOf('tradingsymbol'); // e.g. COFORGE25FEBFUT
    const nameIdx  = nfoHdrs.indexOf('name');           // e.g. COFORGE
    const typeIdx  = nfoHdrs.indexOf('instrument_type');
    const lotIdx   = nfoHdrs.indexOf('lot_size');

    for (let i = 1; i < nfoLines.length; i++) {
      const cols = parseCSVLine(nfoLines[i]);
      if (cols[typeIdx] === 'FUT') {
        // Use 'name' column as underlying — this is the clean symbol
        const underlying = cols[nameIdx]?.trim();
        const lot = parseInt(cols[lotIdx]) || 0;
        // Only store first occurrence (nearest expiry has correct lot size)
        // Only store first occurrence (nearest expiry = current lot size)
        if (underlying && lot > 0 && !lotSizeMap[underlying]) {
          lotSizeMap[underlying] = lot;
        }
      }
    }
    console.log(`Built lot size map for ${Object.keys(lotSizeMap).length} symbols`);
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
  console.log(`Cached ${instruments.length} NSE EQ instruments`);
  return instruments;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toUpperCase() || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '15') || 15, 50);

    if (!query || query.length < 1) {
      return NextResponse.json({ success: true, instruments: [] });
    }

    const { apiKey, accessToken } = await getKiteCredentials();

    let equityInstruments = [];
    if (apiKey && accessToken) {
      try {
        equityInstruments = await fetchAndCacheInstruments(apiKey, accessToken);
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