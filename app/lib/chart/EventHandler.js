// ─── EventHandler ─────────────────────────────────────────────────────────────
// Owns all DOM event listeners. Emits clean normalised events to Chart.js.
//
// Events emitted via onEvent(type, data):
//   panX        { dx }              — horizontal drag in CSS pixels
//   panY        { dy }              — vertical drag in CSS pixels
//   zoomX       { factor, centerX } — time zoom, centerX in CSS px
//   zoomY       { factor }          — price zoom
//   reset       {}                  — double-click → fit content + reset price
//   crosshair   { x, y } | null     — mouse position in CSS px, null = hide

export class EventHandler {
  constructor(canvas, vp, onEvent) {
    this._canvas  = canvas;
    this._vp      = vp;
    this._emit    = onEvent;
    this._drag    = { active: false, lastX: 0, lastY: 0 };
    // Touch state
    this._touch   = { active: false, lastX: 0, lastY: 0, lastDist: null, tapTimer: null, tapCount: 0 };
    // Drawing state
    this._drawingTool   = null;  // active tool id or null
    this._drawPoint1    = null;  // first click anchor {x, y} or null

    this._bind('mousedown',  this._onMouseDown);
    this._bind('dblclick',   this._onDblClick);
    this._bind('wheel',      this._onWheel, { passive: false });
    this._bind('mousemove',  this._onCanvasMouseMove);
    this._bind('mouseleave', this._onMouseLeave);
    // Touch events
    this._bind('touchstart', this._onTouchStart, { passive: false });
    this._bind('touchmove',  this._onTouchMove,  { passive: false });
    this._bind('touchend',   this._onTouchEnd,   { passive: false });
    // Global listeners for drag (mouse can leave canvas while dragging)
    this._winBind('mousemove', this._onWindowMouseMove);
    this._winBind('mouseup',   this._onMouseUp);

    canvas.style.cursor = 'crosshair';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  _bind(event, handler, opts) {
    this[`_h_${event}`] = handler.bind(this);
    this._canvas.addEventListener(event, this[`_h_${event}`], opts);
  }

  _winBind(event, handler) {
    this[`_win_h_${event}`] = handler.bind(this);
    window.addEventListener(event, this[`_win_h_${event}`]);
  }

  // CSS pixel coords from a mouse event relative to canvas
  _cssXY(e) {
    const r = this._canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ── Drawing mode API ─────────────────────────────────────────────────────────
  setDrawingMode(tool) {
    this._drawingTool = tool ?? null;
    this._drawPoint1  = null;
    this._canvas.style.cursor = tool ? 'crosshair' : 'crosshair';
  }

  cancelDrawing() {
    this._drawPoint1 = null;
    this._emit('drawing-cancel', {});
  }

  // ── Mouse down — start drag OR place drawing anchor ──────────────────────────
  _onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const { x, y } = this._cssXY(e);

    // ── Drawing mode ──────────────────────────────────────────────────────────
    if (this._drawingTool) {
      const inChart = x >= this._vp.chartLeft && x <= this._vp.chartRight
                   && y >= this._vp.chartTop  && y <= this._vp.chartBottom;
      if (!inChart) return;

      const singlePoint = this._drawingTool === 'horizontal_line'
                       || this._drawingTool === 'vertical_line';
      if (singlePoint) {
        // Single-click tools — complete immediately
        this._emit('drawing-done', { tool: this._drawingTool, p1: { x, y }, p2: { x, y } });
      } else if (!this._drawPoint1) {
        // First click — set anchor, live preview begins on mousemove
        this._drawPoint1 = { x, y };
      } else {
        // Second click — finalise
        this._emit('drawing-done', { tool: this._drawingTool, p1: this._drawPoint1, p2: { x, y } });
        this._drawPoint1 = null;
      }
      return; // never start a pan while drawing tool is active
    }

    // ── Normal pan ────────────────────────────────────────────────────────────
    this._drag.active = true;
    this._drag.lastX  = x;
    this._drag.lastY  = y;
    this._canvas.style.cursor = 'grabbing';
  }

  // ── Mouse move on window — drive drag ───────────────────────────────────────
  _onWindowMouseMove(e) {
    if (!this._drag.active) return;
    const { x, y } = this._cssXY(e);
    const dx = x - this._drag.lastX;
    const dy = y - this._drag.lastY;
    this._drag.lastX = x;
    this._drag.lastY = y;
    if (dx !== 0) this._emit('panX', { dx });
    if (dy !== 0) this._emit('panY', { dy });
  }

  // ── Mouse up — end drag ──────────────────────────────────────────────────────
  _onMouseUp() {
    if (!this._drag.active) return;
    this._drag.active = false;
    this._canvas.style.cursor = 'crosshair';
  }

  // ── Mouse move on canvas — crosshair + drawing preview ──────────────────────
  _onCanvasMouseMove(e) {
    const { x, y } = this._cssXY(e);
    const inChart = x >= this._vp.chartLeft && x <= this._vp.chartRight
                 && y >= this._vp.chartTop  && y <= this._vp.chartBottom;
    this._emit('crosshair', inChart ? { x, y } : null);

    // Live preview of in-progress two-point drawing
    if (this._drawingTool && this._drawPoint1 && inChart) {
      this._emit('drawing-preview', { tool: this._drawingTool, p1: this._drawPoint1, p2: { x, y } });
    }
  }

  // ── Mouse leave canvas — hide crosshair ──────────────────────────────────────
  _onMouseLeave() {
    if (!this._drag.active) this._emit('crosshair', null);
  }

  // ── Wheel — zoom time or price ───────────────────────────────────────────────
  _onWheel(e) {
    e.preventDefault();
    const { x } = this._cssXY(e);
    const isOnPriceAxis = x > this._vp.chartRight;
    // Normalise delta: trackpad sends small fractional deltas, mouse sends 100+
    const raw    = e.deltaY;
    const factor = raw > 0 ? 1.08 : 0.92;

    if (isOnPriceAxis) {
      this._emit('zoomY', { factor });
    } else {
      this._emit('zoomX', { factor, centerX: x });
    }
  }

  // ── Double-click — reset view ────────────────────────────────────────────────
  _onDblClick() {
    this._emit('reset', {});
  }

  // ── Touch helpers ────────────────────────────────────────────────────────────
  _touchXY(touch) {
    const r = this._canvas.getBoundingClientRect();
    return { x: touch.clientX - r.left, y: touch.clientY - r.top };
  }

  _pinchDist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── Touch start ──────────────────────────────────────────────────────────────
  _onTouchStart(e) {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1) {
      // Single finger — start pan + track for double-tap reset
      const { x, y } = this._touchXY(touches[0]);
      this._touch.active = true;
      this._touch.lastX  = x;
      this._touch.lastY  = y;
      this._touch.lastDist = null;

      // Double-tap detection
      this._touch.tapCount++;
      if (this._touch.tapCount === 2) {
        this._touch.tapCount = 0;
        clearTimeout(this._touch.tapTimer);
        this._emit('reset', {});
        return;
      }
      clearTimeout(this._touch.tapTimer);
      this._touch.tapTimer = setTimeout(() => { this._touch.tapCount = 0; }, 350);

    } else if (touches.length === 2) {
      // Two fingers — start pinch zoom
      this._touch.active = false; // stop panning while pinching
      this._touch.lastDist = this._pinchDist(touches[0], touches[1]);
      // center of pinch for zoomX
      const r = this._canvas.getBoundingClientRect();
      this._touch.pinchCenterX = (touches[0].clientX + touches[1].clientX) / 2 - r.left;
    }
  }

