import { getLatestScan, getAllScans, getScannerLatest, getScannerHistory } from "@/app/lib/scanStore";
import { getScanEnriched } from "@/app/lib/scan-enrichment";

function toSlug(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const scanner = url.searchParams.get('scanner');

    let latest, history;

    if (scanner) {
      const slug = toSlug(scanner);
      latest  = await getScannerLatest(slug);
      history = await getScannerHistory(slug);
    } else {
      latest  = await getLatestScan();
      history = await getAllScans();
    }

    latest  = latest  || null;
    history = Array.isArray(history) ? history : [];

    // Attach enriched per-stock data for the latest scan
    const enriched = latest?.id ? await getScanEnriched(latest.id) : null;

    return Response.json({ latest, history, enriched: enriched || null });
  } catch (e) {
    console.error('get-scans error', e);
    return Response.json({ latest: null, history: [], enriched: null }, { status: 500 });
  }
}
