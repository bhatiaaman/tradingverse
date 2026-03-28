// ─── SMC Renderer ─────────────────────────────────────────────────────────────
// Draws Smart Money Concepts overlays:
//   1. FVG boxes        — semi-transparent filled rectangles, unmitigated gaps
//   2. Order Block boxes— semi-transparent filled rectangles, unmitigated OBs
//   3. BOS / CHoCH lines— horizontal segment from pivot bar to break bar + label

const BULL_FVG = 'rgba(34,197,94,0.09)';
const BEAR_FVG = 'rgba(239,68,68,0.09)';
const BULL_FVG_BORDER = 'rgba(34,197,94,0.35)';
const BEAR_FVG_BORDER = 'rgba(239,68,68,0.35)';

const BULL_OB = 'rgba(49,121,245,0.13)';
const BEAR_OB = 'rgba(242,54,69,0.13)';
const BULL_OB_BORDER = 'rgba(49,121,245,0.45)';
const BEAR_OB_BORDER = 'rgba(242,54,69,0.45)';

const BULL_BOS  = '#22c55e';
const BEAR_BOS  = '#ef4444';
const BULL_CHOCH = '#86efac';
const BEAR_CHOCH = '#fca5a5';

export function renderSMC(ctx, vp, smc) {
  if (!smc) return;
  const { bosLevels = [], orderBlocks = [], fvgs = [] } = smc;

  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
  ctx.clip();

  // ── 1. FVG boxes ──────────────────────────────────────────────────────────
  for (const fvg of fvgs) {
    const yTop = vp.priceToY(fvg.high);
    const yBot = vp.priceToY(fvg.low);
    const h    = yBot - yTop;
    if (h <= 0) continue;

    const xLeft  = Math.max(vp.chartLeft, vp.barCenterX(fvg.startIdx));
    const xRight = vp.chartRight;
    const w      = xRight - xLeft;
    if (w <= 0) continue;

    ctx.fillStyle   = fvg.type === 'bull' ? BULL_FVG : BEAR_FVG;
    ctx.fillRect(xLeft, yTop, w, h);

    ctx.strokeStyle = fvg.type === 'bull' ? BULL_FVG_BORDER : BEAR_FVG_BORDER;
    ctx.lineWidth   = 0.75;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(xLeft, yTop, w, h);
    ctx.setLineDash([]);

    // Label — top-right of box
    ctx.font         = 'bold 9px monospace';
    ctx.fillStyle    = fvg.type === 'bull' ? BULL_FVG_BORDER : BEAR_FVG_BORDER;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('FVG', xRight - 4, yTop + 2);
  }

  // ── 2. Order Block boxes ──────────────────────────────────────────────────
  for (const ob of orderBlocks) {
    const yTop = vp.priceToY(ob.high);
    const yBot = vp.priceToY(ob.low);
    const h    = yBot - yTop;
    if (h <= 0) continue;

    const xLeft  = Math.max(vp.chartLeft, vp.barCenterX(ob.barIdx));
    const xRight = vp.chartRight;
    const w      = xRight - xLeft;
    if (w <= 0) continue;

    ctx.fillStyle   = ob.bias === 'bull' ? BULL_OB : BEAR_OB;
    ctx.fillRect(xLeft, yTop, w, h);

    ctx.strokeStyle = ob.bias === 'bull' ? BULL_OB_BORDER : BEAR_OB_BORDER;
    ctx.lineWidth   = 1;
    ctx.strokeRect(xLeft, yTop, w, h);

    // Label — bottom-right of box
    ctx.font         = 'bold 9px monospace';
    ctx.fillStyle    = ob.bias === 'bull' ? BULL_OB_BORDER : BEAR_OB_BORDER;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('OB', xRight - 4, yBot - 2);
  }

  // ── 3. BOS / CHoCH horizontal segments ───────────────────────────────────
  ctx.font = 'bold 9px monospace';

  for (const bos of bosLevels) {
    if (bos.breakIdx == null) continue;

    const y = vp.priceToY(bos.price);
    if (y < vp.chartTop || y > vp.chartBottom) continue;

    const x1 = vp.barCenterX(bos.idx);
    const x2 = vp.barCenterX(bos.breakIdx);

    // Only draw if at least partially visible
    if (x2 < vp.chartLeft || x1 > vp.chartRight) continue;

    const cx1 = Math.max(vp.chartLeft, x1);
    const cx2 = Math.min(vp.chartRight, x2);

    const color = bos.isCHoCH
      ? (bos.type === 'bull' ? BULL_CHOCH : BEAR_CHOCH)
      : (bos.type === 'bull' ? BULL_BOS   : BEAR_BOS);

    // Dashed line
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(cx1, y);
    ctx.lineTo(cx2, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center label
    const midX  = Math.max(cx1 + 16, Math.min(cx2 - 16, (cx1 + cx2) / 2));
    const label = bos.isCHoCH ? 'CHoCH' : 'BOS';

    // Label background
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(6,11,20,0.7)';
    ctx.fillRect(midX - tw / 2 - 2, y - 9, tw + 4, 9);

    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, midX, y - 1);
  }

  ctx.restore();
}
