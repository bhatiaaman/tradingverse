import { NextResponse } from 'next/server';
import { getProviderStatus } from '@/app/lib/providers';

export async function GET(request) {
  try {
    const status = await getProviderStatus();
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
