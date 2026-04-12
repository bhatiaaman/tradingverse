import { NextResponse } from 'next/server';
import { StopLossEngine } from '../../../lib/analysis/stopLossEngine';
import { getDataProvider } from '@/app/lib/providers';

const INDEX_TOKENS = {
  NIFTY: 256265,
  BANKNIFTY: 260105,
  'NIFTY BANK': 260105,
  SENSEX: 265,
};

async function getToken(symbol, dp) {
    if (INDEX_TOKENS[symbol]) return INDEX_TOKENS[symbol];
    if (symbol === 'NIFTY 50') return 256265;
    
    // Dynamic fallback for all other symbols (e.g. RELIANCE, TCS)
    try {
        const csv = await dp.getInstrumentsCSV('NSE');
        const lines = csv.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            const sym = cols[2]?.replace(/"/g, '').trim();
            if (sym === symbol) {
                return parseInt(cols[0], 10);
            }
        }
    } catch(e) { }
    return null;
}

function getIST(offsetDays = 0) {
  const now = new Date();
  const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000);
  if (offsetDays) ist.setDate(ist.getDate() + offsetDays);
  return ist;
}

function fmtDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'NIFTY';
    const currentPriceStr = searchParams.get('currentPrice');
    
    let currentPrice = currentPriceStr ? parseFloat(currentPriceStr) : null;
    
    try {
        const dp = await getDataProvider();
        if (!dp || !dp.isConnected()) {
            return NextResponse.json({ error: "Kite not connected" }, { status: 503 });
        }

        const token = await getToken(symbol, dp);
        if (!token) {
            return NextResponse.json({ error: `Token not found for symbol: ${symbol}` }, { status: 400 });
        }

        const pCurrentPrice = new Promise(async (resolve) => {
            if (currentPrice) return resolve(currentPrice);
            try {
                let ltpSymbol = symbol;
                if (ltpSymbol === 'BANKNIFTY') ltpSymbol = 'NIFTY BANK';
                if (ltpSymbol === 'NIFTY') ltpSymbol = 'NIFTY 50';

                const quoteText = await dp.getLTP(`NSE:${ltpSymbol}`);
                if (quoteText?.data?.[`NSE:${ltpSymbol}`]) {
                    resolve(quoteText.data[`NSE:${ltpSymbol}`].last_price);
                } else resolve(22500); // hard fallback if market is completely closed/API glitch
            } catch(e) { resolve(22500); }
        });

        const toDateStr = fmtDate(getIST(0));
        
        const [raw15m, raw1H, raw1D, resolvedPrice] = await Promise.all([
            dp.getHistoricalData(token, '15minute', fmtDate(getIST(-15)), toDateStr),
            dp.getHistoricalData(token, '60minute', fmtDate(getIST(-30)), toDateStr),
            dp.getHistoricalData(token, 'day', fmtDate(getIST(-100)), toDateStr),
            pCurrentPrice
        ]);
        
        currentPrice = resolvedPrice;

        const proxPercent = 0.000625;
        const maxPercent = 0.00208;
        const prox = Math.max(1, currentPrice * proxPercent);
        const maxRng = Math.max(2, currentPrice * maxPercent);

        let roundStep = 500;
        if (currentPrice < 250) roundStep = 5;
        else if (currentPrice < 1000) roundStep = 10;
        else if (currentPrice < 4000) roundStep = 50;
        else if (currentPrice < 15000) roundStep = 100;

        const engine = new StopLossEngine({
            proximityTolerance: prox,
            clusterMaxRange: maxRng,
            roundNumberStep: roundStep
        });

        const mapCandles = (arr) => {
           if (!arr || !arr.length) return [];
           return arr.map(c => ({
               timestamp: new Date(c.date).getTime(),
               open: c.open,
               high: c.high,
               low: c.low,
               close: c.close,
               volume: c.volume
           }));
        };

        const data15m = mapCandles(raw15m);
        const data1H = mapCandles(raw1H);
        const data1D = mapCandles(raw1D);

        const optionsData = []; // Can be hooked to /api/option-chain later



        const clusters = engine.buildClusters({
            currentPrice,
            data15m,
            data1H,
            data1D,
            optionsData
        });

        const bslClusters = clusters.filter(c => c.side === 'BSL');
        const sslClusters = clusters.filter(c => c.side === 'SSL');

        return NextResponse.json({
            symbol,
            currentPrice,
            metrics: {
                totalClustersIdentified: clusters.length,
                bslCount: bslClusters.length,
                sslCount: sslClusters.length
            },
            message: "Liquidity clusters generated from real Kite data.",
            topBSLZones: bslClusters.slice(0, 3),
            topSSLZones: sslClusters.slice(0, 3)
        });

    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
