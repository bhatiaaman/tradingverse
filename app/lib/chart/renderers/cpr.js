// ─── CPR Renderer ─────────────────────────────────────────────────────────────
// cprData: array of per-day segments:
//   [{ startIdx, endIdx, tc, p, bc, r1, r2, s1, s2, widthPct, widthClass }, ...]
// Each segment draws lines only between its startIdx and endIdx (like TV's per-day lines).
//
// widthClass visual encoding:
//   narrow  (<0.15% of P) → green zone  — trending day likely
//   normal  (0.15–0.35%)  → indigo zone — neutral
//   wide    (>0.35% of P) → amber zone  — range/choppy day likely

const COLORS = {
  pivot:  'rgba(251,191,36,0.95)',
  tcbc:   'rgba(129,140,248,0.90)',
  r:      'rgba(34,197,94,0.85)',
  s:      'rgba(239,68,68,0.85)',
};
const PIVOT_BY_CLASS = {
  narrow: 'rgba(34,197,94,0.95)',
  normal: 'rgba(251,191,36,0.95)',
  wide:   'rgba(251,146,60,0.95)',
};
const ZONE_FILL = {
  narrow: 'rgba(34,197,94,0.08)',
  normal: 'rgba(99,102,241,0.07)',
  wide:   'rgba(251,146,60,0.08)',
};
const WIDTH_BADGE = { narrow: ' ▲N', wide: ' ▼W', normal: '' };

function fmtPrice(p) {
  if (p >= 10000) return p.toFixed(0);
  if (p >= 1000)  return p.toFixed(1);
  return p.toFixed(2);
}

// Draw a horizontal line segment from x1 to x2 at price y
function drawSeg(ctx, vp, price, x1, x2, color, dashed, lineWidth) {
  const y = vp.priceToY(price);
  if (y < vp.chartTop - 2 || y > vp.chartBottom + 2) return false;
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.beginPath();
  ctx.moveTo(Math.max(x1, vp.chartLeft), y);
  ctx.lineTo(Math.min(x2, vp.chartRight), y);
  ctx.stroke();
  ctx.setLineDash([]);
  return true;
}

// Draw the inline text label at the RIGHT edge of the segment (end of day)
function drawLabel(ctx, vp, price, x2, color, label) {
  const y      = vp.priceToY(price);
  if (y < vp.chartTop - 2 || y > vp.chartBottom + 2) return;
  const lx     = Math.min(x2, vp.chartRight) - 4;
  ctx.font     = 'bold 9px monospace';
  ctx.fillStyle = color;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width;
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = color;
  ctx.fillRect(lx - tw - 3, y - 6, tw + 6, 12);
  ctx.restore();
  ctx.fillStyle = color;
  ctx.fillText(label, lx, y);
}

function drawAxisPill(ctx, vp, price, color, label) {
  const y = vp.priceToY(price);
  if (y < vp.chartTop - 2 || y > vp.chartBottom + 2) return;
  const pillH = 15;
  const pillW = vp.PRICE_AXIS_W - 4;
  const pillX = vp.chartRight + 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(pillX, y - pillH / 2, pillW, pillH, 3);
  ctx.fill();
  ctx.fillStyle    = '#0f172a';
  ctx.font         = 'bold 8.5px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label} ${fmtPrice(price)}`, pillX + pillW / 2, y);
}

export function renderCPR(ctx, vp, cprData, crosshair) {
  if (!cprData?.length) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
  ctx.clip();

  // Track which segments are on screen (for crosshair pills — use the last/rightmost one)
  let lastVisible = null;

  for (const seg of cprData) {
    const { startIdx, endIdx, tc, p, bc, r1, r2, s1, s2, widthClass = 'normal' } = seg;
    const x1 = vp.indexToX(startIdx);
    // For the last (current) segment, extend lines to the full visible right edge
    // so CPR appears fully formed from the first candle, not growing bar by bar.
    const isLastSeg = seg === cprData[cprData.length - 1];
    const x2 = isLastSeg ? vp.chartRight : vp.indexToX(endIdx + 1);

    // Skip entirely off-screen segments
    if (x2 < vp.chartLeft || x1 > vp.chartRight) continue;
    lastVisible = seg;

    const pivotCol = PIVOT_BY_CLASS[widthClass] ?? COLORS.pivot;

    // TC→BC zone fill
    const yTop = Math.min(vp.priceToY(tc), vp.priceToY(bc));
    const yBot = Math.max(vp.priceToY(tc), vp.priceToY(bc));
    if (yBot - yTop > 0 && yTop < vp.chartBottom && yBot > vp.chartTop) {
      ctx.fillStyle = ZONE_FILL[widthClass] ?? ZONE_FILL.normal;
      const fillX1 = Math.max(x1, vp.chartLeft);
      const fillX2 = Math.min(x2, vp.chartRight);
      ctx.fillRect(fillX1, Math.max(yTop, vp.chartTop),
                   fillX2 - fillX1, Math.min(yBot, vp.chartBottom) - Math.max(yTop, vp.chartTop));
    }

    // R2, R1 (dashed green)
    if (r2 != null) { drawSeg(ctx, vp, r2, x1, x2, COLORS.r, true, 0.75); drawLabel(ctx, vp, r2, x2, COLORS.r, 'R2'); }
    if (r1 != null) { drawSeg(ctx, vp, r1, x1, x2, COLORS.r, true, 1);    drawLabel(ctx, vp, r1, x2, COLORS.r, 'R1'); }

    // S1, S2 (dashed red)
    if (s1 != null) { drawSeg(ctx, vp, s1, x1, x2, COLORS.s, true, 1);    drawLabel(ctx, vp, s1, x2, COLORS.s, 'S1'); }
    if (s2 != null) { drawSeg(ctx, vp, s2, x1, x2, COLORS.s, true, 0.75); drawLabel(ctx, vp, s2, x2, COLORS.s, 'S2'); }

    // BC, TC (solid indigo)
    drawSeg(ctx, vp, bc, x1, x2, COLORS.tcbc, false, 1);   drawLabel(ctx, vp, bc, x2, COLORS.tcbc, 'BC');
    drawSeg(ctx, vp, tc, x1, x2, COLORS.tcbc, false, 1);   drawLabel(ctx, vp, tc, x2, COLORS.tcbc, 'TC');

    // Pivot (solid, color encodes width class)
    const badge = WIDTH_BADGE[widthClass] ?? '';
    drawSeg(ctx, vp, p, x1, x2, pivotCol, false, 1.5);
    drawLabel(ctx, vp, p, x2, pivotCol, `P${badge}`);
  }

  ctx.restore();

  // Crosshair: show price-axis pills for the last visible (rightmost) segment
  if (crosshair?.visible && lastVisible) {
    const { tc, p, bc, r1, r2, s1, s2, widthClass = 'normal' } = lastVisible;
    const pivotCol = PIVOT_BY_CLASS[widthClass] ?? COLORS.pivot;
    ctx.save();
    const lvls = [
      r2 != null ? [r2, COLORS.r,    'R2'] : null,
      r1 != null ? [r1, COLORS.r,    'R1'] : null,
      [tc, COLORS.tcbc, 'TC'],
      [p,  pivotCol,    'P'],
      [bc, COLORS.tcbc, 'BC'],
      s1 != null ? [s1, COLORS.s, 'S1'] : null,
      s2 != null ? [s2, COLORS.s, 'S2'] : null,
    ];
    for (const l of lvls) { if (l) drawAxisPill(ctx, vp, l[0], l[1], l[2]); }
    ctx.restore();
  }
}
