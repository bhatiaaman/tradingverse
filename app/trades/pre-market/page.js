'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Clock, TrendingUp, TrendingDown, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

// Returns true if current IST time is between 08:00 and 09:15 (pre-market AI window)
function isPreMarketAIWindow() {
  const istNow = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const h = istNow.getUTCHours();
  const m = istNow.getUTCMinutes();
  const mins = h * 60 + m;
  return mins >= 8 * 60 && mins < 9 * 60 + 15; // 480 – 555
}

export default function PreMarketPage() {
  const [tradingPlan, setTradingPlan] = useState('');
  const [planMode, setPlanMode] = useState('template'); // 'template' | 'ai'
  const [planMethod, setPlanMethod] = useState(null);   // 'template' | 'ai' | 'template-fallback'
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [aiWindowOpen, setAiWindowOpen] = useState(isPreMarketAIWindow);
  const [preMarketMovers, setPreMarketMovers] = useState(null);
  const [moversLoading, setMoversLoading] = useState(true);
  const [marketCommentary, setMarketCommentary] = useState(null);
  const [commentaryLoading, setCommentaryLoading] = useState(true);

  // Collapsible sections
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    globalMarkets: false,
    calendar: false,
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('tradingPlan');
        if (raw) {
          const parsed = JSON.parse(raw);
          // Only load if the plan was saved today (IST date)
          const istToday = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000)
            .toISOString().split('T')[0];
          if (parsed.date === istToday && parsed.plan) {
            setTradingPlan(parsed.plan);
          } else {
            // Stale plan from a previous day — clear it
            localStorage.removeItem('tradingPlan');
          }
        }
      } catch {
        // Legacy plain-text plan (no date) — clear it
        localStorage.removeItem('tradingPlan');
      }
    }
  }, []);

  const [globalMarkets, setGlobalMarkets] = useState(null);
  const [keyLevels, setKeyLevels] = useState({ nifty: null, banknifty: null });
  const [gapData, setGapData] = useState({ nifty: null, banknifty: null });
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeToOpen, setTimeToOpen] = useState('');
  const [selectedIndex, setSelectedIndex] = useState('NIFTY');
  const [selectedPivotType, setSelectedPivotType] = useState('standard');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 15, 0);
      
      if (now > today) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const diff = tomorrow - now;
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        setTimeToOpen(`Opens tomorrow in ${hours}h ${minutes}m ${seconds}s`);
      } else {
        const diff = today - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        setTimeToOpen(`Opens in ${hours}h ${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Re-check AI window on mount + every 30s.
  // Run immediately on mount so that cached/SSR HTML (which may have been
  // generated outside the 8:00–9:15 window) doesn't leave the button disabled.
  useEffect(() => {
    const check = () => {
      const open = isPreMarketAIWindow();
      setAiWindowOpen(open);
      if (!open) setPlanMode(prev => prev === 'ai' ? 'template' : prev);
    };
    check(); // correct any stale SSR-cached state right after hydration
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-regenerate when mode changes — only if a plan has already been generated
  useEffect(() => {
    if (planMethod !== null) {
      generateAIPlan();
    }
  }, [planMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch market commentary
  useEffect(() => {
    const fetchCommentary = async () => {
      try {
        const response = await fetch('/api/market-commentary');
        const data = await response.json();
        setMarketCommentary(data.commentary);
      } catch (error) {
        console.error('Failed to fetch commentary:', error);
      } finally {
        setCommentaryLoading(false);
      }
    };
    
    fetchCommentary();
    const interval = setInterval(fetchCommentary, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchMovers = async () => {
      try {
        const response = await fetch('/api/pre-market/movers?limit=10');
        const data = await response.json();
        setPreMarketMovers(data);
      } catch (error) {
        console.error('Failed to fetch movers:', error);
      } finally {
        setMoversLoading(false);
      }
    };
    
    fetchMovers();
    const interval = setInterval(() => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      if (hours === 9 && minutes < 15) {
        fetchMovers();
      }
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchGlobalMarkets(),
        fetchKeyLevels('NIFTY'),
        fetchKeyLevels('BANKNIFTY'),
        fetchGapData('NIFTY'),
        fetchGapData('BANKNIFTY'),
        fetchCalendar(),
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGlobalMarkets = async () => {
    try {
      const res = await fetch('/api/pre-market/global-markets');
      const data = await res.json();
      setGlobalMarkets(data);
    } catch (error) {
      console.error('Error fetching global markets:', error);
    }
  };

  const fetchKeyLevels = async (symbol) => {
    try {
      const res = await fetch(`/api/pre-market/key-levels?symbol=${symbol}`);
      const data = await res.json();
      setKeyLevels(prev => ({ ...prev, [symbol.toLowerCase()]: data }));
    } catch (error) {
      console.error(`Error fetching key levels for ${symbol}:`, error);
    }
  };

  const fetchGapData = async (symbol) => {
    try {
      const res = await fetch(`/api/pre-market/gap-calculator?symbol=${symbol}`);
      const data = await res.json();
      setGapData(prev => ({ ...prev, [symbol.toLowerCase()]: data }));
    } catch (error) {
      console.error(`Error fetching gap data for ${symbol}:`, error);
    }
  };

  const fetchCalendar = async () => {
    try {
      const res = await fetch('/api/pre-market/economic-calendar');
      const data = await res.json();
      setCalendar(data);
    } catch (error) {
      console.error('Error fetching calendar:', error);
    }
  };

  const generateAIPlan = async () => {
    setGeneratingPlan(true);
    try {
      const res = await fetch('/api/pre-market/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gapData: currentGapData,
          keyLevels: currentKeyLevels,
          globalMarkets,
          calendar,
          optionsData: null,
          symbol: selectedIndex,
          mode: planMode,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate plan');

      const data = await res.json();
      const plan = data.plan || data.fallbackPlan || 'Failed to generate plan';
      setTradingPlan(plan);
      setPlanMethod(data.method || null);
      
      if (typeof window !== 'undefined') {
        const istToday = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
        localStorage.setItem('tradingPlan', JSON.stringify({ plan, date: istToday }));
      }
    } catch (error) {
      console.error('Plan generation error:', error);
      setTradingPlan('Error generating plan. Please try again.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const toggleSection = (section) => {
    setSectionsCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const currentKeyLevels = keyLevels[selectedIndex.toLowerCase()];
  const currentGapData = gapData[selectedIndex.toLowerCase()];
  const pivotData = currentKeyLevels?.[selectedPivotType];

  return (
    <div className="min-h-screen bg-[#0a1628] text-slate-100">
      <header className="border-b border-blue-800/50 bg-[#0d1d35]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/trades" className="text-slate-400 hover:text-slate-200">
                <ArrowLeft className="w-6 h-6" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                  Pre-Market Analysis
                </h1>
                <p className="text-sm text-slate-400">Professional trading preparation</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-blue-900/30 px-4 py-2 rounded-lg border border-blue-700/50">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-mono text-blue-300">{timeToOpen}</span>
              </div>
              <button
                onClick={fetchAllData}
                disabled={loading}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        
        {/* Market Commentary Banner - Tomorrow's Outlook */}
        {marketCommentary && (
          <div className="mb-6 bg-gradient-to-r from-purple-900/50 via-blue-900/50 to-purple-900/50 border border-purple-700/50 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 ${
                  marketCommentary.bias === 'BULLISH' ? 'bg-green-900/50 text-green-300 border border-green-700/50' :
                  marketCommentary.bias === 'BEARISH' ? 'bg-red-900/50 text-red-300 border border-red-700/50' :
                  'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50'
                }`}>
                  <span className="text-lg">{marketCommentary.stateEmoji}</span>
                  <span>{marketCommentary.state}</span>
                </div>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{marketCommentary.biasEmoji}</span>
                  <h3 className="text-lg font-bold text-white">
                    {marketCommentary.headline}
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Tomorrow's Bias:</span>
                    <span className={`font-semibold ${
                      marketCommentary.bias === 'BULLISH' ? 'text-green-400' :
                      marketCommentary.bias === 'BEARISH' ? 'text-red-400' :
                      'text-yellow-400'
                    }`}>
                      {marketCommentary.bias}
                    </span>
                  </div>
                  
                  {marketCommentary.keyLevel && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Watch Level:</span>
                      <span className="font-mono font-semibold text-blue-300">
                        {marketCommentary.keyLevel}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-2 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="text-cyan-300 text-sm font-medium">
                    {marketCommentary.action}
                  </span>
                </div>
              </div>

              <button
                onClick={async () => {
                  setCommentaryLoading(true);
                  const res = await fetch('/api/market-commentary?refresh=1');
                  const data = await res.json();
                  setMarketCommentary(data.commentary);
                  setCommentaryLoading(false);
                }}
                className="flex-shrink-0 p-2 hover:bg-blue-800/40 rounded-lg transition-colors"
                title="Refresh commentary"
              >
                <RefreshCw className={`w-4 h-4 text-blue-400 ${commentaryLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        )}

        {/* Main 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN - Gap & Key Levels (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-[#112240] border border-blue-800/40 rounded-xl p-4">
              <div className="flex gap-2 mb-4">
                {['NIFTY', 'BANKNIFTY'].map(idx => (
                  <button
                    key={idx}
                    onClick={() => setSelectedIndex(idx)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      selectedIndex === idx 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {idx === 'BANKNIFTY' ? 'Bank Nifty' : 'Nifty 50'}
                  </button>
                ))}
              </div>

              {currentGapData?.success && (
                <div className={`p-4 rounded-lg mb-4 ${
                  currentGapData.gap.type === 'GAP_UP' ? 'bg-green-900/20 border border-green-700/50' :
                  currentGapData.gap.type === 'GAP_DOWN' ? 'bg-red-900/20 border border-red-700/50' :
                  'bg-slate-800/50 border border-slate-700/50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Expected Opening</span>
                    <span className={`text-xs font-mono px-2 py-1 rounded font-bold ${
                      currentGapData.gap.type === 'GAP_UP' ? 'bg-green-900/50 text-green-300' :
                      currentGapData.gap.type === 'GAP_DOWN' ? 'bg-red-900/50 text-red-300' :
                      'bg-slate-700 text-slate-300'
                    }`}>
                      {currentGapData.gap.size} {currentGapData.gap.direction}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-3xl font-bold font-mono">{currentGapData.expectedOpen?.toLocaleString()}</span>
                    <div className="flex items-center gap-1">
                      {currentGapData.gap.type === 'GAP_UP' ? (
                        <TrendingUp className="w-5 h-5 text-green-400" />
                      ) : currentGapData.gap.type === 'GAP_DOWN' ? (
                        <TrendingDown className="w-5 h-5 text-red-400" />
                      ) : null}
                      <span className={`text-base font-mono font-bold ${
                        currentGapData.gap.type === 'GAP_UP' ? 'text-green-400' :
                        currentGapData.gap.type === 'GAP_DOWN' ? 'text-red-400' :
                        'text-slate-400'
                      }`}>
                        {currentGapData.gap.points > 0 ? '+' : ''}{currentGapData.gap.points} ({currentGapData.gap.percent > 0 ? '+' : ''}{currentGapData.gap.percent}%)
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    Previous Close: <span className="font-mono font-semibold">{currentGapData.previousClose?.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-1 mb-3 bg-slate-800/30 p-1 rounded-lg">
                {['standard', 'fibonacci', 'camarilla'].map(type => (
                  <button
                    key={type}
                    onClick={() => setSelectedPivotType(type)}
                    className={`flex-1 py-1 px-2 rounded text-xs font-medium transition-colors ${
                      selectedPivotType === type 
                        ? 'bg-blue-600 text-white' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>

              {pivotData && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    {(selectedPivotType === 'camarilla' ? ['r4', 'r3', 'r2', 'r1'] : ['r3', 'r2', 'r1']).map(level => (
                      <div key={level} className="flex items-center justify-between py-1.5 px-2 bg-red-900/20 rounded border-l-2 border-red-500/50">
                        <span className="text-xs font-medium text-red-400 uppercase">{level}</span>
                        <span className="text-sm font-mono text-slate-200">{pivotData[level]?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  {selectedPivotType !== 'camarilla' && (
                    <div className="flex items-center justify-between py-2 px-2 bg-blue-900/20 rounded border-l-2 border-blue-500/50">
                      <span className="text-xs font-medium text-blue-400 uppercase">Pivot</span>
                      <span className="text-sm font-mono font-bold text-blue-300">{pivotData.pivot?.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    {(selectedPivotType === 'camarilla' ? ['s1', 's2', 's3', 's4'] : ['s1', 's2', 's3']).map(level => (
                      <div key={level} className="flex items-center justify-between py-1.5 px-2 bg-green-900/20 rounded border-l-2 border-green-500/50">
                        <span className="text-xs font-medium text-green-400 uppercase">{level}</span>
                        <span className="text-sm font-mono text-slate-200">{pivotData[level]?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentGapData?.recommendation && (
                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                  <div className="text-xs font-semibold text-blue-300 mb-1">{currentGapData.recommendation.strategy}</div>
                  <div className="text-xs text-slate-300">{currentGapData.recommendation.advice}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-slate-500">Confidence</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      currentGapData.recommendation.confidence === 'High' ? 'bg-green-900/50 text-green-400' :
                      currentGapData.recommendation.confidence === 'Medium' ? 'bg-yellow-900/50 text-yellow-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {currentGapData.recommendation.confidence}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* MIDDLE COLUMN - Trading Plan & Movers (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Trading Plan - PRIORITY #1 */}
            <div className="bg-[#112240] border border-blue-800/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-blue-300">📝 Today's Trading Plan</h2>
                  {planMethod && (
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium border ${
                      planMethod === 'ai' ? 'bg-purple-900/40 text-purple-300 border-purple-700/50' :
                      planMethod === 'template-fallback' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50' :
                      'bg-slate-700/50 text-slate-400 border-slate-600/50'
                    }`}>
                      {planMethod === 'ai' ? '✨ AI' : planMethod === 'template-fallback' ? '📋 Template (fallback)' : '📋 Template'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mb-4">
                {/* Mode selector */}
                <div className="flex flex-col gap-1">
                  <div className="flex bg-slate-800/50 p-1 rounded-lg gap-1">
                    <button
                      onClick={() => setPlanMode('template')}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        planMode === 'template'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      📋 Template
                    </button>
                    <button
                      onClick={() => aiWindowOpen && setPlanMode('ai')}
                      disabled={!aiWindowOpen}
                      title={!aiWindowOpen ? 'AI Summary available 8:00–9:15 AM IST only' : undefined}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        !aiWindowOpen
                          ? 'text-slate-600 cursor-not-allowed'
                          : planMode === 'ai'
                            ? 'bg-purple-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ✨ AI Summary
                    </button>
                  </div>
                  {!aiWindowOpen && (
                    <p className="text-[10px] text-slate-500 pl-1">
                      AI available 8:00–9:15 AM IST · Use Template outside market hours
                    </p>
                  )}
                </div>
                <button
                  onClick={generateAIPlan}
                  disabled={generatingPlan}
                  className={`px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    planMode === 'ai'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {generatingPlan ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>Generate</>
                  )}
                </button>
              </div>
              
              <textarea
                className="w-full h-80 bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Click 'Generate Plan' to create a trading plan based on current market data..."
                value={tradingPlan}
                onChange={(e) => {
                  setTradingPlan(e.target.value);
                  if (typeof window !== 'undefined') {
                    const istToday = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
                    localStorage.setItem('tradingPlan', JSON.stringify({ plan: e.target.value, date: istToday }));
                  }
                }}
              />
              
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      const istToday = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
                      localStorage.setItem('tradingPlan', JSON.stringify({ plan: tradingPlan, date: istToday }));
                      alert('Plan saved successfully!');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                >
                  💾 Save
                </button>
                <button 
                  onClick={() => {
                    setTradingPlan('');
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('tradingPlan');
                    }
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
                >
                  🗑️ Clear
                </button>
              </div>
            </div>

            {/* Pre-Market Movers - Side by Side */}
            <div className="bg-[#112240] border border-blue-800/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-blue-300">📊 Pre-Market Movers</h2>
                  {preMarketMovers?.isPreMarketTime && (
                    <span className="px-2 py-1 bg-green-900/30 text-green-400 text-xs rounded border border-green-700/50 animate-pulse">
                      ⚡ LIVE
                    </span>
                  )}
                </div>
                <button
                  onClick={async () => {
                    setMoversLoading(true);
                    const res = await fetch('/api/pre-market/movers?limit=10');
                    const data = await res.json();
                    setPreMarketMovers(data);
                    setMoversLoading(false);
                  }}
                  className="p-1.5 hover:bg-blue-800/40 rounded transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 text-blue-400 ${moversLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {moversLoading ? (
                <div className="text-center py-8 text-slate-400 text-sm">Loading pre-market data...</div>
              ) : !preMarketMovers?.success ? (
                <div className="text-center py-8">
                  <div className="text-red-400 text-sm mb-2">{preMarketMovers?.error || 'Failed to load'}</div>
                  {!preMarketMovers?.isPreMarketTime && (
                    <div className="text-slate-500 text-xs">Pre-market data available 9:00-9:15 AM IST</div>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Top Gainers */}
                    <div>
                      <h3 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
                        <span>🔥</span>Top Gainers
                      </h3>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {preMarketMovers.gainers?.length > 0 ? (
                          preMarketMovers.gainers.map((stock) => (
                            <div key={stock.symbol} className="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-slate-200 text-sm">{stock.symbol}</span>
                                <span className="text-green-400 font-bold text-sm">+{stock.changePercent.toFixed(2)}%</span>
                              </div>
                              <div className="flex items-center justify-between text-xs text-slate-400">
                                <div><span className="text-slate-500">LTP:</span> <span className="text-slate-300 font-mono">₹{stock.lastPrice}</span></div>
                                <div><span className="text-slate-500">Vol:</span> <span className="text-slate-300 font-mono">{(stock.volume / 1000).toFixed(0)}K</span></div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-slate-500 text-sm text-center py-4">No significant gainers</div>
                        )}
                      </div>
                    </div>

                    {/* Top Losers */}
                    <div>
                      <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                        <span>📉</span>Top Losers
                      </h3>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {preMarketMovers.losers?.length > 0 ? (
                          preMarketMovers.losers.map((stock) => (
                            <div key={stock.symbol} className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-slate-200 text-sm">{stock.symbol}</span>
                                <span className="text-red-400 font-bold text-sm">{stock.changePercent.toFixed(2)}%</span>
                              </div>
                              <div className="flex items-center justify-between text-xs text-slate-400">
                                <div><span className="text-slate-500">LTP:</span> <span className="text-slate-300 font-mono">₹{stock.lastPrice}</span></div>
                                <div><span className="text-slate-500">Vol:</span> <span className="text-slate-300 font-mono">{(stock.volume / 1000).toFixed(0)}K</span></div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-slate-500 text-sm text-center py-4">No significant losers</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  {preMarketMovers?.summary && (
                    <div className="mt-4 pt-4 border-t border-blue-800/40 flex items-center justify-between text-xs text-slate-400">
                      <div>
                        <span className="text-green-400">{preMarketMovers.summary.totalGainers} Gainers</span>
                        {' / '}
                        <span className="text-red-400">{preMarketMovers.summary.totalLosers} Losers</span>
                      </div>
                      <div>
                        Avg Change: <span className={preMarketMovers.summary.avgChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {preMarketMovers.summary.avgChangePercent >= 0 ? '+' : ''}{preMarketMovers.summary.avgChangePercent}%
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN - Global Markets & Calendar (3 cols) */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Global Markets - Collapsible */}
            <div className="bg-[#112240] border border-blue-800/40 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection('globalMarkets')}
                className="w-full flex items-center justify-between p-4 hover:bg-blue-900/20 transition-colors"
              >
                <h2 className="text-sm font-semibold text-blue-300">🌍 Global Markets</h2>
                {sectionsCollapsed.globalMarkets ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              
              {!sectionsCollapsed.globalMarkets && (
                <div className="p-4 pt-0 space-y-3">
                  {globalMarkets?.markets?.slice(0, 6).map((market) => (
                    <div key={market.symbol} className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-400">{market.name}</div>
                        <div className="text-sm font-mono font-semibold">{market.price?.toLocaleString() || '---'}</div>
                      </div>
                      <div className={`text-xs font-mono px-2 py-1 rounded ${
                        market.changePercent > 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                      }`}>
                        {market.changePercent > 0 ? '+' : ''}{market.changePercent?.toFixed(2)}%
                      </div>
                    </div>
                  ))}
                  
                  <div className="pt-3 mt-3 border-t border-blue-800/30 space-y-2">
                    {globalMarkets?.commodities?.map((commodity) => (
                      <div key={commodity.symbol} className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">{commodity.name}</span>
                        <span className={`text-xs font-mono ${
                          commodity.changePercent > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          ${commodity.price?.toFixed(2)} ({commodity.changePercent > 0 ? '+' : ''}{commodity.changePercent?.toFixed(2)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Economic Calendar - Collapsible */}
            <div className="bg-[#112240] border border-blue-800/40 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection('calendar')}
                className="w-full flex items-center justify-between p-4 hover:bg-blue-900/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-blue-300">📅 Economic Calendar</h2>
                  {calendar?.summary && (
                    <span className="px-2 py-0.5 bg-red-900/30 text-red-400 text-[10px] rounded">
                      {calendar.summary.high} High
                    </span>
                  )}
                </div>
                {sectionsCollapsed.calendar ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>

              {!sectionsCollapsed.calendar && (
                <div className="p-4 pt-0 space-y-2 max-h-96 overflow-y-auto">
                  {calendar?.events?.map((event, idx) => (
                    <div key={idx} className={`p-2 rounded border ${
                      event.status === 'COMPLETED' ? 'bg-slate-800/30 border-slate-700/50 opacity-60' :
                      event.status === 'SOON' ? 'bg-amber-900/20 border-amber-700/50' :
                      'bg-slate-800/50 border-slate-700/50'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                            event.impact === 'HIGH' ? 'bg-red-500' :
                            event.impact === 'MEDIUM' ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-slate-200 truncate">{event.event}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{event.country}</div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs font-mono text-slate-300">{event.time}</div>
                          {event.minutesUntil > 0 && (
                            <div className="text-[10px] text-slate-500">{event.minutesUntil}m</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}