'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Nav from '../../components/Nav';
import { createChart } from '../../lib/chart/Chart';

// ── Math helpers ───────────────────────────────────────────────────────────────
function computeVWAP(candles) {
  let cumTPV = 0, cumVol = 0, lastDate = null;
  return candles.map(c => {
    const date = new Date(c.time * 1000).toISOString().slice(0, 10);
    if (date !== lastDate) { cumTPV = 0; cumVol = 0; lastDate = date; }
    const tp  = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1;
    cumTPV += tp * vol; cumVol += vol;
    return { time: c.time, value: cumTPV / cumVol };
  });
}

function computeEMA(candles, period) {
  if (!candles.length) return [];
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  return candles.map(c => { ema = c.close * k + ema * (1 - k); return { time: c.time, value: ema }; });
}

function computeRSI(candles, period = 14) {
  if (candles.length < period + 1) return new Array(candles.length).fill(null);
  const out = new Array(candles.length).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d > 0) avgGain += d; else avgLoss += -d;
  }
  avgGain /= period; avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < candles.length; i++) {
    const d    = candles[i].close - candles[i - 1].close;
    avgGain    = ((avgGain * (period - 1)) + (d > 0 ? d : 0)) / period;
    avgLoss    = ((avgLoss * (period - 1)) + (d < 0 ? -d : 0)) / period;
    out[i]     = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// ── RSI mini-canvas draw (no value text — shown via React overlay) ─────────────
function drawRSICanvas(canvas, rsiValues) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.clientWidth  || 400;
  const H   = canvas.clientHeight || 72;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#060b14';
  ctx.fillRect(0, 0, W, H);

  const valid = rsiValues.map((v, i) => ({ v, i })).filter(p => p.v != null);
  if (!valid.length) return;
  const n  = rsiValues.length;
  const xF = i => n > 1 ? (i / (n - 1)) * W : W / 2;
  const yF = v => ((100 - v) / 100) * H;

  // Fill zones
  ctx.fillStyle = 'rgba(239,68,68,0.05)';
  ctx.fillRect(0, 0, W, yF(70));
  ctx.fillStyle = 'rgba(34,197,94,0.05)';
  ctx.fillRect(0, yF(30), W, H - yF(30));

  // Grid lines
  [[70, 'rgba(239,68,68,0.22)'], [50, 'rgba(148,163,184,0.1)'], [30, 'rgba(34,197,94,0.22)']].forEach(([val, col]) => {
    ctx.strokeStyle = col; ctx.lineWidth = 0.75; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(0, yF(val)); ctx.lineTo(W, yF(val)); ctx.stroke();
  });
  ctx.setLineDash([]);

  // Labels
  ctx.font = '9px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(239,68,68,0.55)';
  ctx.fillText('70', 3, yF(70) - 2);
  ctx.fillStyle = 'rgba(34,197,94,0.55)';
  ctx.fillText('30', 3, yF(30) + 9);

  // RSI line
  ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  valid.forEach((p, j) => { j === 0 ? ctx.moveTo(xF(p.i), yF(p.v)) : ctx.lineTo(xF(p.i), yF(p.v)); });
  ctx.stroke();
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function p2(v) { return v != null ? v.toFixed(2) : '—'; }
function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e7) return (v / 1e7).toFixed(1) + 'Cr';
  if (v >= 1e5) return (v / 1e5).toFixed(1) + 'L';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(v);
}
function fmtPrice(v) {
  if (v == null) return '—';
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const INTERVALS = [
  { value: 'minute',   label: '1m'  },
  { value: '5minute',  label: '5m'  },
  { value: '15minute', label: '15m' },
];
const OVERLAY_BTNS = [
  { key: 'vwap',  label: 'VWAP',   color: '#f59e0b' },
  { key: 'ema9',  label: 'EMA 9',  color: '#22d3ee' },
  { key: 'ema21', label: 'EMA 21', color: '#f97316' },
  { key: 'rsi',   label: 'RSI',    color: '#818cf8' },
];

// ── Searchable symbol combobox ─────────────────────────────────────────────────
function SymbolCombobox({ symbols, value, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [open,  setOpen]  = useState(false);
  const ref = useRef(null);
  const filtered = (query.length < 1 ? symbols.slice(0, 25) : symbols.filter(s => s.name.includes(query.toUpperCase()))).slice(0, 25);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => { setQuery(value || ''); }, [value]);

  return (
    <div className="relative" ref={ref}>
      <input
        className="w-44 bg-[#0d1f3c] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
        placeholder="Symbol…" value={query}
        onChange={e => { setQuery(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-48 bg-[#0d1f3c] border border-[#1e3a5f] rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {filtered.map(s => (
            <li key={s.name}
              className="px-3 py-1.5 text-sm text-slate-300 hover:bg-[#1e3a5f] hover:text-white cursor-pointer font-mono flex justify-between"
              onMouseDown={() => { setQuery(s.name); setOpen(false); onChange(s.name); }}>
              <span>{s.name}</span>
              <span className="text-[10px] text-slate-500">±{s.strikeGap}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Option chart panel ─────────────────────────────────────────────────────────
function OptionChartPanel({ symbol, strike, expiry, type, interval, overlays }) {
  const containerRef  = useRef(null);
  const rsiCanvasRef  = useRef(null);
  const chartRef      = useRef(null);
  const candlesRef    = useRef(null);
  const linesRef      = useRef({ vwap: [], ema9: [], ema21: [], rsi: [] });
  const timeToIdxRef  = useRef(new Map());

  const [info,      setInfo]      = useState(null);
  const [err,       setErr]       = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [hoverData, setHoverData] = useState(null);
  // hoverData: { bar: {open,high,low,close,volume,time}, lines: {vwap,ema9,ema21,rsi} }

  function buildHoverData(bar, lineValues) {
    const candles = candlesRef.current || [];
    const lines   = linesRef.current;
    const idx     = timeToIdxRef.current.get(bar.time) ?? (candles.length - 1);
    return {
      bar,
      lines: {
        vwap:  lineValues?.vwap  ?? null,
        ema9:  lineValues?.ema9  ?? null,
        ema21: lineValues?.ema21 ?? null,
        rsi:   lines.rsi[idx]   ?? null,
      },
    };
  }

  function defaultHoverData() {
    const candles = candlesRef.current;
    if (!candles?.length) return null;
    const bar   = candles[candles.length - 1];
    const lines = linesRef.current;
    const idx   = candles.length - 1;
    return {
      bar,
      lines: {
        vwap:  lines.vwap[idx]?.value ?? null,
        ema9:  lines.ema9[idx]?.value ?? null,
        ema21: lines.ema21[idx]?.value ?? null,
        rsi:   lines.rsi[idx] ?? null,
      },
    };
  }

  // ── Fetch tradingsymbol + candles ──────────────────────────────────────────
  useEffect(() => {
    if (!symbol || !strike || !expiry || !type) return;
    let cancelled = false;

    async function load() {
      setLoading(true); setErr(null); setInfo(null); setHoverData(null);
      candlesRef.current = null;

      const tsRes  = await fetch(`/api/option-meta?action=tradingsymbol&symbol=${symbol}&expiry=${expiry}&strike=${strike}&type=${type}`);
      const tsData = await tsRes.json();
      if (cancelled) return;
      if (!tsRes.ok || !tsData.tradingSymbol) { setErr(tsData.error || 'Symbol not found'); setLoading(false); return; }

      const kiteTs = tsData.tradingSymbol;
      const cdRes  = await fetch(`/api/chart-data?symbol=${encodeURIComponent(kiteTs)}&interval=${interval}`);
      const cdData = await cdRes.json();
      if (cancelled) return;
      if (cdData.error) { setErr(cdData.error); setLoading(false); return; }
      if (!cdData.candles?.length) { setErr('No data'); setLoading(false); return; }

      const candles = cdData.candles;
      candlesRef.current = candles;
      timeToIdxRef.current = new Map(candles.map((c, i) => [c.time, i]));

      // Compute all indicator arrays once
      linesRef.current = {
        vwap: computeVWAP(candles),
        ema9: computeEMA(candles, 9),
        ema21: computeEMA(candles, 21),
        rsi:  computeRSI(candles),
      };

      setInfo({ ltp: candles[candles.length - 1].close, open: candles[0].open, tradingSymbol: kiteTs });
      setLoading(false);

      // Init or reuse chart
      if (!chartRef.current && containerRef.current) {
        chartRef.current = createChart(containerRef.current, { interval, showVolume: true });
      }
      if (chartRef.current) {
        chartRef.current.setCandles(candles);

        // Register crosshair — updates overlay
        chartRef.current.onCrosshairMove(data => {
          if (!data) { setHoverData(defaultHoverData()); return; }
          setHoverData(buildHoverData(data.bar, data.lineValues));
        });
      }

      // Set default hover to last bar
      setHoverData(defaultHoverData());
    }

    load().catch(e => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => {
      cancelled = true;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [symbol, strike, expiry, type, interval]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply / clear overlay lines when overlays state or candles change ──────
  useEffect(() => {
    const c       = chartRef.current;
    const candles = candlesRef.current;
    const lines   = linesRef.current;
    if (!c || !candles) return;

    overlays.vwap  ? c.setLine('vwap',  { data: lines.vwap,  color: '#f59e0b', width: 1.5 }) : c.clearLine('vwap');
    overlays.ema9  ? c.setLine('ema9',  { data: lines.ema9,  color: '#22d3ee', width: 1.5 }) : c.clearLine('ema9');
    overlays.ema21 ? c.setLine('ema21', { data: lines.ema21, color: '#f97316', width: 1.5 }) : c.clearLine('ema21');

    // Refresh hover data so newly enabled indicators show values immediately
    setHoverData(prev => prev ? buildHoverData(prev.bar, { vwap: prev.lines.vwap, ema9: prev.lines.ema9, ema21: prev.lines.ema21 }) : defaultHoverData());
  }, [overlays.vwap, overlays.ema9, overlays.ema21, info]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draw RSI canvas when candles load or RSI toggled on ───────────────────
  useEffect(() => {
    if (!overlays.rsi || !rsiCanvasRef.current || !candlesRef.current) return;
    // Small delay so the canvas has rendered dimensions
    const t = setTimeout(() => drawRSICanvas(rsiCanvasRef.current, linesRef.current.rsi), 30);
    return () => clearTimeout(t);
  }, [overlays.rsi, info]);

  const color = type === 'CE' ? '#22c55e' : '#ef4444';
  const abs   = info ? info.ltp - info.open : null;
  const pct   = info && info.open ? (abs / info.open * 100) : null;
  const up    = abs != null ? abs >= 0 : null;
  const { bar, lines: hLines } = hoverData || {};

  return (
    <div className="h-full flex flex-col rounded-xl border border-[#1e3a5f] bg-[#0a0e1a] overflow-hidden">

      {/* ── Panel header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e3a5f] bg-[#0d1421] shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold font-mono text-white">{symbol} {strike} {type}</span>
          {info?.tradingSymbol && <span className="text-[10px] text-slate-600 font-mono hidden md:inline">{info.tradingSymbol}</span>}
        </div>
        <div className="flex items-center gap-3 text-sm font-mono shrink-0">
          {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
          {err     && <span className="text-xs text-red-400 truncate max-w-[180px]">{err}</span>}
          {info && !loading && (
            <>
              <span className="text-white font-semibold">{fmtPrice(info.ltp)}</span>
              {abs != null && (
                <span className={up ? 'text-green-400' : 'text-red-400'}>
                  {up ? '+' : ''}{abs.toFixed(2)} ({up ? '+' : ''}{pct.toFixed(2)}%)
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Main chart canvas (flex-1 fills remaining panel height) ──────── */}
      <div ref={containerRef} className="relative flex-1 min-h-0 w-full">
        {/* OHLCV + indicator value overlay */}
        {bar && (
          <div className="absolute top-2 left-2 z-10 pointer-events-none">
            <div className="bg-black/50 rounded px-2 py-1.5 flex flex-col gap-0.5">
              {/* OHLCV row */}
              <div className="flex items-center gap-2.5 text-[11px] font-mono leading-none">
                <span className="text-slate-500">O <span className="text-slate-200">{p2(bar.open)}</span></span>
                <span className="text-slate-500">H <span className="text-green-400">{p2(bar.high)}</span></span>
                <span className="text-slate-500">L <span className="text-red-400">{p2(bar.low)}</span></span>
                <span className="text-slate-500">C <span className={bar.close >= bar.open ? 'text-green-300' : 'text-red-300'}>{p2(bar.close)}</span></span>
                <span className="text-slate-500">V <span className="text-slate-400">{fmtVol(bar.volume)}</span></span>
              </div>
              {/* Indicator row — only show active ones with values */}
              {(overlays.vwap || overlays.ema9 || overlays.ema21) && (
                <div className="flex items-center gap-2.5 text-[11px] font-mono leading-none">
                  {overlays.vwap  && hLines?.vwap  != null && <span style={{ color: '#f59e0b' }}>VWAP <span>{p2(hLines.vwap)}</span></span>}
                  {overlays.ema9  && hLines?.ema9  != null && <span style={{ color: '#22d3ee' }}>EMA9 <span>{p2(hLines.ema9)}</span></span>}
                  {overlays.ema21 && hLines?.ema21 != null && <span style={{ color: '#f97316' }}>EMA21 <span>{p2(hLines.ema21)}</span></span>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── RSI mini pane ─────────────────────────────────────────────────── */}
      {overlays.rsi && (
        <div className="relative border-t border-[#1e3a5f] shrink-0" style={{ height: 72 }}>
          <canvas ref={rsiCanvasRef} className="absolute inset-0 w-full h-full" />
          {/* RSI value overlay — updates with crosshair */}
          <div className="absolute top-1 right-2 pointer-events-none">
            <span className="text-[11px] font-mono font-semibold" style={{ color: '#818cf8' }}>
              RSI(14){hLines?.rsi != null ? ` ${hLines.rsi.toFixed(1)}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
function OptionsChartInner() {
  const params = useSearchParams();

  const [symbol,   setSymbol]   = useState(params.get('symbol')   || 'NIFTY');
  const [expiry,   setExpiry]   = useState(params.get('expiry')   || '');
  const [strike,   setStrike]   = useState(params.get('strike')   ? Number(params.get('strike')) : null);
  const [interval, setInterval] = useState(params.get('interval') || '5minute');
  const [layout,   setLayout]   = useState('vertical');
  const [overlays, setOverlays] = useState({ vwap: false, ema9: true, ema21: true, rsi: false });

  const [allSymbols,  setAllSymbols]  = useState([]);
  const [expiries,    setExpiries]    = useState([]);
  const [strikes,     setStrikes]     = useState([]);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingExp,  setLoadingExp]  = useState(false);
  const [loadingStr,  setLoadingStr]  = useState(false);

  const urlStrikeRef = useRef(params.get('strike') ? Number(params.get('strike')) : null);

  const [chartKey, setChartKey] = useState(
    params.get('symbol') && params.get('expiry') && params.get('strike')
      ? { symbol: params.get('symbol'), expiry: params.get('expiry'), strike: Number(params.get('strike')), interval: params.get('interval') || '5minute' }
      : null
  );

  useEffect(() => {
    fetch('/api/option-meta?action=symbols')
      .then(r => r.json())
      .then(d => { if (d.symbols) setAllSymbols(d.symbols); })
      .catch(() => {})
      .finally(() => setLoadingMeta(false));
  }, []);

  useEffect(() => {
    if (!symbol) return;
    setExpiry(''); setStrike(null); setStrikes([]); setExpiries([]);
    setLoadingExp(true);
    fetch(`/api/option-meta?action=expiries&symbol=${symbol}`)
      .then(r => r.json())
      .then(d => {
        if (d.expiries?.length) {
          setExpiries(d.expiries);
          const urlExp = params.get('expiry');
          setExpiry(d.expiries.find(e => e.date === urlExp) ? urlExp : d.expiries[0].date);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExp(false));
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!symbol || !expiry) return;
    setStrike(null); setStrikes([]);
    setLoadingStr(true);
    Promise.all([
      fetch(`/api/option-meta?action=strikes&symbol=${symbol}&expiry=${expiry}`).then(r => r.json()),
      fetch(`/api/option-meta?action=spot&symbol=${symbol}`).then(r => r.json()).catch(() => ({ ltp: null })),
    ]).then(([sData, spotData]) => {
      const list = sData.strikes || [];
      setStrikes(list);
      if (!list.length) return;
      const urlStrike = urlStrikeRef.current;
      if (urlStrike && list.includes(urlStrike)) { setStrike(urlStrike); urlStrikeRef.current = null; return; }
      const spot = spotData.ltp;
      if (spot) {
        setStrike(list.reduce((p, c) => Math.abs(c - spot) < Math.abs(p - spot) ? c : p));
      } else {
        setStrike(list[Math.floor(list.length / 2)]);
      }
    }).catch(() => {}).finally(() => setLoadingStr(false));
  }, [symbol, expiry]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleLoad() {
    if (!symbol || !expiry || !strike) return;
    const key = { symbol, expiry, strike, interval };
    setChartKey(key);
    const url = new URL(window.location.href);
    Object.entries(key).forEach(([k, v]) => url.searchParams.set(k, v));
    window.history.replaceState({}, '', url.toString());
  }

  const expiryObj = expiries.find(e => e.date === expiry);
  const canLoad   = !loadingMeta && !loadingExp && !loadingStr && symbol && expiry && strike;

  return (
    <div className="h-[100dvh] flex flex-col bg-[#060b14] text-white overflow-hidden">
      <Nav />

      {/* ── Form bar ──────────────────────────────────────────────────────── */}
      <div className="border-b border-[#1e3a5f] bg-[#0a0e1a] shrink-0">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex flex-wrap items-end gap-3">

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Symbol</label>
            {loadingMeta
              ? <div className="w-44 h-9 rounded-lg bg-[#0d1f3c] animate-pulse" />
              : <SymbolCombobox symbols={allSymbols} value={symbol} onChange={setSymbol} />}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Expiry</label>
            {loadingExp
              ? <div className="w-36 h-9 rounded-lg bg-[#0d1f3c] animate-pulse" />
              : (
                <select className="w-36 bg-[#0d1f3c] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  value={expiry} onChange={e => setExpiry(e.target.value)}>
                  {expiries.length === 0 && <option value="">—</option>}
                  {expiries.map(ex => <option key={ex.date} value={ex.date}>{ex.shortLabel}</option>)}
                </select>
              )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Strike</label>
            {loadingStr
              ? <div className="w-28 h-9 rounded-lg bg-[#0d1f3c] animate-pulse" />
              : (
                <select className="w-28 bg-[#0d1f3c] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  value={strike ?? ''} onChange={e => setStrike(Number(e.target.value))}>
                  {strikes.length === 0 && <option value="">—</option>}
                  {strikes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Interval</label>
            <div className="flex rounded-lg overflow-hidden border border-[#1e3a5f]">
              {INTERVALS.map(iv => (
                <button key={iv.value} onClick={() => setInterval(iv.value)}
                  className={`px-3 py-2 text-sm font-mono transition-colors ${interval === iv.value ? 'bg-blue-600 text-white' : 'bg-[#0d1f3c] text-slate-400 hover:bg-[#1e3a5f] hover:text-white'}`}>
                  {iv.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-transparent select-none">·</label>
            <button onClick={handleLoad} disabled={!canLoad}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors">
              Load Charts
            </button>
          </div>

          {expiryObj && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-transparent select-none">·</label>
              <span className={`px-2.5 py-1.5 text-[11px] rounded-md font-mono ${expiryObj.isMonthly ? 'bg-blue-900/40 text-blue-300' : 'bg-amber-900/40 text-amber-300'}`}>
                {expiryObj.isMonthly ? 'Monthly' : 'Weekly'} · {expiryObj.label}
              </span>
            </div>
          )}

          <div className="flex-1 min-w-0" />

          {/* Overlay toggles */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Overlays</label>
            <div className="flex items-center gap-1.5">
              {OVERLAY_BTNS.map(o => (
                <button key={o.key}
                  onClick={() => setOverlays(prev => ({ ...prev, [o.key]: !prev[o.key] }))}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold font-mono border transition-all ${
                    overlays[o.key] ? 'text-white' : 'border-[#1e3a5f] text-slate-500 hover:text-slate-300'
                  }`}
                  style={overlays[o.key] ? { color: o.color, borderColor: o.color, backgroundColor: `${o.color}1a` } : {}}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Layout toggle */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Layout</label>
            <div className="flex rounded-lg overflow-hidden border border-[#1e3a5f]">
              <button onClick={() => setLayout('vertical')} title="Stacked"
                className={`px-2.5 py-2 transition-colors ${layout === 'vertical' ? 'bg-blue-600 text-white' : 'bg-[#0d1f3c] text-slate-400 hover:bg-[#1e3a5f]'}`}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="1" width="12" height="5" rx="1" fill="currentColor" opacity="0.85"/>
                  <rect x="1" y="8" width="12" height="5" rx="1" fill="currentColor" opacity="0.85"/>
                </svg>
              </button>
              <button onClick={() => setLayout('horizontal')} title="Side by side"
                className={`px-2.5 py-2 transition-colors ${layout === 'horizontal' ? 'bg-blue-600 text-white' : 'bg-[#0d1f3c] text-slate-400 hover:bg-[#1e3a5f]'}`}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="1" width="5" height="12" rx="1" fill="currentColor" opacity="0.85"/>
                  <rect x="8" y="1" width="5" height="12" rx="1" fill="currentColor" opacity="0.85"/>
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Chart area — flex-1 fills all remaining viewport height ──────── */}
      <div className="flex-1 min-h-0 px-4 py-3">
        {!chartKey ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-4 opacity-10">📈</div>
              <p className="text-slate-500 text-sm">
                Select symbol, expiry and strike, then click{' '}
                <span className="text-slate-400 font-semibold">Load Charts</span>
              </p>
            </div>
          </div>
        ) : (
          /* flex-col = vertical stacked, flex-row = side by side */
          <div className={`h-full flex gap-3 ${layout === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
            <div className="flex-1 min-h-0 min-w-0">
              <OptionChartPanel
                key={`ce-${chartKey.symbol}-${chartKey.expiry}-${chartKey.strike}-${chartKey.interval}`}
                symbol={chartKey.symbol} strike={chartKey.strike} expiry={chartKey.expiry}
                type="CE" interval={chartKey.interval} overlays={overlays}
              />
            </div>
            <div className="flex-1 min-h-0 min-w-0">
              <OptionChartPanel
                key={`pe-${chartKey.symbol}-${chartKey.expiry}-${chartKey.strike}-${chartKey.interval}`}
                symbol={chartKey.symbol} strike={chartKey.strike} expiry={chartKey.expiry}
                type="PE" interval={chartKey.interval} overlays={overlays}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OptionsChartPage() {
  return (
    <Suspense fallback={<div className="h-[100dvh] bg-[#060b14]" />}>
      <OptionsChartInner />
    </Suspense>
  );
}
