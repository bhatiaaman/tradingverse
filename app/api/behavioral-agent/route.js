import { NextResponse } from 'next/server';
import { getKiteCredentials } from '@/app/lib/kite-credentials';
import { detectStations } from './lib/station-detector.js';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 555 && mins <= 930;
}

function toSlug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ─────────────────────────────────────────────
// CANDLE FETCHER — 5min candles for symbol
// ─────────────────────────────────────────────
async function fetchCandles(token, interval, days, apiKey, accessToken) {
  try {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fmt = (d) => {
      const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
      return ist.toISOString().slice(0, 19).replace('T', ' ');
    };
    const url = `https://api.kite.trade/instruments/historical/${token}/${interval}?from=${encodeURIComponent(fmt(fromDate))}&to=${encodeURIComponent(fmt(toDate))}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `token ${apiKey}:${accessToken}`, 'X-Kite-Version': '3' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.data?.candles?.length) return null;
    return data.data.candles.map(([time, open, high, low, close, volume]) => ({
      time: new Date(time).getTime() / 1000, open, high, low, close, volume: volume || 0,
    }));
  } catch { return null; }
}

// ─────────────────────────────────────────────
// INDICATOR CALCULATORS
// ─────────────────────────────────────────────
function calcEMA(candles, period) {
  if (!candles || candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) ema = candles[i].close * k + ema * (1 - k);
  return ema;
}

function calcRSI(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const recent = candles.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i].close - recent[i - 1].close;
    if (diff >= 0) gains += diff; else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + (gains / period) / (losses / period));
}

function calcADX(candles, period = 14) {
  if (!candles || candles.length < period * 2) return null;
  const recent = candles.slice(-period * 2);
  let plusDM = 0, minusDM = 0, tr = 0;
  for (let i = 1; i < recent.length; i++) {
    const hDiff = recent[i].high - recent[i - 1].high;
    const lDiff = recent[i - 1].low - recent[i].low;
    plusDM  += (hDiff > lDiff && hDiff > 0) ? hDiff : 0;
    minusDM += (lDiff > hDiff && lDiff > 0) ? lDiff  : 0;
    tr += Math.max(recent[i].high - recent[i].low,
      Math.abs(recent[i].high - recent[i - 1].close),
      Math.abs(recent[i].low  - recent[i - 1].close));
  }
  if (tr === 0) return null;
  const plusDI = (plusDM / tr) * 100;
  const minusDI = (minusDM / tr) * 100;
  return { adx: Math.abs(plusDI - minusDI) / (plusDI + minusDI + 0.001) * 100, plusDI, minusDI };
}

function calcVWAP(candles) {
  if (!candles?.length) return null;
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  ist.setUTCHours(0, 0, 0, 0);
  const todayTs = ist.getTime() / 1000;
  const today = candles.filter(c => c.time >= todayTs);
  if (!today.length) return null;
  let tpv = 0, vol = 0;
  for (const c of today) { const tp = (c.high + c.low + c.close) / 3; tpv += tp * c.volume; vol += c.volume; }
  return vol > 0 ? tpv / vol : null;
}

// ─────────────────────────────────────────────
// CANDLESTICK PATTERN DETECTOR
// ─────────────────────────────────────────────
function detectPatterns(candles) {
  if (!candles || candles.length < 3) return [];
  const patterns = [];
  const last3 = candles.slice(-3);
  const [c1, c2, c3] = last3; // c3 = most recent
  const body = (c) => Math.abs(c.close - c.open);
  const range = (c) => c.high - c.low;
  const isBull = (c) => c.close > c.open;
  const isBear = (c) => c.close < c.open;
  const isDoji = (c) => range(c) > 0 && body(c) / range(c) < 0.1;

  // ── 1-CANDLE on c3 ──
  if (isDoji(c3)) {
    patterns.push({ name: 'Doji', candles: 1, direction: 'neutral',
      meaning: 'Indecision — buyers and sellers in balance. Wait for confirmation.', strength: 'weak' });
  }

  const upperWick3 = c3.high - Math.max(c3.open, c3.close);
  const lowerWick3 = Math.min(c3.open, c3.close) - c3.low;

  if (lowerWick3 > body(c3) * 2 && upperWick3 < body(c3) * 0.5 && range(c3) > 0) {
    const name = isBull(c3) ? 'Hammer' : 'Hanging Man';
    const direction = isBull(c3) ? 'bullish' : 'bearish';
    patterns.push({ name, candles: 1, direction,
      meaning: isBull(c3) ? 'Buyers rejected lower prices — potential reversal up.' : 'Warning: hanging man after uptrend signals potential reversal down.',
      strength: 'moderate' });
  }

  if (upperWick3 > body(c3) * 2 && lowerWick3 < body(c3) * 0.5 && range(c3) > 0) {
    const name = isBear(c3) ? 'Shooting Star' : 'Inverted Hammer';
    const direction = isBear(c3) ? 'bearish' : 'neutral';
    patterns.push({ name, candles: 1, direction,
      meaning: isBear(c3) ? 'Sellers rejected higher prices — potential reversal down.' : 'Inverted hammer — needs bullish confirmation next candle.',
      strength: 'moderate' });
  }

  // ── 2-CANDLE on c2+c3 ──
  if (isBear(c2) && isBull(c3) && c3.open < c2.close && c3.close > c2.open && body(c3) > body(c2)) {
    patterns.push({ name: 'Bullish Engulfing', candles: 2, direction: 'bullish',
      meaning: 'Bulls fully engulfed previous bearish candle — strong reversal signal.', strength: 'strong' });
  }

  if (isBull(c2) && isBear(c3) && c3.open > c2.close && c3.close < c2.open && body(c3) > body(c2)) {
    patterns.push({ name: 'Bearish Engulfing', candles: 2, direction: 'bearish',
      meaning: 'Bears fully engulfed previous bullish candle — strong reversal signal.', strength: 'strong' });
  }

  if (isBull(c2) && isBear(c3) && c3.open < c2.close && c3.close > c2.open && body(c3) < body(c2)) {
    patterns.push({ name: 'Bearish Harami', candles: 2, direction: 'bearish',
      meaning: 'Inside bearish candle after bullish — momentum slowing.', strength: 'moderate' });
  }

  if (isBear(c2) && isBull(c3) && c3.open > c2.close && c3.close < c2.open && body(c3) < body(c2)) {
    patterns.push({ name: 'Bullish Harami', candles: 2, direction: 'bullish',
      meaning: 'Inside bullish candle after bearish — potential base forming.', strength: 'moderate' });
  }

  // ── 3-CANDLE on c1+c2+c3 ──
  if (isBear(c1) && isDoji(c2) && isBull(c3) &&
      c3.close > (c1.open + c1.close) / 2 && body(c3) > body(c1) * 0.5) {
    patterns.push({ name: 'Morning Star', candles: 3, direction: 'bullish',
      meaning: 'Classic reversal: down-doji-up. Strong bullish signal after downtrend.', strength: 'strong' });
  }

  if (isBull(c1) && isDoji(c2) && isBear(c3) &&
      c3.close < (c1.open + c1.close) / 2 && body(c3) > body(c1) * 0.5) {
    patterns.push({ name: 'Evening Star', candles: 3, direction: 'bearish',
      meaning: 'Classic reversal: up-doji-down. Strong bearish signal after uptrend.', strength: 'strong' });
  }

  if (isBull(c1) && isBull(c2) && isBull(c3) &&
      c2.close > c1.close && c3.close > c2.close &&
      body(c2) > body(c1) * 0.7 && body(c3) > body(c2) * 0.7) {
    patterns.push({ name: 'Three White Soldiers', candles: 3, direction: 'bullish',
      meaning: 'Three consecutive strong bullish candles — sustained buying pressure.', strength: 'strong' });
  }

  if (isBear(c1) && isBear(c2) && isBear(c3) &&
      c2.close < c1.close && c3.close < c2.close &&
      body(c2) > body(c1) * 0.7 && body(c3) > body(c2) * 0.7) {
    patterns.push({ name: 'Three Black Crows', candles: 3, direction: 'bearish',
      meaning: 'Three consecutive strong bearish candles — sustained selling pressure.', strength: 'strong' });
  }

  return patterns;
}

// ─────────────────────────────────────────────
// VOLUME ANALYSIS
// ─────────────────────────────────────────────
function analyzeVolume(candles) {
  if (!candles || candles.length < 6) return null;
  const recent = candles.slice(-5);
  const avgVol = candles.slice(-20, -5).reduce((s, c) => s + c.volume, 0) / 15;
  const lastCandle = recent[recent.length - 1];
  const prevCandle = recent[recent.length - 2];
  const priceUp = lastCandle.close > prevCandle.close;
  const volUp = lastCandle.volume > prevCandle.volume;
  const volRatio = avgVol > 0 ? lastCandle.volume / avgVol : 1;
  let signal = 'neutral', detail = '', actionable = '';

  // 1. Volume Climax (Exhaustion)
  const maxVol = Math.max(...recent.map(c => c.volume));
  if (lastCandle.volume === maxVol && volRatio > 2.5 && Math.abs(lastCandle.close - prevCandle.close) < Math.abs(prevCandle.close - recent[recent.length-3].close) * 0.5) {
    signal = 'climax';
    detail = `Volume climax: ${volRatio.toFixed(1)}x avg, price stalling`;
    actionable = 'Caution: Volume climax detected. Watch for reversal or sharp pullback.';
  }
  // 2. Volume Gap
  else if (Math.abs(lastCandle.volume - prevCandle.volume) > avgVol * 1.5) {
    signal = 'gap';
    detail = `Volume gap: ${lastCandle.volume > prevCandle.volume ? 'up' : 'down'} by ${(lastCandle.volume - prevCandle.volume).toLocaleString()}`;
    actionable = 'Unusual volume gap — expect volatility.';
  }
  // 3. Steady Volume Rise
  else if (recent.slice(-3).every((c, i, arr) => i === 0 || c.volume > arr[i-1].volume)) {
    signal = 'steady_rise';
    detail = 'Steady volume rise over last 3 candles';
    actionable = 'Rising volume trend — watch for breakout or continuation.';
  }
  // 4. Volume/Price Divergence
  else if ((priceUp && lastCandle.volume < prevCandle.volume) || (!priceUp && lastCandle.volume > prevCandle.volume)) {
    signal = 'divergence';
    detail = 'Price and volume diverging — trend may be weakening.';
    actionable = 'Divergence: Price move not confirmed by volume — trend may be weakening.';
  }
  // 5. Volume Dry-up at Support/Resistance (assume support/resistance is prev close for demo)
  else if (volRatio < 0.5 && Math.abs(lastCandle.close - prevCandle.close) < 0.2 * prevCandle.close) {
    signal = 'dryup_sr';
    detail = `Volume dry-up at key level (${volRatio.toFixed(1)}x avg)`;
    actionable = 'Volume dry-up at key level — wait for confirmation before trading.';
  }
  // 6. Breakout with Volume Confirmation
  else if (volRatio > 2 && Math.abs(lastCandle.close - prevCandle.close) > 0.5 * prevCandle.close) {
    signal = 'breakout';
    detail = `Breakout with volume: ${volRatio.toFixed(1)}x avg`;
    actionable = 'Breakout confirmed by volume — consider trading in breakout direction.';
  }
  // 7. Fakeout (Breakout Without Volume)
  else if (volRatio < 1 && Math.abs(lastCandle.close - prevCandle.close) > 0.5 * prevCandle.close) {
    signal = 'fakeout';
    detail = 'Breakout lacks volume confirmation — risk of fakeout.';
    actionable = 'Breakout lacks volume confirmation — risk of fakeout.';
  }
  // 8. Churn (High Volume, Small Price Move)
  else if (volRatio > 1.5 && Math.abs(lastCandle.close - prevCandle.close) < 0.1 * prevCandle.close) {
    signal = 'churn';
    detail = 'Churn: High volume, little price movement.';
    actionable = 'Churn detected — large players may be active, watch for next move.';
  }
  // Existing patterns for completeness
  else if (priceUp && volUp && volRatio > 1.5) {
    signal = 'bullish';
    detail = `Volume ${volRatio.toFixed(1)}x avg — strong buying confirmation`;
    actionable = 'Momentum is strong; consider long trades on pullbacks.';
  }
  else if (!priceUp && volUp && volRatio > 1.5) {
    signal = 'bearish';
    detail = `Volume ${volRatio.toFixed(1)}x avg — strong selling pressure`;
    actionable = 'Momentum is strong; consider shorts on rallies.';
  }
  else if (priceUp && !volUp) {
    signal = 'weak_bullish';
    detail = 'Price rising on declining volume — weak move, may not sustain';
    actionable = 'Be cautious with long trades; wait for volume confirmation.';
  }
  else if (!priceUp && !volUp) {
    signal = 'weak_bearish';
    detail = 'Price falling on declining volume — weak selling, may find support';
    actionable = 'Weak selling; aggressive shorts may be risky.';
  }
  else {
    detail = `Volume near average (${volRatio.toFixed(1)}x)`;
    actionable = 'No clear volume signal; wait for decisive move.';
  }

  return { signal, detail, actionable, volRatio: parseFloat(volRatio.toFixed(2)), lastVolume: lastCandle.volume };
}

// ─────────────────────────────────────────────
// NIFTY TOKEN MAP (for index candles)
// ─────────────────────────────────────────────
const INDEX_TOKENS = {
  NIFTY: 256265, BANKNIFTY: 260105, FINNIFTY: 257801, MIDCPNIFTY: 288009,
};

// Search for stock/instrument token by symbol
async function findInstrumentToken(symbol, exchange, apiKey, accessToken) {
  try {
    const res = await fetch(
      `https://api.kite.trade/instruments/${exchange}`,
      { headers: { 'Authorization': `token ${apiKey}:${accessToken}`, 'X-Kite-Version': '3' } }
    );
    if (!res.ok) return null;
    const csv = await res.text();
    const lines = csv.split('\n');
    // CSV format: instrument_token,exchange_token,tradingsymbol,name,...
    for (const line of lines) {
      const cols = line.split(',');
      if (cols[2] === symbol) return parseInt(cols[0]); // instrument_token
    }
    return null;
  } catch { return null; }
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      symbol, tradingsymbol, exchange, instrumentType,
      transactionType, quantity, price: orderPrice, spotPrice,
      expiryType, context = {},
    } = body;

    const {
      positions = [], openOrders = [],
      sentimentScore, sentimentBias, intradayBias, intradayScore,
      vix, sectorData = [], pcr,
      optionChain = null,
    } = context;

    const { apiKey, accessToken } = await getKiteCredentials();
    const hasKite = !!(apiKey && accessToken);

    const insights = [];
    let riskScore = 0; // accumulates, capped at 100

    // ── CHECK 1: Position count ──────────────────────
    const openPositions = positions.filter(p => p.quantity !== 0);
    if (openPositions.length >= 5) {
      riskScore += 20;
      insights.push({ id: 'position_count', level: 'warning',
        title: `${openPositions.length} positions already open`,
        detail: `High exposure. Consider reducing risk before adding more.`,
        icon: '⚠' });
    } else if (openPositions.length >= 3) {
      riskScore += 10;
      const totalPnl = openPositions.reduce((s, p) => s + (p.pnl || 0), 0);
      insights.push({ id: 'position_count', level: 'caution',
        title: `${openPositions.length} positions open`,
        detail: `Total unrealised: ${totalPnl >= 0 ? '+' : ''}₹${Math.round(totalPnl).toLocaleString()}`,
        icon: 'ℹ' });
    }

    // ── CHECK 2: Adding to existing position ────────
    const existingPos = openPositions.find(p => p.tradingsymbol === tradingsymbol || p.tradingsymbol?.includes(symbol));
    if (existingPos) {
      const isAveragingDown = (existingPos.quantity > 0 && transactionType === 'BUY' && (existingPos.pnl || 0) < -500) ||
                              (existingPos.quantity < 0 && transactionType === 'SELL' && (existingPos.pnl || 0) < -500);
      if (isAveragingDown) {
        riskScore += 20;
        insights.push({ id: 'averaging_down', level: 'warning',
          title: 'Averaging into a losing position',
          detail: `Existing ${existingPos.tradingsymbol} is at ₹${Math.round(existingPos.pnl || 0)} P&L. Averaging down increases risk.`,
          icon: '⚠' });
      } else {
        riskScore += 5;
        const dir = (existingPos.quantity > 0 && transactionType === 'BUY') ? 'pyramiding (adding to winner)' : 'adding to position';
        insights.push({ id: 'existing_position', level: 'info',
          title: `Already holding ${existingPos.tradingsymbol}`,
          detail: `${existingPos.quantity > 0 ? 'LONG' : 'SHORT'} ${Math.abs(existingPos.quantity)} qty · P&L: ${existingPos.pnl >= 0 ? '+' : ''}₹${Math.round(existingPos.pnl || 0)} · ${dir}`,
          icon: 'ℹ' });
      }
    }

    // ── CHECK 3: Duplicate open order ───────────────
    const dupOrder = openOrders.find(o =>
      (o.tradingsymbol === tradingsymbol || o.tradingsymbol === symbol) &&
      ['OPEN', 'PENDING', 'TRIGGER PENDING'].includes(o.status?.toUpperCase())
    );
    if (dupOrder) {
      riskScore += 15;
      insights.push({ id: 'duplicate_order', level: 'warning',
        title: 'Order already pending for this symbol',
        detail: `${dupOrder.transaction_type} ${dupOrder.quantity} qty at ₹${dupOrder.price || 'MARKET'} is ${dupOrder.status}`,
        icon: '🔁' });
    }

    // ── CHECK 4: Trend conflict ──────────────────────
    const isBuyingCall = transactionType === 'BUY' && instrumentType === 'CE';
    const isBuyingPut  = transactionType === 'BUY' && instrumentType === 'PE';
    const isDirectionalTrade = instrumentType === 'CE' || instrumentType === 'PE' || instrumentType === 'FUT' || instrumentType === 'EQ';

    if (isDirectionalTrade && sentimentScore != null) {
      const bearish = sentimentScore < 45;
      const bullish = sentimentScore > 55;
      const intradayBearish = intradayScore != null && intradayScore < 45;
      const intradayBullish = intradayScore != null && intradayScore > 55;

      // Against BOTH daily and intraday
      if ((isBuyingCall && bearish && intradayBearish) || (isBuyingPut && bullish && intradayBullish)) {
        riskScore += 25;
        insights.push({ id: 'trend_conflict', level: 'warning',
          title: `Trading against ${bearish ? 'bearish' : 'bullish'} trend on both timeframes`,
          detail: `Daily sentiment: ${sentimentScore}/100 · Intraday: ${intradayScore}/100. High-risk counter-trend trade.`,
          icon: '↕' });
      } else if ((isBuyingCall && bearish) || (isBuyingPut && bullish)) {
        riskScore += 15;
        insights.push({ id: 'trend_conflict', level: 'caution',
          title: `Against daily market trend`,
          detail: `Daily sentiment ${sentimentScore}/100 is ${bearish ? 'bearish' : 'bullish'} but intraday (${intradayScore || '—'}) may differ.`,
          icon: '↕' });
      } else if ((isBuyingCall && intradayBearish) || (isBuyingPut && intradayBullish)) {
        riskScore += 8;
        insights.push({ id: 'intraday_conflict', level: 'caution',
          title: 'Against intraday momentum',
          detail: `Intraday score ${intradayScore}/100 suggests ${intradayBearish ? 'bearish' : 'bullish'} momentum.`,
          icon: '↕' });
      }
    }

    // ── CHECK 5: VIX / Volatility ───────────────────
    if (vix) {
      const vixNum = parseFloat(vix);
      if (vixNum > 25) {
        riskScore += 20;
        insights.push({ id: 'high_vix', level: 'warning',
          title: `High volatility — VIX ${vixNum.toFixed(1)}`,
          detail: `VIX above 25 means options are expensive. Premium decay risk is elevated. Use tighter stops.`,
          icon: '🌊' });
      } else if (vixNum > 18) {
        riskScore += 10;
        insights.push({ id: 'elevated_vix', level: 'caution',
          title: `Elevated volatility — VIX ${vixNum.toFixed(1)}`,
          detail: `VIX above 18 — options premium is above normal. Factor in wider stop-loss.`,
          icon: '🌊' });
      }
    }

    // ── CHECK 6: Sector trend conflict ──────────────
    if (sectorData.length > 0 && symbol && instrumentType !== 'EQ') {
      const sectorMap = {
        NIFTY: 'Nifty50', BANKNIFTY: 'Bank', FINNIFTY: 'Fin Service',
        RELIANCE: 'Energy', TCS: 'IT', INFY: 'IT', HDFCBANK: 'Bank',
        ICICIBANK: 'Bank', SBIN: 'Bank', AXISBANK: 'Bank',
      };
      const sectorName = sectorMap[symbol];
      if (sectorName) {
        const sector = sectorData.find(s => s.name?.includes(sectorName) || s.tvSymbol?.includes(sectorName));
        if (sector) {
          const sectorVal = sector.value ?? 0;
          if ((isBuyingCall && sectorVal < -1) || (isBuyingPut && sectorVal > 1)) {
            riskScore += 10;
            insights.push({ id: 'sector_conflict', level: 'caution',
              title: `Sector trending ${sectorVal < 0 ? 'down' : 'up'} ${Math.abs(sectorVal).toFixed(2)}%`,
              detail: `${sector.name} is ${sectorVal < 0 ? 'falling' : 'rising'} today. Trade is against sector momentum.`,
              icon: '📊' });
          }
        }
      }
    }

    // ── DEEP ANALYSIS — fetch candles ───────────────
    let candles5m = null;
    let candles15m = null;

    if (hasKite) {
      let token = INDEX_TOKENS[symbol];
      
      // If not an index, search for stock token
      if (!token && exchange) {
        token = await findInstrumentToken(symbol, exchange, apiKey, accessToken);
      }
      
      if (token) {
        // Fetch both 5m and 15m candles
        [candles5m, candles15m] = await Promise.all([
          fetchCandles(token, '5minute', 7, apiKey, accessToken),
          fetchCandles(token, '15minute', 7, apiKey, accessToken),
        ]);
      }
    }

    if (candles5m && candles5m.length >= 20) {
      const price = candles5m[candles5m.length - 1].close;

      // ── CHECK 7: RSI ──────────────────────────────
      const rsi5m = calcRSI(candles5m, 14);
      const rsi15m = candles15m ? calcRSI(candles15m, 14) : null;

      if (rsi5m != null) {
        if (rsi5m > 78 && (isBuyingCall || (instrumentType === 'EQ' && transactionType === 'BUY'))) {
          riskScore += 18;
          insights.push({ id: 'rsi_overbought', level: 'warning',
            title: `RSI ${rsi5m.toFixed(0)} — Overbought (5min)`,
            detail: `5min RSI overbought.${rsi15m != null ? ` 15min RSI: ${rsi15m.toFixed(0)}.` : ''} Buying into extended momentum increases reversal risk.`,
            icon: '📈' });
        } else if (rsi5m < 25 && (isBuyingPut || (instrumentType === 'EQ' && transactionType === 'SELL'))) {
          riskScore += 18;
          insights.push({ id: 'rsi_oversold', level: 'warning',
            title: `RSI ${rsi5m.toFixed(0)} — Oversold (5min)`,
            detail: `${rsi15m != null ? `15min RSI: ${rsi15m.toFixed(0)}. ` : ''}Shorting oversold momentum — bounce risk is high.`,
            icon: '📉' });
        } else if (rsi5m > 65 && isBuyingCall) {
          riskScore += 8;
          insights.push({ id: 'rsi_high', level: 'caution',
            title: `RSI ${rsi5m.toFixed(0)} — Extended (5min)`,
            detail: `5min RSI above 65. Trend is intact but some froth building.${rsi15m ? ` 15min: ${rsi15m.toFixed(0)}.` : ''}`,
            icon: '📈' });
        } else if (rsi5m < 35 && isBuyingPut) {
          riskScore += 8;
          insights.push({ id: 'rsi_low', level: 'caution',
            title: `RSI ${rsi5m.toFixed(0)} — Extended bearish (5min)`,
            detail: `5min RSI below 35. Downtrend intact but watch for dead-cat bounces.${rsi15m ? ` 15min: ${rsi15m.toFixed(0)}.` : ''}`,
            icon: '📉' });
        } else {
          insights.push({ id: 'rsi_ok', level: 'clear',
            title: `RSI ${rsi5m.toFixed(0)} — Neutral (5min)`,
            detail: `5min RSI in healthy range (35-65).${rsi15m ? ` 15min: ${rsi15m.toFixed(0)}.` : ''}`,
            icon: '✅' });
        }
      }

      // ── CHECK 8: ADX / Trend strength ────────────
      const adx = calcADX(candles5m, 14);
      if (adx) {
        if (adx.adx < 18) {
          riskScore += 12;
          insights.push({ id: 'adx_weak', level: 'caution',
            title: `ADX ${adx.adx.toFixed(0)} — No trend (5min)`,
            detail: `Low ADX means choppy/ranging market. Breakout trades have lower probability. Wait for ADX > 25.`,
            icon: '〰' });
        } else if (adx.adx > 30) {
          const trendDir = adx.plusDI > adx.minusDI ? 'bullish' : 'bearish';
          const conflict = (trendDir === 'bearish' && isBuyingCall) || (trendDir === 'bullish' && isBuyingPut);
          if (conflict) {
            riskScore += 15;
            insights.push({ id: 'adx_against', level: 'warning',
              title: `ADX ${adx.adx.toFixed(0)} — Strong ${trendDir} trend (5min)`,
              detail: `+DI: ${adx.plusDI.toFixed(0)} / -DI: ${adx.minusDI.toFixed(0)}. You're trading against a strong trend. High risk.`,
              icon: '💥' });
          } else {
            insights.push({ id: 'adx_with', level: 'clear',
              title: `ADX ${adx.adx.toFixed(0)} — With strong trend (5min)`,
              detail: `${trendDir.charAt(0).toUpperCase() + trendDir.slice(1)} trend confirmed. +DI: ${adx.plusDI.toFixed(0)} / -DI: ${adx.minusDI.toFixed(0)}.`,
              icon: '✅' });
          }
        }
      }

      // ── CHECK 9: EMA levels ───────────────────────
      const ema9  = calcEMA(candles5m, 9);
      const ema21 = calcEMA(candles5m, 21);
      const vwap  = calcVWAP(candles5m);

      if (ema9 && ema21) {
        const distFromEma9  = Math.abs((price - ema9) / ema9 * 100);
        const distFromEma21 = Math.abs((price - ema21) / ema21 * 100);
        const aboveEma9  = price > ema9;
        const aboveEma21 = price > ema21;

        if (distFromEma9 < 0.2 || distFromEma21 < 0.2) {
          const nearWhich = distFromEma9 < distFromEma21 ? 'EMA9' : 'EMA21';
          insights.push({ id: 'ema_level', level: 'info',
            title: `Price at 5min ${nearWhich} — decision zone`,
            detail: `Price is near ${nearWhich} (${distFromEma9 < distFromEma21 ? ema9?.toFixed(0) : ema21?.toFixed(0)}). Breakout or rejection here determines next move.`,
            icon: '📍' });
        }

        if (vwap) {
          const vwapDist = ((price - vwap) / vwap * 100).toFixed(2);
          const aboveVwap = price > vwap;
          insights.push({ id: 'vwap', level: aboveVwap ? 'clear' : 'info',
            title: `${aboveVwap ? 'Above' : 'Below'} VWAP · today (${parseFloat(vwapDist) >= 0 ? '+' : ''}${vwapDist}%)`,
            detail: `VWAP: ₹${vwap.toFixed(0)}. ${aboveVwap ? 'Institutional bias is long today.' : 'Price below VWAP — institutions net sellers today.'}`,
            icon: aboveVwap ? '✅' : 'ℹ' });
        }
      }

      // ── CHECK 10: Volume analysis ─────────────────
      const volAnalysis = analyzeVolume(candles5m);
      if (volAnalysis) {
        const isConflict =
          (volAnalysis.signal === 'weak_bullish' && isBuyingCall) ||
          (volAnalysis.signal === 'weak_bearish' && isBuyingPut) ||
          (volAnalysis.signal === 'bearish' && isBuyingCall) ||
          (volAnalysis.signal === 'bullish' && isBuyingPut);

        const level = isConflict ? 'caution' : volAnalysis.signal.includes('weak') ? 'info' : volAnalysis.signal === 'spike' ? 'warning' : volAnalysis.signal === 'dryup' ? 'info' : 'clear';
        if (isConflict) riskScore += 10;
        insights.push({
          id: 'volume',
          level,
          title: `Volume (5min): ${volAnalysis.detail.split('—')[0].trim()}`,
          detail: volAnalysis.detail,
          actionable: volAnalysis.actionable,
          icon:
            volAnalysis.signal === 'bullish' ? '✅' :
            volAnalysis.signal === 'bearish' ? '⚠' :
            volAnalysis.signal === 'spike' ? '🔥' :
            volAnalysis.signal === 'dryup' ? '💤' :
            'ℹ'
        });
      }

      // ── CHECK 11: Candlestick patterns ───────────
      const patterns = detectPatterns(candles5m);
      if (patterns.length > 0) {
        // Cross-reference with 15m bias
        const bias15m = candles15m ? (calcEMA(candles15m, 9) > calcEMA(candles15m, 21) ? 'bullish' : 'bearish') : null;

        for (const pat of patterns) {
          const conflictsWithHigher = bias15m && pat.direction !== 'neutral' && pat.direction !== bias15m;
          const supportsOrder =
            (pat.direction === 'bullish' && (isBuyingCall || transactionType === 'BUY')) ||
            (pat.direction === 'bearish' && (isBuyingPut || transactionType === 'SELL'));

          const level = conflictsWithHigher ? 'caution' :
                        !supportsOrder && pat.direction !== 'neutral' ? 'info' : 'clear';

          if (!supportsOrder && pat.direction !== 'neutral') riskScore += 8;

          insights.push({ id: `pattern_${pat.name.replace(/\s/g, '_')}`, level,
            title: `${pat.name} — ${pat.strength} (5min candle)`,
            detail: `${pat.meaning}${conflictsWithHigher ? ` Note: 15min trend is ${bias15m} — reduces reliability.` : ''}${supportsOrder ? ' Aligns with your trade direction.' : ''}`,
            icon: pat.direction === 'bullish' ? '🕯' : pat.direction === 'bearish' ? '🕯' : '🕯' });
        }
      }

      // ── CHECK 12: Liquidity (OI at strike for options) ──
      if ((instrumentType === 'CE' || instrumentType === 'PE') && optionChain) {
        const atmOI = instrumentType === 'CE' ? optionChain.totalCallOI : optionChain.totalPutOI;
        if (atmOI > 0) {
          const oiLakh = (atmOI / 1e5).toFixed(1);
          if (atmOI < 5e5) {
            riskScore += 10;
            insights.push({ id: 'low_oi', level: 'caution',
              title: `Low OI — ${oiLakh}L`,
              detail: `Low open interest means poor liquidity. Expect wider bid-ask spread and slippage on exit.`,
              icon: '💧' });
          } else {
            insights.push({ id: 'good_liquidity', level: 'clear',
              title: `Good liquidity — ${oiLakh}L OI`,
              detail: `Sufficient open interest for smooth entry and exit at this strike.`,
              icon: '✅' });
          }
        }
      }
    }

    // ── CHECK 13: Entry near support/resistance ─────────────────────────
    if ((instrumentType === 'CE' || instrumentType === 'PE') && optionChain && spotPrice) {
      const spot = parseFloat(spotPrice);
      const support    = optionChain.support;
      const resistance = optionChain.resistance;
      
      if (support && resistance) {
        const distToSupport    = Math.abs((spot - support) / support * 100);
        const distToResistance = Math.abs((spot - resistance) / resistance * 100);
        
        // Buying CE near resistance = risky
        if (isBuyingCall && distToResistance < 0.5) {
          riskScore += 12;
          insights.push({ id: 'near_resistance', level: 'caution',
            title: `Spot near R1 (₹${resistance}) — ${distToResistance.toFixed(2)}% away`,
            detail: `Buying calls just below resistance is risky. Price may reject at ₹${resistance}. Wait for breakout confirmation or enter after close above resistance.`,
            icon: '📍' });
        }
        
        // Buying PE near support = risky
        if (isBuyingPut && distToSupport < 0.5) {
          riskScore += 12;
          insights.push({ id: 'near_support', level: 'caution',
            title: `Spot near S1 (₹${support}) — ${distToSupport.toFixed(2)}% away`,
            detail: `Buying puts just above support is risky. Price may bounce at ₹${support}. Wait for breakdown confirmation or enter after close below support.`,
            icon: '📍' });
        }
        
        // In the middle = good entry zone
        if (distToSupport > 1 && distToResistance > 1) {
          insights.push({ id: 'good_entry_zone', level: 'clear',
            title: `Away from key S/R levels`,
            detail: `Spot at ₹${spot.toFixed(0)} is ${distToSupport.toFixed(1)}% above S1 (₹${support}) and ${distToResistance.toFixed(1)}% below R1 (₹${resistance}). Room to move.`,
            icon: '✅' });
        }
      }
    }

    // ── CHECK 14: Station Analysis ────────────────────────────────────────
    let stationAnalysis = null;
    if (candles5m && candles5m.length >= 50) {
      try {
        stationAnalysis = detectStations({
          candles: {
            candles5m,
            candles15m: candles15m || null,
            candlesDaily: null, // Will add Daily candles in future
          },
          currentPrice: spotPrice || candles5m[candles5m.length - 1].close,
          transactionType,
        });

        if (stationAnalysis.available) {
          const { atStation, nearestStation, tradeEvaluation } = stationAnalysis;

          if (!atStation) {
            // Not at a station = add risk
            riskScore += tradeEvaluation.riskAdjustment || 20;
            insights.push({
              id: 'not_at_station',
              level: 'warning',
              title: '⚠ Not at a station — no structural edge',
              detail: tradeEvaluation.reason,
              icon: '📍',
            });
          } else {
            // At a station
            riskScore += tradeEvaluation.riskAdjustment || 0;
            const level = tradeEvaluation.suitable ? 'clear' : 'warning';
            insights.push({
              id: 'at_station',
              level,
              title: `${tradeEvaluation.suitable ? '✅' : '⚠'} At ${nearestStation.type} station (Q: ${nearestStation.quality}/10)`,
              detail: tradeEvaluation.reason,
              icon: '🎯',
            });
          }
        }
      } catch (err) {
        console.error('Station detection error:', err.message);
      }
    }

    // ── FINAL VERDICT ────────────────────────────────────────────────────
    riskScore = Math.min(100, riskScore);    // ── FINAL VERDICT ────────────────────────────────────────────────────
    riskScore = Math.min(100, riskScore);    // ── FINAL VERDICT ────────────────────────────────
    riskScore = Math.min(100, riskScore);
    const verdict =
      riskScore >= 60 ? 'danger' :
      riskScore >= 40 ? 'warning' :
      riskScore >= 20 ? 'caution' : 'clear';

    // Sort: warnings first, then cautions, then info, then clear
    const levelOrder = { warning: 0, caution: 1, info: 2, clear: 3 };
    insights.sort((a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9));

    // ── Directional summary ──────────────────────────────────────────────
    // Generate a clear direction-aware verdict
    let directionVerdict = null;
    if (isDirectionalTrade && candles5m) {
      const isBuying = transactionType === 'BUY' || isBuyingCall;
      const isSelling = transactionType === 'SELL' || isBuyingPut;
      
      // Count bullish vs bearish signals from candle analysis
      let bullishSignals = 0, bearishSignals = 0;
      
      if (candles5m.length > 0) {
        const ema9 = calcEMA(candles5m, 9);
        const ema21 = calcEMA(candles5m, 21);
        if (ema9 > ema21) bullishSignals++; else bearishSignals++;
        
        const vwap = calcVWAP(candles5m);
        const lastPrice = candles5m[candles5m.length - 1].close;
        if (vwap && lastPrice > vwap) bullishSignals++; else if (vwap) bearishSignals++;
        
        const rsi = calcRSI(candles5m, 14);
        if (rsi > 55) bullishSignals++; else if (rsi < 45) bearishSignals++;
        
        const volAnalysis = analyzeVolume(candles5m);
        if (volAnalysis?.signal === 'bullish') bullishSignals++;
        else if (volAnalysis?.signal === 'bearish') bearishSignals++;
        
        const patterns = detectPatterns(candles5m);
        for (const p of patterns) {
          if (p.direction === 'bullish') bullishSignals++;
          else if (p.direction === 'bearish') bearishSignals++;
        }
      }
      
      const netBias = bullishSignals - bearishSignals;
      
      if (isBuying) {
        const action = 'BUYING';
        if (netBias >= 2) directionVerdict = { suitable: true, action, reason: 'Multiple bullish signals support long entry.' };
        else if (netBias >= 0) directionVerdict = { suitable: true, action, reason: 'Neutral to mildly bullish — acceptable for buying.' };
        else if (netBias >= -1) directionVerdict = { suitable: false, action, reason: 'Mixed signals — not ideal for long entry.' };
        else directionVerdict = { suitable: false, action, reason: 'Bearish bias — buying against the trend.' };
      } else if (isSelling) {
        const action = 'SELLING';
        if (netBias <= -2) directionVerdict = { suitable: true, action, reason: 'Multiple bearish signals support short entry.' };
        else if (netBias <= 0) directionVerdict = { suitable: true, action, reason: 'Neutral to mildly bearish — acceptable for selling.' };
        else if (netBias <= 1) directionVerdict = { suitable: false, action, reason: 'Mixed signals — not ideal for short entry.' };
        else directionVerdict = { suitable: false, action, reason: 'Bullish bias — selling against the trend.' };
      }
    }

    return NextResponse.json({ verdict, riskScore, insights, deepAnalysis: !!candles5m, directionVerdict, stationAnalysis });

  } catch (err) {
    console.error('behavioral-agent error:', err.message);
    return NextResponse.json({ verdict: 'clear', riskScore: 0, insights: [], error: err.message });
  }
}