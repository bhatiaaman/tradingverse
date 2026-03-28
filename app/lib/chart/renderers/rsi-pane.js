// ─── RSI Sub-Pane Renderer ────────────────────────────────────────────────────
// Draws inside the chart canvas, below the main pane, above the time axis.
// Uses the same Viewport logFrom/logTo as the candle chart — always in sync.

export function renderRSIPane(ctx, vp, rsiValues, rsiMAValues, snapIndex, label) {
  if (vp.rsiPaneH <= 0 || !rsiValues?.length) return;

  const paneTop = vp.rsiPaneTop;
  const paneBot = vp.rsiPaneBot;
  const paneH   = vp.rsiPaneH;
  const left    = vp.chartLeft;
  const right   = vp.chartRight;
  const paneW   = right - left;

  // Background
  ctx.fillStyle = '#070b13';
  ctx.fillRect(left, paneTop, paneW, paneH);

  // Top border (drag handle hint)
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(left, paneTop + 0.5); ctx.lineTo(right, paneTop + 0.5); ctx.stroke();

  const yF = v => paneBot - (v / 100) * paneH;

  // Zone fills
  ctx.fillStyle = 'rgba(239,68,68,0.04)';
  ctx.fillRect(left, paneTop, paneW, yF(70) - paneTop);
  ctx.fillStyle = 'rgba(34,197,94,0.04)';
  ctx.fillRect(left, yF(30), paneW, paneBot - yF(30));

  // Grid lines
  [[70, 'rgba(239,68,68,0.22)'], [50, 'rgba(148,163,184,0.1)'], [30, 'rgba(34,197,94,0.22)']].forEach(([val, col]) => {
    ctx.strokeStyle = col; ctx.lineWidth = 0.75; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(left, yF(val)); ctx.lineTo(right, yF(val)); ctx.stroke();
  });
  ctx.setLineDash([]);

  // Level labels (left side)
  ctx.font = '9px monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(239,68,68,0.5)'; ctx.fillText('70', left + 4, yF(70) - 2);
  ctx.fillStyle = 'rgba(148,163,184,0.4)'; ctx.fillText('50', left + 4, yF(50) + 4);
  ctx.fillStyle = 'rgba(34,197,94,0.5)'; ctx.fillText('30', left + 4, yF(30) + 9);

  // Clip to pane
  ctx.save();
  ctx.beginPath(); ctx.rect(left, paneTop, paneW, paneH); ctx.clip();

  const fromIdx = Math.max(0, Math.floor(vp.logFrom));
  const toIdx   = Math.min(rsiValues.length - 1, Math.ceil(vp.logTo));

  // RSI line
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

  // RSI MA line
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

  // ── Value label (top-left of pane) ──────────────────────────────────────────
  const idx     = snapIndex ?? (rsiValues.length - 1);
  const rsiVal  = rsiValues[idx];
  const maVal   = rsiMAValues?.[idx];
  if (rsiVal != null) {
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#818cf8';
    ctx.fillText(`${label ?? 'RSI'} ${rsiVal.toFixed(1)}`, left + 6, paneTop + 13);
    if (maVal != null) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(`MA ${maVal.toFixed(1)}`, left + 6 + 80, paneTop + 13);
    }
  }
}
