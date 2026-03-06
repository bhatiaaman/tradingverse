import { NextResponse } from 'next/server';
import crypto from 'crypto';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS = process.env.REDIS_NAMESPACE || 'default';

function nsKey(name) { return `${NS}:kite:${name}`; }

async function redisGet(key) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ?? null;
  } catch { return null; }
}

async function redisSet(key, value) {
  const res = await fetch(`${REDIS_URL}/set/${key}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result === 'OK';
}

async function redisDel(key) {
  const res = await fetch(`${REDIS_URL}/del/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result >= 0;
}

export async function POST(request) {
  try {
    const { requestToken, apiSecret, useEnvSecret } = await request.json();

    // Debug logging
    console.log('[Kite Token] Request received:', {
      hasRequestToken: !!requestToken,
      requestTokenLength: requestToken?.length || 0,
      useEnvSecret,
      hasApiSecretInRequest: !!apiSecret,
      apiSecretLength: apiSecret?.length || 0,
    });

    if (!requestToken) {
      return NextResponse.json({ success: false, error: 'Request token is required' }, { status: 400 });
    }

    // Read API key from Redis first, fall back to process.env
    const apiKey = (await redisGet(nsKey('api_key'))) || process.env.KITE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key must be configured first' }, { status: 400 });
    }

    // Get secret from request or process.env
    // Try multiple env var names and trim whitespace
    let secretToUse;
    if (useEnvSecret) {
      secretToUse = process.env.KITE_SECRET 
        || process.env.KITE_API_SECRET 
        || process.env.NEXT_PUBLIC_KITE_SECRET; // Some users might use this
      
      // Trim whitespace if present
      if (secretToUse) {
        secretToUse = secretToUse.trim();
      }
    } else {
      secretToUse = apiSecret?.trim();
    }

    // Check if we actually got a secret
    if (!secretToUse || secretToUse.length === 0) {
      return NextResponse.json({
        success: false,
        error: useEnvSecret
          ? 'API Secret not found in environment variables (KITE_SECRET or KITE_API_SECRET)'
          : 'API Secret is required',
      }, { status: 400 });
    }

    // SHA256(api_key + request_token + api_secret)
    const checksum = crypto
      .createHash('sha256')
      .update(apiKey + requestToken + secretToUse)
      .digest('hex');

    const response = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3',
      },
      body: new URLSearchParams({
        api_key: apiKey,
        request_token: requestToken,
        checksum,
      }),
    });

    const data = await response.json();

    if (data.status === 'success' && data.data?.access_token) {
      const accessToken = data.data.access_token;

      // Save token to Redis and clear disconnected flag
      const saved = await redisSet(nsKey('access_token'), accessToken);
      await redisDel(nsKey('disconnected'));

      return NextResponse.json({
        success: true,
        accessToken,
        user: data.data.user_name || data.data.user_id,
        message: saved ? 'Access token saved successfully' : 'Token generated but could not be saved',
      });
    } else {
      return NextResponse.json({
        success: false,
        error: data.message || 'Failed to get access token',
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}