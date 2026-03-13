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
      // Fetch last 2 days of 5-min candles then filter to today's session
      const toDate   = getIST();
      const fromDate = getIST(-2);
      const raw      = await dp.getHistoricalData(cfg.token, '5minute', fmtDate(fromDate), fmtDate(toDate));

      if (!raw?.length) return NextResponse.json({ error: 'No candle data' }, { status: 503 });

      // Filter to today's IST session 09:15 – 15:30
      const todayStr = getIST().toISOString().slice(0, 10);
      const candles  = raw
        .filter(c => {
          const ist     = new Date(new Date(c.date).getTime() + (new Date(c.date).getTimezoneOffset() + 330) * 60000);
          const dateStr = ist.toISOString().slice(0, 10);
          const mins    = ist.getUTCHours() * 60 + ist.getUTCMinutes();
          return dateStr === todayStr && mins >= 555 && mins <= 930; // 9:15–15:30
        })
        .map(c => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));

      const result   = detectIntradayRegime(candles);
      const timeline = await updateTimeline(symbol, result.regime, result.confidence);

      const response = {
        ...result,
        symbol, symbolName: cfg.name,
        type: 'intraday',
        timeline,
        timestamp: new Date().toISOString(),
      };
      await redisSet(cacheKey, response, 300); // 5-min cache
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
