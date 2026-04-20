// GET/POST /api/third-eye/settings
// Persists user-configurable Third Eye parameters to Neon system_config.

import { NextResponse }   from 'next/server';
import { sql }            from '@/app/lib/db';
import { requireSession, unauthorized, serviceUnavailable } from '@/app/lib/session';
import { DEFAULT_CONFIG } from '@/app/lib/thirdEye';

const CONFIG_KEY = 'third-eye-settings';

const ALLOWED_FIELDS = new Set([
  'adxStrong', 'adxForming',
  'rsiBull', 'rsiBear',
  'candleStrengthImpulsive', 'candleStrengthWeak',
  'confirmationCandles', 'scoreSmoothing', 'staleGuardCandles',
  'buildingThreshold', 'confirmedThreshold', 'continuingThreshold',
  'invalidationScore', 'rangingThreshold', 'rangingMinCandles',
  'pullbackRetrace',
  'optionsOverlay',
  'pcrBullThreshold', 'pcrBearThreshold',
  'sessionGateOpening', 'sessionGateLull', 'sessionGateClose',
  'activeTf',
]);

export async function GET() {
  const { session, error } = await requireSession();
  if (error)    return serviceUnavailable(error);
  if (!session) return unauthorized();

  const rows     = await sql`SELECT value FROM system_config WHERE key = ${CONFIG_KEY}`;
  const saved    = rows[0]?.value ?? {};
  const settings = { ...DEFAULT_CONFIG, activeTf: '5minute', optionsOverlay: true, ...saved };
  return NextResponse.json({ settings });
}

export async function POST(req) {
  const { session, error } = await requireSession();
  if (error)    return serviceUnavailable(error);
  if (!session) return unauthorized();

  let body = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const update = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) update[k] = v;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
  }

  const rows     = await sql`SELECT value FROM system_config WHERE key = ${CONFIG_KEY}`;
  const existing = rows[0]?.value ?? {};
  const merged   = { ...existing, ...update };

  await sql`
    INSERT INTO system_config (key, value, updated_at)
    VALUES (${CONFIG_KEY}, ${JSON.stringify(merged)}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  return NextResponse.json({ ok: true, settings: merged });
}
