import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';

const NS  = process.env.REDIS_NAMESPACE || 'default';
const KEY = `${NS}:signal-logs`;
const MAX = 300;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const n    = Math.min(parseInt(searchParams.get('n') || '100'), MAX);
    const type = searchParams.get('type'); // 'SC' | 'THIRD_EYE' | null = all

    const raw = await redis.lrange(KEY, 0, MAX - 1);
    let entries = raw.map(e => {
      try { return typeof e === 'string' ? JSON.parse(e) : e; }
      catch { return null; }
    }).filter(Boolean);

    if (type) entries = entries.filter(e => e.type === type);

    return NextResponse.json({ entries: entries.slice(0, n), total: entries.length });
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
    await redis.lpush(KEY, JSON.stringify(body));
    await redis.ltrim(KEY, 0, MAX - 1);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
