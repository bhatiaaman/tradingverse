"use client";

import React from 'react';

export default function WatchlistTabs({ groups = {}, selectedTab, setSelectedTab, onSelect, isDark, prices = {} }) {
  return (
    <section className={`rounded-2xl p-4 transition-colors ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Watchlists</h3>
        <div className="flex gap-1">
          {['Short', 'Mid', 'Long'].map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTab(t.toLowerCase())}
              className={`px-1.5 py-0.5 rounded whitespace-nowrap text-xs font-medium ${selectedTab === t.toLowerCase() ? 'bg-blue-600 text-white' : isDark ? 'bg-slate-800 text-gray-300' : 'bg-gray-100 text-slate-700'}`}
              style={{minWidth:'42px',overflow:'hidden',textOverflow:'ellipsis'}}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mb-2 px-1">
          <div>Symbol</div>
          <div className="text-right">Price</div>
          <div className="text-right">Change</div>
        </div>
        {(groups[selectedTab] || []).map((item) => {
          const p = prices[item.symbol] || { price: null, changePercent: 0 };
          const changeClass = p.changePercent >= 0 ? 'text-emerald-500' : 'text-red-500';
          return (
            <div key={item.symbol} onClick={() => onSelect(item.symbol)} className={`grid grid-cols-3 gap-2 items-center p-2 rounded cursor-pointer hover:bg-gray-50 transition`}> 
              <div className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{item.symbol.replace(/^.*:/,'')}</div>
              <div className={`text-right ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{p.price ? `$${p.price.toFixed(2)}` : '--'}</div>
              <div className={`text-right text-sm ${changeClass}`}>{p.changePercent ? `${p.changePercent.toFixed(2)}%` : '--'}</div>
            </div>
          );
        })}

        <div className="mt-3 text-sm">
          <button
            className="text-blue-600 hover:underline px-2 py-1 rounded border border-blue-100 bg-blue-50"
            onClick={() => window.dispatchEvent(new CustomEvent('openWatchlistModal'))}
          >
            View All →
          </button>
        </div>
      </div>
    </section>
  );
}
