import { NextResponse } from 'next/server';
import { KiteBroker } from '@/app/lib/providers/kite/KiteBroker.js';
import { kiteRedisGet } from '@/app/lib/providers/kite/kite-redis.js';
import { invalidateCredentialsCache } from '@/app/lib/kite-credentials';
import { requireOwner, unauthorized } from '@/app/lib/session';

export async function POST(request) {
  if (!await requireOwner()) return unauthorized();

  try {
    const { requestToken, apiSecret, useEnvSecret } = await request.json();

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
    const apiKey = (await kiteRedisGet('api_key')) || process.env.KITE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key must be configured first' }, { status: 400 });
    }

    // Get secret from request or process.env
    let secretToUse;
    if (useEnvSecret) {
      secretToUse = process.env.KITE_SECRET
        || process.env.KITE_API_SECRET
        || process.env.NEXT_PUBLIC_KITE_SECRET;
      if (secretToUse) secretToUse = secretToUse.trim();
    } else {
      secretToUse = apiSecret?.trim();
    }

    if (!secretToUse || secretToUse.length === 0) {
      return NextResponse.json({
        success: false,
        error: useEnvSecret
          ? 'API Secret not found in environment variables (KITE_SECRET or KITE_API_SECRET)'
          : 'API Secret is required',
      }, { status: 400 });
    }

    const data = await KiteBroker.exchangeRequestToken({
      requestToken,
      apiKey,
      apiSecret: secretToUse,
    });

    if (data.status === 'success' && data.data?.access_token) {
      const accessToken = data.data.access_token;

      // Save token and clear disconnected flag
      await KiteBroker.saveAccessToken(accessToken);
      invalidateCredentialsCache();

      return NextResponse.json({
        success: true,
        accessToken,
        user: data.data.user_name || data.data.user_id,
        message: 'Access token saved successfully',
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
