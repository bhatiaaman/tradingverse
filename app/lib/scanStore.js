import { sql } from '@/app/lib/db';

// ── Parse ChartInk triggered_at ───────────────────────────────────────────────
// ChartInk sends triggered_at as "2:34 pm" (time only, IST, no date).
// new Date("2:34 pm") → Invalid Date → Neon INSERT throws → row never saved.
// This function converts it to a valid Date for today in IST.
function parseScanTriggeredAt(raw) {
  if (!raw) return new Date();

  // Already a valid ISO or epoch-like string?
  const direct = new Date(raw);
  if (!isNaN(direct.getTime())) return direct;

  // ChartInk format: "2:34 pm" or "14:34"
  const match12 = String(raw).match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (match12) {
    let h = parseInt(match12[1]), m = parseInt(match12[2]);
    const pm = match12[3].toLowerCase() === 'pm';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    // Build an IST timestamp for today
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const todayIST  = new Date(now.getTime() + istOffset);
    const pad = n => String(n).padStart(2, '0');
    const iso = `${todayIST.getUTCFullYear()}-${pad(todayIST.getUTCMonth() + 1)}-${pad(todayIST.getUTCDate())}T${pad(h)}:${pad(m)}:00+05:30`;
    const parsed = new Date(iso);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  // 24h format "14:34"
  const match24 = String(raw).match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1]), m_= parseInt(match24[2]);
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const todayIST = new Date(now.getTime() + istOffset);
    const pad = n => String(n).padStart(2, '0');
    const iso = `${todayIST.getUTCFullYear()}-${pad(todayIST.getUTCMonth() + 1)}-${pad(todayIST.getUTCDate())}T${pad(h)}:${pad(m_)}:00+05:30`;
    const parsed = new Date(iso);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  return new Date();
}

function getScannerSlug(scanOrSlug) {
  if (!scanOrSlug) return '';
  const raw = typeof scanOrSlug === 'string'
    ? scanOrSlug
    : (scanOrSlug.scan_url || scanOrSlug.scan_name || scanOrSlug.alert_name || '');
  const str = String(raw);

  // Chartink sends scan_url as a full URL: https://chartink.com/screener/bullish-bo-15min
  // Extract just the last path segment so it matches the page URL slug.
  if (str.startsWith('http')) {
    try {
      const lastSegment = new URL(str).pathname.split('/').filter(Boolean).pop() || '';
      if (lastSegment) return lastSegment.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    } catch { /* fall through */ }
  }

  let slug = str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Alias common abbreviations to names used in URLs
  slug = slug.replace(/-bo-/, '-breakout-')
             .replace(/-bd-/, '-breakdown-')
             .replace(/^bo-/, 'breakout-')
             .replace(/^bd-/, 'breakdown-');

  return slug;
}


// Reconstruct the original scan payload from the row.
// The 'raw' column holds the full original payload — fall back to reassembling from columns.
function rowToScan(r) {
  if (!r) return null;
  const base = r.raw ?? {};
  return {
    ...base,
    id:           base.id           ?? r.id,
    scan_name:    base.scan_name    ?? r.scan_name,
    alert_name:   base.alert_name   ?? r.alert_name,
    slug:         r.slug,
    stocks:       base.stocks       ?? r.stocks,
    triggered_at: base.triggered_at ?? r.triggered_at,
  };
}

export async function setScannerScan(scan) {
  const slug = getScannerSlug(scan);
  if (!slug) return;
  // Use the original numeric id (Date.now()) as part of the PK so the page can use it
  const id = `${slug}__${scan.id ?? scan.triggered_at ?? Date.now()}`;
  try {
    await sql`
      INSERT INTO scans (id, scan_name, alert_name, slug, stocks, raw, triggered_at)
      VALUES (
        ${id},
        ${scan.scan_name  ?? null},
        ${scan.alert_name ?? null},
        ${slug},
        ${JSON.stringify(scan.stocks ?? [])},
        ${JSON.stringify(scan)},
        ${parseScanTriggeredAt(scan.triggered_at)}
      )
      ON CONFLICT (id) DO UPDATE SET
        raw          = EXCLUDED.raw,
        stocks       = EXCLUDED.stocks,
        triggered_at = EXCLUDED.triggered_at
    `;
  } catch (err) {
    console.error('[scanStore] setScannerScan failed:', err.message);
  }
}

export async function getScannerLatest(slug) {
  if (!slug) return null;
  const s = getScannerSlug(slug);
  // Also try searching for common aliases if exact match fails
  const rows = await sql`
    SELECT * FROM scans 
    WHERE slug = ${s} 
       OR slug = ${s.replace(/-breakout-/, '-bo-').replace(/-breakdown-/, '-bd-')}
    ORDER BY triggered_at DESC LIMIT 1
  `;
  return rows[0] ? rowToScan(rows[0]) : null;
}

export async function getScannerHistory(slug) {
  if (!slug) return [];
  const s = getScannerSlug(slug);
  // Also try searching for common aliases if exact match fails
  const rows = await sql`
    SELECT * FROM scans 
    WHERE slug = ${s} 
       OR slug = ${s.replace(/-breakout-/, '-bo-').replace(/-breakdown-/, '-bd-')}
    ORDER BY triggered_at DESC LIMIT 20
  `;
  return rows.map(rowToScan);
}

// Legacy API — kept for backward compat with existing callers
export async function setLatestScan(scan) {
  return setScannerScan(scan);
}

export async function getLatestScan() {
  const rows = await sql`SELECT * FROM scans ORDER BY triggered_at DESC LIMIT 1`;
  return rows[0] ? rowToScan(rows[0]) : null;
}

export async function getAllScans() {
  const rows = await sql`SELECT * FROM scans ORDER BY triggered_at DESC LIMIT 20`;
  return rows.map(rowToScan);
}
