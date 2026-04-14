'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Nav from '../components/Nav';
import { probAtTime, probTouch, lognormalPDF, expectedMove } from '@/app/lib/options/black-scholes';
import { playWarningPing, playShortCoveringAlert } from '@/app/lib/sounds';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt2(n)  { return n != null ? n.toFixed(2) : '—'; }
function fmtPct(n){ return n != null ? n.toFixed(1) + '%' : '—'; }
function fmtIV(n) { return n != null ? n.toFixed(1) + '%' : '—'; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Colour for probITM chip
function probColour(pct) {
  if (pct == null) return 'text-slate-500';
  if (pct < 20)  return 'text-emerald-400';
  if (pct < 40)  return 'text-amber-400';
  if (pct < 60)  return 'text-orange-400';
  return 'text-red-400';
}

// ── Rules-based straddle commentary ──────────────────────────────────────────
// Each line uses live session data — no static time-bucket text.
// scData: from /api/short-covering (futures OI signal)
function getStraddleCommentary(candles, chainData, scData) {
  if (!candles?.length || !chainData) return [];
  const { spot, atm, ivHvRatio, straddlePremium, strikes } = chainData;
  const lines = [];

  // ── 1. Straddle dynamics vs open ─────────────────────────────────────────
  const openPremium = candles[0]?.value;
  const curPremium  = candles[candles.length - 1]?.value;
  const dayLow      = candles.length > 1 ? Math.min(...candles.map(d => d.value)) : curPremium;
  const decayPct    = openPremium > 0 ? (openPremium - curPremium) / openPremium * 100 : 0;
  const recoveryPct = dayLow > 0 && dayLow < curPremium ? (curPremium - dayLow) / dayLow * 100 : 0;

  if (openPremium && curPremium) {
    if (decayPct > 30) {
      lines.push({ key: 'decay', icon: '↓', color: 'text-emerald-400',
        text: `Straddle down ${decayPct.toFixed(0)}% from open ₹${openPremium.toFixed(0)} → ₹${curPremium.toFixed(0)}. Sellers in full control all session — avoid buying premium until a strong breakout candle forms.` });
    } else if (decayPct > 12) {
      lines.push({ key: 'decay', icon: '↓', color: 'text-slate-300',
        text: `Premium down ${decayPct.toFixed(0)}% from ₹${openPremium.toFixed(0)}. Sellers ahead — watch for recovery above ₹${(dayLow * 1.12).toFixed(0)} as a reversal trigger.` });
    } else if (decayPct < -20) {
      lines.push({ key: 'spike', icon: '↑', color: 'text-rose-400',
        text: `Straddle up ${Math.abs(decayPct).toFixed(0)}% above open (₹${openPremium.toFixed(0)} → ₹${curPremium.toFixed(0)}). Sellers trapped — buyer momentum in control. Avoid fresh sells.` });
    } else if (decayPct < -8) {
      lines.push({ key: 'spike', icon: '↑', color: 'text-amber-400',
        text: `Premium ${Math.abs(decayPct).toFixed(0)}% above open ₹${openPremium.toFixed(0)}. IV expanding — buyers gaining edge; sellers should tighten stops.` });
    } else if (recoveryPct > 12 && decayPct > 0) {
      lines.push({ key: 'recovery', icon: '↗', color: 'text-amber-400',
        text: `Decayed to ₹${dayLow.toFixed(0)} then recovered ${recoveryPct.toFixed(0)}% (now ₹${curPremium.toFixed(0)}). Seller exhaustion forming — watch for directional breakout.` });
    } else {
      lines.push({ key: 'flat', icon: '–', color: 'text-slate-500',
        text: `Straddle near flat (₹${openPremium.toFixed(0)} → ₹${curPremium.toFixed(0)}). No edge yet — wait for premium to expand or decay decisively before entering.` });
    }
  }

  // ── 2. Futures OI signal ─────────────────────────────────────────────────
  const futOISig = scData?.signals?.futuresOI;
  if (futOISig?.detail && !futOISig.detail.includes('No OI snapshot') && !futOISig.detail.includes('Insufficient')) {
    if (futOISig.hit) {
      lines.push({ key: 'futoi', icon: '⚡', color: 'text-emerald-400',
        text: `Short covering confirmed — ${futOISig.detail}. Futures OI falling while spot rises means trapped shorts exiting; CE buyers have structural tailwind.` });
    } else {
      lines.push({ key: 'futoi', icon: '◈', color: 'text-slate-400',
        text: `Futures OI: ${futOISig.detail}. No short-covering divergence — directional move not yet confirmed by OI.` });
    }
  }

  // ── 3. OI flow: net CE vs PE build/unwind ────────────────────────────────
  if (strikes?.length) {
    const ceDelta = strikes.reduce((s, r) => s + (r.ce?.oiChange || 0), 0);
    const peDelta = strikes.reduce((s, r) => s + (r.pe?.oiChange || 0), 0);
    if (Math.abs(ceDelta) > 75000 || Math.abs(peDelta) > 75000) {
      const fmt   = n => `${n >= 0 ? '+' : ''}${(n / 100000).toFixed(1)}L`;
      const ceDir = ceDelta > 75000 ? 'building' : ceDelta < -75000 ? 'unwinding' : 'flat';
      const peDir = peDelta > 75000 ? 'building' : peDelta < -75000 ? 'unwinding' : 'flat';
      let interp  = '';
      if      (ceDir === 'building'  && peDir === 'unwinding') interp = 'Call writers adding, put shorts covering — bearish lean.';
      else if (ceDir === 'unwinding' && peDir === 'building')  interp = 'Call shorts covering, puts being sold — bullish lean.';
      else if (ceDir === 'unwinding' && peDir === 'unwinding') interp = 'Both sides lightening — positioning clearing up, breakout risk rising.';
      else if (ceDir === 'building'  && peDir === 'building')  interp = 'Both sides adding — range play, sellers on both legs.';
      else if (ceDir === 'unwinding')                          interp = 'CE OI shrinking — call shorts covering, bullish squeeze risk.';
      else                                                     interp = 'PE building — put sellers actively defending support.';
      lines.push({ key: 'oiflow', icon: '⇅', color: 'text-slate-300',
        text: `OI today — CE ${fmt(ceDelta)} (${ceDir}), PE ${fmt(peDelta)} (${peDir}). ${interp}` });
    }
  }

  // ── 4. PCR interpretation ────────────────────────────────────────────────
  if (strikes?.length) {
    const totalCe = strikes.reduce((s, r) => s + (r.ce?.oi || 0), 0);
    const totalPe = strikes.reduce((s, r) => s + (r.pe?.oi || 0), 0);
    const pcr     = totalCe > 0 ? totalPe / totalCe : null;
    if (pcr != null) {
      let text = '', color = '';
      if      (pcr > 1.5) { color = 'text-emerald-400'; text = `PCR ${pcr.toFixed(2)} — extreme put loading. Contrarian bullish; market makers likely defend against a large fall.`; }
      else if (pcr > 1.2) { color = 'text-emerald-400'; text = `PCR ${pcr.toFixed(2)} — put sellers confident. Defined floor below current spot; mild bullish bias.`; }
      else if (pcr > 0.9) { color = 'text-slate-400';   text = `PCR ${pcr.toFixed(2)} — balanced. Neither side dominant; wait for OI to skew before reading direction.`; }
      else if (pcr > 0.7) { color = 'text-amber-400';   text = `PCR ${pcr.toFixed(2)} — call-skewed. Sellers building resistance above — CE momentum faces a wall.`; }
      else                { color = 'text-rose-400';    text = `PCR ${pcr.toFixed(2)} — heavy call loading. Bears positioning aggressively; CE buyers need a strong catalyst.`; }
      lines.push({ key: 'pcr', icon: '⊗', color, text });
    }
  }

  // ── 5. IV vs HV (no dead zone) ──────────────────────────────────────────
  if (ivHvRatio != null) {
    if      (ivHvRatio > 1.3) lines.push({ key: 'ivhv', icon: '⊕', color: 'text-emerald-400', text: `IV/HV ${ivHvRatio.toFixed(2)}× — options overpriced vs realized vol. Strong seller edge; premium likely to mean-revert unless a macro event hits.` });
    else if (ivHvRatio > 1.1) lines.push({ key: 'ivhv', icon: '≈', color: 'text-slate-300',   text: `IV/HV ${ivHvRatio.toFixed(2)}× — mild seller edge. Size conservatively; IV can normalize without triggering your stops.` });
    else if (ivHvRatio > 0.9) lines.push({ key: 'ivhv', icon: '≈', color: 'text-slate-400',   text: `IV/HV ${ivHvRatio.toFixed(2)}× — fairly priced. No vol edge; let price direction drive the trade.` });
    else                      lines.push({ key: 'ivhv', icon: '⊖', color: 'text-violet-400',  text: `IV/HV ${ivHvRatio.toFixed(2)}× — options cheap vs realized vol. Buyer edge when a catalyst is visible; straddle buys are asymmetric here.` });
  }

  // ── 6. Spot vs nearest breakeven (distance + urgency) ───────────────────
  if (straddlePremium > 0 && atm > 0 && spot > 0) {
    const upperBE = atm + straddlePremium;
    const lowerBE = atm - straddlePremium;
    const nearBE  = spot > atm ? upperBE : lowerBE;
    const ptsAway = Math.abs(nearBE - spot);
    const distPct = Math.abs((spot - atm) / atm * 100);
    if (distPct > 0.2) {
      const side       = spot > atm ? 'upper' : 'lower';
      const imminent   = ptsAway < straddlePremium * 0.35;
      lines.push({ key: 'be', icon: '⇔', color: imminent ? 'text-amber-400' : 'text-slate-400',
        text: `${ptsAway.toFixed(0)}pts from ${side} breakeven ₹${nearBE.toFixed(0)}.${imminent ? ' Breach imminent — gamma accelerating, move likely to extend.' : ' Sellers still inside profit range.'}` });
    }
  }

  return lines;
}

// ── Distribution Chart (canvas) ───────────────────────────────────────────────
function DistributionChart({ spot, atm, strikes, atmIV, T, targetPrice, onTargetChange }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spot || !atmIV || T == null) return;
    const ctx  = canvas.getContext('2d');
    const dpr  = window.devicePixelRatio || 1;
    const W    = canvas.parentElement?.clientWidth || canvas.clientWidth || 700;
    const H    = canvas.clientHeight || 140;

    // On expiry day T may be 0 — show a simple "expired" label instead of blank
    if (T <= 0) {
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#060b14'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#475569'; ctx.font = '12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Options expired — distribution not applicable', W / 2, H / 2);
      return;
    }
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sigma = atmIV / 100;
    const T_yr  = T;

    // Price range: spot ± 4σ
    const range4 = spot * sigma * Math.sqrt(T_yr) * 4;
    const pLo    = spot - range4;
    const pHi    = spot + range4;

    // Sample PDF
    const N = 300;
    const xs = [], ys = [];
    let maxY = 0;
    for (let i = 0; i <= N; i++) {
      const x = pLo + (pHi - pLo) * (i / N);
      const y = lognormalPDF(x, spot, T_yr, undefined, undefined, sigma);
      xs.push(x); ys.push(y);
      if (y > maxY) maxY = y;
    }

    const PAD = { l: 10, r: 10, t: 12, b: 24 };
    const cW  = W - PAD.l - PAD.r;
    const cH  = H - PAD.t - PAD.b;
    const xPx = p => PAD.l + ((p - pLo) / (pHi - pLo)) * cW;
    const yPx = v => PAD.t + cH - (v / maxY) * cH * 0.9;

    // Background
    ctx.fillStyle = '#060b14';
    ctx.fillRect(0, 0, W, H);

    // 1σ / 2σ shaded bands
    const s1lo = spot * Math.exp(-sigma * Math.sqrt(T_yr));
    const s1hi = spot * Math.exp( sigma * Math.sqrt(T_yr));
    const s2lo = spot * Math.exp(-2 * sigma * Math.sqrt(T_yr));
    const s2hi = spot * Math.exp( 2 * sigma * Math.sqrt(T_yr));

    function shadeBand(lo, hi, colour) {
      const x1 = clamp(xPx(lo), PAD.l, PAD.l + cW);
      const x2 = clamp(xPx(hi), PAD.l, PAD.l + cW);
      ctx.fillStyle = colour;
      ctx.fillRect(x1, PAD.t, x2 - x1, cH);
    }
    shadeBand(s2lo, s2hi, 'rgba(99,102,241,0.08)');
    shadeBand(s1lo, s1hi, 'rgba(99,102,241,0.15)');

    // PDF curve — filled
    ctx.beginPath();
    ctx.moveTo(xPx(xs[0]), yPx(0));
    for (let i = 0; i < xs.length; i++) ctx.lineTo(xPx(xs[i]), yPx(ys[i]));
    ctx.lineTo(xPx(xs[xs.length - 1]), yPx(0));
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
    grad.addColorStop(0, 'rgba(99,102,241,0.5)');
    grad.addColorStop(1, 'rgba(99,102,241,0.05)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(129,140,248,0.7)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Strike markers
    const visStrikes = (strikes || []).filter(s => s.strike >= pLo && s.strike <= pHi);
    ctx.font         = '9px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    for (const s of visStrikes) {
      const sx  = xPx(s.strike);
      const itm = s.ce?.probITM || 0;
      ctx.strokeStyle = itm > 50 ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, PAD.t);
      ctx.lineTo(sx, PAD.t + cH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Spot line
    const sx = xPx(spot);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(sx, PAD.t); ctx.lineTo(sx, PAD.t + cH); ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.font      = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(spot.toFixed(0), sx, PAD.t - 1);

    // Target price line (if set)
    if (targetPrice && targetPrice >= pLo && targetPrice <= pHi) {
      const tx = xPx(targetPrice);
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(tx, PAD.t); ctx.lineTo(tx, PAD.t + cH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle    = '#a78bfa';
      ctx.textBaseline = 'bottom';
      ctx.fillText(targetPrice.toFixed(0), tx, PAD.t - 1);
    }

    // Axis labels: 2σ / 1σ / spot / +1σ / +2σ
    const labels = [
      { p: s2lo, txt: '−2σ' }, { p: s1lo, txt: '−1σ' },
      { p: spot, txt: '' },
      { p: s1hi, txt: '+1σ' }, { p: s2hi, txt: '+2σ' },
    ];
    ctx.fillStyle    = '#475569';
    ctx.font         = '9px monospace';
    ctx.textBaseline = 'bottom';
    for (const l of labels) {
      if (l.txt) {
        ctx.textAlign = 'center';
        ctx.fillText(l.txt, xPx(l.p), H - 4);
      }
    }
  }, [spot, atm, strikes, atmIV, T, targetPrice]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-[140px] cursor-crosshair rounded"
      onClick={e => {
        if (!onTargetChange) return;
        const rect  = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const atmIVd = (atmIV || 14) / 100;
        const range4 = (spot || 22000) * atmIVd * Math.sqrt(T || 0.02) * 4;
        const pLo    = (spot || 22000) - range4;
        const pHi    = (spot || 22000) + range4;
        const price  = Math.round((pLo + ratio * (pHi - pLo)) / 50) * 50;
        onTargetChange(price);
      }}
    />
  );
}

