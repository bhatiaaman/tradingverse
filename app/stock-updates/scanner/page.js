"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft, RefreshCw, ExternalLink, TrendingUp, TrendingDown, BarChart3, Globe, Gauge, Droplets, Clock, Zap, ChevronRight, Eye } from 'lucide-react';
import { nseStrikeSteps } from '@/app/lib/nseStrikeSteps';
import OrderModal from '@/app/components/OrderModal';
import { usePageVisibility } from '@/app/hooks/usePageVisibility';

export default function ScannerPage({ scanName, scanSlug }) {
  const router = useRouter();
  const scannerLabel = scanName ? String(scanName) : null;

  useEffect(() => {
    // intentional no-op; keep quiet in production
  }, [scanName]);

  const [scans, setScans] = useState({ latest: null, history: [] });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [leftWidth, setLeftWidth] = useState(30);
  const [isDragging, setIsDragging] = useState(false);
  const [notification, setNotification] = useState(null);
  const [lastAlertId, setLastAlertId] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [marketData, setMarketData] = useState(null); // Main market data state
  const [showTestForm, setShowTestForm] = useState(false);
  const [testScannerName, setTestScannerName] = useState(scannerLabel || '');
  const [testStocksText, setTestStocksText] = useState('TCS,INFY,RELIANCE');
  const [testPricesText, setTestPricesText] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderStock, setOrderStock] = useState(null);
  const isVisible = usePageVisibility();

  const openOrderModal = (symbol, price, optionType = null, transactionType = 'BUY') => {
    let optionSymbol = null;
    if (optionType) {
      const { ce, pe } = buildOptionSymbols(symbol, price);
      optionSymbol = optionType === 'CE' ? ce : pe;
    }
    setOrderStock({ symbol, price, optionType, optionSymbol, transactionType });
    setOrderModalOpen(true);
  };

  const formatVal = (v, decimals=2) => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return v.toFixed(decimals);
    return String(v);
  };
  
  const containerRef = useRef(null);

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Show notification
  const showNotification = (alertData) => {
    const message = `🔔 New Alert: ${alertData.alertName}`;
    
    // Toast notification
    setNotification(message);
    setTimeout(() => setNotification(null), 5000);
    
    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ChartInk Scanner', {
        body: `${alertData.alertName}\n${alertData.stocks.length} stocks`,
        icon: '/favicon.ico',
        tag: 'chartink-alert'
      });
    }
    
    // Play sound
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2i78OScTgwOUKni77RgGwU7k9jwzn0sBC' );
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch (e) {
      // Ignore audio errors
    }
  };

  const normalize = (s) => String(s || '').toLowerCase().replace(/[-_\s]+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();

  // Fetch scans (optionally filter by scannerLabel from URL)
  useEffect(() => {
    const fetchScans = async () => {
      if (isRefreshing) return; // skip automatic fetch while we're performing a manual refresh
      try {
        const lookupKey = scanSlug || scannerLabel;
        const url = lookupKey
          ? `/api/get-scans?scanner=${encodeURIComponent(lookupKey)}`
          : '/api/get-scans';

        const response = await fetch(url);
        const data = await response.json();

        // Notify if there's a new global latest (only when no scanner filter)
        if (!scannerLabel && data.latest && data.latest.id !== lastAlertId) {
          if (lastAlertId !== null) {
            const parsedData = parseChartInkData(data.latest);
            if (parsedData) showNotification(parsedData);
          }
          setLastAlertId(data.latest.id);
        }

        const matchedLatest = data.latest || null;
        const matchedHistory = Array.isArray(data.history) ? data.history : [];

        setScans({ latest: matchedLatest, history: matchedHistory });
        setLastUpdate(new Date());
        setLoading(false);

        if (matchedLatest) {
          const parsed = parseChartInkData(matchedLatest);
          if (parsed && parsed.stocks.length > 0 && !selectedStock) {
            setSelectedStock(parsed.stocks[0].symbol);
          }
        }
      } catch (error) {
        console.error('Error fetching scans:', error);
        setLoading(false);
      }
    };

    fetchScans();
    const interval = isVisible ? setInterval(fetchScans, 30000) : null;

    return () => clearInterval(interval);
  }, [selectedStock, lastAlertId, scannerLabel, scanSlug,isRefreshing]);

  // Fetch market data
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const response = await fetch('/api/market-data');
        const data = await response.json();
        console.log('Market data fetched:', data);
        setMarketData(data);
      } catch (error) {
        console.error('Failed to fetch market data:', error);
      }
    };

    fetchMarketData();
    // Refresh every 5 minutes
    const interval = isVisible ? setInterval(fetchMarketData, 300000) : null;

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !containerRef.current || isMobile) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
      if (newWidth >= 20 && newWidth <= 50) {
        setLeftWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isMobile]);

  const parseChartInkData = (scan) => {
    if (!scan || !scan.stocks) return null;

    const stocks = Array.isArray(scan.stocks)
      ? scan.stocks.map(s => String(s).trim())
      : String(scan.stocks).split(",").map(s => s.trim());
    const prices = scan.trigger_prices
      ? (Array.isArray(scan.trigger_prices)
          ? scan.trigger_prices.map(p => String(p).trim())
          : String(scan.trigger_prices).split(",").map(p => p.trim()))
      : [];
    
    return {
      alertName: scan.alert_name || 'Unknown Alert',
      scanName: scan.scan_name || 'Scan',
      triggeredAt: scan.triggered_at || "N/A",
      receivedAt: scan.receivedAt || null,
      scanUrl: scan.scan_url,
      stocks: stocks.map((stock, idx) => ({
        symbol: stock,
        price: prices[idx] || 'N/A'
      }))
    };
  };

  const openTradingViewChart = (symbol) => {
    const tvUrl = `https://www.tradingview.com/chart/?symbol=NSE:${symbol}&interval=15`;
    window.open(tvUrl, '_blank');
  };

  //const pad2 = (n) => String(n).padStart(2, '0');

  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

 // ═══════════════════════════════════════════════════════════════════════
