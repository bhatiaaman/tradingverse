// ─── Volume Renderer ──────────────────────────────────────────────────────────
// Draws semi-transparent volume bars in the bottom 18% of the chart area,
// coloured green/red to match the candle direction.

const VOLUME_RATIO = 0.18; // fraction of chartH used for volume strip

export function renderVolume(ctx, vp, candles) {
  if (!candles?.length) return;

  const from = Math.max(0, Math.floor(vp.logFrom));
  const to   = Math.min(candles.length - 1, Math.ceil(vp.logTo));

  // Max volume in visible range — used for scaling
  let maxVol = 0;
  for (let i = from; i <= to; i++) {
    if ((candles[i].volume ?? 0) > maxVol) maxVol = candles[i].volume;
  }
  if (!maxVol) return;

  const stripH  = vp.chartH * VOLUME_RATIO;
  const baseY   = vp.chartBottom;          // volume bars grow upward from here
  const bw      = vp.barW;
  const bodyW   = Math.max(1, bw * 0.7);

  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
  ctx.clip();

  for (let i = from; i <= to; i++) {
    const c   = candles[i];
    const vol = c.volume ?? 0;
    if (!vol) continue;

    const cx   = vp.barCenterX(i);
    const barH = Math.max(1, (vol / maxVol) * stripH);
    const isUp = c.close >= c.open;

    ctx.fillStyle = isUp ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)';
    ctx.fillRect(cx - bodyW / 2, baseY - barH, bodyW, barH);
  }

  ctx.restore();
}
