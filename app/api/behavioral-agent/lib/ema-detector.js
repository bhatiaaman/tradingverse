// ═══════════════════════════════════════════════════════════════════════
// EMA DETECTOR — Calculate EMAs and find nearby levels
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calculate EMA for a given period
 * @param {Array} candles - Array of {time, open, high, low, close, volume}
 * @param {Number} period - EMA period (9, 21, 50, 200)
 * @returns {Number|null} - Current EMA value or null if insufficient data
 */
function calcEMA(candles, period) {
  if (!candles || candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Detect all EMA stations for a given timeframe
 * @param {Array} candles - Candle data
 * @param {String} timeframe - '5m', '15m', 'Daily'
 * @param {Number} currentPrice - Current market price
 * @returns {Array} - Array of EMA station objects
 */
export function detectEMAStations(candles, timeframe, currentPrice) {
  if (!candles || candles.length < 200) {
    // Need at least 200 candles for EMA200
    return [];
  }

  const periods = [9, 21, 50, 200];
  const stations = [];

  for (const period of periods) {
    const ema = calcEMA(candles, period);
    if (!ema) continue;

    const distance = Math.abs((currentPrice - ema) / ema * 100); // % distance
    
    // Only consider "near" if within 2% (will tighten in clustering phase)
    if (distance < 2.0) {
      stations.push({
        type: 'EMA',
        timeframe,
        period,
        price: ema,
        distance,
        label: `${timeframe} EMA${period}`,
        strength: getEMAStrength(period), // Longer EMAs = stronger support/resistance
      });
    }
  }

  return stations;
}

/**
 * Get relative strength of an EMA (longer = stronger)
 */
function getEMAStrength(period) {
  if (period >= 200) return 5;
  if (period >= 50) return 4;
  if (period >= 21) return 3;
  return 2; // EMA9
}

/**
 * Detect all EMAs across multiple timeframes
 * @param {Object} candles - { candles5m, candles15m, candlesDaily }
 * @param {Number} currentPrice
 * @returns {Array} - All EMA stations
 */
export function detectAllEMAs(candles, currentPrice) {
  const stations = [];

  if (candles.candles5m) {
    stations.push(...detectEMAStations(candles.candles5m, '5m', currentPrice));
  }

  if (candles.candles15m) {
    stations.push(...detectEMAStations(candles.candles15m, '15m', currentPrice));
  }

  if (candles.candlesDaily) {
    stations.push(...detectEMAStations(candles.candlesDaily, 'Daily', currentPrice));
  }

  return stations;
}