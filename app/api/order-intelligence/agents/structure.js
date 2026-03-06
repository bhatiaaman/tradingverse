// Copyright (c) 2025 Amandeep Bhatia — TradePreflight
// Licensed under Apache 2.0 — https://github.com/amanbhatia/tradepreflight
// ─────────────────────────────────────────────────────────────────────────────
// Structure Agent — answers "Is this trade structurally valid?"
// Checks price, momentum, volume, and market regime vs trade direction.
//
// MIS (intraday) → 10 checks (8 base + NIFTY RS 5d + sector RS today)
// NRML / CNC (swing) → 10 + 3 = 13 checks
// ─────────────────────────────────────────────────────────────────────────────

// Broad-market index symbols — RS vs NIFTY comparisons are meaningless for these
const INDEX_SYMBOLS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX']);

// ─────────────────────────────────────────────────────────────────────────────
// Direction helper (same as behavioral)
// ─────────────────────────────────────────────────────────────────────────────
function getTradeBias(instrumentType, transactionType) {
  if (instrumentType === 'CE') return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH';
  if (instrumentType === 'PE') return transactionType === 'BUY' ? 'BEARISH' : 'BULLISH';
  return transactionType === 'BUY' ? 'BULLISH' : 'BEARISH'; // EQ / FUT
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicator calculators — copied from sentiment/route.js (no cross-module dep)
// ─────────────────────────────────────────────────────────────────────────────
function calcEMA(candles, period) {
  if (!candles || candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const recent = candles.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i].close - recent[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function calcVWAP(candles) {
  if (!candles || candles.length === 0) return null;
  // Only today's candles for accurate VWAP
  const now = new Date();
  const istMidnight = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  istMidnight.setUTCHours(0, 0, 0, 0);
  const midnightTs = istMidnight.getTime() / 1000;

  const todayCandles = candles.filter(c => c.time >= midnightTs);
  if (todayCandles.length === 0) return null;

  let tpvSum = 0, volSum = 0;
  for (const c of todayCandles) {
    const tp = (c.high + c.low + c.close) / 3;
    tpvSum += tp * c.volume;
    volSum += c.volume;
  }
  return volSum > 0 ? tpvSum / volSum : null;
}

// Proper Wilder's ADX (matches TradingView / standard charting platforms)
function calcADX(candles, period = 14) {
  // Need enough bars: period for initial smoothed sum + period more for first ADX value
  if (!candles || candles.length < period * 2 + 1) return null;

  // Step 1: raw TR, +DM, -DM for every bar
  const trArr = [], plusDMArr = [], minusDMArr = [];
  for (let i = 1; i < candles.length; i++) {
    const cur  = candles[i];
    const prev = candles[i - 1];
    const highDiff = cur.high - prev.high;
    const lowDiff  = prev.low  - cur.low;
    trArr.push(Math.max(cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low  - prev.close)));
    plusDMArr.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDMArr.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff  : 0);
  }

  if (trArr.length < period * 2) return null;

  // Step 2: seed Wilder smoothed values with sum of first `period` bars
  let smTR      = trArr.slice(0, period).reduce((s, v) => s + v, 0);
  let smPlusDM  = plusDMArr.slice(0, period).reduce((s, v) => s + v, 0);
  let smMinusDM = minusDMArr.slice(0, period).reduce((s, v) => s + v, 0);

  // Step 3: roll through remaining bars collecting DX values
  const dxArr = [];
  for (let i = period; i < trArr.length; i++) {
    smTR      = smTR      - smTR      / period + trArr[i];
    smPlusDM  = smPlusDM  - smPlusDM  / period + plusDMArr[i];
    smMinusDM = smMinusDM - smMinusDM / period + minusDMArr[i];
    if (smTR === 0) continue;
    const pDI = (smPlusDM  / smTR) * 100;
    const mDI = (smMinusDM / smTR) * 100;
    const sum = pDI + mDI;
    dxArr.push(sum === 0 ? 0 : Math.abs(pDI - mDI) / sum * 100);
  }

  if (dxArr.length < period) return null;

  // Step 4: ADX = Wilder's smoothing of DX array
  let adx = dxArr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < dxArr.length; i++) {
    adx = (adx * (period - 1) + dxArr[i]) / period;
  }

  // Final +DI / -DI from last smoothed values
  const plusDI  = smTR > 0 ? (smPlusDM  / smTR) * 100 : 0;
  const minusDI = smTR > 0 ? (smMinusDM / smTR) * 100 : 0;
  return { adx, plusDI, minusDI };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-compute all indicators once so check functions stay pure/simple
// ─────────────────────────────────────────────────────────────────────────────
function computeIndicators(c15, cDay, cWeek, spotPrice) {
  const ind = {};

  if (c15?.length) {
    ind.ema9_15m  = calcEMA(c15, 9);
    ind.ema21_15m = calcEMA(c15, 21);
    ind.rsi_15m   = calcRSI(c15, 14);
    ind.vwap      = calcVWAP(c15);
    ind.adx_15m   = calcADX(c15, 14);

    // Volume: last candle vs 20-candle average
    if (c15.length >= 20) {
      const recent20 = c15.slice(-20);
      ind.avgVol20  = recent20.reduce((s, c) => s + c.volume, 0) / 20;
      ind.lastVol   = c15[c15.length - 1].volume;
    }

    // Opening range: first two 15m candles of today (09:15 & 09:30)
    const now = new Date();
    const istMidnight = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    istMidnight.setUTCHours(0, 0, 0, 0);
    const midnightTs = istMidnight.getTime() / 1000;

    const todayC15 = c15.filter(c => c.time >= midnightTs);
    if (todayC15.length >= 2) {
      const orCandles = todayC15.slice(0, 2); // 09:15 + 09:30
      ind.orHigh = Math.max(...orCandles.map(c => c.high));
      ind.orLow  = Math.min(...orCandles.map(c => c.low));
    }
  }

  if (cDay?.length) {
    ind.ema50_day  = calcEMA(cDay, 50);
    ind.ema200_day = calcEMA(cDay, 200);
    ind.rsi_day    = calcRSI(cDay, 14);

    // HH/HL structure — last 5 daily closes
    if (cDay.length >= 5) {
      const last5 = cDay.slice(-5).map(c => c.close);
      ind.dailyCloses5 = last5;
    }

    // Daily momentum — last 10 closes: count up vs down days
    if (cDay.length >= 10) {
      const last10 = cDay.slice(-10);
      let upDays = 0, downDays = 0;
      for (let i = 1; i < last10.length; i++) {
        if (last10[i].close > last10[i - 1].close) upDays++;
        else downDays++;
      }
      ind.upDays10    = upDays;
      ind.downDays10  = downDays;
    }
  }

  if (cWeek?.length) {
    ind.ema20_week = calcEMA(cWeek, 20);
  }

  ind.spotPrice = spotPrice;
  return ind;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── INTRADAY CHECKS (MIS) ───────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// CHECK 1: EMA alignment — price vs EMA9/21 on 15m
function checkEMAAlignment(data) {
  const { ema9_15m, ema21_15m, spotPrice } = data.indicators;
  if (ema9_15m == null || ema21_15m == null || spotPrice == null) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  const emasBullish = spotPrice > ema9_15m && ema9_15m > ema21_15m;
  const emasBearish = spotPrice < ema9_15m && ema9_15m < ema21_15m;

  if (tradeBias === 'BULLISH' && emasBearish) {
    return {
      type: 'EMA_MISALIGNED',
      severity: 'warning',
      title: 'EMAs bearish on 15m — selling into your buy',
      detail: `Price (${spotPrice.toFixed(0)}) < EMA9 (${ema9_15m.toFixed(0)}) < EMA21 (${ema21_15m.toFixed(0)}). 15m structure is bearish.`,
      riskScore: 15,
    };
  }
  if (tradeBias === 'BEARISH' && emasBullish) {
    return {
      type: 'EMA_MISALIGNED',
      severity: 'warning',
      title: 'EMAs bullish on 15m — buying into your sell',
      detail: `Price (${spotPrice.toFixed(0)}) > EMA9 (${ema9_15m.toFixed(0)}) > EMA21 (${ema21_15m.toFixed(0)}). 15m structure is bullish.`,
      riskScore: 15,
    };
  }

  // Partial conflict: mixed EMAs (price between EMA9/21)
  const partialConflict =
    (tradeBias === 'BULLISH' && spotPrice < ema9_15m) ||
    (tradeBias === 'BEARISH' && spotPrice > ema9_15m);

  if (partialConflict) {
    return {
      type: 'EMA_PARTIAL_CONFLICT',
      severity: 'caution',
      title: 'Price outside EMA9 — marginal 15m alignment',
      detail: `Price is on the wrong side of EMA9 (${ema9_15m.toFixed(0)}). Consider waiting for a pullback entry.`,
      riskScore: 8,
    };
  }

  return null;
}

// CHECK 2: VWAP alignment
function checkVWAP(data) {
  const { vwap, spotPrice } = data.indicators;
  if (vwap == null || spotPrice == null) return { passed: true, title: 'VWAP — no intraday data yet' };

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  const priceAboveVWAP = spotPrice > vwap;
  const conflict =
    (tradeBias === 'BULLISH' && !priceAboveVWAP) ||
    (tradeBias === 'BEARISH' && priceAboveVWAP);

  const side = priceAboveVWAP ? 'above' : 'below';

  if (!conflict) {
    return {
      passed: true,
      title: `Price ${side} VWAP ₹${vwap.toFixed(0)} — aligned with ${tradeBias.toLowerCase()} trade`,
    };
  }

  return {
    type: 'VWAP_CONFLICT',
    severity: 'caution',
    title: `Price ${side} VWAP ₹${vwap.toFixed(0)} — against trade bias`,
    detail: `VWAP is ₹${vwap.toFixed(0)}. Price (₹${spotPrice.toFixed(0)}) is ${side} it. For a ${tradeBias.toLowerCase()} trade, price should be ${tradeBias === 'BULLISH' ? 'above' : 'below'} VWAP.`,
    riskScore: 10,
  };
}

// CHECK 3: ADX regime — ADX < 20 = choppy
function checkADX(data) {
  const adxResult = data.indicators.adx_15m;
  if (adxResult == null) return null;

  const { adx } = adxResult;
  if (adx >= 20) return null;

  return {
    type: 'LOW_ADX',
    severity: 'caution',
    title: `ADX ${adx.toFixed(0)} — choppy market on 15m`,
    detail: `ADX below 20 indicates a range-bound, directionless market. Breakout and momentum trades have lower success rate in this regime.`,
    riskScore: 8,
  };
}

// CHECK 4: RSI extremes — BUY into overbought / SELL into oversold
function checkRSI(data) {
  const { rsi_15m } = data.indicators;
  if (rsi_15m == null) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  if (tradeBias === 'BULLISH' && rsi_15m > 70) {
    return {
      type: 'RSI_OVERBOUGHT',
      severity: 'warning',
      title: `RSI ${rsi_15m.toFixed(0)} — overbought on 15m`,
      detail: `Buying when RSI is above 70 means entering an extended move. Mean reversion risk is elevated.`,
      riskScore: 15,
    };
  }
  if (tradeBias === 'BEARISH' && rsi_15m < 30) {
    return {
      type: 'RSI_OVERSOLD',
      severity: 'warning',
      title: `RSI ${rsi_15m.toFixed(0)} — oversold on 15m`,
      detail: `Selling when RSI is below 30 means entering a stretched move. Bounce risk is elevated.`,
      riskScore: 15,
    };
  }
  return {
    passed: true,
    title: `RSI ${rsi_15m.toFixed(0)} on 15m — not overbought/oversold`,
  };
}

// CHECK 5: Volume confirmation — last candle < 50% of 20-bar average
function checkVolume(data) {
  const { avgVol20, lastVol } = data.indicators;
  if (avgVol20 == null || lastVol == null || avgVol20 === 0) {
    return { passed: true, title: 'Volume — no 15m data yet' };
  }

  const volRatio = lastVol / avgVol20;
  if (volRatio >= 0.5) {
    const dir = getTradeBias(data.order.instrumentType, data.order.transactionType) === 'BULLISH' ? 'upmove' : 'downmove';
    return { passed: true, title: `Volume confirms ${dir}` };
  }

  return {
    type: 'LOW_VOLUME',
    severity: 'caution',
    title: 'Low volume on last 15m candle',
    detail: `Last candle volume (${lastVol.toLocaleString()}) is ${Math.round(volRatio * 100)}% of the 20-bar average. Breakouts on low volume often fail.`,
    riskScore: 8,
  };
}

// CHECK 6: Opening range — price still inside first-15min H/L range
function checkOpeningRange(data) {
  const { orHigh, orLow, spotPrice } = data.indicators;
  if (orHigh == null || orLow == null || spotPrice == null) return { passed: true, title: 'Opening range — no intraday data yet' };

  const insideOR = spotPrice <= orHigh && spotPrice >= orLow;

  if (!insideOR) {
    const brokeAbove = spotPrice > orHigh;
    return {
      passed: true,
      title: brokeAbove
        ? `Opening range breakout above ₹${orHigh.toFixed(0)}`
        : `Opening range breakdown below ₹${orLow.toFixed(0)}`,
    };
  }

  return {
    type: 'INSIDE_OPENING_RANGE',
    severity: 'caution',
    title: 'Price inside opening range — no breakout yet',
    detail: `Price (₹${spotPrice.toFixed(0)}) is within the opening range (₹${orLow.toFixed(0)} – ₹${orHigh.toFixed(0)}). Wait for a confirmed breakout before entering.`,
    riskScore: 8,
  };
}

// CHECK 7: HH/HL structure — last 5 daily closes forming downtrend on BUY
function checkHHHL(data) {
  const { dailyCloses5 } = data.indicators;
  if (!dailyCloses5 || dailyCloses5.length < 5) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  // Count consecutive lower highs (downtrend) or higher lows (uptrend)
  let downCount = 0, upCount = 0;
  for (let i = 1; i < dailyCloses5.length; i++) {
    if (dailyCloses5[i] < dailyCloses5[i - 1]) downCount++;
    else upCount++;
  }

  const strongDowntrend = downCount >= 3; // 3+ of 4 days down
  const strongUptrend   = upCount   >= 3;

  if (tradeBias === 'BULLISH' && strongDowntrend) {
    return {
      type: 'HH_HL_BEARISH',
      severity: 'warning',
      title: 'Daily structure bearish — lower closes forming',
      detail: `${downCount} of the last 4 daily candles closed lower. Daily trend is against your buy trade.`,
      riskScore: 18,
    };
  }
  if (tradeBias === 'BEARISH' && strongUptrend) {
    return {
      type: 'HH_HL_BULLISH',
      severity: 'warning',
      title: 'Daily structure bullish — higher closes forming',
      detail: `${upCount} of the last 4 daily candles closed higher. Daily trend is against your sell trade.`,
      riskScore: 18,
    };
  }

  // Mild conflict (2 of 4 days against)
  const mildDown = downCount >= 2;
  const mildUp   = upCount   >= 2;

  if (tradeBias === 'BULLISH' && mildDown && !strongUptrend) {
    return {
      type: 'HH_HL_WEAK',
      severity: 'caution',
      title: 'Weak daily structure for a buy',
      detail: `${downCount} of the last 4 daily candles closed lower. Daily momentum is not supporting a long.`,
      riskScore: 10,
    };
  }
  if (tradeBias === 'BEARISH' && mildUp && !strongDowntrend) {
    return {
      type: 'HH_HL_WEAK',
      severity: 'caution',
      title: 'Weak daily structure for a sell',
      detail: `${upCount} of the last 4 daily candles closed higher. Daily momentum is not supporting a short.`,
      riskScore: 10,
    };
  }

  return null;
}

// CHECK 8: Market breadth — advances/declines ratio vs trade direction
function checkMarketBreadth(data) {
  const breadth = data.structureData?.breadth;
  if (!breadth) return null;

  const { advances, declines } = breadth;
  if (advances == null || declines == null) return null;

  const total = advances + declines;
  if (total === 0) return null;

  const advRatio = advances / total;
  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  // Strongly bearish breadth (<35% advances) on a buy
  if (tradeBias === 'BULLISH' && advRatio < 0.35) {
    return {
      type: 'BREADTH_BEARISH',
      severity: 'caution',
      title: 'Weak market breadth — most stocks falling',
      detail: `Only ${Math.round(advRatio * 100)}% of stocks are advancing (${advances}↑ vs ${declines}↓). Broad market is not supporting a long.`,
      riskScore: 8,
    };
  }
  // Strongly bullish breadth (>65% advances) on a sell
  if (tradeBias === 'BEARISH' && advRatio > 0.65) {
    return {
      type: 'BREADTH_BULLISH',
      severity: 'caution',
      title: 'Strong market breadth — most stocks rising',
      detail: `${Math.round(advRatio * 100)}% of stocks are advancing (${advances}↑ vs ${declines}↓). Broad market is not supporting a short.`,
      riskScore: 8,
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SWING-ONLY CHECKS (NRML / CNC) ─────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// CHECK 9: Daily EMA — price vs EMA50/200 on daily
function checkDailyEMA(data) {
  const { ema50_day, ema200_day, spotPrice } = data.indicators;
  if (spotPrice == null) return null;
  if (ema50_day == null && ema200_day == null) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  // Both EMAs bearish (price below both)
  const belowBoth = ema50_day && ema200_day && spotPrice < ema50_day && spotPrice < ema200_day;
  const aboveBoth = ema50_day && ema200_day && spotPrice > ema50_day && spotPrice > ema200_day;

  if (tradeBias === 'BULLISH' && belowBoth) {
    return {
      type: 'DAILY_EMA_BEARISH',
      severity: 'warning',
      title: 'Price below EMA50 & EMA200 on daily',
      detail: `Swing long when price is below both daily EMAs is high-risk. EMA50: ₹${ema50_day.toFixed(0)}, EMA200: ₹${ema200_day.toFixed(0)}.`,
      riskScore: 18,
    };
  }
  if (tradeBias === 'BEARISH' && aboveBoth) {
    return {
      type: 'DAILY_EMA_BULLISH',
      severity: 'warning',
      title: 'Price above EMA50 & EMA200 on daily',
      detail: `Swing short when price is above both daily EMAs is high-risk. EMA50: ₹${ema50_day.toFixed(0)}, EMA200: ₹${ema200_day.toFixed(0)}.`,
      riskScore: 18,
    };
  }

  // Partial conflict (only one EMA against)
  const belowEMA50 = ema50_day && spotPrice < ema50_day;
  const aboveEMA50 = ema50_day && spotPrice > ema50_day;

  if (tradeBias === 'BULLISH' && belowEMA50 && !belowBoth) {
    return {
      type: 'DAILY_EMA_PARTIAL',
      severity: 'caution',
      title: 'Price below EMA50 on daily',
      detail: `Price (₹${spotPrice.toFixed(0)}) is below EMA50 (₹${ema50_day.toFixed(0)}) on the daily chart. Swing structure is not confirmed bullish.`,
      riskScore: 10,
    };
  }
  if (tradeBias === 'BEARISH' && aboveEMA50 && !aboveBoth) {
    return {
      type: 'DAILY_EMA_PARTIAL',
      severity: 'caution',
      title: 'Price above EMA50 on daily',
      detail: `Price (₹${spotPrice.toFixed(0)}) is above EMA50 (₹${ema50_day.toFixed(0)}) on the daily chart. Swing structure is not confirmed bearish.`,
      riskScore: 10,
    };
  }

  return null;
}

// CHECK 10: Weekly trend — price vs weekly EMA20
function checkWeeklyTrend(data) {
  const { ema20_week, spotPrice } = data.indicators;
  if (ema20_week == null || spotPrice == null) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  if (tradeBias === 'BULLISH' && spotPrice < ema20_week) {
    return {
      type: 'WEEKLY_TREND_BEARISH',
      severity: 'caution',
      title: 'Price below weekly EMA20',
      detail: `Weekly trend is bearish. Price (₹${spotPrice.toFixed(0)}) is below EMA20 (₹${ema20_week.toFixed(0)}) on the weekly chart.`,
      riskScore: 10,
    };
  }
  if (tradeBias === 'BEARISH' && spotPrice > ema20_week) {
    return {
      type: 'WEEKLY_TREND_BULLISH',
      severity: 'caution',
      title: 'Price above weekly EMA20',
      detail: `Weekly trend is bullish. Price (₹${spotPrice.toFixed(0)}) is above EMA20 (₹${ema20_week.toFixed(0)}) on the weekly chart.`,
      riskScore: 10,
    };
  }
  return null;
}

// CHECK 11: Daily momentum — last 10 closes: more down days than up on BUY
function checkDailyMomentum(data) {
  const { upDays10, downDays10 } = data.indicators;
  if (upDays10 == null || downDays10 == null) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  if (tradeBias === 'BULLISH' && downDays10 >= 7) {
    return {
      type: 'DAILY_MOMENTUM_BEARISH',
      severity: 'caution',
      title: 'Negative daily momentum',
      detail: `${downDays10} of the last 9 trading days closed lower. Daily momentum is against your long.`,
      riskScore: 8,
    };
  }
  if (tradeBias === 'BEARISH' && upDays10 >= 7) {
    return {
      type: 'DAILY_MOMENTUM_BULLISH',
      severity: 'caution',
      title: 'Positive daily momentum',
      detail: `${upDays10} of the last 9 trading days closed higher. Daily momentum is against your short.`,
      riskScore: 8,
    };
  }
  return null;
}

// CHECK 9+: Relative strength vs NIFTY (MIS = 5d lookback, swing = 20d lookback)
function checkRelativeStrength(data) {
  const { niftyDaily, cDay } = data.structureData ?? {};
  if (!niftyDaily?.length || !cDay?.length) return null;

  // Skip for broad-market index options (NIFTY vs NIFTY comparison is meaningless)
  const sym = data.order.symbol?.toUpperCase();
  if (INDEX_SYMBOLS.has(sym)) return null;

  const isSwing   = ['NRML', 'CNC'].includes(data.order.productType?.toUpperCase());
  const lookback  = isSwing ? 20 : 5;
  const threshold = isSwing ? 5  : 3;
  const label     = `${lookback}d`;

  if (niftyDaily.length < lookback + 1 || cDay.length < lookback + 1) return null;

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);

  const niftyStart = niftyDaily[niftyDaily.length - lookback - 1].close;
  const niftyEnd   = niftyDaily[niftyDaily.length - 1].close;
  const niftyRet   = (niftyEnd - niftyStart) / niftyStart * 100;

  const stockStart = cDay[cDay.length - lookback - 1].close;
  const stockEnd   = cDay[cDay.length - 1].close;
  const stockRet   = (stockEnd - stockStart) / stockStart * 100;

  const rsDiff = stockRet - niftyRet; // positive = outperforming

  if (tradeBias === 'BULLISH' && rsDiff < -threshold) {
    return {
      type: 'WEAK_RELATIVE_STRENGTH',
      severity: 'caution',
      title: `Underperforming NIFTY by ${Math.abs(rsDiff).toFixed(1)}% (${label})`,
      detail: `Stock: ${stockRet.toFixed(1)}% vs NIFTY: ${niftyRet.toFixed(1)}% over ${lookback} days (RS: ${rsDiff.toFixed(1)}%). Buying relative underperformers carries higher reversal risk.`,
      riskScore: 8,
    };
  }
  if (tradeBias === 'BEARISH' && rsDiff > threshold) {
    return {
      type: 'STRONG_RELATIVE_STRENGTH',
      severity: 'caution',
      title: `Outperforming NIFTY by ${rsDiff.toFixed(1)}% (${label})`,
      detail: `Stock: ${stockRet.toFixed(1)}% vs NIFTY: ${niftyRet.toFixed(1)}% over ${lookback} days (RS: +${rsDiff.toFixed(1)}%). Shorting relative strength carries higher risk.`,
      riskScore: 8,
    };
  }

  return null;
}

// CHECK: Sector relative strength — today's stock move vs its sector index
function checkSectorRS(data) {
  const sector = data.sector;
  if (!sector?.name || sector.change == null) return null;

  const { cDay } = data.structureData ?? {};
  if (!cDay || cDay.length < 2) return null;

  // Skip for broad-market index options
  const sym = data.order.symbol?.toUpperCase();
  if (INDEX_SYMBOLS.has(sym)) return null;

  // Stock's today % change from most recent two daily candles
  const lastClose = cDay[cDay.length - 1].close;
  const prevClose = cDay[cDay.length - 2].close;
  if (!prevClose) return null;

  const stockChange  = (lastClose - prevClose) / prevClose * 100;
  const sectorChange = sector.change; // today's % change for sector index
  const rsDiff       = stockChange - sectorChange; // positive = stock beating sector

  const tradeBias = getTradeBias(data.order.instrumentType, data.order.transactionType);
  const sign = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

  if (tradeBias === 'BULLISH' && rsDiff < -2) {
    return {
      type: 'SECTOR_RS_WEAK',
      severity: 'caution',
      title: `Lagging ${sector.name} sector by ${Math.abs(rsDiff).toFixed(1)}% today`,
      detail: `Stock: ${sign(stockChange)} vs ${sector.name}: ${sign(sectorChange)} today. Stock is underperforming its sector — sector tailwind isn't lifting this name.`,
      riskScore: 8,
    };
  }
  if (tradeBias === 'BEARISH' && rsDiff > 2) {
    return {
      type: 'SECTOR_RS_STRONG',
      severity: 'caution',
      title: `Outperforming ${sector.name} sector by ${rsDiff.toFixed(1)}% today`,
      detail: `Stock: ${sign(stockChange)} vs ${sector.name}: ${sign(sectorChange)} today. Shorting a stock with relative sector strength carries higher squeeze risk.`,
      riskScore: 8,
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registries — paired [fn, passLabel] so labels never rely on check.name lookup
// ─────────────────────────────────────────────────────────────────────────────
const INTRADAY_CHECKS = [
  [checkEMAAlignment,   'EMA aligned on 15m'],
  [checkVWAP,           'Price on correct side of VWAP'],
  [checkADX,            'Trending market on 15m (ADX OK)'],
  [checkRSI,            'RSI not extreme on 15m'],
  [checkVolume,         'Volume confirms move'],
  [checkOpeningRange,   'Price broke opening range'],
  [checkHHHL,           'Daily structure supports trade'],
  [checkMarketBreadth,  'Market breadth aligned'],
  [checkRelativeStrength, 'Relative strength vs NIFTY OK'],
  [checkSectorRS,       'Sector relative strength OK'],
];

const SWING_EXTRA_CHECKS = [
  [checkDailyEMA,      'Price aligned with daily EMAs'],
  [checkWeeklyTrend,   'Weekly trend supports trade'],
  [checkDailyMomentum, 'Daily momentum aligned'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Verdict — same thresholds as behavioral
// ─────────────────────────────────────────────────────────────────────────────
function scoreToVerdict(score) {
  if (score === 0)  return 'clear';
  if (score < 20)   return 'caution';
  if (score < 45)   return 'warning';
  return 'danger';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — run all registered checks against the shared data object
// ─────────────────────────────────────────────────────────────────────────────
export function runStructureAgent(data) {
  const isSwing  = ['NRML', 'CNC'].includes(data.order.productType?.toUpperCase());
  const registry = isSwing
    ? [...INTRADAY_CHECKS, ...SWING_EXTRA_CHECKS]
    : INTRADAY_CHECKS;

  // Pre-compute indicators once
  const indicators = computeIndicators(
    data.structureData?.candles15m,
    data.structureData?.candlesDaily,
    data.structureData?.candlesWeekly,
    data.order.spotPrice,
  );

  // Attach indicators to data so check functions can read them
  const enriched = { ...data, indicators };

  const checks = registry.map(([check, passLabel]) => {
    try {
      const result = check(enriched);
      if (!result)         return { type: check.name, passed: true,  title: passLabel };
      if (result.passed)   return { type: check.name, passed: true,  title: result.title };
      return { ...result, passed: false };
    } catch (e) {
      console.error(`Structure check error [${check.name}]:`, e);
      return { type: check.name, passed: true, title: passLabel };
    }
  });

  const triggered  = checks.filter(c => !c.passed);
  const riskScore  = triggered.reduce((sum, b) => sum + (b.riskScore ?? 0), 0);
  const verdict    = scoreToVerdict(riskScore);

  return { behaviors: triggered, checks, verdict, riskScore };
}