// ── Payoff Diagram (canvas) ───────────────────────────────────────────────────
function PayoffChart({ spot, atmStrike, premium, isStrangle, lowerStrike, upperStrike }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spot || !premium) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.clientWidth  || 400;
    const H   = canvas.clientHeight || 160;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#060b14';
    ctx.fillRect(0, 0, W, H);

    const strike = atmStrike || spot;
    const lo     = isStrangle ? (lowerStrike || strike - 200) : strike;
    const hi     = isStrangle ? (upperStrike || strike + 200) : strike;

    const rangeW  = Math.max(premium * 4, (hi - lo) * 2 + premium * 2);
    const pLo     = ((lo + hi) / 2) - rangeW / 2;
    const pHi     = ((lo + hi) / 2) + rangeW / 2;

    const maxGain = rangeW / 2;
    const pnlLo   = -premium * 1.5;
    const pnlHi   = premium * 3;
    const PAD     = { l: 40, r: 10, t: 10, b: 28 };
    const cW      = W - PAD.l - PAD.r;
    const cH      = H - PAD.t - PAD.b;
    const xPx = p => PAD.l + ((p - pLo) / (pHi - pLo)) * cW;
    const yPx = v => PAD.t + cH - ((v - pnlLo) / (pnlHi - pnlLo)) * cH;

    // Zero line
    const zeroY = yPx(0);
    ctx.strokeStyle = 'rgba(71,85,105,0.5)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, zeroY); ctx.lineTo(PAD.l + cW, zeroY); ctx.stroke();

    // P&L function
    const pnl = p => {
      if (isStrangle) {
        return Math.max(0, p - hi) + Math.max(0, lo - p) - premium;
      }
      return Math.max(0, p - strike) + Math.max(0, strike - p) - premium;
    };

    // Fill profit area
    const N = 200;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const p = pLo + (pHi - pLo) * (i / N);
      const v = clamp(pnl(p), pnlLo, pnlHi);
      if (i === 0) ctx.moveTo(xPx(p), yPx(v));
      else ctx.lineTo(xPx(p), yPx(v));
    }
    ctx.lineTo(xPx(pHi), yPx(0));
    ctx.lineTo(xPx(pLo), yPx(0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(16,185,129,0.12)';
    ctx.fill();

    // Loss fill
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const p = pLo + (pHi - pLo) * (i / N);
      const v = clamp(pnl(p), pnlLo, 0);
      if (i === 0) ctx.moveTo(xPx(p), yPx(v));
      else ctx.lineTo(xPx(p), yPx(v));
    }
    ctx.lineTo(xPx(pHi), yPx(0));
    ctx.lineTo(xPx(pLo), yPx(0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(239,68,68,0.12)';
    ctx.fill();

    // P&L line
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth   = 2;
    for (let i = 0; i <= N; i++) {
      const p = pLo + (pHi - pLo) * (i / N);
      const v = clamp(pnl(p), pnlLo, pnlHi);
      if (i === 0) ctx.moveTo(xPx(p), yPx(v));
      else ctx.lineTo(xPx(p), yPx(v));
    }
    ctx.stroke();

    // Spot vertical
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xPx(spot), PAD.t);
    ctx.lineTo(xPx(spot), PAD.t + cH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Breakeven labels
    const beLo = (isStrangle ? lo : strike) - premium;
    const beHi = (isStrangle ? hi : strike) + premium;
    ctx.fillStyle    = '#94a3b8';
    ctx.font         = '9px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    if (beLo >= pLo && beLo <= pHi) ctx.fillText(beLo.toFixed(0), xPx(beLo), H - 4);
    if (beHi >= pLo && beHi <= pHi) ctx.fillText(beHi.toFixed(0), xPx(beHi), H - 4);

    // Y-axis: 0, max loss, max gain labels
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('0',             PAD.l - 4, zeroY);
    ctx.fillStyle = '#ef4444';
    ctx.fillText(`-${premium}`,  PAD.l - 4, yPx(-premium));
    ctx.fillStyle = '#10b981';

  }, [spot, atmStrike, premium, isStrangle, lowerStrike, upperStrike]);

  return <canvas ref={canvasRef} className="w-full h-[160px] rounded" />;
}

// ── Trade Desk: rules-based opportunity signals ───────────────────────────────
function generateTradeDesk(chainData, straddleData) {
  if (!chainData) return { buys: [], sells: [], regime: null };

  const { spot, atm, atmIV, hv30, ivHvRatio, straddlePremium, strikes } = chainData;
  const buys = [], sells = [];

  // Straddle stats — optional, falls back to zero when no intraday data yet
  const hasStraddle  = straddleData?.length > 0;
  const openPremium  = hasStraddle ? (straddleData[0]?.value ?? 0) : 0;
  const curPremium   = hasStraddle ? (straddleData[straddleData.length - 1]?.value ?? 0) : 0;
  const dayLow       = hasStraddle ? Math.min(...straddleData.map(d => d.value)) : 0;
  const decayPct     = openPremium > 0 ? (openPremium - curPremium) / openPremium * 100 : 0;
  const recoveryPct  = dayLow > 0 ? (curPremium - dayLow) / dayLow * 100 : 0;
  const expansionPct = openPremium > 0 ? (curPremium - openPremium) / openPremium * 100 : 0;

  // Track single option momentum (15 min lookback) to catch breakouts hidden by theta
  let ceSpike = 0, peSpike = 0;
  if (hasStraddle) {
    const lookback = Math.min(straddleData.length - 1, 3); // 3 bars of 5m = 15 mins
    if (lookback > 0) {
      const curCe = straddleData[straddleData.length - 1].ce;
      const curPe = straddleData[straddleData.length - 1].pe;
      const oldCe = straddleData[straddleData.length - 1 - lookback].ce;
      const oldPe = straddleData[straddleData.length - 1 - lookback].pe;
      if (oldCe > 0 && curCe != null) ceSpike = (curCe - oldCe) / oldCe * 100;
      if (oldPe > 0 && curPe != null) peSpike = (curPe - oldPe) / oldPe * 100;
    }
  }

  // ATM row
  const atmRow = strikes?.find(s => s.strike === atm);
  const atmCe  = atmRow?.ce;
  const atmPe  = atmRow?.pe;

  // OI walls
  const otmCalls = (strikes || []).filter(s => s.strike > spot && s.ce?.oi > 0);
  const otmPuts  = (strikes || []).filter(s => s.strike < spot && s.pe?.oi > 0);
  const callWall = otmCalls.reduce((m, s) => (s.ce.oi > (m?.ce?.oi || 0) ? s : m), null);
  const putFloor = otmPuts.reduce((m, s)  => (s.pe.oi > (m?.pe?.oi || 0) ? s : m), null);

  // PCR
  const totalCeOI = (strikes || []).reduce((s, r) => s + (r.ce?.oi || 0), 0);
  const totalPeOI = (strikes || []).reduce((s, r) => s + (r.pe?.oi || 0), 0);
  const pcr = totalCeOI > 0 ? totalPeOI / totalCeOI : 1;

  const spotAboveAtm = spot > atm;
  const iv = ivHvRatio ?? 1;

  // ── Regime ──────────────────────────────────────────────────────────────────
  // When straddle data exists, use it as primary signal; otherwise fall back to IV/HV
  let regime;
  if (hasStraddle) {
    if (ceSpike > 20 || peSpike > 20) regime = 'breakout';
    else if (expansionPct > 12)       regime = 'expansion';
    else if (decayPct > 18)           regime = 'range';
    else if (recoveryPct > 15)        regime = 'recovery';
    else                              regime = 'neutral';
  } else {
    // IV/HV-based regime when no intraday straddle data yet
    if (iv > 1.4)              regime = 'expansion';   // expensive options → sellers at risk
    else if (iv < 0.8)         regime = 'neutral';     // cheap IV, no directional edge yet
    else if (iv > 1.1)         regime = 'range';       // IV elevated but not extreme
    else                       regime = 'neutral';
  }

  // ── BUY SIGNALS ─────────────────────────────────────────────────────────────

  // 1a. Intraday Breakout — sharp single-leg momentum
  if (ceSpike > 20 || peSpike > 20) {
    const isCe = ceSpike > peSpike;
    const spikeVal = isCe ? ceSpike : peSpike;
    const dir = isCe ? 'CE' : 'PE';
    const ltp = isCe ? atmCe?.ltp : atmPe?.ltp;
    buys.push({ strike: atm, type: dir, confidence: spikeVal > 35 ? 'HIGH' : 'MEDIUM',
      trigger: 'breakout', reasons: [
        `Sharp directional move: ${dir} spiked +${spikeVal.toFixed(0)}% in last 15 mins`,
        `Outpacing theta — strong momentum breakout`,
      ], ltp, sl: ltp ? (ltp * 0.70).toFixed(0) : null });
  }

  // 1. Expansion — sellers trapped, momentum buy
  if (expansionPct > 10) {
    const dir = spotAboveAtm ? 'CE' : 'PE';
    const ltp = dir === 'CE' ? atmCe?.ltp : atmPe?.ltp;
    const reasons = [
      `Straddle +${expansionPct.toFixed(0)}% above open — sellers squeezed`,
      `Price ${spotAboveAtm ? 'above' : 'below'} ATM confirms ${spotAboveAtm ? 'bullish' : 'bearish'} momentum`,
    ];
    if (iv < 1.1) reasons.push(`IV/HV ${iv.toFixed(2)}× — options still not expensive`);
    if (atmCe?.oiChange < -30000 || atmPe?.oiChange < -30000)
      reasons.push(`OI unwinding at ATM — short covering adds fuel`);
    buys.push({ strike: atm, type: dir, confidence: expansionPct > 20 ? 'HIGH' : 'MEDIUM',
      trigger: 'expansion', reasons, ltp, sl: ltp ? (ltp * 0.60).toFixed(0) : null });
  }

  // 2. Recovery from day lows — potential breakout setup
  if (recoveryPct > 18 && expansionPct <= 10) {
    const dir = spotAboveAtm ? 'CE' : 'PE';
    const ltp = dir === 'CE' ? atmCe?.ltp : atmPe?.ltp;
    const reasons = [
      `Straddle recovered +${recoveryPct.toFixed(0)}% from day lows (₹${dayLow.toFixed(0)} → ₹${curPremium.toFixed(0)})`,
      `Classic seller exhaustion — watch for directional break`,
    ];
    if (iv < 0.95) reasons.push(`IV/HV ${iv.toFixed(2)}× — cheap options, asymmetric risk/reward`);
    buys.push({ strike: atm, type: dir, confidence: recoveryPct > 28 ? 'HIGH' : 'MEDIUM',
      trigger: 'recovery', reasons, ltp, sl: ltp ? (ltp * 0.60).toFixed(0) : null });
  }

  // 3. Cheap IV — only when *something* is moving.
  // We do NOT want "cheap IV" to spam ATM buy OPs on quiet range days.
  // Gate it behind intraday participation signals.
  const cheapIvGate =
    hasStraddle && (
      // directional or volatility pickup
      expansionPct > 6 ||
      recoveryPct  > 12 ||
      ceSpike      > 10 ||
      peSpike      > 10
    );

  if (iv < 0.85 && buys.length === 0 && cheapIvGate) {
    const ltp = atmCe?.ltp;
    buys.push({ strike: atm, type: 'CE/PE', confidence: 'MEDIUM', trigger: 'cheap_iv',
      reasons: [
        `IV/HV ${iv.toFixed(2)}× — options priced below realized volatility`,
        `Mathematical buyer edge: historical vol suggests bigger moves than priced`,
        `But: only act when expansion/momentum starts (today is showing early pickup).`,
        pcr < 0.8 ? `PCR ${pcr.toFixed(2)} — put writers dominant, reversal risk` :
        pcr > 1.3 ? `PCR ${pcr.toFixed(2)} — extreme, contrarian buy signal` :
        `PCR ${pcr.toFixed(2)} — positioning context`,
      ], ltp, sl: ltp ? (ltp * 0.60).toFixed(0) : null });
  }

  // ── SELL SIGNALS ─────────────────────────────────────────────────────────────

  // 1. Call wall — sell OTM CE at resistance
  if (callWall?.ce?.oi > 300000) {
    const distPct = ((callWall.strike - spot) / spot * 100).toFixed(1);
    const reasons = [
      `${(callWall.ce.oi / 100000).toFixed(1)}L OI at ${callWall.strike} CE — strongest call wall`,
      `${distPct}% above spot — heavy seller positioning at this level`,
    ];
    if ((callWall.ce?.oiChange || 0) > 50000)
      reasons.push(`+${(callWall.ce.oiChange / 100000).toFixed(1)}L fresh OI today — fresh shorts`);
    if (decayPct > 8) reasons.push(`Theta working: straddle down ${decayPct.toFixed(0)}% from open`);
    sells.push({ strike: callWall.strike, type: 'CE', confidence: callWall.ce.oi > 800000 ? 'HIGH' : 'MEDIUM',
      trigger: 'call_wall', strategy: 'Sell CE / Bear Call Spread',
      reasons, ltp: callWall.ce.ltp,
      target: (callWall.ce.ltp * 0.45).toFixed(0), sl: (callWall.ce.ltp * 1.50).toFixed(0) });
  }

  // 2. Put floor — sell OTM PE at support
  if (putFloor?.pe?.oi > 300000) {
    const distPct = ((spot - putFloor.strike) / spot * 100).toFixed(1);
    const reasons = [
      `${(putFloor.pe.oi / 100000).toFixed(1)}L OI at ${putFloor.strike} PE — strongest put wall`,
      `${distPct}% below spot — sellers defending this support`,
    ];
    if ((putFloor.pe?.oiChange || 0) > 50000)
      reasons.push(`+${(putFloor.pe.oiChange / 100000).toFixed(1)}L fresh OI — active positioning`);
    sells.push({ strike: putFloor.strike, type: 'PE', confidence: putFloor.pe.oi > 800000 ? 'HIGH' : 'MEDIUM',
      trigger: 'put_floor', strategy: 'Sell PE / Bull Put Spread',
      reasons, ltp: putFloor.pe.ltp,
      target: (putFloor.pe.ltp * 0.45).toFixed(0), sl: (putFloor.pe.ltp * 1.50).toFixed(0) });
  }

  // 3a. No straddle data + high IV — IV mean-reversion sell signal
  if (!hasStraddle && iv > 1.2 && sells.length === 0) {
    const reasons = [
      `IV/HV ${iv.toFixed(2)}× — options significantly overpriced vs realized vol`,
      `Mathematical seller edge: premium likely to decay toward historical vol`,
      pcr > 1.0 ? `PCR ${pcr.toFixed(2)} — put-heavy positioning supports range bias` : `Sell premium at elevated IV levels`,
    ];
    sells.push({ strike: atm, type: 'STRADDLE', confidence: iv > 1.5 ? 'HIGH' : 'MEDIUM',
      trigger: 'high_iv', strategy: 'Sell ATM Straddle / Iron Condor',
      reasons, ltp: straddlePremium,
      target: straddlePremium ? (straddlePremium * 0.45).toFixed(0) : null, sl: null });
  }

  // 3. Range day with expensive IV — sell ATM straddle
  if (decayPct > 20 && iv > 1.1) {
    const reasons = [
      `Straddle decayed ${decayPct.toFixed(0)}% from open — classic range day`,
      `IV/HV ${iv.toFixed(2)}× — options overpriced vs realized vol`,
      `Sellers have maintained control all session`,
    ];
    if (!sells.find(s => s.trigger === 'range'))
      sells.push({ strike: atm, type: 'STRADDLE', confidence: decayPct > 30 ? 'HIGH' : 'MEDIUM',
        trigger: 'range', strategy: 'Sell ATM Straddle / Iron Condor',
        reasons, ltp: straddlePremium,
        target: (straddlePremium * 0.45).toFixed(0), sl: null });
  }

  return { buys: buys.slice(0, 2), sells: sells.slice(0, 2), regime,
    stats: { decayPct, recoveryPct, expansionPct, pcr, regime } };
}

