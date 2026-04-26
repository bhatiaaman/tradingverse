import { getDataProvider } from '@/app/lib/providers';
import { resolveToken } from '@/app/api/order-intelligence/lib/resolve-token';
import { computeVWAP, computeRSI, computeBB } from '@/app/lib/chart-indicators';
import { precompute, detectPatterns, buildContext } from '@/app/lib/setupEye';

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
function getISTString(offsetDays = 0) {
  const d = new Date(Date.now() + IST_OFFSET_MS + (offsetDays * 24 * 3600 * 1000));
  return d.toISOString().slice(0, 10);
}

export async function buildTechnicalSnapshot(symbol) {
  if (!symbol) return null;
  
  try {
    const token = await resolveToken(symbol);
    if (!token) return null;

    const dp = await getDataProvider();
    const toDateStr = getISTString(1); 
    const fromDateStr = getISTString(-5);

    const candles = await dp.getHistoricalData(token, '5minute', fromDateStr, toDateStr);
    if (!candles || candles.length < 50) return null;

    const vwapData = computeVWAP(candles);
    const rsiValues = computeRSI(candles, 14);
    const lastRsi = rsiValues[rsiValues.length - 1];

    const pre = precompute(candles, vwapData, lastRsi);
    const patterns = detectPatterns(candles, pre);
    const context = buildContext(candles, pre);

    const c0 = candles[candles.length - 1];
    const prevClose = candles[candles.length - 2]?.close || c0.close;

    // 1. Entry Classification
    let entryClassification = 'Trend Continuation';
    const freshBOS = pre.bosLevels?.some(b => b.breakIdx >= candles.length - 2);
    const isPullback = pre.ema?.atEma21 || pre.ema?.atEma50 || context.orderBlock;
    const isReversal = patterns.some(p => ['morning_star', 'evening_star', 'bull_engulfing', 'bear_engulfing'].includes(p.id));
    const isLiqGrab = patterns.some(p => p.id.startsWith('liq_sweep'));

    if (freshBOS) entryClassification = 'Breakout';
    else if (isPullback) entryClassification = 'Pullback';
    else if (isReversal) entryClassification = 'Reversal';
    else if (isLiqGrab) entryClassification = 'Liquidity Grab';

    // 2. Location Quality
    let locationQuality = 'Mid-range';
    const nearSupport = pre.orderBlocks?.some(ob => Math.abs(c0.close - ob.low) / ob.low < 0.005);
    const nearResistance = pre.orderBlocks?.some(ob => Math.abs(c0.close - ob.high) / ob.high < 0.005);
    const isExtended = lastRsi > 75 || lastRsi < 25;

    if (nearSupport || nearResistance) locationQuality = 'At extreme (support/resistance)';
    else if (isExtended) locationQuality = 'Extended (overbought/oversold)';

    // 3. Volatility Regime
    let volatilityRegime = 'Contraction';
    if (pre.atr14 && (c0.high - c0.low) > pre.atr14 * 1.5) {
      volatilityRegime = 'Expansion';
    }

    return {
      timestamp: new Date().toISOString(),
      existing_telemetry: {
        structure: {
          trend: context.trend || 'NEUTRAL',
          vwap_distance_pct: pre.vwap?.distPct || 0,
          ema_alignment: {
            ema_9: pre.ema?.ema9 || null,
            ema_21: pre.ema?.ema21 || null,
            ema_50: pre.ema?.ema50 || null,
            stacked_bull: !!pre.ema?.stackedBull,
            stacked_bear: !!pre.ema?.stackedBear
          }
        },
        station: {
          nearest_support: context.orderBlock?.low || null,
          nearest_resistance: context.orderBlock?.high || null,
          bos_status: context.bos?.type || 'NONE'
        },
        pattern: {
          candlestick_formations: patterns.map(p => p.name),
          volume_spike_ratio: pre.volume?.mult || 1.0
        },
        market_vibe: {
          india_vix: null, 
          index_pcr: null,
          sector_sentiment: 'NEUTRAL'
        }
      },
      decision_context_layer: {
        entry_classification: entryClassification,
        location_quality: locationQuality,
        volatility_regime: volatilityRegime,
        participation: {
          volume_vs_20_avg_pct: pre.volume?.mult ? parseFloat((pre.volume.mult * 100).toFixed(2)) : 100.0,
          momentum_strength: context.trendStrength === 'strong' ? 'HIGH' : 'MEDIUM'
        }
      }
    };
  } catch (err) {
    console.error('[snapshotBuilder] Error:', err);
    return null;
  }
}
