import { NextResponse } from 'next/server';
import { getDataProvider } from '@/app/lib/providers';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'default';

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, exSeconds) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${key}/${encoded}?ex=${exSeconds}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch {}
}

const INSTRUMENTS_CACHE_KEY = `${NS}:nfo-instruments-full`;

async function getNFOInstruments(dp) {
  const cached = await redisGet(INSTRUMENTS_CACHE_KEY);
  if (cached) return cached;

  // Use raw CSV fetch to avoid Kite SDK's fragile content-type === 'text/csv' check
  const csvText = await dp.getInstrumentsCSV('NFO');
  const lines   = csvText.trim().split('\n');
  const headers = lines[0].split(',');

  const tsIdx     = headers.indexOf('tradingsymbol');
  const nameIdx   = headers.indexOf('name');
  const expiryIdx = headers.indexOf('expiry');
  const strikeIdx = headers.indexOf('strike');
  const typeIdx   = headers.indexOf('instrument_type');

  const options = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const type = cols[typeIdx]?.replace(/"/g, '').trim();
    if (type === 'CE' || type === 'PE') {
      options.push({
        tradingsymbol:   cols[tsIdx]?.replace(/"/g, '').trim(),
        name:            cols[nameIdx]?.replace(/"/g, '').trim(),
        expiry:          cols[expiryIdx]?.replace(/"/g, '').trim() || '',
        strike:          parseFloat(cols[strikeIdx]) || 0,
        instrument_type: type,
      });
    }
  }

  await redisSet(INSTRUMENTS_CACHE_KEY, options, 7200);
  return options;
}

function fmt(oi) {
  if (oi >= 1e7) return (oi / 1e7).toFixed(1) + 'Cr';
  if (oi >= 1e5) return (oi / 1e5).toFixed(1) + 'L';
  if (oi >= 1e3) return (oi / 1e3).toFixed(1) + 'K';
  return String(oi);
}

function fmtVol(v) {
  if (!v) return '0';
  if (v >= 1e5) return (v / 1e5).toFixed(1) + 'L';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function buildAnalysis({ strike, type, spotPrice, strikeData, strikeGap }) {
  const signals = [];

  const ceWall = strikeData.reduce((b, s) => s.ceOI > b.ceOI ? s : b, strikeData[0]);
  const peWall = strikeData.reduce((b, s) => s.peOI > b.peOI ? s : b, strikeData[0]);

  const sameWall   = ceWall.strike === peWall.strike;
  const distCeWall = ceWall.strike - spotPrice;
  const distPeWall = spotPrice - peWall.strike;
  const trapped    = !sameWall && spotPrice >= peWall.strike && spotPrice <= ceWall.strike;

  const totalCE = strikeData.reduce((a, s) => a + s.ceOI, 0);
  const totalPE = strikeData.reduce((a, s) => a + s.peOI, 0);
  const pcr     = totalCE > 0 ? parseFloat((totalPE / totalCE).toFixed(2)) : 0;

  const strikes = strikeData.map(s => s.strike);
  let minPain = Infinity, maxPain = strike;
  for (const test of strikes) {
    let pain = 0;
    for (const s of strikeData) {
      if (s.ceOI > 0 && test < s.strike) pain += s.ceOI * (s.strike - test);
      if (s.peOI > 0 && test > s.strike) pain += s.peOI * (test - s.strike);
    }
    if (pain < minPain) { minPain = pain; maxPain = test; }
  }

  const sel      = strikeData.find(s => s.strike === strike) || { ceOI: 0, peOI: 0, ceVol: 0, peVol: 0, ceIV: 0, peIV: 0, ceOiOpen: 0, peOiOpen: 0, ceChg: 0, peChg: 0 };
  const myOI     = type === 'CE' ? sel.ceOI : sel.peOI;
  const wallOI   = type === 'CE' ? ceWall.ceOI : peWall.peOI;
  const oiRatio  = wallOI > 0 ? myOI / wallOI : 0;
  const myIV     = type === 'CE' ? sel.ceIV : sel.peIV;
  const myOiOpen = type === 'CE' ? sel.ceOiOpen : sel.peOiOpen;
  const myPriceChg = type === 'CE' ? sel.ceChg : sel.peChg;

  // ATM IV — for comparing whether this strike's IV is cheap or rich
  const atmStrike = Math.round(spotPrice / strikeGap) * strikeGap;
  const atmSel    = strikeData.find(s => s.strike === atmStrike);
  const atmIV     = type === 'CE' ? (atmSel?.ceIV || 0) : (atmSel?.peIV || 0);

  // When CE wall and PE wall are at the same strike, emit a single "Pinned strike" signal
  // to avoid contradictory Resistance + Support labels at the same level.
  if (sameWall) {
    const ceDominates = ceWall.ceOI >= peWall.peOI;
    const domPct      = Math.round((ceDominates ? ceWall.ceOI : peWall.peOI) / (ceWall.ceOI + peWall.peOI) * 100);
    const posText     = ceWall.strike > spotPrice
      ? `${Math.round(ceWall.strike - spotPrice)} pts above spot`
      : ceWall.strike < spotPrice
        ? `${Math.round(spotPrice - ceWall.strike)} pts below spot`
        : 'at spot';
    signals.push({
      tag: 'Pinned strike', icon: '📍', type: ceDominates ? 'bearish' : 'bullish',
      text: `Calls & Puts both peak at ${ceWall.strike} — ${ceDominates ? 'Call-heavy' : 'Put-heavy'} (${domPct}% of OI) · acts as ${ceDominates ? 'resistance' : 'support'} · ${posText}`,
    });
  } else {
    signals.push({
      tag: 'Resistance', icon: '🚧', type: 'bearish',
      text: `Call sellers piled up at ${ceWall.strike} (${fmt(ceWall.ceOI)} OI) · ${distCeWall > 0 ? Math.round(distCeWall) + ' pts above spot' : 'already breached'}`,
    });
    signals.push({
      tag: 'Support', icon: '🛡️', type: 'bullish',
      text: `Put sellers defending ${peWall.strike} (${fmt(peWall.peOI)} OI) · ${distPeWall > 0 ? Math.round(distPeWall) + ' pts below spot' : 'already broken'}`,
    });
  }

  if (trapped) {
    signals.push({
      tag: 'Range', icon: '↔️', type: 'neutral',
      text: `Spot stuck in ${ceWall.strike - peWall.strike}pt range (${peWall.strike}–${ceWall.strike}) — no clear direction; avoid chasing breakouts`,
    });
  } else if (spotPrice > ceWall.strike) {
    signals.push({
      tag: 'Breakout', icon: '🚀', type: 'bullish',
      text: `Spot broke above ${ceWall.strike} resistance — call sellers may start buying back; bullish momentum`,
    });
  } else if (spotPrice < peWall.strike || (sameWall && spotPrice < ceWall.strike)) {
    const wallLabel = sameWall ? `${ceWall.strike} support` : `${peWall.strike} support`;
    signals.push({
      tag: 'Breakdown', icon: '📉', type: 'bearish',
      text: `Spot broke below ${wallLabel} — put sellers losing grip; bears in control`,
    });
  }

  if (oiRatio > 0.8) {
    signals.push({
      tag: 'Dominant wall', icon: '⚡', type: type === 'CE' ? 'bearish' : 'bullish',
      text: `${strike} ${type} is the main concentration (${Math.round(oiRatio * 100)}% of peak OI) — sellers are most active here; good for option selling`,
    });
  } else if (oiRatio > 0.4) {
    signals.push({
      tag: 'Secondary level', icon: '⚠️', type: 'neutral',
      text: `Some activity at ${strike} ${type} (${Math.round(oiRatio * 100)}% of peak) — bigger level is at ${type === 'CE' ? ceWall.strike : peWall.strike}`,
    });
  } else {
    // Light OI — not emitted; it's the default case for most strikes and adds noise
  }

  // Position flow — OI change direction tells you if positions are being added or shed
  // oi_day_low is used as a proxy for opening OI (prev-day close OI ≈ day's low OI)
  const oiChange    = myOI - myOiOpen;
  const oiChangePct = myOiOpen > 0 ? (oiChange / myOiOpen) * 100 : 0;
  if (myOiOpen > 0 && Math.abs(oiChangePct) >= 10) {
    const oiAdded = oiChange > 0;
    const priceUp = myPriceChg > 0;
    const oiLabel = `OI ${oiAdded ? '+' : ''}${fmt(oiChange)} today`;
    const priceLabel = `${type} price ${priceUp ? 'rose' : 'fell'} ₹${Math.abs(myPriceChg).toFixed(1)}`;
    let flowTag, flowIcon, flowType, flowText;
    if (oiAdded && !priceUp) {
      flowTag = 'Short buildup'; flowIcon = '🐻'; flowType = 'bearish';
      flowText = `${oiLabel}, ${priceLabel} — new sellers entering; price being pushed down at this level`;
    } else if (oiAdded && priceUp) {
      flowTag = 'Long buildup'; flowIcon = '🐂'; flowType = 'bullish';
      flowText = `${oiLabel}, ${priceLabel} — new buyers entering; price being pushed up at this level`;
    } else if (!oiAdded && priceUp) {
      flowTag = 'Short covering'; flowIcon = '📈'; flowType = 'bullish';
      flowText = `${oiLabel}, ${priceLabel} — sellers buying back; downward pressure easing`;
    } else {
      flowTag = 'Long unwinding'; flowIcon = '📉'; flowType = 'bearish';
      flowText = `${oiLabel}, ${priceLabel} — buyers exiting; upward momentum fading`;
    }
    signals.push({ tag: flowTag, icon: flowIcon, type: flowType, text: flowText });
  }

  // IV vs ATM — is this strike's premium cheap or expensive?
  if (myIV > 0) {
    if (atmIV > 0) {
      const ivRatio = myIV / atmIV;
      if (ivRatio > 1.15) {
        signals.push({ tag: 'IV', icon: '🔥', type: 'warning',
          text: `IV ${myIV.toFixed(1)}% vs ATM ${atmIV.toFixed(1)}% — elevated; premium is rich; selling has edge over buying` });
      } else if (ivRatio < 0.87) {
        signals.push({ tag: 'IV', icon: '💎', type: 'bullish',
          text: `IV ${myIV.toFixed(1)}% vs ATM ${atmIV.toFixed(1)}% — low; premium is cheap; buying has edge over selling` });
      } else {
        signals.push({ tag: 'IV', icon: '⚡', type: 'neutral',
          text: `IV ${myIV.toFixed(1)}% — inline with ATM (${atmIV.toFixed(1)}%); no premium edge either way` });
      }
    } else {
      signals.push({ tag: 'IV', icon: '⚡', type: 'neutral', text: `IV ${myIV.toFixed(1)}%` });
    }
  }

  const painDist = Math.abs(strike - maxPain);
  if (painDist <= strikeGap) {
    signals.push({ tag: 'Expiry pin', icon: '🎯', type: 'warning', text: `Your strike is near ₹${maxPain} — the price where most options expire worthless; time decay hurts buyers most here` });
  } else {
    signals.push({ tag: 'Expiry pin', icon: '🎯', type: 'neutral', text: `Most options expire worthless at ₹${maxPain} · ${painDist} pts ${strike > maxPain ? 'above' : 'below'} your strike` });
  }

  if (pcr > 1.3) {
    signals.push({ tag: 'Sentiment', icon: '📈', type: 'bullish', text: `Put sellers are active around this zone (PCR ${pcr.toFixed(2)}) — they're defending the downside; bullish bias` });
  } else if (pcr < 0.7) {
    signals.push({ tag: 'Sentiment', icon: '📉', type: 'bearish', text: `Call sellers dominating this zone (PCR ${pcr.toFixed(2)}) — they're capping the upside; bearish bias` });
  } else {
    signals.push({ tag: 'Sentiment', icon: '⚖️', type: 'neutral', text: `Calls and puts evenly matched around this strike (PCR ${pcr.toFixed(2)}) — no strong bias either way` });
  }

  let verdict, verdictReason;
  if (type === 'CE') {
    if (oiRatio > 0.7 && spotPrice < strike) {
      // Dominant CE wall above spot — clear resistance; selling favored
      verdict = 'sell';
      verdictReason = strike >= maxPain
        ? 'Heavy selling resistance at/above expiry pin — good level to sell calls'
        : 'Call sellers dominating above spot — strong resistance; call premium likely to erode';
    } else if (!trapped && spotPrice > ceWall.strike) {
      verdict = 'buy'; verdictReason = 'Resistance broken — call buying with strong upward momentum';
    } else if (trapped && distCeWall < strikeGap * 2) {
      verdict = 'sell'; verdictReason = 'Price stuck in range near resistance — selling option premium favored';
    } else {
      verdict = 'neutral'; verdictReason = 'No strong edge; confirm trend before entry';
    }
  } else {
    if (oiRatio > 0.7 && spotPrice > strike) {
      // Dominant PE wall below spot — clear support; selling favored
      verdict = 'sell';
      verdictReason = strike <= maxPain
        ? 'Heavy put selling support at/below expiry pin — good level to sell puts'
        : 'Put sellers defending below spot — strong support; put premium likely to erode';
    } else if (!trapped && spotPrice < peWall.strike) {
      verdict = 'buy'; verdictReason = 'Support broken — put buying with strong downward momentum';
    } else if (trapped && distPeWall < strikeGap * 2) {
      verdict = 'sell'; verdictReason = 'Price stuck in range near support — selling option premium favored';
    } else {
      verdict = 'neutral'; verdictReason = 'No strong edge; confirm trend before entry';
    }
  }

  return { signals, pcr, maxPain, ceWall: ceWall.strike, peWall: peWall.strike, verdict, verdictReason };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol     = searchParams.get('symbol')?.toUpperCase();
  const strike     = parseInt(searchParams.get('strike'));
  const type       = searchParams.get('type')?.toUpperCase();
  const expiryType = searchParams.get('expiryType') || 'monthly';
  const strikeGap  = parseInt(searchParams.get('strikeGap') || '50');
  const spotPrice  = parseFloat(searchParams.get('spotPrice') || '0');

  if (!symbol || !strike || !type) {
    return NextResponse.json({ error: 'symbol, strike and type required' }, { status: 400 });
  }

  const cacheKey = `${NS}:strike-analysis-v5:${symbol}:${strike}:${type}:${expiryType}:${strikeGap}`;
  const cached   = await redisGet(cacheKey);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    const dp = await getDataProvider();
    if (!dp.isConnected()) return NextResponse.json({ error: 'Kite not authenticated' }, { status: 401 });

    const allInstruments = await getNFOInstruments(dp);
    const symbolOptions  = allInstruments.filter(i => i.name === symbol);
    if (symbolOptions.length === 0) {
      return NextResponse.json({ error: `No NFO options for ${symbol}` }, { status: 404 });
    }

    const toDateStr = (d) => {
      const dt = d instanceof Date ? d : new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };

    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);
    const expiries = [...new Set(symbolOptions.map(o => toDateStr(o.expiry)))]
      .filter(e => e >= todayStr)
      .sort();

    let selectedExpiry;
    if (expiryType === 'weekly') {
      selectedExpiry = expiries[0];
    } else {
      const monthlyExpiries = expiries.filter(exp => {
        const next = expiries.find(e => e > exp);
        return !next || new Date(next).getMonth() !== new Date(exp).getMonth();
      });
      selectedExpiry = monthlyExpiries[0] || expiries[0];
    }
    if (!selectedExpiry) return NextResponse.json({ error: `No valid expiry for ${symbol}` }, { status: 404 });

    // ±5 strikes around the selected strike
    const strikes = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(i => strike + i * strikeGap);

    const relevantOptions = allInstruments.filter(i =>
      i.name === symbol &&
      toDateStr(i.expiry) === selectedExpiry &&
      strikes.includes(i.strike) &&
      (i.instrument_type === 'CE' || i.instrument_type === 'PE')
    );
    if (relevantOptions.length === 0) {
      return NextResponse.json({ error: `No options at these strikes for ${symbol}` }, { status: 404 });
    }

    const quoteSymbols = relevantOptions.map(o => `NFO:${o.tradingsymbol}`);
    const quotes       = await dp.getQuote(quoteSymbols);

    const strikeMap = {};
    for (const opt of relevantOptions) {
      const q = quotes[`NFO:${opt.tradingsymbol}`];
      if (!strikeMap[opt.strike]) {
        strikeMap[opt.strike] = { strike: opt.strike, ceOI: 0, peOI: 0, ceLtp: 0, peLtp: 0, ceVol: 0, peVol: 0, ceChg: 0, peChg: 0, ceIV: 0, peIV: 0, ceOiOpen: 0, peOiOpen: 0 };
      }
      if (opt.instrument_type === 'CE') {
        strikeMap[opt.strike].ceOI     = q?.oi || 0;
        strikeMap[opt.strike].ceLtp    = q?.last_price || 0;
        strikeMap[opt.strike].ceVol    = q?.volume || 0;
        strikeMap[opt.strike].ceChg    = q?.net_change || 0;
        strikeMap[opt.strike].ceIV     = q?.implied_volatility || 0;
        strikeMap[opt.strike].ceOiOpen = q?.oi_day_low || 0;
      } else {
        strikeMap[opt.strike].peOI     = q?.oi || 0;
        strikeMap[opt.strike].peLtp    = q?.last_price || 0;
        strikeMap[opt.strike].peVol    = q?.volume || 0;
        strikeMap[opt.strike].peChg    = q?.net_change || 0;
        strikeMap[opt.strike].peIV     = q?.implied_volatility || 0;
        strikeMap[opt.strike].peOiOpen = q?.oi_day_low || 0;
      }
    }

    const strikeData = strikes
      .map(s => strikeMap[s] || { strike: s, ceOI: 0, peOI: 0, ceLtp: 0, peLtp: 0, ceVol: 0, peVol: 0 })
      .sort((a, b) => a.strike - b.strike);

    const analysis = buildAnalysis({ strike, type, spotPrice, strikeData, strikeGap });

    const sel = strikeMap[strike] || {};
    const ltp = type === 'CE' ? (sel.ceLtp || 0) : (sel.peLtp || 0);
    const vol = type === 'CE' ? (sel.ceVol || 0) : (sel.peVol || 0);

    const expiryDate    = new Date(selectedExpiry);
    const daysToExpiry  = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

    const result = {
      symbol, strike, type, expiryType,
      expiry:        expiryDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
      daysToExpiry,
      ltp, vol,
      ceOI:          sel.ceOI || 0,
      peOI:          sel.peOI || 0,
      pcr:           analysis.pcr,
      maxPain:       analysis.maxPain,
      ceWall:        analysis.ceWall,
      peWall:        analysis.peWall,
      verdict:       analysis.verdict,
      verdictReason: analysis.verdictReason,
      signals:       analysis.signals,
      strikeData,
      timestamp:     new Date().toISOString(),
    };

    await redisSet(cacheKey, result, 60);
    return NextResponse.json(result);

  } catch (err) {
    console.error('strike-analysis error:', err.message);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
