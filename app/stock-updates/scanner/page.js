"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft, RefreshCw, ExternalLink, TrendingUp, TrendingDown, BarChart3, Gauge, Clock, Zap, ChevronRight, Eye } from 'lucide-react';
import { nseStrikeSteps } from '@/app/lib/nseStrikeSteps';
import OrderModal from '@/app/components/OrderModal';
import { usePageVisibility } from '@/app/hooks/usePageVisibility';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function fmtPrice(n) {
  if (n == null) return '—';
  return '₹' + parseFloat(n).toFixed(2);
}

function fmtPct(n) {
  if (n == null) return '—';
  const v = parseFloat(n);
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

// ── Stars component ───────────────────────────────────────────────────────────
function Stars({ count = 0, max = 4 }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`inline-block w-2 h-2 rounded-sm ${i < count ? 'bg-amber-400' : 'bg-slate-600'}`} />
      ))}
    </span>
  );
}

// ── Signal type metadata ──────────────────────────────────────────────────────
const SIGNAL_META = {
  // Bullish
  PDH_BO_CLOUD:  { color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-900/10' },
  PDH_BO_STRONG: { color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-900/10' },
  PDH_BO:        { color: 'text-green-400',   border: 'border-green-500/30',   bg: 'bg-green-900/10'   },
  PDL_RECLAIM:   { color: 'text-amber-400',   border: 'border-amber-500/40',   bg: 'bg-amber-900/10'   },
  VWAP_RSI_BO:   { color: 'text-blue-400',    border: 'border-blue-500/30',    bg: 'bg-blue-900/10'    },
  MOMENTUM:      { color: 'text-slate-300',   border: 'border-slate-600/40',   bg: 'bg-slate-800/30'   },
  // Bearish
  PDL_BD_CLOUD:  { color: 'text-red-400',     border: 'border-red-500/40',     bg: 'bg-red-900/10'     },
  PDL_BD_STRONG: { color: 'text-red-400',     border: 'border-red-500/40',     bg: 'bg-red-900/10'     },
  PDL_BD:        { color: 'text-rose-400',    border: 'border-rose-500/30',    bg: 'bg-rose-900/10'    },
  PDH_REJECT:    { color: 'text-orange-400',  border: 'border-orange-500/40',  bg: 'bg-orange-900/10'  },
  VWAP_RSI_BD:   { color: 'text-purple-400',  border: 'border-purple-500/30',  bg: 'bg-purple-900/10'  },
  MOMENTUM_BEAR: { color: 'text-slate-400',   border: 'border-slate-600/40',   bg: 'bg-slate-800/30'   },
};

const DEFAULT_SIGNAL_META = { color: 'text-slate-300', border: 'border-slate-600/30', bg: 'bg-slate-800/20' };

// ── Context Chip ──────────────────────────────────────────────────────────────
function Chip({ label, active, value }) {
  if (active === false || active === null) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium
      ${active ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40'
               : 'bg-slate-800/50 text-slate-500 border border-slate-700/30'}`}>
      {active ? '✓' : '·'} {value != null ? `${label} ${value}` : label}
    </span>
  );
}

// ── Main Signal Card ──────────────────────────────────────────────────────────
function SignalCard({ stock, enriched, enriching, quote, selected, onClick, onOrder, onChart, receivedAt, triggeredAt, isNew }) {
  const e   = enriched;
  const sig = e?.signal;
  const ctx = e?.context;
  const lvl = e?.levels;
  const sm  = sig ? (SIGNAL_META[sig.type] || DEFAULT_SIGNAL_META) : DEFAULT_SIGNAL_META;

  const triggerPrice = (e?.triggerPrice ?? parseFloat(String(stock.price).replace(/[^0-9.]/g, ''))) || 0;
  const ltp          = quote?.ltp ?? null;
  const changePct    = quote?.changePct ?? null;
  const sinceTrigger = (ltp && triggerPrice) ? ((ltp - triggerPrice) / triggerPrice * 100) : null;

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-xl border cursor-pointer transition-all duration-200
        ${selected
          ? 'border-blue-500/50 bg-blue-900/15 shadow-lg shadow-blue-500/10'
          : `${sm.border} ${sm.bg} hover:border-opacity-70 hover:brightness-110`}
        ${isNew ? 'ring-1 ring-emerald-500/30' : ''}`}
    >
      {/* New pulse bar */}
      {isNew && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-emerald-400 animate-pulse" />
      )}

      <div className="p-3">
        {/* Row 1: Symbol + label + stars */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-bold text-sm ${selected ? 'text-blue-300' : 'text-white'}`}>
                {stock.symbol}
              </span>
              {sig && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${sm.color} bg-black/20 border ${sm.border}`}>
                  {sig.label}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {sig && <Stars count={sig.stars} />}
          </div>
        </div>

        {/* Row 2: Price + changes */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="font-mono text-sm font-semibold text-white">
            {ltp != null ? fmtPrice(ltp) : fmtPrice(triggerPrice)}
          </span>
          {changePct != null && (
            <span className={`text-[11px] font-mono font-medium ${changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPct(changePct)}
            </span>
          )}
          {sinceTrigger != null && (
            <span className={`text-[10px] font-mono px-1 py-0.5 rounded
              ${sinceTrigger >= 0 ? 'text-emerald-400 bg-emerald-900/30' : 'text-red-400 bg-red-900/30'}`}
              title="Change since trigger">
              {sinceTrigger >= 0 ? '▲' : '▼'}{Math.abs(sinceTrigger).toFixed(1)}% since trigger
            </span>
          )}
        </div>

        {/* Row 3: Context chips */}
        {ctx && (
          <div className="flex flex-wrap gap-1 mb-2">
            <Chip label="VWAP"  active={ctx.aboveVwap}  />
            <Chip label="Cloud" active={ctx.aboveCloud} />
            {ctx.rsi != null && (
              <Chip label="RSI" active={ctx.rsi > 60} value={ctx.rsi.toFixed(0)} />
            )}
            {ctx.volRatio != null && (
              <Chip label="Vol" active={ctx.volSpike} value={`${ctx.volRatio}×`} />
            )}
          </div>
        )}

        {/* Row 4: Trade levels */}
        {lvl && (
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mb-2 flex-wrap">
            <span>Entry <span className="text-white">{fmtPrice(lvl.entry)}</span></span>
            <span className="text-slate-600">·</span>
            <span>SL <span className="text-red-400">{fmtPrice(lvl.sl)}</span> <span className="text-slate-500">({lvl.riskPct}%)</span></span>
            <span className="text-slate-600">·</span>
            <span>T1 <span className="text-emerald-400">{fmtPrice(lvl.target1)}</span></span>
          </div>
        )}

        {/* Row 5: Action buttons + age */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {/* Chart */}
            <button
              onClick={() => onChart(stock.symbol, triggeredAt, sig?.dir || 'bull')}
              className="text-[10px] px-1.5 py-1 rounded bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition-colors font-medium"
              title="15m Chart"
            >
              15m
            </button>
            {/* Orders */}
            <button
              onClick={() => onOrder(stock.symbol, ltp || triggerPrice, null, 'BUY')}
              className="text-[10px] px-1.5 py-1 rounded bg-slate-700/40 border border-slate-600/30 text-slate-300 hover:bg-slate-600/40 transition-colors font-semibold"
            >EQ</button>
            <button
              onClick={() => onOrder(stock.symbol, ltp || triggerPrice, 'CE', 'BUY')}
              className="text-[10px] px-1.5 py-1 rounded bg-slate-700/40 border border-slate-600/30 text-amber-400 hover:bg-amber-900/20 transition-colors font-semibold"
            >CE</button>
            <button
              onClick={() => onOrder(stock.symbol, ltp || triggerPrice, 'PE', 'BUY')}
              className="text-[10px] px-1.5 py-1 rounded bg-slate-700/40 border border-slate-600/30 text-rose-400 hover:bg-rose-900/20 transition-colors font-semibold"
            >PE</button>
          </div>
          <span className="text-[10px] text-slate-500">{timeAgo(receivedAt)}</span>
        </div>

        {/* Enrichment pending indicator */}
        {!e && (
          <div className="mt-1.5 text-[10px] text-slate-600 flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-slate-600 animate-pulse" />
            {enriching ? 'Enriching…' : 'Analysing…'}
          </div>
        )}

        {/* Extended warning */}
        {sinceTrigger != null && sinceTrigger > 3 && (
          <div className="mt-1 text-[10px] text-amber-500/80">⚠ May be extended from entry</div>
        )}
        {sinceTrigger != null && sinceTrigger < -2 && (
          <div className="mt-1 text-[10px] text-red-500/80">⚠ Below trigger price</div>
        )}
      </div>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
const FILTERS = [
  { id: 'all',    label: 'All' },
  { id: 'strong', label: '★★★★ Strong' },
  { id: 'good',   label: '★★★ Good' },
  { id: 'new',    label: '< 5m New' },
];

// ── Option symbol helpers (unchanged from original) ───────────────────────────
const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const pad2 = n => String(n).padStart(2, '0');

const NSE_HOLIDAYS_2026 = [
  '2026-01-15','2026-01-26','2026-03-03','2026-03-26','2026-03-31',
  '2026-04-03','2026-04-14','2026-05-01','2026-05-28','2026-06-26',
  '2026-09-14','2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25',
];
const isNSEHoliday = d => NSE_HOLIDAYS_2026.includes(`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`);
const isWeekend    = d => d.getDay() === 0 || d.getDay() === 6;
const isTradingDay = d => !isWeekend(d) && !isNSEHoliday(d);

function getPreviousTradingDay(date) {
  let d = new Date(date);
  d.setDate(d.getDate() - 1);
  while (!isTradingDay(d)) d.setDate(d.getDate() - 1);
  return d;
}

function getLastTuesdayExpiry(date = new Date()) {
  const today = new Date(); today.setHours(0,0,0,0);
  let year = date.getFullYear(), month = date.getMonth();
  let lastDay = new Date(year, month + 1, 0);
  while (lastDay.getDay() !== 2) lastDay.setDate(lastDay.getDate() - 1);
  if (!isTradingDay(lastDay)) lastDay = getPreviousTradingDay(lastDay);
  if (lastDay < today) {
    month++;
    if (month > 11) { month = 0; year++; }
    lastDay = new Date(year, month + 1, 0);
    while (lastDay.getDay() !== 2) lastDay.setDate(lastDay.getDate() - 1);
    if (!isTradingDay(lastDay)) lastDay = getPreviousTradingDay(lastDay);
  }
  return lastDay;
}

function getLastTuesdayExpiryYYMMDD(date = new Date()) {
  const d = getLastTuesdayExpiry(date);
  return `${String(d.getFullYear()%100).padStart(2,'0')}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`;
}

function buildOptionSymbols(symbol, price) {
  const expiry = getLastTuesdayExpiryYYMMDD();
  const numPrice = parseFloat(String(price).replace(/[^0-9.]/g,'')) || 0;
  if (numPrice <= 0) return { ce: null, pe: null, ceStrike: 0, peStrike: 0 };
  let step = nseStrikeSteps[symbol];
  if (!step) {
    if (numPrice >= 5000) step = 100;
    else if (numPrice >= 1000) step = 50;
    else if (numPrice >= 300) step = 20;
    else step = 10;
  }
  const ceStrike = Math.ceil(numPrice / step) * step;
  const peStrike = Math.floor(numPrice / step) * step;
  return { ce: `${symbol}${expiry}C${ceStrike}`, pe: `${symbol}${expiry}P${peStrike}`, ceStrike, peStrike };
}

// ── Inline Mini-Chart (canvas) ────────────────────────────────────────────────
function ScannerMiniChart({ data, boTimestamp, showPDHL, showCDHL }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.candles?.length) return;
    const ctx  = canvas.getContext('2d');
    const dpr  = window.devicePixelRatio || 1;
    const W    = canvas.parentElement?.clientWidth || 600;

    // Layout
    const PAD_L = 8, PAD_R = 60, PAD_T = 16;
    const PH  = Math.round(W * 0.4);   // price panel
    const GAP = 5;                      // gap between price & volume
    const VH  = Math.round(PH * 0.26); // volume panel
    const TL  = 18;                     // timeline row height
    const H   = PH + GAP + VH + TL;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { candles, todayStartIdx, pdh, pdl, cdh, cdl } = data;
    const N = candles.length;

    // Slot / bar geometry
    const chartW = W - PAD_L - PAD_R;
    const slotW  = chartW / N;
    const barW   = Math.max(1, Math.floor(slotW * 0.65));
    const xOf    = i => PAD_L + i * slotW + (slotW - barW) / 2; // bar left edge
    const cxOf   = i => PAD_L + i * slotW + slotW / 2;          // bar centre

    // Price Y — add 4% margin so candles don't touch edges
    const hiP = Math.max(...candles.map(c => c.h));
    const loP = Math.min(...candles.map(c => c.l));
    const margin = (hiP - loP) * 0.04 || 1;
    const pLo = loP - margin, pHi = hiP + margin;
    const yP = v => PAD_T + (PH - PAD_T - 2) * (1 - (v - pLo) / (pHi - pLo));

    // Volume Y (inside volume strip)
    const volTop = PH + GAP;
    const maxV = Math.max(...candles.map(c => c.v)) || 1;
    const yV = v => volTop + VH * (1 - v / maxV);

    // IST helper (client-side, mirrors server toIST)
    const IST_MS = 5.5 * 60 * 60 * 1000;
    const toIST = ms => {
      const d = new Date(ms + IST_MS);
      const hh = d.getUTCHours(), mm = d.getUTCMinutes();
      const mo = d.getUTCMonth() + 1, dy = d.getUTCDate();
      return {
        h: hh, m: mm,
        dateStr: `${d.getUTCFullYear()}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`,
        label: `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`,
        dayLabel: `${dy} ${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo]}`,
      };
    };

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = '#060b14';
    ctx.fillRect(0, 0, W, H);

    // ── Faint horizontal grid lines ──────────────────────────────────────────
    ctx.strokeStyle = '#0d1b2e'; ctx.lineWidth = 1; ctx.setLineDash([]);
    [0.25, 0.5, 0.75].forEach(f => {
      const y = PAD_T + (PH - PAD_T - 2) * f;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
    });

    // ── Day separator ────────────────────────────────────────────────────────
    if (todayStartIdx > 0 && todayStartIdx < N) {
      const sx = PAD_L + todayStartIdx * slotW;
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(sx, PAD_T - 4); ctx.lineTo(sx, volTop + VH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#2d4a6b';
      if (todayStartIdx > 3) ctx.fillText('Prev', PAD_L + (sx - PAD_L) / 2, PAD_T - 5);
      ctx.fillText('Today', sx + (W - PAD_R - sx) / 2, PAD_T - 5);
    }

    // ── Level lines (PDH/PDL/CDH/CDL) ────────────────────────────────────────
    // Drawn before candles so candles render on top
    const drawnLabelYs = []; // track y positions to prevent label overlap
    const drawLevel = (val, color, label) => {
      if (val == null) return;
      const y = yP(val);
      if (y < PAD_T || y > PH) return; // outside price panel — skip
      // Line
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      ctx.setLineDash([]);
      // Right-side label — nudge if overlapping a previous label
      ctx.font = 'bold 8.5px monospace';
      const lbl = `${label} ${val.toFixed(1)}`;
      let ly = y;
      drawnLabelYs.forEach(prevY => { if (Math.abs(ly - prevY) < 11) ly = prevY + 11; });
      drawnLabelYs.push(ly);
      // BG chip
      ctx.fillStyle = color + '22';
      ctx.fillRect(W - PAD_R + 2, ly - 8, PAD_R - 3, 13);
      // Border
      ctx.strokeStyle = color + '55'; ctx.lineWidth = 0.75;
      ctx.strokeRect(W - PAD_R + 2, ly - 8, PAD_R - 3, 13);
      // Text
      ctx.fillStyle = color; ctx.textAlign = 'left';
      ctx.fillText(lbl, W - PAD_R + 4, ly + 3);
    };
    if (showPDHL) { drawLevel(pdh, '#f59e0b', 'PDH'); drawLevel(pdl, '#f59e0b', 'PDL'); }
    if (showCDHL) { drawLevel(cdh, '#34d399', 'CDH'); drawLevel(cdl, '#f87171', 'CDL'); }

    // ── VWAP (today candles only) ─────────────────────────────────────────────
    const todaySlice = todayStartIdx >= 0 ? candles.slice(todayStartIdx) : candles;
    let lastVwapY = null;
    if (todaySlice.length > 1) {
      let cumTV = 0, cumV = 0;
      const pts = todaySlice.map((c, i) => {
        const tp = (c.h + c.l + c.c) / 3;
        cumTV += tp * c.v; cumV += c.v;
        return { i: todayStartIdx + i, vwap: cumV > 0 ? cumTV / cumV : tp };
      });
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath();
      pts.forEach((pt, j) => {
        const x = cxOf(pt.i), y = yP(pt.vwap);
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      const last = pts[pts.length - 1];
      lastVwapY = yP(last.vwap);
    }

    // ── Candles ───────────────────────────────────────────────────────────────
    candles.forEach((c, i) => {
      const isPrev = todayStartIdx > 0 && i < todayStartIdx;
      const isBO   = boTimestamp && c.t === boTimestamp;
      const isBull = c.c >= c.o;

      let bodyColor, wickColor;
      if (isBO) {
        bodyColor = '#eab308'; wickColor = '#fbbf24';
      } else if (isPrev) {
        bodyColor = isBull ? 'rgba(52,211,153,0.28)' : 'rgba(248,113,113,0.28)';
        wickColor = 'rgba(100,116,139,0.35)';
      } else {
        bodyColor = isBull ? '#34d399' : '#f87171';
        wickColor = isBull ? '#34d399' : '#f87171';
      }

      const x = xOf(i), cx = cxOf(i);
      const yO = yP(c.o), yC = yP(c.c), yH = yP(c.h), yL = yP(c.l);
      const top = Math.min(yO, yC), bot = Math.max(yO, yC);
      const bodyH = Math.max(1, bot - top);

      // BO candle: amber halo
      if (isBO) {
        ctx.strokeStyle = 'rgba(234,179,8,0.35)'; ctx.lineWidth = 4; ctx.setLineDash([]);
        ctx.strokeRect(x - 1, top - 2, barW + 2, bodyH + 4);
      }

      ctx.strokeStyle = wickColor; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(cx, yH); ctx.lineTo(cx, top); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, bot); ctx.lineTo(cx, yL); ctx.stroke();
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x, top, barW, bodyH);

      // Volume bar
      ctx.fillStyle = isBO ? 'rgba(234,179,8,0.65)' : isPrev ? 'rgba(100,116,139,0.22)' : (isBull ? 'rgba(52,211,153,0.42)' : 'rgba(248,113,113,0.42)');
      const vy = yV(c.v);
      ctx.fillRect(x, vy, barW, volTop + VH - vy);
    });

    // ── VWAP right-axis label (drawn after candles) ───────────────────────────
    if (lastVwapY !== null) {
      const todayLast = todaySlice[todaySlice.length - 1];
      const tp = (todayLast.h + todayLast.l + todayLast.c) / 3; // approx vwap end value
      ctx.font = 'bold 8px monospace';
      const lbl = `VWAP`;
      let ly = lastVwapY;
      drawnLabelYs.forEach(prevY => { if (Math.abs(ly - prevY) < 11) ly = prevY + 11; });
      ctx.fillStyle = '#1a2e4a';
      ctx.fillRect(W - PAD_R + 2, ly - 7, PAD_R - 3, 12);
      ctx.fillStyle = '#60a5fa'; ctx.textAlign = 'left';
      ctx.fillText(lbl, W - PAD_R + 4, ly + 3);
    }

    // ── Last price label ──────────────────────────────────────────────────────
    const lastC = candles[candles.length - 1];
    const lpy   = yP(lastC.c);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(W - PAD_R + 1, lpy - 8, PAD_R - 2, 15);
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 0.75;
    ctx.strokeRect(W - PAD_R + 1, lpy - 8, PAD_R - 2, 15);
    ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
    ctx.fillText(lastC.c.toFixed(1), W - PAD_R + 3, lpy + 3);

    // ── Timeline (x-axis) ─────────────────────────────────────────────────────
    const tlBase = PH + GAP + VH; // top of timeline strip
    ctx.fillStyle = '#060b14';
    ctx.fillRect(0, tlBase, W, TL);
    // Separator line
    ctx.strokeStyle = '#0d1b2e'; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(PAD_L, tlBase); ctx.lineTo(W - PAD_R, tlBase); ctx.stroke();

    // Draw time labels at round hours (10:00, 11:00 …) and market open (9:15)
    // Also draw day-start date at first candle of each day
    let lastTlX = -999;
    const MIN_LBL_GAP = 38;

    candles.forEach((c, i) => {
      const ist = toIST(c.t * 1000);
      const isOpen = ist.h === 9 && ist.m === 15;
      const isHour = ist.m === 0;
      if (!isOpen && !isHour) return;
      const x = cxOf(i);
      if (x - lastTlX < MIN_LBL_GAP) return;
      lastTlX = x;
      // Tick
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, tlBase); ctx.lineTo(x, tlBase + 3); ctx.stroke();
      // Label
      ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#475569';
      ctx.fillText(ist.label, x, tlBase + TL - 3);
    });

    // Day labels: show short date at start of each day segment
    const showDayLabel = (startIdx, endIdx) => {
      if (startIdx >= N) return;
      const ist = toIST(candles[startIdx].t * 1000);
      const segMidX = cxOf(Math.floor((startIdx + Math.min(endIdx - 1, N - 1)) / 2));
      ctx.font = '7.5px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#2d4a6b';
      ctx.fillText(ist.dayLabel, segMidX, tlBase + TL - 3);
    };
    if (todayStartIdx > 0) {
      showDayLabel(0, todayStartIdx);
      showDayLabel(todayStartIdx, N);
    }

  }, [data, boTimestamp, showPDHL, showCDHL]);

  return <canvas ref={canvasRef} className="w-full rounded" />;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ScannerPage({ scanName, scanSlug }) {
  const router       = useRouter();
  const scannerLabel = scanName ? String(scanName) : null;

  const [scans,        setScans]        = useState({ latest: null, history: [] });
  const [enriched,     setEnriched]     = useState(null);   // array of enriched per-stock data
  const [enriching,    setEnriching]    = useState(false);  // on-demand enrichment in progress
  const enrichedForRef = useRef(null);                      // scan id we last enriched for
  const [stockQuotes,  setStockQuotes]  = useState({});     // { [symbol]: { ltp, changePct } }
  const [loading,      setLoading]      = useState(true);
  const [lastUpdate,   setLastUpdate]   = useState(null);
  const [selectedStock,setSelectedStock]= useState(null);
  const [leftWidth,    setLeftWidth]    = useState(32);
  const [isDragging,   setIsDragging]   = useState(false);
  const [notification, setNotification] = useState(null);
  const [lastAlertId,  setLastAlertId]  = useState(null);
  const [isMobile,     setIsMobile]     = useState(false);
  const [marketData,   setMarketData]   = useState(null);
  const [showTestForm, setShowTestForm] = useState(false);
  const [testScannerName, setTestScannerName] = useState(scannerLabel || '');
  const [testStocksText,  setTestStocksText]  = useState('TCS,INFY,RELIANCE');
  const [testPricesText,  setTestPricesText]  = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderStock,   setOrderStock]   = useState(null);
  const [filter,       setFilter]       = useState('all');
  const [chartCandles, setChartCandles] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [showPDHL,     setShowPDHL]     = useState(true);
  const [showCDHL,     setShowCDHL]     = useState(true);
  const isVisible = usePageVisibility();
  const containerRef  = useRef(null);
  const chartAbortRef = useRef(null);

  // ── Enriched map: { [symbol]: enrichedEntry } ─────────────────────────────
  const enrichedMap = enriched
    ? Object.fromEntries(enriched.filter(e => !e.enrichFailed).map(e => [e.symbol, e]))
    : {};

  // ── Open order modal ──────────────────────────────────────────────────────
  const openOrderModal = (symbol, price, optionType = null, transactionType = 'BUY') => {
    let optionSymbol = null;
    if (optionType) {
      const { ce, pe } = buildOptionSymbols(symbol, price);
      optionSymbol = optionType === 'CE' ? ce : pe;
    }
    setOrderStock({ symbol, price, optionType, optionSymbol, transactionType });
    setOrderModalOpen(true);
  };

  // ── Build Unix seconds for signal candle, snapped to 15m boundary ───────────
  // Handles both Chartink "2:34 pm" format and ISO strings (from test form)
  function buildSignalUnixSec(triggeredAt, intervalMinutes = 15) {
    if (!triggeredAt || typeof triggeredAt !== 'string') return null;

    let unixMs;

    // Chartink format: "2:34 pm"
    const match = triggeredAt.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (match) {
      let h = parseInt(match[1]), m = parseInt(match[2]);
      const pm = match[3].toLowerCase() === 'pm';
      if (pm && h !== 12) h += 12;
      if (!pm && h === 12) h = 0;
      const now = new Date();
      const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000);
      const pad = n => String(n).padStart(2, '0');
      const iso = `${ist.getFullYear()}-${pad(ist.getMonth()+1)}-${pad(ist.getDate())}T${pad(h)}:${pad(m)}:00+05:30`;
      unixMs = new Date(iso).getTime();
    } else {
      // ISO string (test form)
      unixMs = new Date(triggeredAt).getTime();
    }

    if (!unixMs || isNaN(unixMs)) return null;

    // Snap DOWN to nearest candle boundary (15m bar opens at :00, :15, :30, :45)
    const intervalMs = intervalMinutes * 60 * 1000;
    const snapped = Math.floor(unixMs / intervalMs) * intervalMs;

    // Chartink fires at the CLOSE of the signal bar, which is the same timestamp
    // as the OPEN of the next bar. e.g. the 11:45 breakout bar closes at 12:00,
    // so triggeredAt = "12:00 pm". Snapping 12:00 gives 12:00 (building bar).
    // Subtracting one interval gives 11:45 — the actual signal candle that closed.
    return Math.floor((snapped - intervalMs) / 1000);
  }

  // ── Fetch candles for inline chart when selected stock changes ───────────
  useEffect(() => {
    if (!selectedStock) { setChartCandles(null); return; }
    if (chartAbortRef.current) chartAbortRef.current.abort();
    const ctrl = new AbortController();
    chartAbortRef.current = ctrl;
    setChartLoading(true);
    setChartCandles(null);
    fetch(`/api/scanner-candles?symbol=${encodeURIComponent(selectedStock)}&interval=15minute`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => { if (!d.error) setChartCandles(d); })
      .catch(() => {})
      .finally(() => { if (!ctrl.signal.aborted) setChartLoading(false); });
  }, [selectedStock]);

  // ── Open 15m chart in native chart page ──────────────────────────────────
  const openChart = useCallback((symbol, triggeredAt, dir = 'bull') => {
    const unixSec = buildSignalUnixSec(triggeredAt, 15);
    const atStr = unixSec ? `&at=${unixSec}&atdir=${dir}` : '';
    window.open(`/chart?symbol=${symbol}&interval=15minute${atStr}`, '_blank');
  }, []);

  const containerRect = useRef(null);

  // ── Mobile detection ──────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Notification permission ───────────────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const showNotification = (alertData) => {
    setNotification(`🔔 ${alertData.alertName} — ${alertData.stocks.length} stocks`);
    setTimeout(() => setNotification(null), 5000);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ChartInk Scanner', {
        body: `${alertData.alertName}\n${alertData.stocks.length} stocks`,
        icon: '/favicon.ico',
        tag: 'chartink-alert',
      });
    }
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2i78OScTgwOUKni77RgGwU7k9jwzn0sBC');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {}
  };

  // ── Parse raw scan → { alertName, scanName, stocks[], ... } ──────────────
  const parseChartInkData = (scan) => {
    if (!scan?.stocks) return null;
    const stocks = Array.isArray(scan.stocks)
      ? scan.stocks.map(s => String(s).trim())
      : String(scan.stocks).split(',').map(s => s.trim());
    const prices = scan.trigger_prices
      ? (Array.isArray(scan.trigger_prices)
          ? scan.trigger_prices.map(p => String(p).trim())
          : String(scan.trigger_prices).split(',').map(p => p.trim()))
      : [];
    return {
      alertName:   scan.alert_name || 'Unknown Alert',
      scanName:    scan.scan_name  || 'Scan',
      triggeredAt: scan.triggered_at || 'N/A',
      receivedAt:  scan.receivedAt || null,
      scanUrl:     scan.scan_url,
      stocks:      stocks.map((sym, idx) => ({ symbol: sym, price: prices[idx] || 'N/A' })),
    };
  };

  // ── Fetch scans (30s poll) ─────────────────────────────────────────────────
  useEffect(() => {
    const fetchScans = async () => {
      if (isRefreshing) return;
      try {
        const lookupKey = scanSlug || scannerLabel;
        const url = lookupKey
          ? `/api/get-scans?scanner=${encodeURIComponent(lookupKey)}`
          : '/api/get-scans';
        const res  = await fetch(url);
        const data = await res.json();

        if (!scannerLabel && data.latest && data.latest.id !== lastAlertId) {
          if (lastAlertId !== null) {
            const parsed = parseChartInkData(data.latest);
            if (parsed) showNotification(parsed);
          }
          setLastAlertId(data.latest.id);
        }

        setScans({ latest: data.latest || null, history: Array.isArray(data.history) ? data.history : [] });
        setEnriched(data.enriched || null);
        setLastUpdate(new Date());
        setLoading(false);

        if (data.latest && !selectedStock) {
          const parsed = parseChartInkData(data.latest);
          if (parsed?.stocks?.length) setSelectedStock(parsed.stocks[0].symbol);
        }
      } catch (e) {
        console.error('Error fetching scans:', e);
        setLoading(false);
      }
    };

    fetchScans();
    const interval = isVisible ? setInterval(fetchScans, 30000) : null;
    return () => clearInterval(interval);
  }, [selectedStock, lastAlertId, scannerLabel, scanSlug, isRefreshing, isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── On-demand enrichment: call /api/enrich-scan if enriched is missing ──────
  useEffect(() => {
    const latest = scans.latest;
    if (!latest?.id || enriched || enriching) return;
    if (enrichedForRef.current === latest.id) return; // already tried this scan

    const rawStocks = Array.isArray(latest.stocks)
      ? latest.stocks.map(s => String(s).trim())
      : String(latest.stocks || '').split(',').map(s => s.trim()).filter(Boolean);
    const rawPrices = Array.isArray(latest.trigger_prices)
      ? latest.trigger_prices.map(p => String(p).trim())
      : String(latest.trigger_prices || '').split(',').map(p => p.trim());
    const stocks = rawStocks
      .map((symbol, i) => ({ symbol, price: rawPrices[i] || '0' }))
      .filter(s => s.symbol);
    if (!stocks.length) return;

    enrichedForRef.current = latest.id;
    setEnriching(true);
    fetch('/api/enrich-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanId: latest.id, stocks, scanName: latest.scan_name || '' }),
    })
      .then(r => r.json())
      .then(d => { if (d.enriched) setEnriched(d.enriched); })
      .catch(e => console.error('[scanner] on-demand enrichment failed:', e))
      .finally(() => setEnriching(false));
  }, [scans.latest, enriched, enriching]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch live LTP for all stocks in the current scan ─────────────────────
  useEffect(() => {
    const latestData = scans.latest ? parseChartInkData(scans.latest) : null;
    if (!latestData?.stocks?.length) return;

    const symbols = latestData.stocks.map(s => s.symbol).filter(Boolean);
    if (!symbols.length) return;

    const fetchQuotes = async () => {
      try {
        const res  = await fetch(`/api/quotes?symbols=${symbols.join(',')}`);
        const data = await res.json();
        if (!data.quotes?.length) return;
        const map = {};
        for (const q of data.quotes) map[q.symbol] = q;
        setStockQuotes(map);
      } catch {}
    };

    fetchQuotes();
    const interval = isVisible ? setInterval(fetchQuotes, 30000) : null;
    return () => clearInterval(interval);
  }, [scans.latest, isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch market data (5 min) ─────────────────────────────────────────────
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const res  = await fetch('/api/market-data');
        const data = await res.json();
        setMarketData(data);
      } catch {}
    };
    fetchMarketData();
    const interval = isVisible ? setInterval(fetchMarketData, 300000) : null;
    return () => clearInterval(interval);
  }, [isVisible]);

  // ── Splitter drag ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging || !containerRef.current || isMobile) return;
      const rect  = containerRef.current.getBoundingClientRect();
      const pct   = ((e.clientX - rect.left) / rect.width) * 100;
      if (pct >= 22 && pct <= 55) setLeftWidth(pct);
    };
    const onUp = () => setIsDragging(false);
    if (isDragging) { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [isDragging, isMobile]);

  // ── Test webhook ──────────────────────────────────────────────────────────
  const sendTestWebhook = async () => {
    const scanner = (testScannerName && testScannerName.trim()) || scannerLabel || 'test-scan';
    const stocks  = testStocksText.split(',').map(s => s.trim()).filter(Boolean);
    const prices  = testPricesText ? testPricesText.split(',').map(p => p.trim()) : [];
    const sample  = {
      alert_name:     `${scanner} Test`,
      scan_name:      scanner,
      triggered_at:   new Date().toISOString(),
      stocks,
      trigger_prices: prices,
      scan_url:       scanSlug || String(scanner).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    };
    try {
      const res = await fetch('/api/chartink-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sample),
      });
      if (res.ok) {
        setNotification('Test webhook sent — enrichment running in background');
        setTimeout(() => setNotification(null), 4000);
        setShowTestForm(false);
        // Immediate refresh
        const refreshUrl = sample.scan_url
          ? `/api/get-scans?scanner=${encodeURIComponent(sample.scan_url)}`
          : scannerLabel ? `/api/get-scans?scanner=${encodeURIComponent(scannerLabel)}` : '/api/get-scans';
        const resp = await fetch(refreshUrl);
        const data = await resp.json();
        setScans({ latest: data.latest || null, history: Array.isArray(data.history) ? data.history : [] });
        setEnriched(data.enriched || null);
        if (data.latest?.id) setLastAlertId(data.latest.id);
        if (data.latest) {
          const parsed = parseChartInkData(data.latest);
          if (parsed?.stocks?.length) setSelectedStock(parsed.stocks[0].symbol);
        }
      } else {
        setNotification('Failed to send test webhook');
        setTimeout(() => setNotification(null), 3500);
      }
    } catch (err) {
      setNotification('Error sending test webhook');
      setTimeout(() => setNotification(null), 3500);
    }
  };

  // ── Filter stocks ─────────────────────────────────────────────────────────
  function applyFilter(stocks, receivedAt) {
    if (filter === 'all') return stocks;
    const ageMs = receivedAt ? Date.now() - new Date(receivedAt).getTime() : Infinity;
    return stocks.filter(s => {
      const e = enrichedMap[s.symbol];
      if (filter === 'strong') return e?.signal?.stars === 4;
      if (filter === 'good')   return e?.signal?.stars === 3;
      if (filter === 'new')    return ageMs < 5 * 60 * 1000;
      return true;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060b14] flex items-center justify-center">
        <div className="text-white text-sm">Loading scanner…</div>
      </div>
    );
  }

  const latestData = scans.latest ? parseChartInkData(scans.latest) : null;
  const filteredStocks = latestData
    ? applyFilter(latestData.stocks, latestData.receivedAt)
    : [];

  const scanAge = latestData?.receivedAt
    ? Date.now() - new Date(latestData.receivedAt).getTime()
    : Infinity;
  const isNewScan = scanAge < 60 * 1000; // scan fired < 60s ago

  return (
    <div className="min-h-screen bg-[#060b14] text-white">

      {/* Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium border border-emerald-500/50">
            {notification}
          </div>
        </div>
      )}

      <div className="container mx-auto px-2 sm:px-4 py-4 max-w-full">

        {/* Header */}
        <header className="mb-4">
          <div className="bg-[#0a0e1a] border border-[#1e3a5f] rounded-2xl p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button onClick={() => router.push('/trades')}
                  className="flex items-center justify-center w-9 h-9 bg-[#0d1f3c] hover:bg-[#1e3a5f] rounded-xl transition-colors text-slate-300 border border-[#1e3a5f]">
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-bold text-white">{scannerLabel || 'ChartInk Scanner'}</h1>
                    {isNewScan && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 animate-pulse">
                        LIVE
                      </span>
                    )}
                  </div>
                  {lastUpdate && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-slate-400 text-xs">Updated {lastUpdate.toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {latestData && (
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Latest scan</div>
                    <div className="text-sm font-mono text-blue-400">{latestData.stocks.length} stocks · {timeAgo(latestData.receivedAt)}</div>
                  </div>
                )}
                <button onClick={() => setShowTestForm(!showTestForm)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 rounded-xl text-indigo-300 text-xs font-medium transition-colors">
                  <Zap size={14} />
                  <span className="hidden sm:inline">Test</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Test form */}
        {showTestForm && (
          <div className="mb-4 p-4 bg-[#0a0e1a] border border-[#1e3a5f] rounded-2xl">
            <div className="text-xs font-medium text-white mb-3 flex items-center gap-2">
              <Zap size={13} className="text-indigo-400" /> Test Webhook
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={testScannerName} onChange={e => setTestScannerName(e.target.value)} placeholder="Scanner name"
                className="flex-1 bg-[#060b14] border border-[#1e3a5f] rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <input value={testStocksText} onChange={e => setTestStocksText(e.target.value)} placeholder="Stocks (TCS,INFY)"
                className="flex-1 bg-[#060b14] border border-[#1e3a5f] rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <input value={testPricesText} onChange={e => setTestPricesText(e.target.value)} placeholder="Prices (optional)"
                className="flex-1 bg-[#060b14] border border-[#1e3a5f] rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <button onClick={sendTestWebhook}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white text-sm font-medium transition-colors">Send</button>
              <button onClick={() => setShowTestForm(false)}
                className="px-4 py-2 bg-[#0d1f3c] border border-[#1e3a5f] rounded-xl text-slate-300 text-sm transition-colors">Close</button>
            </div>
          </div>
        )}

        {latestData ? (
          <>
            {/* ── Desktop layout ─────────────────────────────────────────── */}
            {!isMobile ? (
              <div ref={containerRef} className="flex gap-0 h-[calc(100vh-168px)] relative">

                {/* Left panel — signal cards */}
                <div className="bg-[#0a0e1a] border border-[#1e3a5f] rounded-l-2xl overflow-hidden flex flex-col shadow-xl"
                  style={{ width: `${leftWidth}%` }}>

                  {/* Panel header */}
                  <div className="p-3 border-b border-[#1e3a5f] bg-[#060b14] shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-sm font-semibold text-white truncate">
                          {latestData.alertName}
                        </span>
                      </div>
                      {latestData.scanUrl && (
                        <a href={`https://chartink.com/screener/${latestData.scanUrl}`} target="_blank" rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 shrink-0">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>

                    {/* Filter bar */}
                    <div className="flex gap-1 flex-wrap">
                      {FILTERS.map(f => (
                        <button key={f.id} onClick={() => setFilter(f.id)}
                          className={`text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors
                            ${filter === f.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#0d1f3c] text-slate-400 border border-[#1e3a5f] hover:text-slate-200'}`}>
                          {f.label}
                        </button>
                      ))}
                      <span className="text-[10px] text-slate-500 ml-auto self-center">{filteredStocks.length}/{latestData.stocks.length}</span>
                    </div>
                  </div>

                  {/* Stock list */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                    {filteredStocks.length === 0 ? (
                      <div className="text-center py-8 text-slate-500 text-xs">No stocks match filter</div>
                    ) : (
                      filteredStocks.map((stock, idx) => (
                        <SignalCard
                          key={idx}
                          stock={stock}
                          enriched={enrichedMap[stock.symbol] ?? null}
                          enriching={enriching}
                          quote={stockQuotes[stock.symbol] ?? null}
                          selected={selectedStock === stock.symbol}
                          onClick={() => setSelectedStock(stock.symbol)}
                          onOrder={openOrderModal}
                          onChart={openChart}
                          receivedAt={latestData.receivedAt}
                          triggeredAt={latestData.triggeredAt}
                          isNew={isNewScan}
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="w-1.5 bg-[#1e3a5f] hover:bg-blue-500/50 cursor-col-resize transition-colors"
                  onMouseDown={() => setIsDragging(true)} />

                {/* Right panel — detail + market strip */}
                <div className="bg-[#0a0e1a] border border-[#1e3a5f] rounded-r-2xl overflow-hidden flex flex-col shadow-xl"
                  style={{ width: `${100 - leftWidth}%` }}>

                  {/* Market strip */}
                  <div className="px-4 py-2 border-b border-[#1e3a5f] bg-[#060b14] flex flex-wrap gap-3 items-center shrink-0">
                    <div className="flex items-center gap-2 text-xs">
                      <BarChart3 size={12} className="text-blue-400" />
                      <span className="text-slate-400">NIFTY</span>
                      <span className="font-mono text-white">{marketData?.indices?.nifty || '—'}</span>
                      {marketData?.indices?.niftyChange && (
                        <span className={`font-mono ${parseFloat(marketData.indices.niftyChange) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {parseFloat(marketData.indices.niftyChange) >= 0 ? '+' : ''}{marketData.indices.niftyChange}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-400">BNIFTY</span>
                      <span className="font-mono text-white">{marketData?.indices?.bankNifty || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Gauge size={12} className="text-orange-400" />
                      <span className="text-orange-300">VIX</span>
                      <span className="font-mono text-orange-400">{marketData?.indices?.vix || '—'}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs ml-auto`}>
                      {marketData?.sentiment?.bias === 'Bullish' ? <TrendingUp size={12} className="text-emerald-400" /> : <TrendingDown size={12} className="text-red-400" />}
                      <span className={marketData?.sentiment?.bias === 'Bullish' ? 'text-emerald-400' : 'text-red-400'}>
                        {marketData?.sentiment?.bias || 'Neutral'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 flex flex-col overflow-y-auto">

                      {/* Selected stock header */}
                      {selectedStock && (() => {
                        const e   = enrichedMap[selectedStock];
                        const q   = stockQuotes[selectedStock];
                        const lvl = e?.levels;
                        const sig = e?.signal;
                        const ctx = e?.context;
                        return (
                          <div className="p-4 border-b border-[#1e3a5f] bg-[#0a1628] shrink-0">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-2xl font-bold text-white">{selectedStock}</span>
                                  {sig && (
                                    <>
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${(SIGNAL_META[sig.type] || DEFAULT_SIGNAL_META).color} bg-black/20 border ${(SIGNAL_META[sig.type] || DEFAULT_SIGNAL_META).border}`}>
                                        {sig.label}
                                      </span>
                                      <Stars count={sig.stars} />
                                    </>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-sm flex-wrap">
                                  {q && (
                                    <>
                                      <span className="font-mono font-bold text-white">{fmtPrice(q.ltp)}</span>
                                      <span className={`font-mono ${q.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(q.changePct)}</span>
                                    </>
                                  )}
                                  <span className="text-slate-400 text-xs">NSE · {latestData.alertName}</span>
                                </div>
                                {/* Context chips row */}
                                {ctx && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    <Chip label="VWAP"  active={ctx.aboveVwap} />
                                    <Chip label="Cloud" active={ctx.aboveCloud} />
                                    {ctx.rsi != null && <Chip label="RSI" active={ctx.rsi > 60} value={ctx.rsi.toFixed(0)} />}
                                    {ctx.volRatio != null && <Chip label="Vol" active={ctx.volSpike} value={`${ctx.volRatio}×`} />}
                                    {ctx.pdh != null && <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 bg-[#0d1f3c] rounded border border-[#1e3a5f]">PDH {fmtPrice(ctx.pdh)}</span>}
                                    {ctx.pdl != null && <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 bg-[#0d1f3c] rounded border border-[#1e3a5f]">PDL {fmtPrice(ctx.pdl)}</span>}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <button onClick={() => openChart(selectedStock, latestData.triggeredAt, enrichedMap[selectedStock]?.signal?.dir || 'bull')}
                                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-xl text-blue-300 text-xs font-medium transition-colors">
                                  <Eye size={13} /> 15m Chart
                                </button>
                                <button onClick={() => openOrderModal(selectedStock, stockQuotes[selectedStock]?.ltp || 0, null, 'BUY')}
                                  className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-medium transition-colors text-center">
                                  Buy EQ
                                </button>
                              </div>
                            </div>

                            {/* Trade plan */}
                            {lvl && (
                              <div className="mt-3 grid grid-cols-4 gap-2">
                                {[
                                  { label: 'Entry', value: fmtPrice(lvl.entry), color: 'text-white' },
                                  { label: 'Stop Loss', value: fmtPrice(lvl.sl), color: 'text-red-400', sub: `-${lvl.riskPct}%` },
                                  { label: 'Target 1', value: fmtPrice(lvl.target1), color: 'text-emerald-400', sub: '1.5R' },
                                  { label: 'Target 2', value: fmtPrice(lvl.target2), color: 'text-emerald-300', sub: '3R' },
                                ].map(({ label, value, color, sub }) => (
                                  <div key={label} className="bg-[#060b14] border border-[#1e3a5f] rounded-xl p-2.5 text-center">
                                    <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
                                    <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
                                    {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* ── Inline chart ──────────────────────────────── */}
                      <div className="px-4 pb-4">
                        {selectedStock ? (
                          <div className="bg-[#060b14] border border-[#1e3a5f] rounded-2xl overflow-hidden">
                            {/* Chart toolbar */}
                            <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e3a5f]">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                {selectedStock} · 15m · Today + Prev Day
                              </span>
                              <div className="flex items-center gap-2">
                                {/* PDH/PDL toggle */}
                                <button
                                  onClick={() => setShowPDHL(v => !v)}
                                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold border transition-colors ${
                                    showPDHL
                                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                      : 'bg-transparent text-slate-600 border-slate-700/40'
                                  }`}
                                >PDH/PDL</button>
                                {/* CDH/CDL toggle */}
                                <button
                                  onClick={() => setShowCDHL(v => !v)}
                                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold border transition-colors ${
                                    showCDHL
                                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                      : 'bg-transparent text-slate-600 border-slate-700/40'
                                  }`}
                                >CDH/CDL</button>
                              </div>
                            </div>
                            {/* Canvas */}
                            <div className="p-2">
                              {chartLoading ? (
                                <div className="flex items-center justify-center h-32 text-slate-500 text-xs gap-2">
                                  <RefreshCw size={13} className="animate-spin" /> Loading candles…
                                </div>
                              ) : chartCandles?.candles?.length ? (
                                <ScannerMiniChart
                                  data={chartCandles}
                                  boTimestamp={(() => {
                                    const triggeredAt = latestData?.triggeredAt;
                                    if (!triggeredAt) return null;
                                    // Reuse buildSignalUnixSec logic
                                    const match = String(triggeredAt).match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
                                    if (match) {
                                      let h = parseInt(match[1]), m = parseInt(match[2]);
                                      if (match[3].toLowerCase() === 'pm' && h !== 12) h += 12;
                                      if (match[3].toLowerCase() === 'am' && h === 12) h = 0;
                                      const now = new Date();
                                      const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000);
                                      const p = n => String(n).padStart(2,'0');
                                      const iso = `${ist.getFullYear()}-${p(ist.getMonth()+1)}-${p(ist.getDate())}T${p(h)}:${p(m)}:00+05:30`;
                                      const ms = new Date(iso).getTime();
                                      const snapped = Math.floor(ms / (15*60000)) * (15*60000);
                                      return Math.floor((snapped - 15*60000) / 1000);
                                    }
                                    return null;
                                  })()}
                                  showPDHL={showPDHL}
                                  showCDHL={showCDHL}
                                />
                              ) : (
                                <div className="flex items-center justify-center h-32 text-slate-600 text-xs">
                                  No candle data available
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-[#060b14] border border-[#1e3a5f] rounded-2xl flex items-center justify-center h-40 text-slate-600 text-xs">
                            Select a stock to see chart
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Scan stats + trend (moved below chart) */}
                    <div className="px-4 pt-0 pb-4 shrink-0">
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-[#060b14] border border-[#1e3a5f] rounded-xl p-3">
                          <div className="text-slate-400 text-[10px] mb-1 flex items-center gap-1.5">
                            <Zap size={11} className="text-blue-400" /> Current scan
                          </div>
                          <div className="text-2xl font-bold text-blue-400">{latestData.stocks.length}</div>
                          <div className="text-blue-400/50 text-[10px]">stocks detected</div>
                        </div>
                        <div className="bg-[#060b14] border border-[#1e3a5f] rounded-xl p-3">
                          <div className="text-slate-400 text-[10px] mb-1 flex items-center gap-1.5">
                            <BarChart3 size={11} className="text-emerald-400" /> Avg (20 scans)
                          </div>
                          <div className="text-2xl font-bold text-emerald-400">
                            {scans.history?.length > 0
                              ? (scans.history.slice(0, 20).reduce((sum, s) => {
                                  const p = parseChartInkData(s);
                                  return sum + (p ? p.stocks.length : 0);
                                }, latestData.stocks.length) / Math.min(scans.history.length + 1, 21)).toFixed(1)
                              : latestData.stocks.length}
                          </div>
                          <div className="text-emerald-400/50 text-[10px]">stocks per scan</div>
                        </div>
                      </div>
                      <div className="bg-[#060b14] border border-[#1e3a5f] rounded-xl p-3">
                        <div className="text-slate-300 text-[10px] font-medium mb-2 flex items-center gap-1.5">
                          <BarChart3 size={11} className="text-blue-400" /> Scan Trend
                        </div>
                        <ResponsiveContainer width="100%" height={90}>
                          <LineChart data={[scans.latest, ...scans.history].filter(Boolean).slice(0, 10).reverse().map(s => {
                            const p = parseChartInkData(s);
                            if (!p) return null;
                            let label = p.triggeredAt;
                            if (typeof label === 'string' && label.includes('T')) {
                              const d = new Date(label);
                              label = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                            }
                            return { time: label?.slice(0, 10) || '', count: p.stocks.length };
                          }).filter(Boolean)}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                            <XAxis dataKey="time" stroke="#475569" tick={{ fontSize: 8 }} angle={-30} textAnchor="end" height={36} />
                            <YAxis stroke="#475569" tick={{ fontSize: 8 }} />
                            <Tooltip contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid #1e3a5f', borderRadius: '8px', fontSize: 10 }} />
                            <Line type="monotone" dataKey="count" stroke="#60a5fa" strokeWidth={1.5} dot={{ fill: '#60a5fa', r: 2 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Quick links sidebar */}
                    <div className="hidden lg:flex w-36 flex-col items-center py-4 gap-1.5 overflow-y-auto px-2.5 border-l border-[#1e3a5f] bg-[#060b14]">
                      <div className="text-[10px] text-slate-500 font-medium mb-1 w-full">Links</div>
                      {selectedStock ? (
                        <>
                          {[
                            { label: '📊 TV NSE', url: `https://www.tradingview.com/chart/?symbol=NSE:${selectedStock}&interval=15` },
                            { label: '📋 TV BSE', url: `https://www.tradingview.com/chart/?symbol=BSE:${selectedStock}&interval=15` },
                            { label: '💹 Google', url: `https://www.google.com/finance/quote/${selectedStock}:NSE` },
                            { label: '📈 ChartInk', url: `https://chartink.com/stocks/${selectedStock.toLowerCase()}.html` },
                          ].map(({ label, url }) => (
                            <button key={label} onClick={() => window.open(url, '_blank')}
                              className="w-full text-left text-[11px] px-2 py-2 bg-[#0d1f3c] hover:bg-[#1e3a5f] border border-[#1e3a5f] text-slate-300 rounded-xl transition-colors">
                              {label}
                            </button>
                          ))}
                        </>
                      ) : (
                        <div className="text-[10px] text-slate-500 text-center mt-4">Select a stock</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Mobile layout ──────────────────────────────────────────── */
              <div className="space-y-3">
                {/* Alert header */}
                <div className="bg-[#0a0e1a] border border-[#1e3a5f] rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="font-semibold text-white text-sm">{latestData.alertName}</span>
                      </div>
                      <div className="text-slate-400 text-xs mt-0.5 flex items-center gap-1">
                        <Clock size={10} /> {timeAgo(latestData.receivedAt)}
                      </div>
                    </div>
                    <div className="text-blue-300 text-xl font-bold">{latestData.stocks.length}</div>
                  </div>
                </div>

                {/* Filter bar mobile */}
                <div className="flex gap-1 flex-wrap">
                  {FILTERS.map(f => (
                    <button key={f.id} onClick={() => setFilter(f.id)}
                      className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-colors
                        ${filter === f.id ? 'bg-blue-600 text-white' : 'bg-[#0a0e1a] text-slate-400 border border-[#1e3a5f]'}`}>
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Signal cards */}
                <div className="space-y-2">
                  {filteredStocks.map((stock, idx) => (
                    <SignalCard
                      key={idx}
                      stock={stock}
                      enriched={enrichedMap[stock.symbol] ?? null}
                      quote={stockQuotes[stock.symbol] ?? null}
                      selected={selectedStock === stock.symbol}
                      onClick={() => setSelectedStock(stock.symbol)}
                      onOrder={openOrderModal}
                      onChart={openChart}
                      receivedAt={latestData.receivedAt}
                      isNew={isNewScan}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* History */}
            {scans.history.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={16} className="text-slate-400" />
                  <h2 className="text-sm font-semibold text-white">Previous Alerts</h2>
                  <span className="text-slate-500 text-xs">({Math.max(scans.history.length - 1, 0)})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {scans.history.slice(1).map(scan => {
                    const d = parseChartInkData(scan);
                    if (!d) return null;
                    return (
                      <div key={scan.id}
                        className="group bg-[#0a0e1a] border border-[#1e3a5f] rounded-xl p-3 hover:border-blue-500/30 cursor-pointer transition-colors"
                        onClick={() => {
                          setScans(s => ({ ...s, latest: scan }));
                          setEnriched(null);
                          if (d.stocks.length > 0) setSelectedStock(d.stocks[0].symbol);
                        }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-white text-xs truncate">{d.alertName}</span>
                          <ChevronRight size={12} className="text-slate-600 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                        </div>
                        <div className="text-slate-500 text-[10px] mb-1.5">{timeAgo(d.receivedAt)}</div>
                        <div className="text-emerald-400 text-[10px] font-mono">
                          {d.stocks.slice(0, 3).map(s => s.symbol).join(', ')}
                          {d.stocks.length > 3 && <span className="text-slate-500"> +{d.stocks.length - 3}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="bg-[#0a0e1a] border border-[#1e3a5f] rounded-2xl p-10 text-center max-w-sm">
              <RefreshCw size={32} className="text-blue-400 animate-spin mx-auto mb-4" style={{ animationDuration: '3s' }} />
              <h3 className="text-lg font-bold text-white mb-2">Waiting for Scanner</h3>
              <p className="text-slate-400 text-sm mb-4">Alerts appear here once received from Chartink</p>
              <div className="bg-[#060b14] rounded-xl p-3 text-xs text-slate-500 border border-[#1e3a5f]">
                <span className="text-slate-400">Webhook URL:</span><br />
                <code className="text-blue-400 break-all">your-domain.com/api/chartink-webhook</code>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(30,41,59,0.3); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(71,85,105,0.6); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,0.8); }
      `}</style>

      {/* Disclaimer */}
      <div className="px-4 pb-4 pt-2">
        <p className="text-[10px] text-white/15 leading-relaxed border-t border-white/5 pt-3">
          <strong className="text-white/25">Disclaimer:</strong> Stocks displayed are generated from technical scan conditions. Not investment advice. Consult a SEBI-registered advisor before trading.
        </p>
      </div>

      <OrderModal
        isOpen={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        symbol={orderStock?.symbol}
        price={orderStock?.price}
        defaultType={orderStock?.transactionType || 'BUY'}
        optionType={orderStock?.optionType}
        optionSymbol={orderStock?.optionSymbol}
        onOrderPlaced={result => console.log('Order placed:', result)}
      />
    </div>
  );
}
