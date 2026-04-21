import { NextResponse } from 'next/server';
import { TOTP } from 'totp-generator';
import { kiteRedisGet } from '@/app/lib/providers/kite/kite-redis';
import { KiteBroker } from '@/app/lib/providers/kite/KiteBroker';
import { invalidateCredentialsCache } from '@/app/lib/kite-credentials';
import { requireOwner, unauthorized, serviceUnavailable } from '@/app/lib/session';
import { addSystemLog } from '@/app/lib/logger';

export async function POST() {
  const { session, error } = await requireOwner();
  if (error) return serviceUnavailable(error);
  if (!session) return unauthorized();

  try {
    const { KITE_USER_ID, KITE_PASSWORD, KITE_TOTP_SECRET, KITE_API_KEY, KITE_API_SECRET, KITE_SECRET } = process.env;
    const apiKey = (await kiteRedisGet('api_key')) || KITE_API_KEY;
    const secret = KITE_SECRET || KITE_API_SECRET;

    if (!KITE_USER_ID || !KITE_PASSWORD || !KITE_TOTP_SECRET || !apiKey || !secret) {
      return NextResponse.json({
        success: false,
        message: 'Missing credentials. Ensure KITE_USER_ID, KITE_PASSWORD, KITE_TOTP_SECRET, and API Secret are set in .env.local.',
      }, { status: 400 });
    }

    await addSystemLog({ category: 'system', message: 'Kite manual auto-login started by user.', data: { phase: 'init' } });

    // Phase 1: Username + password login
    const loginParams = new URLSearchParams();
    loginParams.append('user_id', KITE_USER_ID);
    loginParams.append('password', KITE_PASSWORD);

    let activeCookies = [];

    const loginRes = await fetch('https://kite.zerodha.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body: loginParams.toString(),
    });

    const loginJson = await loginRes.json();
    if (loginJson.status !== 'success' || !loginJson.data?.request_id) {
      await addSystemLog({ category: 'error', message: 'Kite manual auto-login Phase 1 failed.', data: { error: loginJson } });
      return NextResponse.json({ success: false, message: 'Phase 1 failed: invalid credentials or Kite login rejected.' });
    }

    const requestId = loginJson.data.request_id;
    if (loginRes.headers.getSetCookie) {
      activeCookies.push(...loginRes.headers.getSetCookie().map(c => c.split(';')[0]));
    }

    // Phase 2: TOTP 2FA
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
        'Cookie': activeCookies.join('; '),
      },
      body: twofaParams.toString(),
    });

    const twofaJson = await twofaRes.json();
    if (twofaJson.status !== 'success') {
      await addSystemLog({ category: 'error', message: 'Kite manual auto-login Phase 2 TOTP failed.', data: { error: twofaJson } });
      return NextResponse.json({ success: false, message: 'Phase 2 failed: TOTP authentication rejected. Check KITE_TOTP_SECRET.' });
    }

    if (twofaRes.headers.getSetCookie) {
      activeCookies.push(...twofaRes.headers.getSetCookie().map(c => c.split(';')[0]));
    }

    // Phase 3: OAuth redirect → extract request_token
    let locationParams = null;
    const connectRes = await fetch(`https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3`, {
      method: 'GET',
      headers: { 'Cookie': activeCookies.join('; '), 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual',
    });
    locationParams = connectRes.headers.get('location');

    if (locationParams?.includes('/connect/finish')) {
      const hopRes = await fetch(locationParams, {
        method: 'GET',
        headers: { 'Cookie': activeCookies.join('; '), 'User-Agent': 'Mozilla/5.0' },
        redirect: 'manual',
      });
      locationParams = hopRes.headers.get('location');
    }

    if (!locationParams) {
      await addSystemLog({ category: 'error', message: 'Kite manual auto-login Phase 3 missing location header.', data: { status: connectRes.status } });
      return NextResponse.json({ success: false, message: 'Phase 3 failed: OAuth redirect did not return a location header.' });
    }

    const requestToken = new URL(locationParams).searchParams.get('request_token');
    if (!requestToken) {
      await addSystemLog({ category: 'error', message: 'Kite manual auto-login Phase 3 missing request_token.', data: { url: locationParams } });
      return NextResponse.json({ success: false, message: 'Phase 3 failed: could not extract request_token from redirect URL.' });
    }

    // Phase 4: Exchange request_token for access_token
    const tokenData = await KiteBroker.exchangeRequestToken({ requestToken, apiKey, apiSecret: secret });

    if (tokenData.status === 'success' && tokenData.data?.access_token) {
      await KiteBroker.saveAccessToken(tokenData.data.access_token);
      invalidateCredentialsCache();
      await addSystemLog({ category: 'system', message: 'Kite manual auto-login succeeded.', data: { status: 'success' } });
      return NextResponse.json({ success: true, message: 'Connected successfully.' });
    }

    await addSystemLog({ category: 'error', message: 'Kite manual auto-login Phase 4 token exchange failed.', data: { error: tokenData } });
    return NextResponse.json({ success: false, message: 'Phase 4 failed: token exchange rejected.' });

  } catch (err) {
    console.error('[KITE AUTO-LOGIN]', err);
    await addSystemLog({ category: 'error', message: 'Kite manual auto-login crashed.', data: { error: err.message } });
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}
