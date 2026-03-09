import { NextResponse } from 'next/server';
import { KiteBroker } from '@/app/lib/providers/kite/KiteBroker.js';
import { kiteRedisGet } from '@/app/lib/providers/kite/kite-redis.js';
import { invalidateCredentialsCache } from '@/app/lib/kite-credentials';
import { requireSession, unauthorized } from '@/app/lib/session';

export async function GET() {
  if (!await requireSession()) return unauthorized();

  try {
    const [redisApiKey, redisAccessToken, disconnected] = await Promise.all([
      kiteRedisGet('api_key'),
      kiteRedisGet('access_token'),
      kiteRedisGet('disconnected'),
    ]);

    const apiKey = redisApiKey || process.env.KITE_API_KEY || '';

    const accessToken = (disconnected === '1')
      ? ''
      : (redisAccessToken || process.env.KITE_ACCESS_TOKEN || '');

    const tokenValid = await KiteBroker.getConnectionStatus(apiKey, accessToken);

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
  if (!await requireSession()) return unauthorized();

  try {
    const body = await request.json();
    const { apiKey, accessToken } = body;

    if (apiKey !== undefined) {
      await KiteBroker.saveApiKey(apiKey);
    }

    if (accessToken !== undefined) {
      await KiteBroker.saveAccessToken(accessToken);
    }

    if (apiKey === undefined && accessToken === undefined) {
      return NextResponse.json({ success: false, error: 'No valid updates provided' }, { status: 400 });
    }

    invalidateCredentialsCache();

    return NextResponse.json({ success: true, message: 'Config saved successfully' });
  } catch (error) {
    console.error('kite-config POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
