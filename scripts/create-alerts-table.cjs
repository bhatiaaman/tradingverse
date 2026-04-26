'use strict';
require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.NEON_DB_URL);

(async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS alerts (
      id               TEXT        PRIMARY KEY,
      symbol           TEXT        NOT NULL,
      instrument_token BIGINT      NOT NULL,
      threshold        NUMERIC     NOT NULL,
      direction        TEXT        NOT NULL CHECK (direction IN ('above', 'below')),
      note             TEXT,
      status           TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'cancelled')),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      triggered_at     TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts (status)`;
  await sql`CREATE INDEX IF NOT EXISTS alerts_symbol_idx ON alerts (symbol)`;
  console.log('alerts table ready');
})().catch(e => { console.error(e.message); process.exit(1); });
