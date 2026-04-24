'use client';

import { useEffect, useRef } from 'react';

// ── Market hours helper (9:15 AM – 4:00 PM IST, Mon–Fri) ─────────────────────
function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 555 && mins <= 960; // 9:15 AM – 4:00 PM IST
}

// ── Candle refresh rates per interval ────────────────────────────────────────
// LTP tick always fires every 5s regardless of interval.
// Full candle refresh (chart-data) fires at these rates.
// 'day' and 'week' have no auto-refresh — charts don't live-update for those.
const CANDLE_REFRESH_MS = {
  'minute':   30_000,
  '5minute':  30_000,
  '15minute': 60_000,
  '60minute': 180_000,
};

/**
 * useChartRefresh  ―  Phase 1 Central Chart Refresh Manager
 *
 * Centralises the two refresh timers shared across all chart pages so
 * they always behave consistently. Chart creation, overlay logic, and React
 * state all remain in the calling page (Phase 2 concern).
 *
 * Timer 1 — 5s LTP tick via /api/quotes
 *   • Fires every 5s on all intraday intervals.
 *   • Calls chartRef.current.updateTick(ltp) — mutates last candle close/high/low
 *     in-place. Zero overlay re-indexing, zero viewport movement, zero flicker.
 *
 * Timer 2 — 30s full candle refresh via /api/chart-data
 *   • Fires at interval-appropriate rate (see CANDLE_REFRESH_MS above).
 *   • Only fires during market hours (9:15–4:00 IST, Mon–Fri).
 *   • Fetches with bust=1 to bypass Redis cache.
 *   • Calls chartRef.current.updateCandles(newCandles) — preserves viewport.
 *     Overlays re-index only when candle count grows (new bar opened).
 *   • Calls onRefreshed(newCandles) so the page can update any React state
 *     that derives from candles (e.g. displayed LTP, spot price).
 *
 * Both timers guard `if (!chartRef.current) return` inside their callback
 * (not at effect level) so they survive async chart initialisation.
 *
 * @param {string}   symbol       Trading symbol (NIFTY, NIFTY2640722600BCE, etc.)
 * @param {string}   interval     Chart interval: minute|5minute|15minute|60minute|day|week
 * @param {object}   chartRef     React ref pointing at the live chart instance
 * @param {object}   candlesRef   React ref pointing at the current candle array
 * @param {function} [onRefreshed] Called with (newCandles) after each 30s candle refresh
 * @param {function} [onTick]      Called with (ltp) after each 5s price tick
 */
export function useChartRefresh({ symbol, interval, chartRef, candlesRef, onRefreshed, onTick }) {
  // Keep the callback stable — callers may inline-define it each render
  const onRefreshedRef = useRef(onRefreshed);
  const onTickRef      = useRef(onTick);
  useEffect(() => { 
    onRefreshedRef.current = onRefreshed; 
    onTickRef.current      = onTick;
  }, [onRefreshed, onTick]);

  // ── Timer 1: 5s LTP tick via /api/quotes ─────────────────────────────────
  useEffect(() => {
    const isIntraday = interval !== 'day' && interval !== 'week';
    if (!symbol || !isIntraday) return;

    const tick = async () => {
      if (!chartRef.current) return; // chart not yet initialised — skip this tick
      try {
        const res  = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
        const data = await res.json();
        const ltp  = data.quotes?.[0]?.ltp;
        if (ltp != null) {
          chartRef.current.updateTick(ltp);
          onTickRef.current?.(ltp);
        }
      } catch { /* non-fatal — next tick will retry */ }
    };

    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [symbol, interval]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer 2: 30s full candle refresh via /api/chart-data ─────────────────
  useEffect(() => {
    const refreshMs = CANDLE_REFRESH_MS[interval];
    if (!symbol || refreshMs == null) return; // 'day' / 'week' → no auto-refresh

    const refresh = async () => {
      if (!chartRef.current || !isMarketHours()) return;
      try {
        const res = await fetch(
          `/api/chart-data?symbol=${encodeURIComponent(symbol)}&interval=${interval}&bust=1`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const data = await res.json();
        const newCandles = data.candles;
        if (!newCandles?.length || !chartRef.current) return;

        candlesRef.current = newCandles;
        chartRef.current.updateCandles(newCandles);
        onRefreshedRef.current?.(newCandles);
      } catch { /* non-fatal — next tick will retry */ }
    };

    const id = setInterval(refresh, refreshMs);
    return () => clearInterval(id);
  }, [symbol, interval]); // eslint-disable-line react-hooks/exhaustive-deps
}
