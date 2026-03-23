// ─── Candle Renderer ──────────────────────────────────────────────────────────
// Draws candlestick bars onto the chart area.

const UP_COLOR   = '#10b981';
const DOWN_COLOR = '#ef4444';

export function renderCandles(ctx, vp, candles) {
  if (!candles?.length) return;

  const from = Math.max(0, Math.floor(vp.logFrom));
  const to   = Math.min(candles.length - 1, Math.ceil(vp.logTo));
  const bw   = vp.barW;

  // Minimum body height so 1-tick candles are still visible
  const MIN_BODY = 1;

  // Body width: 70% of bar, minimum 1px
  const bodyW    = Math.max(1, bw * 0.7);
  const halfBody = bodyW / 2;

  ctx.save();
  // Clip to chart area only
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
