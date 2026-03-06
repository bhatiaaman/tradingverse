// ═══════════════════════════════════════════════════════════════════════
// STATION DETECTOR — Master orchestrator for Phase 1
// ═══════════════════════════════════════════════════════════════════════

import { detectAllEMAs } from './ema-detector.js';
import { detectAllSR } from './sr-detector.js';
import { clusterStations, findNearestStation, isAtStation, scoreTradeVsStation } from './station-scorer.js';

/**
 * Main entry point: Detect all stations and analyze current trade
 * @param {Object} params
 * @param {Object} params.candles - { candles5m, candles15m, candlesDaily }
 * @param {Number} params.currentPrice - Current market price
 * @param {String} params.transactionType - 'BUY' or 'SELL'
 * @returns {Object} - Complete station analysis
 */
export function detectStations({ candles, currentPrice, transactionType }) {
  if (!candles || !currentPrice) {
    return {
      available: false,
      reason: 'Insufficient data for station detection',
    };
  }
  
  // Step 1: Detect all EMAs
  const emaStations = detectAllEMAs(candles, currentPrice);
  
  // Step 2: Detect all S/R levels
  const srStations = detectAllSR(candles, currentPrice);
  
  // Step 3: Combine and cluster
  const allStations = [...emaStations, ...srStations];
  
  if (allStations.length === 0) {
    return {
      available: false,
      reason: 'No stations detected near current price',
    };
  }
  
  const clusters = clusterStations(allStations, 0.5); // 0.5% clustering threshold
  
  // Step 4: Find nearest station
  const nearest = findNearestStation(clusters, currentPrice);
  const atStation = isAtStation(nearest, 0.5); // Within 0.5% = "at station"
  
  // Step 5: Score the trade
  const tradeScore = scoreTradeVsStation(atStation, nearest, transactionType);
  
  // Step 6: Build full report
  return {
    available: true,
    atStation,
    currentPrice,
    nearestStation: nearest,
    allStations: clusters.sort((a, b) => a.distance - b.distance), // Sorted by distance
    tradeEvaluation: tradeScore,
    summary: {
      totalStations: clusters.length,
      stationsWithin1Percent: clusters.filter(s => s.distance < 1.0).length,
      stationsWithin2Percent: clusters.filter(s => s.distance < 2.0).length,
      strongStations: clusters.filter(s => s.quality >= 7).length,
    },
  };
}

/**
 * Generate a human-readable station report
 * @param {Object} analysis - Output from detectStations()
 * @returns {String} - Formatted report
 */
export function formatStationReport(analysis) {
  if (!analysis.available) {
    return analysis.reason;
  }
  
  const { atStation, nearestStation, tradeEvaluation, summary } = analysis;
  
  let report = '';
  
  if (atStation) {
    report += `✅ AT ${nearestStation.type} STATION\n`;
    report += `Price: ₹${nearestStation.price.toFixed(2)} (${nearestStation.distance.toFixed(2)}% away)\n`;
    report += `Quality: ${nearestStation.quality}/10 ${nearestStation.quality >= 7 ? '(STRONG)' : '(MODERATE)'}\n`;
    report += `Factors: ${nearestStation.factors.join(', ')}\n`;
    report += `Timeframes: ${nearestStation.timeframes.join(', ')}\n`;
    if (nearestStation.tests > 0) {
      report += `Tests: ${nearestStation.tests} prior bounces/rejections\n`;
    }
    report += `\n${tradeEvaluation.suitable ? '✅' : '⚠'} ${tradeEvaluation.reason}\n`;
  } else {
    report += `⚠ NOT AT A STATION\n`;
    report += `Nearest: ${nearestStation.type} at ₹${nearestStation.price.toFixed(2)} (${nearestStation.distance.toFixed(2)}% away)\n`;
    report += `Quality: ${nearestStation.quality}/10\n`;
    report += `\n${tradeEvaluation.reason}\n`;
  }
  
  report += `\n📊 Summary: ${summary.totalStations} stations detected (${summary.strongStations} strong)`;
  
  return report;
}