// ─── SMC Renderer ─────────────────────────────────────────────────────────────
// Draws Smart Money Concepts overlays:
//   1. FVG boxes        — semi-transparent filled rectangles, unmitigated gaps
//   2. Order Block boxes— semi-transparent filled rectangles, unmitigated OBs
//   3. BOS / CHoCH lines— horizontal segment from pivot bar to break bar + label

import { DARK } from '../palette.js';

export function renderSMC(ctx, vp, smc, palette) {
  if (!smc) return;
  const P = palette ?? DARK;
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

    ctx.fillStyle   = fvg.type === 'bull' ? P.fvgFill.bull : P.fvgFill.bear;
    ctx.fillRect(xLeft, yTop, w, h);

    ctx.strokeStyle = fvg.type === 'bull' ? P.fvgBorder.bull : P.fvgBorder.bear;
    ctx.lineWidth   = 0.75;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(xLeft, yTop, w, h);
    ctx.setLineDash([]);

    // Label — top-right of box
    ctx.font         = 'bold 9px monospace';
    ctx.fillStyle    = fvg.type === 'bull' ? P.fvgBorder.bull : P.fvgBorder.bear;
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

    ctx.fillStyle   = ob.bias === 'bull' ? P.obFill.bull : P.obFill.bear;
    ctx.fillRect(xLeft, yTop, w, h);

    ctx.strokeStyle = ob.bias === 'bull' ? P.obBorder.bull : P.obBorder.bear;
    ctx.lineWidth   = 1;
    ctx.strokeRect(xLeft, yTop, w, h);

    // Label — bottom-right of box
    ctx.font         = 'bold 9px monospace';
    ctx.fillStyle    = ob.bias === 'bull' ? P.obBorder.bull : P.obBorder.bear;
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

    const x1     = vp.barCenterX(bos.idx);
    const xBreak = vp.barCenterX(bos.breakIdx);

    // Only draw if at least partially visible
    if (xBreak < vp.chartLeft || x1 > vp.chartRight) continue;

    const cx1 = Math.max(vp.chartLeft, x1);

    const color = bos.isCHoCH
      ? (bos.type === 'bull' ? P.bullChoch : P.bearChoch)
      : (bos.type === 'bull' ? P.bullBos   : P.bearBos);

    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;

    // Segment 1: pivot → break candle (solid)
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(cx1, y);
    ctx.lineTo(Math.min(xBreak, vp.chartRight), y);
    ctx.stroke();

    // Segment 2: break candle → right edge (dashed, level still active)
    if (xBreak < vp.chartRight) {
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xBreak, y);
      ctx.lineTo(vp.chartRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.restore();

  // ── 3b. BOS / CHoCH labels — right-aligned at right edge (TV style) ─────────
  ctx.font = 'bold 9px monospace';
  for (const bos of bosLevels) {
    if (bos.breakIdx == null) continue;

    const y = vp.priceToY(bos.price);
    if (y < vp.chartTop || y > vp.chartBottom) continue;

    const x1     = vp.barCenterX(bos.idx);
    const xBreak = vp.barCenterX(bos.breakIdx);

    if (xBreak < vp.chartLeft || x1 > vp.chartRight) continue;

    const color = bos.isCHoCH
      ? (bos.type === 'bull' ? P.bullChoch : P.bearChoch)
      : (bos.type === 'bull' ? P.bullBos   : P.bearBos);

    // Label right-aligned at right edge of chart
    const label = bos.isCHoCH ? 'CHoCH' : 'BOS';
    const tw  = ctx.measureText(label).width;
    const pad = 3;
    const lx  = vp.chartRight - tw - 10;
    const ly  = y;

    // Dashed box border
    ctx.strokeStyle = color;
    ctx.lineWidth   = 0.75;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(lx - pad, ly - 9 - pad, tw + pad * 2, 9 + pad * 2);
    ctx.setLineDash([]);

    // Background fill
    ctx.fillStyle = P.bosLabelBg;
    ctx.fillRect(lx - pad, ly - 9 - pad, tw + pad * 2, 9 + pad * 2);

    // Text
    ctx.fillStyle    = color;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, lx, ly);
  }
}
