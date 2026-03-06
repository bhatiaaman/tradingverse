import { NextResponse } from 'next/server';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS = process.env.REDIS_NAMESPACE || 'default';

function key(name) {
  return `${NS}:kite:${name}`;
}

async function redisGet(k) {
  const res = await fetch(`${REDIS_URL}/get/${k}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result ?? null;
}

async function redisSet(k, value) {
  const res = await fetch(`${REDIS_URL}/set/${k}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result === 'OK';
}

async function redisDel(k) {
  const res = await fetch(`${REDIS_URL}/del/${k}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result >= 0;
}

async function validateAccessToken(apiKey, accessToken) {
  if (!apiKey || !accessToken) return false;
  try {
    const response = await fetch('https://api.kite.trade/user/profile', {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

export async function GET() {
  try {
    const redisApiKey      = await redisGet(key('api_key'));
    const redisAccessToken = await redisGet(key('access_token'));
    const disconnected     = await redisGet(key('disconnected'));

    const apiKey = redisApiKey || process.env.KITE_API_KEY || '';

    const accessToken = (disconnected === '1')
      ? ''
      : (redisAccessToken || process.env.KITE_ACCESS_TOKEN || '');

    const tokenValid = await validateAccessToken(apiKey, accessToken);

    return NextResponse.json({
      success: true,
      config: { apiKey },
      tokenValid,
      hasApiSecretInEnv: !!(process.env.KITE_SECRET || process.env.KITE_API_SECRET),
    });
  } catch (error) {
    console.error('kite-config GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { apiKey, accessToken } = body;

    if (apiKey !== undefined) {
      if (apiKey === '') {
        await redisDel(key('api_key'));
      } else {
        await redisSet(key('api_key'), apiKey);
      }
    }

    if (accessToken !== undefined) {
      if (accessToken === '') {
        await redisDel(key('access_token'));
        await redisSet(key('disconnected'), '1');
      } else {
        await redisSet(key('access_token'), accessToken);
        await redisDel(key('disconnected'));
      }
    }

    if (apiKey === undefined && accessToken === undefined) {
      return NextResponse.json({ success: false, error: 'No valid updates provided' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Config saved successfully' });
  } catch (error) {
    console.error('kite-config POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}