import { NextResponse } from 'next/server';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS = process.env.REDIS_NAMESPACE || 'default';

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (err) {
    console.error('Redis GET error:', err);
    return null;
  }
}

async function redisSet(key, value) {
  try {
    const res = await fetch(`${REDIS_URL}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch (err) {
    console.error('Redis SET error:', err);
    return false;
  }
}

function getTradingDateKey() {
  const istTime = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const hours   = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();

  // After 15:30 IST → stocks are for the NEXT trading day
  if (hours > 15 || (hours === 15 && minutes >= 30)) {
    const nextDay = new Date(istTime);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return `${NS}:pre-market:intraday-watchlist:${nextDay.toISOString().split('T')[0]}`;
  }

  return `${NS}:pre-market:intraday-watchlist:${istTime.toISOString().split('T')[0]}`;
}

export async function GET() {
  const dateKey = getTradingDateKey();
  let data = await redisGet(dateKey);

  // Migrate legacy array to object structure
  if (Array.isArray(data)) {
    data = { aiBreakouts: data, expertBreakouts: [] };
    await redisSet(dateKey, data);
  }

  if (!data) {
    data = { aiBreakouts: [], expertBreakouts: [] };
  }

  return NextResponse.json({ success: true, data });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { tab, list } = body;

    if (!['aiBreakouts', 'expertBreakouts'].includes(tab)) {
      return NextResponse.json({ success: false, error: "Invalid tab specified." }, { status: 400 });
    }
    if (!Array.isArray(list)) {
      return NextResponse.json({ success: false, error: "Invalid data format. Expected an array." }, { status: 400 });
    }

    const dateKey = getTradingDateKey();
    let currentData = await redisGet(dateKey);

    // Migrate legacy array
    if (Array.isArray(currentData)) {
      currentData = { aiBreakouts: currentData, expertBreakouts: [] };
    }
    if (!currentData) {
      currentData = { aiBreakouts: [], expertBreakouts: [] };
    }

    // Stamp uppercase symbols securely
    const stampedList = list.map(s => ({
      ...s,
      symbol: (s.symbol || '').toUpperCase().trim()
    })).filter(s => s.symbol);

    // Update the specific tab entirely
    currentData[tab] = stampedList;
    
    const ok = await redisSet(dateKey, currentData);
    
    return NextResponse.json({ 
      success: ok, 
      data: currentData 
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
