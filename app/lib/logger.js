const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const LOG_KEY     = `${NS}:system:logs`;

export async function ensureLogFile() {
  // No-op for Redis
}

export async function getRedisLogs() {
  if (!REDIS_URL || !REDIS_TOKEN) return [];
  try {
    const res = await fetch(`${REDIS_URL}/get/${LOG_KEY}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` }});
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : [];
  } catch (err) {
    console.error('Error fetching redis logs:', err);
    return [];
  }
}

async function setRedisLogs(logs) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    await fetch(`${REDIS_URL}/set/${LOG_KEY}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(logs)
    });
  } catch (e) {
    console.error('Redis Set Error:', e);
  }
}

export async function addSystemLog({ category = 'general', message = '', data = {} }) {
  try {
    let logs = await getRedisLogs();

    const newLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category,
      message,
      data,
    };
    logs.push(newLog);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    logs = logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= sevenDaysAgo;
    });

    await setRedisLogs(logs);
    return newLog;
  } catch (err) {
    console.error('Error writing to system log:', err);
    throw err;
  }
}
