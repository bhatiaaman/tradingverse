import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';
import { resolveToken } from '../order-intelligence/lib/resolve-token';
import { getSector } from '../order-intelligence/lib/sector-map';

// ── IST helpers ───────────────────────────────────────────────────────────────
const IST_OFFSET_MS = 330 * 60 * 1000;
function nowIST() { return new Date(Date.now() + IST_OFFSET_MS); }
function todayISTStr() { return nowIST().toISOString().slice(0, 10); }

// ── ORB from 15-min candles ───────────────────────────────────────────────────
async function getORB(token) {
  const dp = await getDataProvider();
  const today = todayISTStr();
  const from  = `${today} 09:15:00`;
  const to    = `${today} 15:30:00`;

  let candles;
  try {
    candles = await dp.getHistoricalData(token, '15minute', from, to);
  } catch { return null; }

  if (!candles?.length) return null;

  const or = candles[0]; // 9:15–9:30 candle
  const orHigh = or.high;
  const orLow  = or.low;
  const orVol  = or.volume || 1;

  if (candles.length === 1) {
    return { orHigh, orLow, status: 'INSIDE_OR', volumeRatio: null };
  }

  // Find first candle that cleanly broke OR
  let breakDir = null;
  let breakVolumeRatio = null;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const volRatio = c.volume / orVol;
    if (c.close > orHigh) {
      breakDir = 'UP';
      breakVolumeRatio = parseFloat(volRatio.toFixed(1));
      break;
    }
    if (c.close < orLow) {
      breakDir = 'DOWN';
      breakVolumeRatio = parseFloat(volRatio.toFixed(1));
      break;
    }
  }

  // Current position
  const latest = candles[candles.length - 1];
  let status;
  if (breakDir === 'UP')   status = 'BROKE_UP';
  else if (breakDir === 'DOWN') status = 'BROKE_DOWN';
  else if (latest.close > orHigh) status = 'ABOVE_OR';
  else if (latest.close < orLow)  status = 'BELOW_OR';
  else                             status = 'INSIDE_OR';

  return {
    orHigh: parseFloat(orHigh.toFixed(2)),
    orLow:  parseFloat(orLow.toFixed(2)),
    status,
    volumeRatio: breakVolumeRatio,
  };
}

// ── Sector performance fetch ──────────────────────────────────────────────────
async function getSectorPerformance(sectorName) {
  if (!sectorName) return null;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res  = await fetch(`${baseUrl}/api/sector-performance`, { cache: 'no-store' });
    const data = await res.json();
    const sector = data.sectors?.find(s => s.name === sectorName);
    if (!sector) return null;
    return { name: sectorName, changePct: parseFloat(sector.value?.toFixed(2)) };
  } catch { return null; }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const { symbol } = await request.json();
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    // Resolve token + sector in parallel
    const sectorName = getSector(symbol);
    const [token, sectorData] = await Promise.all([
      resolveToken(symbol),
      getSectorPerformance(sectorName),
    ]);

    const orb = token ? await getORB(token) : null;

    return NextResponse.json({
      symbol,
      orb,
      sector: sectorData,
    });
  } catch (err) {
    console.error('stock-context error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
