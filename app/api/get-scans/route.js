import { getLatestScan, getAllScans, getScannerLatest, getScannerHistory } from "@/app/lib/scanStore";
import { getScanEnriched, enrichScan, detectScanDir } from "@/app/lib/scan-enrichment";

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
    let enriched = latest?.id ? await getScanEnriched(latest.id) : null;

    // Lazy enrichment: if enrichment is missing and scan has stocks, run it now.
    // Handles scans that arrived before the webhook fix or where after() failed.
    if (!enriched && latest?.id && latest?.stocks) {
      const rawStocks = Array.isArray(latest.stocks)
        ? latest.stocks.map(s => String(s).trim())
        : String(latest.stocks).split(',').map(s => s.trim()).filter(Boolean);
      const rawPrices = Array.isArray(latest.trigger_prices)
        ? latest.trigger_prices.map(p => String(p).trim())
        : String(latest.trigger_prices || '').split(',').map(p => p.trim());
      const stocks = rawStocks.map((symbol, i) => ({ symbol, price: rawPrices[i] || '0' })).filter(s => s.symbol);
      if (stocks.length > 0) {
        await enrichScan(latest.id, stocks, latest.scan_name || '').catch(e => {
          console.error('[get-scans] lazy enrichment failed:', e.message);
        });
        enriched = await getScanEnriched(latest.id);
      }
    }

    return Response.json({ latest, history, enriched: enriched || null });
  } catch (e) {
    console.error('get-scans error', e);
    return Response.json({ latest: null, history: [], enriched: null }, { status: 500 });
  }
}
