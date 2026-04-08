import { NextResponse } from 'next/server';
import { addSystemLog, getRedisLogs } from '@/app/lib/logger';

export async function GET(request) {
  try {
    const allLogs = await getRedisLogs();

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
    const payload = await request.json();
    const newLog = await addSystemLog({
      category: payload.category,
      message: payload.message,
      data: payload.data
    });
    return NextResponse.json({ success: true, log: newLog });
  } catch (err) {
    console.error('Error writing log:', err);
    return NextResponse.json({ success: false, error: 'Failed to write log' }, { status: 500 });
  }
}
