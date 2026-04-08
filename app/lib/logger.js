import fs from 'fs/promises';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'data', 'system_logs.json');

export async function ensureLogFile() {
  const dir = path.dirname(LOG_FILE);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  try {
    await fs.access(LOG_FILE);
  } catch {
    await fs.writeFile(LOG_FILE, '[]');
  }
}

export async function addSystemLog({ category = 'general', message = '', data = {} }) {
  try {
    await ensureLogFile();
    
    const fileData = await fs.readFile(LOG_FILE, 'utf-8');
    let logs = JSON.parse(fileData || '[]');

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

    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
    return newLog;
  } catch (err) {
    console.error('Error writing to system log:', err);
    throw err;
  }
}
