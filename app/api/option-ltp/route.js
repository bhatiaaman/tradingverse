import { NextResponse } from 'next/server';
import { nseStrikeSteps } from '@/app/lib/nseStrikeSteps';
import { getDataProvider } from '@/app/lib/providers';
import { computeIV, computeGreeks } from '@/app/lib/options/black-scholes';

// Indices that have Thursday expiry (monthly)
const INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'];

// Get last Tuesday of month (for stock options)
function getLastTuesdayOfMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  // Get last day of month
  let d = new Date(year, month + 1, 0);
  // Walk back to Tuesday (Tuesday === 2)
  while (d.getDay() !== 2) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

// Get last Thursday of month (for index options)
function getLastThursdayOfMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  // Get last day of month
  let d = new Date(year, month + 1, 0);
  // Walk back to Thursday (Thursday === 4)
  while (d.getDay() !== 4) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

// Get next expiry date based on symbol type
function getNextExpiry(symbol, fromDate = new Date()) {
  const isIndex = INDICES.includes(symbol.toUpperCase());
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth();
  
  // Get expiry for current month
  let expiry = isIndex 
    ? getLastThursdayOfMonth(fromDate)
    : getLastTuesdayOfMonth(fromDate);
  
  // If we're past this month's expiry, get next month's
  if (fromDate > expiry) {
    const nextMonth = new Date(year, month + 1, 15);
    expiry = isIndex 
      ? getLastThursdayOfMonth(nextMonth)
      : getLastTuesdayOfMonth(nextMonth);
  }
  
  return expiry;
}

// Build Kite option symbol format
// For monthly: SYMBOL + YY + MMM + STRIKE + CE/PE (e.g., TCS26FEB2950CE)
function buildKiteOptionSymbol(symbol, strike, optionType, expiry) {
  const yy = String(expiry.getFullYear()).slice(-2);
  const mmm = expiry.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  return `${symbol}${yy}${mmm}${strike}${optionType}`;
}

// Get strike step based on symbol - using pre-loaded NSE data
function getStrikeStep(symbol, price) {
  if (nseStrikeSteps[symbol]) return nseStrikeSteps[symbol];
  // Price-based heuristic for unknown / index symbols
  const p = Number(price) || 0;
  if (p >= 5000) return 50;
  if (p >= 1000) return 20;
  if (p >= 500) return 10;
  if (p >= 100) return 5;
  return 2.5;
}

// Fetch NFO instruments for a given underlying and extract valid strikes for the expiry.
// Returns sorted array of strikes, or null on failure.
// Cached in Redis under fno-ts-tokens:{name} (same key as chart-data uses).
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