  // ── Touch move ───────────────────────────────────────────────────────────────
  _onTouchMove(e) {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1 && this._touch.active) {
      // Pan
      const { x, y } = this._touchXY(touches[0]);
      const dx = x - this._touch.lastX;
      const dy = y - this._touch.lastY;
      this._touch.lastX = x;
      this._touch.lastY = y;
      if (dx !== 0) this._emit('panX', { dx });
      if (dy !== 0) this._emit('panY', { dy });

    } else if (touches.length === 2 && this._touch.lastDist !== null) {
      // Pinch zoom
      const dist = this._pinchDist(touches[0], touches[1]);
      if (this._touch.lastDist > 0) {
        const factor = this._touch.lastDist / dist; // pinch in = factor > 1 = zoom out
        this._emit('zoomX', { factor, centerX: this._touch.pinchCenterX });
      }
      this._touch.lastDist = dist;
    }
  }

  // ── Touch end ────────────────────────────────────────────────────────────────
  _onTouchEnd(e) {
    e.preventDefault();
    if (e.touches.length === 0) {
      this._touch.active   = false;
      this._touch.lastDist = null;
    } else if (e.touches.length === 1) {
      // One finger lifted during pinch — resume single-finger pan
      const { x, y } = this._touchXY(e.touches[0]);
      this._touch.active = true;
      this._touch.lastX  = x;
      this._touch.lastY  = y;
      this._touch.lastDist = null;
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  destroy() {
    const c = this._canvas;
    c.removeEventListener('mousedown',  this._h_mousedown);
    c.removeEventListener('dblclick',   this._h_dblclick);
    c.removeEventListener('wheel',      this._h_wheel);
    c.removeEventListener('mousemove',  this._h_mousemove);
    c.removeEventListener('mouseleave', this._h_mouseleave);
    c.removeEventListener('touchstart', this._h_touchstart);
    c.removeEventListener('touchmove',  this._h_touchmove);
    c.removeEventListener('touchend',   this._h_touchend);
    window.removeEventListener('mousemove', this._win_h_mousemove);
    window.removeEventListener('mouseup',   this._win_h_mouseup);
    clearTimeout(this._touch.tapTimer);
  }
}
