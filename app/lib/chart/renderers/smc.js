// ─── SMC Renderer ─────────────────────────────────────────────────────────────
// TradingView-style SMC:
//   1. Order Block boxes — subtle semi-transparent rects extending to right edge
//   2. BOS / CHoCH      — dashed line from pivot → right edge, label centred on segment

import { DARK } from '../palette.js';

export function renderSMC(ctx, vp, smc, palette) {
  if (!smc) return;
  const P = palette ?? DARK;
  const { bosLevels = [], orderBlocks = [] } = smc; // FVGs intentionally hidden — too noisy

  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
  ctx.clip();

  // ── 1. Order Block boxes ──────────────────────────────────────────────────
  for (const ob of orderBlocks) {
    const yTop = vp.priceToY(ob.high);
    const yBot = vp.priceToY(ob.low);
    const h    = yBot - yTop;
    if (h <= 0) continue;

    const xLeft  = Math.max(vp.chartLeft, vp.barCenterX(ob.barIdx));
    const xRight = vp.chartRight;
    const w      = xRight - xLeft;
    if (w <= 0) continue;

    ctx.fillStyle = ob.bias === 'bull' ? P.obFill.bull : P.obFill.bear;
    ctx.fillRect(xLeft, yTop, w, h);

    ctx.strokeStyle = ob.bias === 'bull' ? P.obBorder.bull : P.obBorder.bear;
    ctx.lineWidth   = 0.75;
    ctx.setLineDash([]);
    ctx.strokeRect(xLeft, yTop, w, h);

    // Small label — bottom-right corner
    ctx.font         = '700 9px monospace';
    ctx.fillStyle    = ob.bias === 'bull' ? P.obBorder.bull : P.obBorder.bear;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('OB', xRight - 4, yBot - 2);
  }

  // ── 2. BOS / CHoCH lines ─────────────────────────────────────────────────
  // Dashed line from pivot → break candle only (TV style).
  for (const bos of bosLevels) {
    if (bos.breakIdx == null) continue;

    const y  = vp.priceToY(bos.price);
    if (y < vp.chartTop || y > vp.chartBottom) continue;

    const xPivot = vp.barCenterX(bos.idx);
    const xBreak = vp.barCenterX(bos.breakIdx);
    if (xPivot > vp.chartRight) continue;
    if (xBreak < vp.chartLeft) continue;

    const lineStart = Math.max(vp.chartLeft, xPivot);
    const lineEnd   = Math.min(vp.chartRight, xBreak);

    const color = bos.isCHoCH
      ? (bos.type === 'bull' ? P.bullChoch : P.bearChoch)
      : (bos.type === 'bull' ? P.bullBos   : P.bearBos);

    ctx.strokeStyle = color;
    ctx.lineWidth   = 0.75;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(lineStart, y);
    ctx.lineTo(lineEnd, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();

  // ── 2b. Labels — centred between pivot and break candle ──────────────────
  ctx.font = '700 9px -apple-system,sans-serif';

  for (const bos of bosLevels) {
    if (bos.breakIdx == null) continue;

    const y  = vp.priceToY(bos.price);
    if (y < vp.chartTop || y > vp.chartBottom) continue;

    const xPivot = vp.barCenterX(bos.idx);
    const xBreak = vp.barCenterX(bos.breakIdx);
    if (xPivot > vp.chartRight) continue;
    if (xBreak < vp.chartLeft) continue;

    // Label centre = midpoint of pivot→break, clamped to visible area
    const visStart  = Math.max(vp.chartLeft, xPivot);
    const visEnd    = Math.min(vp.chartRight, xBreak);
    if (visEnd <= visStart) continue; // segment not visible
    const labelX = (visStart + visEnd) / 2;

    const color = bos.isCHoCH
      ? (bos.type === 'bull' ? P.bullChoch : P.bearChoch)
      : (bos.type === 'bull' ? P.bullBos   : P.bearBos);

    const label = bos.isCHoCH ? 'CHoCH' : 'BOS';
    const tw    = ctx.measureText(label).width;
    const PAD_X = 4, PAD_Y = 2, FONT_H = 9, R = 2;
    const pw = tw + PAD_X * 2;
    const ph = FONT_H + PAD_Y * 2;
    const px = labelX - pw / 2;
    const py = y - ph / 2;

    // Pill background
    ctx.fillStyle = P.bosLabelBg;
    _roundRect(ctx, px, py, pw, ph, R);
    ctx.fill();

    // Pill border (dashed to match line)
    ctx.strokeStyle = color;
    ctx.lineWidth   = 0.75;
    ctx.setLineDash([3, 2]);
    _roundRect(ctx, px, py, pw, ph, R);
    ctx.stroke();
    ctx.setLineDash([]);

    // Text
    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX, y);
  }
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
