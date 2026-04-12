'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Nav from '../../components/Nav';

// ── Pure helpers ──────────────────────────────────────────────────────────────
function fmt(n, d = 0)  { return n != null ? Number(n).toFixed(d) : '—'; }
function fmtL(n)        { if (!n) return '—'; return n >= 100000 ? (n/100000).toFixed(1)+'L' : (n/1000).toFixed(0)+'K'; }
function fmtPct(n)      { return n != null ? (n > 0 ? '+' : '') + n.toFixed(2) + '%' : '—'; }

// Get current IST time as a regular Date (UTC hours = IST hours)
function getIST() {
  return new Date(Date.now() + 5.5 * 3600 * 1000);
}

function isExpiryToday(expiryStr) {
  if (!expiryStr) return false;
  const today = getIST().toISOString().slice(0, 10);
  return expiryStr.slice(0, 10) === today;
}

function daysUntilExpiry(expiryStr) {
  if (!expiryStr) return null;
  const exp  = new Date(expiryStr);
  const now  = getIST();
  return Math.ceil((exp - now) / (24 * 3600 * 1000));
}

// Max pain: strike where total option payout to holders (buyers) is MINIMUM
// Writers (sellers) benefit most at this price
function computeMaxPain(strikes) {
  if (!strikes?.length) return null;
  let minPayout = Infinity, result = null;
  for (const target of strikes) {
    const X = target.strike;
    let payout = 0;
    for (const s of strikes) {
      if (s.ce?.oi && X > s.strike) payout += s.ce.oi * (X - s.strike);
      if (s.pe?.oi && X < s.strike) payout += s.pe.oi * (s.strike - X);
    }
    if (payout < minPayout) { minPayout = payout; result = X; }
  }
  return result;
}

// PCR = total Put OI / total Call OI
function computePCR(strikes) {
  if (!strikes?.length) return null;
  const ce = strikes.reduce((s, r) => s + (r.ce?.oi || 0), 0);
  const pe = strikes.reduce((s, r) => s + (r.pe?.oi || 0), 0);
  return ce > 0 ? pe / ce : null;
}

// Top N resistance (call OI) and support (put OI) strikes
function computeOIWalls(strikes, n = 4) {
  if (!strikes?.length) return { resistance: [], support: [] };
  const resistance = [...strikes].sort((a, b) => (b.ce?.oi||0) - (a.ce?.oi||0)).slice(0, n)
    .map(s => ({ strike: s.strike, oi: s.ce?.oi||0 }));
  const support = [...strikes].sort((a, b) => (b.pe?.oi||0) - (a.pe?.oi||0)).slice(0, n)
    .map(s => ({ strike: s.strike, oi: s.pe?.oi||0 }));
  return { resistance, support };
}

function getPinScore(spot, maxPain) {
  if (spot == null || !maxPain) return null;
  const d = Math.abs(spot - maxPain);
  if (d < 30)  return { label: 'STRONG PIN',   color: 'text-emerald-400', bar: 'bg-emerald-500', pct: 90, desc: `${d.toFixed(0)}pts from max pain — very high close probability here.` };
  if (d < 75)  return { label: 'MODERATE PIN', color: 'text-amber-400',   bar: 'bg-amber-500',   pct: 65, desc: `${d.toFixed(0)}pts from max pain — gravitational pull likely as session progresses.` };
  if (d < 150) return { label: 'WEAK PIN',     color: 'text-orange-400',  bar: 'bg-orange-500',  pct: 35, desc: `${d.toFixed(0)}pts from max pain — some pull but spot may close away.` };
  return       { label: 'NO PIN',         color: 'text-red-400',     bar: 'bg-red-500',     pct: 10, desc: `${d.toFixed(0)}pts from max pain — trending day, pinning unlikely.` };
}

