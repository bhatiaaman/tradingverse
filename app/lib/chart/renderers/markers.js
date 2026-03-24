// ─── Marker Renderer ──────────────────────────────────────────────────────────
// Draws directional arrow markers above/below power candles.
// markers: [{ index, direction: 'bull'|'bear' }]

const BULL_COLOR = '#fbbf24'; // amber
const BEAR_COLOR = '#f87171'; // red

export function renderMarkers(ctx, vp, candles, markers) {
  if (!candles?.length || !markers?.length) return;

  const from = Math.max(0, Math.floor(vp.logFrom));
  const to   = Math.min(candles.length - 1, Math.ceil(vp.logTo));

  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
  ctx.clip();

  const size = Math.max(4, Math.min(7, vp.barW * 0.6));

  for (const m of markers) {
    const i = m.index;
    if (i == null || i < from || i > to) continue;

    const c  = candles[i];
    const cx = vp.barCenterX(i);

    if (m.direction === 'bull') {
      const highY = vp.priceToY(c.high);
      const tip   = highY - size - 4;        // tip of arrow above wick

      ctx.fillStyle    = BULL_COLOR;
      ctx.shadowColor  = BULL_COLOR;
      ctx.shadowBlur   = 8;
      ctx.beginPath();
      ctx.moveTo(cx,          tip);           // top tip
      ctx.lineTo(cx - size,   tip + size * 1.6);
      ctx.lineTo(cx + size,   tip + size * 1.6);
      ctx.closePath();
      ctx.fill();
    } else {
      const lowY = vp.priceToY(c.low);
      const tip  = lowY + size + 4;           // tip of arrow below wick

      ctx.fillStyle    = BEAR_COLOR;
      ctx.shadowColor  = BEAR_COLOR;
      ctx.shadowBlur   = 8;
      ctx.beginPath();
      ctx.moveTo(cx,          tip);           // bottom tip
      ctx.lineTo(cx - size,   tip - size * 1.6);
      ctx.lineTo(cx + size,   tip - size * 1.6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  ctx.restore();
}
