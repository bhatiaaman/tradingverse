// ─── Viewport ────────────────────────────────────────────────────────────────
// Owns the coordinate system. All renderers and the event handler talk to this.
//
// Logical x = bar index (float). Logical y = price.
// CSS pixels used throughout — DPR scaling is applied once on the canvas context.

export class Viewport {
  constructor(width, height) {
    this.PRICE_AXIS_W = 74;
    this.TIME_AXIS_H  = 28;
    this.PAD_TOP      = 10;
    this.PAD_LEFT     = 0;
    this.rsiPaneH     = 0; // height of RSI sub-pane; 0 = hidden

    this.width  = width;
    this.height = height;

    // Visible bar index range (float — allows fractional scroll)
    this.logFrom = 0;
    this.logTo   = 100;

    // Price range — derived by autoScale() then adjusted by zoom/shift
    this._rawMin = 0;
    this._rawMax = 1;
    this.priceMin = 0;
    this.priceMax = 1;

    // Vertical interaction state
    this.priceShift = 0;   // price units — positive shifts range down, negative up
    this.priceZoom  = 1.0; // > 1 = zoomed out (more range visible), < 1 = zoomed in
  }

  resize(w, h) {
    this.width  = w;
    this.height = h;
  }

  // ── Chart drawing area (excludes axes + RSI sub-pane) ───────────────────────
  get chartLeft()   { return this.PAD_LEFT; }
  get chartRight()  { return this.width - this.PRICE_AXIS_W; }
  get chartTop()    { return this.PAD_TOP; }
  get chartBottom() { return this.height - this.TIME_AXIS_H - this.rsiPaneH; }
  get chartW()      { return this.chartRight - this.chartLeft; }
  get chartH()      { return this.chartBottom - this.chartTop; }

  // RSI sub-pane bounds (between main chart and time axis)
  get rsiPaneTop()   { return this.height - this.TIME_AXIS_H - this.rsiPaneH; }
  get rsiPaneBot()   { return this.height - this.TIME_AXIS_H; }

  // Top of the time axis — always at the very bottom, below any sub-panes
  get timeAxisTop()  { return this.height - this.TIME_AXIS_H; }

  // Width of one bar in pixels
  get barW() {
    const n = this.logTo - this.logFrom;
    return n > 0 ? this.chartW / n : 10;
  }

  // ── Coordinate transforms ────────────────────────────────────────────────────
  // Returns x of left edge of bar i
  indexToX(i) {
    return this.chartLeft + (i - this.logFrom) * this.barW;
  }

  // Center x of bar i
  barCenterX(i) {
    return this.indexToX(i) + this.barW / 2;
  }

  xToIndex(x) {
    const bw = this.barW;
    if (bw === 0) return 0;
    return this.logFrom + (x - this.chartLeft) / bw;
  }

  // Higher price → smaller y (nearer top of screen)
  priceToY(p) {
    const range = this.priceMax - this.priceMin;
    if (range === 0) return (this.chartTop + this.chartBottom) / 2;
    return this.chartBottom - ((p - this.priceMin) / range) * this.chartH;
  }

  yToPrice(y) {
    const range = this.priceMax - this.priceMin;
    return this.priceMin + ((this.chartBottom - y) / this.chartH) * range;
  }

  // ── Auto-scale ───────────────────────────────────────────────────────────────
  // Derives raw price range from visible candles, then applies zoom + shift.
  autoScale(candles) {
    if (!candles?.length) return;
    const from = Math.max(0, Math.floor(this.logFrom));
    const to   = Math.min(candles.length - 1, Math.ceil(this.logTo));
    if (from > to) return;

    let lo = Infinity, hi = -Infinity;
    for (let i = from; i <= to; i++) {
      if (candles[i].low  < lo) lo = candles[i].low;
      if (candles[i].high > hi) hi = candles[i].high;
    }
    if (lo === Infinity) return;

    const pad = (hi - lo) * 0.08;
    this._rawMin = lo - pad;
    this._rawMax = hi + pad;
    this._applyTransform();
  }

  _applyTransform() {
    const mid  = (this._rawMin + this._rawMax) / 2;
    const half = (this._rawMax - this._rawMin) / 2;
    this.priceMin = mid - half * this.priceZoom - this.priceShift;
    this.priceMax = mid + half * this.priceZoom - this.priceShift;
  }

  // ── Fit all candles into view ────────────────────────────────────────────────
  fitContent(candles) {
    if (!candles?.length) return;
    this.logFrom    = 0;
    this.logTo      = candles.length;
    this.priceShift = 0;
    this.priceZoom  = 1.0;
    this.autoScale(candles);
  }

  // ── Fit only the last n bars — used for initial load of intraday charts ──────
  fitRecent(candles, n) {
    if (!candles?.length) return;
    this.logTo      = candles.length;
    this.logFrom    = Math.max(0, candles.length - n);
    this.priceShift = 0;
    this.priceZoom  = 1.0;
    this.autoScale(candles);
  }

  // ── Pan / zoom operations (called by EventHandler) ───────────────────────────

  // Horizontal pan: dx > 0 = mouse moved right = chart moves right = older bars
  panX(dx, candles) {
    const barsPerPx = (this.logTo - this.logFrom) / this.chartW;
    const len       = this.logTo - this.logFrom;
    this.logFrom -= dx * barsPerPx;
    this.logTo   -= dx * barsPerPx;
    // Clamp: don't go beyond data bounds + small buffer
    const minFrom = -(len * 0.5);
    const maxTo   = (candles?.length ?? 0) + len * 0.3;
    if (this.logFrom < minFrom) { this.logFrom = minFrom; this.logTo = minFrom + len; }
    if (this.logTo   > maxTo)   { this.logTo = maxTo;     this.logFrom = maxTo - len; }
  }

  // Vertical pan: dy > 0 = mouse moved down = chart moves down = higher prices come in from top
  panY(dy) {
    const pricePerPx = (this.priceMax - this.priceMin) / this.chartH;
    this.priceShift -= dy * pricePerPx;
    this._applyTransform();
  }

  // Time zoom centred on a pixel x-coordinate
  zoomX(factor, centerX, candles) {
    const ci     = this.xToIndex(centerX);
    const len    = this.logTo - this.logFrom;
    const newLen = Math.max(5, Math.min((candles?.length ?? 500) * 2, len * factor));
    const ratio  = len > 0 ? (ci - this.logFrom) / len : 0.5;
    this.logFrom = ci - ratio * newLen;
    this.logTo   = ci + (1 - ratio) * newLen;
  }

  // Price zoom — expand/contract visible price range
  zoomY(factor) {
    this.priceZoom = Math.max(0.15, Math.min(12, this.priceZoom * factor));
    this._applyTransform();
  }

  resetPrice() {
    this.priceShift = 0;
    this.priceZoom  = 1.0;
  }
}
