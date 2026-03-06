// app/api/clear-cache/route.js
import { NextResponse } from 'next/server';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS = process.env.REDIS_NAMESPACE || 'default';

export async function GET() {
  try {
    const CACHE_KEY = `${NS}:market-data`;
    await fetch(`${REDIS_URL}/del/${CACHE_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    
    return NextResponse.json({ 
      success: true, 
      message: 'Market data cache cleared successfully. Next request will fetch fresh data.',
      clearedKey: CACHE_KEY,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
}