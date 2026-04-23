'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, TrendingUp, TrendingDown, Target, Brain, RefreshCw } from 'lucide-react';
import { useProviderStatus } from '@/app/lib/use-provider-status';

export default function QuickOrder({
  isOpen,
  onClose,
  symbol,
  price,
  type = 'BUY',
  intelligence = null,
  onOrderPlaced,
  onOpenFullAnalysis,
  lotSize = 1,
}) {
  const { status, loading: providerLoading } = useProviderStatus();
  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState('MIS');
  const [orderType, setOrderType] = useState('MARKET');
  const [limitPrice, setLimitPrice] = useState(price?.toString() || '');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [side, setSide] = useState(type); // BUY or SELL
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const drawerRef = useRef(null);

  // Sync state on open/props change
  useEffect(() => {
    if (isOpen) {
      setLimitPrice(price?.toString() || '');
      setSide(type);
      setTriggerPrice('');
      setError('');
      setSuccess('');
      // Snap to 1 lot on open for FnO instruments
      if (lotSize > 1) setQuantity(lotSize);
      else setQuantity(1);
    }
  }, [isOpen, price, type, lotSize]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setPlacing(true);
    setError('');
    try {
      const isPaper = status?.broker === 'paper';
      const endpoint = isPaper ? '/api/paper-orders' : '/api/place-order';

      const isOption = /^.+(CE|PE)$/.test(symbol);
      const isBse    = symbol.startsWith('SENSEX') || symbol.startsWith('BANKEX');
      const exchange = isOption ? (isBse ? 'BFO' : 'NFO') : 'NSE';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradingsymbol: symbol,
          exchange,
          transaction_type: side,
          order_type: orderType,
          product: product,
          quantity: parseInt(quantity) || lotSize || 1,
          price: (orderType === 'LIMIT' || orderType === 'SL') ? parseFloat(limitPrice) : undefined,
          trigger_price: (orderType === 'SL' || orderType === 'SL-M') ? parseFloat(triggerPrice) : undefined,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to place order');
      
      setSuccess('Order placed successfully!');
      if (onOrderPlaced) onOrderPlaced(data);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  if (!isOpen) return null;

  const bias = intelligence?.sentiment?.intradayBias || 'NEUTRAL';
  const scenario = intelligence?.scenario;
  const isUp = side === 'BUY';

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center pointer-events-none p-4">
      {/* Backdrop - No blur, very light for clarity */}
      <div className="absolute inset-0 pointer-events-auto bg-black/10" onClick={onClose} />
      
      <div 
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-[440px] bg-[#0d1526]/95 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto flex flex-col overflow-hidden animate-pop-in"
      >
        {/* Header/Side Toggle - Wide Row */}
        <div className="flex bg-white/5 border-b border-white/10 p-1.5 gap-1.5 items-center">
          <div className="flex bg-black/20 rounded-lg p-0.5 flex-1">
            <button 
              type="button"
              onClick={() => setSide('BUY')}
              className={`flex-1 py-1.5 text-[11px] font-extrabold rounded-md transition-all ${side === 'BUY' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >BUY</button>
            <button 
              type="button"
              onClick={() => setSide('SELL')}
              className={`flex-1 py-1.5 text-[11px] font-extrabold rounded-md transition-all ${side === 'SELL' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >SELL</button>
          </div>
          <div className="flex flex-col items-end px-2 min-w-0">
             <div className="text-[11px] font-bold text-white leading-tight truncate w-32 text-right">{symbol}</div>
             <div className="text-[9px] text-slate-400 font-mono">₹{price?.toFixed(2)}</div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors bg-white/5 rounded-lg">
            <X size={14} />
          </button>
        </div>

        {/* Intelligence Quick Peek - Condensed row below header */}
        {scenario && scenario.scenario !== 'UNCLEAR' && (
          <div className="px-3 py-1 bg-indigo-500/10 border-b border-white/5 flex items-center justify-between text-[9px] font-bold">
            <div className="flex items-center gap-1.5">
              <Target size={10} className="text-indigo-400" />
              <span className="text-white truncate max-w-[200px]">{scenario.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={
                scenario.confidence === 'HIGH' ? 'text-emerald-400' :
                scenario.confidence === 'MEDIUM' ? 'text-amber-400' : 'text-slate-500'
              }>{scenario.confidence}</span>
              <span className={`px-1 rounded ${
                bias === 'BULLISH' ? 'text-emerald-400 bg-emerald-400/10' : bias === 'BEARISH' ? 'text-red-400 bg-red-400/10' : 'text-slate-400 bg-slate-400/10'
              }`}>
                {bias}
              </span>
            </div>
          </div>
        )}

        {/* Form - Wide & Compact */}
        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
          {error && <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">{error}</div>}
          {success && <div className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1">{success}</div>}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Quantity */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Quantity</label>
                <div className="flex bg-white/5 rounded-xl border border-white/10 overflow-hidden h-9">
                  <button type="button" onClick={() => setQuantity(Math.max(lotSize, quantity - lotSize))} className="w-9 flex items-center justify-center hover:bg-white/5 border-r border-white/10 transition-colors text-slate-400 text-sm font-bold">-</button>
                  <input 
                    type="number" 
                    value={quantity} 
                    onFocus={e => e.target.select()}
                    onChange={e => {
                       const val = e.target.value;
                       if (val === '') {
                         setQuantity('');
                         return;
                       }
                       const num = parseInt(val);
                       if (!isNaN(num)) setQuantity(num);
                    }}
                    className="flex-1 bg-transparent text-center text-[13px] font-bold font-mono focus:outline-none" 
                  />
                  <button type="button" onClick={() => setQuantity(quantity + lotSize)} className="w-9 flex items-center justify-center hover:bg-white/5 border-l border-white/10 transition-colors text-slate-400 text-sm font-bold">+</button>
                </div>
              </div>

              {/* Product */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Product</label>
                <div className="flex bg-white/5 rounded-xl border border-white/10 p-1 h-9 gap-1">
                  {['MIS', 'NRML'].map(p => (
                    <button key={p} type="button" onClick={() => setProduct(p)}
                      className={`flex-1 text-[10px] font-bold rounded-lg transition-all ${product === p ? 'bg-white/10 text-white border border-white/10 shadow-lg' : 'text-slate-500 hover:text-slate-400'}`}
                    >{p}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Order Type - 4 Columns in a single row */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Order Type</label>
              <div className="grid grid-cols-4 bg-white/5 rounded-xl border border-white/10 p-1 h-9 gap-1">
                {['MARKET', 'LIMIT', 'SL', 'SL-M'].map(t => (
                  <button 
                    key={t} 
                    type="button" 
                    onClick={() => setOrderType(t)}
                    className={`text-[10px] font-bold rounded-lg transition-all ${orderType === t ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-400'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Fields - Inline Grid */}
            {(orderType !== 'MARKET') && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                {(orderType === 'LIMIT' || orderType === 'SL') ? (
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Price</label>
                    <input type="number" step="0.05" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                      className="w-full h-9 bg-white/5 border border-white/10 rounded-xl px-3 text-[13px] font-bold font-mono focus:outline-none focus:border-indigo-500/50" 
                    />
                  </div>
                ) : <div />}
                {(orderType === 'SL' || orderType === 'SL-M') ? (
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Trigger</label>
                    <input type="number" step="0.05" value={triggerPrice} onChange={e => setTriggerPrice(e.target.value)}
                      className="w-full h-9 bg-white/5 border border-white/10 rounded-xl px-3 text-[13px] font-bold font-mono focus:outline-none focus:border-indigo-500/50" 
                    />
                  </div>
                ) : <div />}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2 items-center">
            <button 
              onClick={handleSubmit}
              disabled={placing}
              className={`flex-[2] py-3 rounded-xl font-bold text-[13px] shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 ${
                side === 'BUY' 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' 
                  : 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20'
              }`}
            >
              {placing ? <Loader2 size={16} className="animate-spin" /> : null}
              {placing ? 'Placing...' : `${side} ${symbol} @ ${orderType}`}
            </button>
            <button 
              type="button"
              onClick={onOpenFullAnalysis}
              className="flex-1 py-3 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white transition-all text-[11px] flex items-center justify-center gap-2"
            >
              <Brain size={14} className="text-indigo-400" />
              Full Intel
            </button>
          </div>
        </form>

        {/* Status bar */}
        <div className="px-4 py-1.5 bg-black/40 flex items-center justify-between">
           <div className="flex items-center gap-1.5">
             <span className={`w-1 h-1 rounded-full ${providerLoading ? 'bg-slate-500' : status?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
             <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none">
               {providerLoading ? 'CONNECTING...' : `${status?.broker || 'PAPER'} MODE`}
             </span>
           </div>
           <div className="text-[8px] text-slate-600 font-bold uppercase tracking-widest leading-none cursor-help" title="Market Time: 09:15 - 15:30 IST">
             Live
           </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pop-in {
          0% { transform: scale(0.95); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in {
          animation: pop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
