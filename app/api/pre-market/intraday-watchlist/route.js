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

function getTodayKey() {
  const istTime = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  return `${NS}:pre-market:intraday-watchlist:${istTime.toISOString().split('T')[0]}`;
}

export async function GET() {
  const dateKey = getTodayKey();
  const data = await redisGet(dateKey) || [];
  return NextResponse.json({ success: true, data });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const dateKey = getTodayKey();
    let currentData = [];
    
    if (body.action === 'append') {
      currentData = await redisGet(dateKey) || [];
    }
    
    // De-duplicate appended stocks by symbol
    const finalData = body.action === 'append' ? [...currentData, ...body.data] : body.data;
    const uniqueDict = {};
    for (const item of finalData) {
      if (item.symbol) uniqueDict[item.symbol] = item;
    }
    const filteredArray = Object.values(uniqueDict);

    const ok = await redisSet(dateKey, filteredArray);
    
    return NextResponse.json({ 
      success: ok, 
      data: filteredArray 
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
