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

export function createChart(container, options = {}) {
  const interval = options.interval ?? '15minute';

  // ── Canvas ───────────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;';
  container.style.position = 'relative';
  container.appendChild(canvas);

  const dpr = window.devicePixelRatio || 1;
  let W = container.clientWidth  || 800;
  let H = container.clientHeight || 400;

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
  let   markers     = [];                 // [{ index, direction: 'bull'|'bear' }]
  let   showVolume  = options.showVolume ?? true;
  let   crosshair   = { visible: false };
  let   crosshairCb = null;
  let   dirty       = true;
  let   rafId       = null;
  let   destroyed   = false;

  // ── Render loop ──────────────────────────────────────────────────────────────
  function render() {
    if (destroyed) return;
    rafId = requestAnimationFrame(render);
    if (!dirty) return;
    dirty = false;

    // Clear
    ctx.fillStyle = '#112240';
    ctx.fillRect(0, 0, W, H);

    // Recompute price scale from current viewport + data every frame
    vp.autoScale(candles);

    // Draw order: grid/axes → volume → SMC → zones → lines → candles → crosshair
    renderAxes(ctx, vp, candles, interval);
    if (showVolume) renderVolume(ctx, vp, candles);
    if (smcData)   renderSMC(ctx, vp, smcData);
    renderZones(ctx, vp, zones, crosshair);
    for (const [, line] of lineMap) {
      renderLine(ctx, vp, line.values, line.color, line.width);
    }
    renderCandles(ctx, vp, candles);
    renderMarkers(ctx, vp, candles, markers);
    renderCrosshair(ctx, vp, crosshair, candles, interval);
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

      case 'reset':
        vp.fitContent(candles);
        markDirty();
        break;

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
  // RAF-debounced so rapid resizes (drag) only trigger one canvas resize per frame.
  let resizeRafId = null;
  const ro = new ResizeObserver(() => {
    if (resizeRafId !== null) return;
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = null;
      W = container.clientWidth  || 800;
      H = container.clientHeight || 400;
      vp.resize(W, H);
      resizeCanvas();
      markDirty();
    });
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

    setSMC(data) {
      smcData = data ?? null;
      markDirty();
    },

    clearSMC() {
      smcData = null;
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

    setShowVolume(v) {
      showVolume = !!v;
      markDirty();
    },

    // Register crosshair move callback.
    // Called with { bar, x, y } on hover, null when crosshair leaves chart.
    onCrosshairMove(cb) {
      crosshairCb = cb;
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

    // Change interval for time-axis formatting without re-creating the chart.
    setInterval(iv) {
      // interval is captured by closure; reassign via the module-level variable
      // Not possible directly — interval is a const param. Caller should destroy+recreate
      // if interval changes. This is consistent with LWC's behaviour.
    },

    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
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
}
