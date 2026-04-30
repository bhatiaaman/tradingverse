import { NextResponse } from 'next/server';

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3001';

// GET /api/dom/status
// Returns bridge online/offline state by asking the bridge HTTP server directly.
// Consistent with /api/dom/pressure — both hit the bridge instead of Redis,
// since flushSnapshots() no longer writes snapshots to Redis.
// No auth required — just a heartbeat check.
export async function GET() {
  if (process.env.DOM_ENABLED !== 'true') {
    return NextResponse.json({ online: false, reason: 'disabled' });
  }

  const bridgeData = await fetch(`${BRIDGE_URL}/dom?underlying=NIFTY`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(2000),
  }).then(r => r.json()).catch(() => null);

  if (!bridgeData?.available) {
    return NextResponse.json({ online: false, reason: 'bridge-unavailable' });
  }

  const snap       = bridgeData.snap;
  const ageSeconds = snap?.updatedAt
    ? Math.floor(Date.now() / 1000) - snap.updatedAt
    : 999;

  return NextResponse.json({
    online:   ageSeconds <= 30,
    lastSeen: ageSeconds,
    ltp:      snap?.ltp ?? null,
  });
}
