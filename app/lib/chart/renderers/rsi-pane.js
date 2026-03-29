// ─── RSI Sub-Pane Renderer ────────────────────────────────────────────────────
// Draws inside the chart canvas, below the main pane, above the time axis.
// Uses the same Viewport logFrom/logTo as the candle chart — always in sync.

import { DARK } from '../palette.js';

export function renderRSIPane(ctx, vp, rsiValues, rsiMAValues, snapIndex, label, palette) {
  if (vp.rsiPaneH <= 0 || !rsiValues?.length) return;
  const P = palette ?? DARK;

  const paneTop = vp.rsiPaneTop;
  const paneBot = vp.rsiPaneBot;
  const paneH   = vp.rsiPaneH;
  const left    = vp.chartLeft;
  const right   = vp.chartRight;
  const paneW   = right - left;

  const yF = v => paneBot - (v / 100) * paneH;

  // Background
  ctx.fillStyle = P.rsiPaneBg;
  ctx.fillRect(left, paneTop, paneW, paneH);

  // Top border
  ctx.strokeStyle = P.rsiPaneBorder;
  ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(left, paneTop + 0.5); ctx.lineTo(right, paneTop + 0.5); ctx.stroke();

  // Flat zone backgrounds (very subtle)
  ctx.fillStyle = 'rgba(239,68,68,0.03)';
  ctx.fillRect(left, paneTop, paneW, yF(70) - paneTop);
  ctx.fillStyle = 'rgba(34,197,94,0.03)';
  ctx.fillRect(left, yF(30), paneW, paneBot - yF(30));

  // Grid lines: 70, 50, 30
  // 70 + 30: dashed coloured
  [[70, 'rgba(239,68,68,0.30)'], [30, 'rgba(34,197,94,0.30)']].forEach(([val, col]) => {
    ctx.strokeStyle = col; ctx.lineWidth = 0.75; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(left, yF(val)); ctx.lineTo(right, yF(val)); ctx.stroke();
  });
  // 50: solid, always visible
  ctx.strokeStyle = 'rgba(148,163,184,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(left, yF(50)); ctx.lineTo(right, yF(50)); ctx.stroke();

  // Level labels — right side of pane (TV style)
  ctx.font = '9px monospace'; ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(239,68,68,0.55)';  ctx.fillText('70', right - 4, yF(70) - 2);
  ctx.fillStyle = 'rgba(148,163,184,0.40)'; ctx.fillText('50', right - 4, yF(50) + 4);
  ctx.fillStyle = 'rgba(34,197,94,0.55)';  ctx.fillText('30', right - 4, yF(30) + 9);

  // Clip to pane for RSI lines + dynamic fills
  ctx.save();
  ctx.beginPath(); ctx.rect(left, paneTop, paneW, paneH); ctx.clip();

  const fromIdx = Math.max(0, Math.floor(vp.logFrom));
  const toIdx   = Math.min(rsiValues.length - 1, Math.ceil(vp.logTo));

  // ── Dynamic fill: overbought (RSI > 70) red, oversold (RSI < 30) green ──────
  // We build two separate filled paths tracing the RSI curve in those zones.
  const drawDynamicFill = (threshold, above, fillColor) => {
    const baseY = yF(threshold);
    ctx.beginPath();
    let inZone = false;
    for (let i = fromIdx; i <= toIdx; i++) {
      const v = rsiValues[i];
      if (v == null) { if (inZone) { ctx.lineTo(vp.barCenterX(i - 1), baseY); ctx.closePath(); ctx.fill(); ctx.beginPath(); inZone = false; } continue; }
      const inThisZone = above ? v > threshold : v < threshold;
      const x = vp.barCenterX(i);
      const y = yF(v);
      if (inThisZone && !inZone) {
        // Start a new fill segment from the baseline
        ctx.moveTo(x, baseY);
        ctx.lineTo(x, y);
        inZone = true;
      } else if (inThisZone) {
        ctx.lineTo(x, y);
      } else if (inZone) {
        // Close back to baseline
        ctx.lineTo(x, baseY);
        ctx.closePath(); ctx.fill(); ctx.beginPath();
        inZone = false;
      }
    }
    if (inZone) {
      const lastX = vp.barCenterX(toIdx);
      ctx.lineTo(lastX, baseY);
      ctx.closePath(); ctx.fill();
    }
  };

  ctx.fillStyle = 'rgba(239,68,68,0.18)';
  drawDynamicFill(70, true, 'rgba(239,68,68,0.18)');
  ctx.fillStyle = 'rgba(34,197,94,0.18)';
  drawDynamicFill(30, false, 'rgba(34,197,94,0.18)');

  // ── RSI line ─────────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  let moved = false;
  for (let i = fromIdx; i <= toIdx; i++) {
    const v = rsiValues[i];
    if (v == null) { moved = false; continue; }
    const x = vp.barCenterX(i);
    const y = yF(v);
    if (moved) ctx.lineTo(x, y); else { ctx.moveTo(x, y); moved = true; }
  }
  ctx.stroke();

  // ── RSI MA line ───────────────────────────────────────────────────────────────
  if (rsiMAValues) {
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1; moved = false;
    ctx.beginPath();
    for (let i = fromIdx; i <= toIdx; i++) {
      const v = rsiMAValues[i];
      if (v == null) { moved = false; continue; }
      const x = vp.barCenterX(i);
      const y = yF(v);
      if (moved) ctx.lineTo(x, y); else { ctx.moveTo(x, y); moved = true; }
    }
    ctx.stroke();
  }

  ctx.restore();

  // ── Value label (top-left of pane, TV style) ─────────────────────────────────
  const idx    = snapIndex ?? (rsiValues.length - 1);
  const rsiVal = rsiValues[idx];
  const maVal  = rsiMAValues?.[idx];
  if (rsiVal != null) {
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
    const rsiText = `${label ?? 'RSI'} ${rsiVal.toFixed(1)}`;
    ctx.fillStyle = '#818cf8';
    ctx.fillText(rsiText, left + 6, paneTop + 13);
    if (maVal != null) {
      const rsiW = ctx.measureText(rsiText).width;
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(maVal.toFixed(1), left + 6 + rsiW + 6, paneTop + 13);
    }
  }
}
