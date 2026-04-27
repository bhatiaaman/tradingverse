// ── Composite Bias Curve (CBC) Renderer ──────────────────────────────────────
// Draws 3 layers: zone fills → band lines → base curve → markers
// All fills use very low alpha so candles remain clearly visible.
//
// cbcData shape (from computeCBC):
//   { base, upper, lower, regime, adxStrong, divDots, times }
//   Each array is aligned to the candle array by index.

const COLORS = {
  base:       'rgba(203,213,225,0.90)',   // slate-300 — base curve
  upper:      'rgba(34,197,94,0.80)',     // green-500 — upper band line
  lower:      'rgba(239,68,68,0.80)',     // red-500   — lower band line
  fillBull:   'rgba(34,197,94,0.055)',    // very subtle green above upper
  fillBear:   'rgba(239,68,68,0.055)',    // very subtle red below lower
  fillChop:   'rgba(100,116,139,0.045)', // barely visible grey between bands
  adxDiamond: 'rgba(251,191,36,0.85)',   // amber-400 — ADX confirmed bars
  divBull:    'rgba(34,197,94,1.0)',      // green dot — bullish divergence
  divBear:    'rgba(239,68,68,1.0)',      // red dot   — bearish divergence
};

// Convert unix timestamp → canvas X using the viewport object
function timeToX(vp, time) {
  const { x0, x1, tMin, tMax } = vp;
  if (tMax === tMin) return x0;
  return x0 + ((time - tMin) / (tMax - tMin)) * (x1 - x0);
}

function priceToY(vp, price) {
  const { y0, y1, pMin, pMax } = vp;
  if (pMax === pMin) return y0;
  return y1 - ((price - pMin) / (pMax - pMin)) * (y1 - y0);
}

// Build a canvas path along one of the band arrays
function buildPath(ctx, vp, times, values) {
  let started = false;
  ctx.beginPath();
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (v == null) { started = false; continue; }
    const x = timeToX(vp, times[i]);
    const y = priceToY(vp, v);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else            ctx.lineTo(x, y);
  }
}

// Fill zone between two value arrays (can be null-gapped)
function fillZone(ctx, vp, times, topVals, bottomVals, color) {
  ctx.save();
  ctx.fillStyle = color;

  // Walk forward along top, then backward along bottom
  const pts = [];
  for (let i = 0; i < times.length; i++) {
    if (topVals[i] != null && bottomVals[i] != null) pts.push(i);
  }
  if (pts.length < 2) { ctx.restore(); return; }

  ctx.beginPath();
  ctx.moveTo(timeToX(vp, times[pts[0]]), priceToY(vp, topVals[pts[0]]));
  for (const i of pts) ctx.lineTo(timeToX(vp, times[i]), priceToY(vp, topVals[i]));
  for (let k = pts.length - 1; k >= 0; k--) {
    const i = pts[k];
    ctx.lineTo(timeToX(vp, times[i]), priceToY(vp, bottomVals[i]));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function renderCBC(ctx, vp, cbcData, opts = {}) {
  if (!cbcData) return;
  const { base, upper, lower, adxStrong, divDots, times } = cbcData;
  const { showDivDots = true, showAdxFilter = true } = opts;

  const { x0, x1, y0, y1 } = vp;

  ctx.save();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();

  // ── Layer 1: Zone fills ─────────────────────────────────────────────────

  // Bull zone: upper band → chart top
  const topEdge = new Array(times.length).fill(vp.pMax + (vp.pMax - vp.pMin) * 0.1);
  fillZone(ctx, vp, times, topEdge,  upper, COLORS.fillBull);

  // Chop zone: lower band → upper band
  fillZone(ctx, vp, times, upper, lower, COLORS.fillChop);

  // Bear zone: chart bottom → lower band
  const botEdge = new Array(times.length).fill(vp.pMin - (vp.pMax - vp.pMin) * 0.1);
  fillZone(ctx, vp, times, lower, botEdge, COLORS.fillBear);

  // ── Layer 2: Band lines ─────────────────────────────────────────────────

  // Upper band (green, dashed)
  ctx.save();
  ctx.strokeStyle = COLORS.upper;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  buildPath(ctx, vp, times, upper);
  ctx.stroke();
  ctx.restore();

  // Lower band (red, dashed)
  ctx.save();
  ctx.strokeStyle = COLORS.lower;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  buildPath(ctx, vp, times, lower);
  ctx.stroke();
  ctx.restore();

  // ── Layer 3: Base curve (white, solid, slightly thicker) ────────────────
  ctx.save();
  ctx.strokeStyle = COLORS.base;
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([]);
  buildPath(ctx, vp, times, base);
  ctx.stroke();
  ctx.restore();

  // ── Layer 4: ADX strength diamonds on base curve ────────────────────────
  if (showAdxFilter && adxStrong) {
    ctx.save();
    ctx.fillStyle = COLORS.adxDiamond;
    for (let i = 0; i < times.length; i++) {
      if (!adxStrong[i] || base[i] == null) continue;
      const x = timeToX(vp, times[i]);
      const y = priceToY(vp, base[i]);
      const r = 3;
      ctx.beginPath();
      ctx.moveTo(x,     y - r); // top
      ctx.lineTo(x + r, y);     // right
      ctx.lineTo(x,     y + r); // bottom
      ctx.lineTo(x - r, y);     // left
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Layer 5: RSI divergence dots ────────────────────────────────────────
  if (showDivDots && divDots) {
    for (let i = 0; i < times.length; i++) {
      const dot = divDots[i];
      if (!dot) continue;
      const x = timeToX(vp, times[i]);
      const y = priceToY(vp, dot.price);
      const isBull = dot.type === 'bull';

      ctx.save();
      // Outer glow ring
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = isBull
        ? 'rgba(34,197,94,0.20)'
        : 'rgba(239,68,68,0.20)';
      ctx.fill();
      // Solid dot
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = isBull ? COLORS.divBull : COLORS.divBear;
      ctx.fill();
      // Direction arrow text
      ctx.fillStyle = isBull ? COLORS.divBull : COLORS.divBear;
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isBull ? '▲' : '▼', x, isBull ? y + 14 : y - 7);
      ctx.restore();
    }
  }

  ctx.restore();
}
