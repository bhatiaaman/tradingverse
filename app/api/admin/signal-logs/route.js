import { NextResponse } from 'next/server';
import { sql } from '@/app/lib/db';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const n    = Math.min(parseInt(searchParams.get('n') || '100'), 300);
    const type = searchParams.get('type'); // 'SC' | 'THIRD_EYE' | 'OPT_SIGNAL' | 'THIRD_EYE,OPT_SIGNAL' | null = all

    let rows, countRow;

    if (type && type.includes(',')) {
      // Multiple types (comma-separated)
      const types = type.split(',').map(t => t.trim()).filter(Boolean);
      rows     = await sql`SELECT id, type, ts, symbol, data, created_at FROM signal_logs WHERE type = ANY(${types}) ORDER BY ts DESC LIMIT ${n}`;
      countRow = await sql`SELECT COUNT(*) AS c FROM signal_logs WHERE type = ANY(${types})`;
    } else if (type) {
      rows     = await sql`SELECT id, type, ts, symbol, data, created_at FROM signal_logs WHERE type = ${type} ORDER BY ts DESC LIMIT ${n}`;
      countRow = await sql`SELECT COUNT(*) AS c FROM signal_logs WHERE type = ${type}`;
    } else {
      rows     = await sql`SELECT id, type, ts, symbol, data, created_at FROM signal_logs ORDER BY ts DESC LIMIT ${n}`;
      countRow = await sql`SELECT COUNT(*) AS c FROM signal_logs`;
    }

    const entries = rows.map(r => ({ ...r.data, type: r.type, ts: r.ts, symbol: r.symbol }));
    return NextResponse.json({ entries, total: Number(countRow[0]?.c ?? 0) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    if (!body?.type || !body?.ts) {
      return NextResponse.json({ error: 'Missing type or ts' }, { status: 400 });
    }
    const { type, ts, symbol = null, ...rest } = body;
    await sql`
      INSERT INTO signal_logs (type, ts, symbol, data)
      VALUES (${type}, ${ts}, ${symbol}, ${JSON.stringify(rest)})
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
