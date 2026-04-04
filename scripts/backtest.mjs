#!/usr/bin/env node
// ─── Nifty 5-min Options Backtest — EMA Cross + VWAP Reclaim ─────────────────
// P&L calculated using Black-Scholes option pricing
// Assumes buying ATM call/put when strategy triggers
// Run: node scripts/backtest.mjs

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

const NIFTY_TOKEN  = '256265';
const LOT_SIZE     = 65;
const RISK_FREE    = 0.065;      // 6.5% annual
const BASE_IV      = 0.15;       // 15% base IV for Nifty
const BROKERAGE    = 100;        // ₹100 per round trip (options, all-in)
const headers      = { 'X-Kite-Version': '3', Authorization: `token ${API_KEY}:${ACCESS_TOKEN}` };

// ─── Black-Scholes ─────────────────────────────────────────────────────────────
function normCDF(x) {
  const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function bsPrice(spot, strike, T, sigma, type) {
  if (T <= 0) return Math.max(0, type === 'call' ? spot - strike : strike - spot);
  const d1 = (Math.log(spot / strike) + (RISK_FREE + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (type === 'call') {
    return spot * normCDF(d1) - strike * Math.exp(-RISK_FREE * T) * normCDF(d2);
  } else {
    return strike * Math.exp(-RISK_FREE * T) * normCDF(-d2) - spot * normCDF(-d1);
  }
}

function bsDelta(spot, strike, T, sigma, type) {
  if (T <= 0) return type === 'call' ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0);
  const d1 = (Math.log(spot / strike) + (RISK_FREE + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  return type === 'call' ? normCDF(d1) : normCDF(d1) - 1;
}

// ─── Options helpers ──────────────────────────────────────────────────────────
function atmStrike(price) { return Math.round(price / 50) * 50; }

// Days to next Tuesday (Nifty weekly expiry) as fraction of year
function dteToNextTuesday(date) {
  const d = new Date(date);
  d.setHours(15, 30, 0, 0); // expiry at 3:30pm
  const day = d.getDay(); // 0=Sun, 2=Tue
  const daysUntil = day <= 2 ? 2 - day : 9 - day; // next Tuesday
  const expiry = new Date(d);
  expiry.setDate(d.getDate() + (daysUntil === 0 ? 7 : daysUntil));
  const msLeft = expiry.getTime() - date.getTime();
  return Math.max(msLeft / (365 * 24 * 3600 * 1000), 1 / (365 * 24)); // min 1 hour
}

// IV adjustment — higher on high-range days
function getIV(dayCandles) {
  const hi    = Math.max(...dayCandles.map(c => c.h));
  const lo    = Math.min(...dayCandles.map(c => c.l));
  const range = hi - lo;
  if (range > 300) return 0.22;
  if (range > 200) return 0.18;
  return BASE_IV;
}

// Entry premium + metadata
function calcEntryOption(spot, date, dir, iv) {
  const strike = atmStrike(spot);
  const T      = dteToNextTuesday(date);
  const type   = dir === 'LONG' ? 'call' : 'put';
  const prem   = bsPrice(spot, strike, T, iv, type);
  const delta  = Math.abs(bsDelta(spot, strike, T, iv, type));
  return { strike, T, type, entryPrem: prem, entryDelta: delta };
}

// Exit premium given current spot + elapsed time
function calcExitPrem(spot, strike, entryT, elapsedHours, iv, type) {
  const T = Math.max(entryT - elapsedHours / (365 * 24), 1 / (365 * 24 * 60));
  return bsPrice(spot, strike, T, iv, type);
}

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

function calcVWAP(candles) {
  let sum = 0;
  return candles.map((c, i) => { sum += (c.h + c.l + c.c) / 3; return sum / (i + 1); });
}

function calcEMA(candles, period) {
  const k = 2 / (period + 1);
  let ema  = candles[0].c;
  return candles.map(c => { ema = c.c * k + ema * (1 - k); return ema; });
}

function isDayTrending(candles) {
  const morning = candles.filter(c => hhmm(c.date) <= 690);
  if (morning.length < 5) return false;
  return Math.max(...morning.map(c => c.h)) - Math.min(...morning.map(c => c.l)) > 220;
}


// ─── Options trade simulator ──────────────────────────────────────────────────
// SL = 40% premium loss, T1 = 80% gain, T2 = 160% gain
// Trail after T1: exit if premium drops 30% from peak
function simulateOptionTrade(dir, entrySpot, entryDate, candles, startIdx, iv) {
  const { strike, T: entryT, type, entryPrem } = calcEntryOption(entrySpot, entryDate, dir, iv);

  if (entryPrem < 10) return null; // too cheap, skip

  const slPrem     = entryPrem * 0.60;  // exit if premium drops to 60% (40% loss)
  const t1Prem     = entryPrem * 1.80;  // T1 at 80% gain
  const t2Prem     = entryPrem * 2.60;  // T2 at 160% gain
  const entryTime  = entryDate.getTime();

  let t1Hit    = false;
  let peakPrem = entryPrem;
  let exitPrem = null, exitR = null, exitIdx = candles.length - 1;

  for (let i = startIdx; i < candles.length; i++) {
    const c           = candles[i];
    const t           = hhmm(c.date);
    const elapsedHrs  = (c.date.getTime() - entryTime) / 3600000;

    if (t >= 915) {
      exitPrem = calcExitPrem(c.o, strike, entryT, elapsedHrs, iv, type);
      exitR = 'TIME'; exitIdx = i; break;
    }


    // Check at candle close (use midpoint of candle for intraday)
    const checkSpots = [
      dir === 'LONG' ? c.l : c.h,  // worst point
      c.c,                           // close
    ];

    let hit = false;
    for (const spot of checkSpots) {
      const prem = calcExitPrem(spot, strike, entryT, elapsedHrs, iv, type);
      peakPrem   = Math.max(peakPrem, prem);

      // SL hit
      if (prem <= slPrem) {
        exitPrem = slPrem; exitR = 'SL'; exitIdx = i; hit = true; break;
      }

      // T1 hit
      if (!t1Hit && prem >= t1Prem) {
        t1Hit = true;
      }

      // T2 hit
      if (t1Hit && prem >= t2Prem) {
        exitPrem = t2Prem; exitR = 'T2'; exitIdx = i; hit = true; break;
      }

      // Trail after T1: exit if premium falls 30% from peak
      if (t1Hit && prem <= peakPrem * 0.70) {
        exitPrem = prem; exitR = 'TRAIL'; exitIdx = i; hit = true; break;
      }
    }
    if (hit) break;
  }

  if (!exitPrem) {
    const last       = candles[candles.length - 1];
    const elapsedHrs = (last.date.getTime() - entryTime) / 3600000;
    exitPrem = calcExitPrem(last.c, strike, entryT, elapsedHrs, iv, type);
    exitR    = 'EOD';
  }

  // P&L
  let pnlPerUnit;
  if (t1Hit && exitR !== 'T2') {
    // Partial exit: 50% at T1, 50% at trail/time
    pnlPerUnit = (t1Prem - entryPrem) * 0.5 + (exitPrem - entryPrem) * 0.5;
  } else {
    pnlPerUnit = exitPrem - entryPrem;
  }

  const grossRupees = pnlPerUnit * LOT_SIZE;
  const netRupees   = grossRupees - BROKERAGE;

  return {
    trade: {
      entryPrem:    +entryPrem.toFixed(2),
      exitPrem:     +exitPrem.toFixed(2),
      strike,
      type,
      exitReason:   exitR,
      t1Hit,
      pnlPerUnit:   +pnlPerUnit.toFixed(2),
      pnlGross:     +grossRupees.toFixed(0),
      pnlNet:       +netRupees.toFixed(0),
      premGainPct:  +(pnlPerUnit / entryPrem * 100).toFixed(1),
      capitalUsed:  +(entryPrem * LOT_SIZE).toFixed(0),
    },
    exitIdx,
  };
}

// ─── Strategy 1: EMA9 × EMA21 Crossover ──────────────────────────────────────
function runEMACross(dayCandles, trendBias, iv) {
  const trades = [];
  if (dayCandles.length < 25) return trades;

  const vwaps = calcVWAP(dayCandles);
  const ema9  = calcEMA(dayCandles, 9);
  const ema21 = calcEMA(dayCandles, 21);

  let nextEntryIdx = 6;

  for (let i = Math.max(6, nextEntryIdx); i < dayCandles.length - 1; i++) {
    if (i < nextEntryIdx) continue;
    const c    = dayCandles[i];
    const t    = hhmm(c.date);
    if (t > 900) break;

    const vwap    = vwaps[i];
    const e9      = ema9[i],  e9p  = ema9[i-1];
    const e21     = ema21[i], e21p = ema21[i-1];
    const bullCross = e9p <= e21p && e9 > e21;
    const bearCross = e9p >= e21p && e9 < e21;

    if (bullCross && c.c > vwap && trendBias !== 'bear') {
      const result = simulateOptionTrade('LONG', c.c, c.date, dayCandles, i + 1, iv);
      if (result) {
        trades.push({ ...result.trade, day: fmtDate(c.date), strategy: 'EMA_CROSS', dir: 'LONG' });
        nextEntryIdx = result.exitIdx + 2;
      }
    }

    if (bearCross && c.c < vwap && trendBias !== 'bull') {
      const result = simulateOptionTrade('SHORT', c.c, c.date, dayCandles, i + 1, iv);
      if (result) {
        trades.push({ ...result.trade, day: fmtDate(c.date), strategy: 'EMA_CROSS', dir: 'SHORT' });
        nextEntryIdx = result.exitIdx + 2;
      }
    }
  }
  return trades;
}

// ─── Strategy 2: VWAP Reclaim ─────────────────────────────────────────────────
function runVWAPReclaim(dayCandles, trendBias, iv) {
  const trades = [];
  if (dayCandles.length < 15 || isDayTrending(dayCandles)) return trades;

  const vwaps = calcVWAP(dayCandles);
  let nextEntryIdx = 0;

  for (let i = 3; i < dayCandles.length - 1; i++) {
    if (i < nextEntryIdx) continue;
    const c    = dayCandles[i];
    const vwap = vwaps[i];
    const t    = hhmm(c.date);

    if (t < 660 || t > 900) continue;

    const dist    = c.c - vwap;
    const absDist = Math.abs(dist);
    if (absDist < 35 || absDist > 90) continue;

    const r0 = c.h - c.l;
    const r1 = dayCandles[i-1].h - dayCandles[i-1].l;
    if (r0 >= r1 * 1.1) continue;

    if (dist < 0 && trendBias !== 'bear' && c.c > dayCandles[i-1].h) {
      const result = simulateOptionTrade('LONG', c.c, c.date, dayCandles, i + 1, iv);
      if (result) {
        trades.push({ ...result.trade, day: fmtDate(c.date), strategy: 'VWAP', dir: 'LONG', distFromVWAP: +absDist.toFixed(1) });
        nextEntryIdx = result.exitIdx + 2;
      }
    }

    if (dist > 0 && trendBias !== 'bull' && c.c < dayCandles[i-1].l) {
      const result = simulateOptionTrade('SHORT', c.c, c.date, dayCandles, i + 1, iv);
      if (result) {
        trades.push({ ...result.trade, day: fmtDate(c.date), strategy: 'VWAP', dir: 'SHORT', distFromVWAP: +absDist.toFixed(1) });
        nextEntryIdx = result.exitIdx + 2;
      }
    }
  }
  return trades;
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function printSummary(label, trades) {
  if (!trades.length) { console.log(`\n${label}: No trades`); return; }

  const wins      = trades.filter(t => t.pnlNet > 0);
  const losses    = trades.filter(t => t.pnlNet <= 0);
  const totalNet  = trades.reduce((s, t) => s + t.pnlNet, 0);
  const totalCap  = trades.reduce((s, t) => s + t.capitalUsed, 0);
  const avgCap    = totalCap / trades.length;
  const avgWinPct = wins.length   ? wins.reduce((s, t) => s + t.premGainPct, 0) / wins.length : 0;
  const avgLosPct = losses.length ? losses.reduce((s, t) => s + t.premGainPct, 0) / losses.length : 0;
  const avgPrem   = trades.reduce((s, t) => s + t.entryPrem, 0) / trades.length;

  let maxConsec = 0, streak = 0;
  for (const t of trades) {
    if (t.pnlNet <= 0) { streak++; maxConsec = Math.max(maxConsec, streak); } else streak = 0;
  }

  const byMonth = {};
  for (const t of trades) {
    const m = t.day.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { net: 0, count: 0, wins: 0, cap: 0 };
    byMonth[m].net   += t.pnlNet;
    byMonth[m].count++;
    byMonth[m].cap   += t.capitalUsed;
    if (t.pnlNet > 0) byMonth[m].wins++;
  }

  const byReason = {};
  for (const t of trades) byReason[t.exitReason] = (byReason[t.exitReason] || 0) + 1;

  // Max drawdown (consecutive loss capital)
  const maxDrawdown = maxConsec * avgCap;

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${label}`);
  console.log(`${'─'.repeat(64)}`);
  console.log(`  Trades         : ${trades.length}   Avg premium: ₹${avgPrem.toFixed(0)}/unit`);
  console.log(`  Win rate       : ${((wins.length / trades.length) * 100).toFixed(1)}%  (${wins.length}W / ${losses.length}L)`);
  console.log(`  Total P&L (net): ₹${totalNet.toLocaleString('en-IN')}  (₹${(totalNet / trades.length).toFixed(0)} avg/trade)`);
  console.log(`  Avg winner     : +${avgWinPct.toFixed(1)}% premium   Avg loser: ${avgLosPct.toFixed(1)}%`);
  console.log(`  Avg capital/trade: ₹${avgCap.toFixed(0)}  (1 lot premium)`);
  console.log(`  Max consec loss: ${maxConsec}  (≈₹${maxDrawdown.toFixed(0)} drawdown)`);
  console.log(`  Exit reasons   : ${Object.entries(byReason).map(([k,v])=>`${k}:${v}`).join('  ')}`);
  console.log(`\n  Monthly (net P&L / trades / win% / avg capital deployed):`);
  for (const [m, d] of Object.entries(byMonth)) {
    const wr   = ((d.wins / d.count) * 100).toFixed(0);
    const sign = d.net >= 0 ? '+' : '';
    const cap  = (d.cap / d.count).toFixed(0);
    console.log(`    ${m}  ${(sign + '₹' + Math.abs(d.net).toLocaleString('en-IN')).padStart(12)}  ${d.count} trades  ${wr}% win  avg ₹${cap} capital`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const toDate   = new Date();
  const fromDate = new Date(); fromDate.setMonth(fromDate.getMonth() - 6);

  console.log(`\nNifty 5-min Options Backtest`);
  console.log(`Period  : ${fmtDate(fromDate)} → ${fmtDate(toDate)}`);
  console.log(`Model   : Black-Scholes, ATM options, IV=15% base`);
  console.log(`Capital : 1 lot premium per trade (not futures margin)`);
  console.log(`Costs   : ₹100/trade all-in (brokerage + charges)\n`);
  console.log('Fetching candles...');

  const [c5m, cDay] = await Promise.all([
    fetchAll(NIFTY_TOKEN, '5minute', fmtDate(fromDate), fmtDate(toDate)),
    fetchAll(NIFTY_TOKEN, 'day',     fmtDate(fromDate), fmtDate(toDate)),
  ]);

  console.log(`\n5-min candles : ${c5m.length}`);
  console.log(`Daily candles : ${cDay.length}`);

  const dailyMap  = new Map();
  for (const d of cDay) dailyMap.set(fmtDate(d.date), d);

  const dailyArr   = cDay.sort((a, b) => a.date - b.date);
  const dailyEMA20 = calcEMA(dailyArr, 20);
  const dailyEMAMap = new Map();
  for (let i = 0; i < dailyArr.length; i++) {
    dailyEMAMap.set(fmtDate(dailyArr[i].date), { ema20: dailyEMA20[i], close: dailyArr[i].c });
  }

  const days    = groupByDay(c5m);
  const dayKeys = [...days.keys()].sort();
  const allEMA  = [], allVWAP = [];

  console.log(`\nRunning on ${dayKeys.length} trading days...\n`);

  for (let i = 1; i < dayKeys.length; i++) {
    const key     = dayKeys[i];
    const prevKey = dayKeys[i - 1];
    const dayC    = days.get(key);
    const prevEMAData = dailyEMAMap.get(prevKey);
    const trendBias   = !prevEMAData ? 'neutral'
      : prevEMAData.close > prevEMAData.ema20 ? 'bull' : 'bear';

    const iv = getIV(dayC);

    allEMA.push(...runEMACross(dayC, trendBias, iv));
    allVWAP.push(...runVWAPReclaim(dayC, trendBias, iv));
  }

  printSummary('Strategy 1 — EMA9×21 Crossover (Options)', allEMA);
  printSummary('Strategy 2 — VWAP Reclaim (Options)', allVWAP);
  printSummary('Combined', [...allEMA, ...allVWAP].sort((a, b) => a.day.localeCompare(b.day)));

  // Capital efficiency summary
  const all = [...allEMA, ...allVWAP];
  if (all.length) {
    const totalNet = all.reduce((s, t) => s + t.pnlNet, 0);
    const avgCap   = all.reduce((s, t) => s + t.capitalUsed, 0) / all.length;
    console.log(`\n${'─'.repeat(64)}`);
    console.log(`  Capital Efficiency`);
    console.log(`${'─'.repeat(64)}`);
    console.log(`  Avg capital per trade  : ₹${avgCap.toFixed(0)} (1 ATM lot premium)`);
    console.log(`  If running 1 trade/day : need ₹${avgCap.toFixed(0)} liquid`);
    console.log(`  Safety buffer (7 losses): ₹${(avgCap * 7).toFixed(0)}`);
    console.log(`  Recommended capital    : ₹${(avgCap * 10).toFixed(0)} total`);
    console.log(`  6-month net return     : ₹${totalNet.toLocaleString('en-IN')} on ₹${(avgCap * 10).toFixed(0)} = ${((totalNet / (avgCap * 10)) * 100).toFixed(1)}%`);
  }

  writeFileSync(resolve(__dirname, 'backtest-results.json'), JSON.stringify({ ema: allEMA, vwap: allVWAP }, null, 2));
  console.log(`\nFull log → scripts/backtest-results.json`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