// ── Trade Desk Panel ──────────────────────────────────────────────────────────
function TradeDeskPanel({ buys, sells, regime, stats, symbol, spot, atm, strikes, resolvedExpiry, marketBias, marketRegime, scTrade, scScore, scMax }) {
  const [placing,   setPlacing]   = useState(null); // strike+type key
  const [results,   setResults]   = useState({});   // key → { ok, msg }
  const [expanded,  setExpanded]  = useState(() => ({})); // key -> boolean (strike+side)
  const [orderModal, setOrderModal] = useState(null); // { side, strike, type, ltp } | null
  const [orderLotSize, setOrderLotSize] = useState(null);
  const [orderForm,  setOrderForm]  = useState({ lots: '1', entryOrderType: 'LIMIT', limitPrice: '', triggerPrice: '' });
  const [orderErr,   setOrderErr]   = useState(null);
  const [orderOk,    setOrderOk]    = useState(null);
  const [marginEst,  setMarginEst]  = useState(null); // { loading, error, data }
  const [deskOpen,   setDeskOpen]   = useState(true); // collapse buy+sell together
  const lastBuyOpAlertRef = useRef(null); // string key to dedupe alerts
  const alertTimerRef = useRef(null);

  const triggerBuyOpAlert = useCallback(() => {
    const fireOnce = () => {
      try { playWarningPing(); } catch {}
      try {
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance('Attention Option Buy Alert');
          u.rate = 1;
          u.pitch = 1;
          u.volume = 1;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        }
      } catch {}
    };

    // Clear any pending second-beep from earlier triggers
    if (alertTimerRef.current) {
      clearTimeout(alertTimerRef.current);
      alertTimerRef.current = null;
    }

    fireOnce();
    alertTimerRef.current = setTimeout(() => {
      fireOnce();
      alertTimerRef.current = null;
    }, 5000);
  }, []);

  // ── Sound/TTS alert: new BUY OP near ATM±1 ────────────────────────────────
  useEffect(() => {
    if (!buys?.length || atm == null || !resolvedExpiry) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    const step = symbol === 'BANKNIFTY' ? 100 : 50;
    const near = buys
      .filter(o => o?.strike != null && Math.abs(o.strike - atm) <= step)
      .sort((a, b) => Math.abs(a.strike - atm) - Math.abs(b.strike - atm))[0];
    if (!near) return;

    const key = `${symbol}:${resolvedExpiry.slice(0, 10)}:${atm}:${near.strike}:${near.type}:${near.trigger ?? ''}`;
    if (lastBuyOpAlertRef.current === key) return;
    lastBuyOpAlertRef.current = key;

    triggerBuyOpAlert();
  }, [buys, atm, resolvedExpiry, symbol]);

  const REGIME_META = {
    breakout:  { label: 'BREAKOUT',       color: 'text-violet-400',  dot: 'bg-violet-400',  tip: 'Sharp directional momentum — buy the moving leg' },
    expansion: { label: 'EXPANSION DAY',  color: 'text-rose-400',    dot: 'bg-rose-400',    tip: 'Sellers trapped — buy breakouts, avoid selling premium' },
    recovery:  { label: 'WATCH — RECOVERY', color: 'text-amber-400', dot: 'bg-amber-400',   tip: 'Straddle bouncing from lows — potential breakout brewing' },
    range:     { label: 'RANGE DAY',      color: 'text-emerald-400', dot: 'bg-emerald-400', tip: 'Sellers in control — sell premium, avoid buying options' },
    neutral:   { label: 'NEUTRAL',        color: 'text-slate-400',   dot: 'bg-slate-500',   tip: 'No clear regime — wait for signal before entering' },
  };
  const rm = REGIME_META[regime] || REGIME_META.neutral;
  const marketRegimeKey = marketRegime?.regime && marketRegime.regime !== 'INITIALIZING' ? marketRegime.regime : null;
  const marketRegimeLabel = marketRegimeKey ? marketRegimeKey.replace(/_/g, ' ') : '—';
  const marketRegimeConf  = marketRegime?.confidence || null;

  const CONF = {
    HIGH:   { bars: 3, color: 'bg-emerald-500', label: 'HIGH' },
    MEDIUM: { bars: 2, color: 'bg-amber-500',   label: 'MED'  },
    LOW:    { bars: 1, color: 'bg-slate-500',   label: 'LOW'  },
  };

  const strikeStep = symbol === 'BANKNIFTY' ? 100 : 50;
  const baseStrikeRows = [atm + strikeStep, atm, atm - strikeStep].filter(Boolean);

  // Also show OP strikes even if outside ATM±1
  const buyOppStrikes  = [...new Set((buys  || []).map(o => o.strike).filter(Boolean))];
  const sellOppStrikes = [...new Set((sells || []).map(o => o.strike).filter(Boolean))];
  const extraBuyStrikes  = buyOppStrikes.filter(s => !baseStrikeRows.includes(s));
  const extraSellStrikes = sellOppStrikes.filter(s => !baseStrikeRows.includes(s));

  // Keep base rows first; append extra OP strikes by closeness to ATM.
  const sortByAtm = (a, b) => Math.abs(a - atm) - Math.abs(b - atm);
  extraBuyStrikes.sort(sortByAtm);
  extraSellStrikes.sort(sortByAtm);

  // Use the same market bias source as Trades home (market-data sentiment),
  // rather than deriving bias from spot-vs-ATM heuristics.
  const biasLabel = String(marketBias || 'Neutral').toUpperCase().includes('BULL') ? 'BULLISH'
    : String(marketBias || 'Neutral').toUpperCase().includes('BEAR') ? 'BEARISH'
    : 'NEUTRAL';

  // Default commentary (used when a strike/leg has no specific opportunity reasons).
  // Keeps ATM card informative on both buy/sell sides.
  const baseWhy = (() => {
    const out = [];
    if (stats?.pcr != null) out.push(`PCR ${stats.pcr.toFixed(2)} — positioning bias context`);
    if (stats?.expansionPct != null && stats.expansionPct > 8) out.push(`Straddle +${stats.expansionPct.toFixed(0)}% vs open — volatility expansion`);
    if (stats?.decayPct != null && stats.decayPct > 8) out.push(`Straddle -${stats.decayPct.toFixed(0)}% vs open — theta decay`);
    return out;
  })();

  const findBuyOpp = (strike, type) => {
    const exact = buys.find(o => o.strike === strike && o.type === type);
    if (exact) return exact;
    // Some signals are generic (CE/PE) at ATM — treat as applicable to both legs.
    const generic = buys.find(o => o.strike === strike && o.type === 'CE/PE');
    return generic ?? null;
  };

  const findSellOpp = (strike, type) => sells.find(o => o.strike === strike && o.type === type) ?? null;

  const closestBuyOpp = buys?.length
    ? buys.slice().sort((a, b) => Math.abs(a.strike - atm) - Math.abs(b.strike - atm))[0]
    : null;
  const closestSellOpp = sells?.length
    ? sells.slice().sort((a, b) => Math.abs(a.strike - atm) - Math.abs(b.strike - atm))[0]
    : null;

  const chartHref = (strike, type) => {
    // Deprecated: we now open the main chart (`/chart`) for the resolved option tradingsymbol
    // so the user lands directly on the correct contract (same as OrderModal).
    return null;
  };

  const openOptionChart = async ({ strike, type }) => {
    if (!resolvedExpiry) {
      window.open('/chart?symbol=' + encodeURIComponent(symbol), '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const qs = new URLSearchParams({
        action: 'tradingsymbol',
        symbol: String(symbol).toUpperCase(),
        expiry: resolvedExpiry.slice(0, 10),
        strike: String(strike),
        type: String(type).toUpperCase(),
        bust: '0',
      });
      const r = await fetch(`/api/option-meta?${qs.toString()}`, { cache: 'no-store' });
      const d = await r.json();
      const ts = d?.tradingSymbol;
      if (!ts) throw new Error(d?.error || 'Symbol not found');
      // `/api/chart-data` expects NFO tradingsymbol without `NFO:` prefix for token resolution.
      window.open('/chart?theme=dark&symbol=' + encodeURIComponent(ts), '_blank', 'noopener,noreferrer');
    } catch (e) {
      window.alert(`Chart open failed: ${e.message}`);
    }
  };

  const openOrderModal = ({ side, strike, type, ltp }) => {
    const isBuy = side === 'buy';
    const buf = (ltp != null ? (ltp < 25 ? 0.5 : ltp < 80 ? 1 : 2) : 1);
    const defLimit = ltp != null ? (isBuy ? ltp + buf : ltp - buf) : '';
    const defTrig  = ltp != null ? (isBuy ? ltp + buf : ltp - buf) : '';
    const defSLim  = ltp != null ? (isBuy ? defTrig + buf : defTrig - buf) : '';
    setOrderModal({ side, strike, type, ltp });
    setOrderErr(null); setOrderOk(null);
    setMarginEst(null);
    setOrderForm({
      lots: '1',
      entryOrderType: 'LIMIT',
      limitPrice: defLimit !== '' ? String(Math.round(defLimit * 20) / 20) : '',
      triggerPrice: defTrig !== '' ? String(Math.round(defTrig * 20) / 20) : '',
      // for SL entry we reuse limitPrice as "SL limit", keep default filled
      slLimitFallback: defSLim !== '' ? String(Math.round(defSLim * 20) / 20) : '',
    });

    // Fetch lot size for display + quantity derivation (lots × lotSize).
    fetch(`/api/option-meta?action=lotsize&symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const lot = d?.lotSize;
        if (!lot) return;
        setOrderLotSize(lot);
      })
      .catch(() => {});
  };

  const estOrderAmount = (() => {
    if (!orderModal) return null;
    const lots = Math.max(1, parseInt(orderForm.lots || '1') || 1);
    const qty  = orderLotSize ? lots * orderLotSize : null;
    const px   = orderForm.limitPrice ? parseFloat(orderForm.limitPrice) : null;
    if (!qty || !px || isNaN(px)) return null;
    return { qty, px, total: qty * px };
  })();

  // Margin estimator (SELL only) — runs when modal inputs change.
  useEffect(() => {
    if (!orderModal) return;
    if (orderModal.side !== 'sell') return;
    if (!resolvedExpiry) return;
    if (!orderLotSize) return;
    const lots = Math.max(1, parseInt(orderForm.lots || '1') || 1);
    const quantity = lots * orderLotSize;
    const order_type = orderForm.entryOrderType;
    const price = orderForm.limitPrice ? parseFloat(orderForm.limitPrice) : null;
    const trigger_price = orderForm.entryOrderType === 'SL' && orderForm.triggerPrice ? parseFloat(orderForm.triggerPrice) : null;
    if (!price || isNaN(price)) return;

    let cancelled = false;
    setMarginEst({ loading: true, error: null, data: null });

    const run = async () => {
      try {
        // Resolve tradingsymbol via option-meta (same as chart/order modal).
        const qs = new URLSearchParams({
          action: 'tradingsymbol',
          symbol: String(symbol).toUpperCase(),
          expiry: resolvedExpiry.slice(0, 10),
          strike: String(orderModal.strike),
          type: String(orderModal.type).toUpperCase(),
          bust: '0',
        });
        const tsRes = await fetch(`/api/option-meta?${qs.toString()}`, { cache: 'no-store' });
        const tsData = await tsRes.json();
        const tradingsymbol = tsData?.tradingSymbol;
        if (!tradingsymbol) throw new Error(tsData?.error || 'Could not resolve tradingsymbol');

        const res = await fetch('/api/options/margin-estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exchange: 'NFO',
            tradingsymbol,
            transaction_type: 'SELL',
            order_type,
            product: 'MIS',
            quantity,
            price,
            trigger_price,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Margin estimate failed');
        if (cancelled) return;
        setMarginEst({ loading: false, error: null, data });
      } catch (e) {
        if (cancelled) return;
        setMarginEst({ loading: false, error: e.message, data: null });
      }
    };

    const t = setTimeout(run, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [orderModal, orderForm.lots, orderForm.entryOrderType, orderForm.limitPrice, orderForm.triggerPrice, orderLotSize, resolvedExpiry, symbol]);

  const placeQuickOrder = async () => {
    if (!orderModal || !resolvedExpiry) return;
    const isBuy = orderModal.side === 'buy';
    const transaction_type = isBuy ? 'BUY' : 'SELL';
    const entryOrderType = orderForm.entryOrderType;
    const lots = parseInt(orderForm.lots || '0') || 1;
    const qty = orderLotSize ? lots * orderLotSize : null;
    const limitPrice = orderForm.limitPrice ? parseFloat(orderForm.limitPrice) : null;
    const triggerPrice = orderForm.triggerPrice ? parseFloat(orderForm.triggerPrice) : null;

    setOrderErr(null); setOrderOk(null);
    setPlacing('modal');
    try {
      const res = await fetch('/api/options/quick-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          expiry: resolvedExpiry.slice(0, 10),
          strike: orderModal.strike,
          type: orderModal.type,
          exchange: 'NFO',
          qty,
          transaction_type,
          entryOrderType,
          entryLimitPrice: limitPrice,
          entryTriggerPrice: entryOrderType === 'SL' ? triggerPrice : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        setOrderErr(data?.error || 'Order failed');
      } else {
        setOrderOk(`✓ ${transaction_type} ${orderModal.strike} ${orderModal.type} (${entryOrderType})`);
        setTimeout(() => { setOrderModal(null); }, 900);
      }
    } catch (e) {
      setOrderErr(e.message);
    } finally {
      setPlacing(null);
    }
  };

  function CardHeader({ side, strike, hasOpp }) {
    const sideCls = side === 'buy'
      ? { text: 'text-emerald-300', border: 'border-emerald-900/40', bg: 'bg-[#071a10]' }
      : { text: 'text-red-300',     border: 'border-red-900/40',     bg: 'bg-[#1a0a0a]' };
    const exp = resolvedExpiry ? resolvedExpiry.slice(5, 10) : '—';
    const k = `${side}:${strike}`;
    const isOpen = !!expanded[k];
    const nearAtm = atm != null && Math.abs(strike - atm) <= strikeStep;
    return (
      <button
        type="button"
        onClick={() => setExpanded(e => ({ ...e, [k]: !e[k] }))}
        className="w-full flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasOpp && (
            <span className={`text-[10px] font-extrabold tracking-widest ${side === 'buy' ? 'text-emerald-300' : 'text-rose-300'} ${nearAtm ? 'animate-pulse' : ''}`}>
              OP
            </span>
          )}
          {strike === atm && (
            <span className="text-[10px] font-extrabold tracking-widest text-amber-300">
              ATM
            </span>
          )}
          <span className={`text-sm font-bold ${sideCls.text}`}>{strike}</span>
          <span className="text-[10px] text-slate-500 font-mono truncate">{symbol} · Exp {exp}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-slate-500 font-mono">Desk {rm.label}</span>
          <span className="text-[10px] text-slate-500 font-mono">
            Market {marketRegimeLabel}{marketRegimeConf ? ` (${marketRegimeConf})` : ''}
          </span>
          <span className={`text-[10px] font-mono ${biasLabel === 'BULLISH' ? 'text-emerald-400' : biasLabel === 'BEARISH' ? 'text-red-400' : 'text-slate-400'}`}>
            Bias {biasLabel}
          </span>
          <span className="text-slate-500 text-xs">{isOpen ? '▾' : '▸'}</span>
        </div>
      </button>
    );
  }

  function LegRow({ side, strike, type }) {
    const isBuy = side === 'buy';
    const opp   = isBuy ? findBuyOpp(strike, type) : findSellOpp(strike, type);
    const isAtm = strike === atm;
    const showLevels = !!opp || isAtm;
    const key = `${side}:${strike}:${type}`;
    const res = results[`${strike}-${type}`];

    const conf = opp?.confidence ? (CONF[opp.confidence] || CONF.MEDIUM) : null;
    const rowLtp = strikes?.find(s => s.strike === strike)?.[type.toLowerCase()]?.ltp ?? null;
    const entry = opp?.ltp ?? rowLtp ?? null;

    return (
      <div className={`rounded-lg border ${
        opp
          ? (isBuy ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-rose-500/40 bg-rose-500/10')
          : 'border-white/[0.06] bg-white/[0.02]'
      }`}>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold ${type === 'CE' ? 'text-sky-400' : 'text-rose-400'}`}>{type}</span>
              {opp && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  isBuy ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10' : 'border-rose-500/30 text-rose-300 bg-rose-500/10'
                }`}>
                  Recommended
                </span>
              )}
              {conf && (
                <span className={`text-[9px] font-bold ${conf.bars === 3 ? (isBuy ? 'text-emerald-400' : 'text-rose-400') : 'text-amber-400'}`}>
                  {conf.label}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-[11px] font-mono text-slate-300">
              {entry != null && <span className="text-white">{isBuy ? 'Buy' : 'Sell'} @ ₹{typeof entry === 'number' ? entry.toFixed(0) : entry}</span>}
              {showLevels && opp?.sl && <span className="text-red-400">SL ₹{opp.sl}</span>}
              {showLevels && opp?.target && <span className="text-emerald-400">T ₹{opp.target}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => openOptionChart({ strike, type })}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            View chart ↗
          </button>
            <button
              onClick={() => {
                openOrderModal({ side, strike, type, ltp: rowLtp ?? null });
              }}
              disabled={!!placing}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 ${
                isBuy ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
            >
              {placing ? 'Placing…' : (isBuy ? 'Buy' : 'Sell')}
            </button>
            {isBuy && res && (
              <span className={`text-[10px] font-mono ${res.ok ? 'text-emerald-400' : 'text-red-400'}`}>{res.msg}</span>
            )}
          </div>
        </div>

        {/* Collapsible commentary ("Why") */}
        {(opp?.reasons?.length || (isAtm && baseWhy.length)) ? (
          <details className="border-t border-white/[0.06] px-3 py-2" open={!!opp?.reasons?.length}>
            <summary className="cursor-pointer select-none text-[10px] font-mono text-slate-500 hover:text-slate-300">
              Why ({(opp?.reasons?.length || 0) + (isAtm ? baseWhy.length : 0)})
            </summary>
            <ul className="mt-2 space-y-0.5">
              {(opp?.reasons?.length ? opp.reasons : []).map((r, j) => (
                <li key={j} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                  <span className={isBuy ? 'text-emerald-600 mt-0.5 flex-shrink-0' : 'text-red-700 mt-0.5 flex-shrink-0'}>•</span>{r}
                </li>
              ))}
              {isAtm && baseWhy.map((r, j) => (
                <li key={`base_${j}`} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                  <span className={isBuy ? 'text-emerald-600 mt-0.5 flex-shrink-0' : 'text-red-700 mt-0.5 flex-shrink-0'}>•</span>{r}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    );
  }

  // (Old atm-quick-order flow removed in favor of /api/options/quick-order + modal.)

  const noBuys  = buys.length  === 0;
  const noSells = sells.length === 0;

  return (
    <div className={`max-w-[1400px] mx-auto px-6 ${deskOpen ? 'pb-4' : 'pb-0'}`}>
      {/* Regime strip */}
      <div className={`flex items-center gap-3 ${deskOpen ? 'mb-3' : 'mb-0'}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rm.dot}`} />
        <span className={`text-[11px] font-bold tracking-widest ${rm.color}`}>{rm.label}</span>
        <span className="text-[11px] text-slate-500">{rm.tip}</span>
        <div className="flex-1 h-px bg-white/[0.05]" />
        <button
          type="button"
          onClick={() => setDeskOpen(o => !o)}
          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
          title={deskOpen ? 'Collapse opportunities' : 'Expand opportunities'}
        >
          {deskOpen ? 'Collapse Buy-Sell' : 'Expand Buy-Sell'}
        </button>
        {process.env.NODE_ENV !== 'production' && (
          <button
            type="button"
            onClick={triggerBuyOpAlert}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 transition-colors"
            title="Dev only: test buy OP alert"
          >
            Test Alert
          </button>
        )}
        {stats && (
          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
            {(stats.expansionPct !== 0 || stats.decayPct !== 0) ? (
              stats.expansionPct > 0
                ? <span className="text-rose-400">Straddle +{stats.expansionPct.toFixed(0)}% vs open</span>
                : <span className="text-emerald-400">Straddle -{stats.decayPct.toFixed(0)}% vs open</span>
            ) : null}
            <span>PCR {stats.pcr.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Two columns */}
      {deskOpen && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* ── BUY ZONE ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-widest text-emerald-400">⚡ BUY OPPORTUNITIES</span>
              <div className="flex-1 h-px bg-emerald-900/40" />
            </div>

            {/* ── Short Covering CE card — pinned top of buy zone when active ── */}
            {scTrade && (
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-950/40 ring-1 ring-emerald-500/20 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-emerald-400 tracking-widest">⚡ SHORT COVERING</span>
                    <span className="text-[9px] font-mono bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">{scScore}/{scMax}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">{scTrade.expiry}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white">NIFTY {scTrade.strike} CE</div>
                    <div className="text-[10px] text-slate-400">Entry LTP · ATM call</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-300 font-mono">₹{scTrade.entryLtp}</div>
                    <div className="text-[10px] text-red-400 font-mono">SL ₹{scTrade.sl.cePremium} <span className="text-slate-500">−{scTrade.sl.pctRisk}%</span></div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {scTrade.targets.map((t, i) => (
                    <div key={i} className="rounded-lg bg-white/[0.04] px-2 py-1 text-center">
                      <div className="text-[9px] text-slate-500">T{i + 1} · {t.indexLevel}</div>
                      <div className="text-[11px] font-mono text-emerald-400">₹{t.cePremium}</div>
                      <div className="text-[9px] text-slate-500">{t.rr}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-slate-500 italic">{scTrade.note}</div>
              </div>
            )}

            {buys?.length > 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] text-emerald-200">
                Buy edge detected: <span className="font-bold">+{buys.length}</span>. Closest: <span className="font-mono font-bold">{closestBuyOpp?.strike} {closestBuyOpp?.type}</span>.
                <span className="text-emerald-300/80"> OP tags near ATM pulse.</span>
              </div>
            )}
          {noBuys && (
            <div className="rounded-xl border border-white/[0.05] bg-[#0a0e18] px-4 py-3 text-[11px] text-slate-500">
              No buying edge detected — {regime === 'range' ? 'range day, sellers in control. Wait for expansion.' : 'wait for straddle expansion or momentum breakout.'}
            </div>
          )}

          {baseStrikeRows.map((strike) => {
            const hasOpp = !!findBuyOpp(strike, 'CE') || !!findBuyOpp(strike, 'PE') || !!findBuyOpp(strike, 'CE/PE');
            const k = `buy:${strike}`;
            return (
              <div key={k} className={`rounded-xl border border-emerald-900/40 bg-[#071a10] px-4 py-3 space-y-2 ${hasOpp ? 'ring-1 ring-emerald-500/30' : ''}`}>
                <CardHeader side="buy" strike={strike} hasOpp={hasOpp} />
                <div className="space-y-2 pt-2">
                  <LegRow side="buy" strike={strike} type="CE" />
                  <LegRow side="buy" strike={strike} type="PE" />
                </div>
              </div>
            );
          })}

          {extraBuyStrikes.length > 0 && (
            <div className="pt-1">
              <div className="text-[10px] text-slate-500 font-mono px-1">Other OP strikes</div>
            </div>
          )}
          {extraBuyStrikes.map((strike) => {
            const hasOpp = true;
            const k = `buy:op:${strike}`;
            return (
              <div key={k} className="rounded-xl border border-emerald-500/30 bg-[#071a10] px-4 py-3 space-y-2 ring-1 ring-emerald-500/20">
                <CardHeader side="buy" strike={strike} hasOpp={hasOpp} />
                <div className="space-y-2 pt-2">
                  <LegRow side="buy" strike={strike} type="CE" />
                  <LegRow side="buy" strike={strike} type="PE" />
                </div>
              </div>
            );
          })}
          </div>

          {/* ── SELL ZONE ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-widest text-red-400">⊕ SELL OPPORTUNITIES</span>
              <div className="flex-1 h-px bg-red-900/40" />
            </div>
            {sells?.length > 0 && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-[11px] text-rose-200">
                Sell edge detected: <span className="font-bold">+{sells.length}</span>. Closest: <span className="font-mono font-bold">{closestSellOpp?.strike} {closestSellOpp?.type}</span>.
              </div>
            )}
          {noSells && (
            <div className="rounded-xl border border-white/[0.05] bg-[#0a0e18] px-4 py-3 text-[11px] text-slate-500">
              No clear selling setup — {regime === 'expansion' ? 'expansion day, avoid selling premium.' : 'wait for high IV or clear OI wall to form.'}
            </div>
          )}

          {baseStrikeRows.map((strike) => {
            const hasOpp = !!findSellOpp(strike, 'CE') || !!findSellOpp(strike, 'PE');
            const k = `sell:${strike}`;
            return (
              <div key={k} className={`rounded-xl border border-red-900/40 bg-[#1a0a0a] px-4 py-3 space-y-2 ${hasOpp ? 'ring-1 ring-rose-500/30' : ''}`}>
                <CardHeader side="sell" strike={strike} hasOpp={hasOpp} />
                <div className="space-y-2 pt-2">
                  <LegRow side="sell" strike={strike} type="CE" />
                  <LegRow side="sell" strike={strike} type="PE" />
                </div>
              </div>
            );
          })}

          {extraSellStrikes.length > 0 && (
            <div className="pt-1">
              <div className="text-[10px] text-slate-500 font-mono px-1">Other OP strikes</div>
            </div>
          )}
          {extraSellStrikes.map((strike) => {
            const hasOpp = true;
            const k = `sell:op:${strike}`;
            return (
              <div key={k} className="rounded-xl border border-rose-500/30 bg-[#1a0a0a] px-4 py-3 space-y-2 ring-1 ring-rose-500/20">
                <CardHeader side="sell" strike={strike} hasOpp={hasOpp} />
                <div className="space-y-2 pt-2">
                  <LegRow side="sell" strike={strike} type="CE" />
                  <LegRow side="sell" strike={strike} type="PE" />
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Quick order modal */}
      {orderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#07101d] shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">
                  {orderModal.side === 'buy' ? 'Buy' : 'Sell'} {symbol} {orderModal.strike} {orderModal.type}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">Expiry {resolvedExpiry?.slice(0, 10) ?? '—'} · LTP {orderModal.ltp != null ? `₹${orderModal.ltp.toFixed(2)}` : '—'}</div>
              </div>
              <button onClick={() => setOrderModal(null)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-20">Type</span>
                <div className="flex bg-[#0c1a2e] rounded-lg p-0.5">
                  {['LIMIT', 'SL'].map(t => (
                    <button
                      key={t}
                      onClick={() => setOrderForm(f => ({ ...f, entryOrderType: t }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        orderForm.entryOrderType === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-20">Lots</span>
                <input
                  value={orderForm.lots}
                  onChange={e => setOrderForm(f => ({ ...f, lots: e.target.value }))}
                  placeholder="1"
                  className="flex-1 bg-[#060b14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setOrderForm(f => {
                      const cur = Math.max(1, parseInt(f.lots || '1') || 1);
                      return { ...f, lots: String(Math.max(1, cur - 1)) };
                    })}
                    className="px-2 py-1 rounded-md text-[11px] font-bold border bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
                    title="Decrease lots"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderForm(f => {
                      const cur = Math.max(1, parseInt(f.lots || '1') || 1);
                      return { ...f, lots: String(cur + 1) };
                    })}
                    className="px-2 py-1 rounded-md text-[11px] font-bold border bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
                    title="Increase lots"
                  >
                    +
                  </button>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">{orderLotSize ? `×${orderLotSize} = ${Math.max(1, parseInt(orderForm.lots || '1') || 1) * orderLotSize}` : ''}</span>
              </div>

              {orderForm.entryOrderType === 'SL' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-20">Trigger</span>
                  <input
                    value={orderForm.triggerPrice}
                    onChange={e => setOrderForm(f => ({ ...f, triggerPrice: e.target.value }))}
                    className="flex-1 bg-[#060b14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-20">{orderForm.entryOrderType === 'SL' ? 'Limit' : 'Price'}</span>
                <input
                  value={orderForm.limitPrice}
                  onChange={e => setOrderForm(f => ({ ...f, limitPrice: e.target.value }))}
                  className="flex-1 bg-[#060b14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {estOrderAmount && (
                <div className="text-[11px] text-slate-400 font-mono">
                  Est. {orderModal.side === 'buy' ? 'debit' : 'credit'}: ₹{Math.round(estOrderAmount.total).toLocaleString('en-IN')} ({estOrderAmount.qty} × ₹{estOrderAmount.px.toFixed(2)})
                </div>
              )}

              {orderModal.side === 'sell' && (
                <div className="text-[11px] text-slate-400 font-mono">
                  {marginEst?.loading
                    ? 'Est. margin: …'
                    : marginEst?.error
                      ? `Est. margin: — (${marginEst.error})`
                      : (() => {
                          const row = Array.isArray(marginEst?.data?.margins?.data)
                            ? marginEst.data.margins.data[0]
                            : null;
                          const total = row?.total ?? row?.total_margin ?? null;
                          return total != null
                            ? `Est. margin: ₹${Math.round(total).toLocaleString('en-IN')}`
                            : 'Est. margin: —';
                        })()
                  }
                </div>
              )}

              {orderErr && <div className="text-sm text-red-400">{orderErr}</div>}
              {orderOk && <div className="text-sm text-emerald-400">{orderOk}</div>}
            </div>

            <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-end gap-2">
              <button
                onClick={() => setOrderModal(null)}
                className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={placeQuickOrder}
                disabled={!!placing}
                className="px-3 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors"
              >
                {placing ? 'Placing…' : 'Place order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Returns true if current IST time is within NSE market hours (Mon-Fri, 9:15-15:30)
function isMarketHours() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const day = ist.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

// ── Rich Straddle Chart — multi-series dual Y-axis SVG chart ─────────────────
const SERIES_CONFIG = [
  { key: 'atm',    label: 'ATM Straddle',    color: '#ef4444', dash: false, yAxis: 'right' },
  { key: 'avg',    label: 'Avg Straddle',    color: '#22c55e', dash: true,  yAxis: 'right' },
  { key: 'spot',   label: 'Spot Price',      color: '#fbbf24', dash: false, yAxis: 'left'  },
  { key: 'synfut', label: 'Synthetic Future',color: '#60a5fa', dash: true,  yAxis: 'left'  },
  { key: 'vix',    label: 'India VIX',       color: '#a78bfa', dash: true,  yAxis: 'right' },
];

function StraddleChart({ resp, chainData, label = 'Straddle', interval = '5minute', onIntervalChange }) {
  const svgRef   = useRef(null);
  const [mouse,  setMouse]  = useState(null);   // { x, snapIdx }
  const [visible, setVisible] = useState({ atm: true, avg: true, spot: true, synfut: true, vix: false });

  const candles = resp?.candles || [];
  const spotSeries = resp?.spot  || [];
  const vixSeries  = resp?.vix   || [];
  const strike     = resp?.strike || 0;

  // Build all series data
  const series = useMemo(() => {
    if (!candles.length) return {};

    const atm = candles.map(c => ({ time: c.time, v: c.value }));

    // Rolling average of ATM straddle
    let sum = 0;
    const avg = candles.map((c, i) => { sum += c.value; return { time: c.time, v: parseFloat((sum / (i + 1)).toFixed(2)) }; });

    // Spot from index candles (or synfut fallback)
    const spot = spotSeries.length
      ? spotSeries.map(s => ({ time: s.time, v: s.value }))
      : candles.map(c => ({ time: c.time, v: parseFloat((c.ce - c.pe + strike).toFixed(2)) }));

    // Synthetic future = CE − PE + Strike
    const synfut = candles.map(c => ({ time: c.time, v: parseFloat((c.ce - c.pe + strike).toFixed(2)) }));

    // VIX (right axis, scaled separately)
    const vix = vixSeries.map(s => ({ time: s.time, v: s.value }));

    return { atm, avg, spot, synfut, vix };
  }, [candles, spotSeries, vixSeries, strike]);

  const isEmpty = !candles.length;

  // DTE calc
  const dte = chainData?.expiry
    ? Math.max(0, Math.ceil((new Date(chainData.expiry.slice(0, 10) + 'T10:00:00Z') - Date.now()) / 86400000))
    : null;

  // Straddle stats from candles
  const straddleOpen   = candles[0]?.value;
  const straddleCur    = candles[candles.length - 1]?.value;
  const straddleHigh   = candles.length ? Math.max(...candles.map(c => c.value)) : null;
  const straddleLow    = candles.length ? Math.min(...candles.map(c => c.value)) : null;
  const straddlePClose = straddleOpen; // day open = prev reference
  const lastUpdated    = resp?.timestamp
    ? new Date(resp.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  // Hover tooltip data
  const snapIdx  = mouse?.snapIdx ?? (candles.length - 1);
  const hovAtm   = series.atm?.[snapIdx];
  const hovAvg   = series.avg?.[snapIdx];
  const hovSpot  = series.spot?.[snapIdx];
  const hovSynFut= series.synfut?.[snapIdx];
  const hovVix   = series.vix?.find(v => v.time === candles[snapIdx]?.time);
  const hovCe    = candles[snapIdx]?.ce;
  const hovPe    = candles[snapIdx]?.pe;
  const hovTs    = candles[snapIdx]?.time
    ? new Date(candles[snapIdx].time * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  // ── SVG drawing ──────────────────────────────────────────────────────────────
  const W = 800, H = 280;
  const PAD = { l: 70, r: 70, t: 16, b: 32 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const buildPath = (data, xScale, yFn) => {
    if (!data?.length) return '';
    return data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yFn(p.v).toFixed(1)}`).join(' ');
  };

  // Scales from series data
  const leftSeries  = ['spot', 'synfut'];
  const rightSeries = ['atm', 'avg', 'vix'];

  const allLeft  = leftSeries.flatMap(k => series[k] || []).map(p => p.v).filter(Boolean);
  const allRight = rightSeries.filter(k => k !== 'vix').flatMap(k => series[k] || []).map(p => p.v).filter(Boolean);
  const allVix   = (series.vix || []).map(p => p.v).filter(Boolean);

  const leftMin  = allLeft.length  ? Math.min(...allLeft)  * 0.9995 : 0;
  const leftMax  = allLeft.length  ? Math.max(...allLeft)  * 1.0005 : 1;
  const rightMin = allRight.length ? Math.min(...allRight) * 0.97   : 0;
  const rightMax = allRight.length ? Math.max(...allRight) * 1.03   : 1;
  const vixMin   = allVix.length   ? Math.min(...allVix)  * 0.9     : 0;
  const vixMax   = allVix.length   ? Math.max(...allVix)  * 1.1     : 1;

  const xScale  = i => PAD.l + (i / Math.max(candles.length - 1, 1)) * cW;
  const yLeft   = v => PAD.t + cH - ((v - leftMin)  / Math.max(leftMax  - leftMin,  1)) * cH;
  const yRight  = v => PAD.t + cH - ((v - rightMin) / Math.max(rightMax - rightMin, 1)) * cH;
  const yVix    = v => PAD.t + cH - ((v - vixMin)   / Math.max(vixMax   - vixMin,   1)) * cH;

  // VIX series uses spot-aligned time index
  const spotTimeMap = new Map((series.spot || []).map((p, i) => [p.time, i]));
  const vixAligned  = (series.vix || []).map(v => {
    const i = spotTimeMap.get(v.time) ?? -1;
    return i >= 0 ? { i, v: v.v } : null;
  }).filter(Boolean);

  const vixPath = vixAligned.length
    ? vixAligned.map((p, j) => `${j === 0 ? 'M' : 'L'}${xScale(p.i).toFixed(1)},${yVix(p.v).toFixed(1)}`).join(' ')
    : '';

  // X-axis labels: show every ~6 bars
  const xLabels = candles
    .map((c, i) => ({ i, label: new Date(c.time * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5) }))
    .filter((_, i) => i % 6 === 0 || i === candles.length - 1);

  // Right-axis labels: 5 evenly spaced
  const rightLabels = Array.from({ length: 5 }, (_, i) => {
    const v = rightMin + (rightMax - rightMin) * (i / 4);
    return { v, y: yRight(v) };
  });

  // Left-axis labels
  const leftLabels = Array.from({ length: 5 }, (_, i) => {
    const v = leftMin + (leftMax - leftMin) * (i / 4);
    return { v, y: yLeft(v) };
  });

  // Crosshair X position
  const crossX = mouse != null && candles.length
    ? xScale(snapIdx)
    : null;

  // Mouse handler
  const handleMouseMove = useCallback((e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !candles.length) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const relX = svgX - PAD.l;
    const idx  = Math.round((relX / cW) * (candles.length - 1));
    setMouse({ snapIdx: Math.max(0, Math.min(idx, candles.length - 1)) });
  }, [candles.length]);

  const handleMouseLeave = useCallback(() => setMouse(null), []);


  return (
    <div className="w-full">
      {/* ── Top control bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#060d1a]">
        <div className="flex items-center gap-2">
          {/* Symbol badge */}
          <span className="text-xs font-bold text-slate-200 font-mono">{chainData?.symbol ?? resp?.symbol ?? 'NIFTY'}</span>
          <span className="text-slate-600">·</span>
          {/* Expiry */}
          <span className="text-[11px] font-mono text-slate-400">
            {chainData?.expiry
              ? new Date(chainData.expiry.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—'}
          </span>
        </div>
        {/* Timeframe selector */}
        <div className="flex items-center gap-1 bg-[#0c1a2e] rounded-lg p-0.5">
          {['3minute', '5minute', '10minute', '15minute'].map(tf => (
            <button
              key={tf}
              onClick={() => onIntervalChange?.(tf)}
              className={`px-2.5 py-1 text-[10px] font-mono font-semibold rounded-md transition-colors ${
                interval === tf ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tf.replace('minute', 'm')}
            </button>
          ))}
        </div>
      </div>

      {/* ── Info bar (11 columns) ── */}
      <div className="grid gap-0 border-b border-white/[0.06] text-center" style={{ gridTemplateColumns: 'repeat(11, minmax(0, 1fr))' }}>
        {[
          { label: 'DTE',          val: dte != null ? dte : '—' },
          { label: 'SPOT',         val: hovSpot?.v?.toFixed(2) ?? chainData?.spot?.toFixed(2) ?? '—' },
          { label: 'FUTURE',       val: '—' },
          { label: 'SYN FUT',      val: hovSynFut?.v?.toFixed(2) ?? (series.synfut?.length ? series.synfut[series.synfut.length - 1].v.toFixed(2) : '—') },
          { label: 'ATM STRIKE',   val: chainData?.atm ?? strike ?? '—' },
          { label: 'PRICE',        val: hovAtm?.v?.toFixed(2) ?? straddleCur?.toFixed(2) ?? '—' },
          { label: 'OPEN',         val: straddleOpen?.toFixed(2) ?? '—' },
          { label: 'HIGH',         val: straddleHigh?.toFixed(2) ?? '—' },
          { label: 'LOW',          val: straddleLow?.toFixed(2) ?? '—' },
          { label: 'P.CLOSE',      val: straddleOpen?.toFixed(2) ?? '—' },
          { label: 'LAST UP',      val: lastUpdated ?? '—' },
        ].map(({ label: lbl, val }) => (
          <div key={lbl} className="py-1.5 px-0.5 border-r border-white/[0.05] last:border-r-0">
            <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">{lbl}</div>
            <div className="text-[10px] font-mono font-semibold text-slate-200 truncate">{val}</div>
          </div>
        ))}
      </div>

      {/* ── Series toggles ── */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-white/[0.05] flex-wrap">
        {SERIES_CONFIG.map(s => (
          <label key={s.key} className="flex items-center gap-1.5 cursor-pointer select-none">
            <div
              onClick={() => setVisible(v => ({ ...v, [s.key]: !v[s.key] }))}
              className={`w-3 h-3 rounded-sm border-2 flex-shrink-0 transition-colors cursor-pointer`}
              style={{ borderColor: s.color, backgroundColor: visible[s.key] ? s.color : 'transparent' }}
            />
            <span
              onClick={() => setVisible(v => ({ ...v, [s.key]: !v[s.key] }))}
              className="text-[10px] font-medium cursor-pointer"
              style={{ color: visible[s.key] ? s.color : '#475569' }}
            >
              {s.label}
            </span>
          </label>
        ))}
      </div>

      {/* ── Chart ── */}
      <div className="relative">
        {isEmpty ? (
          <div className="flex items-center justify-center text-slate-500 text-[11px] text-center px-4" style={{ minHeight: 240 }}>
            {isMarketHours()
              ? `No ${label.toLowerCase()} data yet — builds as the session progresses`
              : 'Market closed — intraday data available Mon–Fri, 9:15 AM – 3:30 PM IST'}
          </div>
        ) : (
          <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ height: 280, cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Grid lines (right axis) */}
            {rightLabels.map(({ y }, i) => (
              <line key={i} x1={PAD.l} y1={y.toFixed(1)} x2={PAD.l + cW} y2={y.toFixed(1)}
                stroke="rgba(71,85,105,0.25)" strokeWidth="0.5" />
            ))}

            {/* Left Y-axis labels */}
            {leftLabels.map(({ v, y }, i) => (
              <text key={i} x={PAD.l - 6} y={y} textAnchor="end" dominantBaseline="middle"
                fontSize="9" fill="#64748b">
                {v > 10000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}
              </text>
            ))}

            {/* Right Y-axis labels */}
            {rightLabels.map(({ v, y }, i) => (
              <text key={i} x={PAD.l + cW + 6} y={y} textAnchor="start" dominantBaseline="middle"
                fontSize="9" fill="#64748b">
                {v.toFixed(0)}
              </text>
            ))}

            {/* X-axis labels */}
            {xLabels.map(({ i, label: lbl }) => (
              <text key={i} x={xScale(i)} y={H - 8} textAnchor="middle" fontSize="8" fill="#475569">
                {lbl}
              </text>
            ))}

            {/* Series lines */}
            {visible.spot   && series.spot   && <polyline points={buildPath(series.spot,   xScale, yLeft).replace(/M|L/g, m => m === 'M' ? '' : ' ').trim()} fill="none" stroke="#fbbf24" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
            {visible.synfut && series.synfut && <polyline points={buildPath(series.synfut, xScale, yLeft).replace(/M|L/g, m => m === 'M' ? '' : ' ').trim()} fill="none" stroke="#60a5fa" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
            {visible.avg    && series.avg    && <polyline points={buildPath(series.avg,    xScale, yRight).replace(/M|L/g, m => m === 'M' ? '' : ' ').trim()} fill="none" stroke="#22c55e" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
            {visible.atm    && series.atm    && <polyline points={buildPath(series.atm,    xScale, yRight).replace(/M|L/g, m => m === 'M' ? '' : ' ').trim()} fill="none" stroke="#ef4444" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
            {visible.vix    && vixPath       && <polyline points={vixPath.replace(/M|L/g, m => m === 'M' ? '' : ' ').trim()} fill="none" stroke="#a78bfa" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}

            {/* Crosshair */}
            {crossX != null && (
              <line x1={crossX.toFixed(1)} y1={PAD.t} x2={crossX.toFixed(1)} y2={PAD.t + cH}
                stroke="rgba(148,163,184,0.4)" strokeWidth="1" strokeDasharray="3 3" />
            )}

            {/* Live end-point dots */}
            {visible.atm && series.atm?.length && (() => {
              const last = series.atm[series.atm.length - 1];
              const x = xScale(series.atm.length - 1); const y = yRight(last.v);
              return <circle cx={x} cy={y} r="3.5" fill="#ef4444" />;
            })()}
            {visible.spot && series.spot?.length && (() => {
              const last = series.spot[series.spot.length - 1];
              const x = xScale(series.spot.length - 1); const y = yLeft(last.v);
              return <circle cx={x} cy={y} r="3.5" fill="#fbbf24" />;
            })()}
          </svg>

          {/* Hover tooltip */}
          {mouse != null && hovAtm && (
            <div className="absolute top-3 left-16 z-20 bg-[#0a1628]/95 border border-white/10 rounded-lg px-3 py-2.5 text-[10px] font-mono min-w-[160px] pointer-events-none shadow-xl">
              {visible.atm    && hovAtm    && <div className="flex justify-between gap-4"><span className="text-red-400">ATM Straddle</span><span className="text-slate-200">{hovAtm.v.toFixed(2)}</span></div>}
              {visible.avg    && hovAvg    && <div className="flex justify-between gap-4"><span className="text-emerald-400">Avg Straddle</span><span className="text-slate-200">{hovAvg.v.toFixed(2)}</span></div>}
              {hovCe != null              && <div className="flex justify-between gap-4 pl-3"><span className="text-slate-500">↳ CE</span><span className="text-sky-300">{hovCe.toFixed(2)}</span></div>}
              {hovPe != null              && <div className="flex justify-between gap-4 pl-3"><span className="text-slate-500">↳ PE</span><span className="text-rose-300">{hovPe.toFixed(2)}</span></div>}
              {visible.synfut && hovSynFut && <div className="flex justify-between gap-4"><span className="text-blue-400">Syn Future</span><span className="text-slate-200">{hovSynFut.v.toFixed(2)}</span></div>}
              {visible.spot   && hovSpot   && <div className="flex justify-between gap-4"><span className="text-amber-400">Spot Price</span><span className="text-slate-200">{hovSpot.v.toFixed(2)}</span></div>}
              {visible.vix    && hovVix    && <div className="flex justify-between gap-4"><span className="text-violet-400">India VIX</span><span className="text-slate-200">{hovVix.v.toFixed(2)}</span></div>}
              {hovTs && <div className="text-slate-500 mt-1 pt-1 border-t border-white/10">{hovTs}</div>}
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Strangle chart still uses simple single-line renderer ─────────────────────
function SimpleStraddleChart({ data, color = '#34d399', label = 'Strangle' }) {
  const ref    = useRef(null);
  const chartR = useRef(null);
  const [hover, setHover] = useState(null);
  const last    = data?.length ? data[data.length - 1] : null;
  const display = hover ?? (last ? { value: last.value, ce: last.ce, pe: last.pe } : null);

  useEffect(() => {
    if (!ref.current || !data?.length) return;
    import('@/app/lib/chart/Chart.js').then(({ createChart }) => {
      if (chartR.current) { chartR.current.destroy(); chartR.current = null; }
      const chart = createChart(ref.current, { interval: '5minute' });
      chartR.current = chart;
      chart.setCandles(data.map(d => ({ time: d.time, open: d.value, high: d.value, low: d.value, close: d.value, volume: 0 })));
      chart.setLine('premium', { data: data.map(d => ({ time: d.time, value: d.value })), color, width: 2 });
      const cepeMap = new Map(data.map(d => [d.time, { ce: d.ce, pe: d.pe }]));
      chart.onCrosshairMove(info => {
        if (!info) { setHover(null); return; }
        const cp = cepeMap.get(info.bar.time) || {};
        setHover({ value: info.bar.close, ce: cp.ce ?? null, pe: cp.pe ?? null });
      });
    });
    return () => { chartR.current?.destroy(); chartR.current = null; };
  }, [data, color]);

  if (!data?.length) {
    const msg = isMarketHours() ? 'No strangle data yet' : 'Market closed — intraday data available Mon–Fri, 9:15 AM – 3:30 PM IST';
    return <div className="flex-1 flex items-center justify-center text-slate-500 text-[11px] text-center px-4">{msg}</div>;
  }
  return (
    <div ref={ref} className="flex-1 relative min-h-[180px]">
      {display && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 text-[11px] font-mono bg-[#0a1628]/90 border border-white/10 rounded px-2.5 py-1.5 pointer-events-none">
          <span style={{ color }} className="font-bold">₹{display.value?.toFixed(2)}</span>
          {display.ce != null && <span className="text-sky-400">CE {display.ce.toFixed(2)}</span>}
          {display.pe != null && <span className="text-rose-400">PE {display.pe.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OptionsPage() {
  const [symbol,    setSymbol]    = useState('NIFTY');
  const [expiry,    setExpiry]    = useState('weekly');
  const [chainData, setChainData] = useState(null);
  const [liveSpot,  setLiveSpot]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [marketBias, setMarketBias] = useState(null); // from /api/market-data (same as Trades home)
  const [marketRegime, setMarketRegime] = useState(null); // from /api/market-regime (NIFTY/BANKNIFTY)

  // Short Covering setup
  const [scData,        setScData]        = useState(null);
  const [scDismissed,   setScDismissed]   = useState(false);
  const [scConfirming,  setScConfirming]  = useState(false);
  const [scPlacing,     setScPlacing]     = useState(false);
  const [scOrderResult, setScOrderResult] = useState(null);
  const scPrevActiveRef  = useRef(false);
  const scNotifSentRef   = useRef(false);
  const scOrderTimerRef  = useRef(null);

  // Straddle / Strangle chart
  const [chartMode,       setChartMode]       = useState('straddle'); // 'straddle' | 'strangle'
  const [straddleResp,    setStraddleResp]    = useState(null);  // full API response
  const [straddleData,    setStraddleData]    = useState(null);  // candles[] for legacy usage
  const [straddleLoading, setStraddleLoading] = useState(false);
  const [strangleData,    setStrangleData]    = useState(null);
  const [strangleLoading, setStrangleLoading] = useState(false);
  const [straddleInterval, setStraddleInterval] = useState('5minute'); // chart timeframe

  // Probability panel
  const [probTarget,    setProbTarget]    = useState('');
  const [probDays,      setProbDays]      = useState('7');
  const [probDirection, setProbDirection] = useState('above');
  const [probResult,    setProbResult]    = useState(null);
  const [touchResult,   setTouchResult]   = useState(null);
  const [targetPrice,   setTargetPrice]   = useState(null); // from chart click

  // Payoff section
  const [payoffMode,    setPayoffMode]    = useState('straddle'); // 'straddle' | 'strangle'
  const [strikesInput,  setStrikesInput]  = useState({ lower: '', upper: '' });

  // ── Fetch chain data ────────────────────────────────────────────────────────
  const fetchChain = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`/api/options/chain-with-greeks?symbol=${symbol}&expiry=${expiry}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChainData(data);
      // Pre-populate strangle strikes
      if (data.atm) {
        const gap = symbol === 'BANKNIFTY' ? 200 : 100;
        setStrikesInput({ lower: String(data.atm - gap), upper: String(data.atm + gap) });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [symbol, expiry]);

  useEffect(() => { fetchChain(); }, [fetchChain]);

  // BANKNIFTY has no weekly options in our metadata — force monthly.
  useEffect(() => {
    if (symbol !== 'NIFTY' && expiry === 'weekly') setExpiry('monthly');
  }, [symbol, expiry]);

  // ── Market bias (same source as Trades home) ────────────────────────────────
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const r = await fetch('/api/market-data');
        const d = await r.json();
        if (!alive) return;
        setMarketBias(d?.sentiment?.bias ?? null);
      } catch { /* non-fatal */ }
    };
    run();
    const t = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // ── Market regime (same route used elsewhere) ───────────────────────────────
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const sym = symbol === 'BANKNIFTY' ? 'BANKNIFTY' : 'NIFTY';
        const r = await fetch('/api/market-regime', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: sym, type: 'intraday' }),
        });
        const d = await r.json();
        if (!alive) return;
        setMarketRegime(d);
      } catch { /* non-fatal */ }
    };
    run();
    const t = setInterval(run, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [symbol]);

  // ── Short Covering: poll + sound + browser notification ──────────────────────
  useEffect(() => {
    const fetchSC = async () => {
      try {
        const r = await fetch('/api/short-covering');
        const d = await r.json();
        if (!d.error) {
          setScData(d);
          const wasActive = scPrevActiveRef.current;
          const isActive  = d.active === true;
          if (isActive && !wasActive) scNotifSentRef.current = false;
          if (isActive && !scNotifSentRef.current) {
            setScDismissed(false);
            try { playShortCoveringAlert(); } catch {}
            try {
              if (typeof window !== 'undefined' && 'Notification' in window) {
                const grant = Notification.permission === 'granted'
                  ? 'granted'
                  : await Notification.requestPermission();
                if (grant === 'granted') {
                  const trade = d.trade;
                  const body  = trade
                    ? `Score ${d.score}/${d.maxScore} · NIFTY ${trade.strike} CE ₹${trade.entryLtp} · SL ₹${trade.sl?.cePremium}`
                    : `Score ${d.score}/${d.maxScore} · Spot ${d.context?.spot?.toFixed(0)}`;
                  new Notification('⚡ Short Covering Active', { body, icon: '/favicon.ico' });
                  scNotifSentRef.current = true;
                }
              }
            } catch {}
          }
          if (!isActive) scNotifSentRef.current = false;
          scPrevActiveRef.current = isActive;
        }
      } catch { /* silent */ }
    };
    fetchSC();
    const iv = setInterval(() => {
      const ist  = new Date(Date.now() + 5.5 * 3600 * 1000);
      const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      const day  = ist.getUTCDay();
      if (day !== 0 && day !== 6 && mins >= 555 && mins <= 930) fetchSC();
    }, 60_000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // SC order result auto-clear
  useEffect(() => {
    if (scOrderResult) {
      clearTimeout(scOrderTimerRef.current);
      scOrderTimerRef.current = setTimeout(() => setScOrderResult(null), 8000);
    }
    return () => clearTimeout(scOrderTimerRef.current);
  }, [scOrderResult]);

  const handleScPlaceOrder = async () => {
    if (!scData?.trade) return;
    setScPlacing(true);
    try {
      const r = await fetch('/api/place-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradingsymbol:    scData.trade.symbol,
          exchange:         'NFO',
          transaction_type: 'BUY',
          order_type:       'MARKET',
          product:          'MIS',
          quantity:         75,
        }),
      });
      const result = await r.json();
      if (!r.ok || result.error) throw new Error(result.error || 'Order failed');
      setScOrderResult({ ok: true,  msg: `Placed · ID ${result.order_id}` });
      setScConfirming(false);
    } catch (e) {
      setScOrderResult({ ok: false, msg: e.message });
    } finally {
      setScPlacing(false);
    }
  };

  // ── Instantly fetch Uncached Spot Price ─────────────────────────────────────
  useEffect(() => {
    let active = true;
    const fetchSpot = async () => {
      try {
        const res  = await fetch(`/api/ltp?symbol=${symbol}`);
        const data = await res.json();
        if (active && data.success && data.ltp) {
          setLiveSpot(data.ltp);
        }
      } catch {}
    };
    setLiveSpot(null); // clear instantly on switch so it drops to loading state
    fetchSpot();
    const iv = setInterval(fetchSpot, 5000); // 5 sec live polling
    return () => { active = false; clearInterval(iv); };
  }, [symbol]);

  // ── Fetch straddle chart when ATM or interval changes ──────────────────
  useEffect(() => {
    if (!chainData?.atm || !chainData?.expiry) return;
    setStraddleLoading(true);
    fetch(`/api/options/straddle-chart?symbol=${symbol}&expiry=${chainData.expiry}&strike=${chainData.atm}&interval=${straddleInterval}`)
      .then(r => r.json())
      .then(d => {
        setStraddleResp(d);               // full response (candles+spot+vix+strike)
        setStraddleData(d.candles || []); // keep for legacy commentary fn
      })
      .catch(() => { setStraddleResp(null); setStraddleData([]); })
      .finally(() => setStraddleLoading(false));
  }, [chainData?.atm, chainData?.expiry, symbol, straddleInterval]);

  // ── Fetch strangle chart when strikes or ATM changes ────────────────────────
  useEffect(() => {
    if (!chainData?.expiry || !strikesInput.lower || !strikesInput.upper) return;
    const ceS = parseInt(strikesInput.upper);
    const peS = parseInt(strikesInput.lower);
    if (!ceS || !peS) return;
    setStrangleLoading(true);
    fetch(`/api/options/straddle-chart?symbol=${symbol}&expiry=${chainData.expiry}&ceStrike=${ceS}&peStrike=${peS}&interval=5minute`)
      .then(r => r.json())
      .then(d => { setStrangleData(d.candles || []); })
      .catch(() => setStrangleData([]))
      .finally(() => setStrangleLoading(false));
  }, [chainData?.expiry, symbol, strikesInput.lower, strikesInput.upper]);

  // ── Probability calculation ─────────────────────────────────────────────────
  const computeProbs = () => {
    const S     = chainData?.spot;
    const iv    = chainData?.atmIV;
    const t     = chainData?.expiry ? (() => {
      const exp = new Date(chainData.expiry.slice(0, 10) + 'T10:00:00Z');
      return Math.max(0, (exp - Date.now()) / (365 * 24 * 3600 * 1000));
    })() : null;

    const X = parseFloat(probTarget || targetPrice);
    if (!S || !iv || !X || !t) return;

    const days   = parseFloat(probDays) || 7;
    const tHoriz = Math.min(days / 365, t);
    const sigma  = iv / 100;

    const pAt    = probAtTime(S, X, days, undefined, undefined, sigma, probDirection);
    const pTouch = probTouch(S, X, t, undefined, undefined, sigma);

    setProbResult(pAt != null ? (pAt * 100).toFixed(1) : null);
    setTouchResult(pTouch != null ? (pTouch * 100).toFixed(1) : null);
  };

  useEffect(() => {
    if (targetPrice) { setProbTarget(String(targetPrice)); computeProbs(); }
  }, [targetPrice]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const { spot, atm, atmIV, hv30, ivHvRatio, straddlePremium, expectedMove: expMove,
          expiries, strikes, expiry: resolvedExpiry } = chainData || {};

  const T = resolvedExpiry ? (() => {
    // Date-only strings (e.g. "2026-03-27") parse as midnight UTC = 5:30 AM IST.
    // NSE options expire at 3:30 PM IST = 10:00 AM UTC — set that explicitly.
    const exp = new Date(resolvedExpiry.slice(0, 10) + 'T10:00:00Z');
    return Math.max(0, (exp - Date.now()) / (365 * 24 * 3600 * 1000));
  })() : null;

  const atmRow        = strikes?.find(s => s.strike === atm);
  const straddleLeg   = { ce: atmRow?.ce?.ltp || 0, pe: atmRow?.pe?.ltp || 0 };
  const payoffPremium = (payoffMode === 'straddle')
    ? (straddleLeg.ce + straddleLeg.pe)
    : ((strikes?.find(s => s.strike === parseInt(strikesInput.lower))?.pe?.ltp || 0) +
       (strikes?.find(s => s.strike === parseInt(strikesInput.upper))?.ce?.ltp || 0));

  return (
    <div className="min-h-screen bg-[#060b14] text-slate-100">
      <Nav />

      {/* ── Short Covering Setup Banner ───────────────────────────────────── */}
      {scData?.active && !scDismissed && (() => {
        const trade = scData.trade;
        return (
          <div className="border-b border-emerald-500/30 bg-emerald-950/60 backdrop-blur-sm">
            <div className="max-w-[1400px] mx-auto px-6 py-3">
              {!scConfirming ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-emerald-400 text-base leading-none mt-0.5 flex-shrink-0">⚡</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-emerald-300 font-bold text-sm">Short Covering Active</span>
                        <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">{scData.score}/{scData.maxScore}</span>
                        {scData.context?.spot && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            NIFTY <span className="text-white">{scData.context.spot.toFixed(0)}</span>
                            {scData.context.vwap ? <> · VWAP <span className={scData.context.spot > scData.context.vwap ? 'text-emerald-400' : 'text-red-400'}>{scData.context.vwap.toFixed(0)}</span></> : null}
                            {scData.context.ceWall ? <> · Wall <span className="text-red-400">{scData.context.ceWall}</span></> : null}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        {Object.entries(scData.signals ?? {}).filter(([, s]) => s.hit).slice(0, 3).map(([k, s]) => (
                          <span key={k} className="text-[10px] text-emerald-400/80">✓ {s.detail}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {trade && (
                      <div className="text-[11px] font-mono text-right">
                        <div className="text-white font-bold">NIFTY {trade.strike} CE · ₹{trade.entryLtp}</div>
                        <div className="text-red-400">SL ₹{trade.sl.cePremium} <span className="text-slate-500">(−{trade.sl.pctRisk}%)</span></div>
                        <div className="text-emerald-400">T1 ₹{trade.targets[0]?.cePremium} · T2 ₹{trade.targets[1]?.cePremium}</div>
                      </div>
                    )}
                    {trade && !scOrderResult?.ok && (
                      <button onClick={() => setScConfirming(true)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors">
                        Buy CE ▶
                      </button>
                    )}
                    {scOrderResult && (
                      <span className={`text-[11px] font-medium px-2 py-1 rounded-lg ${scOrderResult.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-400'}`}>
                        {scOrderResult.ok ? '✅ ' : '❌ '}{scOrderResult.msg}
                      </span>
                    )}
                    <button onClick={() => setScDismissed(true)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors text-xs">✕</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-emerald-300 font-bold text-sm">⚡ Confirm Buy</span>
                  <div className="text-[11px] font-mono flex items-center gap-3 flex-wrap">
                    <span className="text-white">NIFTY {trade?.strike} CE · MARKET · MIS · 75 qty</span>
                    <span className="text-emerald-400">~₹{trade ? (trade.entryLtp * 75).toLocaleString('en-IN') : '—'}</span>
                    <span className="text-red-400">SL ₹{trade?.sl.cePremium}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setScConfirming(false)} disabled={scPlacing}
                      className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-400 text-xs font-medium hover:bg-white/5 disabled:opacity-40 transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleScPlaceOrder} disabled={scPlacing}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-40 transition-colors">
                      {scPlacing ? 'Placing…' : '✓ Place Order'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Controls ── */}
      <div className="max-w-[1400px] mx-auto px-6 pt-4 pb-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-white mr-2">Options Analytics</h1>

          {/* Symbol */}
          <div className="flex bg-[#0c1a2e] rounded-lg p-0.5">
            {['NIFTY', 'BANKNIFTY'].map(s => (
              <button key={s} onClick={() => setSymbol(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${symbol === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {s}
              </button>
            ))}
          </div>

          {/* Expiry */}
          <div className="flex bg-[#0c1a2e] rounded-lg p-0.5">
            {(() => {
              const opts = [];
              if (symbol === 'NIFTY') opts.push({ val: 'weekly', label: 'Weekly' });
              opts.push({ val: 'monthly', label: 'Monthly' });

              const monthlyDates = expiries?.monthlyAll || (expiries?.monthly ? [expiries.monthly] : []);
              const curWeekly = expiries?.weekly;
              const nextWeekly = expiries?.all?.[1] || null;

              const isMonthlyMode =
                expiry === 'monthly' ||
                (typeof expiry === 'string' && expiry.length >= 10 && monthlyDates.includes(expiry));

              if (symbol === 'NIFTY' && !isMonthlyMode) {
                // Weekly mode: show current + next weekly
                if (curWeekly) opts.push({ val: curWeekly, label: `Cur ${curWeekly.slice(5)}` });
                if (nextWeekly) opts.push({ val: nextWeekly, label: `Next ${nextWeekly.slice(5)}` });
              }

              if (isMonthlyMode) {
                const m1 = monthlyDates?.[0] || expiries?.monthly || null;
                const m2 = monthlyDates?.[1] || expiries?.nextMonthly || null;
                if (m1) opts.push({ val: m1, label: `M ${m1.slice(5)}` });
                if (m2 && m2 !== m1) opts.push({ val: m2, label: `NextM ${m2.slice(5)}` });
              }

              return opts;
            })().map(opt => (
              <button key={opt.val} onClick={() => setExpiry(opt.val)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${expiry === opt.val ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {opt.label}
              </button>
            ))}
          </div>

          <button onClick={fetchChain}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0c1a2e] border border-white/10 text-slate-400 hover:text-white transition-colors"
            disabled={loading}>
            {loading ? '...' : '↻ Refresh'}
          </button>

          <a href="/options/expiry"
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-400 hover:bg-amber-600/30 hover:text-amber-300 transition-colors">
            Expiry Dashboard ↗
          </a>

          <a href="/options/chart"
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/30 hover:text-indigo-300 transition-colors">
            Options Chart ↗
          </a>

          {resolvedExpiry && (
            <span className="text-xs text-slate-500">Expiry: {resolvedExpiry}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="max-w-[1400px] mx-auto px-6 py-2">
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">{error}</div>
        </div>
      )}

      {/* ── ATM Summary Bar ── */}
      {chainData && (
        <div className="max-w-[1400px] mx-auto px-6 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              { label: 'Spot',      value: (liveSpot || spot)?.toFixed(2) || '...', color: 'text-amber-400' },
              { label: 'ATM',       value: atm || '...',                    color: 'text-white' },
              { label: 'Straddle',  value: straddlePremium ? `₹${straddlePremium?.toFixed(0)}` : '...', color: 'text-violet-400' },
              { label: 'ATM IV',    value: fmtIV(atmIV),                   color: atmIV > (hv30 || 0) ? 'text-red-400' : 'text-emerald-400' },
              { label: 'HV30',      value: fmtIV(hv30),                    color: 'text-sky-400' },
              { label: 'IV/HV',     value: ivHvRatio != null ? ivHvRatio + 'x' : '—', color: ivHvRatio > 1.2 ? 'text-red-400' : 'text-emerald-400' },
              { label: '±1σ Move',  value: expMove ? `±${expMove.points}pts (±${expMove.pct}%)` : '—', color: 'text-slate-300' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[#0c1a2e] border border-white/5 rounded-xl px-3 py-2.5">
                <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
                <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Trade Desk ── */}
      {chainData && (() => {
        const { buys, sells, regime, stats } = generateTradeDesk(chainData, straddleData);
        return (
          <TradeDeskPanel
            buys={buys} sells={sells} regime={regime} stats={stats}
            symbol={symbol} spot={spot} atm={atm} strikes={strikes} resolvedExpiry={resolvedExpiry} marketBias={marketBias} marketRegime={marketRegime}
            scTrade={scData?.active ? scData.trade : null} scScore={scData?.score} scMax={scData?.maxScore}
          />
        );
      })()}

      {/* ── Straddle / Strangle Chart — full width ── */}
      {chainData && (
        <div className="max-w-[1400px] mx-auto px-6 pb-4">
          <div className="bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden">
            {/* Chart header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-200">Intraday Premium</span>
                <div className="flex bg-[#060b14] rounded-lg p-0.5">
                  {[{ val: 'straddle', label: 'Straddle' }, { val: 'strangle', label: 'Strangle' }].map(m => (
                    <button key={m.val} onClick={() => setChartMode(m.val)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${chartMode === m.val ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                {chartMode === 'straddle' ? `${atm} CE + PE` : `${strikesInput.lower} PE + ${strikesInput.upper} CE`}
              </span>
            </div>

            {/* Strangle strike inputs */}
            {chartMode === 'strangle' && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 text-xs">
                <span className="text-slate-500">PE strike</span>
                <input type="number" value={strikesInput.lower}
                  onChange={e => setStrikesInput(p => ({ ...p, lower: e.target.value }))}
                  className="w-24 bg-[#060b14] border border-white/10 rounded px-2 py-1 text-slate-300" />
                <span className="text-slate-500">CE strike</span>
                <input type="number" value={strikesInput.upper}
                  onChange={e => setStrikesInput(p => ({ ...p, upper: e.target.value }))}
                  className="w-24 bg-[#060b14] border border-white/10 rounded px-2 py-1 text-slate-300" />
              </div>
            )}

            {/* Chart body */}
            {chartMode === 'straddle' ? (
              straddleLoading
                ? <div className="flex items-center justify-center text-slate-500 text-sm" style={{ height: 340 }}>Loading...</div>
                : <StraddleChart resp={straddleResp} chainData={chainData} label="Straddle"
                    interval={straddleInterval} onIntervalChange={setStraddleInterval} />
            ) : (
              <div className="flex min-h-[200px]">
                {strangleLoading
                  ? <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading...</div>
                  : <SimpleStraddleChart data={strangleData} color="#34d399" label="Strangle" />}
              </div>
            )}

            {/* Session Analysis commentary */}
            {(() => {
              const commentary = getStraddleCommentary(
                chartMode === 'straddle' ? straddleData : strangleData,
                chainData, scData
              );
              if (!commentary.length) return null;
              return (
                <div className="border-t border-white/5 px-4 py-3 flex flex-col gap-1.5">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Session Analysis</div>
                  {commentary.map(c => (
                    <div key={c.key} className="flex items-start gap-2 text-[11px] leading-relaxed">
                      <span className={`mt-px font-mono shrink-0 ${c.color}`}>{c.icon}</span>
                      <span className="text-slate-400">{c.text}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Price Distribution + Probability Calculator — side by side ── */}
      {chainData && (
        <div className="max-w-[1400px] mx-auto px-6 pb-4 grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Price Distribution — 3 of 5 cols (narrower, taller) */}
          {atmIV && T != null && (
            <div className="lg:col-span-3 bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 flex-shrink-0">
                <span className="text-xs font-semibold text-slate-300">Price Distribution at Expiry</span>
                <span className="text-[10px] text-slate-500">Log-normal · {atmIV?.toFixed(1)}% IV · click to set target</span>
              </div>
              <div className="p-2 flex-1">
                <DistributionChart
                  spot={spot} atm={atm} strikes={strikes}
                  atmIV={atmIV} T={T}
                  targetPrice={targetPrice}
                  onTargetChange={p => { setTargetPrice(p); setProbTarget(String(p)); }}
                />
              </div>
            </div>
          )}

          {/* Probability Calculator — 2 of 5 cols */}
          <div className={`${atmIV && T != null ? 'lg:col-span-2' : 'lg:col-span-5'} bg-[#0c1a2e] border border-white/5 rounded-xl p-4 flex flex-col gap-4`}>
            <div>
              <div className="text-xs font-semibold text-slate-300">Probability Calculator</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Based on BS model · risk-neutral probabilities</div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <select value={probDirection} onChange={e => setProbDirection(e.target.value)}
                  className="flex-1 bg-[#060b14] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300">
                  <option value="above">Above</option>
                  <option value="below">Below</option>
                </select>
                <input type="number" value={probTarget} onChange={e => setProbTarget(e.target.value)}
                  placeholder="Price"
                  className="flex-1 bg-[#060b14] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 w-0"
                />
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-slate-500 whitespace-nowrap">in</span>
                <input type="number" value={probDays} onChange={e => setProbDays(e.target.value)}
                  min="1" max="365"
                  className="flex-1 bg-[#060b14] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                />
                <span className="text-[10px] text-slate-500">days</span>
              </div>
              <button onClick={computeProbs}
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
                Calculate
              </button>
            </div>

            {probResult != null && (() => {
              const daysLeft = T != null ? Math.ceil(T * 365) : 0;
              const cappedToExpiry = parseFloat(probDays) >= daysLeft;
              const pAt    = parseFloat(probResult);
              const pTouch = parseFloat(touchResult);
              const dirLabel = probDirection === 'above' ? 'Above' : 'Below';
              const atVerdict    = pAt < 30 ? 'Unlikely at close — seller edge' : pAt > 70 ? 'Likely at close — buyer edge' : 'Coin-flip territory at close';
              const touchVerdict = pTouch < 30 ? 'Unlikely to reach — safe zone' : pTouch > 70 ? 'Likely to be touched — hedge risk' : 'May touch intraday — watch closely';
              return (
                <div className="space-y-2">
                  <div className="bg-[#060b14] border border-white/5 rounded-lg px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {dirLabel} {probTarget} {cappedToExpiry ? 'at expiry close' : `in ${probDays} days`}
                        </div>
                        <div className="text-[10px] text-slate-600 mt-0.5">Where does price <em>finish</em>?</div>
                      </div>
                      <div className={`text-xl font-bold font-mono flex-shrink-0 ${pAt > 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {probResult}%
                      </div>
                    </div>
                    <div className={`text-[10px] mt-1.5 ${pAt < 30 || pAt > 70 ? 'text-amber-400' : 'text-slate-500'}`}>{atVerdict}</div>
                  </div>
                  <div className="bg-[#060b14] border border-white/5 rounded-lg px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">Touches {probTarget} before expiry</div>
                        <div className="text-[10px] text-slate-600 mt-0.5">Does price <em>visit</em> this level at all?</div>
                      </div>
                      <div className={`text-xl font-bold font-mono flex-shrink-0 ${pTouch > 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {touchResult}%
                      </div>
                    </div>
                    <div className={`text-[10px] mt-1.5 ${pTouch > 70 ? 'text-amber-400' : 'text-slate-500'}`}>{touchVerdict}</div>
                  </div>
                  {pTouch - pAt > 25 && (
                    <div className="text-[10px] text-slate-500 bg-amber-500/5 border border-amber-500/10 rounded-lg px-2.5 py-1.5">
                      ⚡ {Math.round(pTouch - pAt)}pt gap — high intraday whipsaw risk
                    </div>
                  )}
                </div>
              );
            })()}

            {expMove && (
              <div className="border-t border-white/5 pt-3 mt-auto">
                <div className="text-[10px] text-slate-500 mb-2">Expected range by expiry (±1σ, 68%)</div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-red-400">{expMove.lower.toFixed(0)}</span>
                  <span className="text-slate-500">↔ {expMove.points}pts</span>
                  <span className="text-emerald-400">{expMove.upper.toFixed(0)}</span>
                </div>
                <div className="mt-1.5 h-1.5 bg-[#060b14] rounded-full relative">
                  <div className="absolute inset-y-0 left-[25%] right-[25%] bg-indigo-600/40 rounded-full" />
                  <div className="absolute inset-y-0 left-[50%] w-0.5 bg-amber-400 rounded-full -translate-x-0.5" />
                </div>
              </div>
            )}

            <div className="text-[10px] text-slate-600 border-t border-white/5 pt-2">
              Tip: click on the distribution chart to set target price
            </div>
          </div>
        </div>
      )}


      {/* ── Greeks Table ── */}
      {strikes?.length > 0 && (
        <div className="max-w-[1400px] mx-auto px-6 pb-4">
          <div className="bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-white/5">
              <span className="text-xs font-semibold text-slate-300">Greeks Table — {symbol} {resolvedExpiry}</span>
              <span className="text-[10px] text-slate-500 ml-3">IV solver · r=6.5% · q=1.5%</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-white/5">
                    {/* CE side */}
                    <th className="text-right px-2 py-2 text-slate-500 font-normal">IV</th>
                    <th className="text-right px-2 py-2 text-slate-500 font-normal">Δ</th>
                    <th className="text-right px-2 py-2 text-slate-500 font-normal">Γ</th>
                    <th className="text-right px-2 py-2 text-slate-500 font-normal">Θ/d</th>
                    <th className="text-right px-2 py-2 text-slate-500 font-normal">P.ITM</th>
                    <th className="text-right px-2 py-2 text-slate-500 font-normal">OI</th>
                    <th className="text-right px-2 py-2 text-sky-500 font-semibold">CE LTP</th>
                    {/* Strike */}
                    <th className="text-center px-3 py-2 text-slate-400 font-semibold">Strike</th>
                    {/* PE side */}
                    <th className="text-left px-2 py-2 text-rose-500 font-semibold">PE LTP</th>
                    <th className="text-left px-2 py-2 text-slate-500 font-normal">P.ITM</th>
                    <th className="text-left px-2 py-2 text-slate-500 font-normal">Θ/d</th>
                    <th className="text-left px-2 py-2 text-slate-500 font-normal">Γ</th>
                    <th className="text-left px-2 py-2 text-slate-500 font-normal">Δ</th>
                    <th className="text-left px-2 py-2 text-slate-500 font-normal">IV</th>
                  </tr>
                </thead>
                <tbody>
                  {strikes.map(row => {
                    const isATM = row.strike === atm;
                    return (
                      <tr key={row.strike}
                        className={`border-b border-white/5 transition-colors ${isATM
                          ? 'bg-indigo-900/25 border-indigo-500/30'
                          : 'hover:bg-white/[0.02]'}`}>
                        {/* CE */}
                        <td className="text-right px-2 py-1.5 text-slate-400">{fmtIV(row.ce?.iv)}</td>
                        <td className="text-right px-2 py-1.5 text-sky-400">{row.ce?.delta != null ? row.ce.delta.toFixed(3) : '—'}</td>
                        <td className="text-right px-2 py-1.5 text-slate-400">{row.ce?.gamma != null ? row.ce.gamma.toFixed(4) : '—'}</td>
                        <td className="text-right px-2 py-1.5 text-orange-400">{row.ce?.theta != null ? row.ce.theta.toFixed(1) : '—'}</td>
                        <td className={`text-right px-2 py-1.5 ${probColour(row.ce?.probITM)}`}>
                          {fmtPct(row.ce?.probITM)}
                        </td>
                        <td className="text-right px-2 py-1.5 text-slate-500">
                          {row.ce?.oi ? (row.ce.oi / 1000).toFixed(0) + 'K' : '—'}
                        </td>
                        <td className={`text-right px-2 py-1.5 font-semibold ${isATM ? 'text-sky-300' : 'text-sky-500'}`}>
                          {fmt2(row.ce?.ltp)}
                        </td>
                        {/* Strike */}
                        <td className={`text-center px-3 py-1.5 font-bold ${isATM ? 'text-white' : 'text-slate-400'}`}>
                          {row.strike}
                          {isATM && <span className="ml-1 text-[9px] text-indigo-400">ATM</span>}
                        </td>
                        {/* PE */}
                        <td className={`text-left px-2 py-1.5 font-semibold ${isATM ? 'text-rose-300' : 'text-rose-500'}`}>
                          {fmt2(row.pe?.ltp)}
                        </td>
                        <td className={`text-left px-2 py-1.5 ${probColour(row.pe?.probITM)}`}>
                          {fmtPct(row.pe?.probITM)}
                        </td>
                        <td className="text-left px-2 py-1.5 text-orange-400">{row.pe?.theta != null ? row.pe.theta.toFixed(1) : '—'}</td>
                        <td className="text-left px-2 py-1.5 text-slate-400">{row.pe?.gamma != null ? row.pe.gamma.toFixed(4) : '—'}</td>
                        <td className="text-left px-2 py-1.5 text-rose-400">{row.pe?.delta != null ? row.pe.delta.toFixed(3) : '—'}</td>
                        <td className="text-left px-2 py-1.5 text-slate-400">{fmtIV(row.pe?.iv)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Payoff Diagram ── */}
      {chainData && straddlePremium > 0 && (
        <div className="max-w-[1400px] mx-auto px-6 pb-8">
          <div className="bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
              <span className="text-xs font-semibold text-slate-300">Payoff at Expiry</span>
              <div className="flex bg-[#060b14] rounded-lg p-0.5">
                {[{ val: 'straddle', label: 'Straddle' }, { val: 'strangle', label: 'Strangle' }].map(m => (
                  <button key={m.val} onClick={() => setPayoffMode(m.val)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${payoffMode === m.val ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              {payoffMode === 'strangle' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Put strike:</span>
                  <input type="number" value={strikesInput.lower} onChange={e => setStrikesInput(p => ({ ...p, lower: e.target.value }))}
                    className="w-20 bg-[#060b14] border border-white/10 rounded px-2 py-1 text-slate-300" />
                  <span className="text-slate-500">Call strike:</span>
                  <input type="number" value={strikesInput.upper} onChange={e => setStrikesInput(p => ({ ...p, upper: e.target.value }))}
                    className="w-20 bg-[#060b14] border border-white/10 rounded px-2 py-1 text-slate-300" />
                </div>
              )}
              <span className="text-[10px] text-slate-500 ml-auto">
                Premium: ₹{payoffPremium.toFixed(0)} · BE: {atm ? (atm - payoffPremium).toFixed(0) : '—'} / {atm ? (atm + payoffPremium).toFixed(0) : '—'}
              </span>
            </div>
            <div className="p-3">
              <PayoffChart
                spot={spot}
                atmStrike={atm}
                premium={payoffPremium}
                isStrangle={payoffMode === 'strangle'}
                lowerStrike={parseInt(strikesInput.lower) || (atm - 100)}
                upperStrike={parseInt(strikesInput.upper) || (atm + 100)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !chainData && (
        <div className="max-w-[1400px] mx-auto px-6 py-12 flex items-center justify-center text-slate-500 text-sm">
          Loading options data…
        </div>
      )}
    </div>
  );
}
