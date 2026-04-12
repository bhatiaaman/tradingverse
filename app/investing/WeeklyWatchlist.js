'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function WeeklyWatchlist() {
  const [watchlistObj, setWatchlistObj] = useState({ aiResearch: [], expertsResearch: [], chartink: [] })
  const [activeTab, setActiveTab] = useState('aiResearch')
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [saveStatus, setSaveStatus] = useState(null)
  const [displayLimit, setDisplayLimit] = useState(15)
  const [userStocks, setUserStocks] = useState('')
  const [copied, setCopied] = useState(false)
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const [editingSymbolIndex, setEditingSymbolIndex] = useState(null)
  const [tempSymbol, setTempSymbol] = useState('')

  useEffect(() => {
    // Load local storage limit preference
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tv_watchlist_limit')
      if (saved) setDisplayLimit(saved === 'All' ? 'All' : parseInt(saved, 10))
    }
    fetch('/api/weekly-watchlist')
      .then(res => res.json())
      .then(data => {
        setWatchlistObj({
          aiResearch: data.watchlist?.aiResearch || [],
          expertsResearch: data.watchlist?.expertsResearch || [],
          chartink: data.watchlist?.chartink || []
        })
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  const handleSave = async (mode = 'replace') => {
    setSaveStatus(`Saving (${mode})...`);
    try {
      const parsed = JSON.parse(jsonInput)
      if (!Array.isArray(parsed)) throw new Error("JSON must be an array of objects")
      
      let finalList = parsed;
      if (mode === 'append') {
        const existingMap = new Map();
        (watchlistObj[activeTab] || []).forEach(s => existingMap.set(s.symbol, s));
        parsed.forEach(s => existingMap.set(s.symbol, s));
        finalList = Array.from(existingMap.values());
      }
      
      const res = await fetch('/api/weekly-watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: activeTab, list: finalList })
      })
      
      if (res.ok) {
        setWatchlistObj(prev => ({ ...prev, [activeTab]: finalList }))
        setIsEditing(false)
        setSaveStatus(null)
      } else {
        const errorData = await res.json()
        setSaveStatus(`Error: ${errorData.error}`)
      }
    } catch (e) {
      setSaveStatus("Invalid JSON format")
    }
  }

  const handleSymbolSave = async (oldSymbol) => {
    if (!tempSymbol || tempSymbol.toUpperCase().trim() === oldSymbol) {
      setEditingSymbolIndex(null)
      return
    }
    
    const updatedList = [...watchlistObj[activeTab]]
    const ogIndex = updatedList.findIndex(s => s.symbol === oldSymbol)
    
    if (ogIndex !== -1) {
       updatedList[ogIndex].symbol = tempSymbol.toUpperCase().replace(/[^A-Z0-9&-]/g, '')
       const newWatchlistObj = { ...watchlistObj, [activeTab]: updatedList }
       setWatchlistObj(newWatchlistObj)
       
       fetch('/api/weekly-watchlist', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ tab: activeTab, list: updatedList })
       })
    }
    
    setEditingSymbolIndex(null)
  }

  if (loading) return null;

  const handleLimitChange = (lim) => {
    setDisplayLimit(lim)
    if (typeof window !== 'undefined') localStorage.setItem('tv_watchlist_limit', lim)
  }

  const getDynamicPrompt = () => {
    const schemaString = `[
  {
    "symbol": "STOCK_NAME",
    "companyName": "Full Company Name in readable format",
    "sector": "Sector Name",
    "setupType": "e.g. VCP | Breakout | Mean Reversion",
    "entryZone": "150-153",
    "stopLoss": 142,
    "target1": 165,
    "target2": 180,
    "rewardToRiskRatio": "1:2.5",
    "confidenceScore": 8,
    "reasoning": "One line technical reason",
    "executionNote": "Volume or liquidity risk"
  }
]`;

    const base = `You are an expert Indian NSE swing-trading scanner.\n\n`;
    const constraints = `Output the response as a single, valid JSON array of objects using this exact schema. Do not use markdown wrappers outside the JSON, strictly JSON.
CRITICAL MANDATE: You MUST use exact, official NSE ticker symbols in the "symbol" field. Do NOT use company names or include trailing spaces.
Correct Examples: Use "ELGIEQUIP" instead of "ElgiEquipments", "GET&D" instead of "GEVT&D", "BEPL" instead of "BhansaliEngg".\n\n${schemaString}`;
    
    if (activeTab === 'expertsResearch') {
       return `${base}I have already selected the following specific stocks based on my own research:\n\nSTOCKS: [ ${userStocks || 'INFY, TCS'} ]\n\nFor EACH of the specific stocks listed above, provide a comprehensive swing-trading setup analysis using daily and weekly data up to the most recent Friday close.\nDo not find other stocks. Only analyze the ones provided.\n\n${constraints}`;
    } else {
       return `${base}I need you to find up to 15 stocks for next week's watchlist with the highest probability of follow-through. Use data up to Friday's close and build the watchlist for the upcoming week starting Monday.\n\nPreferences: Liquid stocks, daily volume >2x 20-day avg, clean breakout/momentum continuation, high relative strength.\n\n${constraints}`;
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(getDynamicPrompt());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const TABS = [
    { id: 'aiResearch', label: '🤖 AI Research' },
    { id: 'expertsResearch', label: '🧠 Experts Research' },
    { id: 'chartink', label: '📊 Chartink' },
    { id: 'consolidated', label: '✨ Consolidated Top 20' }
  ];

  let currentList = [];
  if (activeTab === 'consolidated') {
    const combined = [
      ...watchlistObj.aiResearch.map(s => ({ ...s, sourceTitle: '⚡ AI', sourceColor: 'text-fuchsia-400 bg-fuchsia-900/40 border-fuchsia-800' })),
      ...watchlistObj.expertsResearch.map(s => ({ ...s, sourceTitle: '🧠 Expert', sourceColor: 'text-indigo-400 bg-indigo-900/40 border-indigo-800' })),
      ...watchlistObj.chartink.map(s => ({ ...s, sourceTitle: '📊 Chartink', sourceColor: 'text-emerald-400 bg-emerald-900/40 border-emerald-800' }))
    ];
    const map = {};
    for (const item of combined) {
      if (!map[item.symbol] || (item.confidenceScore > map[item.symbol].confidenceScore)) {
        map[item.symbol] = item;
      }
    }
    currentList = Object.values(map);
  } else {
    currentList = watchlistObj[activeTab] || [];
  }

  const displayWatchlist = [...currentList]
    .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
    .slice(0, activeTab === 'consolidated' ? 20 : (displayLimit === 'All' ? undefined : displayLimit));

  const exportToTradingView = () => {
    const combined = [
      ...watchlistObj.aiResearch,
      ...watchlistObj.expertsResearch,
      ...watchlistObj.chartink
    ];
    if (combined.length === 0) return;
    
    // Deduplicate symbols so we don't import duplicate NSE keys
    const uniqueSymbols = Array.from(new Set(combined.map(s => s.symbol)));
    const tvLines = uniqueSymbols.map(sym => `NSE:${sym}`);
    
    // Create a Section Header to group imported stocks visually in TradingView
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const tvContent = `### Watchlist (${dateStr}),${tvLines.join(',')}`;
    
    const blob = new Blob([tvContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tradingverse_Watchlist_All.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    const combined = [
      ...watchlistObj.aiResearch.map(s => ({...s, source: 'AI'})),
      ...watchlistObj.expertsResearch.map(s => ({...s, source: 'Expert'})),
      ...watchlistObj.chartink.map(s => ({...s, source: 'Chartink'}))
    ];
    if (combined.length === 0) return;
    
    const uniqueMap = {};
    for (const item of combined) {
       uniqueMap[item.symbol] = item;
    }
    const uniqueList = Object.values(uniqueMap);

    const headers = ['Symbol', 'Company Name', 'Source', 'Sector', 'Setup Type', 'Target 1', 'Target 2', 'Stop Loss', 'Entry Zone', 'R:R', 'Score', 'Reasoning'];
    const escapeCSV = (str) => typeof str === 'string' ? `"${str.replace(/"/g, '""')}"` : (str || '');

    const rows = uniqueList.map(s => [
      s.symbol,
      escapeCSV(s.companyName),
      s.source,
      escapeCSV(s.sector),
      escapeCSV(s.setupType),
      s.target1,
      s.target2,
      s.stopLoss,
      escapeCSV(s.entryZone),
      escapeCSV(s.rewardToRiskRatio),
      s.confidenceScore,
      escapeCSV(s.reasoning)
    ].join(','));
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tradingverse_Watchlist_All.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full">
      <Link href="/investing" className="inline-flex items-center text-xs font-bold text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 mb-4 transition-colors">
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Investing
      </Link>
      
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            Stocks For Next Week {displayWatchlist.length > 0 && <span className="text-slate-400 font-normal">({displayWatchlist.length})</span>}
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
            High-probability setups for the upcoming sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          {displayWatchlist.length > 0 && (
            <div className="relative">
              <button 
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="flex items-center text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-[#060a0f] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors mr-1"
              >
                📥 Export...
                <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </button>
              
              {isExportMenuOpen && (
                <div className="absolute top-full right-0 mt-1 w-36 bg-white dark:bg-[#0e1420] border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg overflow-hidden z-20">
                  <button 
                    onClick={() => { exportToCSV(); setIsExportMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-b border-slate-200 dark:border-slate-800"
                  >
                    📊 To CSV
                  </button>
                  <button 
                    onClick={() => { exportToTradingView(); setIsExportMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    📈 To TradingView
                  </button>
                </div>
              )}
            </div>
          )}
          {activeTab !== 'consolidated' && currentList.length > 0 && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800/50 rounded-lg p-1 border border-slate-200 dark:border-white/5 mr-2">
              {[10, 15, 20, 'All'].map(lim => (
                <button
                  key={lim}
                  onClick={() => handleLimitChange(lim)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${displayLimit === lim ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  {lim}
                </button>
              ))}
            </div>
          )}
          {activeTab !== 'consolidated' && (
            <button 
              onClick={() => {
                setJsonInput(JSON.stringify(currentList, null, 2))
                setIsEditing(true)
              }}
              className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-3 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800/50 hover:bg-violet-200 dark:hover:bg-violet-800/50 transition-colors"
            >
              {currentList.length > 0 ? "Edit Watchlist" : "Add Watchlist"}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-bold whitespace-nowrap rounded-t-lg transition-colors border-b-2 
              ${activeTab === tab.id ? 'text-violet-600 dark:text-violet-400 border-violet-600 dark:border-violet-500 bg-violet-50 dark:bg-violet-900/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentList.length === 0 && !isEditing ? (
        <div className="text-center py-10 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-white/[0.01]">
          <p className="text-slate-500 text-sm">No stocks available in this view.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayWatchlist.map((stock, i) => (
            <div key={i} className="flex flex-col bg-white dark:bg-[#0b101a] border border-slate-200 dark:border-white/10 rounded-xl p-5 hover:border-violet-300 dark:hover:border-violet-500/40 transition-colors group relative">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2 group/title">
                  {editingSymbolIndex === stock.symbol ? (
                    <div className="flex items-center gap-1">
                      <input 
                         autoFocus
                         value={tempSymbol}
                         onChange={(e) => setTempSymbol(e.target.value)}
                         onKeyDown={(e) => e.key === 'Enter' && handleSymbolSave(stock.symbol)}
                         className="w-24 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white px-2 py-0.5 rounded text-sm font-bold border border-violet-500 outline-none"
                      />
                      <button onClick={() => handleSymbolSave(stock.symbol)} className="text-emerald-500 hover:text-emerald-600 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                      </button>
                      <button onClick={() => setEditingSymbolIndex(null)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{stock.symbol}</h3>
                      {activeTab !== 'consolidated' && (
                        <button 
                           onClick={() => { setTempSymbol(stock.symbol); setEditingSymbolIndex(stock.symbol); }}
                           className="text-slate-400 hover:text-violet-500 opacity-0 group-hover/title:opacity-100 transition-opacity"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                      )}
                    </>
                  )}
                  {activeTab === 'consolidated' && stock.sourceTitle && (
                    <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-sm border ${stock.sourceColor}`}>
                      {stock.sourceTitle}
                    </span>
                  )}
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-sm">
                    {stock.sector}
                  </span>
                </div>
                <div className={`text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded-sm border 
                  ${stock.confidenceScore >= 8 ? 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900/30' : 
                  'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 bg-amber-100 dark:bg-amber-900/30'}`}>
                  SCORE: {stock.confidenceScore}/10
                </div>
              </div>
              
              {stock.companyName && (
                <div className="-mt-1 mb-2 text-[10px] text-slate-500 font-medium tracking-wide truncate">
                  {stock.companyName}
                </div>
              )}

              <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-3">{stock.setupType}</div>
              
              <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
                  <div className="text-slate-400 mb-1">Entry Zone</div>
                  <div className="font-bold text-slate-700 dark:text-slate-200">{stock.entryZone}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
                  <div className="text-slate-400 mb-1">Stop Loss</div>
                  <div className="font-bold text-red-500">{stock.stopLoss}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
                  <div className="text-slate-400 mb-1">Targets</div>
                  <div className="font-bold text-emerald-500">{stock.target1} • {stock.target2}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-100 dark:border-white/5">
                  <div className="text-slate-400 mb-1">Risk : Reward</div>
                  <div className="font-bold text-slate-700 dark:text-slate-200">{stock.rewardToRiskRatio}</div>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic mb-3 flex-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                "{stock.reasoning}"
              </p>
              
              {stock.executionNote && (
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-4 bg-slate-50 dark:bg-slate-800/30 p-2 rounded">
                  <span className="font-bold">⚠️ Note:</span> {stock.executionNote}
                </div>
              )}

              <Link 
                href={`/chart?symbol=${encodeURIComponent(stock.symbol)}&interval=day&back=/investing/weekly-watchlist`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto block text-center w-full bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 rounded-lg transition-colors border border-transparent dark:border-white/5"
              >
                Launch Chart
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Admin Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-[#0e1420] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {activeTab === 'expertsResearch' ? 'Add Expert Stocks' : 'AI Prompt Builder'}
            </h3>
            
            {/* Step 1: Prompt Generation */}
            <div className="mb-6 bg-slate-50 dark:bg-[#0b101a] border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Step 1: Generate AI Prompt</h4>
              {activeTab === 'expertsResearch' && (
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Enter Stocks (Comma Separated)</label>
                  <input 
                    type="text"
                    value={userStocks}
                    onChange={(e) => setUserStocks(e.target.value)}
                    placeholder="e.g. INFY, TCS, RELIANCE"
                    className="w-full bg-white dark:bg-[#060a0f] border border-slate-200 dark:border-slate-700 rounded-md p-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              )}
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleCopyPrompt}
                  className="px-4 py-2 text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  {copied ? '✅ Copied to Clipboard!' : '📋 Copy Prompt'}
                </button>
                <span className="text-xs text-slate-500">Paste this into Claude.</span>
              </div>
            </div>

            {/* Step 2: Paste JSON */}
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Step 2: Paste LLM Output</h4>
            <textarea
              className="w-full flex-1 min-h-[200px] bg-slate-50 dark:bg-[#060a0f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-800 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='[\n  {\n    "symbol": "TCS",\n    ...\n  }\n]'
            />
            
            {saveStatus && (
              <div className={`text-sm mb-4 font-medium ${saveStatus.startsWith('Error') || saveStatus.startsWith('Invalid') ? 'text-red-500' : 'text-violet-500'}`}>
                {saveStatus}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-auto flex-wrap">
              <button 
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSave('append')}
                className="px-4 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                title="Merges your pasted JSON with your existing stocks in the database"
              >
                ➕ Append New
              </button>
              <button 
                onClick={() => handleSave('replace')}
                className="px-4 py-2 text-sm font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
                title="Completely overwrites the database with the JSON above"
              >
                🔄 Replace Entire List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
