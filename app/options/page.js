'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Nav from '../components/Nav';
import { probAtTime, probTouch, lognormalPDF, expectedMove } from '@/app/lib/options/black-scholes';

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
// Derives time-aware trading insights from live straddle data + chain stats.
function getStraddleCommentary(candles, chainData) {
  if (!candles?.length || !chainData) return [];
  const { spot, atm, atmIV, hv30, ivHvRatio, straddlePremium, expectedMove: expMove } = chainData;
  const lines = [];

  // Time-of-day in IST
  const now     = new Date();
  const istMins = ((now.getUTCHours() * 60 + now.getUTCMinutes()) + 5 * 60 + 30) % (24 * 60);
  const minsFromOpen = istMins - (9 * 60 + 15);

  // Opening vs current premium
  const openPremium = candles[0]?.value;
  const curPremium  = candles[candles.length - 1]?.value;
  const decayPct    = openPremium > 0 ? ((openPremium - curPremium) / openPremium * 100) : 0;

  if (openPremium && curPremium) {
    if (decayPct > 30) {
      lines.push({ key: 'decay', icon: '↓', color: 'text-emerald-400', text: `Premium has decayed ${decayPct.toFixed(0)}% from open (₹${openPremium.toFixed(0)} → ₹${curPremium.toFixed(0)}). Strong theta — sellers in control all session.` });
    } else if (decayPct > 12) {
      lines.push({ key: 'decay', icon: '↓', color: 'text-slate-300', text: `Premium down ${decayPct.toFixed(0)}% from ₹${openPremium.toFixed(0)} open. Normal intraday decay; sellers have maintained edge.` });
    } else if (decayPct < -20) {
      lines.push({ key: 'spike', icon: '↑', color: 'text-rose-400', text: `Premium has spiked ${Math.abs(decayPct).toFixed(0)}% above open (₹${openPremium.toFixed(0)} → ₹${curPremium.toFixed(0)}). Volatility expansion — likely news or directional breakout. Avoid fresh sells.` });
    } else if (decayPct < -8) {
      lines.push({ key: 'spike', icon: '↑', color: 'text-amber-400', text: `Premium is ${Math.abs(decayPct).toFixed(0)}% above the opening level. IV expanding — buyers gaining edge.` });
    }
  }

  // IV vs HV bias
  if (ivHvRatio != null) {
    if (ivHvRatio > 1.3) {
      lines.push({ key: 'ivhv', icon: '⊕', color: 'text-emerald-400', text: `IV/HV ${ivHvRatio.toFixed(2)}× — options are expensive vs realised vol. Statistical edge for sellers (iron condors, straddle sells).` });
    } else if (ivHvRatio > 1.1) {
      lines.push({ key: 'ivhv', icon: '≈', color: 'text-slate-300', text: `IV/HV ${ivHvRatio.toFixed(2)}× — slightly elevated. Mild seller edge; size positions conservatively.` });
    } else if (ivHvRatio < 0.85) {
      lines.push({ key: 'ivhv', icon: '⊖', color: 'text-violet-400', text: `IV/HV ${ivHvRatio.toFixed(2)}× — options are cheap vs historical vol. Buyer edge: consider buying before a catalyst.` });
    }
  }

  // Time-based session context
  if (minsFromOpen >= 0) {
    if (minsFromOpen < 30) {
      lines.push({ key: 'time', icon: '⏱', color: 'text-slate-400', text: 'Opening 30 min: Premium is unstable. Wait for the first directional candle before initiating straddle positions.' });
    } else if (minsFromOpen < 120) {
      lines.push({ key: 'time', icon: '⏱', color: 'text-slate-400', text: 'Morning session: Theta decay is moderate. Watch for a trend forming before noon; avoid mid-range entries.' });
    } else if (minsFromOpen < 225) {
      lines.push({ key: 'time', icon: '⏱', color: 'text-slate-400', text: 'Post-noon: Theta decay accelerating. Selling premium here captures maximum time value with less gamma risk.' });
    } else {
      lines.push({ key: 'time', icon: '⚡', color: 'text-amber-400', text: 'Final hour: Gamma spikes near ATM. Short straddles have high pin risk — avoid new positions after 3 PM.' });
    }
  }

  // Breakeven check
  if (straddlePremium > 0 && atm > 0 && spot > 0) {
    const upperBE = atm + straddlePremium;
    const lowerBE = atm - straddlePremium;
    const distPct = Math.abs((spot - atm) / atm * 100).toFixed(1);
    lines.push({ key: 'be', icon: '⇔', color: 'text-slate-300', text: `Breakeven ₹${lowerBE.toFixed(0)} / ₹${upperBE.toFixed(0)}. Spot ₹${spot.toFixed(0)} is ${distPct}% from ATM.` });
  }

  // Expected move vs premium
  if (expMove?.points > 0 && straddlePremium > 0) {
    const em = expMove.points;
    if (em > straddlePremium * 1.1) {
      lines.push({ key: 'em', icon: '→', color: 'text-violet-400', text: `1σ expected move ±${em}pts exceeds premium ₹${straddlePremium.toFixed(0)}. Market is pricing a smaller range than IV implies — potential long straddle setup.` });
    } else if (em < straddlePremium * 0.9) {
      lines.push({ key: 'em', icon: '→', color: 'text-emerald-400', text: `Premium ₹${straddlePremium.toFixed(0)} exceeds 1σ expected move ±${em}pts. Market may be over-pricing the move — sellers have mathematical edge.` });
    } else {
      lines.push({ key: 'em', icon: '→', color: 'text-slate-400', text: `Premium ₹${straddlePremium.toFixed(0)} is fairly priced vs 1σ expected move ±${em}pts. Neither buyers nor sellers have a clear edge from pricing alone.` });
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

// ── Straddle / Strangle Chart (line, reuses our canvas module) ───────────────
function StraddleChart({ data, color = '#818cf8', label = 'Straddle' }) {
  const ref    = useRef(null);
  const chartR = useRef(null);
  const [hover, setHover] = useState(null); // { value, ce, pe } | null

  // Last data point — shown when crosshair is not active
  const last = data?.length ? data[data.length - 1] : null;
  const display = hover ?? (last ? { value: last.value, ce: last.ce, pe: last.pe } : null);

  useEffect(() => {
    if (!ref.current || !data?.length) return;
    import('@/app/lib/chart/Chart.js').then(({ createChart }) => {
      if (chartR.current) { chartR.current.destroy(); chartR.current = null; }
      const chart = createChart(ref.current, { interval: '5minute' });
      chartR.current = chart;
      const candles = data.map(d => ({
        time: d.time, open: d.value, high: d.value, low: d.value, close: d.value, volume: 0,
      }));
      chart.setCandles(candles);
      chart.setLine('premium', { data: data.map(d => ({ time: d.time, value: d.value })), color, width: 2 });

      // Map time → { ce, pe } for crosshair lookup
      const cepeMap = new Map(data.map(d => [d.time, { ce: d.ce, pe: d.pe }]));
      chart.onCrosshairMove(info => {
        if (!info) { setHover(null); return; }
        const cp = cepeMap.get(info.bar.time) || {};
        setHover({ value: info.bar.close, ce: cp.ce ?? null, pe: cp.pe ?? null });
      });
    });
    return () => { chartR.current?.destroy(); chartR.current = null; };
  }, [data, color]);

  if (!data?.length) return (
    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
      No intraday {label.toLowerCase()} data available
    </div>
  );

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
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  // Straddle / Strangle chart
  const [chartMode,       setChartMode]       = useState('straddle'); // 'straddle' | 'strangle'
  const [straddleData,    setStraddleData]    = useState(null);
  const [straddleLoading, setStraddleLoading] = useState(false);
  const [strangleData,    setStrangleData]    = useState(null);
  const [strangleLoading, setStrangleLoading] = useState(false);

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

  // ── Fetch straddle chart when ATM changes ───────────────────────────────────
  useEffect(() => {
    if (!chainData?.atm || !chainData?.expiry) return;
    setStraddleLoading(true);
    fetch(`/api/options/straddle-chart?symbol=${symbol}&expiry=${chainData.expiry}&strike=${chainData.atm}&interval=5minute`)
      .then(r => r.json())
      .then(d => { setStraddleData(d.candles || []); })
      .catch(() => setStraddleData([]))
      .finally(() => setStraddleLoading(false));
  }, [chainData?.atm, chainData?.expiry, symbol]);

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
            {[
              { val: 'weekly',  label: 'Weekly'  },
              { val: 'monthly', label: 'Monthly' },
              ...(expiries?.all?.slice(2, 4) || []).map(e => ({ val: e, label: e.slice(5) })),
            ].map(opt => (
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
              { label: 'Spot',      value: spot?.toFixed(2),                color: 'text-amber-400' },
              { label: 'ATM',       value: atm,                             color: 'text-white' },
              { label: 'Straddle',  value: `₹${straddlePremium?.toFixed(0)}`, color: 'text-violet-400' },
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

      {/* ── Two-column: Straddle Chart + Probability Panel ── */}
      {chainData && (
        <div className="max-w-[1400px] mx-auto px-6 pb-4 grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Straddle / Strangle Chart */}
          <div className="lg:col-span-2 bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-300">Intraday Premium</span>
                <div className="flex bg-[#060b14] rounded-lg p-0.5">
                  {[{ val: 'straddle', label: 'Straddle' }, { val: 'strangle', label: 'Strangle' }].map(m => (
                    <button key={m.val} onClick={() => setChartMode(m.val)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${chartMode === m.val ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-slate-500">
                {chartMode === 'straddle'
                  ? `${atm} CE + PE`
                  : `${strikesInput.lower} PE + ${strikesInput.upper} CE`}
              </span>
            </div>
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
            <div className="p-2 flex min-h-[200px]">
              {chartMode === 'straddle'
                ? (straddleLoading
                    ? <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading...</div>
                    : <StraddleChart data={straddleData} color="#818cf8" label="Straddle" />)
                : (strangleLoading
                    ? <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading...</div>
                    : <StraddleChart data={strangleData} color="#34d399" label="Strangle" />)
              }
            </div>
            {/* Commentary */}
            {(() => {
              const commentary = getStraddleCommentary(
                chartMode === 'straddle' ? straddleData : strangleData,
                chainData
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

          {/* Probability Panel */}
          <div className="bg-[#0c1a2e] border border-white/5 rounded-xl p-4 flex flex-col gap-4">
            <div className="text-xs font-semibold text-slate-300">Probability Calculator</div>
            <div className="text-[10px] text-slate-500 -mt-2">Based on BS model · risk-neutral probabilities</div>

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
              const dir    = probDirection === 'above' ? 'above' : 'below';
              const dirLabel = probDirection === 'above' ? 'Above' : 'Below';
              // Seller-friendly: "below" for CE sellers, "above" for PE sellers
              // Keep it neutral — just describe what the number means
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
                    <div className={`text-[10px] mt-1.5 ${pAt < 30 || pAt > 70 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {atVerdict}
                    </div>
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
                    <div className={`text-[10px] mt-1.5 ${pTouch > 70 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {touchVerdict}
                    </div>
                  </div>
                  {pTouch - pAt > 25 && (
                    <div className="text-[10px] text-slate-500 bg-amber-500/5 border border-amber-500/10 rounded-lg px-2.5 py-1.5">
                      ⚡ {Math.round(pTouch - pAt)}pt gap between touch and close — high intraday whipsaw risk
                    </div>
                  )}
                </div>
              );
            })()}

            {expMove && (
              <div className="border-t border-white/5 pt-3">
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
              Tip: click on the distribution chart below to set target price
            </div>
          </div>
        </div>
      )}

      {/* ── Price Distribution Chart ── */}
      {chainData && atmIV && T != null && (
        <div className="max-w-[1400px] mx-auto px-6 pb-4">
          <div className="bg-[#0c1a2e] border border-white/5 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
              <span className="text-xs font-semibold text-slate-300">Price Distribution at Expiry</span>
              <span className="text-[10px] text-slate-500">Log-normal · {atmIV?.toFixed(1)}% IV · click to set target</span>
            </div>
            <div className="p-2">
              <DistributionChart
                spot={spot} atm={atm} strikes={strikes}
                atmIV={atmIV} T={T}
                targetPrice={targetPrice}
                onTargetChange={p => { setTargetPrice(p); setProbTarget(String(p)); }}
              />
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
