'use client'

import { useState, useEffect } from 'react'
import Nav from '@/app/components/Nav'
import Link from 'next/link'

function StatusDot({ ok, loading }) {
  if (loading) return <span className="w-2.5 h-2.5 rounded-full bg-slate-400 animate-pulse inline-block" />
  return <span className={`w-2.5 h-2.5 rounded-full inline-block ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
}

function StatusBadge({ status, loading }) {
  if (loading) return <span className="text-xs text-slate-400">Checking…</span>
  if (status === 'operational') return <span className="text-xs font-semibold text-emerald-400">Operational</span>
  if (status === 'degraded')    return <span className="text-xs font-semibold text-amber-400">Degraded</span>
  return <span className="text-xs font-semibold text-red-400">Down</span>
}

function LatencyBadge({ ms }) {
  if (!ms) return null
  const color = ms < 200 ? 'text-emerald-400' : ms < 600 ? 'text-amber-400' : 'text-red-400'
  return <span className={`text-[11px] font-mono ${color}`}>{ms}ms</span>
}

export default function StatusPage() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState(null)

  const check = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      const json = await res.json()
      setData(json)
      setLastChecked(new Date())
    } catch {
      setData({ status: 'down', checks: {} })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  const overall = data?.status
  const checks  = data?.checks || {}

  const services = [
    {
      name: 'TradingVerse App',
      desc: 'Core web application & UI',
      ok:   !loading && overall !== 'down',
    },
    {
      name: 'Database (Redis)',
      desc: 'Cache, sessions & market data store',
      ok:   checks.redis?.ok,
      ms:   checks.redis?.latencyMs,
    },
    {
      name: 'Broker Connection',
      desc: checks.broker?.label || 'Zerodha Kite — order placement & live data',
      ok:   checks.broker?.connected,
      note: checks.broker?.connected ? null : 'Kite not connected — market data uses Yahoo Finance fallback',
    },
    {
      name: 'Market Data',
      desc: 'Live quotes, option chain, indices',
      ok:   !loading && overall !== 'down',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />
      <div className="max-w-2xl mx-auto px-6 pt-20 pb-24">

        {/* Overall status banner */}
        <div className={`rounded-2xl border p-6 mb-10 ${
          loading
            ? 'bg-slate-100 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
            : overall === 'operational'
              ? 'bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20'
              : 'bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full flex-shrink-0 ${
                loading ? 'bg-slate-300 animate-pulse' :
                overall === 'operational' ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />
              <div>
                <p className="font-black text-lg">
                  {loading ? 'Checking systems…' :
                   overall === 'operational' ? 'All systems operational' :
                   'Some systems degraded'}
                </p>
                {lastChecked && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Last checked {lastChecked.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={check}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-40"
            >
              {loading ? 'Checking…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Services */}
        <h2 className="text-xs font-bold tracking-widest uppercase text-slate-500 dark:text-slate-400 mb-4">Services</h2>
        <div className="space-y-3 mb-10">
          {services.map(svc => (
            <div key={svc.name} className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <StatusDot ok={svc.ok} loading={loading} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{svc.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{svc.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {svc.ms && <LatencyBadge ms={svc.ms} />}
                  <StatusBadge status={loading ? null : svc.ok ? 'operational' : 'degraded'} loading={loading} />
                </div>
              </div>
              {svc.note && !loading && (
                <p className="text-[11px] text-amber-500 dark:text-amber-400 mt-2 pl-6">{svc.note}</p>
              )}
            </div>
          ))}
        </div>

        {/* If site not loading section */}
        <h2 className="text-xs font-bold tracking-widest uppercase text-slate-500 dark:text-slate-400 mb-4">If the site isn't loading for you</h2>
        <div className="space-y-3 mb-10">
          {[
            {
              title: 'Corporate / office network',
              detail: 'Some office firewalls block external sites or perform SSL inspection that breaks secure connections. Try on your phone\'s mobile data to confirm.',
            },
            {
              title: 'Browser cache or extension',
              detail: 'Try opening in an incognito window or a different browser. Ad-blockers and VPN extensions can sometimes interfere.',
            },
            {
              title: 'DNS issue',
              detail: 'If the page times out instead of giving an SSL error, your DNS may be stale. Try switching to Google DNS (8.8.8.8) or Cloudflare DNS (1.1.1.1).',
            },
            {
              title: 'Brief SSL renewal',
              detail: 'The site\'s SSL certificate auto-renews every 90 days. During the 10–20 minute renewal window you may see a security warning. It resolves automatically.',
            },
          ].map(({ title, detail }) => (
            <div key={title} className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl px-5 py-4">
              <p className="text-sm font-semibold mb-1">{title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{detail}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          Auto-refreshes every 30 seconds · <Link href="/" className="underline hover:text-slate-700 dark:hover:text-white">Go to TradingVerse</Link>
        </p>

      </div>
    </div>
  )
}
