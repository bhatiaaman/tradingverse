import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const instrument = searchParams.get('instrument'); // e.g. "NFO:NIFTY26APR22100CE"

  if (!instrument) {
    return NextResponse.json({ error: 'Missing instrument' }, { status: 400 });
  }

  try {
    const dp   = await getDataProvider();
    const data = await dp.getLTP(instrument);
    const ltp  = data.data?.[instrument]?.last_price ?? null;
    return NextResponse.json({ ltp });
  } catch (err) {
    console.error('[third-eye/ltp]', err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