async function getValidStrikes(symbol, expiry, optionType, dp) {
  try {
    // Try Redis cache first (populated by chart-data or previous calls)
    const cacheKey = `${NS}:fno-ts-tokens:${symbol}`;
    const res  = await fetch(`${REDIS_URL}/get/${cacheKey}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    let tokenMap = data.result ? JSON.parse(data.result) : null;

    if (!tokenMap) {
      // Not cached — fetch NFO instruments CSV
      const csvText = await dp.getInstrumentsCSV('NFO');
      if (!csvText || typeof csvText !== 'string') return null;
      const lines = csvText.trim().split('\n');
      tokenMap = {};
      for (let i = 1; i < lines.length; i++) {
        const cols  = lines[i].split(',');
        const token = parseInt(cols[0]);
        const sym   = cols[2]?.replace(/"/g, '').trim();
        const name  = sym?.match(/^([A-Z&]+)/)?.[1];
        if (name === symbol && sym && token) tokenMap[sym] = token;
      }
      // Cache for 1h
      const enc = encodeURIComponent(JSON.stringify(tokenMap));
      await fetch(`${REDIS_URL}/set/${cacheKey}/${enc}?ex=3600`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    }

    // Extract strikes matching expiry + optionType from token map keys
    // Kite format: NTPC26MAR380CE — extract expiry date from symbol name
    const suffix = optionType; // CE or PE
    const strikes = [];
    for (const sym of Object.keys(tokenMap)) {
      if (!sym.endsWith(suffix)) continue;
      // Parse strike number: remove underlying prefix + expiry part (YYMMM or YYMMDD) + suffix
      const m = sym.match(/^[A-Z&]+(\d{2})([A-Z]{3})(\d+)(CE|PE)$/);
      if (!m) continue;
      const symYY = m[1], symMMM = m[2], strike = parseInt(m[3]);
      // Check expiry matches: compare YY+MMM with our expiry
      const expYY  = String(expiry.getFullYear()).slice(-2);
      const expMMM = expiry.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      if (symYY === expYY && symMMM === expMMM && !isNaN(strike)) {
        strikes.push(strike);
      }
    }
    return strikes.length ? strikes.sort((a, b) => a - b) : null;
  } catch { return null; }
}

// Find nearest valid strike from a sorted list of strikes
function nearestStrike(strikes, target) {
  let best = strikes[0], bestDist = Math.abs(strikes[0] - target);
  for (const s of strikes) {
    const d = Math.abs(s - target);
    if (d < bestDist) { best = s; bestDist = d; }
  }
  return best;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const price = parseFloat(searchParams.get('price') || '0');
    const optionType = searchParams.get('type')?.toUpperCase(); // CE or PE
    const expiryType = searchParams.get('expiryType'); // 'weekly' or 'monthly' for NIFTY

    if (!symbol || !optionType) {
      return NextResponse.json({ error: 'Missing symbol or type' }, { status: 400 });
    }
    
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite not authenticated' }, { status: 401 });
    }
    
    // Get expiry first — needed for NFO strike validation
    const now = new Date();
    let expiry, kiteSymbol, tvExpiryDate;
    if (symbol.toUpperCase() === 'NIFTY') {
      if (expiryType === 'monthly') {
        expiry = getLastTuesdayOfMonth(now);
        tvExpiryDate = expiry;
      } else {
        expiry = getLastTuesdayOfWeek(now);
        tvExpiryDate = expiry;
      }
    } else {
      expiry = getNextExpiry(symbol, now);
      tvExpiryDate = getLastTuesdayOfMonth(now);
    }

    // Calculate ATM strike — then validate against real NFO strikes to avoid invalid strikes
    const step = getStrikeStep(symbol, price);
    let atmStrike = optionType === 'CE'
      ? Math.ceil(price / step) * step
      : Math.floor(price / step) * step;

    // For non-index stocks, snap to nearest real strike from NFO instruments
    if (!INDICES.includes(symbol.toUpperCase())) {
      const validStrikes = await getValidStrikes(symbol, expiry, optionType, dp);
      if (validStrikes?.length) atmStrike = nearestStrike(validStrikes, price);
    }

    kiteSymbol = buildKiteOptionSymbol(symbol, atmStrike, optionType, expiry);

    // Get LTP for the option
    let ltp = 0;
    let ltpError = null;

    try {
      const kiteData = await dp.getLTP('NFO:' + kiteSymbol);
      const key = `NFO:${kiteSymbol}`;
      ltp = kiteData.data?.[key]?.last_price || 0;
    } catch (e) {
      ltpError = e.message || 'LTP fetch failed';
      console.error(`LTP error for ${kiteSymbol}:`, ltpError);
    }


    // Build TradingView format symbol: SYMBOL + YYMMDD + C/P + STRIKE
    // NIFTY: last Tuesday of week (weekly expiry)
    // All other stocks: last Tuesday of month (monthly expiry)
    function getLastTuesdayOfWeek(date = new Date()) {
      // Find last Tuesday of this week (Mon-Sun)
      const d = new Date(date);
      const day = d.getDay();
      // If today is after Tuesday, go back to this week's Tuesday
      if (day > 2) {
        d.setDate(d.getDate() - (day - 2));
      } else if (day < 2) {
        // If before Tuesday, go back to previous week's Tuesday
        d.setDate(d.getDate() - (7 - (2 - day)));
      }
      // If today is Tuesday, stays same
      return d;
    }
    function getLastTuesdayOfMonth(date = new Date()) {
      const year = date.getFullYear();
      const month = date.getMonth();
      let d = new Date(year, month + 1, 0);
      while (d.getDay() !== 2) {
        d.setDate(d.getDate() - 1);
      }
      return d;
    }
    function getExpiryYYMMDD(expiryDate) {
      const yy = String(expiryDate.getFullYear() % 100).padStart(2, '0');
      const mm = String(expiryDate.getMonth() + 1).padStart(2, '0');
      const dd = String(expiryDate.getDate()).padStart(2, '0');
      return `${yy}${mm}${dd}`;
    }
    const tvExpiry = getExpiryYYMMDD(tvExpiryDate);
    const tvOptType = optionType === 'CE' ? 'C' : 'P';
    const tvSymbol = `${symbol}${tvExpiry}${tvOptType}${atmStrike}`;

    // Compute prob of expiring worthless (probOTM) via Black-Scholes
    let probOTM = null;
    if (ltp > 0 && price > 0) {
      // Expiry date has no time component — default is midnight UTC which is 5:30 AM IST,
      // already past by market hours. Pin to 3:30 PM IST (10:00 UTC) so T > 0 on expiry day.
      const expiryClose = new Date(expiry);
      expiryClose.setUTCHours(10, 0, 0, 0);
      const T = Math.max(0, (expiryClose.getTime() - Date.now()) / (365 * 24 * 3600 * 1000));
      if (T > 0) {
        const isCall = optionType === 'CE';
        const iv = computeIV(ltp, price, atmStrike, T, undefined, undefined, isCall);
        if (iv) {
          const greeks = computeGreeks(price, atmStrike, T, undefined, undefined, iv, isCall);
          probOTM = greeks ? parseFloat((greeks.probOTM * 100).toFixed(1)) : null;
        }
      }
    }

    return NextResponse.json({
      symbol,
      optionSymbol: kiteSymbol,      // Kite format for orders: TCS26FEB2950CE
      tvSymbol: tvSymbol,            // TradingView format for charts: NIFTY260217C25500
      exchange: 'NFO',
      strike: atmStrike,
      optionType,
      ltp,
      ltpError,
      expiry: expiry.toISOString(),
      expiryDay: expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      step,
      probOTM,  // % probability option expires worthless (out of the money)
    });
    
  } catch (error) {
    console.error('Option LTP error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
