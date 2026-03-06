'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePageVisibility } from '@/app/hooks/usePageVisibility';
import Link from 'next/link';
import {
  ArrowLeft, Search, ShoppingCart, TrendingUp, TrendingDown, Clock, RefreshCw,
  Wallet, BarChart2, ExternalLink, Brain, AlertTriangle, ShieldCheck, ShieldAlert,
  ShieldX, CheckCircle, Loader2, ChevronDown, Activity, ScanSearch, Target, BarChart3,
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
// Behavioral analysis panel
// ─────────────────────────────────────────────────────────────────────────────
function BehavioralPanel({ intel, symbol }) {
  const [open, setOpen] = useState(true);

  const SEVERITY_DOT = {
    info:    'bg-blue-500',
    caution: 'bg-amber-500',
    warning: 'bg-orange-500',
    danger:  'bg-red-500',
  };

  if (!symbol) {
    return (
      <div className="rounded-xl border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={15} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Behavioral Check</span>
        </div>
        <p className="text-gray-500 text-xs">Select a symbol and transaction type to run behavioral analysis.</p>
      </div>
    );
  }

  if (intel.loading) {
    return (
      <div className="rounded-xl border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={15} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Behavioral Check</span>
          <Loader2 size={13} className="animate-spin text-gray-400 ml-1" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-4 bg-white/5 rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!intel.result?.behavioral) {
    return (
      <div className="rounded-xl border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={15} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Behavioral Check</span>
        </div>
        <p className="text-gray-500 text-xs">Analysis unavailable.</p>
      </div>
    );
  }

  const { verdict, riskScore, checks } = intel.result.behavioral;
  const vc = VERDICT[verdict] ?? VERDICT.clear;
  const { Icon: VIcon } = vc;

  return (
    <div className={`rounded-xl border ${vc.border} ${vc.bg}`}>
      {/* Header — always visible, click to toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Brain size={15} className="text-purple-400" />
          <div>
            <div className="text-sm font-semibold text-white">Behavioral Check</div>
            <div className="text-xs text-gray-500 font-normal">Spots trading habits &amp; biases</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Risk</span>
          <span className={`text-base font-bold font-mono leading-none ${vc.color}`}>{riskScore}</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${vc.border} ${vc.color}`}>
            <VIcon size={11} />
            {vc.label}
          </div>
          <ChevronDown size={13} className={`text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Collapsible checks list */}
      {open && checks?.length > 0 && (
        <div className="px-4 pb-3 pt-1 border-t border-white/5 space-y-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5">
              {c.passed ? (
                <CheckCircle size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${SEVERITY_DOT[c.severity] ?? 'bg-gray-500'}`} />
              )}
              <div>
                <div className={`text-xs font-semibold ${c.passed ? 'text-gray-300' : (SEVERITY_COLOR[c.severity] ?? 'text-gray-300')}`}>
                  {c.title}
                </div>
                {!c.passed && c.detail && (
                  <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">{c.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Structure analysis panel
// ─────────────────────────────────────────────────────────────────────────────
function StructurePanel({ intel }) {
  const [open, setOpen] = useState(true);

  const SEVERITY_DOT = {
    info:    'bg-blue-500',
    caution: 'bg-amber-500',
    warning: 'bg-orange-500',
    danger:  'bg-red-500',
  };

  if (intel.loading) {
    return (
      <div className="rounded-xl border border-white/10 p-4 mt-3">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Structure Check</span>
          <Loader2 size={13} className="animate-spin text-gray-400 ml-1" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 bg-white/5 rounded animate-pulse" style={{ width: `${55 + i * 8}%` }} />
          ))}
        </div>
      </div>
    );
  }

  const structure = intel.result?.structure;
  if (!structure) return null;

  if (structure.unavailable) {
    return (
      <div className="rounded-xl border border-white/10 p-4 mt-3">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Structure Check</span>
        </div>
        <p className="text-gray-500 text-xs mt-2">Structure data unavailable — instrument token not found or Kite disconnected.</p>
      </div>
    );
  }

  const { verdict, riskScore, checks } = structure;
  const vc = VERDICT[verdict] ?? VERDICT.clear;
  const { Icon: VIcon } = vc;

  return (
    <div className={`rounded-xl border ${vc.border} ${vc.bg} mt-3`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-cyan-400" />
          <div>
            <div className="text-sm font-semibold text-white">Structure Check</div>
            <div className="text-xs text-gray-500 font-normal">Market conditions &amp; signals</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Risk</span>
          <span className={`text-base font-bold font-mono leading-none ${vc.color}`}>{riskScore}</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${vc.border} ${vc.color}`}>
            <VIcon size={11} />
            {vc.label}
          </div>
          <ChevronDown size={13} className={`text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && checks?.length > 0 && (
        <div className="px-4 pb-3 pt-1 border-t border-white/5 space-y-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5">
              {c.passed ? (
                <CheckCircle size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${SEVERITY_DOT[c.severity] ?? 'bg-gray-500'}`} />
              )}
              <div>
                <div className={`text-xs font-semibold ${c.passed ? 'text-gray-300' : (SEVERITY_COLOR[c.severity] ?? 'text-gray-300')}`}>
                  {c.title}
                </div>
                {!c.passed && c.detail && (
                  <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">{c.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern analysis panel
// ─────────────────────────────────────────────────────────────────────────────
function PatternPanel({ intel }) {
  const [open, setOpen] = useState(true);

  const SEVERITY_DOT = {
    info:    'bg-blue-500',
    caution: 'bg-amber-500',
    warning: 'bg-orange-500',
    danger:  'bg-red-500',
  };

  if (intel.loading) {
    return (
      <div className="rounded-xl border border-white/10 p-4 mt-3">
        <div className="flex items-center gap-2 mb-3">
          <ScanSearch size={15} className="text-emerald-400" />
          <span className="text-sm font-semibold text-white">Pattern Check</span>
          <Loader2 size={13} className="animate-spin text-gray-400 ml-1" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 bg-white/5 rounded animate-pulse" style={{ width: `${50 + i * 10}%` }} />
          ))}
        </div>
      </div>
    );
  }

  const pattern = intel.result?.pattern;
  if (!pattern) return null;

  if (pattern.unavailable) {
    return (
      <div className="rounded-xl border border-white/10 p-4 mt-3">
        <div className="flex items-center gap-2">
          <ScanSearch size={15} className="text-emerald-400" />
          <span className="text-sm font-semibold text-white">Pattern Check</span>
        </div>
        <p className="text-gray-500 text-xs mt-2">Pattern data unavailable — instrument token not found or Kite disconnected.</p>
      </div>
    );
  }

  const { verdict, riskScore, checks } = pattern;
  const vc = VERDICT[verdict] ?? VERDICT.clear;
  const { Icon: VIcon } = vc;

  return (
    <div className={`rounded-xl border ${vc.border} ${vc.bg} mt-3`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <ScanSearch size={15} className="text-emerald-400" />
          <div>
            <div className="text-sm font-semibold text-white">Pattern Check</div>
            <div className="text-xs text-gray-500 font-normal">Price action &amp; candlestick setups</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Risk</span>
          <span className={`text-base font-bold font-mono leading-none ${vc.color}`}>{riskScore}</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${vc.border} ${vc.color}`}>
            <VIcon size={11} />
            {vc.label}
          </div>
          <ChevronDown size={13} className={`text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && checks?.length > 0 && (
        <div className="px-4 pb-3 pt-1 border-t border-white/5 space-y-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5">
              {c.passed ? (
                <CheckCircle size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${SEVERITY_DOT[c.severity] ?? 'bg-gray-500'}`} />
              )}
              <div>
                <div className={`text-xs font-semibold ${c.passed ? 'text-gray-300' : (SEVERITY_COLOR[c.severity] ?? 'text-gray-300')}`}>
                  {c.title}
                </div>
                {!c.passed && c.detail && (
                  <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">{c.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StationPanel({ intel }) {
  const [open, setOpen] = useState(true);

  const SEVERITY_DOT = {
    info:    'bg-blue-500',
    caution: 'bg-amber-500',
    warning: 'bg-orange-500',
    danger:  'bg-red-500',
  };

  if (intel.loading) {
    return (
      <div className="rounded-xl border border-white/10 p-4 mt-3">
        <div className="flex items-center gap-2 mb-3">
          <Target size={15} className="text-violet-400" />
          <span className="text-sm font-semibold text-white">Station Check</span>
          <Loader2 size={13} className="animate-spin text-gray-400 ml-1" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 bg-white/5 rounded animate-pulse" style={{ width: `${50 + i * 10}%` }} />
          ))}
        </div>
      </div>
    );
  }

  const station = intel.result?.station;
  if (!station) return null;

  if (station.unavailable) {
    return (
      <div className="rounded-xl border border-white/10 p-4 mt-3">
        <div className="flex items-center gap-2">
          <Target size={15} className="text-violet-400" />
          <span className="text-sm font-semibold text-white">Station Check</span>
        </div>
        <p className="text-gray-500 text-xs mt-2">Station data unavailable — instrument token not found or Kite disconnected.</p>
      </div>
    );
  }

  const { verdict, riskScore, checks } = station;
  const vc = VERDICT[verdict] ?? VERDICT.clear;
  const { Icon: VIcon } = vc;

  return (
    <div className={`rounded-xl border ${vc.border} ${vc.bg} mt-3`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Target size={15} className="text-violet-400" />
          <div>
            <div className="text-sm font-semibold text-white">Station Check</div>
            <div className="text-xs text-gray-500 font-normal">S/R zones — right place to trade?</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Risk</span>
          <span className={`text-base font-bold font-mono leading-none ${vc.color}`}>{riskScore}</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${vc.border} ${vc.color}`}>
            <VIcon size={11} />
            {vc.label}
          </div>
          <ChevronDown size={13} className={`text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && checks?.length > 0 && (
        <div className="px-4 pb-3 pt-1 border-t border-white/5 space-y-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5">
              {c.passed ? (
                <CheckCircle size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${SEVERITY_DOT[c.severity] ?? 'bg-gray-500'}`} />
              )}
              <div>
                <div className={`text-xs font-semibold ${c.passed ? 'text-gray-300' : (SEVERITY_COLOR[c.severity] ?? 'text-gray-300')}`}>
                  {c.title}
                </div>
                {!c.passed && c.detail && (
                  <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">{c.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OI analysis panel (index options only: NIFTY, BANKNIFTY)
// ─────────────────────────────────────────────────────────────────────────────
function OIPanel({ intel }) {
  const [open, setOpen] = useState(true);

  const SEVERITY_DOT = {
    info:    'bg-blue-500',
    caution: 'bg-amber-500',
    warning: 'bg-orange-500',
    danger:  'bg-red-500',
  };

  if (intel.loading) {
    return (
      <div className="rounded-xl border border-white/10 p-4 mt-3">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={15} className="text-orange-400" />
          <span className="text-sm font-semibold text-white">OI Check</span>
          <Loader2 size={13} className="animate-spin text-gray-400 ml-1" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 bg-white/5 rounded animate-pulse" style={{ width: `${50 + i * 10}%` }} />
          ))}
        </div>
      </div>
    );
  }

  const oi = intel.result?.oi;
  if (!oi) return null;

  if (oi.unavailable) {
    return (
      <div className="rounded-xl border border-white/10 p-4 mt-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-orange-400" />
          <span className="text-sm font-semibold text-white">OI Check</span>
        </div>
        <p className="text-gray-500 text-xs mt-2">OI data unavailable — option chain not accessible.</p>
      </div>
    );
  }

  const { verdict, riskScore, checks } = oi;
  const vc = VERDICT[verdict] ?? VERDICT.clear;
  const { Icon: VIcon } = vc;

  return (
    <div className={`rounded-xl border ${vc.border} ${vc.bg} mt-3`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-orange-400" />
          <div>
            <div className="text-sm font-semibold text-white">OI Check</div>
            <div className="text-xs text-gray-500 font-normal">Open interest walls &amp; market activity</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Risk</span>
          <span className={`text-base font-bold font-mono leading-none ${vc.color}`}>{riskScore}</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${vc.border} ${vc.color}`}>
            <VIcon size={11} />
            {vc.label}
          </div>
          <ChevronDown size={13} className={`text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && checks?.length > 0 && (
        <div className="px-4 pb-3 pt-1 border-t border-white/5 space-y-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5">
              {c.passed ? (
                <CheckCircle size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${SEVERITY_DOT[c.severity] ?? 'bg-gray-500'}`} />
              )}
              <div>
                <div className={`text-xs font-semibold ${c.passed ? 'text-gray-300' : (SEVERITY_COLOR[c.severity] ?? 'text-gray-300')}`}>
                  {c.title}
                </div>
                {!c.passed && c.detail && (
                  <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">{c.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {

  const [isLoading, setIsLoading] = useState(true);
  const [isKiteConnected, setIsKiteConnected] = useState(false);
  const [instrumentType, setInstrumentType] = useState('EQ');
  const [optionSymbol, setOptionSymbol] = useState('');
  const [optionTvSymbol, setOptionTvSymbol] = useState('');
  const [optionLtp, setOptionLtp] = useState(null);
  const [optionStrike, setOptionStrike] = useState(null);
  const [optionExpiry, setOptionExpiry] = useState('');
  const [transactionType, setTransactionType] = useState('BUY');
  const [productType, setProductType] = useState('MIS');
  const [orderType, setOrderType] = useState('MARKET');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [lotSize, setLotSize] = useState(1);
  const [searching, setSearching] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [spotPrice, setSpotPrice] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [openOrders, setOpenOrders] = useState([]);
  const [movers, setMovers] = useState(null);
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [orderPlacing, setOrderPlacing] = useState(false);
  const [expiryType, setExpiryType] = useState('weekly');
  const [strikeAnalysis, setStrikeAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [strikeStep, setStrikeStep] = useState(50);

  // NFO instruments (options/futures) don't support MARKET or SL-M orders
  const isNFO = instrumentType === 'CE' || instrumentType === 'PE' || instrumentType === 'FUT';
  const [slModal, setSlModal] = useState(null); // { position, slPrice }
  const [cancelConfirm, setCancelConfirm] = useState(null); // order_id
  const [actionLoading, setActionLoading] = useState(null); // order_id or symbol being actioned
  const [livePriceActive, setLivePriceActive] = useState(false);

  // Intelligence
  const [intel, setIntel] = useState({ loading: false, result: null });
  const [structureIntel, setStructureIntel] = useState({ loading: false, result: null });
  const [patternIntel, setPatternIntel] = useState({ loading: false, result: null });
  const [stationIntel, setStationIntel] = useState({ loading: false, result: null });
  const [oiIntel, setOIIntel] = useState({ loading: false, result: null });
  const [acknowledged, setAcknowledged] = useState(false);
  const [dangerModal, setDangerModal] = useState(false);

  const popularStocks = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'MARUTI', 'BHARTIARTL'];
  const INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];

  const checkKiteConnection = async () => {
    try {
      const res = await fetch('/api/kite-config');
      const data = await res.json();
      setIsKiteConnected(data.tokenValid);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOpenOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch('/api/kite-orders?limit=50');
      const data = await res.json();
      if (data.success) {
        setOpenOrders(data.orders.filter(o => ['OPEN', 'PENDING', 'TRIGGER PENDING'].includes(o.status?.toUpperCase())));
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchMovers = async () => {
    try {
      const res  = await fetch('/api/fno-movers');
      const data = await res.json();
      if (!data.error) setMovers(data);
    } catch { /* silent — non-critical */ }
  };

  const isVisible = usePageVisibility();

  const isMarketHours = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return total >= 555 && total <= 930;
  };

  const fetchPositions = async (silent = false) => {
    if (!silent) setPositionsLoading(true);
    try {
      const res = await fetch('/api/kite-positions');
      const data = await res.json();
      if (data.success && Array.isArray(data.positions)) {
        setPositions(data.positions);
        setLivePriceActive(data.livePrice || false);
      } else {
        setPositions([]);
      }
    } catch (err) {
      console.error('Error:', err);
      setPositions([]);
    } finally {
      if (!silent) setPositionsLoading(false);
    }
  };

  // Read URL params to pre-fill form
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSymbol = params.get('symbol');
    const urlType = params.get('type');
    const urlTransaction = params.get('transaction');

    if (urlSymbol) {
      setSymbol(urlSymbol);
      selectStock(urlSymbol);
    }
    if (urlType && ['EQ', 'CE', 'PE', 'FUT'].includes(urlType)) {
      setInstrumentType(urlType);
    }
    if (urlTransaction && ['BUY', 'SELL'].includes(urlTransaction)) {
      setTransactionType(urlTransaction);
    }
  }, []);

  useEffect(() => {
    checkKiteConnection();
    fetchOpenOrders();
    fetchPositions();
    fetchMovers();

    // Auto-refresh positions every 15s during market hours
    const posInterval = setInterval(() => {
      if (isMarketHours() && isVisible) fetchPositions(true);
    }, 15000);

    // Auto-refresh FnO movers every 5 minutes
    const moversInterval = setInterval(fetchMovers, 5 * 60 * 1000);

    return () => {
      clearInterval(posInterval);
      clearInterval(moversInterval);
    };
  }, []);

  // Run intelligence when symbol / transactionType / instrumentType changes
  useEffect(() => {
    if (!symbol) return;
    setAcknowledged(false);
    setStructureIntel({ loading: false, result: null });
    setPatternIntel({ loading: false, result: null });
    setStationIntel({ loading: false, result: null });
    setOIIntel({ loading: false, result: null });
    runIntelligence();
  }, [symbol, transactionType, instrumentType]);

  useEffect(() => {
    if ((instrumentType === 'CE' || instrumentType === 'PE') && symbol && spotPrice) {
      fetchOptionDetails();
    } else if (instrumentType === 'EQ') {
      setOptionSymbol(''); setOptionTvSymbol(''); setOptionLtp(null); setOptionStrike(null); setOptionExpiry('');
      setQuantity(1);
    } else if (instrumentType === 'FUT') {
      setOptionSymbol(''); setOptionTvSymbol(''); setOptionLtp(null); setOptionStrike(null); setOptionExpiry('');
      setQuantity(lotSize || 1);
    }
  }, [instrumentType, symbol, spotPrice, lotSize, expiryType]);

  useEffect(() => {
    if (instrumentType === 'EQ' && productType === 'NRML') setProductType('MIS');
    else if ((instrumentType === 'FUT' || instrumentType === 'CE' || instrumentType === 'PE') && productType === 'CNC') setProductType('MIS');
  }, [instrumentType]);

  const fetchOptionDetails = async () => {
    if (!symbol || !spotPrice) return;
    try {
      const url = `/api/option-details?symbol=${symbol}&spotPrice=${spotPrice}&instrumentType=${instrumentType}&expiryType=${expiryType}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.optionSymbol) {
        setOptionSymbol(data.optionSymbol || '');
        if (data.step) setStrikeStep(data.step);
        setOptionTvSymbol(data.tvSymbol || '');
        setOptionLtp(data.ltp || null);
        setOptionStrike(data.strike || null);
        setOptionExpiry(data.expiryDay || '');
        setQuantity(lotSize || 1);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const handleSearch = async (query) => {
    setSymbol(query);
    if (!query || query.length < 1) {
      setShowDropdown(false);
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/search-instruments?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.instruments && data.instruments.length > 0) {
        setSearchResults(data.instruments.slice(0, 10));
        setShowDropdown(true);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setSearching(false);
    }
  };

  // Reset order type to MARKET when switching to EQ, LIMIT when switching to NFO
  useEffect(() => {
    if (isNFO && (orderType === 'MARKET' || orderType === 'SL-M')) {
      setOrderType('LIMIT');
    }
  }, [isNFO]);

  const selectStock = async (selectedSymbol, knownLotSize = null) => {
    setShowAnalysis(false);
    setStrikeAnalysis(null);
    setSymbol(selectedSymbol);
    setShowDropdown(false);
    setSearchResults([]);
    if (knownLotSize && knownLotSize > 1) setLotSize(knownLotSize);
    try {
      const res = await fetch(`/api/ltp?symbol=${selectedSymbol}`);
      const data = await res.json();
      if (data.success && data.ltp) {
        setSpotPrice(data.ltp);
        if (data.lotSize && data.lotSize > 1 && !knownLotSize) setLotSize(data.lotSize);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const openChart = (chartSymbol) => {
    window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`NSE:${chartSymbol}`)}&interval=15`, '_blank');
  };

  const getEstimatedValue = () => {
    const p = (instrumentType === 'EQ' || instrumentType === 'FUT') ? spotPrice : optionLtp;
    const ep = orderType === 'MARKET' ? p : (parseFloat(price) || p);
    if (!ep || !quantity) return null;
    return (ep * quantity).toFixed(2);
  };

  const runIntelligence = useCallback(async () => {
    if (!symbol) return;
    setIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          exchange: instrumentType === 'EQ' ? 'NSE' : 'NFO',
          instrumentType,
          transactionType,
          spotPrice,
          productType,
        }),
      });
      const d = await r.json();
      setIntel({ loading: false, result: d });
    } catch {
      setIntel({ loading: false, result: null });
    }
  }, [symbol, instrumentType, transactionType, spotPrice, productType]);

  const runStructureAnalysis = useCallback(async () => {
    if (!symbol) return;
    setStructureIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          exchange: instrumentType === 'EQ' ? 'NSE' : 'NFO',
          instrumentType,
          transactionType,
          spotPrice,
          productType,
          includeStructure: true,
        }),
      });
      const d = await r.json();
      setStructureIntel({ loading: false, result: d });
    } catch {
      setStructureIntel({ loading: false, result: null });
    }
  }, [symbol, instrumentType, transactionType, spotPrice, productType]);

  const runStationAnalysis = useCallback(async () => {
    if (!symbol) return;
    setStationIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          exchange: instrumentType === 'EQ' ? 'NSE' : 'NFO',
          instrumentType,
          transactionType,
          spotPrice,
          productType,
          includeStation: true,
        }),
      });
      const d = await r.json();
      setStationIntel({ loading: false, result: d });
    } catch {
      setStationIntel({ loading: false, result: null });
    }
  }, [symbol, instrumentType, transactionType, spotPrice, productType]);

  const runOIAnalysis = useCallback(async () => {
    if (!symbol) return;
    setOIIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          exchange: instrumentType === 'EQ' ? 'NSE' : 'NFO',
          instrumentType,
          transactionType,
          spotPrice,
          productType,
          includeOI: true,
        }),
      });
      const d = await r.json();
      setOIIntel({ loading: false, result: d });
    } catch {
      setOIIntel({ loading: false, result: null });
    }
  }, [symbol, instrumentType, transactionType, spotPrice, productType]);

  const runPatternAnalysis = useCallback(async () => {
    if (!symbol) return;
    setPatternIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          exchange: instrumentType === 'EQ' ? 'NSE' : 'NFO',
          instrumentType,
          transactionType,
          spotPrice,
          productType,
          includePattern: true,
        }),
      });
      const d = await r.json();
      setPatternIntel({ loading: false, result: d });
    } catch {
      setPatternIntel({ loading: false, result: null });
    }
  }, [symbol, instrumentType, transactionType, spotPrice, productType]);

  const executePlaceOrder = async () => {
    if (!symbol) return;
    let ts, ex;
    if (instrumentType === 'EQ') {
      ts = symbol; ex = 'NSE';
    } else if (instrumentType === 'FUT') {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mmm = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      ts = `${symbol}${yy}${mmm}FUT`; ex = 'NFO';
    } else {
      ts = optionSymbol; ex = 'NFO';
    }
    if (!ts) { alert('Invalid symbol'); return; }
    setOrderPlacing(true);
    setDangerModal(false);
    try {
      const payload = {
        variety: 'regular',
        exchange: ex,
        tradingsymbol: ts,
        transaction_type: transactionType,
        quantity: parseInt(quantity),
        product: productType,
        order_type: orderType
      };
      if (orderType === 'LIMIT' || orderType === 'SL') payload.price = parseFloat(price);
      if (orderType === 'SL' || orderType === 'SL-M') payload.trigger_price = parseFloat(triggerPrice);
      const res = await fetch('/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert(`Order placed! ID: ${data.order_id}`);
        fetchOpenOrders();
        fetchPositions();
        setPrice('');
        setTriggerPrice('');
        setTimeout(runIntelligence, 1200);
      } else {
        alert(`Failed: ${data.error || 'Unknown'}`);
      }
    } catch (err) {
      alert('Error placing order');
    } finally {
      setOrderPlacing(false);
    }
  };

  const handlePlaceOrder = () => {
    const v = intel.result?.behavioral?.verdict;
    if (v === 'danger') { setDangerModal(true); return; }
    executePlaceOrder();
  };

  const fetchStrikeAnalysis = async () => {
    if (!optionStrike || (!symbol && instrumentType !== 'FUT')) return;
    setAnalysisLoading(true);
    setShowAnalysis(true);
    setStrikeAnalysis(null);
    try {
      const params = new URLSearchParams({
        symbol,
        strike: optionStrike,
        type: instrumentType,
        expiryType,
        strikeGap: strikeStep,
        spotPrice: spotPrice || 0,
      });
      const res = await fetch(`/api/strike-analysis?${params}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStrikeAnalysis(data);
    } catch (err) {
      setStrikeAnalysis({ error: err.message });
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleExitPosition = async (p) => {
    const isNFOPos = p.exchange === 'NFO';
    const exitPrice = isNFOPos ? p.last_price : null;
    const orderTypeExit = isNFOPos ? 'LIMIT' : 'MARKET';
    const confirmMsg = isNFOPos
      ? `Exit ${p.tradingsymbol} (${Math.abs(p.quantity)} qty) with LIMIT order at LTP ₹${p.last_price?.toFixed(2)}?`
      : `Exit ${p.tradingsymbol} (${Math.abs(p.quantity)} qty) at market price?`;
    if (!confirm(confirmMsg)) return;
    setActionLoading(p.tradingsymbol);
    try {
      const payload = {
        variety: 'regular',
        exchange: p.exchange,
        tradingsymbol: p.tradingsymbol,
        transaction_type: p.quantity > 0 ? 'SELL' : 'BUY',
        quantity: Math.abs(p.quantity),
        product: p.product || 'MIS',
        order_type: orderTypeExit,
      };
      if (isNFOPos && exitPrice) payload.price = exitPrice;
      const res = await fetch('/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Exit order placed! ID: ${data.order_id}`);
        fetchPositions();
        fetchOpenOrders();
      } else {
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert('Error placing exit order');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePlaceSL = async () => {
    if (!slModal || !slModal.slPrice) { alert('Enter SL price'); return; }
    const { position: p, slPrice } = slModal;
    if (p._demo) {
      const slType = p.exchange === 'NFO' ? 'SL' : 'SL-M';
      alert(`DEMO MODE: Would place ${slType} order for ${Math.abs(p.quantity)} qty of ${p.tradingsymbol} with trigger price ₹${slPrice} — no real order placed.`);
      setSlModal(null);
      return;
    }
    setActionLoading(p.tradingsymbol);
    try {
      const res = await fetch('/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variety: 'regular',
          exchange: p.exchange,
          tradingsymbol: p.tradingsymbol,
          transaction_type: p.quantity > 0 ? 'SELL' : 'BUY',
          quantity: Math.abs(p.quantity),
          product: p.product || 'MIS',
          order_type: p.exchange === 'NFO' ? 'SL' : 'SL-M',
          ...(p.exchange === 'NFO' ? { price: parseFloat(slPrice) - 1, trigger_price: parseFloat(slPrice) } : { trigger_price: parseFloat(slPrice) }),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`SL order placed! ID: ${data.order_id}`);
        setSlModal(null);
        fetchOpenOrders();
      } else {
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert('Error placing SL order');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelOrder = async (orderId) => {
    setActionLoading(orderId);
    setCancelConfirm(null);
    try {
      const res = await fetch('/api/cancel-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, variety: 'regular' }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Order cancelled successfully');
        fetchOpenOrders();
      } else {
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert('Error cancelling order');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Verdict-gated button config ───────────────────────────────────────────
  const verdict = intel.result?.behavioral?.verdict ?? null;
  const buyGradient  = 'from-green-500 to-emerald-600';
  const sellGradient = 'from-red-500 to-rose-600';
  const btnGradient = {
    clear:   transactionType === 'BUY' ? buyGradient : sellGradient,
    caution: 'from-amber-500 to-yellow-600',
    warning: 'from-orange-500 to-orange-600',
    danger:  'from-red-600 to-red-700',
  };
  const activeGradient = btnGradient[verdict] ?? (transactionType === 'BUY' ? buyGradient : sellGradient);
  const btnDisabled = (verdict === 'warning' && !acknowledged) || orderPlacing || !symbol;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-gradient-to-r from-slate-900/90 via-slate-800/90 to-slate-900/90 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/trades" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <ArrowLeft size={20} />
              </Link>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 text-transparent bg-clip-text">
                  Order Management
                </h1>
                <p className="text-sm text-gray-400">Place trades & manage positions</p>
              </div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${isKiteConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              <span className={`w-2 h-2 rounded-full ${isKiteConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
              {isKiteConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Panel: Order Form (5/12) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-white/10 p-6">
              <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
                <ShoppingCart size={20} className="text-blue-400" /> Place Order
              </h2>
              <div className="mb-4 relative">
                <label className="text-sm text-gray-400 mb-1.5 block">Stock / Index</label>
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => handleSearch(e.target.value.toUpperCase())}
                    placeholder="Search any NSE symbol..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-sm"
                  />
                  {searching && <RefreshCw size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
                </div>
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-white/10 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                    {searchResults.map((inst, idx) => (
                      <button
                        key={`${inst.symbol}-${idx}`}
                        onClick={() => selectStock(inst.symbol, inst.lotSize)}
                        className="w-full px-4 py-2.5 text-left hover:bg-white/5 flex items-center justify-between border-b border-white/5 last:border-0"
                      >
                        <div>
                          <span className="font-medium text-sm">{inst.symbol}</span>
                          <span className="text-xs text-gray-500 ml-2">{inst.name}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded ${inst.type === 'INDEX' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {inst.type === 'INDEX' ? 'INDEX' : inst.exchange}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mb-4">
                <label className="text-sm text-gray-400 mb-1.5 block">Quick Select</label>
                <div className="flex flex-wrap gap-2">
                  {popularStocks.map((s) => (
                    <button
                      key={s}
                      onClick={() => selectStock(s)}
                      className={`px-3 py-1.5 text-xs rounded-lg border ${symbol === s ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {symbol && (
                <>
                  {symbol === 'NIFTY' && (instrumentType === 'CE' || instrumentType === 'PE') && (
                    <div className="mb-2 flex gap-2 items-center">
                      <span className="text-xs text-gray-400">Expiry:</span>
                      <button
                        className={`px-2 py-1 rounded text-xs font-medium border ${expiryType === 'weekly' ? 'bg-blue-500/20 border-blue-400 text-blue-300' : 'bg-white/5 border-white/10 text-gray-300'}`}
                        onClick={() => setExpiryType('weekly')}
                      >Weekly</button>
                      <button
                        className={`px-2 py-1 rounded text-xs font-medium border ${expiryType === 'monthly' ? 'bg-blue-500/20 border-blue-400 text-blue-300' : 'bg-white/5 border-white/10 text-gray-300'}`}
                        onClick={() => setExpiryType('monthly')}
                      >Monthly</button>
                    </div>
                  )}
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-white/5">
                    <div className="space-y-2">
                      <span className="text-gray-400 text-xs">Spot Price</span>
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xl font-bold flex-shrink-0">{symbol}</p>
                        <span className="text-2xl font-bold flex-shrink-0">₹{spotPrice ? spotPrice.toLocaleString() : '--'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg px-2 py-1 border border-white/10">
                          <BarChart2 size={14} className="text-gray-400 mr-1" />
                          <button
                            onClick={() => openChart(symbol)}
                            className="text-blue-400 hover:text-blue-300 text-xs font-medium px-1.5 py-0.5 hover:bg-blue-500/20 rounded transition-colors flex items-center gap-0.5"
                            title="Equity Chart"
                          >
                            EQ <ExternalLink size={10} />
                          </button>
                          <button
                            onClick={() => optionTvSymbol && instrumentType === 'CE' ? openChart(optionTvSymbol) : alert('Select CE option first')}
                            className={`text-xs font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5 ${instrumentType === 'CE' && optionTvSymbol ? 'text-green-400 hover:text-green-300 hover:bg-green-500/20' : 'text-gray-500'}`}
                            title="CE Option Chart"
                          >
                            CE <ExternalLink size={10} />
                          </button>
                          <button
                            onClick={() => optionTvSymbol && instrumentType === 'PE' ? openChart(optionTvSymbol) : alert('Select PE option first')}
                            className={`text-xs font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5 ${instrumentType === 'PE' && optionTvSymbol ? 'text-red-400 hover:text-red-300 hover:bg-red-500/20' : 'text-gray-500'}`}
                            title="PE Option Chart"
                          >
                            PE <ExternalLink size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {symbol && spotPrice && (
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-white/10 p-6">
                <div className="mb-4">
                  <label className="text-sm text-gray-400 mb-1.5 block">Instrument Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(INDICES.includes(symbol) ? ['FUT', 'CE', 'PE'] : ['EQ', 'CE', 'PE']).map((t) => (
                      <button
                        key={t}
                        onClick={() => setInstrumentType(t)}
                        className={`py-2 rounded-lg text-sm font-medium ${instrumentType === t
                          ? (t === 'EQ' || t === 'FUT' ? 'bg-blue-500' : t === 'CE' ? 'bg-green-500' : 'bg-red-500') + ' text-white'
                          : 'bg-white/5 border border-white/10'}`}
                      >
                        {t === 'EQ' ? 'Equity' : t === 'FUT' ? 'Futures' : t === 'CE' ? 'Call (CE)' : 'Put (PE)'}
                      </button>
                    ))}
                  </div>
                </div>
                {(instrumentType === 'CE' || instrumentType === 'PE') && optionSymbol && (
                  <div className="mb-4">
                    <div className="p-3 bg-slate-900/70 rounded-xl border border-white/5">
                      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                        <div><span className="text-gray-500 text-xs">Symbol</span><p className="font-medium text-xs">{optionSymbol}</p></div>
                        <div><span className="text-gray-500 text-xs">Strike</span><p className="font-medium">₹{optionStrike}</p></div>
                        <div><span className="text-gray-500 text-xs">Expiry</span><p className="font-medium text-xs">{optionExpiry}</p></div>
                        <div><span className="text-gray-500 text-xs">LTP</span><p className={`font-bold ${instrumentType === 'CE' ? 'text-green-400' : 'text-red-400'}`}>₹{optionLtp || '--'}</p></div>
                      </div>
                      <button
                        onClick={fetchStrikeAnalysis}
                        disabled={analysisLoading}
                        className="w-full py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <BarChart2 size={13} />
                        {analysisLoading ? 'Analysing...' : showAnalysis ? 'Refresh Analysis' : 'Analyse This Strike'}
                      </button>
                    </div>

                    {/* Inline Strike Analysis */}
                    {showAnalysis && (
                      <div className="mt-2 p-3 bg-purple-900/10 rounded-xl border border-purple-500/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-purple-300 font-medium">Strike Analysis · {optionStrike} {instrumentType}</span>
                          <button onClick={() => setShowAnalysis(false)} className="text-gray-500 hover:text-white text-xs px-2 py-0.5 rounded bg-white/5 hover:bg-white/10">✕ Close</button>
                        </div>
                        {analysisLoading ? (
                          <div className="flex items-center justify-center py-4 gap-2 text-purple-300 text-xs">
                            <RefreshCw size={14} className="animate-spin" /> Fetching OI data...
                          </div>
                        ) : strikeAnalysis?.error ? (
                          <p className="text-xs text-red-400">Error: {strikeAnalysis.error}</p>
                        ) : strikeAnalysis ? (
                          <>
                            {/* Key metrics row */}
                            <div className="grid grid-cols-3 gap-2 mb-3">
                              <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                                <p className="text-xs text-gray-500">Call OI</p>
                                <p className="text-xs font-bold text-red-400">{strikeAnalysis.ceOI > 0 ? (strikeAnalysis.ceOI/1e5).toFixed(1)+'L' : '--'}</p>
                              </div>
                              <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                                <p className="text-xs text-gray-500">PCR</p>
                                <p className={`text-xs font-bold ${strikeAnalysis.pcr > 1 ? 'text-green-400' : strikeAnalysis.pcr < 0.8 ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {strikeAnalysis.pcr}
                                </p>
                              </div>
                              <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                                <p className="text-xs text-gray-500">Put OI</p>
                                <p className="text-xs font-bold text-green-400">{strikeAnalysis.peOI > 0 ? (strikeAnalysis.peOI/1e5).toFixed(1)+'L' : '--'}</p>
                              </div>
                            </div>

                            {/* Max Pain */}
                            <div className="flex items-center justify-between mb-3 px-1">
                              <span className="text-xs text-gray-400">Max Pain</span>
                              <span className="text-xs font-medium text-amber-400">₹{strikeAnalysis.maxPain}</span>
                              <span className="text-xs text-gray-500">
                                {Math.abs(optionStrike - strikeAnalysis.maxPain)} pts {optionStrike > strikeAnalysis.maxPain ? 'above' : 'below'}
                              </span>
                            </div>

                            {/* OI Bar chart for nearby strikes */}
                            <div className="mb-3">
                              <p className="text-xs text-gray-500 mb-1.5">OI at nearby strikes</p>
                              {strikeAnalysis.strikeData?.map(s => {
                                const maxOI = Math.max(...strikeAnalysis.strikeData.map(x => Math.max(x.ceOI, x.peOI)), 1);
                                const ceWidth = Math.round((s.ceOI / maxOI) * 100);
                                const peWidth = Math.round((s.peOI / maxOI) * 100);
                                const isSelected = s.strike === optionStrike;
                                return (
                                  <div key={s.strike} className={`flex items-center gap-1 mb-1 ${isSelected ? 'opacity-100' : 'opacity-60'}`}>
                                    <span className={`text-xs w-12 text-right ${isSelected ? 'text-white font-bold' : 'text-gray-500'}`}>{s.strike}</span>
                                    <div className="flex-1 flex gap-0.5 h-3">
                                      <div className="flex-1 flex justify-end">
                                        <div className="h-full bg-red-500/60 rounded-sm" style={{width: `${ceWidth}%`}} title={`CE OI: ${(s.ceOI/1e5).toFixed(1)}L`} />
                                      </div>
                                      <div className="w-px bg-white/10" />
                                      <div className="flex-1">
                                        <div className="h-full bg-green-500/60 rounded-sm" style={{width: `${peWidth}%`}} title={`PE OI: ${(s.peOI/1e5).toFixed(1)}L`} />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              <div className="flex justify-between text-xs text-gray-600 mt-1 px-14">
                                <span>← CE (calls)</span>
                                <span>PE (puts) →</span>
                              </div>
                            </div>

                            {/* Signals */}
                            <div className="space-y-1">
                              {strikeAnalysis.signals?.map((sig, i) => (
                                <div key={i} className={`flex items-start gap-1.5 text-xs px-2 py-1 rounded-lg ${
                                  sig.type === 'bullish' ? 'bg-green-500/10 text-green-400' :
                                  sig.type === 'bearish' ? 'bg-red-500/10 text-red-400' :
                                  sig.type === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                                  'bg-white/5 text-gray-400'
                                }`}>
                                  <span>{sig.type === 'bullish' ? '↑' : sig.type === 'bearish' ? '↓' : sig.type === 'warning' ? '⚠' : '•'}</span>
                                  <span>{sig.text}</span>
                                </div>
                              ))}
                            </div>

                            <p className="text-xs text-gray-600 mt-2 text-right">
                              {strikeAnalysis.fromCache ? 'cached · ' : ''}{new Date(strikeAnalysis.timestamp).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}
                            </p>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
                <div className="mb-4">
                  <label className="text-sm text-gray-400 mb-1.5 block">Transaction</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setTransactionType('BUY')}
                      className={`py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 ${transactionType === 'BUY' ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg' : 'bg-green-500/10 border border-green-500/30 text-green-400'}`}
                    >
                      <TrendingUp size={18} /> BUY
                    </button>
                    <button
                      onClick={() => setTransactionType('SELL')}
                      className={`py-3 rounded-xl font-semibold flex items-center justify-center gap-2 ${transactionType === 'SELL' ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}
                    >
                      <TrendingDown size={18} /> SELL
                    </button>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="text-sm text-gray-400 mb-1.5 block">Product Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setProductType('MIS')}
                      className={`py-2 rounded-lg text-sm font-medium ${productType === 'MIS' ? 'bg-purple-500 text-white' : 'bg-white/5 border border-white/10'}`}
                    >
                      MIS (Intraday)
                    </button>
                    {instrumentType === 'EQ' ? (
                      <button
                        onClick={() => setProductType('CNC')}
                        className={`py-2 rounded-lg text-sm font-medium ${productType === 'CNC' ? 'bg-indigo-500 text-white' : 'bg-white/5 border border-white/10'}`}
                      >
                        CNC (Delivery)
                      </button>
                    ) : (
                      <button
                        onClick={() => setProductType('NRML')}
                        className={`py-2 rounded-lg text-sm font-medium ${productType === 'NRML' ? 'bg-indigo-500 text-white' : 'bg-white/5 border border-white/10'}`}
                      >
                        NRML (Carryover)
                      </button>
                    )}
                  </div>
                </div>
                <div className="mb-4">
                  <label className="text-sm text-gray-400 mb-1.5 block">Order Type</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['MARKET', 'LIMIT', 'SL', 'SL-M'].map((t) => {
                      const disabled = isNFO && (t === 'MARKET' || t === 'SL-M');
                      return (
                        <button
                          key={t}
                          onClick={() => !disabled && setOrderType(t)}
                          title={disabled ? 'Not allowed for F&O by Kite' : ''}
                          className={`py-2 rounded-lg text-xs font-medium relative ${
                            disabled
                              ? 'bg-white/5 border border-white/5 text-gray-600 cursor-not-allowed'
                              : orderType === t
                                ? 'bg-blue-500 text-white'
                                : 'bg-white/5 border border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {t}
                          {disabled && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500/70" />}
                        </button>
                      );
                    })}
                  </div>
                  {isNFO && (
                    <p className="text-xs text-amber-400/70 mt-1">⚠ F&O: Only LIMIT and SL orders allowed</p>
                  )}
                </div>
                <div className="mb-4">
                  <label className="text-sm text-gray-400 mb-1.5 block">Quantity</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="1"
                    className="w-full px-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-sm"
                  />
                  {instrumentType !== 'EQ' && lotSize > 1 && (
                    <p className="text-xs text-gray-500 mt-1">Lot Size: {lotSize}</p>
                  )}
                </div>
                {(orderType === 'LIMIT' || orderType === 'SL') && (
                  <div className="mb-4">
                    <label className="text-sm text-gray-400 mb-1.5 block">Price</label>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      step="0.05"
                      className="w-full px-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-sm"
                    />
                  </div>
                )}
                {(orderType === 'SL' || orderType === 'SL-M') && (
                  <div className="mb-4">
                    <label className="text-sm text-gray-400 mb-1.5 block">Trigger Price</label>
                    <input
                      type="number"
                      value={triggerPrice}
                      onChange={(e) => setTriggerPrice(e.target.value)}
                      step="0.05"
                      className="w-full px-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-sm"
                    />
                  </div>
                )}
                {getEstimatedValue() && (
                  <div className="mb-4 p-3 bg-slate-900/50 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">Est. Value</span>
                      <span className="font-bold text-lg">₹{parseFloat(getEstimatedValue()).toLocaleString()}</span>
                    </div>
                  </div>
                )}
                {/* Warning acknowledge checkbox */}
                {verdict === 'warning' && (
                  <label className="flex items-start gap-2 cursor-pointer text-xs text-orange-300 mb-3">
                    <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}
                      className="mt-0.5 accent-orange-500" />
                    I understand the risk and want to proceed
                  </label>
                )}
                <button
                  onClick={handlePlaceOrder}
                  disabled={btnDisabled}
                  className={`w-full py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 bg-gradient-to-r ${activeGradient} disabled:opacity-50`}
                >
                  {orderPlacing
                    ? <><RefreshCw size={18} className="animate-spin" /> Placing...</>
                    : <>{transactionType === 'BUY' ? <TrendingUp size={18} /> : <TrendingDown size={18} />} {transactionType} {instrumentType === 'EQ' || instrumentType === 'FUT' ? symbol + (instrumentType === 'FUT' ? ' FUT' : '') : optionSymbol || symbol}
                        {verdict && verdict !== 'clear' && (
                          <span className={`text-xs font-normal ${VERDICT[verdict]?.color}`}>· {VERDICT[verdict]?.label}</span>
                        )}
                      </>
                  }
                </button>
              </div>
            )}
          </div>

          {/* Center Panel: Intelligence Center (4/12) */}
          <div className="lg:col-span-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-white/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain size={16} className="text-purple-400" />
                  <h2 className="text-sm font-semibold text-white">Intelligence Center</h2>
                </div>
                {symbol && (
                  <button onClick={runIntelligence} disabled={intel.loading}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" title="Re-run analysis">
                    <RefreshCw size={13} className={`text-gray-400 ${intel.loading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
              <BehavioralPanel intel={intel} symbol={symbol} />

              {/* Run Structure Analysis button — shown once behavioral result is loaded */}
              {intel.result?.behavioral && !structureIntel.loading && !structureIntel.result && (
                <button
                  onClick={runStructureAnalysis}
                  className="mt-3 w-full py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Activity size={13} /> Run Structure Analysis
                </button>
              )}

              <StructurePanel intel={structureIntel} />

              {/* Run Pattern Analysis button — shown once behavioral result is loaded */}
              {intel.result?.behavioral && !patternIntel.loading && !patternIntel.result && (
                <button
                  onClick={runPatternAnalysis}
                  className="mt-3 w-full py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <ScanSearch size={13} /> Run Pattern Analysis
                </button>
              )}

              <PatternPanel intel={patternIntel} />

              {/* Run Station Analysis button */}
              {intel.result?.behavioral && !stationIntel.loading && !stationIntel.result && (
                <button
                  onClick={runStationAnalysis}
                  className="mt-3 w-full py-2 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Target size={13} /> Run Station Analysis
                </button>
              )}

              <StationPanel intel={stationIntel} />

              {/* Run OI Analysis button — index options only */}
              {['NIFTY', 'BANKNIFTY'].includes(symbol?.toUpperCase()) &&
                intel.result?.behavioral && !oiIntel.loading && !oiIntel.result && (
                <button
                  onClick={runOIAnalysis}
                  className="mt-3 w-full py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <BarChart3 size={13} /> Run OI Analysis
                </button>
              )}

              <OIPanel intel={oiIntel} />
            </div>
          </div>

          {/* Right Panel: Positions + Open Orders (3/12) */}
          <div className="lg:col-span-3 flex flex-col gap-4">

            {/* Positions */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl border border-white/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <Wallet size={16} className="text-green-400" /> Positions
                  {livePriceActive && (
                    <span className="text-xs text-green-400 font-normal flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
                      live
                    </span>
                  )}
                </h2>
                <button onClick={() => fetchPositions(false)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10" title="Refresh positions">
                  <RefreshCw size={14} className={positionsLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {positionsLoading
                ? <div className="flex items-center justify-center py-8"><RefreshCw size={20} className="animate-spin text-gray-400" /></div>
                : <div className="space-y-2 max-h-[350px] overflow-y-auto">
                      {[...positions, ...(positions.length === 0 ? [{
                        tradingsymbol: 'NIFTY2621724500CE', exchange: 'NFO',
                        quantity: 65, average_price: 120.50, last_price: 145.30,
                        pnl: 1657.50, product: 'MIS', _demo: true
                      }] : [])].map((p, i) => (
                        <div key={`${p.tradingsymbol}-${i}`} className={`p-3 rounded-xl border ${p._demo ? 'bg-blue-900/10 border-blue-500/20' : 'bg-slate-900/50 border-white/5'}`}>
                          <div className="flex items-start justify-between mb-1">
                            <div>
                              <span className="font-medium text-sm">{p.tradingsymbol}</span>
                              <span className="text-xs text-gray-500 ml-2">{p.exchange}</span>
                              {p._demo && <span className="text-xs text-blue-400 ml-2">demo</span>}
                            </div>
                            <div className={`text-sm font-bold ${p.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {p.pnl >= 0 ? '+' : ''}₹{p.pnl?.toFixed(2) || '0'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs mb-2">
                            <span className={p.quantity > 0 ? 'text-green-400' : 'text-red-400'}>
                              {p.quantity > 0 ? 'LONG' : 'SHORT'} {Math.abs(p.quantity)}
                            </span>
                            <span className="text-gray-400">Avg: ₹{p.average_price?.toFixed(2)}</span>
                            <span className={p.live_price ? "text-green-300" : "text-gray-400"}>
                              LTP: ₹{p.last_price?.toFixed(2)}
                              {p.live_price && <span className="text-green-500 ml-0.5">●</span>}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => p._demo ? alert('DEMO MODE: Would place a SELL MARKET order for ' + Math.abs(p.quantity) + ' qty of ' + p.tradingsymbol + ' — no real order placed.') : handleExitPosition(p)}
                              className="flex-1 py-1 px-2 rounded-lg text-xs font-medium transition-colors bg-red-500/20 hover:bg-red-500/30 text-red-400"
                            >
                              {p._demo ? '🔴 Exit (demo)' : 'Exit'}
                            </button>
                            <button
                              onClick={() => setSlModal({ position: p, slPrice: '' })}
                              className="flex-1 py-1 px-2 rounded-lg text-xs font-medium transition-colors bg-amber-500/20 hover:bg-amber-500/30 text-amber-400"
                            >
                              {p._demo ? '🟡 SL (demo)' : 'Add / Edit SL'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
              }
            </div>
            <div className="bg-gradient-to-br from-amber-900/20 to-orange-900/20 rounded-2xl border border-amber-500/20 p-4 flex-1">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Clock size={16} className="text-amber-400" /> Open Orders
                </h2>
                <button onClick={fetchOpenOrders} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10">
                  <RefreshCw size={14} className={ordersLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {ordersLoading
                ? <div className="flex items-center justify-center py-4"><RefreshCw size={16} className="animate-spin text-gray-400" /></div>
                : openOrders.length === 0
                  ? <div className="text-center py-4 text-gray-500"><p className="text-xs">No open orders</p></div>
                  : <div className="space-y-2 max-h-[160px] overflow-y-auto">
                      {openOrders.map((o) => (
                        <div key={o.order_id} className="p-2.5 rounded-lg border bg-slate-900/50 border-amber-500/10">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${o.transaction_type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                                {o.transaction_type}
                              </span>
                              <span className="text-xs font-medium truncate max-w-[80px]">{o.tradingsymbol}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 text-xs text-amber-400">
                                <Clock size={10} />{o.status}
                              </div>
                              <button
                                onClick={() => setCancelConfirm(o.order_id)}
                                className="px-2 py-0.5 rounded text-xs font-medium transition-colors bg-red-500/20 hover:bg-red-500/30 text-red-400"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">{o.quantity} × ₹{o.price || 'MARKET'}</div>
                        </div>
                      ))}
                    </div>
              }
            </div>

            {/* FnO Movers — refreshes every 5 min */}
            {movers && (movers.gainers?.length > 0 || movers.losers?.length > 0) && (
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold flex items-center gap-1.5">
                    <BarChart2 size={14} className="text-blue-400" /> FnO Movers
                  </h2>
                  <button onClick={fetchMovers} className="p-1 rounded bg-white/5 hover:bg-white/10" title="Refresh movers">
                    <RefreshCw size={12} />
                  </button>
                </div>

                {/* Gainers */}
                {movers.gainers?.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-500 mb-1">Top Gainers</div>
                    <div className="space-y-0.5">
                      {movers.gainers.map(m => (
                        <div key={m.symbol} className="flex items-center justify-between py-0.5">
                          <span className="text-xs font-medium text-gray-300 truncate max-w-[90px]">{m.symbol}</span>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400">₹{m.ltp?.toFixed(1)}</span>
                            <span className="text-green-400 font-semibold w-14 text-right">+{m.changePct?.toFixed(2)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Losers */}
                {movers.losers?.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Top Losers</div>
                    <div className="space-y-0.5">
                      {movers.losers.map(m => (
                        <div key={m.symbol} className="flex items-center justify-between py-0.5">
                          <span className="text-xs font-medium text-gray-300 truncate max-w-[90px]">{m.symbol}</span>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400">₹{m.ltp?.toFixed(1)}</span>
                            <span className="text-red-400 font-semibold w-14 text-right">{m.changePct?.toFixed(2)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-600 mt-2 text-right">
                  {movers.timestamp ? new Date(movers.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''} · refreshes every 5m
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Danger confirmation modal */}
      {dangerModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-red-500/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <ShieldX size={22} className="text-red-400 flex-shrink-0" />
              <h3 className="text-white font-semibold">High Risk Detected</h3>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Risk score: <span className="text-red-400 font-bold">{intel.result?.behavioral?.riskScore ?? '--'}/100</span>.
              The following issues were found:
            </p>
            <div className="space-y-2 mb-5">
              {intel.result?.behavioral?.behaviors?.map((b, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle size={13} className={`mt-0.5 flex-shrink-0 ${SEVERITY_COLOR[b.severity] ?? 'text-gray-400'}`} />
                  <div>
                    <div className="text-gray-200 font-medium">{b.title}</div>
                    <div className="text-gray-500 text-xs">{b.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDangerModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 text-sm font-medium transition-colors border border-white/10">
                Cancel
              </button>
              <button onClick={executePlaceOrder} disabled={orderPlacing}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {orderPlacing ? <RefreshCw size={14} className="animate-spin" /> : 'Place Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SL Modal */}
      {slModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="text-base font-semibold mb-1">Add / Edit Stop Loss</h3>
            <p className="text-xs text-gray-400 mb-4">
              {slModal.position.tradingsymbol} · {slModal.position.quantity > 0 ? 'LONG' : 'SHORT'} {Math.abs(slModal.position.quantity)} · LTP ₹{slModal.position.last_price?.toFixed(2)}
            </p>
            <div className="mb-4">
              <label className="text-xs text-gray-400 mb-1 block">Trigger Price {slModal?.position?.exchange === 'NFO' ? '(SL)' : '(SL-M)'}</label>
              <input
                type="number"
                value={slModal.slPrice}
                onChange={e => setSlModal({ ...slModal, slPrice: e.target.value })}
                placeholder="Enter trigger price"
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
              />
              {slModal.position.average_price && (
                <p className="text-xs text-gray-500 mt-1">
                  Avg price: ₹{slModal.position.average_price?.toFixed(2)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSlModal(null)}
                className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePlaceSL}
                disabled={actionLoading === slModal.position.tradingsymbol}
                className="flex-1 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === slModal.position.tradingsymbol ? 'Placing...' : 'Place SL'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Confirm */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-72 shadow-2xl">
            <h3 className="text-base font-semibold mb-2">Cancel Order?</h3>
            <p className="text-xs text-gray-400 mb-5">This will cancel order <span className="text-white font-mono">{cancelConfirm}</span>. This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setCancelConfirm(null)}
                className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors"
              >
                Keep
              </button>
              <button
                onClick={() => handleCancelOrder(cancelConfirm)}
                className="flex-1 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium transition-colors"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
