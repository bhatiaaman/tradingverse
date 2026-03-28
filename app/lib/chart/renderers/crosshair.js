// ─── Crosshair Renderer ───────────────────────────────────────────────────────
// Draws: dashed H+V lines, price pill on right axis, time pill on bottom axis.

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

function fmtPrice(p) {
  if (p >= 10000) return p.toFixed(0);
  if (p >= 1000)  return p.toFixed(1);
  return p.toFixed(2);
}

function fmtTime(unixSec, interval) {
  const d = new Date(unixSec * 1000 + IST_OFFSET_MS);
  if (interval === 'day' || interval === 'week') {
    const dd = d.getUTCDate().toString().padStart(2, '0');
    const mo = d.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });
    return `${dd} ${mo}`;
  }
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function renderCrosshair(ctx, vp, state, candles, interval) {
  if (!state?.visible) return;
  const { x, y, snapIndex, syncedOnly } = state;

  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.4)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 4]);

  // Vertical line — always drawn
  ctx.beginPath();
  ctx.moveTo(x, vp.chartTop);
  ctx.lineTo(x, vp.chartBottom);
  ctx.stroke();

  // Horizontal line + price pill — skipped in syncedOnly mode
  if (!syncedOnly) {
    ctx.beginPath();
    ctx.moveTo(vp.chartLeft, y);
    ctx.lineTo(vp.chartRight, y);
    ctx.stroke();
  }

  ctx.setLineDash([]);

  if (!syncedOnly) {
    // ── Price pill on right axis ───────────────────────────────────────────────
    const price  = vp.yToPrice(y);
    const pillH  = 17;
    const pillW  = vp.PRICE_AXIS_W - 4;
    const pillX  = vp.chartRight + 2;
    const pillY  = y - pillH / 2;

    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 3);
    ctx.fill();

    ctx.fillStyle    = '#0f172a';
    ctx.font         = 'bold 10px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmtPrice(price), pillX + pillW / 2, y);
  }

  // ── Time pill on bottom axis ─────────────────────────────────────────────────
  if (snapIndex != null && snapIndex >= 0 && snapIndex < (candles?.length ?? 0)) {
    const bar      = candles[snapIndex];
    const timeStr  = fmtTime(bar.time, interval);
    const tPillW   = 54;
    const tPillH   = 18;
    const tPillX   = x - tPillW / 2;
    const tPillY   = vp.chartBottom + (vp.TIME_AXIS_H - tPillH) / 2;

    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.roundRect(tPillX, tPillY, tPillW, tPillH, 3);
    ctx.fill();

    ctx.fillStyle    = '#0f172a';
    ctx.font         = 'bold 10px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, x, tPillY + tPillH / 2);
  }

  ctx.restore();
}
