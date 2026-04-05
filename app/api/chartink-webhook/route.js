import { after } from 'next/server';
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
    const scanData = await request.json();
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

    console.log('📊 Scan received:', enrichedData.id, '— stocks:', enrichedData.stocks?.length ?? 0);

    // ── Fire enrichment after response (non-blocking via next/server after()) ──
    const stocks = parseStocks(scanData).filter(s => s.symbol);
    if (stocks.length > 0) {
      after(async () => {
        await enrichScan(enrichedData.id, stocks, scanData.scan_name || '');
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
