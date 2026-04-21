// ─── Ichimoku Renderer ────────────────────────────────────────────────────────
// Renders the Tenkan-sen, Kijun-sen, Senkou Span A, Senkou Span B, Chikou Span,
// and the filled Kumo (Cloud) between the Senkou Spans.

export function renderIchimoku(ctx, vp, data, config, palette) {
  if (!data?.length) return;

  const {
    showTenkan = true,
    showKijun = true,
    showCloud = true,
    showChikou = false,
  } = config || {};

  // For the cloud, we must extrapolate into the future.
  // vp.logTo can freely extend beyond the actual data bounds during zooming/panning.
  const startIdx = Math.max(0, Math.floor(vp.logFrom));
  const endIdx   = Math.min(data.length - 1, Math.ceil(vp.logTo));
  if (startIdx > endIdx) return;

  // 1. Draw Kumo (Cloud)
  if (showCloud) {
    let currentPolarity = null; // 1 for A >= B (bullish), -1 for A < B (bearish)
    let segmentStarted = false;
    let segStart = -1;

    // Helper to extract rgba components to inject custom alpha
    const getAlphaColor = (hexOrRgba, alpha) => {
      // Very basic hex to rgba parser since palette usually returns hex for bullBos
      if (hexOrRgba.startsWith('#')) {
         const hex = hexOrRgba.length === 4 
             ? '#' + hexOrRgba[1]+hexOrRgba[1]+hexOrRgba[2]+hexOrRgba[2]+hexOrRgba[3]+hexOrRgba[3]
             : hexOrRgba;
         const r = parseInt(hex.slice(1, 3), 16);
         const g = parseInt(hex.slice(3, 5), 16);
         const b = parseInt(hex.slice(5, 7), 16);
         return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      return hexOrRgba; // fallback if it's already a complex string
    };

    const bullCloudColor = getAlphaColor(palette.bullBos || '#089981', 0.15);
    const bearCloudColor = getAlphaColor(palette.bearBos || '#F23645', 0.15);

    const flushPolygon = (start, end, pol) => {
      if (start >= end) return;
      ctx.beginPath();
      // Forward path for Span A
      for (let i = start; i <= end; i++) {
         ctx.lineTo(vp.barCenterX(i), vp.priceToY(data[i].senkouA));
      }
      // Reverse path for Span B to close the polygon
      for (let i = end; i >= start; i--) {
         ctx.lineTo(vp.barCenterX(i), vp.priceToY(data[i].senkouB));
      }
      ctx.fillStyle = pol === 1 ? bullCloudColor : bearCloudColor;
      ctx.fill();

      // Cloud boundaries (Span A and Span B lines) with a bit more opacity
      ctx.beginPath();
      for (let i = start; i <= end; i++) ctx.lineTo(vp.barCenterX(i), vp.priceToY(data[i].senkouA));
      ctx.strokeStyle = bullCloudColor.replace('0.15', '0.6');
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      for (let i = start; i <= end; i++) ctx.lineTo(vp.barCenterX(i), vp.priceToY(data[i].senkouB));
      ctx.strokeStyle = bearCloudColor.replace('0.15', '0.6');
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    for (let i = startIdx; i <= endIdx; i++) {
       const a = data[i].senkouA;
       const b = data[i].senkouB;
       
       if (a == null || b == null) {
          if (segmentStarted) {
             flushPolygon(segStart, i - 1, currentPolarity);
             segmentStarted = false;
          }
          continue;
       }
       
       const pol = a >= b ? 1 : -1;
       if (!segmentStarted) {
          currentPolarity = pol;
          segStart = i;
          segmentStarted = true;
       } else if (pol !== currentPolarity) {
          // Cloud twisted (Span A crossed Span B)
          flushPolygon(segStart, i, currentPolarity); 
          currentPolarity = pol;
          segStart = i;
       }
    }
    if (segmentStarted) {
       flushPolygon(segStart, endIdx, currentPolarity);
    }
  }

  // 2. Draw Lines
  const drawPath = (key, color, width=1.5) => {
      ctx.beginPath();
      let isDrawing = false;
      for (let i = startIdx; i <= endIdx; i++) {
        if (data[i][key] != null) {
           const x = vp.barCenterX(i);
           const y = vp.priceToY(data[i][key]);
           if (!isDrawing) { ctx.moveTo(x, y); isDrawing = true; }
           else { ctx.lineTo(x, y); }
        } else {
           isDrawing = false; // Need a new moveTo if data restarts (gaps)
        }
      }
      if (isDrawing || true) {
         ctx.strokeStyle = color;
         ctx.lineWidth = width;
         ctx.stroke();
      }
  };

  if (showTenkan) drawPath('tenkan', '#3b82f6', 1.5);   // Blue
  if (showKijun)  drawPath('kijun', '#f59e0b', 1.5);    // Orange
  if (showChikou) drawPath('chikou', '#10b981', 1.5);   // Green
}
