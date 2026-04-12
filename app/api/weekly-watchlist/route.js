import { NextResponse } from 'next/server';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const CACHE_KEY   = `${NS}:weekly-watchlist`;

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value) {
  try {
    const enc = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${key}/${enc}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
  } catch (err) {
    console.error("Redis Set Error:", err);
  }
}

export async function GET() {
  let data = await redisGet(CACHE_KEY);
  
  // Migrate legacy array to object structure
  if (Array.isArray(data)) {
    data = { aiResearch: data, expertsResearch: [], chartink: [] };
    await redisSet(CACHE_KEY, data);
  }

  return NextResponse.json({ 
    watchlist: data || {
      aiResearch: [],
      expertsResearch: [],
      chartink: []
    } 
  });
}

export async function POST(request) {
  try {
    const { tab, list } = await request.json();
    
    if (!['aiResearch', 'expertsResearch', 'chartink'].includes(tab)) {
      return NextResponse.json({ error: "Invalid tab specified." }, { status: 400 });
    }
    if (!Array.isArray(list)) {
      return NextResponse.json({ error: "Invalid data format. Expected an array." }, { status: 400 });
    }

    let currentData = await redisGet(CACHE_KEY);
    
    // Migrate legacy array before mutating
    if (Array.isArray(currentData)) {
      currentData = { aiResearch: currentData, expertsResearch: [], chartink: [] };
    }
    
    if (!currentData) {
      currentData = { aiResearch: [], expertsResearch: [], chartink: [] };
    }
    
    // Update the specific tab entirely
    currentData[tab] = list;
    
    await redisSet(CACHE_KEY, currentData);
    
    return NextResponse.json({ success: true, watchlist: currentData });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
