import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';
const OWNER_EMAIL = process.env.OWNER_EMAIL?.toLowerCase().trim();
const CONFIG_KEY  = `${NS}:eye-setup-config`;

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return null;
    try { return JSON.parse(data.result); } catch { return data.result; }
  } catch { return null; }
}

async function redisSet(key, value) {
  try {
    const enc = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${enc}`, {
      method: 'GET', headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch {}
}

async function getAdminEmail(req) {
  const token = req.cookies.get('tv_session')?.value;
  if (!token) return null;
  const email = await redisGet(`${NS}:session:${token}`);
  if (!email) return null;
  return String(email).toLowerCase() === OWNER_EMAIL ? email : null;
}

export async function GET(req) {
  const email = await getAdminEmail(req);
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = await redisGet(CONFIG_KEY) || {};
  return NextResponse.json({ config });
}

export async function POST(req) {
  const email = await getAdminEmail(req);
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid config' }, { status: 400 });
    }
    await redisSet(CONFIG_KEY, body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
