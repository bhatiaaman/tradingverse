import { NextResponse } from 'next/server';

const REDIS_URL       = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN     = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS              = process.env.REDIS_NAMESPACE || 'default';
const WATCHLIST_KEY   = `${NS}:weekly-watchlist`;
const SNAPSHOT_KEY    = `${NS}:weekly-watchlist:terminal-snapshot`;

// ── Redis helpers ──────────────────────────────────────────────────────────────
async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value) {
  try {
    await fetch(`${REDIS_URL}/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, JSON.stringify(value)]),
    });
  } catch (err) { console.error('Redis set error:', err); }
}

// ── Week utilities ─────────────────────────────────────────────────────────────
function getISOWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ── Consolidation Logic ────────────────────────────────────────────────────────
function consolidateWatchlist(watchlist) {
  if (!watchlist) return [];
  
  const map = new Map(); // symbol -> item
  const nameMap = new Map(); // normalizedName -> symbol

  const handle = (list, scoreKey, defaultScore = 50) => {
    (list || []).forEach(item => {
      const sym = item.symbol?.toUpperCase();
      const rawName = item.companyName || item.name || sym;
      const normalizedName = rawName?.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
      if (!sym) return;
      
      const score = parseInt(item[scoreKey] || defaultScore, 10);
      const dateAdded = item.dateAdded || '1970-01-01T00:00:00Z';

      // 1. Check for name-based duplicate (e.g. symbol correction)
      if (normalizedName && nameMap.has(normalizedName)) {
        const existingSym = nameMap.get(normalizedName);
        const existing = map.get(existingSym);
        
        if (existing) {
          // If the new item is more recent, it's likely a correction
          if (new Date(dateAdded) > new Date(existing.dateAdded)) {
            map.delete(existingSym);
            nameMap.set(normalizedName, sym);
          } else {
            // Existing is more recent, ignore this one
            return;
          }
        }
      } else if (normalizedName) {
        nameMap.set(normalizedName, sym);
      }

      // 2. Standard symbol-based score update
      const existing = map.get(sym);
      if (!existing || score > existing.score || new Date(dateAdded) > new Date(existing.dateAdded)) {
        map.set(sym, {
          symbol: sym,
          name: rawName,
          score: score,
          dateAdded: dateAdded
        });
      }
    });
  };

  handle(watchlist.aiResearch, 'confidenceScore');
  handle(watchlist.expertsResearch, 'expertScore');
  handle(watchlist.chartink, 'score', 70); 

  return Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(s => ({ symbol: s.symbol, name: s.name }));
}

// ── GET Logic ──────────────────────────────────────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('refresh') === '1';
  const today = new Date();
  const isMonday = today.getDay() === 1; // 1 = Monday
  const currentWeekKey = getISOWeekKey(today);

  let snapshot = await redisGet(SNAPSHOT_KEY);

  // Sync conditions: 
  // 1. Force refresh
  // 2. It's Monday and the snapshot is not from today (ensures we get Monday's latest)
  // 3. The snapshot is from a previous week
  // 4. No snapshot exists at all
  const needsSync = force || 
                    !snapshot || 
                    snapshot.weekKey !== currentWeekKey || 
                    (isMonday && snapshot.syncedAt?.split('T')[0] !== today.toISOString().split('T')[0]);

  if (needsSync) {
    const liveData = await redisGet(WATCHLIST_KEY);
    const consolidated = consolidateWatchlist(liveData);
    
    snapshot = {
      weekKey: currentWeekKey,
      syncedAt: today.toISOString(),
      list: consolidated
    };
    
    await redisSet(SNAPSHOT_KEY, snapshot);
  }

  return NextResponse.json(snapshot);
}

// ── POST Logic (Force Sync) ───────────────────────────────────────────────────
export async function POST() {
  const today = new Date();
  const currentWeekKey = getISOWeekKey(today);
  
  const liveData = await redisGet(WATCHLIST_KEY);
  const consolidated = consolidateWatchlist(liveData);
  
  const snapshot = {
    weekKey: currentWeekKey,
    syncedAt: today.toISOString(),
    list: consolidated
  };
  
  await redisSet(SNAPSHOT_KEY, snapshot);
  
  return NextResponse.json({ success: true, ...snapshot });
}
