'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next') || '/trades'
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
    setError('')
  }

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup'
    const body = mode === 'login'
      ? { email: form.email, password: form.password }
      : { name: form.name, email: form.email, password: form.password }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
      } else {
        posthog.identify(form.email, { email: form.email, name: form.name || data.user?.name })
        posthog.capture(mode === 'signup' ? 'signed_up' : 'logged_in', { email: form.email })
        router.push(nextUrl)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* Left — Mission */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-[#060b14] px-16 py-14 border-r border-white/5">

        {/* Logo */}
        <Link href="/" className="text-xl font-black tracking-tight text-white">
          Trading<span className="text-blue-400">Verse</span>
        </Link>

        {/* Main content */}
        <div>
          <p className="text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-6">Our Mission</p>
          <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-6">
            Trade less.<br/>
            Trade smarter.<br/>
            <span className="text-slate-500">Trade with context.</span>
          </h2>
          <p className="text-slate-400 text-base leading-8 max-w-sm mb-12">
            TradingVerse brings together everything a disciplined trader needs — real-time market context, AI-powered order intelligence, and a library built for learning.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6">
            {[
              { val: '5+', label: 'Trading Games' },
              { val: '4+', label: 'Book Summaries' },
              { val: '∞', label: 'Market Context' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-2xl font-black text-white mb-1">{s.val}</p>
                <p className="text-slate-600 text-xs font-semibold tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonial */}
        <div className="border-t border-white/5 pt-8">
          <p className="text-slate-400 text-sm leading-7 italic mb-4">
            "The discipline to follow your rules in real-time is the only edge that matters. Everything else is just noise."
          </p>
          <p className="text-slate-600 text-xs font-semibold tracking-wide">— Mark Douglas, Trading in the Zone</p>
        </div>
      </div>

      {/* Right — Form */}
      <div className="flex-1 flex flex-col justify-center items-center bg-slate-50 dark:bg-[#0d1829] px-8 py-14">

        {/* Mobile logo */}
        <Link href="/" className="lg:hidden text-xl font-black tracking-tight text-slate-900 dark:text-white mb-12">
          Trading<span className="text-blue-600 dark:text-blue-400">Verse</span>
        </Link>

        <div className="w-full max-w-md">

          {/* Back link */}
          <Link href="/" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm font-medium transition-colors mb-8">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>

          {/* Heading */}
          <div className="mb-10">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">
              {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              {mode === 'login' ? 'Sign in and start your trading journey.' : 'Join TradingVerse — it\'s free.'}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={submit} className="space-y-5">

            {mode === 'signup' && (
              <div>
                <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold tracking-wide mb-2">Full Name</label>
                <input
                  type="text"
                  placeholder="Amandeep Bhatia"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  required
                  className="w-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/60 focus:ring-1 focus:ring-blue-400/20 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold tracking-wide mb-2">Email Address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                required
                className="w-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/60 focus:ring-1 focus:ring-blue-400/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold tracking-wide mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Enter your password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  required
                  className="w-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3.5 pr-12 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/60 focus:ring-1 focus:ring-blue-400/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <div className="text-right">
                <button type="button" className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors font-semibold">
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl py-4 text-sm transition-all duration-200 mt-2"
            >
              {loading
                ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
                : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          {/* Switch mode */}
          <p className="text-center text-slate-500 dark:text-slate-600 text-sm mt-8">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-semibold transition-colors"
            >
              {mode === 'login' ? 'Create account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
