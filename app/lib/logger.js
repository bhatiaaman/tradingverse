import { sql } from '@/app/lib/db';

export async function ensureLogFile() {
  // No-op — Neon table created via /api/db-migrate
}

export async function getRedisLogs() {
  try {
    const rows = await sql`
      SELECT log_id, category, message, data, created_at
      FROM system_logs
      WHERE created_at > now() - interval '7 days'
      ORDER BY created_at DESC
      LIMIT 500
    `;
    return rows.map(r => ({
      id:        r.log_id,
      timestamp: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      category:  r.category,
      message:   r.message,
      data:      r.data || {},
    }));
  } catch (err) {
    console.error('[logger] getRedisLogs failed:', err.message);
    return [];
  }
}

export async function addSystemLog({ category = 'general', message = '', data = {} }) {
  const log_id = crypto.randomUUID();
  try {
    await sql`
      INSERT INTO system_logs (log_id, category, message, data)
      VALUES (${log_id}, ${category}, ${message}, ${JSON.stringify(data)})
    `;
  } catch (err) {
    console.error('[logger] addSystemLog failed:', err.message);
    throw err;
  }
  return { id: log_id, timestamp: new Date().toISOString(), category, message, data };
}
