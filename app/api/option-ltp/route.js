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
  // First check our NSE strike steps data (from CSV)
  if (nseStrikeSteps[symbol]) {
    return nseStrikeSteps[symbol];
  }
  
  // Fallback for indices or unknown symbols - price-based heuristic
  const p = Number(price) || 0;
  if (p >= 5000) return 50;
  if (p >= 1000) return 20;
  if (p >= 500) return 10;
  if (p >= 100) return 5;
  return 2.5;
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
    
    // Calculate ATM strike
    const step = getStrikeStep(symbol, price);
    const atmStrike = optionType === 'CE' 
      ? Math.ceil(price / step) * step 
      : Math.floor(price / step) * step;
    
    // Get expiry for Kite and TradingView
    const now = new Date();
    let expiry, kiteSymbol, tvExpiryDate;
    if (symbol.toUpperCase() === 'NIFTY') {
      if (expiryType === 'monthly') {
        expiry = getLastTuesdayOfMonth(now);
        tvExpiryDate = expiry;
      } else {
        // default to weekly
        expiry = getLastTuesdayOfWeek(now);
        tvExpiryDate = expiry;
      }
    } else {
      expiry = getNextExpiry(symbol, now);
      tvExpiryDate = getLastTuesdayOfMonth(now);
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
