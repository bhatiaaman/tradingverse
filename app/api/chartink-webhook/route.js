//import { setLatestScan } from '../../lib/scanStore';

import { setLatestScan, setScannerScan } from "@/app/lib/scanStore";

export async function POST(request) {
  try {
    const scanData = await request.json();
    
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