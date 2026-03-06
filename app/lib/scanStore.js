import { redis } from "./redis";

const KEY_LATEST = "latest_scan";
const KEY_HISTORY = "scan_history";
const MAX_HISTORY = 20;

const KEY_SCANNER_LATEST_PREFIX = "scanner_latest:";
const KEY_SCANNER_HISTORY_PREFIX = "scanner_history:";

function getDedupeKey(scan) {
  const alert = (scan?.alert_name || "").trim().toLowerCase();
  const trig = (scan?.triggered_at || "").trim().toLowerCase();
  return `${alert}__${trig}`;
}

export async function setLatestScan(scan) {
  // Always store latest
  await redis.set(KEY_LATEST, scan);

  const history = (await redis.get(KEY_HISTORY)) || [];

  // New scan always goes first
  const combined = [scan, ...history].filter(Boolean);

  // Dedupe by alert_name + triggered_at
  const seen = new Set();
  const deduped = [];

  for (const item of combined) {
    const key = getDedupeKey(item);

    // If missing fields, don't dedupe too aggressively
    if (!item?.alert_name || !item?.triggered_at) {
      deduped.push(item);
      continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  // Keep only last 20
  const finalHistory = deduped.slice(0, MAX_HISTORY);

  await redis.set(KEY_HISTORY, finalHistory);
}

//getScannerSlug
function getScannerSlug(scanOrSlug) {
  if (!scanOrSlug) return '';
  const raw = typeof scanOrSlug === 'string' ? scanOrSlug : (scanOrSlug.scan_url || scanOrSlug.scan_name || scanOrSlug.alert_name || '');
  return String(raw).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function setScannerScan(scan) {
  const slug = getScannerSlug(scan);
  if (!slug) return;

  const latestKey = KEY_SCANNER_LATEST_PREFIX + slug;
  const historyKey = KEY_SCANNER_HISTORY_PREFIX + slug;

  await redis.set(latestKey, scan);

  const history = (await redis.get(historyKey)) || [];
  const combined = [scan, ...history].filter(Boolean);

  const seen = new Set();
  const deduped = [];

  for (const item of combined) {
    const key = getDedupeKey(item);

    if (!item?.alert_name || !item?.triggered_at) {
      deduped.push(item);
      continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  const finalHistory = deduped.slice(0, MAX_HISTORY);
  await redis.set(historyKey, finalHistory);
}

export async function getScannerLatest(slug) {
  if (!slug) return null;
  const key = KEY_SCANNER_LATEST_PREFIX + getScannerSlug(slug);
  return await redis.get(key);
}

export async function getScannerHistory(slug) {
  if (!slug) return [];
  const key = KEY_SCANNER_HISTORY_PREFIX + getScannerSlug(slug);
  return (await redis.get(key)) || [];
}

export async function getLatestScan() {
  return await redis.get(KEY_LATEST);
}

export async function getAllScans() {
  return (await redis.get(KEY_HISTORY)) || [];
}