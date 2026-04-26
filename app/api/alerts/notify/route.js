import { NextResponse } from 'next/server';
import { Resend }       from 'resend';
import { sql }          from '@/app/lib/db';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const CRON_SECRET = process.env.CRON_SECRET;

async function redisScan(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const res  = await fetch(`${REDIS_URL}/scan/${cursor}?match=${encodeURIComponent(pattern)}&count=50`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    [cursor] = data.result;
    keys.push(...(data.result[1] ?? []));
  } while (cursor !== '0');
  return keys;
}

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return null;
    try { return JSON.parse(data.result); } catch { return data.result; }
  } catch { return null; }
}

async function redisDel(key) {
  try {
    await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch {}
}

async function redisSet(key, value, ttl) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const url     = `${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}${ttl ? `?ex=${ttl}` : ''}`;
    await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch {}
}

// POST /api/alerts/notify
// Called by Vercel Cron every minute (or manually). Checks for bridge-triggered
// alerts, sends email via Resend, marks done in Neon, removes from active list.
export async function POST(req) {
  // Accept cron secret or valid session
  const authHeader = req.headers.get('authorization');
  const cronOk     = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
  if (!cronOk) {
    // Also allow calls without auth in dev (no CRON_SECRET set)
    if (CRON_SECRET) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Find all triggered alert keys written by bridge
  const keys = await redisScan(`${NS}:alerts:triggered:*`);
  if (keys.length === 0) return NextResponse.json({ processed: 0 });

  const resend    = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'TradingVerse <noreply@tradingverse.in>';
  const toEmail   = process.env.ALERT_EMAIL || 'bhatiaaman.p@gmail.com';

  let processed = 0;

  for (const key of keys) {
    const data = await redisGet(key);
    if (!data?.alertId) { await redisDel(key); continue; }

    // Load alert from Neon
    const [alert] = await sql`SELECT * FROM alerts WHERE id = ${data.alertId} AND status = 'active'`;
    if (!alert) { await redisDel(key); continue; }

    // Mark triggered in Neon
    await sql`UPDATE alerts SET status = 'triggered', triggered_at = NOW() WHERE id = ${alert.id}`;

    // Send email
    const dirLabel = alert.direction === 'above' ? '▲ crossed above' : '▼ crossed below';
    await resend.emails.send({
      from:    fromEmail,
      to:      toEmail,
      subject: `🔔 Alert: ${alert.symbol} ${dirLabel} ₹${Number(alert.threshold).toFixed(2)}`,
      html: `
        <div style="font-family:monospace;max-width:480px;padding:20px;background:#0f172a;color:#e2e8f0;border-radius:8px">
          <h2 style="color:#f1f5f9;margin:0 0 12px">🔔 Price Alert Triggered</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:4px 0">Symbol</td><td style="font-weight:bold">${alert.symbol}</td></tr>
            <tr><td style="color:#94a3b8;padding:4px 0">Condition</td><td>${dirLabel} ₹${Number(alert.threshold).toFixed(2)}</td></tr>
            <tr><td style="color:#94a3b8;padding:4px 0">Triggered at</td><td>₹${data.ltp?.toFixed(2) ?? '—'}</td></tr>
            ${alert.note ? `<tr><td style="color:#94a3b8;padding:4px 0">Note</td><td style="color:#fbbf24">${alert.note}</td></tr>` : ''}
          </table>
          <p style="color:#475569;font-size:12px;margin-top:16px">TradingVerse · ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
        </div>
      `,
    }).catch(e => console.error('[alerts/notify] Resend error:', e.message));

    await redisDel(key);
    processed++;
  }

  // Sync active list (removes triggered alerts)
  const activeRows = await sql`SELECT id, symbol, instrument_token, threshold::float AS threshold, direction FROM alerts WHERE status = 'active'`;
  await redisSet(`${NS}:alerts:active`, activeRows, 300);

  return NextResponse.json({ processed });
}
