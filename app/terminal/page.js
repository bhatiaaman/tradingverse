'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePageVisibility } from '@/app/hooks/usePageVisibility';
import { useTheme } from '@/lib/theme-context';
import {
  Search, X, RefreshCw, Brain, Loader2, ChevronDown, ChevronRight,
  CheckCircle, XCircle, Clock, AlertTriangle, ShieldCheck,
  ShieldAlert, ShieldX, AlertCircle, ExternalLink,
  Sun, Moon, Activity, ScanSearch, Target, BarChart3,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const VERDICT = {
  clear:   { label: 'CLEAR',   color: 'text-green-500 dark:text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  bar: 'bg-green-400',  Icon: ShieldCheck  },
  caution: { label: 'CAUTION', color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  bar: 'bg-amber-400',  Icon: AlertTriangle },
  warning: { label: 'WARNING', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', bar: 'bg-orange-400', Icon: ShieldAlert   },
  danger:  { label: 'DANGER',  color: 'text-red-600 dark:text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    bar: 'bg-red-500',    Icon: ShieldX       },
};
const SEVERITY_COLOR = { info: 'text-blue-400', caution: 'text-amber-400', warning: 'text-orange-400', danger: 'text-red-400' };
const SEVERITY_DOT   = { info: 'bg-blue-500',   caution: 'bg-amber-500',   warning: 'bg-orange-500',   danger: 'bg-red-500'   };

const INDEX_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
const OI_SYMBOLS    = ['NIFTY', 'BANKNIFTY'];

const DEFAULT_WATCHLIST_1 = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'LT'];
const DEFAULT_WATCHLIST_2 = ['NIFTY', 'BANKNIFTY', 'TATAMOTORS', 'MARUTI', 'BAJFINANCE', 'HINDUNILVR', 'ITC', 'WIPRO', 'ADANIENT', 'AXISBANK'];

function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay(); // 0 = Sun, 6 = Sat in IST
  if (day === 0 || day === 6) return false;
  const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return total >= 555 && total <= 930;
}

// ─────────────────────────────────────────────────────────────────────────────
// OrderStatusBadge
// ─────────────────────────────────────────────────────────────────────────────
function OrderStatusBadge({ status }) {
  const map = {
    COMPLETE:          { color: 'text-green-500 bg-green-500/10 border-green-500/20',    Icon: CheckCircle },
    REJECTED:          { color: 'text-red-500 bg-red-500/10 border-red-500/20',          Icon: XCircle     },
    CANCELLED:         { color: 'text-red-500 bg-red-500/10 border-red-500/20',          Icon: XCircle     },
    OPEN:              { color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20', Icon: Clock       },
    'TRIGGER PENDING': { color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20', Icon: Clock       },
    PENDING:           { color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20', Icon: Clock       },
  };
  const cfg = map[status?.toUpperCase()] ?? { color: 'text-gray-400 bg-gray-500/10 border-gray-500/20', Icon: AlertCircle };
  const { color, Icon } = cfg;
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs border ${color}`}>
      <Icon size={11} />
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable agent checks list
// ─────────────────────────────────────────────────────────────────────────────
function ChecksList({ checks }) {
  return (
    <div className="px-4 pb-3 pt-1 border-t border-black/5 dark:border-white/5 space-y-2">
      {checks.map((c, i) => (
        <div key={i} className="flex items-start gap-2.5">
          {c.passed ? (
            <CheckCircle size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
          ) : (
            <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${SEVERITY_DOT[c.severity] ?? 'bg-gray-400'}`} />
          )}
          <div>
            <div className={`text-xs font-semibold ${c.passed ? 'text-gray-500 dark:text-gray-300' : (SEVERITY_COLOR[c.severity] ?? 'text-gray-500 dark:text-gray-300')}`}>
              {c.title}
            </div>
            {!c.passed && c.detail && (
              <div className="text-gray-400 dark:text-gray-500 text-xs mt-0.5 leading-relaxed">{c.detail}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BehavioralPanel
// ─────────────────────────────────────────────────────────────────────────────
function BehavioralPanel({ intel, symbol }) {
  const [open, setOpen] = useState(true);
  if (!symbol) return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Brain size={15} className="text-purple-500 dark:text-purple-400" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Behavioral</span>
      </div>
      <p className="text-gray-400 dark:text-gray-500 text-xs">Select a symbol to run analysis.</p>
    </div>
  );
  if (intel.loading) return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Brain size={15} className="text-purple-500 dark:text-purple-400" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Behavioral</span>
        <Loader2 size={13} className="animate-spin text-gray-400 ml-1" />
      </div>
      <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-4 bg-black/5 dark:bg-white/5 rounded animate-pulse" style={{ width: `${60+i*10}%` }} />)}</div>
    </div>
  );
  if (!intel.result?.behavioral) return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Brain size={15} className="text-purple-500 dark:text-purple-400" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Behavioral</span>
      </div>
      <p className="text-gray-400 dark:text-gray-500 text-xs">Analysis unavailable.</p>
    </div>
  );
  const { verdict, riskScore, checks } = intel.result.behavioral;
  const vc = VERDICT[verdict] ?? VERDICT.clear;
  const { Icon: VIcon } = vc;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800/40 overflow-hidden">
      <div className={`h-0.5 ${vc.bar}`} />
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain size={15} className="text-purple-500 dark:text-purple-400" />
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">Behavioral</div>
            <div className="text-xs text-gray-400 font-normal">Habits &amp; biases</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Risk</span>
          <span className={`text-base font-bold font-mono leading-none ${vc.color}`}>{riskScore}</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${vc.border} ${vc.color}`}><VIcon size={11} />{vc.label}</div>
          <ChevronDown size={13} className={`text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && checks?.length > 0 && <ChecksList checks={checks} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic agent panel factory
// ─────────────────────────────────────────────────────────────────────────────
function AgentPanel({ intel, dataKey, icon: Icon, iconClass, title, subtitle, onRun, runLabel = 'Run', disabled = false }) {
  const [open, setOpen] = useState(true);

  const headerContent = (
    <div className="flex items-center gap-2">
      <Icon size={15} className={iconClass} />
      <div>
        <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
        <div className="text-xs text-gray-400 font-normal">{subtitle}</div>
      </div>
    </div>
  );

  if (intel.loading) return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4">
      <div className="flex items-center gap-2 mb-3">{headerContent}<Loader2 size={13} className="animate-spin text-gray-400 ml-1" /></div>
      <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-4 bg-black/5 dark:bg-white/5 rounded animate-pulse" style={{ width: `${50+i*10}%` }} />)}</div>
    </div>
  );

  const agentData = intel.result?.[dataKey];

  if (!agentData) return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon size={15} className={`${iconClass} opacity-50`} />
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
          <div className="text-xs text-gray-400 font-normal">{subtitle}</div>
        </div>
      </div>
      <button
        onClick={onRun}
        disabled={disabled}
        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
          disabled
            ? 'bg-black/5 dark:bg-white/5 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        }`}
      >
        {runLabel}
      </button>
    </div>
  );

  if (agentData.unavailable) return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4">
      <div className="flex items-center gap-2 mb-2">{headerContent}</div>
      <p className="text-gray-400 dark:text-gray-500 text-xs">Data unavailable — token not found or Kite disconnected.</p>
    </div>
  );

  const { verdict, riskScore, checks } = agentData;
  const vc = VERDICT[verdict] ?? VERDICT.clear;
  const { Icon: VIcon } = vc;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800/40 overflow-hidden">
      <div className={`h-0.5 ${vc.bar}`} />
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3">
        {headerContent}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Risk</span>
          <span className={`text-base font-bold font-mono leading-none ${vc.color}`}>{riskScore}</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${vc.border} ${vc.color}`}><VIcon size={11} />{vc.label}</div>
          <ChevronDown size={13} className={`text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && checks?.length > 0 && <ChecksList checks={checks} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TopBar
// ─────────────────────────────────────────────────────────────────────────────
function IndexTicker({ label, price, changePct }) {
  const pct = parseFloat(changePct);
  const isUp = pct >= 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 dark:text-white/40 hidden sm:inline">{label}</span>
      <span className="text-xs font-mono font-semibold text-gray-900 dark:text-white">
        {price ? parseFloat(price).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '---'}
      </span>
      {changePct !== undefined && changePct !== null && (
        <span className={`text-xs font-mono ${isUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {isUp ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
        </span>
      )}
    </div>
  );
}

function NiftyRangeBar({ indices }) {
  const dH  = indices?.niftyHigh        ? parseFloat(indices.niftyHigh).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : null;
  const dL  = indices?.niftyLow         ? parseFloat(indices.niftyLow).toLocaleString('en-IN',  { maximumFractionDigits: 0 }) : null;
  const wH  = indices?.niftyWeeklyHigh  ? parseFloat(indices.niftyWeeklyHigh).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : null;
  const wL  = indices?.niftyWeeklyLow   ? parseFloat(indices.niftyWeeklyLow).toLocaleString('en-IN',  { maximumFractionDigits: 0 }) : null;
  if (!dH && !wH) return null;
  return (
    <div className="flex items-center gap-3 text-[10px] font-mono text-gray-400 dark:text-white/30">
      {dH && dL && (
        <span title="Today's High / Low">
          <span className="text-gray-500 dark:text-white/20 mr-1">D</span>
          <span className="text-green-600 dark:text-green-500">{dH}</span>
          <span className="mx-0.5">/</span>
          <span className="text-red-600 dark:text-red-500">{dL}</span>
        </span>
      )}
      {wH && wL && (
        <span title="Weekly High / Low (last 5 days)" className="hidden lg:inline">
          <span className="text-gray-500 dark:text-white/20 mr-1">W</span>
          <span className="text-green-600 dark:text-green-500">{wH}</span>
          <span className="mx-0.5">/</span>
          <span className="text-red-600 dark:text-red-500">{wL}</span>
        </span>
      )}
    </div>
  );
}

function TopBar({ indices, kiteConnected }) {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div className="h-11 flex items-center justify-between px-4 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-white/10 flex-shrink-0">
      <Link href="/" className="text-xs font-bold text-gray-500 dark:text-white/50 tracking-widest uppercase hover:text-gray-800 dark:hover:text-white/80 transition-colors">
        Terminal
      </Link>

      <div className="flex items-center gap-4 sm:gap-6">
        <IndexTicker label="NIFTY"     price={indices?.nifty}   changePct={indices?.niftyChangePercent} />
        <NiftyRangeBar indices={indices} />
        <IndexTicker label="BANKNIFTY" price={indices?.bankNifty} changePct={indices?.bankNiftyChangePercent} />
        <IndexTicker label="SENSEX"    price={indices?.sensex}  changePct={indices?.sensexChangePercent} />
        {indices?.vix && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-white/40 hidden sm:inline">VIX</span>
            <span className="text-xs font-mono font-semibold text-gray-900 dark:text-white">{parseFloat(indices.vix).toFixed(2)}</span>
            {indices.vixChange && (
              <span className={`text-xs font-mono ${parseFloat(indices.vixChange) >= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {parseFloat(indices.vixChange) >= 0 ? '▲' : '▼'} {Math.abs(parseFloat(indices.vixChange)).toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Link href="/trades" className="text-xs text-gray-400 dark:text-white/30 hover:text-gray-700 dark:hover:text-white/70 transition-colors hidden sm:inline">
          ← Trades
        </Link>
        <button
          onClick={toggleTheme}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={14} className="text-gray-400 dark:text-white/50" /> : <Moon size={14} className="text-gray-500" />}
        </button>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${kiteConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-400 dark:text-white/30 hidden sm:inline">{kiteConnected ? 'Live' : 'Off'}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WatchlistPanel — with 2 tabs
// ─────────────────────────────────────────────────────────────────────────────
function WatchlistPanel({ watchTab, setWatchTab, watchlist, watchQuotes, watchSearch, setWatchSearch, watchSearchResults, watchSearching, onSymbolClick, onAddSymbol, onRemoveSymbol, activeSymbol, scannerStocks, scannerLastScan }) {
  const isScanner = watchTab === 'S';
  // Build scanName lookup for scanner tab
  const scannerMeta = isScanner
    ? Object.fromEntries(scannerStocks.map(s => [s.symbol, s]))
    : {};

  return (
    <div className="w-screen md:w-[240px] flex-shrink-0 flex flex-col bg-gray-50 dark:bg-slate-900/60 border-r border-gray-200 dark:border-white/10 overflow-hidden">

      {/* Tab header */}
      <div className="flex border-b border-gray-200 dark:border-white/10 flex-shrink-0">
        {[1, 2, 'S'].map(t => (
          <button
            key={t}
            onClick={() => setWatchTab(t)}
            className={`flex-1 py-2 text-xs font-semibold transition-colors border-b-2 ${
              watchTab === t
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60'
            }`}
          >
            {t === 'S' ? 'Scanner' : `List ${t}`}
          </button>
        ))}
      </div>

      {/* Scanner header info */}
      {isScanner && (
        <div className="px-3 py-1.5 border-b border-gray-100 dark:border-white/5 flex-shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-gray-400 dark:text-white/30">Chartink alerts</span>
          {scannerLastScan ? (
            <span className="text-[10px] text-blue-400 truncate max-w-[130px]" title={scannerLastScan.name}>
              {scannerLastScan.name}
            </span>
          ) : (
            <span className="text-[10px] text-gray-300 dark:text-white/20">No alerts yet</span>
          )}
        </div>
      )}

      {/* Add symbol search — hidden for scanner tab */}
      {!isScanner && (
        <div className="px-3 py-2 border-b border-gray-100 dark:border-white/5 flex-shrink-0 relative">
          <div className="flex items-center gap-2 bg-gray-200 dark:bg-slate-800 rounded-lg px-2.5 py-1.5">
            <Search size={12} className="text-gray-400 dark:text-white/30 flex-shrink-0" />
            <input
              value={watchSearch}
              onChange={e => setWatchSearch(e.target.value.toUpperCase())}
              placeholder="Add symbol..."
              className="bg-transparent text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none flex-1 w-0"
            />
            {watchSearching && <Loader2 size={11} className="animate-spin text-gray-400 flex-shrink-0" />}
          </div>
          {watchSearchResults.length > 0 && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
              {watchSearchResults.map(inst => (
                <button
                  key={inst.symbol}
                  onClick={() => onAddSymbol(inst.symbol)}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between transition-colors"
                >
                  <span className="font-medium text-gray-900 dark:text-white">{inst.symbol}</span>
                  <span className="text-gray-400">{inst.exchange}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Symbol list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {watchlist.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-white/30 text-center p-4">
            {isScanner ? 'No Chartink alerts received yet.' : 'Search above to add symbols.'}
          </p>
        ) : (
          watchlist.map(sym => {
            const q = watchQuotes[sym];
            const isUp = q ? q.changePct >= 0 : null;
            const isActive = sym === activeSymbol;
            const meta = scannerMeta[sym];
            return (
              <div
                key={sym}
                className={`group flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-white/5 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-500/10 border-l-2 border-l-blue-500' : ''}`}
                onClick={() => onSymbolClick(sym)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">{sym}</div>
                  {isScanner && meta?.scanName ? (
                    <div className="text-[10px] text-purple-400 truncate">{meta.scanName}</div>
                  ) : (
                    <div className={`text-xs font-mono ${q === undefined ? 'text-gray-300 dark:text-white/25' : isUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {q === undefined ? '---' : `${isUp ? '+' : ''}${q.changePct?.toFixed(2)}%`}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-mono font-semibold text-gray-900 dark:text-white">
                    {q?.ltp ? q.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '--'}
                  </div>
                  {q?.change !== undefined && (
                    <div className={`text-[10px] font-mono ${q.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {q.change >= 0 ? '+' : ''}{q.change?.toFixed(2)}
                    </div>
                  )}
                  {isScanner && q !== undefined && (
                    <div className={`text-[10px] font-mono ${q.changePct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {q.changePct >= 0 ? '+' : ''}{q.changePct?.toFixed(2)}%
                    </div>
                  )}
                </div>
                {!isScanner && (
                  <button
                    onClick={e => { e.stopPropagation(); onRemoveSymbol(sym); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-500 text-gray-300 dark:text-white/25 flex-shrink-0"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PositionsTab
// ─────────────────────────────────────────────────────────────────────────────
function PositionsTab({ positions, loading, onRefresh }) {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-600 dark:text-white/70">Open Positions</span>
        <button onClick={onRefresh} className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
          <RefreshCw size={13} className="text-gray-400" />
        </button>
      </div>
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse" />)}</div>
      ) : positions.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No open positions</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100 dark:border-white/5">
                <th className="text-left pb-2 font-medium">Symbol</th>
                <th className="text-right pb-2 font-medium">Qty</th>
                <th className="text-right pb-2 font-medium">Avg</th>
                <th className="text-right pb-2 font-medium">LTP</th>
                <th className="text-right pb-2 font-medium">P&amp;L</th>
                <th className="text-right pb-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(p => {
                const pnl = p.pnl || 0;
                return (
                  <tr key={p.tradingsymbol} className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="py-2.5 font-medium text-gray-900 dark:text-white">{p.tradingsymbol}</td>
                    <td className="py-2.5 text-right font-mono text-gray-700 dark:text-white/80">{p.quantity}</td>
                    <td className="py-2.5 text-right font-mono text-gray-700 dark:text-white/80">₹{p.average_price?.toFixed(2)}</td>
                    <td className="py-2.5 text-right font-mono text-gray-700 dark:text-white/80">₹{p.last_price?.toFixed(2)}</td>
                    <td className={`py-2.5 text-right font-mono font-semibold ${pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/50">{p.product}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OrdersTab
// ─────────────────────────────────────────────────────────────────────────────
function OrdersTab({ orders, loading, onRefresh }) {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-600 dark:text-white/70">Today&apos;s Orders</span>
        <button onClick={onRefresh} className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
          <RefreshCw size={13} className="text-gray-400" />
        </button>
      </div>
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No orders today</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100 dark:border-white/5">
                <th className="text-left pb-2 font-medium">Symbol</th>
                <th className="text-right pb-2 font-medium">Side</th>
                <th className="text-right pb-2 font-medium">Qty</th>
                <th className="text-right pb-2 font-medium">Price</th>
                <th className="text-right pb-2 font-medium">Status</th>
                <th className="text-right pb-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.order_id} className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                  <td className="py-2.5 font-medium text-gray-900 dark:text-white max-w-[140px] truncate">{o.tradingsymbol}</td>
                  <td className={`py-2.5 text-right font-semibold ${o.transaction_type === 'BUY' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {o.transaction_type}
                  </td>
                  <td className="py-2.5 text-right font-mono text-gray-700 dark:text-white/80">{o.quantity}</td>
                  <td className="py-2.5 text-right font-mono text-gray-700 dark:text-white/80">{o.price > 0 ? `₹${o.price}` : 'MKT'}</td>
                  <td className="py-2.5 text-right"><OrderStatusBadge status={o.status} /></td>
                  <td className="py-2.5 text-right text-gray-400">
                    {o.order_timestamp ? new Date(o.order_timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OrdersRightPanel — collapsible right sidebar for today's orders + FnO movers
// ─────────────────────────────────────────────────────────────────────────────
function OrdersRightPanel({ orders, loading, onRefresh, open, setOpen, movers }) {
  return (
    <div className={`flex-shrink-0 border-l border-gray-200 dark:border-white/10 flex flex-col bg-gray-50 dark:bg-slate-900/40 transition-all duration-200 ${open ? 'w-screen md:w-[260px]' : 'w-screen md:w-9'}`}>
      {/* Toggle + header */}
      <div className={`flex items-center flex-shrink-0 border-b border-gray-200 dark:border-white/10 ${open ? 'px-3 py-2 justify-between' : 'justify-center py-2'}`}>
        {open && <span className="text-[10px] font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wider">Open Orders</span>}
        {open && (
          <button onClick={onRefresh} className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-colors">
            <RefreshCw size={11} className="text-gray-400" />
          </button>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          className={`p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-colors ${open ? '' : 'mt-0'}`}
          title={open ? 'Collapse orders' : 'Show orders'}
        >
          <ChevronRight size={14} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Open orders */}
          {loading ? (
            <div className="p-3 space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse" />)}</div>
          ) : orders.length === 0 ? (
            <div className="flex items-center justify-center h-16 text-gray-400 text-xs">No open orders</div>
          ) : (
            <div className="p-2 space-y-1.5">
              {orders.map(o => {
                const isBuy = o.transaction_type === 'BUY';
                return (
                  <div key={o.order_id} className="p-2 rounded-lg bg-white dark:bg-slate-800/60 border border-gray-100 dark:border-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-900 dark:text-white truncate mr-2 max-w-[120px]">{o.tradingsymbol}</span>
                      <span className={`text-[10px] font-bold ${isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{o.transaction_type}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400">Qty {o.quantity}</span>
                        <span className="text-[10px] text-gray-400">{o.price > 0 ? `@ ₹${o.price}` : '@ MKT'}</span>
                      </div>
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FnO Movers */}
          {(movers.gainers.length > 0 || movers.losers.length > 0) && (
            <div className="border-t border-gray-200 dark:border-white/10 mt-1">
              <div className="px-3 py-1.5">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-white/30 uppercase tracking-wider">FnO Movers</span>
              </div>
              <div className="px-2 pb-2 space-y-2">
                {movers.gainers.length > 0 && (
                  <div>
                    <div className="px-2 pb-1">
                      <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">Gainers</span>
                    </div>
                    <div className="space-y-0.5">
                      {movers.gainers.slice(0, 4).map(s => (
                        <div key={`g-${s.symbol}`} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800/60 border border-gray-100 dark:border-white/5">
                          <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{s.symbol}</span>
                          <span className="text-xs font-mono text-green-600 dark:text-green-400 flex-shrink-0 ml-1">+{s.changePct?.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {movers.losers.length > 0 && (
                  <div>
                    <div className="px-2 pb-1">
                      <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Losers</span>
                    </div>
                    <div className="space-y-0.5">
                      {movers.losers.slice(0, 4).map(s => (
                        <div key={`l-${s.symbol}`} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800/60 border border-gray-100 dark:border-white/5">
                          <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{s.symbol}</span>
                          <span className="text-xs font-mono text-red-600 dark:text-red-400 flex-shrink-0 ml-1">{s.changePct?.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StrikeAnalysisPanel
// ─────────────────────────────────────────────────────────────────────────────
const SIGNAL_COLOR = { bullish: 'text-green-600 dark:text-green-400', bearish: 'text-red-600 dark:text-red-400', neutral: 'text-gray-500 dark:text-gray-300', warning: 'text-amber-600 dark:text-amber-400', info: 'text-blue-600 dark:text-blue-400' };
const VERDICT_CFG  = { sell: { label: 'SELL PREMIUM', cls: 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400' }, buy: { label: 'BUY OPTION', cls: 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400' }, neutral: { label: 'NEUTRAL', cls: 'bg-gray-500/10 border-gray-500/30 text-gray-500 dark:text-gray-400' } };

function StrikeAnalysisPanel({ analysis, loading, onRefresh, type }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-900/10 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 font-semibold text-purple-700 dark:text-purple-300">
          <BarChart3 size={12} />
          Strike Analysis
          <ChevronDown size={11} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={onRefresh} disabled={loading}
          className="p-1 hover:bg-purple-100 dark:hover:bg-purple-500/10 rounded transition-colors disabled:opacity-50">
          <RefreshCw size={11} className={`text-purple-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-purple-200 dark:border-purple-500/20 pt-2">
          {loading && !analysis && (
            <div className="flex items-center gap-2 py-2 text-purple-400">
              <Loader2 size={12} className="animate-spin" /> Fetching option chain...
            </div>
          )}

          {analysis && (
            <>
              {/* Key levels row */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-white dark:bg-slate-800/60 rounded-lg px-2 py-1.5 border border-gray-100 dark:border-white/5">
                  <div className="text-[10px] text-gray-400 mb-0.5">CE Wall</div>
                  <div className="font-bold text-red-600 dark:text-red-400">{analysis.ceWall}</div>
                </div>
                <div className="bg-white dark:bg-slate-800/60 rounded-lg px-2 py-1.5 border border-gray-100 dark:border-white/5 text-center">
                  <div className="text-[10px] text-gray-400 mb-0.5">PCR</div>
                  <div className={`font-bold ${analysis.pcr > 1.2 ? 'text-green-600 dark:text-green-400' : analysis.pcr < 0.8 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>{analysis.pcr}</div>
                </div>
                <div className="bg-white dark:bg-slate-800/60 rounded-lg px-2 py-1.5 border border-gray-100 dark:border-white/5 text-right">
                  <div className="text-[10px] text-gray-400 mb-0.5">PE Wall</div>
                  <div className="font-bold text-green-600 dark:text-green-400">{analysis.peWall}</div>
                </div>
              </div>

              {/* Verdict */}
              {analysis.verdict && (() => {
                const vc = VERDICT_CFG[analysis.verdict] ?? VERDICT_CFG.neutral;
                return (
                  <div className={`flex items-start gap-2 px-2 py-1.5 rounded-lg border ${vc.cls}`}>
                    <span className={`font-bold flex-shrink-0 ${vc.cls.split(' ').find(c => c.startsWith('text-'))}`}>{vc.label}</span>
                    <span className="text-gray-500 dark:text-gray-400">{analysis.verdictReason}</span>
                  </div>
                );
              })()}

              {/* OI bar chart (±3 strikes around selected) */}
              {analysis.strikeData?.length > 0 && (() => {
                const rows  = analysis.strikeData.filter(s => Math.abs(s.strike - (type === 'CE' ? analysis.ceWall : analysis.peWall)) <= 150 || Math.abs(s.strike - analysis.ceWall) <= 150 || Math.abs(s.strike - analysis.peWall) <= 150);
                const display = analysis.strikeData.slice(Math.max(0, analysis.strikeData.length / 2 - 3), Math.min(analysis.strikeData.length, analysis.strikeData.length / 2 + 4)).slice(0, 7);
                const maxOI = Math.max(...analysis.strikeData.map(s => Math.max(s.ceOI, s.peOI)), 1);
                return (
                  <div className="space-y-0.5">
                    <div className="flex text-[10px] text-gray-400 mb-0.5">
                      <span className="w-10 text-right mr-1">Strike</span>
                      <span className="flex-1 text-right pr-1">CE OI</span>
                      <span className="w-1" />
                      <span className="flex-1 pl-1">PE OI</span>
                    </div>
                    {display.map(s => {
                      const ceW = Math.round((s.ceOI / maxOI) * 100);
                      const peW = Math.round((s.peOI / maxOI) * 100);
                      const isCeWall = s.strike === analysis.ceWall;
                      const isPeWall = s.strike === analysis.peWall;
                      const isMax    = s.strike === analysis.maxPain;
                      return (
                        <div key={s.strike} className="flex items-center gap-0.5">
                          <span className={`w-10 text-right mr-1 font-mono ${isCeWall ? 'text-red-600 dark:text-red-400 font-bold' : isPeWall ? 'text-green-600 dark:text-green-400 font-bold' : isMax ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                            {s.strike}{isCeWall ? '🚧' : isPeWall ? '🛡️' : isMax ? '🎯' : ''}
                          </span>
                          <div className="flex-1 flex justify-end h-3">
                            <div className="h-full bg-red-400/60 rounded-sm" style={{ width: `${ceW}%` }} title={`CE: ${s.ceOI}`} />
                          </div>
                          <div className="w-px bg-gray-300 dark:bg-white/10 mx-0.5" />
                          <div className="flex-1 h-3">
                            <div className="h-full bg-green-400/60 rounded-sm" style={{ width: `${peW}%` }} title={`PE: ${s.peOI}`} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex text-[10px] text-gray-400 mt-0.5 gap-3 justify-end">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400/60 inline-block" />CE (resistance)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-400/60 inline-block" />PE (support)</span>
                    </div>
                  </div>
                );
              })()}

              {/* Signals */}
              <div className="space-y-1 pt-1 border-t border-purple-200 dark:border-purple-500/20">
                {analysis.signals?.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span>{s.icon}</span>
                    <div>
                      <span className={`font-semibold ${SIGNAL_COLOR[s.type] ?? 'text-gray-500'}`}>{s.tag}: </span>
                      <span className="text-gray-600 dark:text-gray-400">{s.text}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-[10px] text-gray-400 text-right">Max pain ₹{analysis.maxPain} · {analysis.daysToExpiry}d to expiry</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlaceOrderTab
// ─────────────────────────────────────────────────────────────────────────────
function PlaceOrderTab({
  symbol, formSearch, setFormSearch, formSearchResults, formSearching,
  showFormDropdown, setShowFormDropdown, spotPrice, lotSize,
  instrumentType, setInstrumentType, transactionType, setTransactionType,
  productType, setProductType, orderType, setOrderType,
  quantity, setQuantity, price, setPrice, triggerPrice, setTriggerPrice,
  expiryType, setExpiryType,
  optionSymbol, optionTvSymbol, optionLtp, optionStrike, optionExpiry,
  strikeAnalysis, analysisLoading, onRefreshAnalysis,
  orderPlacing, orderResult,
  intel, structureIntel, patternIntel, stationIntel, oiIntel,
  acknowledged, setAcknowledged, dangerModal, setDangerModal, orderWarnings,
  onSymbolSearch, onSymbolSelect, onPlaceOrder, onExecuteOrder, onRunIntel,
  onRunStructure, onRunPattern, onRunStation, onRunOI,
}) {
  const isNFO   = instrumentType === 'CE' || instrumentType === 'PE' || instrumentType === 'FUT';
  const isIndex = INDEX_SYMBOLS.includes(symbol);
  const isOICapable = OI_SYMBOLS.includes(symbol);
  const isFnO   = isIndex || lotSize > 1; // non-FnO EQ stocks return lotSize=1 from NFO API

  const getEstimatedValue = () => {
    const p  = (instrumentType === 'EQ' || instrumentType === 'FUT') ? spotPrice : optionLtp;
    const ep = orderType === 'MARKET' ? p : (parseFloat(price) || p);
    if (!ep || !quantity) return null;
    const notional = ep * parseInt(quantity);
    const margin   = (productType === 'MIS' && instrumentType === 'EQ') ? notional / 5 : notional;
    return margin.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  };

  const verdict  = intel.result?.behavioral?.verdict;
  const canPlace = symbol && (!isNFO || optionSymbol || instrumentType === 'FUT') && quantity > 0 && (verdict !== 'warning' || acknowledged);

  const [mobileIntelTab, setMobileIntelTab] = useState('order'); // 'order' | 'intel'

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">

      {/* Mobile inner tab bar — hidden on md+ */}
      <div className="md:hidden flex border-b border-gray-200 dark:border-white/10 flex-shrink-0 bg-white dark:bg-slate-900/40">
        {[{ id: 'order', label: 'Order Form' }, { id: 'intel', label: 'Intelligence' }].map(t => (
          <button key={t.id} onClick={() => setMobileIntelTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              mobileIntelTab === t.id
                ? 'border-blue-500 text-blue-600 dark:text-white'
                : 'border-transparent text-gray-400 dark:text-white/40'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* ── ORDER FORM (left, fixed 360px on desktop; full-width on mobile) ── */}
      <div className={`${mobileIntelTab !== 'order' ? 'hidden md:block' : ''} w-full md:w-[360px] md:flex-shrink-0 border-r border-gray-200 dark:border-white/10 overflow-y-auto scrollbar-thin p-4 space-y-3 bg-white dark:bg-transparent`}>

        {/* Symbol search */}
        <div className="relative">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Symbol</label>
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2">
            <Search size={13} className="text-gray-400 flex-shrink-0" />
            <input
              value={formSearch}
              onChange={e => { setFormSearch(e.target.value.toUpperCase()); onSymbolSearch(e.target.value); }}
              onFocus={() => formSearchResults.length > 0 && setShowFormDropdown(true)}
              placeholder="Search symbol..."
              className="bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none flex-1 w-0"
            />
            {formSearching && <Loader2 size={13} className="animate-spin text-gray-400 flex-shrink-0" />}
            {symbol && formSearch === symbol && spotPrice && (
              <span className="text-[10px] text-gray-400 flex-shrink-0">
                ₹{parseFloat(spotPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
          {showFormDropdown && formSearchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
              {formSearchResults.map(inst => (
                <button
                  key={inst.symbol}
                  onClick={() => { onSymbolSelect(inst.symbol); setFormSearch(inst.symbol); setShowFormDropdown(false); }}
                  className="w-full px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between transition-colors"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{inst.symbol}</span>
                    <span className="text-xs text-gray-400 ml-2 hidden sm:inline">{inst.name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{inst.exchange}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chart links */}
        {symbol && spotPrice && (
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800/50 rounded-lg px-2 py-1.5 border border-gray-200 dark:border-white/10 self-end w-fit ml-auto">
            <BarChart3 size={12} className="text-gray-400 mr-0.5" />
            <button
              onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`NSE:${symbol}`)}&interval=15`, '_blank')}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 text-xs font-medium px-1.5 py-0.5 hover:bg-blue-500/20 rounded transition-colors flex items-center gap-0.5"
              title="Equity chart"
            >EQ <ExternalLink size={10} /></button>
            {isFnO && (<>
              <button
                onClick={() => { if (instrumentType === 'CE' && optionTvSymbol) window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(optionTvSymbol)}&interval=15`, '_blank'); else setInstrumentType('CE'); }}
                className={`text-xs font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5 ${instrumentType === 'CE' && optionTvSymbol ? 'text-green-600 dark:text-green-400 hover:bg-green-500/20' : 'text-gray-400 dark:text-white/30 hover:text-green-600 dark:hover:text-green-400'}`}
                title={instrumentType === 'CE' && optionTvSymbol ? 'CE option chart' : 'Switch to CE first'}
              >CE <ExternalLink size={10} /></button>
              <button
                onClick={() => { if (instrumentType === 'PE' && optionTvSymbol) window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(optionTvSymbol)}&interval=15`, '_blank'); else setInstrumentType('PE'); }}
                className={`text-xs font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5 ${instrumentType === 'PE' && optionTvSymbol ? 'text-red-600 dark:text-red-400 hover:bg-red-500/20' : 'text-gray-400 dark:text-white/30 hover:text-red-600 dark:hover:text-red-400'}`}
                title={instrumentType === 'PE' && optionTvSymbol ? 'PE option chart' : 'Switch to PE first'}
              >PE <ExternalLink size={10} /></button>
            </>)}
          </div>
        )}

        {/* Spot price */}
        {symbol && spotPrice && (
          <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800/40 rounded-xl px-3 py-2 border border-gray-200 dark:border-white/10">
            <span className="text-xs text-gray-400">Spot LTP</span>
            <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">
              ₹{parseFloat(spotPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Instrument type */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Type</label>
          <div className="grid grid-cols-4 gap-1.5">
            {['EQ', 'CE', 'PE', 'FUT'].map(t => {
              const disabled = !isFnO && t !== 'EQ';
              return (
                <button key={t} onClick={() => !disabled && setInstrumentType(t)}
                  disabled={disabled}
                  title={disabled ? 'Not available for non-FnO stocks' : undefined}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    disabled
                      ? 'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-300 dark:text-white/20 cursor-not-allowed'
                      : instrumentType === t
                        ? t === 'CE' ? 'bg-green-600 text-white'
                          : t === 'PE' ? 'bg-red-600 text-white'
                          : 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/50 hover:text-gray-800 dark:hover:text-white/80'
                  }`}
                >{t}</button>
              );
            })}
          </div>
        </div>

        {/* ATM option strip */}
        {(instrumentType === 'CE' || instrumentType === 'PE') && optionSymbol && (
          <div className="px-3 py-2 bg-gray-100 dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-white/5 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-400">ATM {instrumentType}</span>
              {isIndex && (
                <div className="flex gap-1">
                  {['weekly', 'monthly'].map(e => (
                    <button key={e} onClick={() => setExpiryType(e)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${expiryType === e ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:text-gray-800 dark:hover:text-white/70'}`}>
                      {e === 'weekly' ? 'W' : 'M'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700 dark:text-white/80 truncate mr-2">{optionSymbol}</span>
              <div className="text-right flex-shrink-0">
                <span className={`font-bold ${instrumentType === 'CE' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>₹{optionLtp ?? '--'}</span>
                {optionExpiry && <span className="text-gray-400 ml-2">{optionExpiry}</span>}
              </div>
            </div>
            {optionStrike && <div className="text-gray-400 mt-0.5">Strike ₹{optionStrike}</div>}
          </div>
        )}

        {/* Strike analysis */}
        {(instrumentType === 'CE' || instrumentType === 'PE') && optionStrike && (
          <StrikeAnalysisPanel
            analysis={strikeAnalysis}
            loading={analysisLoading}
            onRefresh={onRefreshAnalysis}
            type={instrumentType}
          />
        )}

        {/* BUY / SELL */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Side</label>
          <div className="grid grid-cols-2 gap-1.5">
            {['BUY', 'SELL'].map(side => (
              <button key={side} onClick={() => setTransactionType(side)}
                className={`py-2 rounded-xl text-sm font-bold transition-colors ${
                  transactionType === side
                    ? side === 'BUY' ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                    : 'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70'
                }`}
              >{side}</button>
            ))}
          </div>
        </div>

        {/* Product type */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Product</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(isNFO ? ['MIS', 'NRML'] : ['MIS', 'CNC']).map(p => (
              <button key={p} onClick={() => setProductType(p)}
                className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  productType === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/50 hover:text-gray-800 dark:hover:text-white/80'
                }`}
              >{p}</button>
            ))}
          </div>
        </div>

        {/* Order type */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Order Type</label>
          <div className="grid grid-cols-4 gap-1.5">
            {['MARKET', 'LIMIT', 'SL', 'SL-M'].map(t => {
              const disabled = isNFO && (t === 'MARKET' || t === 'SL-M');
              return (
                <button key={t} disabled={disabled} onClick={() => !disabled && setOrderType(t)}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    disabled
                      ? 'bg-gray-100 dark:bg-white/3 border border-gray-100 dark:border-white/5 text-gray-300 dark:text-white/20 cursor-not-allowed'
                      : orderType === t
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/50 hover:text-gray-800 dark:hover:text-white/80'
                  }`}
                >{t}</button>
              );
            })}
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
            Quantity {instrumentType !== 'EQ' && lotSize > 1 && <span className="text-gray-300 dark:text-white/25 normal-case font-normal">(lot {lotSize})</span>}
          </label>
          <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min="1"
            className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500/60 transition-colors" />
        </div>

        {/* Price */}
        {(orderType === 'LIMIT' || orderType === 'SL') && (
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Price</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" step="0.05"
              className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500/60 transition-colors" />
          </div>
        )}

        {/* Trigger price */}
        {(orderType === 'SL' || orderType === 'SL-M') && (
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Trigger Price</label>
            <input type="number" value={triggerPrice} onChange={e => setTriggerPrice(e.target.value)} placeholder="0.00" step="0.05"
              className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500/60 transition-colors" />
          </div>
        )}

        {getEstimatedValue() && <p className="text-xs text-gray-400">Est. ₹{getEstimatedValue()}{productType === 'MIS' && instrumentType === 'EQ' && <span className="text-gray-500"> margin (5×)</span>}</p>}

        {/* Warning acknowledge */}
        {verdict === 'warning' && !acknowledged && (
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" onChange={e => setAcknowledged(e.target.checked)} className="mt-0.5 accent-orange-500" />
            <span className="text-xs text-orange-500 dark:text-orange-400">I acknowledge the warning and want to proceed</span>
          </label>
        )}

        {/* Order result banner */}
        {orderResult && (
          <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            orderResult.success ? 'bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-300'
                                : 'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300'
          }`}>
            {orderResult.success
              ? <><CheckCircle size={13} /> Order #{orderResult.order_id} placed successfully</>
              : <><XCircle size={13} /> {orderResult.error}</>
            }
          </div>
        )}

        {/* Place Order button */}
        <button
          onClick={onPlaceOrder}
          disabled={!canPlace || orderPlacing || !symbol}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
            !canPlace || !symbol
              ? 'bg-gray-200 dark:bg-white/5 text-gray-400 dark:text-white/25 cursor-not-allowed'
              : transactionType === 'BUY'
                ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20'
                : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20'
          }`}
        >
          {orderPlacing
            ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Placing...</span>
            : `${transactionType} ${symbol || '---'}`
          }
        </button>
      </div>

      {/* ── INTELLIGENCE PANEL (center, all 5 agents) ── */}
      <div className={`${mobileIntelTab !== 'intel' ? 'hidden md:block' : ''} flex-1 overflow-y-auto scrollbar-thin p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-purple-500 dark:text-purple-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-white">Intelligence</span>
          </div>
          <div className="flex items-center gap-2">
            {symbol && (
              <button onClick={onRunIntel} disabled={intel.loading}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors" title="Re-run behavioral">
                <RefreshCw size={12} className={`text-gray-400 ${intel.loading ? 'animate-spin' : ''}`} />
              </button>
            )}
            {symbol && (
              <Link href={`/orders?symbol=${symbol}&type=${instrumentType}&transaction=${transactionType}`}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 transition-colors" target="_blank">
                Full analysis <ExternalLink size={11} />
              </Link>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <BehavioralPanel intel={intel} symbol={symbol} />

          <AgentPanel
            intel={structureIntel} dataKey="structure"
            icon={Activity} iconClass="text-cyan-500 dark:text-cyan-400"
            title="Structure" subtitle="Market conditions & signals"
            onRun={onRunStructure} disabled={!symbol}
          />
          <AgentPanel
            intel={patternIntel} dataKey="pattern"
            icon={ScanSearch} iconClass="text-emerald-500 dark:text-emerald-400"
            title="Pattern" subtitle="Price action & candlestick setups"
            onRun={onRunPattern} disabled={!symbol}
          />
          <AgentPanel
            intel={stationIntel} dataKey="station"
            icon={Target} iconClass="text-violet-500 dark:text-violet-400"
            title="Station" subtitle="S/R zones — right place to trade?"
            onRun={onRunStation} disabled={!symbol}
          />
          <AgentPanel
            intel={oiIntel} dataKey="oi"
            icon={BarChart3} iconClass="text-orange-500 dark:text-orange-400"
            title="OI Analysis" subtitle="Open interest walls & market activity"
            onRun={onRunOI}
            disabled={!symbol || !isOICapable}
            runLabel={!isOICapable ? 'NIFTY/BANKNIFTY only' : 'Run'}
          />
        </div>
      </div>

      {/* ── DANGER MODAL ── */}
      {dangerModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-red-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <ShieldX size={20} className="text-red-500" />
              <h3 className="text-lg font-bold text-red-500">
                {(orderWarnings?.tier1?.length > 0 || orderWarnings?.hasBehavioralDanger) ? 'Trade Risk Detected' : 'Heads Up'}
              </h3>
            </div>

            <div className="space-y-2 mb-4">
              {/* Tier 1 — blocking risks */}
              {orderWarnings?.tier1?.map((w, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <ShieldX size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-red-600 dark:text-red-400">{w.msg}</span>
                </div>
              ))}
              {/* Behavioral danger */}
              {orderWarnings?.hasBehavioralDanger && (
                <div className="flex items-start gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <ShieldX size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-red-600 dark:text-red-400">Behavioral agent flagged serious risk for this trade</span>
                </div>
              )}
              {/* Tier 2 — soft warnings */}
              {orderWarnings?.tier2?.map((w, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-600 dark:text-amber-400">{w.msg}</span>
                </div>
              ))}
              {/* Fallback if no structured warnings */}
              {!orderWarnings?.tier1?.length && !orderWarnings?.tier2?.length && !orderWarnings?.hasBehavioralDanger && (
                <p className="text-sm text-gray-500 dark:text-white/60">Behavioral analysis flagged serious risk. Are you certain?</p>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setDangerModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={onExecuteOrder}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-bold text-white transition-colors">
                I understand, Place
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TerminalPage
// ─────────────────────────────────────────────────────────────────────────────
export default function TerminalPage() {
  const isVisible = usePageVisibility();

  const [kiteConnected, setKiteConnected]   = useState(false);
  const [indices, setIndices]               = useState(null);

  // Watchlist (2 manual tabs + 1 scanner tab)
  const [watchTab, setWatchTab]             = useState(1);
  const [watchlist1, setWatchlist1]         = useState([]);
  const [watchlist2, setWatchlist2]         = useState([]);
  const [scannerStocks, setScannerStocks]   = useState([]); // [{symbol, scanName, receivedAt}]
  const [scannerLastScan, setScannerLastScan] = useState(null);
  const [watchQuotes, setWatchQuotes]       = useState({});
  const [watchSearch, setWatchSearch]       = useState('');
  const [watchSearchResults, setWatchSearchResults] = useState([]);
  const [watchSearching, setWatchSearching] = useState(false);
  const watchSearchTimer                    = useRef(null);

  // Tabs
  const [activeTab, setActiveTab]           = useState('placeOrder');
  const [mobileTab, setMobileTab]           = useState('trade'); // 'watchlist' | 'trade' | 'orders'

  // Positions / Orders
  const [positions, setPositions]           = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  // Panel orders (right sidebar — always visible)
  const [panelOrders, setPanelOrders]       = useState([]);
  const [panelOrdersLoading, setPanelOrdersLoading] = useState(false);
  const [ordersOpen, setOrdersOpen]         = useState(true);

  // FnO movers (right sidebar)
  const [movers, setMovers]                 = useState({ gainers: [], losers: [] });

  // Order form
  const [symbol, setSymbol]                 = useState('');
  const [spotPrice, setSpotPrice]           = useState(null);
  const [lotSize, setLotSize]               = useState(1);
  const [instrumentType, setInstrumentType] = useState('EQ');
  const [transactionType, setTransactionType] = useState('BUY');
  const [productType, setProductType]       = useState('MIS');
  const [orderType, setOrderType]           = useState('MARKET');
  const [quantity, setQuantity]             = useState(1);
  const [price, setPrice]                   = useState('');
  const [triggerPrice, setTriggerPrice]     = useState('');
  const [expiryType, setExpiryType]         = useState('weekly');

  // ATM option
  const [optionSymbol, setOptionSymbol]     = useState('');
  const [optionTvSymbol, setOptionTvSymbol] = useState('');
  const [optionLtp, setOptionLtp]           = useState(null);
  const [optionStrike, setOptionStrike]     = useState(null);
  const [optionExpiry, setOptionExpiry]     = useState('');
  const [strikeStep, setStrikeStep]         = useState(50);

  // Strike analysis
  const [strikeAnalysis, setStrikeAnalysis]     = useState(null);
  const [analysisLoading, setAnalysisLoading]   = useState(false);

  // Form search
  const [formSearch, setFormSearch]         = useState('');
  const [formSearchResults, setFormSearchResults] = useState([]);
  const [formSearching, setFormSearching]   = useState(false);
  const [showFormDropdown, setShowFormDropdown] = useState(false);
  const formSearchTimer                     = useRef(null);

  // Order placement
  const [orderPlacing, setOrderPlacing]     = useState(false);
  const [orderResult, setOrderResult]       = useState(null);

  // Intelligence (all 5 agents)
  const [intel, setIntel]                   = useState({ loading: false, result: null });
  const [structureIntel, setStructureIntel] = useState({ loading: false, result: null });
  const [patternIntel, setPatternIntel]     = useState({ loading: false, result: null });
  const [stationIntel, setStationIntel]     = useState({ loading: false, result: null });
  const [oiIntel, setOIIntel]               = useState({ loading: false, result: null });
  const [acknowledged, setAcknowledged]     = useState(false);
  const [dangerModal, setDangerModal]       = useState(false);
  const [orderWarnings, setOrderWarnings]   = useState({ tier1: [], tier2: [], hasBehavioralDanger: false });

  // Derived — memoized so useEffect deps get stable references
  const scannerSymbols      = useMemo(() => scannerStocks.map(s => s.symbol), [scannerStocks]);
  const activeWatchlist     = useMemo(
    () => watchTab === 'S' ? scannerSymbols : (watchTab === 1 ? watchlist1 : watchlist2),
    [watchTab, scannerSymbols, watchlist1, watchlist2]
  );
  const setActiveWatchlist  = watchTab === 1 ? setWatchlist1 : setWatchlist2;
  const activeWatchlistKey  = watchTab === 1 ? 'bv-watchlist-1' : watchTab === 2 ? 'bv-watchlist-2' : null;

  // ── Init watchlists from localStorage
  useEffect(() => {
    const s1 = localStorage.getItem('bv-watchlist-1');
    setWatchlist1(s1 ? JSON.parse(s1) : DEFAULT_WATCHLIST_1);
    const s2 = localStorage.getItem('bv-watchlist-2');
    setWatchlist2(s2 ? JSON.parse(s2) : DEFAULT_WATCHLIST_2);
  }, []);

  useEffect(() => { if (watchlist1.length > 0) localStorage.setItem('bv-watchlist-1', JSON.stringify(watchlist1)); }, [watchlist1]);
  useEffect(() => { if (watchlist2.length > 0) localStorage.setItem('bv-watchlist-2', JSON.stringify(watchlist2)); }, [watchlist2]);

  // ── Scanner stocks (from Chartink webhooks)
  const fetchScannerStocks = useCallback(async () => {
    try {
      const r = await fetch('/api/scanner-stocks');
      const d = await r.json();
      if (d.stocks) {
        // Only replace state when the symbol list actually changed — avoids list flicker
        setScannerStocks(prev => {
          const prevKey = prev.map(s => s.symbol).join(',');
          const newKey  = d.stocks.map(s => s.symbol).join(',');
          return prevKey === newKey ? prev : d.stocks;
        });
      }
      if (d.lastScan) setScannerLastScan(d.lastScan);
    } catch {}
  }, []);

  useEffect(() => {
    fetchScannerStocks();
    const iv = setInterval(fetchScannerStocks, 5 * 60_000); // 5 min — matches Chartink scan frequency
    return () => clearInterval(iv);
  }, [fetchScannerStocks]);

  // ── Kite connection
  useEffect(() => {
    fetch('/api/kite-config').then(r => r.json()).then(d => setKiteConnected(d.tokenValid || false)).catch(() => {});
  }, []);

  // ── Market indices
  const fetchIndices = useCallback(async () => {
    try {
      const r = await fetch('/api/market-data');
      const d = await r.json();
      if (d.indices) setIndices(d.indices);
    } catch {}
  }, []);

  useEffect(() => {
    fetchIndices();
    const iv = setInterval(() => { if (isMarketHours() && isVisible) fetchIndices(); }, 60_000);
    return () => clearInterval(iv);
  }, [isVisible, fetchIndices]);

  // ── Watchlist quotes (polls active tab's symbols)
  const fetchWatchQuotes = useCallback(async (symbols) => {
    if (!symbols?.length) return;
    try {
      const r = await fetch(`/api/quotes?symbols=${symbols.join(',')}`);
      const d = await r.json();
      if (d.quotes) {
        const map = {};
        for (const q of d.quotes) map[q.symbol] = q;
        setWatchQuotes(map);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (activeWatchlist.length === 0) return;
    fetchWatchQuotes(activeWatchlist);
    const iv = setInterval(() => { if (isMarketHours() && isVisible) fetchWatchQuotes(activeWatchlist); }, 15_000);
    return () => clearInterval(iv);
  }, [activeWatchlist, isVisible, fetchWatchQuotes]);

  // ── Watchlist tab switch — also clear quotes so stale prices don't show
  useEffect(() => { setWatchQuotes({}); }, [watchTab]);

  // ── Positions
  const fetchPositions = useCallback(async () => {
    setPositionsLoading(true);
    try {
      const r = await fetch('/api/kite-positions');
      const d = await r.json();
      setPositions(d.success ? (d.positions || []) : []);
    } catch { setPositions([]); }
    finally { setPositionsLoading(false); }
  }, []);

  // All non-terminal Kite order statuses (per Kite Connect v3 docs).
  // Terminal states COMPLETE / CANCELLED / REJECTED are excluded.
  const OPEN_STATUSES = new Set([
    'OPEN',                      // active at exchange
    'TRIGGER PENDING',           // SL waiting for trigger price
    'PUT ORDER REQ RECEIVED',    // just placed, backend received
    'VALIDATION PENDING',        // passing RMS validation
    'OPEN PENDING',              // awaiting exchange registration
    'MODIFY PENDING',            // modification awaiting exchange
    'MODIFY VALIDATION PENDING', // modification under RMS review
    'MODIFIED',                  // successfully modified, still open
    'CANCEL PENDING',            // cancellation in progress
    'AMO REQ RECEIVED',          // after-market order received
  ]);

  // ── Panel orders (always-visible right sidebar)
  const fetchPanelOrders = useCallback(async (showLoading = false) => {
    // Only show skeleton on the very first load (when list is empty)
    if (showLoading) setPanelOrdersLoading(true);
    try {
      const r = await fetch('/api/kite-orders?limit=50');
      const d = await r.json();
      const allOrders = d.success ? (d.orders || []) : [];
      const openOrders = allOrders.filter(o => OPEN_STATUSES.has(o.status?.toUpperCase()));
      setPanelOrders(openOrders);
    } catch { /* keep existing list on transient error */ }
    finally { setPanelOrdersLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── FnO movers
  const fetchMovers = useCallback(async () => {
    try {
      const r = await fetch('/api/fno-movers');
      const d = await r.json();
      if (d.gainers || d.losers) setMovers({ gainers: d.gainers || [], losers: d.losers || [] });
    } catch {}
  }, []);

  useEffect(() => {
    fetchMovers();
    const iv = setInterval(() => { if (isMarketHours() && isVisible) fetchMovers(); }, 5 * 60_000);
    return () => clearInterval(iv);
  }, [isVisible, fetchMovers]);

  // Load tab data on switch
  useEffect(() => {
    if (activeTab === 'positions') fetchPositions();
  }, [activeTab, fetchPositions]);

  // Auto-refresh positions tab
  useEffect(() => {
    if (activeTab !== 'positions') return;
    const iv = setInterval(() => { if (isMarketHours() && isVisible) fetchPositions(); }, 15_000);
    return () => clearInterval(iv);
  }, [activeTab, isVisible, fetchPositions]);

  // Panel orders always refreshes (right sidebar is always visible)
  useEffect(() => {
    fetchPanelOrders(true); // show skeleton only on initial mount
    const iv = setInterval(() => { if (isMarketHours() && isVisible) fetchPanelOrders(); }, 30_000);
    return () => clearInterval(iv);
  }, [isVisible, fetchPanelOrders]);

  // ── Watchlist search (debounced)
  useEffect(() => {
    clearTimeout(watchSearchTimer.current);
    if (!watchSearch || watchSearch.length < 1) { setWatchSearchResults([]); return; }
    setWatchSearching(true);
    watchSearchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search-instruments?q=${encodeURIComponent(watchSearch)}&limit=6`);
        const d = await r.json();
        setWatchSearchResults((d.instruments || []).slice(0, 6));
      } catch { setWatchSearchResults([]); }
      finally { setWatchSearching(false); }
    }, 300);
  }, [watchSearch]);

  // ── Form symbol search (debounced)
  const handleFormSearch = useCallback((query) => {
    clearTimeout(formSearchTimer.current);
    if (!query || query.length < 1) { setFormSearchResults([]); setShowFormDropdown(false); return; }
    setFormSearching(true);
    formSearchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search-instruments?q=${encodeURIComponent(query)}&limit=8`);
        const d = await r.json();
        const results = (d.instruments || []).slice(0, 8);
        setFormSearchResults(results);
        setShowFormDropdown(results.length > 0);
      } catch { setFormSearchResults([]); }
      finally { setFormSearching(false); }
    }, 300);
  }, []);

  // ── Select symbol
  const selectSymbol = useCallback(async (sym) => {
    setSymbol(sym);
    setFormSearch(sym);
    setShowFormDropdown(false);
    setFormSearchResults([]);
    setActiveTab('placeOrder');
    setMobileTab('trade');
    setOptionSymbol(''); setOptionTvSymbol(''); setOptionLtp(null); setOptionStrike(null); setOptionExpiry('');
    setOrderResult(null);
    setAcknowledged(false);
    setIntel({ loading: false, result: null });
    setStructureIntel({ loading: false, result: null });
    setPatternIntel({ loading: false, result: null });
    setStationIntel({ loading: false, result: null });
    setOIIntel({ loading: false, result: null });
    setInstrumentType(INDEX_SYMBOLS.includes(sym) ? 'CE' : 'EQ');
    try {
      const r = await fetch(`/api/ltp?symbol=${sym}`);
      const d = await r.json();
      if (d.success && d.ltp) {
        setSpotPrice(d.ltp);
        const ls = d.lotSize && d.lotSize > 1 ? d.lotSize : 1;
        setLotSize(ls);
        const isEQ = !INDEX_SYMBOLS.includes(sym);
        setQuantity(isEQ ? Math.max(1, Math.floor(200000 / d.ltp)) : ls);
      }
    } catch {}
  }, []);

  // ── NFO order type guard
  useEffect(() => {
    const isNFO = instrumentType === 'CE' || instrumentType === 'PE' || instrumentType === 'FUT';
    if (isNFO && (orderType === 'MARKET' || orderType === 'SL-M')) setOrderType('LIMIT');
  }, [instrumentType]);

  // ── Product type guard
  useEffect(() => {
    const isNFO = instrumentType === 'CE' || instrumentType === 'PE' || instrumentType === 'FUT';
    if (instrumentType === 'EQ' && productType === 'NRML') setProductType('MIS');
    else if (isNFO && productType === 'CNC') setProductType('MIS');
  }, [instrumentType]);

  // ── EQ quantity: recompute when product type or instrument type changes
  // MIS → floor(₹2L notional / ltp)  |  CNC → 1
  // spotPrice omitted from deps intentionally — avoid resetting on every price tick
  useEffect(() => {
    if (instrumentType !== 'EQ' || !spotPrice) return;
    setQuantity(productType === 'MIS' ? Math.max(1, Math.floor(200000 / spotPrice)) : 1);
  }, [productType, instrumentType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ATM option auto-fetch
  const fetchOptionDetails = useCallback(async () => {
    if (!symbol || !spotPrice) return;
    try {
      const r = await fetch(`/api/option-details?symbol=${symbol}&spotPrice=${spotPrice}&instrumentType=${instrumentType}&expiryType=${expiryType}`);
      const d = await r.json();
      if (d.optionSymbol) {
        setOptionSymbol(d.optionSymbol);
        setOptionTvSymbol(d.tvSymbol || '');
        setOptionLtp(d.ltp || null);
        setOptionStrike(d.strike || null);
        setOptionExpiry(d.expiryDay || '');
        if (d.step) setStrikeStep(d.step);
        setQuantity(lotSize || 1);
        setStrikeAnalysis(null);
      }
    } catch {}
  }, [symbol, spotPrice, instrumentType, expiryType, lotSize]);

  useEffect(() => {
    if ((instrumentType === 'CE' || instrumentType === 'PE') && symbol && spotPrice) {
      fetchOptionDetails();
    } else {
      setOptionSymbol(''); setOptionTvSymbol(''); setOptionLtp(null); setOptionStrike(null); setOptionExpiry('');
      setStrikeAnalysis(null);
    }
  }, [instrumentType, symbol, spotPrice, expiryType]);

  // ── Strike analysis
  const fetchStrikeAnalysis = useCallback(async () => {
    if (!optionStrike || !symbol || !spotPrice) return;
    setAnalysisLoading(true);
    setStrikeAnalysis(null);
    try {
      const p = new URLSearchParams({ symbol, strike: optionStrike, type: instrumentType, expiryType, strikeGap: strikeStep, spotPrice });
      const r = await fetch(`/api/strike-analysis?${p}`);
      const d = await r.json();
      if (!d.error) setStrikeAnalysis(d);
    } catch {}
    finally { setAnalysisLoading(false); }
  }, [symbol, optionStrike, instrumentType, expiryType, strikeStep, spotPrice]);

  // Auto-run when strike loads
  useEffect(() => {
    if (optionStrike && symbol && spotPrice) fetchStrikeAnalysis();
  }, [optionStrike, fetchStrikeAnalysis]);

  // ── Intelligence helpers
  const buildIntelBody = useCallback((extras = {}) => ({
    symbol,
    exchange: (instrumentType === 'CE' || instrumentType === 'PE' || instrumentType === 'FUT') ? 'NFO' : 'NSE',
    instrumentType, transactionType, spotPrice, productType, ...extras,
  }), [symbol, instrumentType, transactionType, spotPrice, productType]);

  const runIntelligence = useCallback(async () => {
    if (!symbol) return;
    setIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildIntelBody()) });
      setIntel({ loading: false, result: await r.json() });
    } catch { setIntel({ loading: false, result: null }); }
  }, [symbol, buildIntelBody]);

  const runStructureAnalysis = useCallback(async () => {
    if (!symbol) return;
    setStructureIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildIntelBody({ includeStructure: true })) });
      setStructureIntel({ loading: false, result: await r.json() });
    } catch { setStructureIntel({ loading: false, result: null }); }
  }, [symbol, buildIntelBody]);

  const runPatternAnalysis = useCallback(async () => {
    if (!symbol) return;
    setPatternIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildIntelBody({ includePattern: true })) });
      setPatternIntel({ loading: false, result: await r.json() });
    } catch { setPatternIntel({ loading: false, result: null }); }
  }, [symbol, buildIntelBody]);

  const runStationAnalysis = useCallback(async () => {
    if (!symbol) return;
    setStationIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildIntelBody({ includeStation: true })) });
      setStationIntel({ loading: false, result: await r.json() });
    } catch { setStationIntel({ loading: false, result: null }); }
  }, [symbol, buildIntelBody]);

  const runOIAnalysis = useCallback(async () => {
    if (!symbol || !OI_SYMBOLS.includes(symbol)) return;
    setOIIntel({ loading: true, result: null });
    try {
      const r = await fetch('/api/order-intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildIntelBody({ includeOI: true })) });
      setOIIntel({ loading: false, result: await r.json() });
    } catch { setOIIntel({ loading: false, result: null }); }
  }, [symbol, buildIntelBody]);

  // Auto-run behavioral when symbol/type changes
  useEffect(() => {
    if (!symbol) return;
    setAcknowledged(false);
    setStructureIntel({ loading: false, result: null });
    setPatternIntel({ loading: false, result: null });
    setStationIntel({ loading: false, result: null });
    setOIIntel({ loading: false, result: null });
    runIntelligence();
  }, [symbol, transactionType, instrumentType]);

  // ── Watchlist handlers
  const addToWatchlist = (sym) => {
    if (activeWatchlist.includes(sym)) { setWatchSearch(''); setWatchSearchResults([]); return; }
    setActiveWatchlist(prev => [...prev, sym]);
    setWatchSearch(''); setWatchSearchResults([]);
  };
  const removeFromWatchlist = (sym) => setActiveWatchlist(prev => prev.filter(s => s !== sym));

  // ── Order placement
  const executePlaceOrder = async () => {
    if (!symbol) return;
    const isNFO = instrumentType === 'CE' || instrumentType === 'PE' || instrumentType === 'FUT';
    let ts, ex;
    if (instrumentType === 'EQ') { ts = symbol; ex = 'NSE'; }
    else if (instrumentType === 'FUT') {
      const now = new Date();
      ts = `${symbol}${String(now.getFullYear()).slice(-2)}${now.toLocaleString('en-US', { month: 'short' }).toUpperCase()}FUT`; ex = 'NFO';
    } else { ts = optionSymbol; ex = 'NFO'; }

    if (!ts) { setOrderResult({ success: false, error: 'Symbol not resolved. Wait for ATM option to load.' }); return; }

    setOrderPlacing(true); setDangerModal(false); setOrderResult(null);
    try {
      const payload = { variety: 'regular', exchange: ex, tradingsymbol: ts, transaction_type: transactionType, quantity: parseInt(quantity), product: productType, order_type: orderType };
      if (orderType === 'LIMIT' || orderType === 'SL') payload.price = parseFloat(price);
      if (orderType === 'SL' || orderType === 'SL-M') payload.trigger_price = parseFloat(triggerPrice);
      const r = await fetch('/api/place-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (d.success) {
        setOrderResult({ success: true, order_id: d.order_id });
        setPrice(''); setTriggerPrice('');
        setTimeout(() => { fetchPositions(); fetchPanelOrders(); runIntelligence(); }, 1200);
      } else {
        setOrderResult({ success: false, error: d.error || 'Unknown error' });
      }
    } catch { setOrderResult({ success: false, error: 'Network error placing order' }); }
    finally { setOrderPlacing(false); }
  };

  const handlePlaceOrder = () => {
    const tier1 = [];
    const tier2 = [];

    // 1. Trend conflict — EMA9 vs order direction
    const niftyPrice = parseFloat(indices?.nifty);
    const ema9       = parseFloat(indices?.niftyEMA9);
    if (niftyPrice && ema9 && !isNaN(niftyPrice) && !isNaN(ema9)) {
      const marketBias  = niftyPrice > ema9 ? 'BULLISH' : 'BEARISH';
      const orderBullish =
        (transactionType === 'BUY'  && (instrumentType === 'CE' || instrumentType === 'EQ' || instrumentType === 'FUT')) ||
        (transactionType === 'SELL' && instrumentType === 'PE');
      if (marketBias === 'BULLISH' && !orderBullish) {
        tier1.push({ msg: `Market BULLISH (Nifty above EMA9 ${ema9.toFixed(0)}) — you're placing a bearish trade` });
      } else if (marketBias === 'BEARISH' && orderBullish) {
        tier1.push({ msg: `Market BEARISH (Nifty below EMA9 ${ema9.toFixed(0)}) — you're placing a bullish trade` });
      }
    }

    // 2. Adding to loser — check positions for same base symbol with loss
    if (positions?.length > 0) {
      const baseSymbol     = symbol?.replace(/\d.*/, '').toUpperCase();
      const losingPositions = positions.filter(p => {
        const posBase = p.tradingsymbol?.replace(/\d.*/, '').toUpperCase();
        return posBase === baseSymbol && parseFloat(p.pnl) < -500;
      });
      if (losingPositions.length > 0) {
        const totalLoss = losingPositions.reduce((s, p) => s + parseFloat(p.pnl), 0);
        tier1.push({ msg: `Adding to losing position — ${baseSymbol} already at ₹${Math.abs(totalLoss).toLocaleString('en-IN', { maximumFractionDigits: 0 })} loss` });
      }
    }

    // 3. VIX elevated (soft warning)
    const vixVal = parseFloat(indices?.vix);
    if (vixVal > 20) {
      tier2.push({ msg: `VIX ${vixVal.toFixed(1)} — High volatility, consider reducing quantity` });
    }

    const hasBehavioralDanger = intel.result?.behavioral?.verdict === 'danger';
    if (tier1.length > 0 || tier2.length > 0 || hasBehavioralDanger) {
      setOrderWarnings({ tier1, tier2, hasBehavioralDanger });
      setDangerModal(true);
      return;
    }
    executePlaceOrder();
  };

  // ── Render
  return (
    <div className="h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-white flex flex-col overflow-hidden">
      <TopBar indices={indices} kiteConnected={kiteConnected} />

      <div className="flex flex-1 overflow-hidden">
        {/* Watchlist: always visible on md+, mobile-controlled */}
        <div className={`${mobileTab !== 'watchlist' ? 'hidden md:block' : 'block'} flex-shrink-0`}>
          <WatchlistPanel
            watchTab={watchTab} setWatchTab={setWatchTab}
            watchlist={activeWatchlist}
            watchQuotes={watchQuotes}
            watchSearch={watchSearch} setWatchSearch={setWatchSearch}
            watchSearchResults={watchSearchResults} watchSearching={watchSearching}
            onSymbolClick={selectSymbol}
            onAddSymbol={addToWatchlist}
            onRemoveSymbol={removeFromWatchlist}
            activeSymbol={symbol}
            scannerStocks={scannerStocks}
            scannerLastScan={scannerLastScan}
          />
        </div>

        {/* Middle panel: always visible on md+, mobile-controlled */}
        <div className={`${mobileTab !== 'trade' ? 'hidden md:flex' : 'flex'} flex-1 flex-col overflow-hidden border-l border-gray-200 dark:border-white/10`}>
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 dark:border-white/10 flex-shrink-0 bg-white dark:bg-slate-900/40">
            {[{ id: 'positions', label: 'Positions' }, { id: 'placeOrder', label: 'Place Order' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-white'
                    : 'border-transparent text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70'
                }`}
              >{tab.label}</button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'positions' && <PositionsTab positions={positions} loading={positionsLoading} onRefresh={fetchPositions} />}
            {activeTab === 'placeOrder' && (
              <PlaceOrderTab
                symbol={symbol} formSearch={formSearch} setFormSearch={setFormSearch}
                formSearchResults={formSearchResults} formSearching={formSearching}
                showFormDropdown={showFormDropdown} setShowFormDropdown={setShowFormDropdown}
                spotPrice={spotPrice} lotSize={lotSize}
                instrumentType={instrumentType} setInstrumentType={setInstrumentType}
                transactionType={transactionType} setTransactionType={setTransactionType}
                productType={productType} setProductType={setProductType}
                orderType={orderType} setOrderType={setOrderType}
                quantity={quantity} setQuantity={setQuantity}
                price={price} setPrice={setPrice}
                triggerPrice={triggerPrice} setTriggerPrice={setTriggerPrice}
                expiryType={expiryType} setExpiryType={setExpiryType}
                optionSymbol={optionSymbol} optionTvSymbol={optionTvSymbol} optionLtp={optionLtp} optionStrike={optionStrike} optionExpiry={optionExpiry}
                strikeAnalysis={strikeAnalysis} analysisLoading={analysisLoading} onRefreshAnalysis={fetchStrikeAnalysis}
                orderPlacing={orderPlacing} orderResult={orderResult}
                intel={intel} structureIntel={structureIntel} patternIntel={patternIntel} stationIntel={stationIntel} oiIntel={oiIntel}
                acknowledged={acknowledged} setAcknowledged={setAcknowledged}
                dangerModal={dangerModal} setDangerModal={setDangerModal} orderWarnings={orderWarnings}
                onSymbolSearch={handleFormSearch} onSymbolSelect={selectSymbol}
                onPlaceOrder={handlePlaceOrder} onExecuteOrder={executePlaceOrder} onRunIntel={runIntelligence}
                onRunStructure={runStructureAnalysis} onRunPattern={runPatternAnalysis}
                onRunStation={runStationAnalysis} onRunOI={runOIAnalysis}
              />
            )}
          </div>
        </div>

        {/* Orders right panel: always visible on md+, mobile-controlled */}
        <div className={`${mobileTab !== 'orders' ? 'hidden md:block' : 'block'} flex-shrink-0`}>
          <OrdersRightPanel
            orders={panelOrders}
            loading={panelOrdersLoading}
            onRefresh={fetchPanelOrders}
            open={ordersOpen}
            setOpen={setOrdersOpen}
            movers={movers}
          />
        </div>
      </div>

      {/* Mobile bottom nav — hidden on md+ */}
      <nav className="md:hidden flex-shrink-0 flex border-t border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900">
        {[
          { id: 'watchlist', label: 'Watchlist', Icon: BarChart3 },
          { id: 'trade',     label: 'Trade',     Icon: Target    },
          { id: 'orders',    label: 'Orders',    Icon: Activity  },
        ].map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setMobileTab(id)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
              mobileTab === id ? 'text-blue-500' : 'text-gray-400 dark:text-white/30'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
