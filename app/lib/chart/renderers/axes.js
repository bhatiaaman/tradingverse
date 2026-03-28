// ─── Axes Renderer ────────────────────────────────────────────────────────────
// Draws: grid lines, price labels (right axis), time labels (bottom axis),
// axis borders, and the last-price pill.

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

function fmtPrice(p) {
  if (p >= 10000) return p.toFixed(0);
  if (p >= 1000)  return p.toFixed(1);
  return p.toFixed(2);
}

function fmtTime(unixSec, interval) {
  const d = new Date(unixSec * 1000 + IST_OFFSET_MS);
  if (interval === 'day' || interval === 'week') {
    const dd = d.getUTCDate().toString().padStart(2, '0');
    const mo = d.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });
    return `${dd} ${mo}`;
  }
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function fmtDate(unixSec) {
  const d  = new Date(unixSec * 1000 + IST_OFFSET_MS);
  const dd = d.getUTCDate();
  const mo = d.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });
  return `${dd} ${mo}`;
}

// Returns an integer date key in IST (year*10000 + month*100 + day)
function istDateKey(unixSec) {
  const d = new Date(unixSec * 1000 + IST_OFFSET_MS);
  return d.getUTCFullYear() * 10000 + d.getUTCMonth() * 100 + d.getUTCDate();
}

// Pick a "nice" step size for price grid lines
function niceStep(rawStep) {
  const mag  = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let nice;
  if      (norm <= 1)   nice = 1;
  else if (norm <= 2)   nice = 2;
  else if (norm <= 2.5) nice = 2.5;
  else if (norm <= 5)   nice = 5;
  else                  nice = 10;
  return nice * mag;
}

