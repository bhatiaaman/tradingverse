// ─── Zone Renderer ────────────────────────────────────────────────────────────
// Draws horizontal price lines (key levels, S/R zones).
// Each zone: { id, price, color, label, style: 'solid' | 'dashed', inline?: boolean }
//
// inline: true  → draws a pill badge ON the line inside the chart area + hover tooltip
// inline: false → draws the label text in the price-axis column (legacy behaviour)

export function renderZones(ctx, vp, zones, crosshair) {
  if (!zones?.length) return;

  ctx.save();
  ctx.font         = '10px monospace';
  ctx.textBaseline = 'bottom';
  ctx.textAlign    = 'left';

  for (const z of zones) {
    const y = vp.priceToY(z.price);
    if (y < vp.chartTop - 2 || y > vp.chartBottom + 2) continue;

    ctx.strokeStyle = z.color;
    ctx.lineWidth   = z.width ?? (z.inline ? 1.5 : 1);
    ctx.setLineDash(z.style === 'dashed' ? [5, 4] : []);

    // Line across chart area only
    ctx.beginPath();
    ctx.moveTo(vp.chartLeft, y);
    ctx.lineTo(vp.chartRight, y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (z.label) {
      if (z.inline) {
        // ── Inline pill badge on the line ──────────────────────────────────
        const PAD = 5;
        ctx.font = 'bold 10px monospace';
        const textW  = ctx.measureText(z.label).width;
        const pillW  = textW + PAD * 2;
        const pillH  = 15;
        const pillX  = vp.chartRight - pillW - 8;
        const pillY  = y - pillH / 2;

        // Background fill — semi-transparent version of the zone color
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle   = z.color;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 3);
        ctx.fill();
        ctx.restore();

        // Pill border
        ctx.strokeStyle = z.color;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 3);
        ctx.stroke();

        // Label text
        ctx.fillStyle    = z.color;
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';
        ctx.fillText(z.label, pillX + pillW / 2, y);

        // Reset font/alignment for next iteration
        ctx.font         = '10px monospace';
        ctx.textBaseline = 'bottom';
        ctx.textAlign    = 'left';
      } else {
        // ── Legacy: label in the price-axis column ─────────────────────────
        ctx.fillStyle = z.color;
        ctx.fillText(z.label, vp.chartRight + 4, y - 1);
      }
    }
  }

  // ── Hover tooltip: shown when crosshair is within 10 px of an inline zone ──
  if (crosshair?.visible) {
    for (const z of zones) {
      if (!z.inline || !z.label) continue;
      const y = vp.priceToY(z.price);
      if (Math.abs(crosshair.y - y) > 10) continue;

      const priceStr   = z.price.toLocaleString('en-IN', { maximumFractionDigits: 2 });
      const tipText    = `${z.label}  ${priceStr}`;
      const PAD_H = 8, PAD_V = 5;
      ctx.font = 'bold 11px monospace';
      const tipW = ctx.measureText(tipText).width + PAD_H * 2;
      const tipH = 20;

      // Position: to the right of the crosshair, clamped inside chart
      let tipX = crosshair.x + 14;
      if (tipX + tipW > vp.chartRight - 4) tipX = crosshair.x - tipW - 6;
      const tipY = y - tipH - 5;

      // Shadow / background
      ctx.save();
      ctx.shadowColor  = z.color;
      ctx.shadowBlur   = 6;
      ctx.fillStyle    = 'rgba(6, 11, 20, 0.92)';
      ctx.beginPath();
      ctx.roundRect(tipX, tipY, tipW, tipH, 4);
      ctx.fill();
      ctx.restore();

      // Border
      ctx.strokeStyle = z.color;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.roundRect(tipX, tipY, tipW, tipH, 4);
      ctx.stroke();

      // Text
      ctx.fillStyle    = z.color;
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'left';
      ctx.fillText(tipText, tipX + PAD_H, tipY + tipH / 2);

      ctx.font         = '10px monospace';
      ctx.textBaseline = 'bottom';
      ctx.textAlign    = 'left';
      break; // Only one tooltip at a time
    }
  }

  ctx.restore();
}
