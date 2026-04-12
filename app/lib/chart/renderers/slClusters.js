export function renderSLClusters(ctx, vp, slData, crosshair, candles) {
  if (!slData) return;
  const bsl = slData.topBSLZones || [];
  const ssl = slData.topSSLZones || [];

  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.chartLeft, vp.chartTop, vp.chartW, vp.chartH);
  ctx.clip();

  let hoveredZone = null;

  // Helper to find X coordinate from ms timestamp using binary search on sorted candles
  function getXFromTimestamp(tsMs) {
    if (!candles || candles.length === 0) return vp.chartLeft;
    const tsSec = Math.floor(tsMs / 1000);
    
    let low = 0, high = candles.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (candles[mid].time === tsSec) return vp.barCenterX(mid);
        if (candles[mid].time < tsSec) low = mid + 1;
        else high = mid - 1;
    }
    
    const cand1 = candles[Math.max(0, high)];
    const cand2 = candles[Math.min(candles.length - 1, low)];
    const diff1 = Math.abs(cand1.time - tsSec);
    const diff2 = Math.abs(cand2.time - tsSec);
    
    const bestIdx = diff1 < diff2 ? Math.max(0, high) : Math.min(candles.length - 1, low);
    return Math.max(vp.chartLeft, vp.barCenterX(bestIdx));
  }

  function extractMinTs(components) {
    let m = Infinity;
    if (!components) return m;
    for (const c of components) {
      if (c.timestamp && c.timestamp < m) m = c.timestamp;
      if (c.components) {
        const sub = extractMinTs(c.components);
        if (sub < m) m = sub;
      }
    }
    return m;
  }

  // Draw BSL Roles (Red) meaning prices to push UP to hit SLs
  for (const z of bsl) {
    const yTop = vp.priceToY(z.range.max);
    const yBot = vp.priceToY(z.range.min);
    
    let h = Math.abs(yBot - yTop);
    let realTop = Math.min(yTop, yBot);
    
    if (h < 4) {
      realTop -= (4 - h) / 2;
      h = 4;
    }
    
    // Find origin X (earliest pivot timestamp in cluster)
    const minTs = extractMinTs(z.components);
    const startX = minTs !== Infinity ? getXFromTimestamp(minTs) : vp.chartLeft;
    const w = vp.chartRight - startX;

    // Subtly fill across the chart
    ctx.fillStyle = 'rgba(239,68,68,0.08)';
    ctx.fillRect(startX, realTop, w, h);
    
    // Top & Bottom horizontal lines
    ctx.strokeStyle = 'rgba(239,68,68,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, realTop);
    ctx.lineTo(vp.chartRight, realTop);
    ctx.moveTo(startX, realTop + h);
    ctx.lineTo(vp.chartRight, realTop + h);
    ctx.stroke();

    if (crosshair?.visible && crosshair.y >= realTop && crosshair.y <= realTop + h && crosshair.x >= startX) {
      hoveredZone = { ...z, side: 'Resistance', color: 'rgba(239,68,68,0.95)' };
    }
  }

  // Draw SSL Zones (Green) meaning prices to push DOWN to hit SLs
  for (const z of ssl) {
    const yTop = vp.priceToY(z.range.max);
    const yBot = vp.priceToY(z.range.min);
    
    let h = Math.abs(yBot - yTop);
    let realTop = Math.min(yTop, yBot);
    
    if (h < 4) {
       realTop -= (4 - h) / 2;
       h = 4;
    }
    
    const minTs = extractMinTs(z.components);
    const startX = minTs !== Infinity ? getXFromTimestamp(minTs) : vp.chartLeft;
    const w = vp.chartRight - startX;

    ctx.fillStyle = 'rgba(16,185,129,0.08)';
    ctx.fillRect(startX, realTop, w, h);
    
    ctx.strokeStyle = 'rgba(16,185,129,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, realTop);
    ctx.lineTo(vp.chartRight, realTop);
    ctx.moveTo(startX, realTop + h);
    ctx.lineTo(vp.chartRight, realTop + h);
    ctx.stroke();

    if (crosshair?.visible && crosshair.y >= realTop && crosshair.y <= realTop + h && crosshair.x >= startX) {
      hoveredZone = { ...z, side: 'Support', color: 'rgba(16,185,129,0.95)' };
    }
  }
  
  ctx.restore();

  // Draw hovered tooltip outside the clipping plane so it can overflow chart borders
  if (hoveredZone && crosshair?.visible) {
    ctx.save();
    const getStrengthLabel = (s) => s < 50 ? 'Weak' : s < 100 ? 'Moderate' : s < 150 ? 'Strong' : 'Very Strong';
    const txt = `SL ${hoveredZone.side}: ${getStrengthLabel(hoveredZone.score)} (${hoveredZone.score})`;
    ctx.font = 'bold 11px monospace';
    const paddingX = 8, paddingY = 5;
    const txtW = ctx.measureText(txt).width;
    const w = txtW + paddingX * 2;
    const h = 20;
    
    // Position near the crosshair
    let x = crosshair.x + 14;
    if (x + w > vp.chartRight - 4) x = crosshair.x - w - 10;
    let y = crosshair.y - h - 5;
    if (y < vp.chartTop) y = crosshair.y + 15;

    // Background shadow
    ctx.shadowColor = hoveredZone.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#060b14'; // Dark background
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();

    // Border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hoveredZone.color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = hoveredZone.color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(txt, x + paddingX, y + h / 2);
    ctx.restore();
  }
}
