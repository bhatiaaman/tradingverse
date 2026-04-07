import { enrichScan, getScanEnriched } from "@/app/lib/scan-enrichment";

export async function POST(request) {
  try {
    const { scanId, stocks, scanName } = await request.json();

    if (!scanId || !stocks?.length) {
      return Response.json({ error: 'scanId and stocks required' }, { status: 400 });
    }

    await enrichScan(scanId, stocks, scanName || '');

    const enriched = await getScanEnriched(scanId);

    if (!enriched) {
      return Response.json({ error: 'Enrichment ran but produced no data — Kite may not be connected' }, { status: 500 });
    }

    return Response.json({ enriched });
  } catch (e) {
    console.error('[enrich-scan]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
