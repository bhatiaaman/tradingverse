// ─── Chart.js ─────────────────────────────────────────────────────────────────
// Public facade. Creates a <canvas>, owns the RAF render loop, coordinates all
// renderers, and exposes a clean API for trades/page.js.
//
// Usage:
//   const chart = createChart(containerEl, { interval: '15minute' })
//   chart.setCandles(candles)
//   chart.setLine('ema9', { data: [{time, value}], color: '#f59e0b', width: 1.5 })
//   chart.setZone({ id: 'ceiling', price, color, label, style: 'dashed' })
//   chart.clearZone('ceiling')
//   chart.onCrosshairMove(({ bar, x, y }) => { ... })   // bar = null when hidden
//   chart.fitContent()
//   chart.destroy()

import { Viewport }          from './Viewport.js';
import { EventHandler }      from './EventHandler.js';
import { renderCandles }     from './renderers/candles.js';
import { renderAxes }        from './renderers/axes.js';
import { renderLine }        from './renderers/lines.js';
import { renderZones }       from './renderers/zones.js';
import { renderVolume }      from './renderers/volume.js';
import { renderCrosshair }   from './renderers/crosshair.js';
import { renderMarkers }     from './renderers/markers.js';
import { renderSMC }        from './renderers/smc.js';
import { renderCPR }        from './renderers/cpr.js';
import { renderRSIPane }    from './renderers/rsi-pane.js';
import { renderDrawings }   from './renderers/drawings.js';
import { DARK as DARK_PALETTE, LIGHT as LIGHT_PALETTE } from './palette.js';

