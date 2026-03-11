'use client';

import { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Loader2, RefreshCw, LogIn, Brain, AlertTriangle, Target, ChevronDown } from 'lucide-react';
import { nseStrikeSteps } from '@/app/lib/nseStrikeSteps';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario Card (dark-only, used inside OrderModal analysis tab)
// ─────────────────────────────────────────────────────────────────────────────
const SCENARIO_COLORS = {
  red:    { bg: 'bg-red-500/10',   border: 'border-red-500/30',   bar: 'bg-red-400'   },
  green:  { bg: 'bg-green-500/10', border: 'border-green-500/30', bar: 'bg-green-400' },
  yellow: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', bar: 'bg-amber-400' },
  slate:  { bg: 'bg-slate-500/10', border: 'border-slate-700/50', bar: 'bg-slate-600' },
};
const CONFIDENCE_STYLE = { HIGH: 'text-emerald-400', MEDIUM: 'text-amber-400', LOW: 'text-slate-500' };

function ScenarioCard({ scenarioResult }) {
  const [open, setOpen] = useState(true);
  if (!scenarioResult || scenarioResult.scenario === 'UNCLEAR') return null;
  const { label, color, confidence, summary, forSignals, againstSignals } = scenarioResult;
  const palette = SCENARIO_COLORS[color] ?? SCENARIO_COLORS.slate;
  return (
    <div className={`rounded-xl border ${palette.border} overflow-hidden`}>
      <div className={`h-0.5 ${palette.bar}`} />
      <div className={palette.bg}>
        <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Target size={13} className="text-indigo-400 flex-shrink-0" />
            <div className="text-left">
              <div className="text-xs font-bold text-white leading-tight">{label}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{summary}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            <span className={`text-[10px] font-bold tracking-wide ${CONFIDENCE_STYLE[confidence]}`}>{confidence}</span>
            <ChevronDown size={11} className={`text-slate-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {open && (forSignals?.length > 0 || againstSignals?.length > 0) && (
          <div className="px-3 pb-2.5 space-y-1">
            {forSignals?.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px]">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1 flex-shrink-0" />
                <span className="text-slate-300">{s.label}</span>
              </div>
            ))}
            {againstSignals?.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px]">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1 flex-shrink-0" />
                <span className="text-slate-400">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrderModal({
  isOpen,
  onClose,
  symbol,
  price,
  defaultType = 'BUY',
  optionType = null,
  optionSymbol = null,
  onOrderPlaced
}) {
  const [transactionType, setTransactionType] = useState(defaultType);
  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState(optionType ? 'NRML' : 'CNC');
  const [orderType, setOrderType] = useState('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [exchange, setExchange] = useState(optionType ? 'NFO' : 'NSE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [isSessionLoggedIn, setIsSessionLoggedIn] = useState(true); // optimistic
  const [userRole, setUserRole] = useState(null); // null=unknown, 'admin', 'user'
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [kiteApiKey, setKiteApiKey] = useState('');
  
  const [kiteOptionSymbol, setKiteOptionSymbol] = useState(null);
  const [optionLtp, setOptionLtp] = useState(null);
  const [strike, setStrike] = useState(null);
  const [expiryDay, setExpiryDay] = useState(null);
  const [lotSize, setLotSize] = useState(1);
  const [fetchingLtp, setFetchingLtp] = useState(false);

  // ─── QUICK INSIGHTS STATE ────────────────────────────────────────────
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsResult, setInsightsResult] = useState(null);
  const [showInsightDetails, setShowInsightDetails] = useState(false);
  const [avgDownAlert, setAvgDownAlert] = useState(null); // Averaging down warning
  const [positions, setPositions] = useState([]);
  const [activeTab, setActiveTab] = useState('order');
  const [deepIntelLoading, setDeepIntelLoading] = useState(false);
  const [deepIntelResult, setDeepIntelResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      checkKiteAuth();
      fetchPositions();
    }
  }, [isOpen]);

  const fetchPositions = async () => {
    try {
      const res = await fetch('/api/kite-positions');
      const data = await res.json();
      if (data.positions) {
        setPositions(data.positions);
      }
    } catch (err) {
      console.error('Error fetching positions:', err);
    }
  };

  const checkKiteAuth = async () => {
    setCheckingAuth(true);
    try {
      // Check session + role first
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json();
      if (!meData.user) {
        setIsSessionLoggedIn(false);
        setIsLoggedIn(false);
        return;
      }
      setIsSessionLoggedIn(true);
      setUserRole(meData.user.role);

      // Only admin can connect broker / place orders
      if (meData.user.role !== 'admin') return;

      const res = await fetch('/api/kite-config');
      if (res.status === 401) {
        setIsLoggedIn(false);
        return;
      }
      const data = await res.json();
      setIsLoggedIn(data.tokenValid === true);
      setKiteApiKey(data.config?.apiKey || '');
    } catch (err) {
      console.error('Error checking Kite auth:', err);
      setIsLoggedIn(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleKiteLogin = () => {
    const popup = window.open('/settings/kite', 'KiteSettings', 'width=600,height=700,scrollbars=yes');
    const handleMessage = (event) => {
      if (event.data?.type === 'KITE_LOGIN_SUCCESS') {
        checkKiteAuth();
        window.removeEventListener('message', handleMessage);
      }
    };
    window.addEventListener('message', handleMessage);
    const checkPopup = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkPopup);
        window.removeEventListener('message', handleMessage);
        setTimeout(() => checkKiteAuth(), 500);
      }
    }, 500);
  };

  useEffect(() => {
    if (isOpen && optionType && symbol && price && isLoggedIn) {
      fetchOptionDetails();
    }
  }, [isOpen, optionType, symbol, price, isLoggedIn]);

  const fetchOptionDetails = async () => {
    setFetchingLtp(true);
    setError('');
    try {
      const res = await fetch(`/api/option-ltp?symbol=${symbol}&price=${price}&type=${optionType}`);
      const data = await res.json();
      if (res.ok && data.optionSymbol) {
        setKiteOptionSymbol(data.optionSymbol);
        setOptionLtp(data.ltp);
        setStrike(data.strike);
        setExpiryDay(data.expiryDay);
        if (data.lotSize) setLotSize(data.lotSize);
        setLimitPrice(data.ltp?.toString() || '');
      } else if (res.status === 401) {
        setIsLoggedIn(false);
      } else {
        setError(data.error || 'Failed to fetch option details');
      }
    } catch (err) {
      console.error('Error fetching option LTP:', err);
      setError('Failed to fetch option price');
    } finally {
      setFetchingLtp(false);
    }
  };

  const getExpectedStrike = (sym, prc, type) => {
    const p = parseFloat(prc) || 0;
    let step = nseStrikeSteps[sym];
    if (!step) {
      if (p >= 5000) step = 50;
      else if (p >= 1000) step = 20;
      else if (p >= 500) step = 10;
      else if (p >= 100) step = 5;
      else step = 2.5;
    }
    return type === 'CE' ? Math.ceil(p / step) * step : Math.floor(p / step) * step;
  };

  useEffect(() => {
    if (isOpen) {
      setTransactionType(defaultType);
      setQuantity(optionType ? 1 : 1);
      setProduct(optionType ? 'NRML' : 'CNC');
      setOrderType(optionType ? 'LIMIT' : 'MARKET');
      setLimitPrice(price?.toString() || '');
      setTriggerPrice('');
      setExchange(optionType ? 'NFO' : 'NSE');
      setError('');
      setSuccess('');
      setKiteOptionSymbol(null);
      setOptionLtp(null);
      setExpiryDay(null);
      setInsightsResult(null);
      setShowInsightDetails(false);
      setActiveTab('order');
      setDeepIntelResult(null);
      if (optionType && price) {
        setStrike(getExpectedStrike(symbol, price, optionType));
      } else {
        setStrike(null);
      }
    }
  }, [isOpen, defaultType, price, optionType, symbol]);

  // ─── FETCH QUICK INSIGHTS ────────────────────────────────────────────
  const fetchQuickInsights = async () => {
    if (!symbol || !transactionType) return;
    setInsightsLoading(true);
    try {
      const [sentRes, posRes, ordRes] = await Promise.allSettled([
        fetch('/api/sentiment').then(r => r.json()),
        fetch('/api/kite-positions').then(r => r.json()),
        fetch('/api/kite-orders?limit=10').then(r => r.json()),
      ]);
      
      const sentimentCtx = sentRes.status === 'fulfilled' ? sentRes.value : null;
      const positions = posRes.status === 'fulfilled' ? posRes.value?.positions || [] : [];
      const openOrders = ordRes.status === 'fulfilled' ? ordRes.value?.orders || [] : [];
      
      const res = await fetch('/api/behavioral-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          tradingsymbol: kiteOptionSymbol || optionSymbol || symbol,
          exchange: optionType ? 'NFO' : 'NSE',
          instrumentType: optionType || 'EQ',
          transactionType,
          quantity: quantity || 1,
          price: optionType ? (optionLtp || price) : price,
          spotPrice: price || 0,
          context: {
            positions,
            openOrders,
            sentimentScore: sentimentCtx?.overall?.score,
            sentimentBias: sentimentCtx?.overall?.mood,
            intradayScore: sentimentCtx?.timeframes?.intraday?.score,
            intradayBias: sentimentCtx?.timeframes?.intraday?.bias,
            vix: null,
            sectorData: [],
            pcr: null,
            optionChain: null,
          },
        }),
      });
      
      const data = await res.json();
      setInsightsResult(data);
    } catch (err) {
      console.error('Quick insights error:', err);
    } finally {
      setInsightsLoading(false);
    }
  };

  // ─── FETCH DEEP INTELLIGENCE (5 agents) ─────────────────────────────
  const fetchDeepIntel = async () => {
    if (!symbol || !transactionType) return;
    setDeepIntelLoading(true);
    try {
      const isIndex = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].includes(symbol?.toUpperCase());
      const res = await fetch('/api/order-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          tradingsymbol: kiteOptionSymbol || optionSymbol || symbol,
          exchange: optionType ? 'NFO' : 'NSE',
          instrumentType: optionType || 'EQ',
          transactionType,
          productType: product,
          quantity: quantity || 1,
          price: optionType ? (optionLtp || price) : price,
          spotPrice: price || 0,
          includeStructure: true,
          includePattern: true,
          includeStation: true,
          includeOI: isIndex,
        }),
      });
      const data = await res.json();
      setDeepIntelResult(data);
    } catch (err) {
      console.error('Deep intel error:', err);
    } finally {
      setDeepIntelLoading(false);
    }
  };

  // Trigger quick + deep analysis when modal opens or transaction type changes
  useEffect(() => {
    if (isOpen && symbol && transactionType && isLoggedIn) {
      fetchQuickInsights();
      fetchDeepIntel();
    }
  }, [isOpen, symbol, transactionType, isLoggedIn, kiteOptionSymbol]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isSessionLoggedIn) {
      setIsSessionLoggedIn(false);
      return;
    }
    if (!isLoggedIn) {
      setError('Please connect your broker account first');
      return;
    }

    // ── Averaging down guard ──────────────────────────────────────────────
    if (!avgDownAlert && positions.length > 0) {
      const tradingSymbol = optionType ? (kiteOptionSymbol || optionSymbol) : symbol;
      const matchingPos = positions.find(p => 
        (p.tradingsymbol === tradingSymbol || p.tradingsymbol === symbol) &&
        p.quantity !== 0
      );

      if (matchingPos) {
        const isAddingLong  = matchingPos.quantity > 0 && transactionType === 'BUY';
        const isAddingShort = matchingPos.quantity < 0 && transactionType === 'SELL';
        
        // Calculate UNREALIZED P&L for current open position
        const avgPrice = matchingPos.average_price || 0;
        const ltp = matchingPos.last_price || 0;
        const qty = Math.abs(matchingPos.quantity);
        const isLong = matchingPos.quantity > 0;
        
        const unrealizedPnl = isLong 
          ? (ltp - avgPrice) * qty
          : (avgPrice - ltp) * qty;
        
        const lossThreshold = exchange === 'NFO' ? -500 : -200;
        const isLosingTrade = unrealizedPnl < lossThreshold;

        if ((isAddingLong || isAddingShort) && isLosingTrade) {
          setAvgDownAlert({ position: matchingPos, unrealizedPnl, avgPrice, ltp });
          return;
        }
      }
    }

    // Clear alert if bypass confirmed
    if (avgDownAlert) {
      setAvgDownAlert(null);
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const tradingSymbol = optionType ? (kiteOptionSymbol || optionSymbol) : symbol;
      const orderData = {
        tradingsymbol: tradingSymbol,
        exchange,
        transaction_type: transactionType,
        quantity: parseInt(quantity),
        product,
        order_type: orderType,
        variety: 'regular',
      };
      if (orderType === 'LIMIT' && limitPrice) {
        orderData.price = parseFloat(limitPrice);
      }
      if (['SL', 'SL-M'].includes(orderType) && triggerPrice) {
        orderData.trigger_price = parseFloat(triggerPrice);
        if (orderType === 'SL' && limitPrice) {
          orderData.price = parseFloat(limitPrice);
        }
      }
      const response = await fetch('/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });
      const result = await response.json();
      if (response.status === 401) {
        setIsSessionLoggedIn(false);
        setIsLoggedIn(false);
        return;
      }
      if (!response.ok) {
        throw new Error(result.error || 'Failed to place order');
      }
      setSuccess(`Order placed! ID: ${result.order_id}`);
      if (onOrderPlaced) {
        onOrderPlaced(result);
      }
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const displayPrice = optionType ? (optionLtp || 0) : (price || 0);
  const estimatedValue = quantity * (parseFloat(limitPrice) || displayPrice);

  // ─── VERDICT CONFIG ───────────────────────────────────────────────────
  const getVerdictColor = (verdict) => {
    switch (verdict) {
      case 'danger': return { bg: 'bg-red-900/20', border: 'border-red-500/40', text: 'text-red-400', dot: 'bg-red-500', stroke: '#ef4444' };
      case 'warning': return { bg: 'bg-amber-900/20', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-500', stroke: '#f59e0b' };
      case 'caution': return { bg: 'bg-yellow-900/15', border: 'border-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500', stroke: '#eab308' };
      default: return { bg: 'bg-green-900/20', border: 'border-green-500/30', text: 'text-green-400', dot: 'bg-green-500', stroke: '#22c55e' };
    }
  };

  const getDirectionColor = (suitable) => {
    return suitable
      ? { bg: 'bg-green-900/20', border: 'border-green-500/30', text: 'text-green-400', icon: '✅' }
      : { bg: 'bg-amber-900/20', border: 'border-amber-500/30', text: 'text-amber-400', icon: '⚠' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`px-5 py-4 border-b border-slate-700 flex items-center justify-between sticky top-0 z-10 ${
          transactionType === 'BUY' ? 'bg-green-900/30' : 'bg-red-900/30'
        }`}>
          <div className="flex items-center gap-3">
            {transactionType === 'BUY' ? (
              <TrendingUp className="w-6 h-6 text-green-400" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-400" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{symbol}</h2>
                {optionType && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    optionType === 'CE' ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'
                  }`}>
                    {optionType}
                  </span>
                )}
              </div>
              {optionType && kiteOptionSymbol && (
                <p className="text-slate-300 text-xs font-mono">{kiteOptionSymbol}</p>
              )}
              {optionType && strike && (
                <p className="text-slate-400 text-xs">
                  Spot: ₹{price?.toLocaleString('en-IN') || '---'} • Strike: ₹{strike.toLocaleString('en-IN')} 
                  {expiryDay && <span className="text-blue-400"> • Exp: {expiryDay}</span>}
                </p>
              )}
              {optionType && (
                <p className="text-slate-400 text-xs">
                  {fetchingLtp ? (
                    <span className="text-blue-400">Loading option LTP...</span>
                  ) : optionLtp ? (
                    <span className="text-green-400">Option LTP: ₹{optionLtp.toLocaleString('en-IN')}</span>
                  ) : (
                    <span className="text-yellow-500">Option LTP unavailable</span>
                  )}
                </p>
              )}
              {!optionType && (
                <p className="text-slate-400 text-sm">
                  Stock Price: ₹{price?.toLocaleString('en-IN') || '---'} • {exchange}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {optionType && (
              <button
                type="button"
                onClick={fetchOptionDetails}
                disabled={fetchingLtp}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                title="Refresh LTP"
              >
                <RefreshCw className={`w-4 h-4 text-slate-400 ${fetchingLtp ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {checkingAuth ? (
          <div className="p-8 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-3" />
            <p className="text-slate-400 text-sm">Checking authentication...</p>
          </div>
        ) : !isSessionLoggedIn ? (
          <div className="p-8 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-blue-600/30">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Login Required</h3>
            <p className="text-slate-400 text-sm text-center mb-6 max-w-xs">
              You need to log in to TradingVerse to place orders.
            </p>
            <a
              href="/login"
              className="px-8 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              Login to TradingVerse
            </a>
          </div>
        ) : userRole === 'user' ? (
          <div className="p-8 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-violet-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-violet-600/30">
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Pro Feature</h3>
            <p className="text-amber-400 text-sm font-semibold mb-2">
              Order placement is available on the Pro plan.
            </p>
            <p className="text-slate-500 text-xs max-w-xs mb-5">
              Connect your broker and trade directly from TradingVerse with AI-powered order intelligence.
            </p>
            <a href="/pricing" className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-colors">
              View Plans →
            </a>
          </div>
        ) : !isLoggedIn ? (
          <div className="p-8 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-orange-600/30">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Connect to Kite</h3>
            <p className="text-slate-400 text-sm text-center mb-6 max-w-xs">
              Login to your Zerodha Kite account to place orders directly from here
            </p>
            <button
              type="button"
              onClick={handleKiteLogin}
              className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-orange-600/30 flex items-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              Login to Kite
            </button>
            <button
              type="button"
              onClick={checkKiteAuth}
              className="mt-4 text-slate-400 hover:text-white text-sm flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Status
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col">

          {/* ── Tab bar ─────────────────────────────────────────────────────── */}
          <div className="flex px-5 pt-3 pb-2 gap-1 border-b border-white/5">
            <button type="button" onClick={() => setActiveTab('order')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'order' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}>
              Place Order
            </button>
            <button type="button" onClick={() => setActiveTab('analysis')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'analysis' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}>
              Intelligence
              {insightsResult && (insightsResult.verdict === 'danger' || insightsResult.verdict === 'warning' || insightsResult.verdict === 'caution') && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              )}
            </button>
          </div>

          {/* ── ANALYSIS TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'analysis' && (
          <div className="p-5 space-y-3">
            {/* Scenario synthesis — shown once deep intel (station) is loaded */}
            {deepIntelResult?.scenario && (
              <ScenarioCard scenarioResult={deepIntelResult.scenario} />
            )}
            {insightsLoading && (
              <div className="p-3 bg-slate-700/50 border border-white/10 rounded-xl flex items-center gap-2">
                <Brain size={16} className="text-purple-400 animate-pulse" />
                <span className="text-xs text-slate-300">Analyzing trade setup...</span>
              </div>
            )}
            {insightsResult && !insightsLoading && (() => {
              const vc = getVerdictColor(insightsResult.verdict);
              const warnings = insightsResult.insights?.filter(i => i.level === 'warning') || [];
              const cautions = insightsResult.insights?.filter(i => i.level === 'caution') || [];
              const infos    = insightsResult.insights?.filter(i => i.level === 'info') || [];
              const clears   = insightsResult.insights?.filter(i => i.level === 'clear') || [];
              const ordered  = [...warnings, ...cautions, ...infos, ...clears];
              const cardCfg  = {
                warning: { bg: 'bg-red-900/30',   border: 'border-red-500/30',   text: 'text-red-300'   },
                caution: { bg: 'bg-amber-900/25', border: 'border-amber-500/25', text: 'text-amber-300' },
                info:    { bg: 'bg-blue-900/20',  border: 'border-blue-500/20',  text: 'text-blue-300'  },
                clear:   { bg: 'bg-green-900/15', border: 'border-green-500/20', text: 'text-green-300' },
              };
              return (
                <div className="space-y-2">
                  <div className={`p-3 rounded-xl border ${vc.bg} ${vc.border}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <svg width="36" height="36" viewBox="0 0 32 32" className="-rotate-90">
                            <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                            <circle cx="16" cy="16" r="14" fill="none" stroke={vc.stroke} strokeWidth="3"
                              strokeDasharray={`${(insightsResult.riskScore / 100) * 88} 88`} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`text-xs font-bold ${vc.text}`}>{insightsResult.riskScore}</span>
                          </div>
                        </div>
                        <div>
                          <div className={`text-sm font-semibold ${vc.text}`}>
                            {insightsResult.verdict === 'danger' ? 'High Risk' :
                             insightsResult.verdict === 'warning' ? 'Caution' :
                             insightsResult.verdict === 'caution' ? 'Review' : 'Looks Good'}
                          </div>
                          <div className="text-[10px] text-slate-500">Risk Score</div>
                        </div>
                      </div>
                      <button type="button" onClick={fetchQuickInsights} title="Refresh" className="p-1.5 hover:bg-white/5 rounded transition-colors">
                        <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  </div>
                  {insightsResult.directionVerdict && (() => {
                    const dc = getDirectionColor(insightsResult.directionVerdict.suitable);
                    return (
                      <div className={`p-2.5 rounded-lg border ${dc.bg} ${dc.border}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm">{dc.icon}</span>
                          <span className={`text-xs font-semibold ${dc.text}`}>
                            {insightsResult.directionVerdict.suitable ? 'GOOD SETUP' : 'WEAK SETUP'} FOR {insightsResult.directionVerdict.action || 'THIS TRADE'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{insightsResult.directionVerdict.reason}</p>
                      </div>
                    );
                  })()}
                  {ordered.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {warnings.length > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>}
                      {cautions.length > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400">{cautions.length} caution{cautions.length > 1 ? 's' : ''}</span>}
                      {infos.length > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-400">{infos.length} info</span>}
                      {clears.length > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500/20 text-green-400">{clears.length} clear</span>}
                      {insightsResult.deepAnalysis && <span className="ml-auto text-[10px] text-slate-500">⚡ live data</span>}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {ordered.map((ins, i) => {
                      const cfg = cardCfg[ins.level] || cardCfg.info;
                      return (
                        <div key={i} className={`p-2.5 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                          <div className="flex items-start gap-2">
                            {ins.icon && <span className="text-sm leading-tight flex-shrink-0">{ins.icon}</span>}
                            <div className="min-w-0">
                              <div className={`text-[11px] font-semibold ${cfg.text} leading-snug`}>{ins.title}</div>
                              {ins.detail && <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{ins.detail}</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {insightsResult.stationAnalysis?.available && insightsResult.stationAnalysis.nearestStation && (() => {
                    const nearest = insightsResult.stationAnalysis.nearestStation;
                    const evaluation = insightsResult.stationAnalysis.tradeEvaluation;
                    const stationLabel = nearest.name || nearest.level || nearest.type || 'Key Level';
                    return (
                      <div className="pt-1 border-t border-white/10">
                        <div className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Nearest Station</div>
                        <div className="p-2.5 bg-indigo-900/25 border border-indigo-500/25 rounded-lg">
                          <div className="flex items-start gap-2">
                            <span className="text-base leading-none">🚉</span>
                            <div>
                              <div className="text-[11px] font-semibold text-indigo-300 leading-snug">
                                {stationLabel}
                                {nearest.price && <span className="text-slate-400 font-normal ml-1.5">₹{Number(nearest.price).toLocaleString('en-IN')}</span>}
                              </div>
                              {nearest.type && nearest.type !== stationLabel && <div className="text-[10px] text-slate-500 capitalize">{nearest.type}</div>}
                              {evaluation?.reasoning && <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{evaluation.reasoning}</p>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* ── Reconciliation banner (shown when both analyses are loaded) ── */}
            {insightsResult && deepIntelResult && !insightsLoading && !deepIntelLoading && (() => {
              const SEVERITY = { danger: 3, warning: 2, caution: 1, clear: 0 };
              const AGENTS_LIST = ['behavioral', 'structure', 'pattern', 'station', 'oi'];
              const deepTotalRisk = AGENTS_LIST.reduce((s, k) => s + (deepIntelResult[k]?.riskScore || 0), 0);
              const deepVerdict = deepTotalRisk >= 40 ? 'danger' : deepTotalRisk >= 20 ? 'warning' : deepTotalRisk >= 10 ? 'caution' : 'clear';
              const qS = SEVERITY[insightsResult.verdict] ?? 0;
              const dS = SEVERITY[deepVerdict] ?? 0;
              const gap = dS - qS; // positive = deep is worse than quick

              let banner = null;
              if (qS === 0 && dS === 0) {
                banner = { icon: '✅', text: 'Aligned', detail: 'Both 5-min entry and multi-timeframe structure support this trade.', color: 'bg-green-900/20 border-green-500/20 text-green-300' };
              } else if (gap >= 2) {
                // Quick looks fine but deep flags real risk
                banner = { icon: '⚠️', text: 'Scalp-only', detail: '5-min entry looks ok but structure flags risk across higher timeframes. Treat as intraday only — avoid positional. Have a strict SL.', color: 'bg-amber-900/30 border-amber-500/30 text-amber-300' };
              } else if (gap <= -2) {
                // Quick flags risk but deep structure is fine
                banner = { icon: 'ℹ️', text: 'Timing issue', detail: 'Structure supports the trade but 5-min entry is suboptimal. Wait for a better entry signal before placing.', color: 'bg-blue-900/20 border-blue-500/20 text-blue-300' };
              } else if (qS >= 2 && dS >= 2) {
                // Both flag serious risk
                banner = { icon: '🚫', text: 'Avoid', detail: 'Both 5-min analysis and structure flag risk. High probability of loss — consider sitting out.', color: 'bg-red-900/25 border-red-500/25 text-red-300' };
              } else if (gap > 0) {
                // Mild conflict: quick ok, deep slightly negative
                banner = { icon: '↔️', text: 'Minor conflict', detail: '5-min entry is fine but structure raises minor concerns. Trade with reduced size or tighter stop.', color: 'bg-slate-700/60 border-slate-600/40 text-slate-300' };
              } else if (gap < 0) {
                // Mild conflict: quick caution, deep fine
                banner = { icon: '↔️', text: 'Mixed signals', detail: 'Structure looks good but 5-min timing is off. Wait for the entry to improve.', color: 'bg-slate-700/60 border-slate-600/40 text-slate-300' };
              }
              if (!banner) return null;
              return (
                <div className={`p-2.5 rounded-lg border ${banner.color}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm leading-none">{banner.icon}</span>
                    <span className="text-[11px] font-bold">{banner.text}</span>
                  </div>
                  <p className="text-[10px] opacity-80 leading-relaxed">{banner.detail}</p>
                </div>
              );
            })()}

            {/* ── Deep Analysis ──────────────────────────────────────────── */}
            <div className="border-t border-white/10 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Brain size={13} className="text-purple-400" />
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">5-Agent Deep Analysis</span>
                </div>
                <button type="button" onClick={fetchDeepIntel} disabled={deepIntelLoading}
                  className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50">
                  {deepIntelLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {deepIntelResult ? 'Refresh' : 'Run Analysis'}
                </button>
              </div>
              {!deepIntelResult && !deepIntelLoading && (
                <p className="text-[11px] text-slate-500 text-center py-2">Pattern · Structure · OI · Station · Behavioral agents</p>
              )}
              {deepIntelLoading && (
                <div className="flex items-center justify-center py-4 gap-2">
                  <Loader2 size={16} className="animate-spin text-purple-400" />
                  <span className="text-xs text-slate-400">Running 5 agents...</span>
                </div>
              )}
              {deepIntelResult && !deepIntelLoading && (() => {
                const SEV = {
                  danger:  { dot: 'bg-red-500',   text: 'text-red-400'   },
                  warning: { dot: 'bg-red-400',   text: 'text-red-300'   },
                  caution: { dot: 'bg-amber-400', text: 'text-amber-300' },
                  info:    { dot: 'bg-blue-400',  text: 'text-blue-300'  },
                };
                const AGENTS = [
                  { key: 'behavioral', label: 'Behavioral',  icon: '🧠' },
                  { key: 'structure',  label: 'Structure',   icon: '📐' },
                  { key: 'pattern',    label: 'Pattern',     icon: '🕯️' },
                  { key: 'station',    label: 'Station',     icon: '🚉' },
                  { key: 'oi',         label: 'Open Interest', icon: '📊' },
                ];
                // Compute combined risk
                const totalRisk = AGENTS.reduce((s, a) => s + (deepIntelResult[a.key]?.riskScore || 0), 0);
                const overallVerdict = totalRisk >= 40 ? 'danger' : totalRisk >= 20 ? 'warning' : totalRisk >= 10 ? 'caution' : 'clear';
                const ovc = getVerdictColor(overallVerdict);
                return (
                  <div className="space-y-2">
                    {/* Combined header */}
                    <div className={`p-2.5 rounded-lg border ${ovc.bg} ${ovc.border} flex items-center justify-between`}>
                      <span className={`text-xs font-semibold ${ovc.text}`}>Combined Risk: {totalRisk}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ovc.border} ${ovc.text} capitalize`}>{overallVerdict}</span>
                    </div>
                    {/* Per-agent results */}
                    {AGENTS.map(({ key, label, icon }) => {
                      const agent = deepIntelResult[key];
                      if (!agent) return null; // not requested (e.g. OI for non-index)
                      if (agent.unavailable) return (
                        <div key={key} className="flex items-center gap-2 py-1">
                          <span className="text-sm">{icon}</span>
                          <span className="text-[11px] text-slate-500 font-medium">{label}</span>
                          <span className="ml-auto text-[10px] text-slate-600">unavailable</span>
                        </div>
                      );
                      const avc = getVerdictColor(agent.verdict);
                      const hasBehaviors = agent.behaviors?.length > 0;
                      return (
                        <div key={key} className={`rounded-lg border ${hasBehaviors ? `${avc.bg} ${avc.border}` : 'border-white/5'} p-2.5`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm leading-none">{icon}</span>
                            <span className={`text-[11px] font-semibold ${hasBehaviors ? avc.text : 'text-slate-400'}`}>{label}</span>
                            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border ${avc.border} ${avc.text} capitalize`}>{agent.verdict}</span>
                            {agent.riskScore > 0 && <span className="text-[10px] text-slate-500">+{agent.riskScore}</span>}
                          </div>
                          {hasBehaviors && (
                            <div className="space-y-1 mt-1.5 pl-6">
                              {agent.behaviors.map((beh, i) => {
                                const cfg = SEV[beh.severity] || { dot: 'bg-slate-400', text: 'text-slate-300' };
                                return (
                                  <div key={i} className="flex items-start gap-1.5">
                                    <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                    <div>
                                      <div className={`text-[10px] font-medium ${cfg.text} leading-snug`}>{beh.title}</div>
                                      {beh.detail && <div className="text-[9px] text-slate-500 leading-relaxed">{beh.detail}</div>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
          )}

          {/* ── ORDER TAB ────────────────────────────────────────────────────── */}
          {activeTab === 'order' && (
          <div className="p-5 space-y-4">
            {/* Condensed insights pill */}
            {insightsLoading && (
              <div className="p-2.5 bg-slate-700/50 border border-white/10 rounded-lg flex items-center gap-2">
                <Brain size={14} className="text-purple-400 animate-pulse" />
                <span className="text-xs text-slate-300">Analyzing...</span>
              </div>
            )}
            {insightsResult && !insightsLoading && (() => {
              const vc = getVerdictColor(insightsResult.verdict);
              const issueCount = insightsResult.insights?.filter(i => i.level === 'warning' || i.level === 'caution').length || 0;
              return (
                <button type="button" onClick={() => setActiveTab('analysis')}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border ${vc.bg} ${vc.border} hover:opacity-80 transition-opacity text-left`}>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-shrink-0">
                      <svg width="26" height="26" viewBox="0 0 32 32" className="-rotate-90">
                        <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                        <circle cx="16" cy="16" r="14" fill="none" stroke={vc.stroke} strokeWidth="3"
                          strokeDasharray={`${(insightsResult.riskScore / 100) * 88} 88`} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-[9px] font-bold ${vc.text}`}>{insightsResult.riskScore}</span>
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs font-semibold ${vc.text}`}>
                        {insightsResult.verdict === 'danger' ? 'High Risk' :
                         insightsResult.verdict === 'warning' ? 'Caution' :
                         insightsResult.verdict === 'caution' ? 'Review' : 'Looks Good'}
                      </div>
                      {issueCount > 0
                        ? <div className="text-[10px] text-slate-500">{issueCount} issue{issueCount > 1 ? 's' : ''} · tap for analysis</div>
                        : <div className="text-[10px] text-slate-500">{insightsResult.insights?.length || 0} checks passed</div>
                      }
                    </div>
                  </div>
                  <span className="text-[10px] text-blue-400 flex-shrink-0">Full Analysis →</span>
                </button>
              );
            })()}

            {/* ── Reconciliation banner in Order tab (shown when deep analysis ran) ── */}
            {insightsResult && deepIntelResult && !insightsLoading && !deepIntelLoading && (() => {
              const SEVERITY = { danger: 3, warning: 2, caution: 1, clear: 0 };
              const AGENTS_LIST = ['behavioral', 'structure', 'pattern', 'station', 'oi'];
              const deepTotalRisk = AGENTS_LIST.reduce((s, k) => s + (deepIntelResult[k]?.riskScore || 0), 0);
              const deepVerdict = deepTotalRisk >= 40 ? 'danger' : deepTotalRisk >= 20 ? 'warning' : deepTotalRisk >= 10 ? 'caution' : 'clear';
              const qS = SEVERITY[insightsResult.verdict] ?? 0;
              const dS = SEVERITY[deepVerdict] ?? 0;
              const gap = dS - qS;

              let banner = null;
              if (gap >= 2) {
                banner = { icon: '⚠️', text: 'Scalp-only — have a strict SL', color: 'bg-amber-900/30 border-amber-500/40 text-amber-300' };
              } else if (qS >= 2 && dS >= 2) {
                banner = { icon: '🚫', text: 'Avoid — both analyses flag risk', color: 'bg-red-900/30 border-red-500/40 text-red-300' };
              } else if (gap > 0) {
                banner = { icon: '↔️', text: 'Minor conflict — reduce size', color: 'bg-slate-700/60 border-slate-600/40 text-slate-300' };
              }
              if (!banner) return null;
              return (
                <button type="button" onClick={() => setActiveTab('analysis')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border ${banner.color} hover:opacity-80 transition-opacity text-left`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm leading-none">{banner.icon}</span>
                    <span className="text-[11px] font-semibold">{banner.text}</span>
                  </div>
                  <span className="text-[10px] text-blue-400 flex-shrink-0">Why? →</span>
                </button>
              );
            })()}

          {/* Buy/Sell Toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTransactionType('BUY')}
              className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                transactionType === 'BUY'
                  ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setTransactionType('SELL')}
              className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                transactionType === 'SELL'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              SELL
            </button>
          </div>

          {/* Rest of form (unchanged) */}
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Product Type</label>
            <div className="flex gap-2">
              {(optionType ? [
                { value: 'NRML', label: 'NRML', desc: 'Overnight' },
                { value: 'MIS', label: 'MIS', desc: 'Intraday' },
              ] : [
                { value: 'CNC', label: 'CNC', desc: 'Delivery' },
                { value: 'MIS', label: 'MIS', desc: 'Intraday' },
                { value: 'NRML', label: 'NRML', desc: 'F&O' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setProduct(opt.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm transition-all ${
                    product === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] opacity-70">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Order Type</label>
            <div className="flex gap-2">
              {['MARKET', 'LIMIT', 'SL', 'SL-M'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setOrderType(type)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    orderType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            {optionType && orderType === 'MARKET' && (
              <div className="mt-2 p-2 bg-amber-900/30 border border-amber-600/50 rounded-lg">
                <p className="text-amber-400 text-xs flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Market orders are not allowed for Options on Kite. Please use LIMIT order.</span>
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">Quantity</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            {orderType === 'LIMIT' || orderType === 'SL' ? (
              <div>
                <label className="block text-slate-400 text-xs mb-1.5">
                  {orderType === 'SL' ? 'Limit Price' : 'Price'}
                </label>
                <input
                  type="number"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  step="0.05"
                  placeholder={displayPrice?.toString()}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                  required={orderType === 'LIMIT'}
                />
              </div>
            ) : (
              <div>
                <label className="block text-slate-400 text-xs mb-1.5">
                  {optionType ? 'LTP (Market)' : 'Price (Market)'}
                </label>
                <input
                  type="text"
                  value={displayPrice ? `₹${displayPrice.toLocaleString('en-IN')}` : 'Fetching...'}
                  disabled
                  className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2.5 text-slate-300 text-sm cursor-not-allowed"
                />
              </div>
            )}
          </div>

          {['SL', 'SL-M'].includes(orderType) && (
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">Trigger Price</label>
              <input
                type="number"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                step="0.05"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>
          )}

          <div className="bg-slate-700/50 rounded-lg p-3 flex justify-between items-center">
            <span className="text-slate-400 text-sm">Estimated Value</span>
            <span className="text-white font-mono font-semibold">
              ₹{estimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          {success && (
            <div className="bg-green-900/30 border border-green-700 text-green-400 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 ${
              transactionType === 'BUY'
                ? 'bg-green-600 hover:bg-green-500 disabled:bg-green-800'
                : 'bg-red-600 hover:bg-red-500 disabled:bg-red-800'
            } disabled:cursor-not-allowed`}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Placing Order...
              </>
            ) : (
              `${transactionType} ${symbol}`
            )}
          </button>

          <p className="text-slate-500 text-[10px] text-center">
            Orders are placed via Kite Connect API. Market orders execute at current market price.
          </p>
          </div>
          )}
        </form>
        )}
      </div>

      {/* Averaging Down Alert Modal */}
      {avgDownAlert && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-xl">
          <div className="bg-slate-800 border-2 border-red-500/60 rounded-xl p-5 w-[90%] max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-red-400">Averaging Down Warning</h3>
                <p className="text-xs text-slate-400">Adding to losing position</p>
              </div>
            </div>

            <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-3 mb-4">
              <div className="text-xs text-slate-400 mb-1">Position</div>
              <div className="text-sm font-bold text-white mb-2">
                {avgDownAlert.position.tradingsymbol}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">Entry</div>
                  <div className="text-white font-mono">₹{avgDownAlert.avgPrice?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-500">LTP</div>
                  <div className="text-white font-mono">₹{avgDownAlert.ltp?.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-2 text-red-400 font-semibold">
                ₹{Math.abs(Math.round(avgDownAlert.unrealizedPnl || 0)).toLocaleString()} Unrealized Loss
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Your position is underwater. Adding more will increase your average entry price and risk exposure.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAvgDownAlert(null)}
                className="flex-1 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium transition-colors border border-red-500/30"
              >
                Place Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}