// ── Composite Bias Score Pane Renderer ───────────────────────────────────────
// Thin histogram pane. Bar height reflects ATR-normalised distance from each
// reference line — taller = farther from indicator, not just binary direction.
// Avg curve = EMA-9 of raw scores, drawn as a smooth line through the pane.

function scoreColor(s) {
  if (s >=  3.5) return '#15803d';
  if (s >=  2.0) return '#16a34a';
  if (s >=  0.8) return '#22c55e';
  if (s >=  0.2) return '#86efac';
  if (s >  -0.2) return '#475569';
  if (s >  -0.8) return '#fca5a5';
  if (s >  -2.0) return '#f87171';
  if (s >  -3.5) return '#ef4444';
  return '#b91c1c';
}

export function renderBiasScorePane(ctx, vp, scores, snapIndex, avgScores) {
  if (vp.biasScorePaneH <= 0 || !scores?.length) return;

  const paneTop = vp.biasScorePaneTop;
  const paneBot = vp.biasScorePaneBot;
  const paneH   = vp.biasScorePaneH;
  const left    = vp.chartLeft;
  const right   = vp.chartRight;
  const paneW   = right - left;
  const midY    = (paneTop + paneBot) / 2;
  const maxScore = 5;
  const halfH    = paneH / 2 - 3;

  // Background
  ctx.fillStyle = 'rgba(10,14,23,0.92)';
  ctx.fillRect(left, paneTop, paneW, paneH);

  // Top border
  ctx.strokeStyle = 'rgba(100,116,139,0.28)';
  ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(left, paneTop + 0.5); ctx.lineTo(right, paneTop + 0.5); ctx.stroke();

  // Centre line
  ctx.strokeStyle = 'rgba(100,116,139,0.28)';
  ctx.lineWidth = 0.75;
  ctx.beginPath(); ctx.moveTo(left, midY); ctx.lineTo(right, midY); ctx.stroke();

  const fromIdx = Math.max(0, Math.floor(vp.logFrom));
  const toIdx   = Math.min(scores.length - 1, Math.ceil(vp.logTo));
  const barW    = Math.max(1, vp.barW - 1);

  ctx.save();
  ctx.beginPath(); ctx.rect(left, paneTop, paneW, paneH); ctx.clip();

  // ── Histogram bars ────────────────────────────────────────────────────────
  for (let i = fromIdx; i <= toIdx; i++) {
    const s = scores[i];
    if (s == null) continue;
    if (Math.abs(s) < 0.05) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(vp.barCenterX(i) - barW / 2, midY - 1, barW, 2);
      continue;
    }
    const h = (Math.abs(s) / maxScore) * halfH;
    const x = vp.barCenterX(i) - barW / 2;
    const y = s > 0 ? midY - h : midY;
    ctx.fillStyle = scoreColor(s);
    ctx.fillRect(x, y, barW, h);
  }

  // ── Avg curve (EMA of scores) ─────────────────────────────────────────────
  if (avgScores) {
    ctx.strokeStyle = 'rgba(203,213,225,0.90)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    let moved = false;
    for (let i = fromIdx; i <= toIdx; i++) {
      const avg = avgScores[i];
      if (avg == null) { moved = false; continue; }
      const x = vp.barCenterX(i);
      const y = midY - (avg / maxScore) * halfH;
      if (moved) ctx.lineTo(x, y); else { ctx.moveTo(x, y); moved = true; }
    }
    ctx.stroke();
  }

  // ── Zero-cross arrows ─────────────────────────────────────────────────────
  // Bull: avg crosses from ≤0 to >0 with green bars → ▲ near bottom of pane
  // Bear: avg crosses from ≥0 to <0 with red bars  → ▼ near top of pane
  if (avgScores) {
    ctx.font      = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    for (let i = fromIdx + 1; i <= toIdx; i++) {
      const avg     = avgScores[i];
      const avgPrev = avgScores[i - 1];
      const s       = scores[i];
      if (avg == null || avgPrev == null || s == null) continue;

      const bullCross = avgPrev <= 0 && avg > 0 && s > 0;
      const bearCross = avgPrev >= 0 && avg < 0 && s < 0;
      if (!bullCross && !bearCross) continue;

      const x = vp.barCenterX(i);
      if (bullCross) {
        ctx.fillStyle = '#22c55e';
        ctx.fillText('▲', x, paneBot - 4);
      } else {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('▼', x, paneTop + 12);
      }
    }
  }

  ctx.restore();

  // ── Label (top-left) ──────────────────────────────────────────────────────
  const idx = snapIndex ?? (scores.length - 1);
  const val = scores[idx];
  const avg = avgScores?.[idx];
  if (val != null) {
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = scoreColor(val);
    const label = `Bias ${val > 0 ? '+' : ''}${val.toFixed(1)}`;
    ctx.fillText(label, left + 6, paneTop + 13);
    if (avg != null) {
      const w = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(203,213,225,0.70)';
      ctx.fillText(`  avg ${avg > 0 ? '+' : ''}${avg.toFixed(1)}`, left + 6 + w, paneTop + 13);
    }
  }
}
