'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Nav from '../components/Nav'
import { useUser, isPro } from '@/app/lib/use-user'

export default function SettingsPage() {
  const user    = useUser()
  const [kite, setKite] = useState(null) // null = loading

  useEffect(() => {
    if (!isPro(user)) return
    fetch('/api/kite-config')
      .then(r => r.json())
      .then(d => setKite(d))
      .catch(() => setKite({ tokenValid: false }))
  }, [user])

  const connected = kite?.tokenValid === true

  if (user === undefined) return null // loading

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />

      <div className="max-w-2xl mx-auto px-6 pt-16 pb-20">

        <p className="text-blue-600 dark:text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">Settings</p>
        <h1 className="text-3xl font-black mb-10">Your Account</h1>

        {/* ── Profile ───────────────────────────────────────────────── */}
        {user && (
          <section className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 mb-4">
            <h2 className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400 mb-5">Profile</h2>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
                {user.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{user.name}</p>
                <p className="text-slate-500 text-sm">{user.email}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    user.role === 'admin'
                      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      : isPro(user)
                        ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/40'
                  }`}>
                    {user.role === 'admin' ? 'Admin' : isPro(user) ? 'Pro' : 'Free'}
                  </span>
                  {user.provider === 'google' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <svg className="w-3 h-3" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Google account
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Email account</span>
                  )}
                </div>
              </div>
            </div>

            {user.provider !== 'google' && (
              <Link
                href="/settings/account"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Change password →
              </Link>
            )}
          </section>
        )}

        {/* ── Upgrade nudge for free users ──────────────────────────── */}
        {user && !isPro(user) && (
          <section className="bg-blue-600/5 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-6 mb-4">
            <p className="font-bold text-slate-900 dark:text-white mb-1">Want full access?</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
              Upgrade to Pro to unlock the live trading terminal, option chain, pre-market intelligence, and more.
            </p>
            <Link
              href="/upgrade"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all"
            >
              Request access →
            </Link>
          </section>
        )}

        {/* ── Broker & Data Sources (pro/admin only) ────────────────── */}
        {isPro(user) && (
          <>
            <h2 className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400 mt-10 mb-4">Broker & Data Sources</h2>

            {/* Active Broker */}
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">Zerodha Kite</p>
                    <p className="text-slate-500 text-sm">Real-time data + order execution</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {kite === null ? (
                    <span className="text-xs text-slate-400">Checking…</span>
                  ) : (
                    <span className={`flex items-center gap-1.5 text-sm font-semibold ${connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      {connected ? 'Connected' : 'Disconnected'}
                    </span>
                  )}
                  <Link href="/settings/kite" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                    Manage →
                  </Link>
                </div>
              </div>
            </div>

            {/* Coming Soon */}
            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              {[
                { name: 'Upstox',    desc: 'API v2 + WebSocket streaming' },
                { name: 'Angel One', desc: 'SmartAPI + historical data'   },
              ].map(b => (
                <div key={b.name} className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.015] p-5 opacity-60">
                  <p className="font-bold text-slate-900 dark:text-white mb-1">{b.name}</p>
                  <p className="text-slate-500 text-sm mb-3">{b.desc}</p>
                  <span className="text-[9px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded-full border text-slate-500 bg-slate-100 dark:bg-slate-800/40 border-slate-300 dark:border-slate-700/50">
                    Coming Soon
                  </span>
                </div>
              ))}
            </div>

            {/* Data Sources */}
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl divide-y divide-slate-100 dark:divide-white/5">
              {[
                { name: 'Zerodha Kite', status: connected ? 'Active' : 'Disconnected', color: connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500', desc: 'Real-time prices, option chain, historical candles' },
                { name: 'Yahoo Finance', status: 'Fallback', color: 'text-amber-600 dark:text-amber-400', desc: 'Free, 15-min delayed — used when Kite disconnected' },
              ].map(ds => (
                <div key={ds.name} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{ds.name}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{ds.desc}</p>
                  </div>
                  <span className={`text-xs font-bold ${ds.color}`}>{ds.status}</span>
                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
