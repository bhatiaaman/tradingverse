// ─── Candle Renderer ──────────────────────────────────────────────────────────
// Draws candlestick bars onto the chart area.

// Returns a border color that always contrasts with the fill:
//   light colors (e.g. white, yellow) → dark border
//   dark colors  (e.g. black)         → light border
//   mid-range colors                  → same as fill (subtle outline)
function borderFor(hex) {
  if (!hex || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  if (lum > 0.72) return 'rgba(0,0,0,0.70)';   // white/light → black border
  if (lum < 0.12) return 'rgba(255,255,255,0.45)'; // black/near-black → light border
  return hex;                                    // everything else: same colour
}

export function renderCandles(ctx, vp, candles, colors = {}) {
  if (!candles?.length) return;

  const UP_COLOR    = colors.bull || '#22c55e';
  const DOWN_COLOR  = colors.bear || '#ef4444';
  const UP_BORDER   = borderFor(UP_COLOR);
  const DOWN_BORDER = borderFor(DOWN_COLOR);

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
    const color  = isUp ? UP_COLOR  : DOWN_COLOR;
    const border = isUp ? UP_BORDER : DOWN_BORDER;

    const highY  = vp.priceToY(c.high);
    const lowY   = vp.priceToY(c.low);
    const openY  = vp.priceToY(c.open);
    const closeY = vp.priceToY(c.close);

    const bodyTop    = Math.min(openY, closeY);
    const bodyBottom = Math.max(openY, closeY);
    const bodyH      = Math.max(MIN_BODY, bodyBottom - bodyTop);

    // Wick — always use the contrasting border color
    ctx.strokeStyle = border;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cx, highY);
    ctx.lineTo(cx, lowY);
    ctx.stroke();

    // Body
    ctx.fillStyle = color;
    ctx.fillRect(cx - halfBody, bodyTop, bodyW, bodyH);

    // Only draw border if it differs from the fill color (e.g. for white/black candles)
    if (color !== border) {
      ctx.strokeStyle = border;
      ctx.strokeRect(cx - halfBody, bodyTop, bodyW, bodyH);
    }
  }

  ctx.restore();
}
