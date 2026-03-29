// ─── Drawing Renderer ─────────────────────────────────────────────────────────
// Renders user-placed drawing objects on the chart canvas.
// Each drawing: { id, type, p1: {barIndex, price}, p2: {barIndex, price} | null,
//                 color, width, preview }
//
// Types: 'trend_line' | 'ray' | 'horizontal_line' | 'vertical_line'
//
// Call renderDrawings() once per frame, AFTER candles, BEFORE crosshair.

// ── Extend a ray from p1 through p2 until it hits a chart edge ────────────────
function extendRay(x1, y1, x2, y2, vp) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return { ex: x2, ey: y2 };

  let t = Infinity;
  if (dx > 0.001)  t = Math.min(t, (vp.chartRight  - x1) / dx);
  if (dx < -0.001) t = Math.min(t, (vp.chartLeft   - x1) / dx);
  if (dy > 0.001)  t = Math.min(t, (vp.chartBottom - y1) / dy);
  if (dy < -0.001) t = Math.min(t, (vp.chartTop    - y1) / dy);
  if (!isFinite(t)) return { ex: x2, ey: y2 };

  return { ex: x1 + dx * t, ey: y1 + dy * t };
}

function drawingPath(ctx, vp, d) {
  const { type, p1, p2 } = d;
  if (!p1) return false;

  switch (type) {
    case 'horizontal_line': {
      const y = vp.priceToY(p1.price);
      if (y < vp.chartTop - 1 || y > vp.chartBottom + 1) return false;
      ctx.moveTo(vp.chartLeft, y);
      ctx.lineTo(vp.chartRight, y);
      return true;
    }
    case 'vertical_line': {
      const x = vp.barCenterX(p1.barIndex);
      if (x < vp.chartLeft - 1 || x > vp.chartRight + 1) return false;
      ctx.moveTo(x, vp.chartTop);
      ctx.lineTo(x, vp.chartBottom);
      return true;
    }
    case 'trend_line': {
      if (!p2) return false;
      const x1 = vp.barCenterX(p1.barIndex);
      const y1 = vp.priceToY(p1.price);
      const x2 = vp.barCenterX(p2.barIndex);
      const y2 = vp.priceToY(p2.price);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      return { x1, y1, x2, y2 };
    }
    case 'ray': {
      if (!p2) return false;
      const x1 = vp.barCenterX(p1.barIndex);
      const y1 = vp.priceToY(p1.price);
      const x2 = vp.barCenterX(p2.barIndex);
      const y2 = vp.priceToY(p2.price);
      const { ex, ey } = extendRay(x1, y1, x2, y2, vp);
      ctx.moveTo(x1, y1);
      ctx.lineTo(ex, ey);
      return { x1, y1 };
    }
  }
  return false;
}

function renderOne(ctx, vp, d) {
  const selected = !!d.selected;
  const color    = selected ? '#93c5fd' : (d.color ?? '#3b82f6'); // brighter blue when selected
  const alpha    = d.preview ? 0.65 : 1;
  const lw       = (d.width ?? 1.5) + (selected ? 0.5 : 0);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.setLineDash([]);

  // Clip to chart area so lines don't bleed into axes
  ctx.beginPath();
  ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
  ctx.clip();

  ctx.beginPath();
  const result = drawingPath(ctx, vp, d);
  if (!result) { ctx.restore(); return; }
  ctx.stroke();

  // Anchor dots for trend_line and ray
  if (typeof result === 'object' && result.x1 != null) {
    const { x1, y1 } = result;
    const r = selected ? 5 : 3.5;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x1, y1, r, 0, Math.PI * 2); ctx.fill();
    if (d.type === 'trend_line' && result.x2 != null) {
      ctx.beginPath(); ctx.arc(result.x2, result.y2, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Selection handles for horizontal/vertical lines (small squares at midpoint)
  if (selected) {
    ctx.fillStyle = color;
    if (d.type === 'horizontal_line') {
      const y  = vp.priceToY(d.p1.price);
      const mx = (vp.chartLeft + vp.chartRight) / 2;
      ctx.fillRect(mx - 4, y - 4, 8, 8);
    } else if (d.type === 'vertical_line') {
      const x  = vp.barCenterX(d.p1.barIndex);
      const my = (vp.chartTop + vp.chartBottom) / 2;
      ctx.fillRect(x - 4, my - 4, 8, 8);
    }
  }

  // Price label on right axis for horizontal line
  if (d.type === 'horizontal_line') {
    const y = vp.priceToY(d.p1.price);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = color;
    ctx.font        = '10px -apple-system,BlinkMacSystemFont,sans-serif';
    ctx.textAlign   = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.p1.price.toFixed(2), vp.chartRight + 5, y);
  }

  ctx.restore();
}

export function renderDrawings(ctx, vp, drawings, inProgress) {
  for (const d of drawings) renderOne(ctx, vp, d);
  if (inProgress) renderOne(ctx, vp, { ...inProgress, preview: true });
}
