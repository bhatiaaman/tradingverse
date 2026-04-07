import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'data', 'system_logs.json');

// Ensure directory and file exist
async function ensureLogFile() {
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

export async function GET(request) {
  try {
    await ensureLogFile();
    const data = await fs.readFile(LOG_FILE, 'utf-8');
    const allLogs = JSON.parse(data || '[]');

    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    
    let filteredLogs = allLogs;
    if (category) {
      filteredLogs = allLogs.filter(log => log.category === category);
    }
    
    // Sort descending by timestamp
    filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return NextResponse.json({ success: true, logs: filteredLogs });
  } catch (err) {
    console.error('Error reading logs:', err);
    return NextResponse.json({ success: false, error: 'Failed to read logs' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureLogFile();
    const payload = await request.json();
    
    // 1. Read existing
    const data = await fs.readFile(LOG_FILE, 'utf-8');
    let logs = JSON.parse(data || '[]');

    // 2. Append new log
    const newLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category: payload.category || 'general',  
      message: payload.message || '',           
      data: payload.data || {},                 
    };
    logs.push(newLog);

    // 3. Prune logs older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    logs = logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= sevenDaysAgo;
    });

    // 4. Write back
    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));

    return NextResponse.json({ success: true, log: newLog });
  } catch (err) {
    console.error('Error writing log:', err);
    return NextResponse.json({ success: false, error: 'Failed to write log' }, { status: 500 });
  }
}
