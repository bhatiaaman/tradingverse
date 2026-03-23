// ─── Line Renderer ────────────────────────────────────────────────────────────
// Draws EMA, VWAP, or any index-aligned value series.
// `values` is a number[] aligned 1:1 with the candles array.
// null/undefined entries are treated as gaps (line breaks).

export function renderLine(ctx, vp, values, color, lineWidth = 1.5) {
  if (!values?.length) return;

  const from = Math.max(0, Math.floor(vp.logFrom) - 1);
  const to   = Math.min(values.length - 1, Math.ceil(vp.logTo) + 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.lineJoin    = 'round';

  let drawing = false;
  ctx.beginPath();

  for (let i = from; i <= to; i++) {
    const v = values[i];
    if (v == null || isNaN(v)) {
      drawing = false;
      continue;
    }
    const x = vp.barCenterX(i);
    const y = vp.priceToY(v);
    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.restore();
}
