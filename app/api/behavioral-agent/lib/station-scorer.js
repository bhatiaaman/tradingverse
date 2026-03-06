// ═══════════════════════════════════════════════════════════════════════
// STATION SCORER — Cluster nearby levels and calculate quality scores
// ═══════════════════════════════════════════════════════════════════════

/**
 * Cluster stations that are within clusterThreshold % of each other
 * @param {Array} stations - All detected stations (EMAs + S/R)
 * @param {Number} clusterThreshold - % distance to consider same cluster (default 0.5%)
 * @returns {Array} - Array of clustered stations
 */
export function clusterStations(stations, clusterThreshold = 0.5) {
  if (!stations || stations.length === 0) return [];
  
  // Sort by price
  const sorted = [...stations].sort((a, b) => a.price - b.price);
  
  const clusters = [];
  let currentCluster = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = currentCluster[currentCluster.length - 1];
    const current = sorted[i];
    
    const priceDiff = Math.abs((current.price - prev.price) / prev.price * 100);
    
    if (priceDiff <= clusterThreshold) {
      // Same cluster
      currentCluster.push(current);
    } else {
      // New cluster
      clusters.push(currentCluster);
      currentCluster = [current];
    }
  }
  
  // Don't forget last cluster
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }
  
  // Convert clusters to station objects
  return clusters.map(cluster => buildClusterStation(cluster));
}

/**
 * Build a single station object from a cluster of levels
 */
function buildClusterStation(cluster) {
  // Calculate average price (weighted by strength)
  const totalStrength = cluster.reduce((sum, s) => sum + (s.strength || 1), 0);
  const avgPrice = cluster.reduce((sum, s) => sum + s.price * (s.strength || 1), 0) / totalStrength;
  
  // Determine station type (majority vote)
  const typeCount = {};
  for (const s of cluster) {
    typeCount[s.type] = (typeCount[s.type] || 0) + 1;
  }
  const dominantType = Object.keys(typeCount).sort((a, b) => typeCount[b] - typeCount[a])[0];
  
  // Collect all factors
  const factors = cluster.map(s => s.label);
  
  // Count unique timeframes (multi-timeframe = stronger)
  const timeframes = [...new Set(cluster.map(s => s.timeframe))];
  
  // Calculate quality score (0-10)
  const quality = calculateQuality(cluster, timeframes.length);
  
  // Determine if support or resistance
  const isSupport = dominantType === 'SUPPORT' || dominantType === 'EMA'; // EMAs act as support when below
  const isResistance = dominantType === 'RESISTANCE';
  
  return {
    price: avgPrice,
    type: isSupport && isResistance ? 'PIVOT' : (isSupport ? 'SUPPORT' : 'RESISTANCE'),
    quality,
    factors,
    timeframes,
    factorCount: cluster.length,
    strength: Math.round(cluster.reduce((sum, s) => sum + (s.strength || 1), 0) / cluster.length),
    tests: Math.max(...cluster.map(s => s.tests || 0)),
    distance: cluster[0].distance, // Use first station's distance (all are close anyway)
  };
}

/**
 * Calculate station quality score (0-10)
 * Higher score = more reliable station
 */
function calculateQuality(cluster, timeframeCount) {
  let score = 0;
  
  // Factor 1: Number of converging levels (max 4 points)
  score += Math.min(4, cluster.length);
  
  // Factor 2: Multi-timeframe confirmation (max 3 points)
  if (timeframeCount >= 3) score += 3;       // All 3 timeframes
  else if (timeframeCount === 2) score += 2; // 2 timeframes
  else score += 1;                           // Single timeframe
  
  // Factor 3: Test history (max 3 points)
  const maxTests = Math.max(...cluster.map(s => s.tests || 0));
  if (maxTests >= 5) score += 3;
  else if (maxTests >= 3) score += 2;
  else if (maxTests >= 1) score += 1;
  
  return Math.min(10, score);
}

/**
 * Find the station closest to current price
 * @param {Array} clusters - All clustered stations
 * @param {Number} currentPrice
 * @returns {Object|null} - Nearest station or null
 */
export function findNearestStation(clusters, currentPrice) {
  if (!clusters || clusters.length === 0) return null;
  
  let nearest = null;
  let minDistance = Infinity;
  
  for (const station of clusters) {
    const distance = Math.abs((currentPrice - station.price) / station.price * 100);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = { ...station, distance };
    }
  }
  
  return nearest;
}

/**
 * Determine if current price is "at a station"
 * @param {Object} nearestStation
 * @param {Number} threshold - % distance to consider "at" (default 0.5%)
 * @returns {Boolean}
 */
export function isAtStation(nearestStation, threshold = 0.5) {
  if (!nearestStation) return false;
  return nearestStation.distance <= threshold;
}

/**
 * Score the trade based on station logic
 * @param {Boolean} atStation - Is price at a station?
 * @param {Object} station - The station object
 * @param {String} transactionType - 'BUY' or 'SELL'
 * @returns {Object} - { suitable, reason, riskAdjustment }
 */
export function scoreTradeVsStation(atStation, station, transactionType) {
  if (!atStation) {
    return {
      suitable: false,
      reason: `Not at a station. Nearest level is ${station?.type} at ₹${station?.price?.toFixed(0)} (${station?.distance?.toFixed(2)}% away)`,
      riskAdjustment: 20, // Add 20 to risk score
    };
  }
  
  // At a station
  const isBuying = transactionType === 'BUY';
  const isSelling = transactionType === 'SELL';
  
  if (station.type === 'SUPPORT' && isBuying) {
    return {
      suitable: true,
      reason: `At ${station.quality >= 7 ? 'STRONG' : 'MODERATE'} support (Quality ${station.quality}/10). ${station.factors.join(' + ')}. Ideal for long entry.`,
      riskAdjustment: -10, // Reduce risk score by 10
    };
  }
  
  if (station.type === 'RESISTANCE' && isSelling) {
    return {
      suitable: true,
      reason: `At ${station.quality >= 7 ? 'STRONG' : 'MODERATE'} resistance (Quality ${station.quality}/10). ${station.factors.join(' + ')}. Ideal for short entry.`,
      riskAdjustment: -10,
    };
  }
  
  if (station.type === 'SUPPORT' && isSelling) {
    return {
      suitable: false,
      reason: `At support (${station.factors.join(' + ')}) but you're selling. High risk of bounce. Wait for breakdown confirmation.`,
      riskAdjustment: 15,
    };
  }
  
  if (station.type === 'RESISTANCE' && isBuying) {
    return {
      suitable: false,
      reason: `At resistance (${station.factors.join(' + ')}) but you're buying. High risk of rejection. Wait for breakout confirmation.`,
      riskAdjustment: 15,
    };
  }
  
  // PIVOT (both support and resistance converge)
  return {
    suitable: true,
    reason: `At PIVOT zone (${station.factors.join(' + ')}). Major decision level — watch for breakout/breakdown.`,
    riskAdjustment: 0,
  };
}