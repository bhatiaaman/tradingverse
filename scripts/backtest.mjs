#!/usr/bin/env node
// ─── Nifty 5-min Backtest v2 — ORB + VWAP Reclaim ────────────────────────────
// Run: node scripts/backtest.mjs
// Uses Nifty 50 index (256265) — prices match futures, volume not used.

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath   = resolve(__dirname, '../.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim();
}

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'tradingverse-local';

async function redisGet(key) {
  const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  return (await res.json()).result ?? null;
}

const API_KEY      = process.env.KITE_API_KEY || await redisGet(`${NS}:kite:api_key`);
const ACCESS_TOKEN = await redisGet(`${NS}:kite:access_token`) || process.env.KITE_ACCESS_TOKEN;

if (!API_KEY || !ACCESS_TOKEN) {
  console.error('Kite credentials missing.'); process.exit(1);
}

const NIFTY_TOKEN = '256265';
const LOT_SIZE    = 75;
const headers     = { 'X-Kite-Version': '3', Authorization: `token ${API_KEY}:${ACCESS_TOKEN}` };

// ─── Kite fetch ───────────────────────────────────────────────────────────────
async function fetchHistorical(token, interval, from, to) {
  const url  = `https://api.kite.trade/instruments/historical/${token}/${interval}?from=${from}&to=${to}&continuous=0`;
  const res  = await fetch(url, { headers });
  const json = await res.json();
  if (json.status !== 'success') throw new Error(`Kite: ${json.message}`);
  return json.data.candles.map(([date, o, h, l, c, v]) => ({ date: new Date(date), o, h, l, c, v }));
}

