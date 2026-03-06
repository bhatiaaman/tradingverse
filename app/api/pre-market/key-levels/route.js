// app/api/pre-market/key-levels/route.js
import { NextResponse } from 'next/server';
import { getKiteCredentials } from '@/app/lib/kite-credentials';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'NIFTY';

    // Get yesterday's OHLC from Kite
    const { apiKey, accessToken } = await getKiteCredentials();
    
    if (!accessToken) {
      return NextResponse.json({ 
        error: 'Kite not connected. Using fallback data.',
        success: false 
      }, { status: 401 });
    }

    // Determine instrument token
    const instrumentToken = symbol === 'NIFTY' ? 256265 : 260105; // NIFTY / BANKNIFTY

    // Fetch historical data (yesterday's candle)
    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - 5); // Get last 5 days to ensure we have data

    const histUrl = `https://api.kite.trade/instruments/historical/${instrumentToken}/day`;
    const params = new URLSearchParams({
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0],
    });

    const response = await fetch(`${histUrl}?${params}`, {
      headers: {
        'Authorization': `token ${apiKey}:${accessToken}`,
        'X-Kite-Version': '3',
      },
    });

    const data = await response.json();

    if (!data.data?.candles || data.data.candles.length === 0) {
      return NextResponse.json({ error: 'No historical data available' }, { status: 404 });
    }

    // Get last complete daily candle (skip today's incomplete candle if present)
    let lastIdx = data.data.candles.length - 1;
    const now = new Date();
    const lastCandleDate = new Date(data.data.candles[lastIdx][0]);
    // If last candle is today, use previous one
    if (
      lastCandleDate.getDate() === now.getDate() &&
      lastCandleDate.getMonth() === now.getMonth() &&
      lastCandleDate.getFullYear() === now.getFullYear()
    ) {
      lastIdx -= 1;
    }
    const yesterday = data.data.candles[lastIdx];
    const [timestamp, open, high, low, close, volume] = yesterday;

    // Calculate pivot points (Standard method)
    const pivot = (high + low + close) / 3;
    
    const r1 = 2 * pivot - low;
    const s1 = 2 * pivot - high;
    const r2 = pivot + (high - low);
    const s2 = pivot - (high - low);
    const r3 = high + 2 * (pivot - low);
    const s3 = low - 2 * (high - pivot);

    // Fibonacci levels
    const fibPivot = (high + low + close) / 3;
    const range = high - low;
    const fibR1 = fibPivot + 0.382 * range;
    const fibR2 = fibPivot + 0.618 * range;
    const fibR3 = fibPivot + 1.000 * range;
    const fibS1 = fibPivot - 0.382 * range;
    const fibS2 = fibPivot - 0.618 * range;
    const fibS3 = fibPivot - 1.000 * range;

    // Camarilla levels
    const camR1 = close + (high - low) * 1.1 / 12;
    const camR2 = close + (high - low) * 1.1 / 6;
    const camR3 = close + (high - low) * 1.1 / 4;
    const camR4 = close + (high - low) * 1.1 / 2;
    const camS1 = close - (high - low) * 1.1 / 12;
    const camS2 = close - (high - low) * 1.1 / 6;
    const camS3 = close - (high - low) * 1.1 / 4;
    const camS4 = close - (high - low) * 1.1 / 2;

    const result = {
      symbol,
      date: new Date(timestamp).toISOString(),
      ohlc: {
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: parseInt(volume),
      },
      standard: {
        pivot: parseFloat(pivot.toFixed(2)),
        r1: parseFloat(r1.toFixed(2)),
        r2: parseFloat(r2.toFixed(2)),
        r3: parseFloat(r3.toFixed(2)),
        s1: parseFloat(s1.toFixed(2)),
        s2: parseFloat(s2.toFixed(2)),
        s3: parseFloat(s3.toFixed(2)),
      },
      fibonacci: {
        pivot: parseFloat(fibPivot.toFixed(2)),
        r1: parseFloat(fibR1.toFixed(2)),
        r2: parseFloat(fibR2.toFixed(2)),
        r3: parseFloat(fibR3.toFixed(2)),
        s1: parseFloat(fibS1.toFixed(2)),
        s2: parseFloat(fibS2.toFixed(2)),
        s3: parseFloat(fibS3.toFixed(2)),
      },
      camarilla: {
        r1: parseFloat(camR1.toFixed(2)),
        r2: parseFloat(camR2.toFixed(2)),
        r3: parseFloat(camR3.toFixed(2)),
        r4: parseFloat(camR4.toFixed(2)),
        s1: parseFloat(camS1.toFixed(2)),
        s2: parseFloat(camS2.toFixed(2)),
        s3: parseFloat(camS3.toFixed(2)),
        s4: parseFloat(camS4.toFixed(2)),
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Key levels error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}