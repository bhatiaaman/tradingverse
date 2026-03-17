import { NextResponse }        from 'next/server';
import { getDataProvider }     from '@/app/lib/providers';
import { detectIntradayRegime } from './intraday.js';
import { detectSwingPhase }     from './swing.js';

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

// ── IST helpers ───────────────────────────────────────────────────────────────
function getIST(offsetDays = 0) {
  const now = new Date();
  const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000);
  if (offsetDays) ist.setDate(ist.getDate() + offsetDays);
  return ist;
}

function fmtDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

const SYMBOLS = {
  NIFTY:     { token: 256265,  name: 'NIFTY 50'   },
  BANKNIFTY: { token: 260105,  name: 'BANK NIFTY' },
};

const OI_CONFIG = {
  NIFTY:     { spotSymbol: 'NIFTY 50',   name: 'NIFTY',     strikeGap: 50  },
  BANKNIFTY: { spotSymbol: 'NIFTY BANK', name: 'BANKNIFTY', strikeGap: 100 },
};
const NFO_INSTRUMENTS_KEY = `${NS}:nfo-instruments-all`; // shared cache with option-chain route

// Fetch ATM ± 5 strikes PCR for NIFTY or BANKNIFTY — lightweight OI snapshot
async function fetchPCRData(symbol, dp) {
  try {
    const cfg = OI_CONFIG[symbol];
    if (!cfg) return null;

    // Use shared instruments cache (populated by option-chain route; fall back to fresh fetch)
    let instruments = await redisGet(NFO_INSTRUMENTS_KEY);
    if (!instruments) {
      const csvText = await dp.getInstrumentsCSV('NFO');
      const lines   = csvText.trim().split('\n');
      const headers = lines[0].split(',');
      const tsIdx     = headers.indexOf('tradingsymbol');
      const nameIdx   = headers.indexOf('name');
      const expiryIdx = headers.indexOf('expiry');
      const strikeIdx = headers.indexOf('strike');
      const typeIdx   = headers.indexOf('instrument_type');
      instruments = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const name = cols[nameIdx]?.replace(/"/g, '').trim();
        const type = cols[typeIdx]?.replace(/"/g, '').trim();
        if ((name === 'NIFTY' || name === 'BANKNIFTY') && (type === 'CE' || type === 'PE')) {
          instruments.push({
            tradingsymbol:   cols[tsIdx]?.replace(/"/g, '').trim(),
            name,
            expiry:          cols[expiryIdx]?.replace(/"/g, '').trim() || '',
            strike:          parseFloat(cols[strikeIdx]) || 0,
            instrument_type: type,
          });
        }
      }
      await redisSet(NFO_INSTRUMENTS_KEY, instruments, 7200);
    }

    // Spot price for ATM strike
    const spotData   = await dp.getOHLC([`NSE:${cfg.spotSymbol}`]);
    const spotPrice  = spotData[`NSE:${cfg.spotSymbol}`]?.last_price;
    if (!spotPrice) return null;

    // Near weekly expiry
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiries = [...new Set(instruments.filter(o => o.name === cfg.name).map(o => o.expiry))]
      .filter(exp => new Date(exp) >= today)
      .sort((a, b) => new Date(a) - new Date(b));
    const weeklyExpiry = expiries[0];
    if (!weeklyExpiry) return null;

    // ATM ± 5 strikes
    const atm    = Math.round(spotPrice / cfg.strikeGap) * cfg.strikeGap;
    const relevant = instruments.filter(o =>
      o.name === cfg.name &&
      String(o.expiry) === String(weeklyExpiry) &&
      o.strike >= atm - 5 * cfg.strikeGap &&
      o.strike <= atm + 5 * cfg.strikeGap
    );
    if (relevant.length === 0) return null;

    const quotes = await dp.getQuote(relevant.map(o => `NFO:${o.tradingsymbol}`));
    let totalCallOI = 0, totalPutOI = 0;
    for (const o of relevant) {
      const q = quotes[`NFO:${o.tradingsymbol}`];
      if (!q) continue;
      if (o.instrument_type === 'CE') totalCallOI += (q.oi || 0);
      else                             totalPutOI  += (q.oi || 0);
    }
    const pcr = totalCallOI > 0 ? parseFloat((totalPutOI / totalCallOI).toFixed(2)) : null;
    return { pcr, totalCallOI, totalPutOI };
  } catch (e) {
    console.error('[regime] PCR fetch failed:', e.message);
    return null;
  }
}

// ── Keep a daily regime-change timeline in Redis ──────────────────────────────
async function updateTimeline(symbol, regime, confidence) {
  const today    = getIST().toISOString().slice(0, 10);
  const key      = `${NS}:regime:${symbol}:timeline:${today}`;
  let   timeline = await redisGet(key) || [];
  const last     = timeline[timeline.length - 1];
  if (!last || last.regime !== regime) {
    timeline.push({ time: new Date().toISOString(), regime, confidence });
    if (timeline.length > 20) timeline = timeline.slice(-20);
    await redisSet(key, timeline, 86400); // 24 h
  }
  return timeline;
}

export async function POST(request) {
  const body   = await request.json().catch(() => ({}));
  const symbol = (body.symbol || 'NIFTY').toUpperCase();
  const type   = body.type   || 'intraday'; // 'intraday' | 'swing'

  const cfg = SYMBOLS[symbol];
  if (!cfg) return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 400 });

  // ── Cache check ────────────────────────────────────────────────────────────
  const cacheKey = `${NS}:regime:${symbol}:${type}`;
  const cached   = await redisGet(cacheKey);
  if (cached)    return NextResponse.json({ ...cached, fromCache: true });

  // ── Data provider ──────────────────────────────────────────────────────────
  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) {
      return NextResponse.json({ error: 'Kite disconnected' }, { status: 503 });
    }

    if (type === 'intraday') {
      // Fetch candles + PCR in parallel
      const toDate   = getIST();
      const fromDate = getIST(-2);
      const [raw, pcrData] = await Promise.all([
        dp.getHistoricalData(cfg.token, '5minute', fmtDate(fromDate), fmtDate(toDate)),
        fetchPCRData(symbol, dp).catch(() => null), // never block regime on PCR failure
      ]);

      if (!raw?.length) return NextResponse.json({ error: 'No candle data' }, { status: 503 });

      // Filter to today's IST session 09:15 – 15:30
      // Always add fixed +330 min from UTC — Kite dates are UTC internally (parsed from ISO +0530 string).
      // Using server's getTimezoneOffset() breaks on IST servers (offset = -330, cancels out).
      const IST_OFFSET_MS = 330 * 60 * 1000;
      const todayStr = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
      const candles  = raw
        .filter(c => {
          const ist     = new Date(new Date(c.date).getTime() + IST_OFFSET_MS);
          const dateStr = ist.toISOString().slice(0, 10);
          const mins    = ist.getUTCHours() * 60 + ist.getUTCMinutes();
          return dateStr === todayStr && mins >= 555 && mins <= 930; // 9:15–15:30
        })
        .map(c => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));

      // Session-open PCR snapshot for delta tracking (store on first call of the day)
      let pcrAtOpen = null;
      if (pcrData?.pcr != null) {
        const openKey = `${NS}:regime:${symbol}:pcr-open:${todayStr}`;
        pcrAtOpen = await redisGet(openKey);
        if (pcrAtOpen == null) {
          pcrAtOpen = pcrData.pcr;
          await redisSet(openKey, pcrAtOpen, 86400); // expire end of day
        }
      }

      const oiData = pcrData ? { ...pcrData, pcrAtOpen } : null;
      const result   = detectIntradayRegime(candles, oiData);
      const timeline = await updateTimeline(symbol, result.regime, result.confidence);

      const response = {
        ...result,
        symbol, symbolName: cfg.name,
        type: 'intraday',
        timeline,
        timestamp: new Date().toISOString(),
      };
      // 90s during market hours (regime can change rapidly at OR breaks), 5 min off-hours
      const ist = new Date(Date.now() + 330 * 60 * 1000);
      const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      const cacheTTL = (mins >= 555 && mins <= 930) ? 90 : 300;
      await redisSet(cacheKey, response, cacheTTL);
      return NextResponse.json(response);
    }

    if (type === 'swing') {
      const toDate   = getIST();
      const fromDate = getIST(-90);
      const raw      = await dp.getHistoricalData(cfg.token, 'day', fmtDate(fromDate), fmtDate(toDate));

      if (!raw?.length) return NextResponse.json({ error: 'No candle data' }, { status: 503 });

      const candles  = raw.map(c => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
      const result   = detectSwingPhase(candles);

      const response = {
        ...result,
        symbol, symbolName: cfg.name,
        type: 'swing',
        timestamp: new Date().toISOString(),
      };
      await redisSet(cacheKey, response, 3600); // 1-hour cache
      return NextResponse.json(response);
    }

    return NextResponse.json({ error: 'type must be intraday or swing' }, { status: 400 });

  } catch (err) {
    const isAuth = /api_key|access_token|invalid.*token|unauthorized/i.test(err.message);
    if (!isAuth) console.error('[market-regime]', err.message);
    return NextResponse.json({ error: isAuth ? 'Kite disconnected' : err.message }, { status: 500 });
  }
}
