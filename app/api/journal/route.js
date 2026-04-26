import { NextResponse } from 'next/server';
import { sql } from '@/app/lib/db';
import { getBroker } from '@/app/lib/providers';
import { requireSession, unauthorized, forbidden, serviceUnavailable } from '@/app/lib/session';
import { buildTechnicalSnapshot } from '@/app/lib/analysis/snapshotBuilder';


function getIstNow() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (330 * 60000)); // +5.5 hours
}

export async function GET(request) {
  const { session, error } = await requireSession();
  if (error) return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  const { searchParams } = new URL(request.url);
  const targetDate = searchParams.get('date'); // YYYY-MM-DD
  
  if (!targetDate) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  }

  try {
    // 1. Fetch DB records
    let dailyJournal = {
      date: targetDate, pnl: 0, market_context: '', emotional_state: '', analysis: {}
    };
    
    const journalRows = await sql`SELECT * FROM daily_journals WHERE date = ${targetDate} LIMIT 1`;
    if (journalRows.length > 0) {
      dailyJournal = journalRows[0];
    }

    const tradeComments = await sql`SELECT * FROM journal_trades WHERE date = ${targetDate}`;

    // 2. Determine if it's "today" to fetch live broker data
    const istNow = getIstNow();
    const todayStr = istNow.toISOString().split('T')[0];
    const isToday = targetDate === todayStr;

    let kiteTrades = [];
    let kitePositions = { net: [], day: [] };
    let livePnl = 0;

    if (isToday) {
      const broker = await getBroker();
      if (broker && broker.isConnected()) {
        try {
          const rawTradesAPI = await broker.getTradesRaw();
          kiteTrades = rawTradesAPI.data || [];
        } catch (e) {
          console.error('[journal] Error fetching trades from Kite:', e.message);
        }

        try {
          const rawPosAPI = await broker.getPositionsRaw();
          kitePositions = rawPosAPI.data || { net: [], day: [] };
          livePnl = kitePositions.day.reduce((acc, pos) => acc + (parseFloat(pos.pnl) || 0), 0);
        } catch (e) {
          console.error('[journal] Error fetching positions from Kite:', e.message);
        }
      }
    } else {
      // For past dates, use the snapshot saved in the DB
      if (dailyJournal.kite_data) {
        kiteTrades = dailyJournal.kite_data.trades || [];
        kitePositions = dailyJournal.kite_data.positions || { net: [], day: [] };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        journal: dailyJournal,
        comments: tradeComments,
        isToday,
        livePnl,
        kiteTrades,
        kitePositions
      }
    });

  } catch (err) {
    console.error('[journal] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, error } = await requireSession();
  if (error) return serviceUnavailable(error);
  if (!session) return unauthorized();
  if (session.role !== 'admin') return forbidden();

  try {
    const body = await request.json();
    const { 
      date, pnl, market_context = '', 
      emotional_state = '', analysis = {},
      trade_comments = [] // Array of { group_id, symbol, tags, comment }
    } = body;

    if (!date) return NextResponse.json({ error: 'Date required' }, { status: 400 });

    // UPSERT daily journal
    let kiteDataSnapshot = null;
    const isToday = date === getIstNow().toISOString().split('T')[0];

    // If saving today's journal, snapshot the live broker data
    if (isToday) {
      const broker = await getBroker();
      if (broker && broker.isConnected()) {
        try {
          const [tRes, pRes] = await Promise.all([
            broker.getTradesRaw(),
            broker.getPositionsRaw()
          ]);
          kiteDataSnapshot = {
            trades: tRes.data || [],
            positions: pRes.data || { net: [], day: [] }
          };
        } catch (e) {
          console.error('[journal] Error snapshotting for POST:', e.message);
        }
      }
    }

    if (kiteDataSnapshot) {
      await sql`
        INSERT INTO daily_journals (date, pnl, market_context, emotional_state, analysis, kite_data, updated_at)
        VALUES (${date}, ${pnl || 0}, ${market_context}, ${emotional_state}, ${JSON.stringify(analysis)}, ${JSON.stringify(kiteDataSnapshot)}, now())
        ON CONFLICT (date) DO UPDATE SET
          pnl = EXCLUDED.pnl,
          market_context = EXCLUDED.market_context,
          emotional_state = EXCLUDED.emotional_state,
          analysis = EXCLUDED.analysis,
          kite_data = EXCLUDED.kite_data,
          updated_at = EXCLUDED.updated_at
      `;
    } else {
      await sql`
        INSERT INTO daily_journals (date, pnl, market_context, emotional_state, analysis, updated_at)
        VALUES (${date}, ${pnl || 0}, ${market_context}, ${emotional_state}, ${JSON.stringify(analysis)}, now())
        ON CONFLICT (date) DO UPDATE SET
          pnl = EXCLUDED.pnl,
          market_context = EXCLUDED.market_context,
          emotional_state = EXCLUDED.emotional_state,
          analysis = EXCLUDED.analysis,
          updated_at = EXCLUDED.updated_at
      `;
    }

    // UPSERT trade comments 
    // Usually easier to delete all for date and re-insert, but let's upsert by group_id -> trade_id
    for (const c of trade_comments) {
      const gId = c.group_id || `${date}_${c.symbol}`;
      const existing = await sql`SELECT snapshot FROM journal_trades WHERE trade_id = ${gId}`;
      let snapshotData = existing[0]?.snapshot;

      if (!snapshotData || Object.keys(snapshotData).length === 0) {
        try {
          snapshotData = await buildTechnicalSnapshot(c.symbol);
        } catch (e) {
          console.error(`[journal] snapshot build failed for ${c.symbol}:`, e);
        }
      }

      await sql`
        INSERT INTO journal_trades (trade_id, date, symbol, tags, comment, snapshot, updated_at)
        VALUES (${gId}, ${date}, ${c.symbol}, ${JSON.stringify(c.tags || [])}, ${c.comment || ''}, ${JSON.stringify(snapshotData || {})}, now())
        ON CONFLICT (trade_id) DO UPDATE SET
          tags = EXCLUDED.tags,
          comment = EXCLUDED.comment,
          snapshot = EXCLUDED.snapshot,
          updated_at = EXCLUDED.updated_at
      `;
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[journal] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