export function createChart(container, options = {}) {
  const interval = options.interval ?? '15minute';
  let palette    = options.theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;

  // ── Canvas ───────────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;';
  container.style.position = 'relative';
  container.appendChild(canvas);

  const dpr = window.devicePixelRatio || 1;
  let W = container.clientWidth  || 800;
  let H = container.clientHeight || 400;

  // pendingW/H: set by ResizeObserver; applied atomically inside the render loop
  // so canvas clear + redraw happen in the same RAF tick (no one-frame flash).
  let pendingW = null;
  let pendingH = null;

  function resizeCanvas() {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const ctx = canvas.getContext('2d');
  resizeCanvas();

  // ── State ────────────────────────────────────────────────────────────────────
  const vp          = new Viewport(W, H);
  let   candles     = [];
  let   timeIndex   = new Map();          // unix timestamp → candle index
  const lineMap     = new Map();          // id → { values: number[], color, width }
  let   zones       = [];                 // [{ id, price, color, label, style }]
  let   smcData     = null;               // { bosLevels, orderBlocks, fvgs }
  let   cprData     = null;               // { tc, p, bc, r1, r2, s1, s2 }
  let   markers     = [];                 // [{ index, direction: 'bull'|'bear' }]
  let   rsiPaneData = null;              // { rsi: number[], rsiMA: number[]|null, label: string }
  let   showVolume    = options.showVolume ?? true;
  let   drawings         = [];           // [{ id, type, p1, p2, color, width }]
  let   drawingInProgress = null;        // preview drawing while placing second point
  let   drawingCb        = null;         // onDrawingComplete callback
  let   selectedDrawingId = null;        // currently selected drawing id
  let   drawingSelectCb  = null;         // onDrawingSelect callback
  let   candleColors  = { bull: '#22c55e', bear: '#ef4444' };
  let   crosshair   = { visible: false };
  let   crosshairCb      = null;
  let   lastPriceYCb     = null;
  let   lastEmittedPriceY = undefined;
  let   viewportCb       = null;
  let   lastEmittedAtEnd  = undefined;
  let   dirty       = true;
  let   rafId       = null;
  let   destroyed   = false;

  // ── Render loop ──────────────────────────────────────────────────────────────
  function render() {
    if (destroyed) return;
    rafId = requestAnimationFrame(render);
    if (!dirty) return;
    dirty = false;

    // Apply pending resize atomically — canvas clear + full redraw in the same tick.
    // This prevents the one-frame blank-canvas flash that would occur if resizeCanvas()
    // ran in a separate RAF callback (old ResizeObserver approach).
    if (pendingW !== null) {
      W = pendingW; H = pendingH;
      pendingW = null; pendingH = null;
      vp.resize(W, H);
      resizeCanvas();
    }

    // Clear
    ctx.fillStyle = palette.chartBg;
    ctx.fillRect(0, 0, W, H);

    // Recompute price scale from current viewport + data every frame
    vp.autoScale(candles);

    // Draw order: grid/axes → volume → SMC → CPR → zones → lines → candles → drawings → RSI pane → crosshair
    renderAxes(ctx, vp, candles, interval, palette);
    if (showVolume) renderVolume(ctx, vp, candles);
    if (smcData)   renderSMC(ctx, vp, smcData, palette);
    if (cprData)   renderCPR(ctx, vp, cprData, crosshair);
    renderZones(ctx, vp, zones, crosshair);
    for (const [, line] of lineMap) {
      renderLine(ctx, vp, line.values, line.color, line.width);
    }
    renderCandles(ctx, vp, candles, candleColors);
    renderMarkers(ctx, vp, candles, markers);
    if (drawings.length || drawingInProgress) {
      const resolved = drawings.map(d => ({ ..._resolveDrawing(d), selected: d.id === selectedDrawingId }));
      renderDrawings(ctx, vp, resolved, drawingInProgress ? _resolveDrawing(drawingInProgress) : null);
    }
    if (rsiPaneData && vp.rsiPaneH > 0) {
      const snapIdx = crosshair.visible ? crosshair.snapIndex : null;
      renderRSIPane(ctx, vp, rsiPaneData.rsi, rsiPaneData.rsiMA, snapIdx, rsiPaneData.label, palette);
    }
    renderCrosshair(ctx, vp, crosshair, candles, interval);

    // Emit last-price Y for overlay button positioning — only when value changes
    if (lastPriceYCb && candles.length) {
      const lY   = vp.priceToY(candles[candles.length - 1].close);
      const emit = (lY >= vp.chartTop && lY <= vp.chartBottom) ? Math.round(lY) : null;
      if (emit !== lastEmittedPriceY) { lastEmittedPriceY = emit; lastPriceYCb(emit); }
    }

    // Emit whether viewport is at the right (latest) edge — for scroll-to-end button
    if (viewportCb && candles.length) {
      const atEnd = vp.logTo >= candles.length - 2;
      if (atEnd !== lastEmittedAtEnd) { lastEmittedAtEnd = atEnd; viewportCb({ atEnd }); }
    }
  }

  function markDirty() { dirty = true; }

  // ── Events ───────────────────────────────────────────────────────────────────
  const handler = new EventHandler(canvas, vp, (type, data) => {
    switch (type) {

      case 'panX':
        vp.panX(data.dx, candles);
        markDirty();
        break;

      case 'panY':
        vp.panY(data.dy);
        markDirty();
        break;

      case 'zoomX':
        vp.zoomX(data.factor, data.centerX, candles);
        markDirty();
        break;

      case 'zoomY':
        vp.zoomY(data.factor);
        markDirty();
        break;

      case 'reset': {
        const defaultBars = { '1minute': 390, '5minute': 234, '15minute': 104, '60minute': 150 }[interval];
        if (defaultBars) vp.fitRecent(candles, defaultBars);
        else             vp.fitContent(candles);
        markDirty();
        break;
      }

      case 'drawing-preview': {
        const { p1, p2 } = data;
        drawingInProgress = {
          type: data.tool, color: '#3b82f6', width: 1.5, preview: true,
          p1: _canvasToPoint(p1.x, p1.y),
          p2: _canvasToPoint(p2.x, p2.y),
        };
        markDirty();
        break;
      }

      case 'drawing-done': {
        const { p1, p2 } = data;
        const d = {
          id:    `d_${Date.now()}`,
          type:  data.tool,
          color: '#3b82f6',
          width: 1.5,
          p1:    _canvasToPoint(p1.x, p1.y),
          p2:    _canvasToPoint(p2.x, p2.y),
        };
        drawings = [...drawings, d];
        drawingInProgress = null;
        drawingCb?.(d, drawings);
        markDirty();
        break;
      }

      case 'drawing-cancel': {
        drawingInProgress = null;
        markDirty();
        break;
      }

      case 'click': {
        // Hit-test drawings to select/deselect — only in cursor mode (no active tool)
        const { x, y } = data;
        const HIT_PX = 8;
        let hit = null;
        for (let i = drawings.length - 1; i >= 0; i--) {
          if (_hitTest(drawings[i], x, y, HIT_PX)) { hit = drawings[i].id; break; }
        }
        if (hit !== selectedDrawingId) {
          selectedDrawingId = hit;
          drawingSelectCb?.(selectedDrawingId);
          markDirty();
        }
        break;
      }

      case 'crosshair': {
        if (!data) {
          crosshair = { visible: false };
          markDirty();
          crosshairCb?.(null);
          break;
        }
        const { x, y } = data;
        const floatIdx = vp.xToIndex(x);
        const snapIdx  = Math.round(floatIdx);
        const clamped  = Math.max(0, Math.min((candles.length || 1) - 1, snapIdx));
        crosshair = { visible: true, x, y, snapIndex: clamped };
        markDirty();
        if (crosshairCb && candles.length) {
          // Collect current value of every registered line at this bar index
          const lineValues = {};
          for (const [id, line] of lineMap) {
            lineValues[id] = line.values[clamped] ?? null;
          }
          crosshairCb({ bar: candles[clamped], x, y, lineValues, index: clamped });
        }
        break;
      }
    }
  });

  // ── Resize observer ──────────────────────────────────────────────────────────
  // Just captures the new dimensions; actual resize happens inside render() so the
  // canvas clear and redraw are atomic within one RAF tick (no flash).
  const ro = new ResizeObserver(() => {
    pendingW = container.clientWidth  || 800;
    pendingH = container.clientHeight || 400;
    markDirty();
  });
  ro.observe(container);

  // Start render loop
  rafId = requestAnimationFrame(render);

  // ── Public API ───────────────────────────────────────────────────────────────
  return {

    // Set or replace the full candle dataset — resets viewport to fit all content.
    // Use only on initial load or symbol/interval change.
    setCandles(data) {
      candles   = data ?? [];
      timeIndex = new Map(candles.map((c, i) => [c.time, i]));
      for (const [id, line] of lineMap) {
        lineMap.set(id, { ...line, values: _reindex(line._raw) });
      }
      markers = markers.map(m => ({ ...m, index: timeIndex.get(m.time) ?? -1 })).filter(m => m.index >= 0);
      vp.fitContent(candles);
      markDirty();
    },

    // Refresh candle data WITHOUT resetting the viewport (preserves user pan/zoom).
    // Use for periodic auto-refresh. If new candles were appended and the user
    // was already viewing the latest bars, the view slides forward by the delta.
    updateCandles(data) {
      const prevLen = candles.length;
      candles   = data ?? [];
      timeIndex = new Map(candles.map((c, i) => [c.time, i]));
      for (const [id, line] of lineMap) {
        lineMap.set(id, { ...line, values: _reindex(line._raw) });
      }
      markers = markers.map(m => ({ ...m, index: timeIndex.get(m.time) ?? -1 })).filter(m => m.index >= 0);
      // If new candles appended and the right edge was already in view, slide forward
      if (candles.length > prevLen && vp.logTo >= prevLen - 2) {
        const delta = candles.length - prevLen;
        vp.logFrom += delta;
        vp.logTo   += delta;
      }
      // Guard: if viewport is completely outside the new data (e.g. after an interval
      // switch where recreation used old-TF candles), reset to a sensible window.
      if (vp.logFrom >= candles.length || vp.logTo <= 0) {
        const defaultBars = { '1minute': 390, '5minute': 234, '15minute': 104, '60minute': 150 }[interval];
        if (defaultBars) vp.fitRecent(candles, defaultBars);
        else             vp.fitContent(candles);
      }
      markDirty();
    },

    // Set power-candle markers. data: [{ time, direction: 'bull'|'bear' }]
    setMarkers(data) {
      if (!data?.length) { markers = []; markDirty(); return; }
      markers = data
        .map(m => ({ ...m, index: timeIndex.get(m.time) ?? -1 }))
        .filter(m => m.index >= 0);
      markDirty();
    },

    // Add or update a line series.
    // data: [{time, value}]  (same format used by LWC line series)
    setLine(id, { data, color, width = 1.5 }) {
      if (!data?.length) { lineMap.delete(id); markDirty(); return; }
      const values = _reindex(data);
      lineMap.set(id, { _raw: data, values, color, width });
      markDirty();
    },

    clearLine(id) {
      lineMap.delete(id);
      markDirty();
    },

    // Add or update a horizontal zone line.
    setZone(zone) {
      zones = zones.filter(z => z.id !== zone.id);
      zones.push(zone);
      markDirty();
    },

    clearZone(id) {
      zones = zones.filter(z => z.id !== id);
      markDirty();
    },

    clearAllZones() {
      zones = [];
      markDirty();
    },

    clearZonesWithPrefix(prefix) {
      zones = zones.filter(z => !z.id.startsWith(prefix));
      markDirty();
    },

    setSMC(data) {
      smcData = data ?? null;
      markDirty();
    },

    clearSMC() {
      smcData = null;
      markDirty();
    },

    setCPR(data) {
      cprData = data ?? null;
      markDirty();
    },

    clearCPR() {
      cprData = null;
      markDirty();
    },

    // ── RSI sub-pane ────────────────────────────────────────────────────────────
    // rsi: number[] aligned to candles (nulls allowed); rsiMA: number[]|null; label: e.g. 'RSI(12)'
    setRSIPane(rsi, rsiMA = null, label = 'RSI') {
      rsiPaneData = { rsi: rsi ?? [], rsiMA: rsiMA ?? null, label };
      markDirty();
    },

    clearRSIPane() {
      rsiPaneData = null;
      vp.rsiPaneH = 0;
      markDirty();
    },

    // Adjusts the RSI sub-pane height (0 = hidden). No canvas resize — just recalculates
    // chartBottom via the Viewport getter, so the chart area shrinks/grows automatically.
    setRSIPaneHeight(h) {
      vp.rsiPaneH = Math.max(0, h | 0);
      markDirty();
    },

    // Update the last candle with a live LTP tick — mutates close/high/low in-place.
    // Used for real-time price feed without a full data refetch.
    updateTick(ltp) {
      if (!candles.length || ltp == null) return;
      const last = candles[candles.length - 1];
      last.close = ltp;
      if (ltp > last.high) last.high = ltp;
      if (ltp < last.low)  last.low  = ltp;
      markDirty();
    },

    setCandleColors({ bull, bear } = {}) {
      candleColors = { bull: bull || '#22c55e', bear: bear || '#ef4444' };
      markDirty();
    },

    setShowVolume(v) {
      showVolume = !!v;
      markDirty();
    },

    // Register crosshair move callback.
    // Called with { bar, x, y } on hover, null when crosshair leaves chart.
    onCrosshairMove(cb) {
      crosshairCb = cb;
    },

    // Register last-price Y callback. Called with the integer pixel Y of the last-close
    // price pill whenever it changes (null when price is scrolled out of view).
    // Use this to position an order-entry button overlay aligned to the price axis.
    onLastPriceY(cb) {
      lastPriceYCb = cb;
      markDirty(); // force a render so the callback fires immediately with current position
    },

    // Synchronously read the current last-price Y pixel (null if out of view or no candles).
    // Use as a fallback if the callback hasn't fired yet.
    getLastPriceY() {
      if (!candles.length) return null;
      const lY = vp.priceToY(candles[candles.length - 1].close);
      return (lY >= vp.chartTop && lY <= vp.chartBottom) ? Math.round(lY) : null;
    },

    // Programmatically position crosshair at a bar index (synced chart — vertical line only).
    // Does NOT fire the crosshair callback to avoid sync loops.
    setCrosshairAt(idx) {
      if (idx == null || !candles.length) {
        crosshair = { visible: false };
        markDirty();
        return;
      }
      const clamped = Math.max(0, Math.min(candles.length - 1, idx));
      crosshair = { visible: true, x: vp.barCenterX(clamped), y: H / 2, snapIndex: clamped, syncedOnly: true };
      markDirty();
    },

    clearCrosshair() {
      crosshair = { visible: false };
      markDirty();
    },

    fitContent() {
      vp.fitContent(candles);
      markDirty();
    },

    fitRecent(n) {
      vp.fitRecent(candles, n);
      markDirty();
    },

    // Scroll to the latest bars preserving current zoom level (like TV's ►► button)
    scrollToEnd() {
      const len = vp.logTo - vp.logFrom;
      vp.logTo   = candles.length;
      vp.logFrom = candles.length - len;
      markDirty();
    },

    onViewportChange(cb) {
      viewportCb = cb;
    },

    setTheme(t) {
      palette = t === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
      markDirty();
    },

    // Change interval for time-axis formatting without re-creating the chart.
    setInterval(iv) {
      // interval is captured by closure; reassign via the module-level variable
      // Not possible directly — interval is a const param. Caller should destroy+recreate
      // if interval changes. This is consistent with LWC's behaviour.
    },

    // ── Drawing tools ────────────────────────────────────────────────────────────
    // Activate a drawing tool. Pass null to return to pan/crosshair mode.
    setActiveTool(tool) {
      handler.setDrawingMode(tool ?? null);
      if (!tool) { drawingInProgress = null; markDirty(); }
    },

    // Cancel the current in-progress drawing (e.g. on Escape) without changing tool.
    cancelDrawing() {
      handler.cancelDrawing();
    },

    // Replace all drawings — use on symbol/interval change to load saved drawings.
    setDrawings(data) {
      drawings = Array.isArray(data) ? data : [];
      drawingInProgress = null;
      selectedDrawingId = null;
      markDirty();
    },

    getDrawings() { return drawings; },

    deleteDrawing(id) {
      drawings = drawings.filter(d => d.id !== id);
      if (selectedDrawingId === id) { selectedDrawingId = null; drawingSelectCb?.(null); }
      drawingCb?.(null, drawings);
      markDirty();
    },

    clearDrawings() {
      drawings = [];
      drawingInProgress = null;
      selectedDrawingId = null;
      drawingSelectCb?.(null);
      drawingCb?.(null, []);
      markDirty();
    },

    deselectDrawing() {
      selectedDrawingId = null;
      drawingSelectCb?.(null);
      markDirty();
    },

    // Called with (newDrawing|null, allDrawings) after placement or deletion.
    onDrawingComplete(cb) { drawingCb = cb; },

    // Called with (selectedId | null) when selection changes.
    onDrawingSelect(cb) { drawingSelectCb = cb; },

    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      handler.destroy();
      ro.disconnect();
      canvas.remove();
    },
  };

  // ── Internal helpers ─────────────────────────────────────────────────────────

  // Convert {time, value}[] to a number[] aligned to the current candles array.
  // Entries without a matching candle time are left as null.
  function _reindex(rawData) {
    if (!rawData?.length || !candles.length) return [];
    const out = new Array(candles.length).fill(null);
    for (const pt of rawData) {
      const i = timeIndex.get(pt.time);
      if (i != null) out[i] = pt.value;
    }
    return out;
  }

  // Point-to-segment distance
  function _distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  // Extend ray from (x1,y1) through (x2,y2) to chart boundary
  function _extendRay(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return { ex: x2, ey: y2 };
    let t = Infinity;
    if (dx > 0.001)  t = Math.min(t, (vp.chartRight  - x1) / dx);
    if (dx < -0.001) t = Math.min(t, (vp.chartLeft   - x1) / dx);
    if (dy > 0.001)  t = Math.min(t, (vp.chartBottom - y1) / dy);
    if (dy < -0.001) t = Math.min(t, (vp.chartTop    - y1) / dy);
    return isFinite(t) ? { ex: x1 + dx * t, ey: y1 + dy * t } : { ex: x2, ey: y2 };
  }

  // Hit-test a drawing against a canvas click point (CSS px). Returns true if within threshold.
  function _hitTest(d, cx, cy, threshold) {
    if (!d.p1) return false;
    const r = _resolveDrawing(d);
    const { p1, p2 } = r;
    switch (d.type) {
      case 'horizontal_line':
        return Math.abs(cy - vp.priceToY(p1.price)) <= threshold;
      case 'vertical_line':
        return Math.abs(cx - vp.barCenterX(p1.barIndex)) <= threshold;
      case 'trend_line': {
        if (!p2) return false;
        const x1 = vp.barCenterX(p1.barIndex), y1 = vp.priceToY(p1.price);
        const x2 = vp.barCenterX(p2.barIndex), y2 = vp.priceToY(p2.price);
        return _distToSegment(cx, cy, x1, y1, x2, y2) <= threshold;
      }
      case 'ray': {
        if (!p2) return false;
        const x1 = vp.barCenterX(p1.barIndex), y1 = vp.priceToY(p1.price);
        const x2 = vp.barCenterX(p2.barIndex), y2 = vp.priceToY(p2.price);
        const { ex, ey } = _extendRay(x1, y1, x2, y2);
        return _distToSegment(cx, cy, x1, y1, ex, ey) <= threshold;
      }
    }
    return false;
  }

  // Convert canvas (CSS px) coordinates to a drawing point { barIndex, time, price }.
  function _canvasToPoint(x, y) {
    const idx       = vp.xToIndex(x);
    const barIndex  = Math.round(Math.max(0, Math.min((candles.length || 1) - 1, idx)));
    return { barIndex, time: candles[barIndex]?.time ?? null, price: vp.yToPrice(y) };
  }

  // Resolve a stored drawing's barIndex from its canonical `time` field.
  // This ensures drawings remain anchored to the right candle if the array grows.
  function _resolveDrawing(d) {
    const resolvePoint = p => {
      if (!p) return p;
      const idx = p.time ? (timeIndex.get(p.time) ?? p.barIndex) : p.barIndex;
      return { ...p, barIndex: Math.max(0, Math.min((candles.length || 1) - 1, idx ?? 0)) };
    };
    return { ...d, p1: resolvePoint(d.p1), p2: d.p2 ? resolvePoint(d.p2) : null };
  }
}
