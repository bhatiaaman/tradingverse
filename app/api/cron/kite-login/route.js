import { NextResponse } from 'next/server';
import { TOTP } from 'totp-generator';
import { kiteRedisGet } from '@/app/lib/providers/kite/kite-redis';
import { KiteBroker } from '@/app/lib/providers/kite/KiteBroker';
import { invalidateCredentialsCache } from '@/app/lib/kite-credentials';

export async function GET(request) {
  // 1. Security Check: Validate Cron Trigger
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 2. Validate Auto Login is Enabled
    const autoLogin = await kiteRedisGet('auto_login');
    if (autoLogin !== '1') {
      return NextResponse.json({ success: false, message: 'Auto-login is disabled in settings.' });
    }

    const { KITE_USER_ID, KITE_PASSWORD, KITE_TOTP_SECRET, KITE_API_KEY, KITE_API_SECRET, KITE_SECRET } = process.env;
    const apiKey = (await kiteRedisGet('api_key')) || KITE_API_KEY;
    const secret = KITE_SECRET || KITE_API_SECRET;

    if (!KITE_USER_ID || !KITE_PASSWORD || !KITE_TOTP_SECRET || !apiKey || !secret) {
      return NextResponse.json({ success: false, message: 'Missing environment credentials for Auto-Login.' }, { status: 400 });
    }

    // 3. Phase 1: Login Request
    const loginParams = new URLSearchParams();
    loginParams.append('user_id', KITE_USER_ID);
    loginParams.append('password', KITE_PASSWORD);

    let activeCookies = [];

    const loginRes = await fetch('https://kite.zerodha.com/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0'
      },
      body: loginParams.toString()
    });

    const loginJson = await loginRes.json();
    if (loginJson.status !== 'success' || !loginJson.data?.request_id) {
      console.error('[CRON LOGIN] Login Failed:', loginJson);
      return NextResponse.json({ success: false, message: 'Phase 1 internal login failed.' });
    }

    const requestId = loginJson.data.request_id;
    
    // Parse cookies safely
    if (loginRes.headers.getSetCookie) {
      const loginCookies = loginRes.headers.getSetCookie();
      activeCookies.push(...loginCookies.map(c => c.split(';')[0]));
    }

    // 4. Phase 2: Generate TOTP & Submit 2FA
    const { otp: totpCode } = await TOTP.generate(KITE_TOTP_SECRET);
    const twofaParams = new URLSearchParams();
    twofaParams.append('user_id', KITE_USER_ID);
    twofaParams.append('request_id', requestId);
    twofaParams.append('twofa_value', totpCode);
    twofaParams.append('twofa_type', 'totp');
    twofaParams.append('skip_session', '');

    const twofaRes = await fetch('https://kite.zerodha.com/api/twofa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Cookie': activeCookies.join('; ')
      },
      body: twofaParams.toString()
    });

    const twofaJson = await twofaRes.json();
    if (twofaJson.status !== 'success') {
      console.error('[CRON LOGIN] 2FA Failed:', twofaJson);
      return NextResponse.json({ success: false, message: 'Phase 2 TOTP authentication failed.' });
    }

    if (twofaRes.headers.getSetCookie) {
      const authCookies = twofaRes.headers.getSetCookie();
      activeCookies.push(...authCookies.map(c => c.split(';')[0]));
    }

    // 5. Phase 3: OAuth Redirection
    const redirectUrl = `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3`;
    const connectRes = await fetch(redirectUrl, {
      method: 'GET',
      headers: {
        'Cookie': activeCookies.join('; '),
        'User-Agent': 'Mozilla/5.0'
      },
      redirect: 'manual' // Catch the 302
    });

    let locationParams = connectRes.headers.get('location');

    // Check if Zerodha needs us to bridge across /connect/finish to validate the session ID
    if (locationParams && locationParams.includes('/connect/finish')) {
      const hopRes = await fetch(locationParams, {
        method: 'GET',
        headers: {
          'Cookie': activeCookies.join('; '),
          'User-Agent': 'Mozilla/5.0'
        },
        redirect: 'manual'
      });
      locationParams = hopRes.headers.get('location');
    }

    if (!locationParams) {
      return NextResponse.json({ success: false, message: 'Phase 3 missing location header param.', rawStatus: connectRes.status });
    }

    // Extract request_token from the redirected URL
    const urlParts = new URL(locationParams);
    const requestToken = urlParts.searchParams.get('request_token');

    if (!requestToken) {
      console.error('[CRON LOGIN] Redirect URL missed token:', locationParams);
      return NextResponse.json({ success: false, message: 'Phase 3 failed to extract request token from redirect url.', receivedLocation: locationParams });
    }

    // 6. Phase 4: Final Token Exchange
    const tokenData = await KiteBroker.exchangeRequestToken({
      requestToken,
      apiKey,
      apiSecret: secret,
    });

    if (tokenData.status === 'success' && tokenData.data?.access_token) {
      const accessToken = tokenData.data.access_token;
      await KiteBroker.saveAccessToken(accessToken);
      invalidateCredentialsCache();
      
      console.log('[CRON LOGIN] Daily Auto-Login Succeeded!');
      return NextResponse.json({ success: true, message: 'Auto-Login sequence completed perfectly.', time: new Date() });
    } else {
      console.error('[CRON LOGIN] Error in final exchange Phase 4:', tokenData);
      return NextResponse.json({ success: false, message: 'Phase 4 final request_token exchange failed.' });
    }

  } catch (error) {
    console.error('[CRON LOGIN] Fatal error:', error);
    return NextResponse.json({ success: false, message: 'Fatal server logic error occurred.', error: error.message }, { status: 500 });
  }
}
