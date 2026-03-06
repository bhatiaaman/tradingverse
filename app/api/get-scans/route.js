import { getLatestScan, getAllScans, getScannerLatest, getScannerHistory } from "@/app/lib/scanStore";

function toSlug(raw) {
  // Lowercase + replace non-alphanumeric runs with dash
  // Makes lookup case-agnostic: "Bullish-BO-15min" == "bullish-bo-15min"
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const scanner = url.searchParams.get('scanner');

    if (scanner) {
      const slug = toSlug(scanner);
      const latest = await getScannerLatest(slug);
      const history = await getScannerHistory(slug);
      return Response.json({ latest: latest || null, history: history || [] });
    }

    const latest = await getLatestScan();
    const history = await getAllScans();
    return Response.json({ latest: latest || null, history: history || [] });
  } catch (e) {
    console.error('get-scans error', e);
    return Response.json({ latest: null, history: [] }, { status: 500 });
  }
}