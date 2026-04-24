// ─── Neon PostgreSQL client ────────────────────────────────────────────────────
// Uses @neondatabase/serverless which works over HTTP — no persistent connections
// needed, compatible with Vercel serverless + Edge functions.
//
// Usage:
//   import { sql } from '@/app/lib/db'
//   const rows = await sql`SELECT * FROM users WHERE email = ${email}`

import { neon } from '@neondatabase/serverless';

if (!process.env.NEON_DB_URL) {
  throw new Error('NEON_DB_URL environment variable is not set');
}

export const sql = neon(process.env.NEON_DB_URL);

// ─── Schema migration ──────────────────────────────────────────────────────────
// Call once on app startup or via /api/db-migrate route.
// Safe to re-run — all statements use CREATE TABLE IF NOT EXISTS.

export async function migrateSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      email        TEXT PRIMARY KEY,
      name         TEXT,
      hash         TEXT,
      plan         TEXT    NOT NULL DEFAULT 'free',
      google_id    TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS sessions_email_idx ON sessions (email)`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id               SERIAL PRIMARY KEY,
      order_id         TEXT,
      paper            BOOLEAN NOT NULL DEFAULT false,
      symbol           TEXT,
      exchange         TEXT,
      transaction_type TEXT,
      order_type       TEXT,
      product          TEXT,
      quantity         INTEGER,
      fill_price       NUMERIC,
      status           TEXT,
      ts               BIGINT,
      raw              JSONB,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS orders_symbol_idx  ON orders (symbol)`;
  await sql`CREATE INDEX IF NOT EXISTS orders_ts_idx      ON orders (ts DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS orders_paper_idx   ON orders (paper)`;

  await sql`
    CREATE TABLE IF NOT EXISTS order_exec_log (
      id         SERIAL PRIMARY KEY,
      ts         BIGINT,
      event      TEXT,
      data       JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS order_exec_ts_idx ON order_exec_log (ts DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS system_logs (
      id         SERIAL PRIMARY KEY,
      log_id     TEXT UNIQUE,
      category   TEXT,
      message    TEXT,
      data       JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS system_logs_category_idx ON system_logs (category)`;
  await sql`CREATE INDEX IF NOT EXISTS system_logs_created_idx  ON system_logs (created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS scans (
      id           TEXT PRIMARY KEY,
      scan_name    TEXT,
      alert_name   TEXT,
      slug         TEXT,
      stocks       JSONB,
      enriched     JSONB,
      raw          JSONB,
      triggered_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS scans_slug_idx         ON scans (slug)`;
  await sql`CREATE INDEX IF NOT EXISTS scans_triggered_at_idx ON scans (triggered_at DESC)`;
  await sql`ALTER TABLE scans ADD COLUMN IF NOT EXISTS raw JSONB`;

  await sql`
    CREATE TABLE IF NOT EXISTS eye_log (
      id         SERIAL PRIMARY KEY,
      symbol     TEXT NOT NULL,
      timeframe  TEXT NOT NULL,
      entries    JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (symbol, timeframe)
    )
  `;

  // Weekly watchlist archives — permanent record, one row per ISO week.
  // Moved from Redis (volatile) to Neon so snapshots survive key eviction.
  await sql`
    CREATE TABLE IF NOT EXISTS weekly_watchlist_archive (
      week_key   TEXT PRIMARY KEY,
      week_label TEXT,
      snapshot   JSONB NOT NULL,
      saved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS wwa_saved_at_idx ON weekly_watchlist_archive (saved_at DESC)`;

  // Generic key-value config store — replaces Redis for feature-flags,
  // active_broker, eye-settings, third-eye settings.
  await sql`
    CREATE TABLE IF NOT EXISTS system_config (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Per-user game progress — replaces Redis game-progress:{email} keys.
  await sql`
    CREATE TABLE IF NOT EXISTS game_progress (
      email      TEXT NOT NULL,
      game       TEXT NOT NULL,
      data       JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (email, game)
    )
  `;

  // Signal logs — SC + Third Eye setups. Replaces Redis list.
  await sql`
    CREATE TABLE IF NOT EXISTS signal_logs (
      id         SERIAL PRIMARY KEY,
      type       TEXT NOT NULL,
      ts         BIGINT NOT NULL,
      symbol     TEXT,
      data       JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS signal_logs_type_idx ON signal_logs (type)`;
  await sql`CREATE INDEX IF NOT EXISTS signal_logs_ts_idx   ON signal_logs (ts DESC)`;

  // Daily Journals
  await sql`
    CREATE TABLE IF NOT EXISTS daily_journals (
      date       DATE PRIMARY KEY,
      pnl        NUMERIC,
      market_context TEXT,
      emotional_state TEXT,
      analysis   JSONB DEFAULT '{}',
      kite_data  JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE daily_journals ADD COLUMN IF NOT EXISTS kite_data JSONB DEFAULT '{}'`;

  // Journal Trades
  await sql`
    CREATE TABLE IF NOT EXISTS journal_trades (
      trade_id   TEXT PRIMARY KEY,
      date       DATE REFERENCES daily_journals(date) ON DELETE CASCADE,
      symbol     TEXT,
      tags       JSONB DEFAULT '[]',
      comment    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS journal_trades_date_idx ON journal_trades (date)`;

  console.log('[db] schema migration complete');
}
