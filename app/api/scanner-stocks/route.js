import { NextResponse } from 'next/server';
import { getAllScans } from '@/app/lib/scanStore';

export async function GET() {
  try {
    const history = await getAllScans();

    // Only consider the 2 most recent scans (latest + previous).
    // history is newest-first; slice(0, 2) gives [latest, previous].
    const recentScans = history.slice(0, 2);

    // Build symbol map: first-seen wins (recentScans is newest-first)
    // so each symbol is labelled by the most recent scan it appeared in.
    const symbolMap = new Map();

    for (const scan of recentScans) {
      const raw = scan?.stocks ?? scan?.stock_data ?? '';
      const symbols = (
        typeof raw === 'string'
          ? raw.split(',')
          : Array.isArray(raw)
          ? raw
          : []
      )
        .map(s => String(s).trim().toUpperCase().replace(/[^A-Z0-9&-]/g, ''))
        .filter(Boolean);

      const scanName = scan.alert_name || scan.scan_name || 'Scanner';
      const receivedAt = scan.receivedAt || scan.triggered_at || null;

      for (const sym of symbols) {
        if (!symbolMap.has(sym)) {
          symbolMap.set(sym, { symbol: sym, scanName, receivedAt });
        }
      }
    }

    const stocks = Array.from(symbolMap.values());

    const lastScan = history[0]
      ? {
          name: history[0].alert_name || history[0].scan_name || 'Scanner',
          time: history[0].receivedAt || history[0].triggered_at || null,
        }
      : null;

    return NextResponse.json({ stocks, total: stocks.length, lastScan });
  } catch (error) {
    console.error('Scanner stocks error:', error);
    return NextResponse.json({ stocks: [], total: 0, lastScan: null });
  }
}