export function renderAxes(ctx, vp, candles, interval) {
  const { chartLeft, chartRight, chartTop, chartBottom, chartH, chartW,
          PRICE_AXIS_W, TIME_AXIS_H, width, height, timeAxisTop } = vp;

  ctx.save();

  // ── Price axis background (full height) ─────────────────────────────────────
  ctx.fillStyle = '#0c1a2e';
  ctx.fillRect(chartRight, 0, PRICE_AXIS_W, height);

  // ── Time axis background — sits at the very bottom, below any sub-panes ─────
  ctx.fillStyle = '#0c1a2e';
  ctx.fillRect(0, timeAxisTop, width, TIME_AXIS_H);

  // ── Price grid + labels ──────────────────────────────────────────────────────
  const range     = vp.priceMax - vp.priceMin;
  const tickCount = Math.max(3, Math.floor(chartH / 55));
  const step      = niceStep(range / tickCount);
  const firstTick = Math.ceil(vp.priceMin / step) * step;

  ctx.font         = '11px monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'left';

  for (let p = firstTick; p <= vp.priceMax + step * 0.01; p += step) {
    const y = Math.round(vp.priceToY(p));
    if (y < chartTop || y > chartBottom) continue;

    // Grid line
    ctx.strokeStyle = 'rgba(66,99,235,0.1)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();

    // Price label
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(fmtPrice(p), chartRight + 6, y);
  }

  // ── Price axis border ────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(66,99,235,0.25)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(chartRight, chartTop);
  ctx.lineTo(chartRight, chartBottom);
  ctx.stroke();

  // ── Last-price pill ──────────────────────────────────────────────────────────
  if (candles?.length) {
    const lastClose = candles[candles.length - 1].close;
    const prevClose = candles.length > 1 ? candles[candles.length - 2].close : lastClose;
    const lY = vp.priceToY(lastClose);

    if (lY >= chartTop && lY <= chartBottom) {
      const pillColor = lastClose >= prevClose ? '#10b981' : '#ef4444';
      const pillH = 16, pillW = PRICE_AXIS_W - 4;
      ctx.fillStyle = pillColor;
      ctx.beginPath();
      ctx.roundRect(chartRight + 2, lY - pillH / 2, pillW, pillH, 3);
      ctx.fill();

      ctx.strokeStyle = pillColor;
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(chartLeft, lY);
      ctx.lineTo(chartRight, lY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle    = '#fff';
      ctx.font         = 'bold 10px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmtPrice(lastClose), chartRight + 2 + pillW / 2, lY);
    }
  }

  // ── Time grid + labels ───────────────────────────────────────────────────────
  if (!candles?.length) { ctx.restore(); return; }

  const from         = Math.max(0, Math.floor(vp.logFrom));
  const to           = Math.min(candles.length - 1, Math.ceil(vp.logTo));
  const visibleCount = Math.max(1, to - from);
  const labelPxW     = interval === 'day' || interval === 'week' ? 58 : 46;
  const maxLabels    = Math.max(1, Math.floor(chartW / labelPxW));
  const skip         = Math.max(1, Math.ceil(visibleCount / maxLabels));
  const startI       = Math.ceil(from / skip) * skip;

  const isIntraday = interval !== 'day' && interval !== 'week';
  const labelMidY  = timeAxisTop + TIME_AXIS_H / 2;

  // ── Date-boundary detection (intraday only) ─────────────────────────────────
  // Map of bar index → true for bars that are the first of a new IST date
  const dateBoundarySet = new Set();
  if (isIntraday) {
    for (let i = Math.max(1, from); i <= to; i++) {
      if (istDateKey(candles[i].time) !== istDateKey(candles[i - 1].time)) {
        dateBoundarySet.add(i);
      }
    }
  }

  // Draw date-boundary separator lines first (behind everything)
  for (const bi of dateBoundarySet) {
    const x = Math.round(vp.barCenterX(bi));
    if (x < chartLeft || x > chartRight) continue;
    ctx.strokeStyle = 'rgba(148,163,184,0.15)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x, chartTop);
    ctx.lineTo(x, timeAxisTop);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Regular time tick grid lines + labels
  ctx.font         = '10px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (let i = startI; i <= to; i += skip) {
    if (i < 0 || i >= candles.length) continue;
    const x = Math.round(vp.barCenterX(i));
    if (x < chartLeft + 20 || x > chartRight - 10) continue;

    // Vertical grid line in main chart area
    ctx.strokeStyle = 'rgba(66,99,235,0.08)';
    ctx.lineWidth   = 1; ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, chartTop);
    ctx.lineTo(x, chartBottom);
    ctx.stroke();

    // Show date label if this tick is (near) a date boundary, else show time
    const nearBoundary = dateBoundarySet.has(i) || dateBoundarySet.has(i + 1);
    if (isIntraday && nearBoundary) {
      // Pick the actual boundary bar for the label x
      const bi = dateBoundarySet.has(i) ? i : i + 1;
      const bx = Math.round(vp.barCenterX(bi));
      ctx.fillStyle = '#64748b';
      ctx.font      = 'bold 10px monospace';
      ctx.fillText(fmtDate(candles[bi].time), bx, labelMidY);
      ctx.font      = '10px monospace';
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(fmtTime(candles[i].time, interval), x, labelMidY);
    }
  }

  // Draw date labels for any boundaries NOT already covered by a regular tick
  ctx.font      = 'bold 10px monospace';
  ctx.fillStyle = '#64748b';
  for (const bi of dateBoundarySet) {
    const x = Math.round(vp.barCenterX(bi));
    if (x < chartLeft + 24 || x > chartRight - 10) continue;
    // Check if already labelled by a nearby regular tick
    const nearTick = (bi - (bi % skip)) === bi || Math.abs((bi % skip) - skip) < 2;
    if (!nearTick) {
      ctx.fillText(fmtDate(candles[bi].time), x, labelMidY);
    }
  }
  ctx.font = '10px monospace';

  // ── Time axis top border ──────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(66,99,235,0.25)';
  ctx.lineWidth   = 1; ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(chartLeft, timeAxisTop);
  ctx.lineTo(chartRight, timeAxisTop);
  ctx.stroke();

  ctx.restore();
}
