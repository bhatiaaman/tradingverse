'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Search, TrendingUp, TrendingDown, RefreshCw,
  CheckCircle, XCircle, Clock, AlertCircle, LogIn, Loader2,
  ShoppingCart, History, Brain, AlertTriangle, ShieldCheck,
  ShieldAlert, ShieldX, X, ExternalLink,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Verdict config
// ─────────────────────────────────────────────────────────────────────────────
const VERDICT = {
  clear:   { label: 'CLEAR',   color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  Icon: ShieldCheck  },
  caution: { label: 'CAUTION', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  Icon: AlertTriangle },
  warning: { label: 'WARNING', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', Icon: ShieldAlert   },
  danger:  { label: 'DANGER',  color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    Icon: ShieldX       },
};

const SEVERITY_COLOR = {
  info:    'text-blue-400',
  caution: 'text-amber-400',
  warning: 'text-orange-400',
  danger:  'text-red-400',
};

// ─────────────────────────────────────────────────────────────────────────────
// Order status badge
// ─────────────────────────────────────────────────────────────────────────────
function OrderStatusBadge({ status }) {
  const map = {
    COMPLETE:          { color: 'text-green-400 bg-green-500/10 border-green-500/20',     Icon: CheckCircle },
    REJECTED:          { color: 'text-red-400 bg-red-500/10 border-red-500/20',           Icon: XCircle     },
    CANCELLED:         { color: 'text-red-400 bg-red-500/10 border-red-500/20',           Icon: XCircle     },
    OPEN:              { color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',  Icon: Clock       },
    'TRIGGER PENDING': { color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',  Icon: Clock       },
    PENDING:           { color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',  Icon: Clock       },
  };
  const cfg = map[status?.toUpperCase()] ?? { color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', Icon: AlertCircle };
  const { color, Icon } = cfg;
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs border ${color}`}>
      <Icon size={11} />
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Behavioral analysis panel
// ─────────────────────────────────────────────────────────────────────────────
function BehavioralPanel({ intel, selected }) {
  const SEVERITY_DOT = {
    info:    'bg-blue-500',
    caution: 'bg-amber-500',
    warning: 'bg-orange-500',
    danger:  'bg-red-500',
  };

  if (!selected?.symbol) {
    return (
      <div className="rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={15} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Behavioral Check</span>
        </div>
        <p className="text-slate-500 text-xs">Select a symbol and transaction type to run behavioral analysis.</p>
      </div>
    );
  }

  if (intel.loading) {
    return (
      <div className="rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={15} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Behavioral Check</span>
          <Loader2 size={13} className="animate-spin text-slate-400 ml-1" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-4 bg-slate-700/50 rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!intel.result?.behavioral) {
    return (
      <div className="rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={15} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Behavioral Check</span>
        </div>
        <p className="text-slate-500 text-xs">Analysis unavailable.</p>
      </div>
    );
  }

  const { verdict, riskScore, behaviors } = intel.result.behavioral;
  const vc = VERDICT[verdict] ?? VERDICT.clear;
  const { Icon: VIcon } = vc;

  return (
    <div className={`rounded-xl border ${vc.border} ${vc.bg} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain size={15} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Behavioral Check</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Risk</span>
          <span className={`text-lg font-bold font-mono leading-none ${vc.color}`}>{riskScore}</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${vc.border} ${vc.color}`}>
            <VIcon size={11} />
            {vc.label}
          </div>
        </div>
      </div>

      {behaviors.length === 0 ? (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle size={14} />
          No behavioral issues detected. Good to go.
        </div>
      ) : (
        <div className="space-y-3">
          {behaviors.map((b, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${SEVERITY_DOT[b.severity] ?? 'bg-slate-500'}`} />
              <div>
                <div className={`text-xs font-semibold ${SEVERITY_COLOR[b.severity] ?? 'text-slate-300'}`}>{b.title}</div>
                <div className="text-slate-400 text-xs mt-0.5 leading-relaxed">{b.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const router = useRouter();

  // Auth
  const [auth, setAuth] = useState({ checking: true, loggedIn: false });

  // Symbol search
  const [symQuery, setSymQuery]     = useState('');
  const [symResults, setSymResults] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [selected, setSelected]     = useState(null);    // { symbol, spotPrice }
  const [fetchingPrice, setFetchingPrice] = useState(false);

  // Option (CE/PE)
  const [option, setOption] = useState({ symbol: null, ltp: null, strike: null, expiry: null, loading: false });

  // Order form
  const [form, setForm] = useState({
    instrumentType: 'EQ',
    transactionType: 'BUY',
    quantity: 1,
    product: 'CNC',
    orderType: 'MARKET',
    limitPrice: '',
    triggerPrice: '',
  });

  // Intelligence
  const [intel, setIntel]             = useState({ loading: false, result: null });
  const [acknowledged, setAcknowledged] = useState(false);
  const [dangerModal, setDangerModal]   = useState(false);

  // Orders
  const [orders, setOrders]   = useState({ loading: false, list: [] });
  const [cancelling, setCancelling] = useState(null);

  // Placement
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState(null);   // { type, text }

  const searchTimer = useRef(null);

  // ── On mount ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/kite-config');
        const d = await r.json();
        setAuth({ checking: false, loggedIn: d.tokenValid === true });
      } catch {
        setAuth({ checking: false, loggedIn: false });
      }
    })();
    fetchOrders();
  }, []);

  // ── Symbol search ─────────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!symQuery || symQuery.length < 2) { setSymResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/search-instruments?q=${encodeURIComponent(symQuery)}`);
        const d = await r.json();
        setSymResults(d.instruments || []);
      } catch { setSymResults([]); }
      finally  { setSearching(false); }
    }, 300);
  }, [symQuery]);

  // ── Fetch option when CE/PE ───────────────────────────────────────────────
  useEffect(() => {
    if (form.instrumentType === 'EQ' || !selected || !auth.loggedIn) {
      setOption({ symbol: null, ltp: null, strike: null, expiry: null, loading: false });
      return;
    }
    (async () => {
      setOption(o => ({ ...o, loading: true }));
      try {
        const r = await fetch(`/api/option-ltp?symbol=${selected.symbol}&price=${selected.spotPrice}&type=${form.instrumentType}`);
        const d = await r.json();
        setOption({ symbol: d.optionSymbol ?? null, ltp: d.ltp ?? null, strike: d.strike ?? null, expiry: d.expiryDay ?? null, loading: false });
      } catch {
        setOption({ symbol: null, ltp: null, strike: null, expiry: null, loading: false });
      }
    })();
  }, [form.instrumentType, selected, auth.loggedIn]);

  // ── Run intelligence on symbol/transactionType/instrumentType change ───────
  useEffect(() => {
    if (!selected?.symbol) return;
    setAcknowledged(false);
    runIntelligence();
  }, [selected?.symbol, form.transactionType, form.instrumentType]);

  // ── Functions ─────────────────────────────────────────────────────────────
  const handleSelectSymbol = async (sym) => {
    setSymQuery(sym);
    setSymResults([]);
    setOption({ symbol: null, ltp: null, strike: null, expiry: null, loading: false });
    setIntel({ loading: false, result: null });
    setFetchingPrice(true);
    try {
      const r = await fetch(`/api/stock-price?symbol=${sym}`);
      const d = await r.json();
      setSelected({ symbol: sym, spotPrice: d.price ?? null });
    } catch {
      setSelected({ symbol: sym, spotPrice: null });
    } finally {
      setFetchingPrice(false);
    }
    setForm(f => ({ ...f, product: f.instrumentType === 'EQ' ? 'CNC' : 'NRML' }));
  };

  const runIntelligence = useCallback(async () => {
    if (!selected?.symbol) return;
    setIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol:          selected.symbol,
          exchange:        form.instrumentType === 'EQ' ? 'NSE' : 'NFO',
          instrumentType:  form.instrumentType,
          transactionType: form.transactionType,
          spotPrice:       selected.spotPrice,
        }),
      });
      const d = await r.json();
      setIntel({ loading: false, result: d });
    } catch {
      setIntel({ loading: false, result: null });
    }
  }, [selected, form.instrumentType, form.transactionType]);

  const fetchOrders = async () => {
    setOrders(o => ({ ...o, loading: true }));
    try {
      const r = await fetch('/api/kite-orders');
      const d = await r.json();
      setOrders({ loading: false, list: (d.orders || []).slice(0, 15) });
    } catch {
      setOrders({ loading: false, list: [] });
    }
  };

  const cancelOrder = async (orderId) => {
    setCancelling(orderId);
    try {
      const r = await fetch('/api/cancel-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const d = await r.json();
      if (d.success) fetchOrders();
      else setMessage({ type: 'error', text: d.error || 'Cancel failed' });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setCancelling(null);
    }
  };

  const executePlaceOrder = async () => {
    setPlacing(true);
    setMessage(null);
    setDangerModal(false);
    try {
      const tradingSymbol = form.instrumentType === 'EQ' ? selected.symbol : option.symbol;
      const exchange      = form.instrumentType === 'EQ' ? 'NSE' : 'NFO';
      if (!tradingSymbol) throw new Error('Invalid trading symbol');

      const params = {
        tradingsymbol:    tradingSymbol,
        exchange,
        transaction_type: form.transactionType,
        order_type:       form.orderType,
        quantity:         parseInt(form.quantity),
        product:          form.instrumentType === 'EQ' ? form.product : 'NRML',
        validity:         'DAY',
      };
      if (form.orderType === 'LIMIT' || form.orderType === 'SL')
        params.price = parseFloat(form.limitPrice);
      if (form.orderType === 'SL' || form.orderType === 'SL-M')
        params.trigger_price = parseFloat(form.triggerPrice);

      const r = await fetch('/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const d = await r.json();
      if (d.success) {
        setMessage({ type: 'success', text: `Order placed! ID: ${d.order_id || d.orderId}` });
        setForm(f => ({ ...f, quantity: 1, limitPrice: '', triggerPrice: '' }));
        fetchOrders();
        setTimeout(runIntelligence, 1200);
      } else {
        throw new Error(d.error || 'Order failed');
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setPlacing(false);
    }
  };

  const handlePlaceOrder = () => {
    if (!selected?.symbol) { setMessage({ type: 'error', text: 'Please select a symbol' }); return; }
    if (form.instrumentType !== 'EQ' && !option.symbol) { setMessage({ type: 'error', text: 'Option not loaded yet' }); return; }
    const v = intel.result?.behavioral?.verdict;
    if (v === 'danger') { setDangerModal(true); return; }
    executePlaceOrder();
  };

  // ── Place button config ───────────────────────────────────────────────────
  const verdict = intel.result?.behavioral?.verdict ?? null;
  const buyGradient  = 'from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-green-500/25';
  const sellGradient = 'from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 shadow-red-500/25';
  const btnGradient = {
    clear:   form.transactionType === 'BUY' ? buyGradient : sellGradient,
    caution: 'from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 shadow-amber-500/25',
    warning: 'from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 shadow-orange-500/25',
    danger:  'from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-red-500/25',
  };
  const activeGradient = btnGradient[verdict] ?? (form.transactionType === 'BUY' ? buyGradient : sellGradient);
  const btnDisabled    = (verdict === 'warning' && !acknowledged) || placing ||
    !auth.loggedIn || !selected?.symbol ||
    (form.instrumentType !== 'EQ' && !option.symbol);

  if (auth.checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-400" size={32} />
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-900 text-white overflow-hidden">
      <div className="h-full flex flex-col px-4 py-4 max-w-[1600px] mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="mb-4 flex-shrink-0">
          <div className="bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-slate-700/50 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/trades')}
                className="w-9 h-9 flex items-center justify-center bg-slate-700/50 hover:bg-slate-600/50 rounded-xl transition-all text-slate-300 hover:text-white">
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <ShoppingCart size={20} className="text-indigo-400" />
                  <h1 className="text-lg font-bold text-white">Order Management</h1>
                </div>
                <p className="text-slate-500 text-xs">Place trades on Kite Connect</p>
              </div>
              <Link href="/terminal"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors">
                Terminal <ExternalLink size={11} />
              </Link>
            </div>
            {auth.loggedIn ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-xl border border-green-500/30">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-400 text-sm font-medium">Kite Connected</span>
              </div>
            ) : (
              <button
                onClick={() => {
                  const p = window.open('/settings/kite', 'KiteSettings', 'width=600,height=700');
                  const t = setInterval(() => {
                    if (p?.closed) {
                      clearInterval(t);
                      setTimeout(() => fetch('/api/kite-config').then(r => r.json()).then(d =>
                        setAuth({ checking: false, loggedIn: d.tokenValid === true })
                      ), 500);
                    }
                  }, 500);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-300 text-sm transition-all">
                <LogIn size={16} /> Connect Kite
              </button>
            )}
          </div>
        </header>

        {/* ── 3-column layout ──────────────────────────────────────────────── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_1fr_360px] gap-4 min-h-0">

          {/* ══ LEFT: Order Form ══════════════════════════════════════════ */}
          <div className="bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex-shrink-0">Place Order</h2>

            {/* Symbol search */}
            <div className="relative flex-shrink-0">
              <label className="text-slate-400 text-xs mb-1 block">Symbol</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="text" value={symQuery}
                  onChange={e => { setSymQuery(e.target.value); setSelected(null); }}
                  placeholder="Search (e.g. TCS, NIFTY)"
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
              </div>
              {symResults.length > 0 && !selected && (
                <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {symResults.slice(0, 10).map((item, i) => (
                    <button key={i} onClick={() => handleSelectSymbol(item.tradingsymbol || item.symbol)}
                      className="w-full px-4 py-2 text-left hover:bg-slate-700 text-sm flex items-center justify-between">
                      <span className="text-white font-medium">{item.tradingsymbol || item.symbol}</span>
                      <span className="text-slate-500 text-xs">{item.exchange}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected symbol info */}
            {selected && (
              <div className="p-2.5 bg-slate-900/50 rounded-xl border border-slate-700/50 flex items-center justify-between flex-shrink-0">
                <span className="text-green-400 font-bold text-sm">{selected.symbol}</span>
                {fetchingPrice
                  ? <Loader2 size={13} className="animate-spin text-slate-400" />
                  : selected.spotPrice
                    ? <span className="text-white font-mono text-sm">₹{selected.spotPrice}</span>
                    : <span className="text-slate-500 text-sm">--</span>}
              </div>
            )}

            {/* Instrument type */}
            <div className="flex-shrink-0">
              <label className="text-slate-400 text-xs mb-1 block">Instrument</label>
              <div className="flex gap-1.5">
                {[['EQ', 'Equity', 'bg-blue-500/30 text-blue-300 border-blue-500/50'],
                  ['CE', 'CE',     'bg-amber-500/30 text-amber-300 border-amber-500/50'],
                  ['PE', 'PE',     'bg-rose-500/30 text-rose-300 border-rose-500/50']].map(([t, l, active]) => (
                  <button key={t}
                    onClick={() => setForm(f => ({ ...f, instrumentType: t, product: t === 'EQ' ? 'CNC' : 'NRML' }))}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                      form.instrumentType === t ? active : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50'
                    }`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Option info */}
            {form.instrumentType !== 'EQ' && selected && (
              <div className="p-2.5 bg-slate-900/50 rounded-xl border border-slate-700/50 text-xs flex-shrink-0">
                {option.loading
                  ? <div className="flex items-center gap-2 text-slate-400"><Loader2 size={12} className="animate-spin" /> Fetching option...</div>
                  : option.symbol
                    ? <div className="flex items-center justify-between">
                        <div>
                          <span className={`font-semibold ${form.instrumentType === 'CE' ? 'text-amber-400' : 'text-rose-400'}`}>{option.symbol}</span>
                          <div className="text-slate-500 mt-0.5">Strike ₹{option.strike} · {option.expiry}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-white font-mono">₹{option.ltp ?? '--'}</span>
                          <div className="text-slate-500">LTP</div>
                        </div>
                      </div>
                    : <span className="text-slate-500">Option not available</span>
                }
              </div>
            )}

            {/* BUY / SELL */}
            <div className="flex gap-1.5 flex-shrink-0">
              {[['BUY', 'bg-green-500/30 text-green-300 border-green-500/50'],
                ['SELL','bg-red-500/30 text-red-300 border-red-500/50']].map(([t, active]) => (
                <button key={t} onClick={() => setForm(f => ({ ...f, transactionType: t }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 border ${
                    form.transactionType === t ? active : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50'
                  }`}>
                  {t === 'BUY' ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {t}
                </button>
              ))}
            </div>

            {/* Qty + Product */}
            <div className="grid grid-cols-2 gap-2 flex-shrink-0">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">Quantity</label>
                <input type="number" value={form.quantity} min="1"
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">Product</label>
                <select value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                  {form.instrumentType === 'EQ'
                    ? <><option value="CNC">CNC</option><option value="MIS">MIS</option></>
                    : <><option value="NRML">NRML</option><option value="MIS">MIS</option></>}
                </select>
              </div>
            </div>

            {/* Order type */}
            <div className="flex-shrink-0">
              <label className="text-slate-400 text-xs mb-1 block">Order Type</label>
              <div className="grid grid-cols-4 gap-1">
                {['MARKET', 'LIMIT', 'SL', 'SL-M'].map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, orderType: t }))}
                    disabled={form.instrumentType !== 'EQ' && t === 'MARKET'}
                    className={`py-1.5 rounded-xl text-xs font-medium transition-all border ${
                      form.orderType === t
                        ? 'bg-indigo-500/30 text-indigo-300 border-indigo-500/50'
                        : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Price fields */}
            {(form.orderType === 'LIMIT' || form.orderType === 'SL') && (
              <div className="flex-shrink-0">
                <label className="text-slate-400 text-xs mb-1 block">Limit Price</label>
                <input type="number" value={form.limitPrice} step="0.05" placeholder="0.00"
                  onChange={e => setForm(f => ({ ...f, limitPrice: e.target.value }))}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>
            )}
            {(form.orderType === 'SL' || form.orderType === 'SL-M') && (
              <div className="flex-shrink-0">
                <label className="text-slate-400 text-xs mb-1 block">Trigger Price</label>
                <input type="number" value={form.triggerPrice} step="0.05" placeholder="0.00"
                  onChange={e => setForm(f => ({ ...f, triggerPrice: e.target.value }))}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>
            )}

            {/* Message */}
            {message && (
              <div className={`p-2.5 rounded-xl text-xs border flex-shrink-0 ${
                message.type === 'success'
                  ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/30'
              }`}>
                {message.text}
              </div>
            )}

            {/* Acknowledge checkbox (WARNING only) */}
            {verdict === 'warning' && (
              <label className="flex items-start gap-2 cursor-pointer text-xs text-orange-300 flex-shrink-0">
                <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}
                  className="mt-0.5 accent-orange-500" />
                I understand the risk and want to proceed
              </label>
            )}

            {/* Place Order button */}
            <button onClick={handlePlaceOrder} disabled={btnDisabled}
              className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-gradient-to-r ${activeGradient} text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 mt-auto`}>
              {placing
                ? <Loader2 size={16} className="animate-spin" />
                : <>
                    {form.transactionType === 'BUY' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    {form.transactionType} {form.instrumentType === 'EQ' ? (selected?.symbol ?? 'Order') : (option.symbol ?? 'Option')}
                    {verdict && verdict !== 'clear' && (
                      <span className={`text-xs font-normal ${VERDICT[verdict]?.color}`}>· {VERDICT[verdict]?.label}</span>
                    )}
                  </>
              }
            </button>
          </div>

          {/* ══ CENTRE: Intelligence Center ═══════════════════════════════ */}
          <div className="bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4">
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-purple-400" />
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Intelligence Center</h2>
              </div>
              {selected && (
                <button onClick={runIntelligence} disabled={intel.loading}
                  className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors" title="Re-run analysis">
                  <RefreshCw size={13} className={`text-slate-400 ${intel.loading ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>

            <BehavioralPanel intel={intel} selected={selected} />

            {/* Position agent and Pattern agent panels — added later */}
          </div>

          {/* ══ RIGHT: Order Book ══════════════════════════════════════════ */}
          <div className="bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <History size={16} className="text-blue-400" />
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Order Book</h2>
              </div>
              <button onClick={fetchOrders} disabled={orders.loading}
                className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors">
                <RefreshCw size={13} className={`text-slate-400 ${orders.loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {!auth.loggedIn ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <LogIn size={28} className="text-slate-600 mb-2" />
                <p className="text-slate-500 text-sm">Connect Kite to view orders</p>
              </div>
            ) : orders.loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={22} className="animate-spin text-blue-400" />
              </div>
            ) : orders.list.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <ShoppingCart size={28} className="text-slate-600 mb-2" />
                <p className="text-slate-500 text-sm">No orders today</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
                {orders.list.map((order, i) => {
                  const isOpen = ['OPEN', 'TRIGGER PENDING', 'PENDING'].includes(order.status?.toUpperCase());
                  return (
                    <div key={order.order_id || i}
                      className="p-2.5 bg-slate-900/50 rounded-xl border border-slate-700/30 hover:border-slate-600/50 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-xs font-bold ${order.transaction_type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                            {order.transaction_type}
                          </span>
                          <span className="text-white text-xs font-medium truncate">{order.tradingsymbol}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <OrderStatusBadge status={order.status} />
                          {isOpen && (
                            <button onClick={() => cancelOrder(order.order_id)}
                              disabled={cancelling === order.order_id}
                              className="w-5 h-5 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-400 transition-colors disabled:opacity-50"
                              title="Cancel order">
                              {cancelling === order.order_id
                                ? <Loader2 size={10} className="animate-spin" />
                                : <X size={10} />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Qty: <span className="text-slate-300">{order.quantity}</span>
                          {order.filled_quantity > 0 && order.filled_quantity !== order.quantity &&
                            <span className="text-slate-500"> ({order.filled_quantity} filled)</span>}
                        </span>
                        <span>
                          {order.average_price > 0
                            ? <>Avg: <span className="text-slate-300">₹{order.average_price}</span></>
                            : order.price > 0
                              ? <>Price: <span className="text-slate-300">₹{order.price}</span></>
                              : null}
                        </span>
                      </div>
                      {order.status_message && order.status?.toUpperCase() === 'REJECTED' && (
                        <div className="mt-1.5 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 leading-relaxed">
                          {order.status_message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── DANGER confirmation modal ──────────────────────────────────────── */}
      {dangerModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-red-500/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <ShieldX size={22} className="text-red-400 flex-shrink-0" />
              <h3 className="text-white font-semibold">High Risk Detected</h3>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Risk score: <span className="text-red-400 font-bold">{intel.result?.behavioral?.riskScore ?? '--'}/100</span>.
              The following issues were found:
            </p>
            <div className="space-y-2 mb-5">
              {intel.result?.behavioral?.behaviors?.map((b, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle size={13} className={`mt-0.5 flex-shrink-0 ${SEVERITY_COLOR[b.severity] ?? 'text-slate-400'}`} />
                  <div>
                    <div className="text-slate-200 font-medium">{b.title}</div>
                    <div className="text-slate-500 text-xs">{b.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDangerModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors">
                Cancel
              </button>
              <button onClick={executePlaceOrder} disabled={placing}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {placing ? <Loader2 size={14} className="animate-spin" /> : 'Place Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(30,41,59,0.4); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(71,85,105,0.7); border-radius: 2px; }
      `}</style>
    </div>
  );
}
