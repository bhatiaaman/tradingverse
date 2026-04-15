import { setLatestScan, setScannerScan } from "@/app/lib/scanStore";
import { enrichScan } from "@/app/lib/scan-enrichment";

const WEBHOOK_SECRET = process.env.CHARTINK_WEBHOOK_SECRET;

// ── Parse stocks + prices from raw Chartink payload ───────────────────────────
function parseStocks(scanData) {
  const rawStocks = Array.isArray(scanData.stocks)
    ? scanData.stocks.map(s => String(s).trim())
    : String(scanData.stocks || '').split(',').map(s => s.trim()).filter(Boolean);

  const rawPrices = Array.isArray(scanData.trigger_prices)
    ? scanData.trigger_prices.map(p => String(p).trim())
    : String(scanData.trigger_prices || '').split(',').map(p => p.trim());

  return rawStocks.map((symbol, idx) => ({
    symbol,
    price: rawPrices[idx] || '0',
  }));
}

export async function POST(request) {
  // Verify secret token if configured
  if (WEBHOOK_SECRET) {
    const provided = request.headers.get('x-webhook-secret') || new URL(request.url).searchParams.get('secret');
    if (provided !== WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // ── Content-type aware parsing ───────────────────────────────────────────
    // ChartInk sends:  application/x-www-form-urlencoded
    // Our test form sends: application/json
    // Support both so real alerts and test alerts both work.
    const ct = request.headers.get('content-type') || '';
    let scanData;

    if (ct.includes('application/json')) {
      scanData = await request.json();
    } else {
      // form-urlencoded (ChartInk real webhook format)
      const text   = await request.text();
      const params = new URLSearchParams(text);
      scanData = {};
      for (const [k, v] of params.entries()) {
        // stocks and trigger_prices arrive as comma-separated strings —
        // split them so downstream parsing works identically to JSON array form.
        if (k === 'stocks' || k === 'trigger_prices') {
          scanData[k] = v.split(',').map(s => s.trim()).filter(Boolean);
        } else {
          scanData[k] = v;
        }
      }
    }

    if (!scanData || typeof scanData !== 'object') {
      return Response.json({ error: 'Invalid scan data' }, { status: 400 });
    }

    const enrichedData = {
      ...scanData,
      receivedAt: new Date().toISOString(),
      id: Date.now(),
    };

    // Store raw scan immediately
    await setLatestScan(enrichedData);
    try {
      await setScannerScan(enrichedData);
    } catch (e) {
      console.error('Failed to set scanner-specific scan:', e);
    }

    console.log('📊 Scan received:', enrichedData.id, '— stocks:', enrichedData.stocks?.length ?? 0, '— ct:', ct.split(';')[0]);

    // ── Run enrichment synchronously — Chartink tolerates slow webhook responses ──
    const stocks = parseStocks(scanData).filter(s => s.symbol);
    if (stocks.length > 0) {
      await enrichScan(enrichedData.id, stocks, scanData.scan_name || '').catch(e => {
        console.error('[webhook] enrichment failed:', e.message);
      });
    }

    return Response.json({
      success: true,
      message: 'Scan received',
      timestamp: enrichedData.receivedAt,
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return Response.json({ error: 'Processing failed' }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, msg: "webhook route alive" });
}
