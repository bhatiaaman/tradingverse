'use client';

import { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Loader2, RefreshCw, LogIn, Brain, AlertTriangle } from 'lucide-react';
import { nseStrikeSteps } from '@/app/lib/nseStrikeSteps';

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
  const [avgDownAlert, setAvgDownAlert] = useState(null); // Averaging down warning
  const [positions, setPositions] = useState([]);

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
      const res = await fetch('/api/kite-config');
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
      setInsightsResult(null); // Reset insights
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

  // Trigger insights when transaction type changes
  useEffect(() => {
    if (isOpen && symbol && transactionType && isLoggedIn) {
      fetchQuickInsights();
    }
  }, [isOpen, symbol, transactionType, isLoggedIn, kiteOptionSymbol]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLoggedIn) {
      setError('Please login to Kite first');
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
      case 'danger': return { bg: 'bg-red-900/20', border: 'border-red-500/40', text: 'text-red-400', dot: 'bg-red-500' };
      case 'warning': return { bg: 'bg-amber-900/20', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-500' };
      case 'caution': return { bg: 'bg-yellow-900/15', border: 'border-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' };
      default: return { bg: 'bg-green-900/20', border: 'border-green-500/30', text: 'text-green-400', dot: 'bg-green-500' };
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
            <p className="text-slate-400 text-sm">Checking Kite authentication...</p>
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          
          {/* ═══ QUICK INSIGHTS BANNER ═══ */}
          {insightsLoading && (
            <div className="p-3 bg-slate-700/50 border border-white/10 rounded-xl flex items-center gap-2">
              <Brain size={16} className="text-purple-400 animate-pulse" />
              <span className="text-xs text-slate-300">Analyzing trade setup...</span>
            </div>
          )}

          {insightsResult && !insightsLoading && (
            <div className="space-y-2">
              {/* Score + Verdict */}
              {(() => {
                const vc = getVerdictColor(insightsResult.verdict);
                return (
                  <div className={`p-3 rounded-xl border ${vc.bg} ${vc.border}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
                            <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                            <circle 
                              cx="16" cy="16" r="14" fill="none" 
                              stroke={vc.dot.replace('bg-', '#')} 
                              strokeWidth="3"
                              strokeDasharray={`${(insightsResult.riskScore / 100) * 88} 88`}
                              strokeLinecap="round"
                            />
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
                      <button
                        type="button"
                        onClick={fetchQuickInsights}
                        className="p-1.5 hover:bg-white/5 rounded transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Direction Verdict */}
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
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {insightsResult.directionVerdict.reason}
                    </p>
                  </div>
                );
              })()}

              {/* Link to full analysis */}
              <a
                href={`/orders?symbol=${encodeURIComponent(symbol)}&type=${encodeURIComponent(optionType || 'EQ')}&transaction=${encodeURIComponent(transactionType)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs text-blue-400 hover:text-blue-300 py-1 hover:underline"
              >
                See Full Analysis →
              </a>
            </div>
          )}

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