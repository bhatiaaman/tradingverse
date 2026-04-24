
import { sql } from './app/lib/db.js';

async function cleanup() {
  console.log('Cleaning up duplicate signal logs...');
  try {
    // Delete duplicates keeping only the one with the lowest ID
    // We group by type, ts, symbol and the stringified data
    const res = await sql`
      DELETE FROM signal_logs a
      WHERE a.id > (
        SELECT MIN(b.id)
        FROM signal_logs b
        WHERE a.type = b.type
          AND a.ts = b.ts
          AND a.symbol = b.symbol
          AND a.data::text = b.data::text
      )
    `;
    console.log('Done cleaning duplicates.');
  } catch (err) {
    console.error('Cleanup failed:', err.message);
  }
}

cleanup();
