// app/api/pre-market/gap-calculator/route.js
// Uses your existing /api/market-data endpoint for GIFT Nifty

import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'NIFTY';

    // Fetch from your existing market-data API
    const baseUrl = request.url.split('/api/')[0];
    const marketResponse = await fetch(`${baseUrl}/api/market-data`);
    
    if (!marketResponse.ok) {
      throw new Error('Failed to fetch market data');
    }

    const marketData = await marketResponse.json();

    if (!marketData.indices) {
      return NextResponse.json({ 
        error: 'Market data not available',
        success: false 
      }, { status: 500 });
    }

    // Extract data based on symbol
    let previousClose, currentPrice, giftNiftyPrice, niftyData;
    
    if (symbol === 'NIFTY') {
      previousClose = parseFloat(marketData.indices.niftyPrevClose);
      currentPrice = parseFloat(marketData.indices.nifty);
      giftNiftyPrice = parseFloat(marketData.indices.giftNifty);

      niftyData = {
        open: parseFloat(marketData.indices.niftyOpen || currentPrice),
        high: parseFloat(marketData.indices.niftyHigh || currentPrice),
        low: parseFloat(marketData.indices.niftyLow || currentPrice),
      };
    } else if (symbol === 'BANKNIFTY') {
      // bankNiftyPrevClose = price - change (both returned by market-data)
      const bnPrice  = parseFloat(marketData.indices.bankNifty);
      const bnChange = parseFloat(marketData.indices.bankNiftyChange);
      previousClose = parseFloat(marketData.indices.bankNiftyPrevClose)
        || (!isNaN(bnPrice) && !isNaN(bnChange) ? bnPrice - bnChange : NaN);
      currentPrice = bnPrice;

      // Bank Nifty: estimate based on Nifty's gap
      const niftyPrevClose = parseFloat(marketData.indices.niftyPrevClose);
      const niftyGift = parseFloat(marketData.indices.giftNifty);
      const niftyGapPercent = ((niftyGift - niftyPrevClose) / niftyPrevClose) * 100;
      
      // Bank Nifty typically moves ~1.2-1.5x Nifty
      giftNiftyPrice = previousClose * (1 + (niftyGapPercent * 1.3) / 100);
    }

    // Validation
    if (!previousClose || isNaN(previousClose) || !giftNiftyPrice || isNaN(giftNiftyPrice)) {
      return NextResponse.json({ 
        error: 'Insufficient data for gap calculation',
        debug: { 
          symbol,
          previousClose, 
          giftNiftyPrice,
          marketDataAvailable: !!marketData.indices.nifty
        },
        success: false
      }, { status: 400 });
    }

    // Calculate gap
    const gapPoints = giftNiftyPrice - previousClose;
    const gapPercent = (gapPoints / previousClose) * 100;

    // Classify gap
    let gapType = 'NEUTRAL';
    let gapSize = 'Small';
    
    const absGapPercent = Math.abs(gapPercent);
    
    if (absGapPercent > 1) {
      gapSize = 'Large';
    } else if (absGapPercent > 0.5) {
      gapSize = 'Medium';
    }

    if (gapPercent > 0.1) {
      gapType = 'GAP_UP';
    } else if (gapPercent < -0.1) {
      gapType = 'GAP_DOWN';
    }

    // Historical gap statistics (can be enhanced with real historical data)
    const gapStats = {
      gapFillProbability: absGapPercent > 0.5 ? 0.70 : 0.50,
      avgTimeToFill: absGapPercent > 0.5 ? 45 : 30, // minutes
      gapAndGoProbability: absGapPercent > 0.5 ? 0.30 : 0.50,
    };

    return NextResponse.json({
      success: true,
      symbol,
      previousClose: parseFloat(previousClose.toFixed(2)),
      currentPrice: currentPrice ? parseFloat(currentPrice.toFixed(2)) : null,
      giftNifty: parseFloat(giftNiftyPrice.toFixed(2)),
      gap: {
        points: parseFloat(gapPoints.toFixed(2)),
        percent: parseFloat(gapPercent.toFixed(2)),
        type: gapType,
        size: gapSize,
        direction: gapPercent > 0 ? 'UP' : gapPercent < 0 ? 'DOWN' : 'FLAT',
      },
      expectedOpen: parseFloat(giftNiftyPrice.toFixed(2)),
      statistics: gapStats,
      recommendation: getGapRecommendation(gapType, gapSize, gapPercent, symbol, previousClose, giftNiftyPrice),
      dataSource: marketData.source || 'unknown',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Gap calculator error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

function getGapRecommendation(gapType, gapSize, gapPercent, symbol, prevClose, expectedOpen) {
  const gapPoints = Math.abs(expectedOpen - prevClose);
  
  if (gapType === 'NEUTRAL') {
    return {
      strategy: 'Range Trading',
      advice: `Flat opening expected around ${prevClose.toFixed(0)}. Trade within yesterday's range. Wait for directional breakout after 9:30 AM.`,
      confidence: 'Medium',
      keyLevels: {
        entry: null,
        target: null,
        stopLoss: null,
      }
    };
  }

  if (gapType === 'GAP_UP') {
    if (gapSize === 'Large') {
      return {
        strategy: 'Wait for Pullback',
        advice: `Strong gap up of ${gapPercent.toFixed(2)}% (~${gapPoints.toFixed(0)} points). High chance of profit booking in first 30 mins. Wait for 9:30-9:45 AM consolidation. Enter longs only if price holds above ${prevClose.toFixed(0)} after pullback.`,
        confidence: 'High',
        keyLevels: {
          entry: `${(prevClose + gapPoints * 0.3).toFixed(0)} (after 30-40 point pullback)`,
          target: `${(expectedOpen + gapPoints * 0.5).toFixed(0)}`,
          stopLoss: `${(prevClose - 20).toFixed(0)} (below previous close)`,
        }
      };
    } else if (gapSize === 'Medium') {
      return {
        strategy: 'Buy on Dips',
        advice: `Moderate gap up of ${gapPercent.toFixed(2)}%. If price sustains above ${prevClose.toFixed(0)} after 9:30 AM, look for long entries on minor dips (10-15 point pullbacks).`,
        confidence: 'Medium',
        keyLevels: {
          entry: `${(expectedOpen - 15).toFixed(0)} (on dip)`,
          target: `${(expectedOpen + gapPoints * 0.8).toFixed(0)}`,
          stopLoss: `${(prevClose - 15).toFixed(0)}`,
        }
      };
    } else {
      return {
        strategy: 'Trend Following',
        advice: `Small gap up. Momentum likely to continue if opening range (9:15-9:30) is broken upward. Buy on breakout above opening high with SL at opening low.`,
        confidence: 'Medium',
        keyLevels: {
          entry: `Opening range high + 10 points`,
          target: `${(expectedOpen + 50).toFixed(0)}`,
          stopLoss: `Opening range low`,
        }
      };
    }
  }

  if (gapType === 'GAP_DOWN') {
    if (gapSize === 'Large') {
      return {
        strategy: 'Wait for Bounce',
        advice: `Sharp gap down of ${gapPercent.toFixed(2)}% (~${gapPoints.toFixed(0)} points). High chance of bounce/short covering. Avoid shorts initially. Look for reversal signals. If price reclaims ${prevClose.toFixed(0)}, consider longs.`,
        confidence: 'High',
        keyLevels: {
          entry: `${(expectedOpen + gapPoints * 0.5).toFixed(0)} (on bounce)`,
          target: `${prevClose.toFixed(0)} (gap fill)`,
          stopLoss: `${(expectedOpen - 20).toFixed(0)}`,
        }
      };
    } else if (gapSize === 'Medium') {
      return {
        strategy: 'Sell on Rallies',
        advice: `Moderate gap down. If price fails to reclaim ${prevClose.toFixed(0)} by 10 AM, look for short entries on bounces to resistance levels.`,
        confidence: 'Medium',
        keyLevels: {
          entry: `${(expectedOpen + 20).toFixed(0)} (on bounce to resistance)`,
          target: `${(expectedOpen - gapPoints * 0.5).toFixed(0)}`,
          stopLoss: `${prevClose.toFixed(0)} (above previous close)`,
        }
      };
    } else {
      return {
        strategy: 'Trend Following',
        advice: `Small gap down. Weakness likely to continue. Sell on breakdown below opening range low, target further downside.`,
        confidence: 'Medium',
        keyLevels: {
          entry: `Opening range low - 10 points`,
          target: `${(expectedOpen - 50).toFixed(0)}`,
          stopLoss: `Opening range high`,
        }
      };
    }
  }

  return {
    strategy: 'Wait and Watch',
    advice: 'Monitor price action in first 15 minutes (9:15-9:30 AM) before taking positions. Note opening range high/low.',
    confidence: 'Low',
    keyLevels: {
      entry: 'TBD after opening range',
      target: 'TBD',
      stopLoss: 'TBD',
    }
  };
}