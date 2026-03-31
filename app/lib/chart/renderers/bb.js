// ─── Bollinger Bands Renderer ──────────────────────────────────────────────────
// bbData: { basis: number[], upper: number[], lower: number[] } — all aligned to candles[].
// Renders: semi-transparent fill between upper/lower, then upper (red), lower (green),
// basis (blue) lines — matching TradingView's default BB colour scheme.

const COLOR_BASIS = 'rgba(41, 98, 255, 0.95)';    // #2962FF
const COLOR_UPPER = 'rgba(242, 54, 69, 0.85)';    // #F23645
const COLOR_LOWER = 'rgba(8, 153, 129, 0.85)';    // #089981
const COLOR_FILL  = 'rgba(33, 150, 243, 0.08)';   // TV fill, lightened for dark canvas

export function renderBB(ctx, vp, bbData) {
  if (!bbData) return;
  const { basis, upper, lower } = bbData;
  if (!basis?.length) return;

  const from = Math.max(0, Math.floor(vp.logFrom) - 1);
  const to   = Math.min(basis.length - 1, Math.ceil(vp.logTo) + 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
  ctx.clip();

  // ── Band fill (upper → lower polygon) ───────────────────────────────────────
  // Walk upper left→right, then lower right→left to close the shape.
  ctx.beginPath();
  let fillStarted = false;
  for (let i = from; i <= to; i++) {
    const u = upper[i];
    if (u == null || isNaN(u)) { fillStarted = false; continue; }
    const x = vp.barCenterX(i);
    const y = vp.priceToY(u);
    if (!fillStarted) { ctx.moveTo(x, y); fillStarted = true; }
    else              { ctx.lineTo(x, y); }
  }
  // Trace lower band right→left
  for (let i = to; i >= from; i--) {
    const l = lower[i];
    if (l == null || isNaN(l)) continue;
    ctx.lineTo(vp.barCenterX(i), vp.priceToY(l));
  }
  ctx.closePath();
  ctx.fillStyle = COLOR_FILL;
  ctx.fill();

  // ── Helper: draw one line series ─────────────────────────────────────────────
  function drawLine(values, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.lineJoin    = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    let drawing = false;
    for (let i = from; i <= to; i++) {
      const v = values[i];
      if (v == null || isNaN(v)) { drawing = false; continue; }
      const x = vp.barCenterX(i);
      const y = vp.priceToY(v);
      if (!drawing) { ctx.moveTo(x, y); drawing = true; }
      else          { ctx.lineTo(x, y); }
    }
    ctx.stroke();
  }

  drawLine(upper, COLOR_UPPER, 1.0);
  drawLine(lower, COLOR_LOWER, 1.0);
  drawLine(basis, COLOR_BASIS, 1.0);

  // ── Right-edge axis pills for the last visible bars ──────────────────────────
  const lastIdx = Math.min(to, basis.length - 1);
  function drawPill(price, color, label) {
    if (price == null || isNaN(price)) return;
    const y = vp.priceToY(price);
    if (y < vp.chartTop - 2 || y > vp.chartBottom + 2) return;
    const pillH = 14;
    const pillW = vp.PRICE_AXIS_W - 4;
    const pillX = vp.chartRight + 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(pillX, y - pillH / 2, pillW, pillH, 3);
    ctx.fill();
    const fmt = price >= 10000 ? price.toFixed(0) : price >= 1000 ? price.toFixed(1) : price.toFixed(2);
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 7.5px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${label} ${fmt}`, pillX + pillW / 2, y);
  }

  drawPill(upper[lastIdx], COLOR_UPPER, 'UB');
  drawPill(lower[lastIdx], COLOR_LOWER, 'LB');
  drawPill(basis[lastIdx], COLOR_BASIS, 'BB');

  ctx.restore();
}
