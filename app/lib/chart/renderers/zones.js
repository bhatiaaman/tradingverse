// ─── Zone Renderer ────────────────────────────────────────────────────────────
// Draws horizontal price lines (key levels, S/R zones).
// Each zone: { id, price, color, label, style: 'solid' | 'dashed' }

export function renderZones(ctx, vp, zones) {
  if (!zones?.length) return;

  ctx.save();
  ctx.font         = '10px monospace';
  ctx.textBaseline = 'bottom';
  ctx.textAlign    = 'left';

  for (const z of zones) {
    const y = vp.priceToY(z.price);
    if (y < vp.chartTop - 2 || y > vp.chartBottom + 2) continue;

    ctx.strokeStyle = z.color;
    ctx.lineWidth   = 1;
    ctx.setLineDash(z.style === 'dashed' ? [5, 4] : []);

    // Line across chart area only
    ctx.beginPath();
    ctx.moveTo(vp.chartLeft, y);
    ctx.lineTo(vp.chartRight, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label — rendered in the price axis area (outside clip)
    if (z.label) {
      ctx.fillStyle = z.color;
      ctx.fillText(z.label, vp.chartRight + 4, y - 1);
    }
  }

  ctx.restore();
}
