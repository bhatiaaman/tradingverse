import { setLatestScan, setScannerScan } from "@/app/lib/scanStore";

const WEBHOOK_SECRET = process.env.CHARTINK_WEBHOOK_SECRET;

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
      id: Date.now()
    };

    // Store in shared module
    await setLatestScan(enrichedData);
    // Also store per-scanner (if scan_url or scan_name present)
    try {
      await setScannerScan(enrichedData);
    } catch (e) {
      console.error('Failed to set scanner-specific scan:', e);
    }

    console.log('📊 Scan received:', enrichedData);

    return Response.json({ 
      success: true, 
      message: 'Scan received',
      timestamp: enrichedData.receivedAt
    });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return Response.json(
      { error: 'Processing failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({ ok: true, msg: "webhook route alive" });
}