function fmtDate(d)    { return d.toISOString().split('T')[0]; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function hhmm(d)       { return d.getHours() * 60 + d.getMinutes(); }

async function fetchAll(token, interval, from, to) {
  const all = []; let start = new Date(from); const end = new Date(to);
  while (start < end) {
    const chunkEnd = new Date(Math.min(addDays(start, 59).getTime(), end.getTime()));
    console.log(`  Fetching ${interval}: ${fmtDate(start)} → ${fmtDate(chunkEnd)}`);
    all.push(...await fetchHistorical(token, interval, fmtDate(start), fmtDate(chunkEnd)));
    start = addDays(chunkEnd, 1);
    await new Promise(r => setTimeout(r, 350));
  }
  return all;
}

function groupByDay(candles) {
  const days = new Map();
  for (const c of candles) {
    const k = fmtDate(c.date);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(c);
  }
  return days;
}

// ─── VWAP — cumulative typical price avg (index has no volume) ───────────────
function calcVWAP(candles) {
  let sum = 0;
  return candles.map((c, i) => { sum += (c.h + c.l + c.c) / 3; return sum / (i + 1); });
}

// ─── CPR ─────────────────────────────────────────────────────────────────────
function calcCPR(prev) {
  if (!prev) return null;
  const pivot = (prev.h + prev.l + prev.c) / 3;
  const bc    = (prev.h + prev.l) / 2;
  const tc    = pivot * 2 - bc;
  return { top: Math.max(bc, tc), bottom: Math.min(bc, tc), pivot };
}

// ─── EMA calculation ─────────────────────────────────────────────────────────
function calcEMA(candles, period) {
  const k   = 2 / (period + 1);
  const out = [];
  let   ema = candles[0].c;
  for (const c of candles) { ema = c.c * k + ema * (1 - k); out.push(ema); }
  return out;
}

// ─── Trend filter: is today a trending day? ──────────────────────────────────
// If by 11:30 the day's range is already >220pts, it's a strong trend day — skip MR
function isDayTrending(candles) {
  const morning = candles.filter(c => hhmm(c.date) <= 690);
  if (morning.length < 5) return false;
  const hi = Math.max(...morning.map(c => c.h));
  const lo = Math.min(...morning.map(c => c.l));
  return (hi - lo) > 220;
}

// ─── Trade simulator — returns { trade, exitIdx } so caller can re-enter ─────
function simulateTrade(dir, entry, sl, t1, t2, candles, startIdx, ema9) {
  const isLong = dir === 'LONG';
  const slPts  = Math.abs(entry - sl);
  let t1Hit = false, exitP = null, exitR = null, exitIdx = candles.length - 1;

  for (let i = startIdx; i < candles.length; i++) {
    const c     = candles[i];
    const trail = ema9[i];
    if (hhmm(c.date) >= 915) { exitP = c.o; exitR = 'TIME'; exitIdx = i; break; }

    if (isLong) {
      if (c.l <= sl)              { exitP = sl;    exitR = 'SL';    exitIdx = i; break; }
      if (!t1Hit && c.h >= t1)    { t1Hit = true; }
      if (t1Hit  && c.h >= t2)    { exitP = t2;    exitR = 'T2';    exitIdx = i; break; }
      if (t1Hit  && c.l <= trail) { exitP = trail; exitR = 'TRAIL'; exitIdx = i; break; }
    } else {
      if (c.h >= sl)              { exitP = sl;    exitR = 'SL';    exitIdx = i; break; }
      if (!t1Hit && c.l <= t1)    { t1Hit = true; }
      if (t1Hit  && c.l <= t2)    { exitP = t2;    exitR = 'T2';    exitIdx = i; break; }
      if (t1Hit  && c.h >= trail) { exitP = trail; exitR = 'TRAIL'; exitIdx = i; break; }
    }
  }

  if (!exitP) { exitP = candles[candles.length - 1].c; exitR = 'EOD'; }

  let pnlPts;
  if (t1Hit) {
    const p1 = isLong ? t1 - entry    : entry - t1;
    const p2 = isLong ? exitP - entry : entry - exitP;
    pnlPts = p1 * 0.5 + p2 * 0.5;
  } else {
    pnlPts = isLong ? exitP - entry : entry - exitP;
  }

  return {
    trade: {
      entry, sl, t1, t2, exitPrice: exitP, exitReason: exitR, t1Hit,
      pnlPts:    +pnlPts.toFixed(2),
      pnlRupees: +(pnlPts * LOT_SIZE).toFixed(0),
      rr:        +(slPts > 0 ? pnlPts / slPts : 0).toFixed(2),
      slPts:     +slPts.toFixed(2),
    },
    exitIdx,
  };
}

// ─── Strategy 1: EMA9 x EMA21 Crossover + VWAP filter ────────────────────────
// Multiple trades per day allowed (re-enter after exit)
function runEMACross(dayCandles, trendBias = 'neutral') {
  const trades = [];
  if (dayCandles.length < 25) return trades;

  const vwaps = calcVWAP(dayCandles);
  const ema9  = calcEMA(dayCandles, 9);
  const ema21 = calcEMA(dayCandles, 21);

  let nextEntryIdx = 6; // don't trade first 6 candles (9:15-9:40)

  for (let i = Math.max(6, nextEntryIdx); i < dayCandles.length - 1; i++) {
    if (i < nextEntryIdx) continue;
    const c    = dayCandles[i];
    const prev = dayCandles[i - 1];
    const t    = hhmm(c.date);

    if (t > 900) break; // no new entries after 3:00

    const vwap    = vwaps[i];
    const e9      = ema9[i],  e9p  = ema9[i-1];
    const e21     = ema21[i], e21p = ema21[i-1];

    // Crossover detection
    const bullCross = e9p <= e21p && e9 > e21; // EMA9 crosses above EMA21
    const bearCross = e9p >= e21p && e9 < e21; // EMA9 crosses below EMA21

    // LONG: bull cross + price above VWAP + trend bullish
    if (bullCross && c.c > vwap && trendBias !== 'bear') {
      const entry = c.c;
      const sl    = Math.min(c.l, prev.l) - 8;
      if (entry - sl > 45) continue;
      const slPts = entry - sl;
      const t1    = entry + slPts * 1.5;
      const t2    = entry + slPts * 3.0;
      const { trade, exitIdx } = simulateTrade('LONG', entry, sl, t1, t2, dayCandles, i + 1, ema9);
      trades.push({ ...trade, day: fmtDate(c.date), strategy: 'EMA_CROSS', dir: 'LONG' });
      nextEntryIdx = exitIdx + 2; // cooldown: 2 candles after exit
    }

    // SHORT: bear cross + price below VWAP + trend bearish
    if (bearCross && c.c < vwap && trendBias !== 'bull') {
      const entry = c.c;
      const sl    = Math.max(c.h, prev.h) + 8;
      if (sl - entry > 45) continue;
      const slPts = sl - entry;
      const t1    = entry - slPts * 1.5;
      const t2    = entry - slPts * 3.0;
      const { trade, exitIdx } = simulateTrade('SHORT', entry, sl, t1, t2, dayCandles, i + 1, ema9);
      trades.push({ ...trade, day: fmtDate(c.date), strategy: 'EMA_CROSS', dir: 'SHORT' });
      nextEntryIdx = exitIdx + 2;
    }
  }
  return trades;
}

// ─── Strategy 2: VWAP Reclaim — multiple trades per day ──────────────────────
function runVWAPReclaim(dayCandles, trendBias = 'neutral') {
  const trades = [];
  if (dayCandles.length < 15) return trades;

  if (isDayTrending(dayCandles)) return trades;

  const vwaps = calcVWAP(dayCandles);
  const ema9  = calcEMA(dayCandles, 9);

  let nextEntryIdx = 0;

  for (let i = 3; i < dayCandles.length - 1; i++) {
    if (i < nextEntryIdx) continue;
    const c    = dayCandles[i];
    const vwap = vwaps[i];
    const t    = hhmm(c.date);

    if (t < 660 || t > 900) continue; // 11:00–15:00

    const dist    = c.c - vwap;
    const absDist = Math.abs(dist);

    // Distance: 35–90pts from VWAP
    if (absDist < 35 || absDist > 90) continue;

    // At least 1 candle of momentum fade
    const r0 = c.h - c.l;
    const r1 = dayCandles[i-1].h - dayCandles[i-1].l;
    if (r0 >= r1 * 1.1) continue; // current candle not smaller than previous

    // LONG — price below VWAP, only in uptrend
    if (dist < 0 && trendBias !== 'bear' && c.c > dayCandles[i-1].h) {
      const entry = c.c;
      const sl    = Math.min(c.l, dayCandles[i-1].l) - 10;
      if (entry - sl > 45) continue;
      const { trade, exitIdx } = simulateTrade('LONG', entry, sl, vwap, vwap + 30, dayCandles, i + 1, ema9);
      trades.push({ ...trade, day: fmtDate(c.date), strategy: 'VWAP', dir: 'LONG', distFromVWAP: +absDist.toFixed(1) });
      nextEntryIdx = exitIdx + 2;
    }

    // SHORT — price above VWAP, only in downtrend
    if (dist > 0 && trendBias !== 'bull' && c.c < dayCandles[i-1].l) {
      const entry = c.c;
      const sl    = Math.max(c.h, dayCandles[i-1].h) + 10;
      if (sl - entry > 45) continue;
      const { trade, exitIdx } = simulateTrade('SHORT', entry, sl, vwap, vwap - 30, dayCandles, i + 1, ema9);
      trades.push({ ...trade, day: fmtDate(c.date), strategy: 'VWAP', dir: 'SHORT', distFromVWAP: +absDist.toFixed(1) });
      nextEntryIdx = exitIdx + 2;
    }
  }
  return trades;
}

// ─── Summary printer ──────────────────────────────────────────────────────────
function printSummary(label, trades) {
  if (!trades.length) { console.log(`\n${label}: No trades`); return; }

  const wins    = trades.filter(t => t.pnlPts > 0);
  const losses  = trades.filter(t => t.pnlPts <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnlRupees, 0);
  const avgWin  = wins.length   ? wins.reduce((s, t) => s + t.pnlPts, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPts, 0) / losses.length : 0;
  const expect  = (wins.length / trades.length) * avgWin + (losses.length / trades.length) * avgLoss;

  let maxConsec = 0, streak = 0;
  for (const t of trades) {
    if (t.pnlPts <= 0) { streak++; maxConsec = Math.max(maxConsec, streak); } else streak = 0;
  }

  const byMonth = {};
  for (const t of trades) {
    const m = t.day.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { pnl: 0, count: 0, wins: 0 };
    byMonth[m].pnl += t.pnlRupees; byMonth[m].count++; if (t.pnlPts > 0) byMonth[m].wins++;
  }

  const byReason = {};
  for (const t of trades) byReason[t.exitReason] = (byReason[t.exitReason] || 0) + 1;

  const avgSL = trades.reduce((s, t) => s + t.slPts, 0) / trades.length;

  console.log(`\n${'─'.repeat(62)}`);
  console.log(`  ${label}`);
  console.log(`${'─'.repeat(62)}`);
  console.log(`  Trades         : ${trades.length}  (avg SL: ${avgSL.toFixed(1)} pts)`);
  console.log(`  Win rate       : ${((wins.length / trades.length) * 100).toFixed(1)}%  (${wins.length}W / ${losses.length}L)`);
  console.log(`  Total P&L      : ₹${totalPnl.toLocaleString('en-IN')}  (${(totalPnl / trades.length).toFixed(0)} avg/trade)`);
  console.log(`  Avg winner     : ${avgWin.toFixed(1)} pts   Avg loser: ${avgLoss.toFixed(1)} pts`);
  console.log(`  Best / Worst   : ${Math.max(...trades.map(t => t.pnlPts)).toFixed(1)} / ${Math.min(...trades.map(t => t.pnlPts)).toFixed(1)} pts`);
  console.log(`  Expectancy     : ${expect.toFixed(2)} pts/trade`);
  console.log(`  Max consec loss: ${maxConsec}`);
  console.log(`  Exit reasons   : ${Object.entries(byReason).map(([k,v])=>`${k}:${v}`).join('  ')}`);
  console.log(`\n  Monthly:`);
  for (const [m, d] of Object.entries(byMonth)) {
    const wr   = ((d.wins / d.count) * 100).toFixed(0);
    const sign = d.pnl >= 0 ? '+' : '';
    console.log(`    ${m}  ${(sign + '₹' + Math.abs(d.pnl).toLocaleString('en-IN')).padStart(12)}  ${d.count} trades  ${wr}% win`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const toDate   = new Date();
  const fromDate = new Date(); fromDate.setMonth(fromDate.getMonth() - 6);

  console.log(`\nNifty 5-min Backtest v2`);
  console.log(`Period : ${fmtDate(fromDate)} → ${fmtDate(toDate)}`);
  console.log(`Changes: tighter SL, regime filter, trend filter on VWAP, OR range 30-80pts\n`);
  console.log('Fetching candles...');

  const [c5m, cDay] = await Promise.all([
    fetchAll(NIFTY_TOKEN, '5minute', fmtDate(fromDate), fmtDate(toDate)),
    fetchAll(NIFTY_TOKEN, 'day',     fmtDate(fromDate), fmtDate(toDate)),
  ]);

  console.log(`\n5-min candles : ${c5m.length}`);
  console.log(`Daily candles : ${cDay.length}`);

  const dailyMap = new Map();
  for (const d of cDay) dailyMap.set(fmtDate(d.date), d);

  // Compute 20-day EMA on daily closes for trend filter
  const dailyArr  = cDay.sort((a, b) => a.date - b.date);
  const dailyEMA20 = calcEMA(dailyArr, 20);
  const dailyEMAMap = new Map();
  for (let i = 0; i < dailyArr.length; i++) {
    dailyEMAMap.set(fmtDate(dailyArr[i].date), { ema20: dailyEMA20[i], close: dailyArr[i].c });
  }

  const days    = groupByDay(c5m);
  const dayKeys = [...days.keys()].sort();
  const allORB  = [], allVWAP = [];

  console.log(`\nRunning on ${dayKeys.length} trading days...`);

  for (let i = 1; i < dayKeys.length; i++) {
    const key     = dayKeys[i];
    const prevKey = dayKeys[i - 1];
    const dayC    = days.get(key);
    const prevDay = dailyMap.get(prevKey);
    const cpr     = calcCPR(prevDay);

    // Daily trend bias from previous day's EMA20
    const prevEMAData = dailyEMAMap.get(prevKey);
    const trendBias   = !prevEMAData ? 'neutral'
      : prevEMAData.close > prevEMAData.ema20 ? 'bull' : 'bear';

    allORB.push(...runEMACross(dayC, trendBias));
    allVWAP.push(...runVWAPReclaim(dayC, trendBias));
  }

  printSummary('Strategy 1 — EMA9 x EMA21 Crossover', allORB);
  printSummary('Strategy 2 v2 — VWAP Reclaim', allVWAP);
  printSummary('Combined', [...allORB, ...allVWAP].sort((a, b) => a.day.localeCompare(b.day)));

  const outPath = resolve(__dirname, 'backtest-results.json');
  writeFileSync(outPath, JSON.stringify({ orb: allORB, vwap: allVWAP }, null, 2));
  console.log(`\nFull trade log → scripts/backtest-results.json`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
