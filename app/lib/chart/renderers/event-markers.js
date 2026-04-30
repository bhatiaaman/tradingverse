// ─── Event Marker Renderer ─────────────────────────────────────────────────────
// Draws vertical dashed lines + top labels for corporate events (results, dividend…)
// eventMarkers: [{ index, type, label, dateISO }]
// type: 'result' | 'dividend' | 'bonus' | 'split' | 'board_meeting' | other

const EVENT_COLORS = {
  result:       '#f97316', // orange
  dividend:     '#10b981', // emerald
  bonus:        '#60a5fa', // blue
  split:        '#a78bfa', // purple
  board_meeting:'#94a3b8', // slate
  default:      '#94a3b8',
};

const EVENT_ICONS = {
  result:       'Q',
  dividend:     'D',
  bonus:        'B',
  split:        'S',
  board_meeting:'M',
  default:      'E',
};

export function renderEventMarkers(ctx, vp, candles, eventMarkers) {
  if (!candles?.length || !eventMarkers?.length) return;

  const from = Math.max(0, Math.floor(vp.logFrom));
  const to   = Math.min(candles.length - 1, Math.ceil(vp.logTo));

  ctx.save();

  for (const m of eventMarkers) {
    const i = m.index;
    if (i == null || i < from || i > to) continue;

    const cx    = vp.barCenterX(i);
    const color = EVENT_COLORS[m.type] ?? EVENT_COLORS.default;
    const icon  = EVENT_ICONS[m.type]  ?? EVENT_ICONS.default;

    // Vertical dashed line spanning the chart area
    ctx.save();
    ctx.beginPath();
    ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
    ctx.clip();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cx, vp.chartTop);
    ctx.lineTo(cx, vp.chartTop + vp.chartH);
    ctx.stroke();
    ctx.restore();

    // Badge at top — circle with letter inside
    const badgeR = 7;
    const badgeY = vp.chartTop + 14;

    ctx.save();
    // Clip to chart area only (allow the badge to sit just inside top edge)
    ctx.beginPath();
    ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
    ctx.clip();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.arc(cx, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#0a0e1a';
    ctx.font        = `bold ${badgeR}px sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, cx, badgeY);

    ctx.restore();
  }
}
