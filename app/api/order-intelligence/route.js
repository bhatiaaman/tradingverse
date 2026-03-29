// ─── POST /api/order-intelligence ────────────────────────────────────────────
// Thin wrapper over the Central Intelligence Manager.
// Kept for backward compatibility with OrderModal's fallback fetch path.
// Returns the same shape as before so no consumer changes are needed.

import { NextResponse }    from 'next/server';
import { getIntelligence } from '@/app/lib/intelligence/manager.js';
import { intelligenceLimiter, checkLimit } from '@/app/lib/rate-limit';
import { requireSession, unauthorized }    from '@/app/lib/session';

function baseUrl(req) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req) {
  if (!await requireSession()) return unauthorized();
  const rl = await checkLimit(intelligenceLimiter, req);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  try {
    const body     = await req.json();
    const { symbol, marketRegime } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    const intel = await getIntelligence(symbol, { base: baseUrl(req) });

    // Return old shape so OrderModal fallback path keeps working unchanged
    return NextResponse.json({
      positions:  intel.positions,
      orders:     intel.orders,
      sentiment:  intel.sentiment,
      sector:     intel.sector,
      vix:        intel.vix,
      behavioral: intel.agents.behavioral,
      structure:  intel.agents.structure,
      pattern:    intel.agents.pattern,
      station:    intel.agents.station,
      oi:         intel.agents.oi,
      scenario:   intel.scenario,
    });

  } catch (error) {
    console.error('Order intelligence error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
