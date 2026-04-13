import { sql } from '@/app/lib/db';

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

  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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
        ${scan.triggered_at ? new Date(scan.triggered_at) : new Date()}
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
  const rows = await sql`
    SELECT * FROM scans WHERE slug = ${s} ORDER BY triggered_at DESC LIMIT 1
  `;
  return rows[0] ? rowToScan(rows[0]) : null;
}

export async function getScannerHistory(slug) {
  if (!slug) return [];
  const s = getScannerSlug(slug);
  const rows = await sql`
    SELECT * FROM scans WHERE slug = ${s} ORDER BY triggered_at DESC LIMIT 20
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
