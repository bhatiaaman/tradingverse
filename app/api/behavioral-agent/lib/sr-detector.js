// ═══════════════════════════════════════════════════════════════════════
// SUPPORT/RESISTANCE DETECTOR — Find swing highs and lows
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detect swing highs (local peaks where price reversed down)
 * @param {Array} candles - Array of candles
 * @param {Number} lookback - How many candles to look back
 * @param {Number} threshold - Minimum % move to qualify as swing (default 1%)
 * @returns {Array} - Array of swing high prices
 */
function detectSwingHighs(candles, lookback = 5, threshold = 1.0) {
  if (!candles || candles.length < lookback * 2 + 1) return [];
  
  const swings = [];
  
  // Start from lookback, end at length - lookback (need candles on both sides)
  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i].high;
    
    // Check if this is higher than all candles in lookback window on both sides
    let isSwingHigh = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= current || candles[i + j].high >= current) {
        isSwingHigh = false;
        break;
      }
    }
    
    if (isSwingHigh) {
      // Verify it's a significant swing (not just noise)
      const leftLow = Math.min(...candles.slice(i - lookback, i).map(c => c.low));
      const rightLow = Math.min(...candles.slice(i + 1, i + lookback + 1).map(c => c.low));
      const minLow = Math.min(leftLow, rightLow);
      const movePercent = ((current - minLow) / minLow) * 100;
      
      if (movePercent >= threshold) {
        swings.push({
          price: current,
          index: i,
          movePercent,
          time: candles[i].time,
        });
      }
    }
  }
  
  return swings;
}

/**
 * Detect swing lows (local troughs where price reversed up)
 */
function detectSwingLows(candles, lookback = 5, threshold = 1.0) {
  if (!candles || candles.length < lookback * 2 + 1) return [];
  
  const swings = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i].low;
    
    let isSwingLow = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].low <= current || candles[i + j].low <= current) {
        isSwingLow = false;
        break;
      }
    }
    
    if (isSwingLow) {
      const leftHigh = Math.max(...candles.slice(i - lookback, i).map(c => c.high));
      const rightHigh = Math.max(...candles.slice(i + 1, i + lookback + 1).map(c => c.high));
      const maxHigh = Math.max(leftHigh, rightHigh);
      const movePercent = ((maxHigh - current) / current) * 100;
      
      if (movePercent >= threshold) {
        swings.push({
          price: current,
          index: i,
          movePercent,
          time: candles[i].time,
        });
      }
    }
  }
  
  return swings;
}

/**
 * Detect S/R stations from swing points
 * @param {Array} candles - Candle data
 * @param {String} timeframe - '5m', '15m', 'Daily'
 * @param {Number} currentPrice
 * @param {Number} maxLookback - How many recent swings to consider (default 20)
 * @returns {Array} - Array of S/R station objects
 */
export function detectSRStations(candles, timeframe, currentPrice, maxLookback = 20) {
  if (!candles || candles.length < 30) return [];
  
  // Detect recent swing points
  const swingHighs = detectSwingHighs(candles, 5, 1.0);
  const swingLows = detectSwingLows(candles, 5, 1.0);
  
  // Take only recent swings (last N)
  const recentHighs = swingHighs.slice(-maxLookback);
  const recentLows = swingLows.slice(-maxLookback);
  
  const stations = [];
  
  // Convert swing highs to resistance stations
  for (const swing of recentHighs) {
    const distance = Math.abs((currentPrice - swing.price) / swing.price * 100);
    
    if (distance < 5.0) { // Within 5% of current price
      // Count how many times this level was tested (price came within 0.5% of it)
      const tests = countTests(candles, swing.price, 0.5);
      
      stations.push({
        type: 'RESISTANCE',
        timeframe,
        price: swing.price,
        distance,
        label: `${timeframe} Resistance`,
        strength: Math.min(5, tests), // More tests = stronger level (cap at 5)
        tests,
        lastTest: swing.time,
      });
    }
  }
  
  // Convert swing lows to support stations
  for (const swing of recentLows) {
    const distance = Math.abs((currentPrice - swing.price) / swing.price * 100);
    
    if (distance < 5.0) {
      const tests = countTests(candles, swing.price, 0.5);
      
      stations.push({
        type: 'SUPPORT',
        timeframe,
        price: swing.price,
        distance,
        label: `${timeframe} Support`,
        strength: Math.min(5, tests),
        tests,
        lastTest: swing.time,
      });
    }
  }
  
  return stations;
}

/**
 * Count how many times price tested a level (came within threshold %)
 */
function countTests(candles, level, thresholdPercent = 0.5) {
  let count = 0;
  let lastTestIndex = -10; // Prevent counting consecutive candles as separate tests
  
  for (let i = 0; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    
    // Check if candle touched this level
    const highDist = Math.abs((high - level) / level * 100);
    const lowDist = Math.abs((low - level) / level * 100);
    
    if (highDist <= thresholdPercent || lowDist <= thresholdPercent) {
      // Only count if not part of same test (at least 5 candles apart)
      if (i - lastTestIndex > 5) {
        count++;
        lastTestIndex = i;
      }
    }
  }
  
  return count;
}

/**
 * Detect all S/R across multiple timeframes
 */
export function detectAllSR(candles, currentPrice) {
  const stations = [];
  
  if (candles.candles5m) {
    stations.push(...detectSRStations(candles.candles5m, '5m', currentPrice, 20));
  }
  
  if (candles.candles15m) {
    stations.push(...detectSRStations(candles.candles15m, '15m', currentPrice, 15));
  }
  
  if (candles.candlesDaily) {
    stations.push(...detectSRStations(candles.candlesDaily, 'Daily', currentPrice, 10));
  }
  
  return stations;
}