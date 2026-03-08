'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Nav from '../components/Nav'

export default function SettingsPage() {
  const [status, setStatus] = useState(null) // null = loading

  useEffect(() => {
    fetch('/api/kite-config')
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => setStatus({ tokenValid: false, config: {} }))
  }, [])

  const connected = status?.tokenValid === true

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />

      <div className="max-w-3xl mx-auto px-6 pt-20 pb-20">

        {/* Header */}
        <p className="text-blue-600 dark:text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Settings</p>
        <h1 className="text-4xl md:text-5xl font-black leading-tight mb-2">
          Broker & Data Sources
        </h1>
        <p className="text-slate-500 text-base mb-12">
          Connect your broker to enable live data, order placement, and position tracking.
        </p>

        {/* Active Broker */}
        <h2 className="text-xs font-bold tracking-[0.18em] uppercase text-slate-500 mb-4">Active Broker</h2>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Zerodha Kite</p>
                <p className="text-slate-500 text-sm">Real-time data + order execution</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {status === null ? (
                <span className="text-xs text-slate-400">Checking...</span>
              ) : (
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              )}
              <Link href="/settings/kite"
                className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                Manage →
              </Link>
            </div>
          </div>
        </div>

        {/* Coming Soon Brokers */}
        <h2 className="text-xs font-bold tracking-[0.18em] uppercase text-slate-500 mb-4 mt-10">Coming Soon</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-12">
          {[
            { name: 'Upstox', desc: 'API v2 + WebSocket streaming' },
            { name: 'Angel One', desc: 'SmartAPI + historical data' },
          ].map(b => (
            <div key={b.name}
              className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.015] p-5 opacity-60">
              <p className="font-bold text-slate-900 dark:text-white mb-1">{b.name}</p>
              <p className="text-slate-500 text-sm mb-3">{b.desc}</p>
              <span className="text-[9px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded-full border
                text-slate-500 bg-slate-100 dark:bg-slate-800/40 border-slate-300 dark:border-slate-700/50">
                Coming Soon
              </span>
            </div>
          ))}
        </div>

        {/* Data Sources */}
        <h2 className="text-xs font-bold tracking-[0.18em] uppercase text-slate-500 mb-4">Data Sources</h2>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] divide-y divide-slate-100 dark:divide-white/5">
          {[
            {
              name: 'Zerodha Kite',
              status: connected ? 'Active' : 'Disconnected',
              statusColor: connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400',
              desc: 'Real-time prices, option chain, historical candles',
            },
            {
              name: 'Yahoo Finance',
              status: 'Fallback',
              statusColor: 'text-amber-600 dark:text-amber-400',
              desc: 'Free, 15-min delayed — used when Kite disconnected',
            },
          ].map(ds => (
            <div key={ds.name} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white text-sm">{ds.name}</p>
                <p className="text-slate-500 text-xs mt-0.5">{ds.desc}</p>
              </div>
              <span className={`text-xs font-bold ${ds.statusColor}`}>{ds.status}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