// OPTION EXPIRY CALCULATOR WITH NSE HOLIDAY SUPPORT - 2026
// ═══════════════════════════════════════════════════════════════════════
// Rule: If Tuesday (expiry day) is a holiday, expiry moves to PREVIOUS trading day

// NSE Holiday Calendar 2026 (Official)
const NSE_HOLIDAYS_2026 = [
  '2026-01-15', // Thursday - Municipal Corporation Election - Maharashtra
  '2026-01-26', // Monday - Republic Day
  '2026-03-03', // Tuesday - Holi ← WEEKLY EXPIRY affected
  '2026-03-26', // Thursday - Shri Ram Navami
  '2026-03-31', // Tuesday - Shri Mahavir Jayanti ← MONTHLY EXPIRY affected
  '2026-04-03', // Friday - Good Friday
  '2026-04-14', // Tuesday - Dr. Baba Saheb Ambedkar Jayanti ← WEEKLY EXPIRY affected
  '2026-05-01', // Friday - Maharashtra Day
  '2026-05-28', // Thursday - Bakri Id
  '2026-06-26', // Friday - Muharram
  '2026-09-14', // Monday - Ganesh Chaturthi
  '2026-10-02', // Friday - Mahatma Gandhi Jayanti
  '2026-10-20', // Tuesday - Dussehra ← WEEKLY EXPIRY affected
  '2026-11-10', // Tuesday - Diwali-Balipratipada ← WEEKLY EXPIRY affected
  '2026-11-24', // Tuesday - Prakash Gurpurb Sri Guru Nanak Dev ← MONTHLY EXPIRY affected
  '2026-12-25', // Friday - Christmas
];

// Helper: pad numbers
const pad2 = (n) => String(n).padStart(2, '0');

// Check if a date is NSE holiday
const isNSEHoliday = (date) => {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const dateStr = `${year}-${month}-${day}`;
  return NSE_HOLIDAYS_2026.includes(dateStr);
};

// Check if a date is weekend (Saturday or Sunday)
const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday=0, Saturday=6
};

// Check if a date is a trading day
const isTradingDay = (date) => {
  return !isWeekend(date) && !isNSEHoliday(date);
};

// Get previous trading day (skip weekends and holidays)
const getPreviousTradingDay = (date) => {
  let d = new Date(date);
  d.setDate(d.getDate() - 1);
  
  // Keep going back until we find a trading day
  while (!isTradingDay(d)) {
    d.setDate(d.getDate() - 1);
  }
  
  return d;
};

// Get last Tuesday of month (accounting for holidays)
const getLastTuesdayExpiry = (date = new Date()) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let year = date.getFullYear();
  let month = date.getMonth();
  
  // Get last Tuesday of current month
  let lastDay = new Date(year, month + 1, 0); // Last day of month
  while (lastDay.getDay() !== 2) { // Tuesday = 2
    lastDay.setDate(lastDay.getDate() - 1);
  }
  
  // If that Tuesday is a holiday, move to previous trading day
  if (!isTradingDay(lastDay)) {
    console.log(`Last Tuesday ${lastDay.toDateString()} is a holiday, moving to previous trading day`);
    lastDay = getPreviousTradingDay(lastDay);
  }
  
  // If expiry has passed, move to next month
  if (lastDay < today) {
    month = month + 1;
    if (month > 11) {
      month = 0;
      year = year + 1;
    }
    
    // Get last Tuesday of next month
    lastDay = new Date(year, month + 1, 0);
    while (lastDay.getDay() !== 2) {
      lastDay.setDate(lastDay.getDate() - 1);
    }
    
    // Check if it's a holiday
    if (!isTradingDay(lastDay)) {
      console.log(`Last Tuesday ${lastDay.toDateString()} is a holiday, moving to previous trading day`);
      lastDay = getPreviousTradingDay(lastDay);
    }
  }
  
  return lastDay;
};

