// ─── Candle Renderer ──────────────────────────────────────────────────────────
// Draws candlestick bars onto the chart area.

export function renderCandles(ctx, vp, candles, colors = {}) {
  if (!candles?.length) return;

  const UP_COLOR   = colors.bull || '#22c55e';
  const DOWN_COLOR = colors.bear || '#ef4444';

  const from = Math.max(0, Math.floor(vp.logFrom));
  const to   = Math.min(candles.length - 1, Math.ceil(vp.logTo));
  const bw   = vp.barW;

  const MIN_BODY = 1;
  const bodyW    = Math.max(1, bw * 0.7);
  const halfBody = bodyW / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
  ctx.clip();

  for (let i = from; i <= to; i++) {
    const c      = candles[i];
    const cx     = vp.barCenterX(i);
    const isUp   = c.close >= c.open;
    const color  = isUp ? UP_COLOR : DOWN_COLOR;

    const highY  = vp.priceToY(c.high);
    const lowY   = vp.priceToY(c.low);
    const openY  = vp.priceToY(c.open);
    const closeY = vp.priceToY(c.close);

    const bodyTop    = Math.min(openY, closeY);
    const bodyBottom = Math.max(openY, closeY);
    const bodyH      = Math.max(MIN_BODY, bodyBottom - bodyTop);

    ctx.fillStyle   = color;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;

    // Wick — single vertical line through centre
    ctx.beginPath();
    ctx.moveTo(cx, highY);
    ctx.lineTo(cx, lowY);
    ctx.stroke();

    // Body — filled rectangle
    ctx.fillRect(cx - halfBody, bodyTop, bodyW, bodyH);
  }

  ctx.restore();
}