function getGammaLevel(istH, istM) {
  const t = istH * 60 + istM;
  if (t >= 15*60)     return { label: 'EXTREME ⚡', color: 'text-red-400',    bg: 'bg-red-500/15 border-red-500/30',     msg: 'Past 3 PM — close/hedge all short straddles before 3:15 PM. Any ATM move is explosive.' };
  if (t >= 14*60)     return { label: 'HIGH ⚡',    color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30', msg: '2–3 PM high gamma zone. A 50pt move can double an ATM option. No new short straddle entries.' };
  if (t >= 12*60)     return { label: 'MEDIUM',     color: 'text-amber-400',  bg: 'bg-amber-500/15 border-amber-500/30',  msg: 'Post-noon: theta accelerating. Sellers gaining edge. Watch for sharp ATM moves.' };
  return              { label: 'LOW',          color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', msg: 'Morning session — normal gamma. Monitor direction before sizing up.' };
}

// How much of day's theta should have decayed (rough non-linear model)
function decayProgress(istH, istM) {
  const elapsed = Math.max(0, istH * 60 + istM - (9*60+15));
  return Math.min(100, Math.round(100 * Math.sqrt(Math.min(elapsed, 375) / 375)));
}

// ── Short Squeeze Risk Engine ─────────────────────────────────────────────────
// Returns a score 0-100 + per-signal breakdown.
// A squeeze forms when: spot is deeply below max pain (magnetic upward pull),
// PCR is very low (extreme bearish consensus = huge short book = contrarian fuel),
// IV is inflated (sellers complacent, options expensive = covering is violent),
// and straddle is confirming directional expansion rather than decaying.
function computeShortSqueezeRisk({ spot, maxPain, pcr, ivHvRatio, straddleCandles, walls, prevPCR }) {
  if (spot == null || !maxPain || pcr == null) return null;

  const signals = [];
  let totalScore = 0;

  // ── Signal 1: Spot vs Max Pain (weight: 35pts)
  // If spot is BELOW max pain, there is natural upward gravitational pull.
  // The further below, the more violent the potential squeeze.
  const mpDelta = maxPain - spot; // positive = spot below max pain (bullish squeeze setup)
  let mpScore = 0;
  let mpLabel = '';
  let mpDesc = '';
  if (mpDelta >= 300) { mpScore = 35; mpLabel = 'CRITICAL'; mpDesc = `Spot is ${mpDelta.toFixed(0)}pts BELOW max pain ₹${maxPain} — extreme magnetic pull upward. Short book is deeply underwater.`; }
  else if (mpDelta >= 150) { mpScore = 25; mpLabel = 'HIGH'; mpDesc = `Spot is ${mpDelta.toFixed(0)}pts below max pain ₹${maxPain}. Strong upside gravitational pull building.`; }
  else if (mpDelta >= 75)  { mpScore = 15; mpLabel = 'MODERATE'; mpDesc = `Spot is ${mpDelta.toFixed(0)}pts below max pain — some upward pull. Watch for acceleration.`; }
  else if (mpDelta >= 0)   { mpScore = 5;  mpLabel = 'LOW'; mpDesc = `Spot near or at max pain — limited squeeze fuel from this signal.`; }
  else                     { mpScore = 0;  mpLabel = 'NONE'; mpDesc = `Spot is ABOVE max pain — downside gravity, not a squeeze setup from this signal.`; }
  signals.push({ name: 'Spot vs Max Pain', score: mpScore, max: 35, label: mpLabel, desc: mpDesc, icon: '🎯' });
  totalScore += mpScore;

  // ── Signal 2: PCR (weight: 30pts)
  // Extremely low PCR = everyone is bearish = massive short book = fuel
  // Paradox: low PCR on expiry morning is contrarian BULLISH (squeeze fuel)
  let pcrScore = 0;
  let pcrLabel = '';
  let pcrDesc = '';
  if (pcr < 0.45)      { pcrScore = 30; pcrLabel = 'EXTREME FUEL'; pcrDesc = `PCR ${pcr.toFixed(2)} — historically extreme bearish consensus. This level of call-writing dominance is the hallmark of a short-covering event.`; }
  else if (pcr < 0.60) { pcrScore = 22; pcrLabel = 'HIGH FUEL'; pcrDesc = `PCR ${pcr.toFixed(2)} — very bearish positioning. Large short book in place; put wall defense means violent covering if that level breaks.`; }
  else if (pcr < 0.75) { pcrScore = 13; pcrLabel = 'MODERATE FUEL'; pcrDesc = `PCR ${pcr.toFixed(2)} — mildly skewed toward bears. Some short fuel but consensus not extreme enough for a full squeeze.`; }
  else if (pcr < 0.90) { pcrScore = 5;  pcrLabel = 'LOW FUEL'; pcrDesc = `PCR ${pcr.toFixed(2)} — near-balanced. Limited squeeze fuel from positioning alone.`; }
  else                 { pcrScore = 0;  pcrLabel = 'NONE'; pcrDesc = `PCR ${pcr.toFixed(2)} — put-heavy. Market not in an oversold short-heavy state; different risk profile.`; }
  // PCR trend bonus: if PCR is rising fast (shorts covering puts), add 5pts
  const pcrTrend = prevPCR != null && (pcr - prevPCR) > 0.08;
  if (pcrTrend && pcrScore > 0) { pcrScore = Math.min(pcrScore + 5, 30); pcrDesc += ` PCR rising rapidly from ${prevPCR?.toFixed(2)} — active covering underway.`; }
  signals.push({ name: 'PCR (Short Book Size)', score: pcrScore, max: 30, label: pcrLabel, desc: pcrDesc, icon: '📊', trend: pcrTrend ? '↑' : null });
  totalScore += pcrScore;

  // ── Signal 3: IV/HV Ratio (weight: 20pts)
  // High IV relative to realised vol = sellers are complacent, premiums inflated
  // When covering hits, these inflated options explode — amplifying the move
  let ivScore = 0;
  let ivLabel = '';
  let ivDesc = '';
  if (ivHvRatio != null) {
    if (ivHvRatio >= 1.5)      { ivScore = 20; ivLabel = 'EXTREME'; ivDesc = `IV/HV ${ivHvRatio.toFixed(2)}× — options severely overpriced vs realised vol. Short-sellers are complacent; covering will be explosive.`; }
    else if (ivHvRatio >= 1.3) { ivScore = 14; ivLabel = 'HIGH'; ivDesc = `IV/HV ${ivHvRatio.toFixed(2)}× — elevated IV. If a squeeze triggers, option moves will amplify the price action.`; }
    else if (ivHvRatio >= 1.1) { ivScore = 8;  ivLabel = 'MODERATE'; ivDesc = `IV/HV ${ivHvRatio.toFixed(2)}× — options mildly expensive. Normal squeeze conditions.`; }
    else                       { ivScore = 2;  ivLabel = 'LOW'; ivDesc = `IV/HV ${ivHvRatio.toFixed(2)}× — IV near realised vol. Squeeze less likely to be violent.`; }
  } else {
    ivLabel = 'NO DATA'; ivDesc = 'IV/HV data unavailable.';
  }
  signals.push({ name: 'IV / Realised Vol', score: ivScore, max: 20, label: ivLabel, desc: ivDesc, icon: '📈' });
  totalScore += ivScore;

  // ── Signal 4: Straddle Direction (weight: 15pts)
  // On a sQueeze day, the straddle premium should be RISING (not decaying)
  // Rising straddle = IV expansion = directional move, not a theta-decay day
  let sScore = 0;
  let sLabel = '';
  let sDesc = '';
  if (straddleCandles?.length >= 3) {
    const open = straddleCandles[0].value;
    const recent = straddleCandles[straddleCandles.length - 1].value;
    const pctChange = ((recent - open) / open) * 100;
    if (pctChange >= 20)       { sScore = 15; sLabel = 'EXPANDING'; sDesc = `Straddle UP ${pctChange.toFixed(0)}% from open — IV exploding. A directional move is already underway; this is live squeeze confirmation.`; }
    else if (pctChange >= 8)   { sScore = 10; sLabel = 'RISING'; sDesc = `Straddle UP ${pctChange.toFixed(0)}% — premium expanding. Market is pricing in a breakout; early squeeze signal.`; }
    else if (pctChange >= -5)  { sScore = 5;  sLabel = 'FLAT'; sDesc = `Straddle roughly flat. No clear directional conviction yet, but conditions are ripe.`; }
    else                       { sScore = 0;  sLabel = 'DECAYING'; sDesc = `Straddle DOWN ${Math.abs(pctChange).toFixed(0)}% — theta winning. Less likely a squeeze day; sellers in control.`; }
  } else {
    sLabel = 'NO DATA'; sDesc = 'Straddle intraday data not yet available (pre-market or data loading).';
    sScore = 5; // neutral pre-market
  }
  signals.push({ name: 'Straddle Direction', score: sScore, max: 15, label: sLabel, desc: sDesc, icon: '⚡' });
  totalScore += sScore;

  // ── Overall Risk Level
  let risk, riskColor, riskBg, riskBorder, riskMsg, riskEmoji;
  if (totalScore >= 75) {
    risk = 'EXTREME'; riskEmoji = '🚨';
    riskColor = 'text-red-400';
    riskBg = 'bg-red-500/10'; riskBorder = 'border-red-500/30';
    riskMsg = 'Conditions for a violent short squeeze are fully aligned. Be prepared for a fast, one-directional up-move. Watch the nearest put wall as the ignition trigger — once it breaks up, covering accelerates.';
  } else if (totalScore >= 50) {
    risk = 'HIGH'; riskEmoji = '🔥';
    riskColor = 'text-orange-400';
    riskBg = 'bg-orange-500/10'; riskBorder = 'border-orange-500/30';
    riskMsg = 'Short squeeze conditions are building. Multiple signals align — a catalyst or put-wall break could trigger rapid short covering. Avoid new short positions without a clear thesis.';
  } else if (totalScore >= 28) {
    risk = 'MODERATE'; riskEmoji = '⚠️';
    riskColor = 'text-amber-400';
    riskBg = 'bg-amber-500/10'; riskBorder = 'border-amber-500/30';
    riskMsg = 'Some squeeze conditions present but not at critical levels. Monitor PCR and straddle direction for escalation. Be cautious initiating new shorts.';
  } else {
    risk = 'LOW'; riskEmoji = '✅';
    riskColor = 'text-emerald-400';
    riskBg = 'bg-emerald-500/8'; riskBorder = 'border-emerald-500/20';
    riskMsg = 'No significant short-squeeze pressure detected. Normal expiry dynamics — focus on pinning and theta decay.';
  }

  // Ignition level: the nearest put wall ABOVE spot (where covering accelerates)
  const ignitionWall = walls?.support
    ?.filter(s => s.strike > spot)
    .sort((a, b) => a.strike - b.strike)[0] ?? null;
  // Also find the nearest put wall AT or BELOW spot (defending floor)
  const floorWall = walls?.support
    ?.filter(s => s.strike <= spot)
    .sort((a, b) => b.strike - a.strike)[0] ?? null;

  return { score: totalScore, risk, riskColor, riskBg, riskBorder, riskMsg, riskEmoji, signals, ignitionWall, floorWall, mpDelta };
}

// ── Short Squeeze Risk Card Component ─────────────────────────────────────────
function ShortSqueezeCard({ squeeze, spot }) {
  const [expanded, setExpanded] = useState(false);
  if (!squeeze) return null;

  const { score, risk, riskColor, riskBg, riskBorder, riskMsg, riskEmoji, signals, ignitionWall, floorWall, mpDelta } = squeeze;

  return (
    <div className={`rounded-xl border overflow-hidden ${riskBg} ${riskBorder}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 pt-3.5 pb-3 flex items-center gap-3 text-left"
      >
        <span className="text-xl leading-none">{riskEmoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Short Squeeze Risk</span>
            <span className={`text-sm font-black ${riskColor}`}>{risk}</span>
          </div>
          {/* Score bar */}
          <div className="mt-1.5 h-1.5 bg-black/30 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                score >= 75 ? 'bg-red-500' : score >= 50 ? 'bg-orange-500' : score >= 28 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(score, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-slate-600">Score: {score}/100</span>
            <span className="text-[9px] text-slate-600">{expanded ? '▲ hide signals' : '▼ show signals'}</span>
          </div>
        </div>
      </button>

      {/* Risk message */}
      <div className="px-4 pb-3">
        <p className="text-[11px] text-slate-300 leading-relaxed">{riskMsg}</p>
      </div>

      {/* Ignition level warning */}
      {(ignitionWall || floorWall) && (risk === 'EXTREME' || risk === 'HIGH' || risk === 'MODERATE') && (
        <div className="mx-4 mb-3 rounded-lg bg-black/20 px-3 py-2 space-y-1.5">
          {floorWall && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-emerald-400">🛡</span>
              <span className="text-slate-400">Put wall floor:</span>
              <span className="font-mono font-bold text-emerald-400">₹{floorWall.strike}</span>
              <span className="text-slate-600">({fmtL(floorWall.oi)} OI)</span>
              <span className="text-slate-500">— defend this level</span>
            </div>
          )}
          {ignitionWall && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-orange-400">🚀</span>
              <span className="text-slate-400">Ignition above:</span>
              <span className="font-mono font-bold text-orange-300">₹{ignitionWall.strike}</span>
              <span className="text-slate-600">({fmtL(ignitionWall.oi)} OI)</span>
              <span className="text-slate-500">— break triggers covering</span>
            </div>
          )}
          {mpDelta > 0 && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-violet-400">🎯</span>
              <span className="text-slate-400">Max pain target:</span>
              <span className="font-mono font-bold text-violet-300">+{mpDelta.toFixed(0)}pts upside</span>
              <span className="text-slate-500">if squeeze completes</span>
            </div>
          )}
        </div>
      )}

      {/* Signal breakdown (expandable) */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-white/5 pt-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Signal Breakdown</div>
          {signals.map((sig, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{sig.icon}</span>
                  <span className="text-[11px] font-semibold text-slate-300">{sig.name}</span>
                  {sig.trend && <span className="text-[10px] text-emerald-400 font-bold">{sig.trend}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold ${
                    sig.score / sig.max >= 0.8 ? 'text-red-400' :
                    sig.score / sig.max >= 0.5 ? 'text-orange-400' :
                    sig.score / sig.max >= 0.25 ? 'text-amber-400' : 'text-slate-500'
                  }`}>{sig.label}</span>
                  <span className="text-[10px] font-mono text-slate-600">{sig.score}/{sig.max}</span>
                </div>
              </div>
              {/* Signal bar */}
              <div className="h-1 bg-black/30 rounded-full overflow-hidden ml-5">
                <div
                  className={`h-full rounded-full ${
                    sig.score / sig.max >= 0.8 ? 'bg-red-500' :
                    sig.score / sig.max >= 0.5 ? 'bg-orange-500' :
                    sig.score / sig.max >= 0.25 ? 'bg-amber-500' : 'bg-emerald-500/50'
                  }`}
                  style={{ width: `${(sig.score / sig.max) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed ml-5">{sig.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Generate running commentary (5 lines max) ─────────────────────────────────
function makeCommentary({ spot, atm, maxPain, pcr, straddlePremium, ivHvRatio,
                          walls, straddleCandles, istH, istM, prevPCR, prevSpot,
                          giftPrice, giftChange }) {
  const lines = [];

  // 0. GIFT Nifty pre-open gap warning (highest priority — prepend if significant)
  if (giftChange != null && Math.abs(giftChange) > 50 && istH < 9) {
    const dir    = giftChange > 0 ? 'gap-up' : 'gap-down';
    const sign   = giftChange > 0 ? '+' : '';
    const absDelta = Math.abs(giftChange).toFixed(0);
    const relToMaxPain = maxPain ? (giftPrice > maxPain ? 'above' : 'below') : null;
    const mpDist = maxPain ? Math.abs(giftPrice - maxPain).toFixed(0) : null;
    const wallMsg = (() => {
      if (!walls) return '';
      const res = walls.resistance?.find(r => r.strike >= giftPrice && r.strike - giftPrice < 100);
      const sup = walls.support?.find(s => s.strike <= giftPrice && giftPrice - s.strike < 100);
      if (res) return ` Call wall ₹${res.strike} is just ${(res.strike - giftPrice).toFixed(0)}pts above — likely resistance at open.`;
      if (sup) return ` Put wall ₹${sup.strike} underneath — put writers defending that level.`;
      return '';
    })();
    const mpMsg = relToMaxPain && mpDist ? ` Expected open is ${mpDist}pts ${relToMaxPain} max pain ₹${maxPain}.` : '';
    lines.push({ icon: '🌏', c: giftChange > 0 ? 'text-emerald-400' : 'text-red-400',
      t: `GIFT Nifty ${dir} ${sign}${absDelta}pts (₹${giftPrice?.toFixed(0)}).${mpMsg}${wallMsg}` });
  }

  // 1. Max pain / pinning
  if (spot && maxPain) {
    const d   = Math.abs(spot - maxPain);
    const dir = spot > maxPain ? 'above' : 'below';
    const pull = spot > maxPain ? 'downward pull' : 'upward pull';
    if (d < 50)
      lines.push({ icon: '🎯', c: 'text-emerald-400', t: `Spot ₹${fmt(spot)} is ${d.toFixed(0)}pts ${dir} max pain ₹${maxPain} — strong pin zone. Sellers defending; expect chop around here.` });
    else if (d < 150)
      lines.push({ icon: '🎯', c: 'text-amber-400',   t: `Spot ₹${fmt(spot)} is ${d.toFixed(0)}pts ${dir} max pain ₹${maxPain}. ${pull.charAt(0).toUpperCase()+pull.slice(1)} expected as time decays.` });
    else
      lines.push({ icon: '🎯', c: 'text-orange-400',  t: `Spot ₹${fmt(spot)} is ${d.toFixed(0)}pts from max pain ₹${maxPain} — far from pin zone. Trending session in play.` });
  }

  // 1.5 — Short squeeze warning (contrarian read: low PCR + spot below max pain = squeeze fuel)
  // This fires BEFORE the PCR line intentionally — it reframes what low PCR actually means in this context.
  if (spot && maxPain && pcr != null) {
    const mpGap   = maxPain - spot; // positive = spot below max pain
    const pcrTrend = prevPCR != null && (pcr - prevPCR) > 0.06; // PCR rising = covering underway
    if (mpGap >= 200 && pcr < 0.55) {
      const floorWallStr = walls?.support?.filter(s => s.strike <= spot).sort((a, b) => b.strike - a.strike)[0];
      const floorMsg = floorWallStr ? ` Put wall ₹${floorWallStr.strike} is the floor to defend.` : '';
      lines.push({ icon: '🚨', c: 'text-red-400',
        t: `SHORT SQUEEZE RISK HIGH — spot ₹${fmt(spot)} is ${mpGap.toFixed(0)}pts below max pain ₹${maxPain} with PCR ${pcr.toFixed(2)}. Massive short book is compressed. One catalyst = violent covering rally.${floorMsg}` });
    } else if (mpGap >= 150 && pcr < 0.65) {
      lines.push({ icon: '🔥', c: 'text-orange-400',
        t: `Short squeeze conditions building — spot ${mpGap.toFixed(0)}pts below max pain, PCR ${pcr.toFixed(2)} (heavy shorts). ${pcrTrend ? 'PCR rising — early covering signals.' : 'Watch for put wall break as the ignition trigger.'}` });
    } else if (pcrTrend && pcr < 0.80) {
      lines.push({ icon: '⚠️', c: 'text-amber-400',
        t: `PCR rising (${prevPCR?.toFixed(2)} → ${pcr.toFixed(2)}) — short covering may be underway. Monitor straddle expansion for confirmation.` });
    }
  }

  // 2. PCR with change detection
  if (pcr != null) {
    const delta = (prevPCR != null && Math.abs(pcr - prevPCR) > 0.05)
      ? ` (${pcr > prevPCR ? '↑ from ' : '↓ from '}${prevPCR.toFixed(2)} — ${pcr > prevPCR ? 'put writing picking up, bearish' : 'call writing increasing, bullish'})`
      : '';
    if (pcr < 0.5)
      lines.push({ icon: '📊', c: 'text-red-400',     t: `PCR ${pcr.toFixed(2)} — very bearish. Heavy call writing capping rallies.${delta} Note: in squeeze setups, low PCR = contrarian fuel — see Short Squeeze Risk card.` });
    else if (pcr < 0.8)
      lines.push({ icon: '📊', c: 'text-orange-400',  t: `PCR ${pcr.toFixed(2)} — mildly bearish. More calls written; range bias with downward tilt.${delta}` });
    else if (pcr > 1.3)
      lines.push({ icon: '📊', c: 'text-emerald-400', t: `PCR ${pcr.toFixed(2)} — bullish. Put writers actively defending support.${delta}` });
    else
      lines.push({ icon: '📊', c: 'text-slate-300',   t: `PCR ${pcr.toFixed(2)} — balanced positioning. No strong directional edge from OI alone.${delta}` });
  }

  // 3. Gamma / time warning
  const t = istH * 60 + istM;
  if      (t >= 15*60) lines.push({ icon: '⚡', c: 'text-red-400',    t: 'PAST 3 PM — extreme gamma. Short straddle holders: close or hedge before 3:15 PM. Options can gap 2× on a 50pt move.' });
  else if (t >= 14*60) lines.push({ icon: '⚡', c: 'text-orange-400', t: 'High gamma window (2–3 PM). New short straddles are dangerous now. Existing positions: tighten stops.' });
  else if (t >= 12*60) lines.push({ icon: '⏱', c: 'text-amber-400',  t: 'Post-noon: theta decay accelerating. Short straddle sellers have edge. Watch for sudden directional breakout.' });
  else if (t >= 9*60+15) lines.push({ icon: '⏱', c: 'text-slate-400', t: 'Morning session — wait for first 30-min range to form before initiating expiry positions.' });

  // 4. Straddle decay vs open
  if (straddleCandles?.length > 2) {
    const open = straddleCandles[0].value;
    const cur  = straddleCandles[straddleCandles.length - 1].value;
    const pct  = ((open - cur) / open * 100);
    if      (pct > 35) lines.push({ icon: '↓', c: 'text-emerald-400', t: `Straddle decayed ${pct.toFixed(0)}% from ₹${fmt(open)} → ₹${fmt(cur)}. Sellers controlling the session.` });
    else if (pct < -15) lines.push({ icon: '↑', c: 'text-red-400',    t: `Straddle UP ${Math.abs(pct).toFixed(0)}% from open ₹${fmt(open)} — IV expanding. Avoid new premium sells until volatility stabilises.` });
  }

  // 5. OI wall proximity
  if (spot && walls) {
    const nearRes = walls.resistance?.find(r => r.strike > spot && r.strike - spot < 80);
    const nearSup = walls.support?.find(s => s.strike < spot && spot - s.strike < 80);
    if (nearRes) lines.push({ icon: '🚧', c: 'text-red-400',     t: `Approaching call wall ₹${nearRes.strike} (${fmtL(nearRes.oi)} OI) — strong resistance cap. Rally likely stalls here.` });
    if (nearSup) lines.push({ icon: '🛡', c: 'text-emerald-400', t: `Near put wall ₹${nearSup.strike} (${fmtL(nearSup.oi)} OI) — put writers defending. Strong floor below spot.` });
  }

  return lines.slice(0, 5);
}

// ── Rules-based recommendation ────────────────────────────────────────────────
function makeRecommendation({ spot, atm, maxPain, pcr, straddlePremium, ivHvRatio, walls, istH, istM }) {
  if (!spot || !maxPain || pcr == null) return null;
  const t     = istH * 60 + istM;
  const dist  = Math.abs(spot - maxPain);
  const dir   = spot > maxPain ? 'above' : 'below';
  const pull  = spot > maxPain ? 'bearish pull toward max pain' : 'bullish pull toward max pain';
  const upper = atm + (straddlePremium || 0);
  const lower = atm - (straddlePremium || 0);

  let bias = 'NEUTRAL', biasColor = 'text-slate-300', recs = [];

  // Time override — past 2 PM, no new entries
  if (t >= 15*60) {
    return {
      bias: 'CLOSE', biasColor: 'text-red-400',
      title: 'Final 30 minutes — close all short option positions',
      recs: [
        'Short straddle / strangle holders: exit or delta hedge immediately',
        'Any ATM position is at extreme gamma risk — a 50pt move = 2× option value',
        'Do not initiate new options positions — only close existing ones',
      ],
    };
  }
  if (t >= 14*60) {
    return {
      bias: 'CAUTION', biasColor: 'text-orange-400',
      title: 'High gamma window — manage existing positions only',
      recs: [
        'No new short straddle entries after 2 PM on expiry day',
        'If short straddle: move stops to ATM ± 30pts',
        `Max pain ₹${maxPain} — spot is ${dist.toFixed(0)}pts ${dir}. ${dist < 100 ? 'Closing in on pin zone.' : 'Still far from pin.'}`,
      ],
    };
  }

  // PCR bias
  if (pcr < 0.6)       { bias = 'BEARISH'; biasColor = 'text-red-400'; }
  else if (pcr < 0.85) { bias = 'MILDLY BEARISH'; biasColor = 'text-orange-400'; }
  else if (pcr > 1.2)  { bias = 'BULLISH'; biasColor = 'text-emerald-400'; }
  else                 { bias = 'NEUTRAL'; biasColor = 'text-slate-300'; }

  // Core recommendation based on distance from max pain
  if (dist < 50) {
    recs.push(`Spot ₹${fmt(spot)} is pinned near max pain ₹${maxPain}. Straddle sellers: hold, theta working for you.`);
    recs.push(`Keep stop if spot breaks ₹${upper.toFixed(0)} (above) or ₹${lower.toFixed(0)} (below) decisively.`);
    recs.push(`Buyers: premium crushed at pin zone — avoid unless you expect a catalyst to break range.`);
  } else if (dist < 150) {
    recs.push(`Spot is ${dist.toFixed(0)}pts ${dir} max pain ₹${maxPain}. Expect ${pull} through the session.`);
    recs.push(`Straddle sellers: fair entry if IV/HV ${ivHvRatio > 1.1 ? 'elevated' : 'normal'}. Risk: ±${fmt(upper)} / ±${fmt(lower)} breachpoints.`);
    recs.push(`Watch for spot to drift toward ₹${maxPain} by 2:30 PM.`);
  } else {
    recs.push(`Spot ₹${fmt(spot)} is ${dist.toFixed(0)}pts from max pain ₹${maxPain} — trending session, not a pinning day.`);
    recs.push(`Straddle sellers face higher directional risk. Prefer directional debit spreads today.`);
    recs.push(`Key resistance: ₹${walls.resistance?.[0]?.strike || '—'} · Key support: ₹${walls.support?.[0]?.strike || '—'}`);
  }

  // Add IV/HV context
  if (ivHvRatio > 1.3)
    recs.push(`IV/HV ${fmt(ivHvRatio, 2)}× — options over-priced vs realised vol. Sellers have statistical edge today.`);
  else if (ivHvRatio < 0.9)
    recs.push(`IV/HV ${fmt(ivHvRatio, 2)}× — options cheap. Buyers have edge if a catalyst arrives.`);

  return { bias, biasColor, title: `${bias} bias on expiry — PCR ${pcr?.toFixed(2)}, max pain ₹${maxPain}`, recs };
}

// ── OI Wall Chart (canvas) ────────────────────────────────────────────────────
function OIWallChart({ strikes, spot, maxPain, atm, expectedOpen }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !strikes?.length) return;
    const parent = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const W   = parent.clientWidth || 400;
    const ROW_H = 28;
    const N   = Math.min(strikes.length, 16);
    const H   = N * ROW_H + 20;

    canvas.width  = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    // Select ±7 strikes around ATM
    const atmIdx  = strikes.findIndex(s => s.strike === atm);
    const start   = Math.max(0, atmIdx - 7);
    const slice   = strikes.slice(start, start + N);
    if (!slice.length) return;

    const maxOI    = Math.max(...slice.flatMap(s => [s.ce?.oi||0, s.pe?.oi||0]), 1);
    const LBL_W   = 52;
    const BAR_W   = (W - LBL_W) / 2 - 4;
    const CENTER  = LBL_W + BAR_W;

    slice.forEach((s, i) => {
      const y      = i * ROW_H;
      const barH   = ROW_H - 6;
      const isATM  = s.strike === atm;
      const isPain = s.strike === maxPain;
      const ceW    = ((s.ce?.oi||0) / maxOI) * BAR_W;
      const peW    = ((s.pe?.oi||0) / maxOI) * BAR_W;

      // Row bg for ATM / max pain
      if (isATM)  { ctx.fillStyle = 'rgba(129,140,248,0.07)'; ctx.fillRect(0, y, W, ROW_H); }
      if (isPain) { ctx.fillStyle = 'rgba(245,158,11,0.07)';  ctx.fillRect(0, y, W, ROW_H); }

      // Call bar (left, red)
      ctx.fillStyle = isATM ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.3)';
      ctx.fillRect(CENTER - ceW, y + 3, ceW, barH);

      // Put bar (right, green)
      ctx.fillStyle = isATM ? 'rgba(34,197,94,0.5)' : 'rgba(34,197,94,0.3)';
      ctx.fillRect(CENTER, y + 3, peW, barH);

      // Strike label
      ctx.font      = `${isATM || isPain ? 'bold ' : ''}11px monospace`;
      ctx.fillStyle = isATM ? '#818cf8' : isPain ? '#f59e0b' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.strike, CENTER, y + ROW_H / 2);

      // Max pain icon
      if (isPain) {
        ctx.font = '11px sans-serif';
        ctx.fillText('🎯', CENTER - BAR_W - 12, y + ROW_H / 2);
      }

      // OI labels on bars (if large enough) - Keep a gap from center so it doesn't overlap strike text
      const GAP = 24;
      if (ceW > GAP + 10) {
        ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.textAlign = 'right';
        ctx.fillText(fmtL(s.ce?.oi), CENTER - GAP, y + ROW_H / 2);
      }
      if (peW > GAP + 10) {
        ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.textAlign = 'left';
        ctx.fillText(fmtL(s.pe?.oi), CENTER + GAP, y + ROW_H / 2);
      }
    });

    // Spot line (amber dashed)
    if (spot) {
      const spotRelative = (spot - (slice[0]?.strike || spot)) / ((slice[slice.length-1]?.strike||spot) - (slice[0]?.strike||spot));
      const spotY = spotRelative * (N * ROW_H);
      if (spotY > 0 && spotY < N * ROW_H) {
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(LBL_W, spotY); ctx.lineTo(W, spotY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f59e0b'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`▶ ${Number(spot).toFixed(0)}`, LBL_W + 2, spotY - 3);
      }
    }

    // Expected open line (blue dashed) — shown when GIFT Nifty data available
    if (expectedOpen && expectedOpen !== spot) {
      const range = (slice[slice.length-1]?.strike||expectedOpen) - (slice[0]?.strike||expectedOpen);
      const rel   = range > 0 ? (expectedOpen - (slice[0]?.strike || expectedOpen)) / range : 0;
      const expY  = rel * (N * ROW_H);
      if (expY > 0 && expY < N * ROW_H) {
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(LBL_W, expY); ctx.lineTo(W, expY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#38bdf8'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`GIFT ${Number(expectedOpen).toFixed(0)}`, LBL_W + 2, expY - 2);
      }
    }

    // Legend
    ctx.font = '9px sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(239,68,68,0.7)';  ctx.textAlign = 'left'; ctx.fillText('● Calls (resistance)', 2, H - 3);
    ctx.fillStyle = 'rgba(34,197,94,0.7)';  ctx.fillText('● Puts (support)', 120, H - 3);
    if (expectedOpen) { ctx.fillStyle = 'rgba(56,189,248,0.7)'; ctx.fillText('— GIFT open', 220, H - 3); }
  }, [strikes, spot, maxPain, atm, expectedOpen]);

  return <canvas ref={canvasRef} className="w-full block" />;
}

// ── Straddle chart (reuses Chart.js canvas module) ────────────────────────────
function ExpiryStraddleChart({ data }) {
  const ref    = useRef(null);
  const chartR = useRef(null);
  const [hover, setHover] = useState(null);
  const last    = data?.length ? data[data.length - 1] : null;
  const display = hover ?? (last ? { value: last.value, ce: last.ce, pe: last.pe } : null);

  useEffect(() => {
    if (!ref.current || !data?.length) return;
    import('@/app/lib/chart/Chart.js').then(({ createChart }) => {
      chartR.current?.destroy(); chartR.current = null;
      const chart = createChart(ref.current, { interval: '5minute' });
      chartR.current = chart;
      chart.setCandles(data.map(d => ({ time: d.time, open: d.value, high: d.value, low: d.value, close: d.value, volume: 0 })));
      chart.setLine('premium', { data: data.map(d => ({ time: d.time, value: d.value })), color: '#818cf8', width: 2 });
      const map = new Map(data.map(d => [d.time, { ce: d.ce, pe: d.pe }]));
      chart.onCrosshairMove(info => {
        if (!info) { setHover(null); return; }
        const cp = map.get(info.bar.time) || {};
        setHover({ value: info.bar.close, ce: cp.ce ?? null, pe: cp.pe ?? null });
      });
    });
    return () => { chartR.current?.destroy(); chartR.current = null; };
  }, [data]);

  if (!data?.length) return (
    <div className="h-[160px] flex items-center justify-center text-slate-500 text-xs">
      No intraday data — available during market hours
    </div>
  );

  return (
    <div ref={ref} className="relative min-h-[160px]">
      {display && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 text-[11px] font-mono bg-[#0a1628]/90 border border-white/10 rounded px-2 py-1 pointer-events-none">
          <span className="text-violet-400 font-bold">₹{display.value?.toFixed(2)}</span>
          {display.ce != null && <span className="text-sky-400">CE {display.ce?.toFixed(2)}</span>}
          {display.pe != null && <span className="text-rose-400">PE {display.pe?.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExpiryPage() {
  const [symbol,       setSymbol]       = useState('NIFTY');
  const [selectedExp,  setSelectedExp]  = useState('');   // '' = auto (nearest)
  const [chainData,    setChainData]    = useState(null);
  const [straddleData, setStraddleData] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [lastRefresh,  setLastRefresh]  = useState(null);
  const [giftData,     setGiftData]     = useState(null); // { price, change, changePct }

  const prevRef = useRef(null); // { pcr, spot, straddlePremium }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (sym, exp) => {
    try {
      const expParam = exp ? `&expiry=${exp}` : '';
      // Fetch chain + GIFT Nifty in parallel
      const [r, mdr] = await Promise.all([
        fetch(`/api/options/chain-with-greeks?symbol=${sym}${expParam}`),
        fetch('/api/market-data').catch(() => null),
      ]);
      if (!r.ok) throw new Error('Chain fetch failed');
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setChainData(d);
      setError(null);
      setLastRefresh(new Date());

      // Extract GIFT Nifty from market-data
      if (mdr?.ok) {
        const md = await mdr.json();
        const gi = md?.indices;
        if (gi?.giftNifty) {
          setGiftData({
            price:     parseFloat(gi.giftNifty),
            change:    gi.giftNiftyChange    != null ? parseFloat(gi.giftNiftyChange)    : null,
            changePct: gi.giftNiftyChangePercent != null ? parseFloat(gi.giftNiftyChangePercent) : null,
          });
        }
      }

      // Straddle chart
      if (d.atm && d.expiry) {
        const sr = await fetch(`/api/options/straddle-chart?symbol=${sym}&expiry=${d.expiry}&strike=${d.atm}&interval=5minute`);
        if (sr.ok) { const sd = await sr.json(); setStraddleData(sd.candles || []); }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true); setChainData(null); setStraddleData(null);
    fetchAll(symbol, selectedExp);
  }, [symbol, selectedExp, fetchAll]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => fetchAll(symbol, selectedExp), 60000);
    return () => clearInterval(id);
  }, [symbol, selectedExp, fetchAll]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const d = useMemo(() => {
    if (!chainData?.strikes) return null;
    const { spot, atm, strikes, expiry, straddlePremium, atmIV, hv30, ivHvRatio, expectedMove: expMove, expiries } = chainData;

    const maxPain   = computeMaxPain(strikes);
    const pcr       = computePCR(strikes);
    const walls     = computeOIWalls(strikes, 4);
    const ist       = getIST();
    const istH      = ist.getUTCHours();
    const istM      = ist.getUTCMinutes();
    const expiryDay = isExpiryToday(expiry);
    const daysLeft  = daysUntilExpiry(expiry);
    const pinScore  = getPinScore(spot, maxPain);
    const gamma     = getGammaLevel(istH, istM);
    const decayPct  = decayProgress(istH, istM);

    // ±5 strikes from ATM for table
    const atmIdx    = strikes.findIndex(s => s.strike === atm);
    const nearStrikes = strikes.slice(Math.max(0, atmIdx - 5), atmIdx + 6);

    // GIFT Nifty: compute expected open strike (rounded to nearest 50 for NIFTY)
    const step = atm && strikes.length > 1
      ? Math.abs(strikes[1]?.strike - strikes[0]?.strike) || 50
      : 50;
    const expectedOpenPrice  = giftData?.price ?? null;
    const expectedOpenStrike = expectedOpenPrice
      ? Math.round(expectedOpenPrice / step) * step
      : null;

    const commentary = makeCommentary({
      spot, atm, maxPain, pcr, straddlePremium, ivHvRatio, walls,
      straddleCandles: straddleData, istH, istM,
      prevPCR: prevRef.current?.pcr, prevSpot: prevRef.current?.spot,
      giftPrice: giftData?.price, giftChange: giftData?.change,
    });
    const rec = makeRecommendation({ spot, atm, maxPain, pcr, straddlePremium, ivHvRatio, walls, istH, istM });

    // Short squeeze risk score
    const squeeze = computeShortSqueezeRisk({
      spot, maxPain, pcr, ivHvRatio,
      straddleCandles: straddleData,
      walls,
      prevPCR: prevRef.current?.pcr,
    });

    prevRef.current = { pcr, spot, straddlePremium };

    return { spot, atm, strikes, expiry, expiries, straddlePremium, atmIV, hv30, ivHvRatio,
             expMove, maxPain, pcr, walls, expiryDay, daysLeft, pinScore, gamma, decayPct,
             nearStrikes, commentary, rec, expectedOpenPrice, expectedOpenStrike, step, squeeze };
  }, [chainData, straddleData, giftData]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#060b14] text-slate-100">
      <Nav />

      {/* Back link + controls */}
      <div className="max-w-[1400px] mx-auto px-6 pt-4 pb-2 flex flex-wrap items-center gap-3">
        <a href="/options" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition-colors mr-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>
          Options
        </a>
        <div className="flex gap-1 bg-[#0c1a2e] border border-white/8 rounded-xl p-1">
          {['NIFTY', 'BANKNIFTY'].map(s => (
            <button key={s} onClick={() => { setSymbol(s); setSelectedExp(''); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${symbol === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {s}
            </button>
          ))}
        </div>

        {/* Expiry selector */}
        {d?.expiries?.length > 0 && (
          <select value={selectedExp} onChange={e => setSelectedExp(e.target.value)}
            className="bg-[#0c1a2e] border border-white/8 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none">
            <option value="">Nearest expiry</option>
            {d.expiries.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        )}

        {d?.expiry && (
          <div className={`text-xs font-semibold px-3 py-1.5 rounded-xl border ${d.expiryDay ? 'bg-violet-500/15 border-violet-500/30 text-violet-300' : 'bg-[#0c1a2e] border-white/8 text-slate-400'}`}>
            {d.expiryDay ? '🔴 EXPIRY TODAY' : `Expiry: ${d.expiry} · ${d.daysLeft}d away`}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {lastRefresh && <span className="text-[10px] text-slate-600">{lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => fetchAll(symbol, selectedExp)}
            className="px-3 py-1.5 text-xs bg-[#0c1a2e] border border-white/8 rounded-xl text-slate-400 hover:text-white transition-colors">
            ↻ Refresh
          </button>
          <a href="/options" className="px-3 py-1.5 text-xs bg-[#0c1a2e] border border-white/8 rounded-xl text-slate-400 hover:text-white transition-colors">
            ← Options
          </a>
        </div>
      </div>

      {loading && (
        <div className="max-w-[1400px] mx-auto px-6 py-12 flex items-center justify-center text-slate-400 text-sm">
          Loading expiry data…
        </div>
      )}
      {error && !loading && (
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>
        </div>
      )}

      {d && !loading && (
        <div className="max-w-[1400px] mx-auto px-6 pb-8 space-y-4">

          {/* ── Non-expiry banner ── */}
          {!d.expiryDay && (
            <div className="bg-[#0c1a2e] border border-white/5 rounded-xl px-5 py-3 flex items-center gap-4">
              <div className="text-amber-400 text-xl">📅</div>
              <div>
                <div className="text-sm font-semibold text-slate-200">Today is not an expiry day</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Next {symbol} expiry: <span className="text-slate-300 font-medium">{d.expiry}</span> · {d.daysLeft} day{d.daysLeft !== 1 ? 's' : ''} away.
                  Showing pre-expiry preparation data below.
                </div>
              </div>
            </div>
          )}

          {/* ── GIFT Nifty / Expected Open Strip ── */}
          {giftData?.price && (
            (() => {
              const { price, change, changePct } = giftData;
              const isUp       = (change ?? 0) >= 0;
              const absDelta   = change != null ? Math.abs(change).toFixed(0) : null;
              const absPct     = changePct != null ? Math.abs(changePct).toFixed(2) : null;
              const isPreOpen  = (() => { const ist = getIST(); return ist.getUTCHours() < 9; })();
              const vsMaxPain  = d.maxPain ? (price > d.maxPain
                ? `+${(price - d.maxPain).toFixed(0)}pts above max pain ₹${d.maxPain}`
                : `${(price - d.maxPain).toFixed(0)}pts below max pain ₹${d.maxPain}`) : null;
              const vsWallRes  = d.walls?.resistance?.find(r => r.strike > price && r.strike - price < 150);
              const vsWallSup  = d.walls?.support?.find(s => s.strike < price && price - s.strike < 150);

              return (
                <div className={`rounded-xl border px-5 py-3.5 ${isPreOpen ? (isUp ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-red-500/8 border-red-500/20') : 'bg-[#0c1a2e] border-white/5'}`}>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {/* GIFT price + change */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">GIFT Nifty</span>
                      <span className="text-lg font-bold font-mono text-white">₹{price.toFixed(2)}</span>
                      {change != null && (
                        <span className={`text-sm font-semibold font-mono ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct?.toFixed(2)}%)
                        </span>
                      )}
                      {isPreOpen && absDelta && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isUp ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                          Expected {isUp ? 'gap-up' : 'gap-down'} {isUp ? '+' : '−'}{absDelta}pts ({isUp ? '+' : '−'}{absPct}%)
                        </span>
                      )}
                    </div>

                    {/* Expected ATM at open */}
                    {d.expectedOpenStrike && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500">Expected ATM at open</span>
                        <span className="text-sm font-bold font-mono text-violet-400">₹{d.expectedOpenStrike}</span>
                        {d.atm !== d.expectedOpenStrike && (
                          <span className="text-[10px] text-slate-500">(current ATM ₹{d.atm})</span>
                        )}
                      </div>
                    )}

                    {/* vs Max Pain */}
                    {vsMaxPain && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500">vs Max Pain</span>
                        <span className={`text-xs font-semibold font-mono ${price > d.maxPain ? 'text-amber-400' : 'text-sky-400'}`}>{vsMaxPain}</span>
                      </div>
                    )}

                    {/* Nearby OI wall warning */}
                    {vsWallRes && (
                      <div className="flex items-center gap-1.5 text-[11px] text-red-400">
                        <span>🚧</span>
                        <span>Call wall ₹{vsWallRes.strike} just {(vsWallRes.strike - price).toFixed(0)}pts above expected open</span>
                      </div>
                    )}
                    {vsWallSup && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                        <span>🛡</span>
                        <span>Put wall ₹{vsWallSup.strike} {(price - vsWallSup.strike).toFixed(0)}pts below — support at open</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          )}

          {/* ── Commentary box ── */}
          {d.commentary?.length > 0 && (
            <div className="bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden">
              <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Live Expiry Intelligence</span>
                {lastRefresh && <span className="text-[10px] text-slate-600 ml-auto">Updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
              <div className="px-4 pb-3 space-y-1.5">
                {d.commentary.map((line, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-[12px] leading-relaxed">
                    <span className="shrink-0 w-5 text-center">{line.icon}</span>
                    <span className={line.c}>{line.t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Snapshot bar ── */}
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              { label: 'Spot',       val: fmt(d.spot, 2),                        sub: null,                            c: 'text-white' },
              { label: 'ATM',        val: fmt(d.atm),                             sub: null,                            c: 'text-violet-400' },
              { label: 'Max Pain',   val: fmt(d.maxPain),                         sub: `${Math.abs(d.spot - d.maxPain).toFixed(0)}pts away`, c: 'text-amber-400' },
              { label: 'PCR',        val: d.pcr?.toFixed(2) || '—',               sub: d.pcr > 1.2 ? 'Bearish' : d.pcr < 0.7 ? 'Bullish' : 'Neutral', c: d.pcr > 1.2 ? 'text-red-400' : d.pcr < 0.7 ? 'text-emerald-400' : 'text-slate-300' },
              { label: 'Straddle',   val: `₹${fmt(d.straddlePremium, 0)}`,        sub: `±${fmt(d.straddlePremium, 0)} pts`, c: 'text-violet-400' },
              { label: 'ATM IV',     val: d.atmIV ? `${fmt(d.atmIV, 1)}%` : '—', sub: d.hv30 ? `HV ${fmt(d.hv30, 1)}%` : null, c: 'text-sky-400' },
              { label: 'IV/HV',      val: d.ivHvRatio ? `${fmt(d.ivHvRatio, 2)}×` : '—', sub: d.ivHvRatio > 1.2 ? 'Sellers edge' : d.ivHvRatio < 0.9 ? 'Buyers edge' : 'Neutral', c: d.ivHvRatio > 1.2 ? 'text-emerald-400' : d.ivHvRatio < 0.9 ? 'text-violet-400' : 'text-slate-300' },
              { label: '1σ Range',   val: d.expMove ? `±${d.expMove.points}pts` : '—', sub: d.expMove ? `${fmt(d.expMove.lower, 0)} – ${fmt(d.expMove.upper, 0)}` : null, c: 'text-slate-300' },
            ].map(tile => (
              <div key={tile.label} className="bg-[#0c1a2e] border border-white/5 rounded-xl px-3 py-2.5">
                <div className="text-[10px] text-slate-500 mb-0.5">{tile.label}</div>
                <div className={`text-sm font-bold font-mono ${tile.c}`}>{tile.val}</div>
                {tile.sub && <div className="text-[9px] text-slate-600 mt-0.5">{tile.sub}</div>}
              </div>
            ))}
          </div>

          {/* ── Main content: OI Wall + Straddle | Intelligence ── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* Left: OI Wall + Straddle */}
            <div className="lg:col-span-3 space-y-4">

              {/* OI Wall Chart */}
              <div className="bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Open Interest — Call vs Put by Strike</span>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span>🎯 max pain ₹{d.maxPain}</span>
                    <span className="text-violet-400">■ ATM {d.atm}</span>
                  </div>
                </div>
                <div className="p-3">
                  <OIWallChart strikes={d.strikes} spot={d.spot} maxPain={d.maxPain} atm={d.atm} expectedOpen={d.expectedOpenPrice} />
                </div>
              </div>

              {/* Straddle Decay Chart */}
              <div className="bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">ATM Straddle — Intraday Premium ({d.atm} CE + PE)</span>
                  <span className="text-[10px] text-slate-500">5-min bars · today</span>
                </div>
                <div className="p-2">
                  <ExpiryStraddleChart data={straddleData} />
                </div>
                {/* Theta decay progress */}
                <div className="px-4 pb-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>Theta decay progress (theoretical)</span>
                    <span>{d.decayPct}% of today's premium gone</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${d.decayPct > 75 ? 'bg-red-500' : d.decayPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${d.decayPct}%` }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-700 mt-0.5">
                    <span>9:15</span><span>12:00</span><span>15:30</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Intelligence panels */}
            <div className="lg:col-span-2 space-y-3">

              {/* ── Short Squeeze Risk Card — topmost, most important on expiry day */}
              <ShortSqueezeCard squeeze={d.squeeze} spot={d.spot} />

              {/* Pinning Score */}
              {d.pinScore && (
                <div className="bg-[#0c1a2e] border border-white/5 rounded-xl p-4">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Pinning Score</div>
                  <div className={`text-xl font-bold mb-1 ${d.pinScore.color}`}>{d.pinScore.label}</div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div className={`h-full rounded-full ${d.pinScore.bar}`} style={{ width: `${d.pinScore.pct}%` }} />
                  </div>
                  <div className="text-xs text-slate-400">{d.pinScore.desc}</div>
                  <div className="mt-2 text-[10px] text-slate-600">
                    Spot ₹{fmt(d.spot, 2)} · Max Pain ₹{d.maxPain} · Δ {Math.abs(d.spot - d.maxPain).toFixed(0)}pts
                  </div>
                </div>
              )}

              {/* Gamma Risk */}
              <div className={`rounded-xl p-4 border ${d.gamma.bg}`}>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Gamma Risk</div>
                <div className={`text-lg font-bold mb-1 ${d.gamma.color}`}>{d.gamma.label}</div>
                <div className="text-xs text-slate-400">{d.gamma.msg}</div>
              </div>

              {/* PCR Breakdown */}
              <div className="bg-[#0c1a2e] border border-white/5 rounded-xl p-4">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">PCR Breakdown</div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Total Call OI</span>
                  <span className="text-red-400 font-mono">{fmtL(d.strikes?.reduce((s,r) => s+(r.ce?.oi||0), 0))}</span>
                </div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Total Put OI</span>
                  <span className="text-emerald-400 font-mono">{fmtL(d.strikes?.reduce((s,r) => s+(r.pe?.oi||0), 0))}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold pt-2 border-t border-white/5">
                  <span className="text-slate-300">PCR</span>
                  <span className={`font-mono ${d.pcr < 0.7 ? 'text-red-400' : d.pcr > 1.2 ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {d.pcr?.toFixed(2) || '—'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1.5">
                  {d.pcr < 0.5 ? 'Very bearish — call writers dominating' :
                   d.pcr < 0.8 ? 'Mildly bearish — more calls than puts' :
                   d.pcr > 1.3 ? 'Bullish — put writers defending support' :
                   'Balanced — no directional OI edge'}
                </div>
              </div>

              {/* OI Walls */}
              <div className="bg-[#0c1a2e] border border-white/5 rounded-xl p-4">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">OI Walls</div>
                <div className="space-y-1">
                  {d.walls.resistance.slice(0,3).map(r => (
                    <div key={r.strike} className="flex items-center justify-between text-xs">
                      <span className="text-red-400">🚧 {r.strike}</span>
                      <span className="text-slate-500 font-mono">{fmtL(r.oi)} · {r.strike > d.spot ? `+${(r.strike - d.spot).toFixed(0)}pts` : `−${(d.spot - r.strike).toFixed(0)}pts`}</span>
                    </div>
                  ))}
                  <div className="border-t border-white/5 my-1.5" />
                  <div className="text-[10px] text-amber-400 text-center">▶ Spot ₹{fmt(d.spot, 2)}</div>
                  <div className="border-t border-white/5 my-1.5" />
                  {d.walls.support.slice(0,3).map(s => (
                    <div key={s.strike} className="flex items-center justify-between text-xs">
                      <span className="text-emerald-400">🛡 {s.strike}</span>
                      <span className="text-slate-500 font-mono">{fmtL(s.oi)} · −{(d.spot - s.strike).toFixed(0)}pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Recommendation card ── */}
          {d.rec && (
            <div className="bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/5 flex items-center gap-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Expiry Day Recommendation</div>
                <div className={`text-sm font-bold ${d.rec.biasColor}`}>{d.rec.bias}</div>
              </div>
              <div className="px-5 py-3">
                <div className="text-sm font-semibold text-slate-200 mb-3">{d.rec.title}</div>
                <div className="space-y-2">
                  {d.rec.recs.map((r, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-slate-400">
                      <span className="text-slate-600 shrink-0 font-mono">{i + 1}.</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Near-ATM Strike Table ── */}
          <div className="bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/5">
              <span className="text-xs font-semibold text-slate-300">Near-ATM Strikes — ±5 from {d.atm}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-500 border-b border-white/5">
                    <th className="px-3 py-2 text-right">CE IV</th>
                    <th className="px-3 py-2 text-right">CE OI</th>
                    <th className="px-3 py-2 text-right">CE LTP</th>
                    <th className="px-4 py-2 text-center font-bold text-slate-400 bg-white/2">Strike</th>
                    <th className="px-3 py-2 text-left">PE LTP</th>
                    <th className="px-3 py-2 text-left">PE OI</th>
                    <th className="px-3 py-2 text-left">PE IV</th>
                    <th className="px-3 py-2 text-center">PCR</th>
                  </tr>
                </thead>
                <tbody>
                  {d.nearStrikes.map(s => {
                    const isATM   = s.strike === d.atm;
                    const isPain  = s.strike === d.maxPain;
                    const rowPCR  = s.ce?.oi > 0 ? (s.pe?.oi || 0) / s.ce.oi : null;
                    return (
                      <tr key={s.strike}
                        className={`border-b border-white/3 ${isATM ? 'bg-violet-500/8' : isPain ? 'bg-amber-500/6' : 'hover:bg-white/2'} transition-colors`}>
                        <td className="px-3 py-2 text-right text-sky-400 font-mono">{s.ce?.iv ? `${fmt(s.ce.iv, 1)}%` : '—'}</td>
                        <td className="px-3 py-2 text-right text-red-400 font-mono">{fmtL(s.ce?.oi)}</td>
                        <td className="px-3 py-2 text-right text-slate-300 font-mono font-semibold">{s.ce?.ltp ? `₹${fmt(s.ce.ltp, 2)}` : '—'}</td>
                        <td className={`px-4 py-2 text-center font-bold font-mono ${isATM ? 'text-violet-300' : isPain ? 'text-amber-400' : 'text-slate-200'}`}>
                          {s.strike}
                          {isATM  && <span className="ml-1 text-[9px] text-violet-500">ATM</span>}
                          {isPain && <span className="ml-1 text-[9px] text-amber-500">🎯</span>}
                        </td>
                        <td className="px-3 py-2 text-left text-slate-300 font-mono font-semibold">{s.pe?.ltp ? `₹${fmt(s.pe.ltp, 2)}` : '—'}</td>
                        <td className="px-3 py-2 text-left text-emerald-400 font-mono">{fmtL(s.pe?.oi)}</td>
                        <td className="px-3 py-2 text-left text-sky-400 font-mono">{s.pe?.iv ? `${fmt(s.pe.iv, 1)}%` : '—'}</td>
                        <td className={`px-3 py-2 text-center font-mono ${rowPCR == null ? 'text-slate-600' : rowPCR > 1.3 ? 'text-red-400' : rowPCR < 0.7 ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {rowPCR != null ? rowPCR.toFixed(2) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