// For TradingView format: YYMMDD (e.g., 260330 for March 30, 2026)
const getLastTuesdayExpiryYYMMDD = (date = new Date()) => {
  const d = getLastTuesdayExpiry(date);
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yy}${mm}${dd}`;
};

// Build option symbols for TradingView charts
const buildOptionSymbols = (symbol, price) => {
  const expiry = getLastTuesdayExpiryYYMMDD();
  
  // Parse price - handle 'N/A' and invalid values
  const numPrice = parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0;
  
  // If no valid price, return null symbols
  if (numPrice <= 0) {
    return { ce: null, pe: null, ceStrike: 0, peStrike: 0 };
  }
  
  // Get strike step from NSE data or fallback to price-based heuristic
  let step = nseStrikeSteps[symbol];
  if (!step) {
    if (numPrice >= 5000) step = 100;
    else if (numPrice >= 1000) step = 50;
    else if (numPrice >= 300) step = 20;
    else step = 10;
  }

  const ceStrike = Math.ceil(numPrice / step) * step;
  const peStrike = Math.floor(numPrice / step) * step;

  // TradingView format: SYMBOL + YYMMDD + C/P + STRIKE
  const ce = `${symbol}${expiry}C${ceStrike}`;
  const pe = `${symbol}${expiry}P${peStrike}`;
  return { ce, pe, ceStrike, peStrike };
};



  const openOptionChart = (symbol, type, strike, price) => {
    // type: 'CE' or 'PE' -> convert to 'C' or 'P' for TradingView
    const expiry = getLastTuesdayExpiryYYMMDD();
    let step = nseStrikeSteps[symbol];
    if (!step) {
      const p = Number(price) || 0;
      if (p >= 5000) step = 100;
      else if (p >= 1000) step = 50;
      else if (p >= 300) step = 20;
      else step = 10;
    }
    const strikeVal = strike || (type === 'CE' ? Math.ceil((Number(price) || 0) / step) * step : Math.floor((Number(price) || 0) / step) * step);
    const optType = type === 'CE' ? 'C' : 'P';
    const sym = `${symbol}${expiry}${optType}${strikeVal}`;
    window.open(`https://www.tradingview.com/chart/?symbol=NSE:${sym}&interval=15`, '_blank');
  };

  const sendTestWebhook = async () => {
    const scanner = (testScannerName && testScannerName.trim()) || scannerLabel || 'test-scan';
    const stocks = testStocksText.split(',').map(s => s.trim()).filter(Boolean);
    const prices = testPricesText ? testPricesText.split(',').map(p => p.trim()) : [];

    const sample = {
      alert_name: `${scanner} Test`,
      scan_name: scanner,
      triggered_at: new Date().toISOString(),
      stocks: stocks,
      trigger_prices: prices,
      scan_url: scanSlug || String(scanner).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    };

    try {
      const res = await fetch('/api/chartink-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sample)
      });

      if (res.ok) {
        setNotification('Test webhook sent');
        setTimeout(() => setNotification(null), 3500);
        // close form after send
        setShowTestForm(false);

        // Immediately refresh scanner-specific scans so UI updates without waiting for poll
        try {
          const refreshUrl = sample.scan_url
            ? `/api/get-scans?scanner=${encodeURIComponent(sample.scan_url)}`
            : scannerLabel
              ? `/api/get-scans?scanner=${encodeURIComponent(scannerLabel)}`
              : '/api/get-scans';

          const resp = await fetch(refreshUrl);
          const data = await resp.json();

          const matchedLatest = data.latest || null;
          const matchedHistory = Array.isArray(data.history) ? data.history : [];

          setScans({ latest: matchedLatest, history: matchedHistory });
          if (data.latest && data.latest.id) setLastAlertId(data.latest.id);
          if (matchedLatest) {
            const parsed = parseChartInkData(matchedLatest);
            if (parsed && parsed.stocks.length > 0) setSelectedStock(parsed.stocks[0].symbol);
          }
        } catch (e) {
          console.error('Failed to refresh scans after test webhook', e);
        }
      } else {
        setNotification('Failed to send test webhook');
        setTimeout(() => setNotification(null), 3500);
      }
    } catch (err) {
      console.error('Test webhook error', err);
      setNotification('Error sending test webhook');
      setTimeout(() => setNotification(null), 3500);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-xl text-white">Loading scanner data...</div>
      </div>
    );
  }

  const latestData = scans.latest ? parseChartInkData(scans.latest) : null;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl shadow-green-500/25 flex items-center gap-3 border border-green-400/20">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="text-lg">🔔</span>
            </div>
            <span className="font-medium text-sm">{notification}</span>
          </div>
        </div>
      )}

      <div className="container mx-auto px-2 sm:px-4 py-4 max-w-full">
        {/* Modern Header */}
        <header className="mb-6">
          <div className="bg-gradient-to-r from-slate-800/80 to-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/trades')}
                  className="flex items-center justify-center w-10 h-10 bg-slate-700/50 hover:bg-slate-600/50 rounded-xl transition-all duration-200 text-slate-300 hover:text-white hover:scale-105"
                  title="Go back to trades"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📊</span>
                    <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                      {scannerLabel || 'ChartInk Scanner'}
                    </h1>
                  </div>
                  {lastUpdate && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <p className="text-slate-400 text-xs">
                        Live · Updated {lastUpdate.toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowTestForm(!showTestForm)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/50 rounded-xl text-indigo-300 text-sm font-medium transition-all duration-200 hover:scale-105"
                  title="Configure test webhook"
                >
                  <Zap size={16} />
                  <span className="hidden sm:inline">Test</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {showTestForm && (
          <div className="mb-6 p-4 bg-gradient-to-r from-slate-800/80 to-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-indigo-400" />
              <span className="text-sm font-medium text-white">Test Webhook</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={testScannerName}
                onChange={(e) => setTestScannerName(e.target.value)}
                placeholder="Scanner name"
                className="flex-1 bg-slate-900/50 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              />
              <input
                value={testStocksText}
                onChange={(e) => setTestStocksText(e.target.value)}
                placeholder="Stocks (e.g. TCS, INFY)"
                className="flex-1 bg-slate-900/50 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              />
            </div>
            <div className="flex items-center gap-3 mt-3">
              <input
                value={testPricesText}
                onChange={(e) => setTestPricesText(e.target.value)}
                placeholder="Trigger prices (optional)"
                className="flex-1 bg-slate-900/50 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              />
              <button
                onClick={sendTestWebhook}
                className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 rounded-xl text-white text-sm font-medium shadow-lg shadow-green-500/25 transition-all duration-200 hover:scale-105"
              >
                Send
              </button>
              <button
                onClick={() => setShowTestForm(false)}
                className="px-5 py-2.5 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 rounded-xl text-slate-300 text-sm font-medium transition-all duration-200"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {latestData ? (
          <>
            {/* Desktop Layout */}
            {!isMobile ? (
              <div 
                ref={containerRef}
                className="flex gap-0 h-[calc(100vh-180px)] relative"
              >
                {/* Left Panel - Stock List */}
                <div 
                  className="bg-gradient-to-b from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-l-2xl border border-slate-700/50 overflow-hidden flex flex-col shadow-xl"
                  style={{ width: `${leftWidth}%` }}
                >
                  {/* Alert Header */}
                  <div className="p-4 border-b border-slate-700/50 bg-gradient-to-r from-slate-800/50 to-transparent">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <h2 className="text-lg font-bold text-white truncate">
                            {latestData?.alertName || scannerLabel || 'ChartInk Alert'}
                          </h2>
                        </div>
                        {latestData.scanUrl && (
                          <a 
                            href={`https://chartink.com/screener/${latestData.scanUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
                          >
                            <ExternalLink size={12} />
                            View on ChartInk
                          </a>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                          <Clock size={12} />
                          <span>{latestData.triggeredAt}</span>
                        </div>
                        <div className="mt-2 px-2.5 py-1 bg-blue-500/20 rounded-lg">
                          <span className="text-blue-300 text-sm font-bold">{latestData.stocks.length}</span>
                          <span className="text-blue-400/70 text-xs ml-1">stocks</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stock List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-2 space-y-1">
                      {latestData.stocks.map((stock, idx) => (
                        <div 
                          key={idx}
                          onClick={() => setSelectedStock(stock.symbol)}
                          className={`group p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                            selectedStock === stock.symbol 
                              ? 'bg-gradient-to-r from-blue-500/20 to-indigo-500/10 border border-blue-500/30 shadow-lg shadow-blue-500/10' 
                              : 'bg-slate-800/30 hover:bg-slate-700/50 border border-transparent hover:border-slate-600/50'
                          }`}
                        >
                          {/* Stock Header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 text-xs font-mono w-5">{idx + 1}</span>
                              <span className={`font-bold text-base ${selectedStock === stock.symbol ? 'text-blue-300' : 'text-green-400'}`}>
                                {stock.symbol}
                              </span>
                            </div>
                            <span className="text-white font-mono text-sm font-medium bg-slate-700/50 px-2 py-0.5 rounded-lg">
                              ₹{stock.price}
                            </span>
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Chart Buttons */}
                            <div className="flex items-center gap-1 bg-slate-900/50 rounded-lg px-2 py-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); openTradingViewChart(stock.symbol); }}
                                className="text-blue-400 hover:text-blue-300 text-xs px-1.5 py-0.5 hover:bg-blue-500/20 rounded transition-colors"
                                title="Stock Chart"
                              >
                                📊
                              </button>
                              <button
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  const { ce } = buildOptionSymbols(stock.symbol, stock.price); 
                                  if (ce) {
                                    window.open(`https://www.tradingview.com/chart/?symbol=NSE:${ce}&interval=15`, '_blank'); 
                                  } else {
                                    alert(`No valid price for ${stock.symbol}. Cannot open CE chart.`);
                                  }
                                }}
                                className="text-amber-400 hover:text-amber-300 text-xs font-medium px-1.5 py-0.5 hover:bg-amber-500/20 rounded transition-colors"
                                title="CE Chart"
                              >
                                CE
                              </button>
                              <button
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  const { pe } = buildOptionSymbols(stock.symbol, stock.price); 
                                  if (pe) {
                                    window.open(`https://www.tradingview.com/chart/?symbol=NSE:${pe}&interval=15`, '_blank'); 
                                  } else {
                                    alert(`No valid price for ${stock.symbol}. Cannot open PE chart.`);
                                  }
                                }}
                                className="text-rose-400 hover:text-rose-300 text-xs font-medium px-1.5 py-0.5 hover:bg-rose-500/20 rounded transition-colors"
                                title="PE Chart"
                              >
                                PE
                              </button>
                            </div>

                            {/* Order Group */}
                            <div className="flex items-center gap-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/10 rounded-lg px-2 py-1 border border-indigo-500/20">
                              <span className="text-indigo-400 text-xs mr-1">🛒</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); openOrderModal(stock.symbol, stock.price, null, 'BUY'); }}
                                className="text-indigo-300 hover:text-indigo-200 text-xs font-semibold px-1.5 py-0.5 hover:bg-indigo-500/20 rounded transition-colors"
                                title="Order Equity"
                              >
                                EQ
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openOrderModal(stock.symbol, stock.price, 'CE', 'BUY'); }}
                                className="text-amber-400 hover:text-amber-300 text-xs font-semibold px-1.5 py-0.5 hover:bg-indigo-500/20 rounded transition-colors"
                                title="Order CE Option"
                              >
                                CE
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openOrderModal(stock.symbol, stock.price, 'PE', 'BUY'); }}
                                className="text-rose-400 hover:text-rose-300 text-xs font-semibold px-1.5 py-0.5 hover:bg-indigo-500/20 rounded transition-colors"
                                title="Order PE Option"
                              >
                                PE
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Resizer */}
                <div 
                  className="w-1.5 bg-slate-700/50 hover:bg-blue-500 cursor-col-resize transition-all duration-200 relative group hover:w-2"
                  onMouseDown={() => setIsDragging(true)}
                >
                  <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-blue-500/20"></div>
                </div>

                {/* Right Panel */}
                <div 
                  className="bg-gradient-to-b from-slate-800/50 to-slate-900/90 backdrop-blur-xl rounded-r-2xl border border-slate-700/50 overflow-hidden flex flex-col shadow-xl"
                  style={{ width: `${100 - leftWidth}%` }}
                >
                  {/* Compact Market Data Strip */}
                  <div className="p-3 bg-gradient-to-r from-slate-800/80 to-slate-900/50 border-b border-slate-700/50">
                    <div className="flex flex-wrap gap-3 justify-center lg:justify-between">
                      {/* Nifty */}
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 rounded-xl border border-slate-700/30">
                        <BarChart3 size={14} className="text-blue-400" />
                        <span className="text-slate-400 text-xs">NIFTY</span>
                        <span className="text-white font-mono text-sm font-medium">{marketData?.indices?.nifty || '---'}</span>
                        {marketData?.indices?.niftyChange && (
                          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                            parseFloat(marketData.indices.niftyChange) >= 0 
                              ? 'text-green-400 bg-green-500/10' 
                              : 'text-red-400 bg-red-500/10'
                          }`}>
                            {parseFloat(marketData.indices.niftyChange) >= 0 ? '+' : ''}{marketData.indices.niftyChange}
                          </span>
                        )}
                      </div>
                      
                      {/* Bank Nifty */}
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 rounded-xl border border-slate-700/30">
                        <span className="text-slate-400 text-xs">BNIFTY</span>
                        <span className="text-white font-mono text-sm font-medium">{marketData?.indices?.bankNifty || '---'}</span>
                      </div>
                      
                      {/* VIX */}
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 rounded-xl border border-orange-500/20">
                        <Gauge size={14} className="text-orange-400" />
                        <span className="text-orange-300 text-xs">VIX</span>
                        <span className="text-orange-400 font-mono text-sm font-medium">{marketData?.indices?.vix || '---'}</span>
                      </div>

                      {/* Sentiment */}
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                        marketData?.sentiment?.bias === 'Bullish' 
                          ? 'bg-green-500/10 border-green-500/20' 
                          : marketData?.sentiment?.bias === 'Bearish'
                            ? 'bg-red-500/10 border-red-500/20'
                            : 'bg-slate-900/50 border-slate-700/30'
                      }`}>
                        {marketData?.sentiment?.bias === 'Bullish' ? (
                          <TrendingUp size={14} className="text-green-400" />
                        ) : marketData?.sentiment?.bias === 'Bearish' ? (
                          <TrendingDown size={14} className="text-red-400" />
                        ) : (
                          <Gauge size={14} className="text-slate-400" />
                        )}
                        <span className={`text-xs font-medium ${
                          marketData?.sentiment?.bias === 'Bullish' ? 'text-green-400' :
                          marketData?.sentiment?.bias === 'Bearish' ? 'text-red-400' :
                          'text-slate-400'
                        }`}>
                          {marketData?.sentiment?.bias || 'Neutral'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-1 overflow-hidden">
                    {/* Centre Section */}
                    <div className="flex-1 flex flex-col bg-gradient-to-b from-slate-900/50 to-slate-900">
                      {/* Selected Stock Header */}
                      {selectedStock && (
                        <div className="p-4 border-b border-slate-700/50 bg-gradient-to-r from-blue-500/10 to-transparent">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                {selectedStock.slice(0, 2)}
                              </div>
                              <div>
                                <h3 className="text-xl font-bold text-white">{selectedStock}</h3>
                                <p className="text-slate-400 text-xs">NSE • {latestData?.alertName}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=NSE:${selectedStock}&interval=15`, '_blank')}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-300 text-sm font-medium transition-all hover:scale-105"
                              >
                                <Eye size={16} />
                                Chart
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex-1 flex flex-col overflow-y-auto p-4">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-2xl p-4 border border-blue-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                <Zap size={16} className="text-blue-400" />
                              </div>
                              <span className="text-slate-400 text-xs">Current Scan</span>
                            </div>
                            <p className="text-3xl font-bold text-blue-400">{latestData.stocks.length}</p>
                            <p className="text-blue-400/60 text-xs mt-1">stocks detected</p>
                          </div>
                          
                          <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-2xl p-4 border border-emerald-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                                <BarChart3 size={16} className="text-emerald-400" />
                              </div>
                              <span className="text-slate-400 text-xs">Avg (20 scans)</span>
                            </div>
                            <p className="text-3xl font-bold text-emerald-400">
                              {scans.history && scans.history.length > 0
                                ? (
                                    scans.history.slice(0, 20).reduce((sum, scan) => {
                                      const parsed = parseChartInkData(scan);
                                      return sum + (parsed ? parsed.stocks.length : 0);
                                    }, latestData.stocks.length) / Math.min(scans.history.length + 1, 21)
                                  ).toFixed(1)
                                : latestData.stocks.length
                              }
                            </p>
                            <p className="text-emerald-400/60 text-xs mt-1">stocks per scan</p>
                          </div>
                        </div>

                        {/* Chart: Last 10 Scans */}
                        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/30 mb-4">
                          <p className="text-slate-300 text-sm font-medium mb-3 flex items-center gap-2">
                            <BarChart3 size={14} className="text-blue-400" />
                            Scan Trend
                          </p>
                          <ResponsiveContainer width="100%" height={160}>
                            <LineChart data={(() => {
                              const chartData = [];
                              const allScans = [scans.latest, ...scans.history].filter(Boolean);
                              const recentScans = allScans.slice(0, 10);
                              
                              for (const scan of recentScans.reverse()) {
                                const parsed = parseChartInkData(scan);
                                if (parsed) {
                                  let timeLabel = parsed.triggeredAt;
                                  if (typeof timeLabel === 'string') {
                                    if (timeLabel.includes('T')) {
                                      const d = new Date(timeLabel);
                                      timeLabel = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                                    }
                                    // Truncate if too long
                                    if (timeLabel.length > 10) timeLabel = timeLabel.slice(0, 10);
                                  }
                                  
                                  chartData.push({
                                    time: timeLabel,
                                    count: parsed.stocks.length
                                  });
                                }
                              }
                              return chartData.length > 0 ? chartData : [{ time: 'N/A', count: latestData.stocks.length }];
                            })()}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                              <XAxis dataKey="time" stroke="#94a3b8" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 10 }} />
                              <YAxis stroke="#94a3b8" label={{ value: 'Stocks', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
                              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '0.5rem' }} />
                              <Line type="monotone" dataKey="count" stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 4 }} activeDot={{ r: 6 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Quick Links - when no stock selected */}
                        {!selectedStock && (
                          <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                              <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <ChevronRight size={32} className="text-slate-600" />
                              </div>
                              <p className="text-slate-400 text-sm">Select a stock from the list</p>
                              <p className="text-slate-500 text-xs mt-1">to view details and trade</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Action Sidebar */}
                    <div className="hidden lg:flex w-44 bg-gradient-to-b from-slate-800/50 to-slate-900 flex-col items-center py-4 gap-2 overflow-y-auto px-3 border-l border-slate-700/30">
                      <p className="text-slate-500 text-xs font-medium mb-2 w-full">Quick Links</p>
                      {selectedStock ? (
                        <>
                          <button
                            onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=NSE:${selectedStock}&interval=15`, '_blank')}
                            className="w-full flex items-center gap-2 px-3 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                          >
                            <span>📊</span> TradingView
                          </button>
                          
                          <button
                            onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=BSE:${selectedStock}&interval=15`, '_blank')}
                            className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/30 text-slate-300 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                          >
                            <span>📋</span> TV BSE
                          </button>
                          
                          <button
                            onClick={() => window.open(`https://www.google.com/finance/quote/${selectedStock}:NSE`, '_blank')}
                            className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/30 text-slate-300 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                          >
                            <span>💹</span> Google
                          </button>
                          
                          <button
                            onClick={() => window.open(`https://chartink.com/stocks/${selectedStock.toLowerCase()}.html`, '_blank')}
                            className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/30 text-slate-300 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                          >
                            <span>📈</span> ChartInk
                          </button>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-slate-500 text-xs text-center">Select a stock</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Mobile Layout */
              <div className="space-y-4">
                {/* Alert Header Card */}
                <div className="bg-gradient-to-r from-slate-800/80 to-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <h2 className="text-lg font-bold text-white">
                          {latestData?.alertName || scannerLabel || 'ChartInk Alert'}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 text-xs">
                        <Clock size={12} />
                        <span>{latestData.triggeredAt}</span>
                      </div>
                    </div>
                    <div className="px-3 py-1.5 bg-blue-500/20 rounded-xl">
                      <span className="text-blue-300 text-lg font-bold">{latestData.stocks.length}</span>
                      <span className="text-blue-400/70 text-xs ml-1">stocks</span>
                    </div>
                  </div>
                  {latestData.scanUrl && (
                    <a 
                      href={`https://chartink.com/screener/${latestData.scanUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs mt-3 font-medium"
                    >
                      <ExternalLink size={12} />
                      View on ChartInk
                    </a>
                  )}
                </div>

                {/* Compact Market Strip Mobile */}
                <div className="flex flex-wrap gap-2 justify-center">
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 rounded-xl border border-slate-700/50">
                    <span className="text-slate-400 text-xs">NIFTY</span>
                    <span className="text-white font-mono text-sm">{marketData?.indices?.nifty || '---'}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 rounded-xl border border-orange-500/20">
                    <span className="text-orange-300 text-xs">VIX</span>
                    <span className="text-orange-400 font-mono text-sm">{marketData?.indices?.vix || '---'}</span>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                    marketData?.sentiment?.bias === 'Bullish' 
                      ? 'bg-green-500/10 border-green-500/20' 
                      : marketData?.sentiment?.bias === 'Bearish'
                        ? 'bg-red-500/10 border-red-500/20'
                        : 'bg-slate-800/80 border-slate-700/50'
                  }`}>
                    <span className={`text-xs font-medium ${
                      marketData?.sentiment?.bias === 'Bullish' ? 'text-green-400' :
                      marketData?.sentiment?.bias === 'Bearish' ? 'text-red-400' :
                      'text-slate-400'
                    }`}>
                      {marketData?.sentiment?.bias || 'Neutral'}
                    </span>
                  </div>
                </div>

                {/* Mobile Stock Cards */}
                <div className="space-y-2">
                  {latestData.stocks.map((stock, idx) => (
                    <div 
                      key={idx}
                      className="bg-gradient-to-r from-slate-800/80 to-slate-800/40 backdrop-blur-xl rounded-xl border border-slate-700/50 p-3"
                    >
                      {/* Stock Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 text-xs font-mono w-5">{idx + 1}</span>
                          <span className="font-bold text-green-400 text-base">{stock.symbol}</span>
                        </div>
                        <span className="text-white font-mono text-sm font-medium bg-slate-700/50 px-2.5 py-1 rounded-lg">
                          ₹{stock.price}
                        </span>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Chart Buttons */}
                        <div className="flex items-center gap-1 bg-slate-900/50 rounded-lg px-2 py-1.5">
                          <button
                            onClick={() => openTradingViewChart(stock.symbol)}
                            className="text-blue-400 active:text-blue-300 text-xs px-2 py-0.5"
                            title="Stock Chart"
                          >
                            📊
                          </button>
                          <button
                            onClick={() => { 
                              const { ce } = buildOptionSymbols(stock.symbol, stock.price); 
                              if (ce) {
                                window.open(`https://www.tradingview.com/chart/?symbol=NSE:${ce}&interval=15`, '_blank'); 
                              } else {
                                alert(`No valid price for ${stock.symbol}. Cannot open CE chart.`);
                              }
                            }}
                            className="text-amber-400 active:text-amber-300 text-xs font-medium px-2 py-0.5"
                            title="CE Chart"
                          >
                            CE
                          </button>
                          <button
                            onClick={() => { 
                              const { pe } = buildOptionSymbols(stock.symbol, stock.price); 
                              if (pe) {
                                window.open(`https://www.tradingview.com/chart/?symbol=NSE:${pe}&interval=15`, '_blank'); 
                              } else {
                                alert(`No valid price for ${stock.symbol}. Cannot open PE chart.`);
                              }
                            }}
                            className="text-rose-400 active:text-rose-300 text-xs font-medium px-2 py-0.5"
                            title="PE Chart"
                          >
                            PE
                          </button>
                        </div>

                        {/* Order Group */}
                        <div className="flex items-center gap-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/10 rounded-lg px-2 py-1.5 border border-indigo-500/20">
                          <span className="text-indigo-400 text-xs mr-1">🛒</span>
                          <button
                            onClick={() => openOrderModal(stock.symbol, stock.price, null, 'BUY')}
                            className="text-indigo-300 active:text-indigo-200 text-xs font-semibold px-1.5"
                            title="Order Equity"
                          >
                            EQ
                          </button>
                          <button
                            onClick={() => openOrderModal(stock.symbol, stock.price, 'CE', 'BUY')}
                            className="text-amber-400 active:text-amber-300 text-xs font-semibold px-1.5"
                            title="Order CE Option"
                          >
                            CE
                          </button>
                          <button
                            onClick={() => openOrderModal(stock.symbol, stock.price, 'PE', 'BUY')}
                            className="text-rose-400 active:text-rose-300 text-xs font-semibold px-1.5"
                            title="Order PE Option"
                          >
                            PE
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedStock && (
                  <div className="bg-gradient-to-r from-slate-800/80 to-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Eye size={14} className="text-blue-400" />
                      Quick Links
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=NSE:${selectedStock}`, '_blank')}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 rounded-xl text-xs font-medium"
                      >
                        📊 TradingView
                      </button>
                      <button
                        onClick={() => window.open(`https://www.google.com/finance/quote/${selectedStock}:NSE`, '_blank')}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/30 text-slate-300 rounded-xl text-xs font-medium"
                      >
                        💹 Google
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* History Section */}
            {scans.history.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={18} className="text-slate-400" />
                  <h2 className="text-lg font-semibold text-white">
                    Previous Alerts
                  </h2>
                  <span className="text-slate-500 text-sm">({Math.max(scans.history.length - 1, 0)})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {scans.history.slice(1).map((scan) => {
                    const data = parseChartInkData(scan);
                    if (!data) return null;
                    
                    return (
                      <div 
                        key={scan.id} 
                        className="group bg-gradient-to-r from-slate-800/60 to-slate-800/30 border border-slate-700/50 rounded-xl p-3 hover:border-blue-500/30 hover:bg-slate-800/80 cursor-pointer transition-all duration-200"
                        onClick={() => {
                          setScans({ ...scans, latest: scan });
                          if (data.stocks.length > 0) {
                            setSelectedStock(data.stocks[0].symbol);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-white text-sm truncate group-hover:text-blue-300 transition-colors">
                            {data.alertName}
                          </span>
                          <ChevronRight size={14} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                        </div>
                        <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                          <Clock size={10} />
                          <span>{data.triggeredAt}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-green-400 text-xs">
                            {data.stocks.slice(0, 3).map(s => s.symbol).join(', ')}
                          </span>
                          {data.stocks.length > 3 && (
                            <span className="text-slate-500 text-xs bg-slate-700/50 px-1.5 py-0.5 rounded">+{data.stocks.length - 3}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="bg-gradient-to-r from-slate-800/80 to-slate-800/40 backdrop-blur-xl rounded-2xl p-8 sm:p-12 text-center border border-slate-700/50 shadow-xl max-w-md">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <RefreshCw size={32} className="text-blue-400 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Waiting for Scanner Data</h3>
              <p className="text-slate-400 text-sm mb-4">
                Scanner alerts will appear here once received
              </p>
              <div className="bg-slate-900/50 rounded-xl p-3 text-xs text-slate-500">
                <span className="text-slate-400">Webhook URL:</span><br />
                <code className="text-blue-400">bhatiaverse.com/api/chartink-webhook</code>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(30, 41, 59, 0.5);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(71, 85, 105, 0.8);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.9);
        }
        .animate-in {
          animation: animate-in 0.3s ease-out;
        }
        @keyframes animate-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .slide-in-from-top {
          animation-name: slide-in-from-top;
        }
        @keyframes slide-in-from-top {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Disclaimer */}
      <div className="px-4 pb-4 pt-2">
        <p className="text-[10px] text-slate-400 dark:text-white/20 leading-relaxed border-t border-slate-200 dark:border-white/5 pt-3">
          <strong className="text-slate-500 dark:text-white/30">Disclaimer:</strong> The stocks displayed on this page are generated automatically using predefined technical scan conditions. This website does not provide any investment advice, recommendation, or stock tips. The information is for educational and informational purposes only. Please consult a SEBI-registered financial advisor before making any investment decisions. The website owner is not responsible for any financial losses arising from the use of this information.
        </p>
      </div>

      {/* Order Modal */}
      <OrderModal
        isOpen={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        symbol={orderStock?.symbol}
        price={orderStock?.price}
        defaultType={orderStock?.transactionType || 'BUY'}
        optionType={orderStock?.optionType}
        optionSymbol={orderStock?.optionSymbol}
        onOrderPlaced={(result) => {
          console.log('Order placed:', result);
        }}
      />
    </div>
  );
}