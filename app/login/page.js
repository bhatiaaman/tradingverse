'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawNext = searchParams.get('next') || ''
  const nextUrl = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'forgot'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  const googleErrorMap = {
    google_cancelled: 'Google sign-in was cancelled.',
    invalid_state:    'Session expired. Please try again.',
    google_failed:    'Google sign-in failed. Try again or use email.',
  }
  const googleError = googleErrorMap[searchParams.get('error')] || ''
  const [error, setError] = useState(googleError)

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
    setError('')
  }

  async function submitForgot(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      })
      setForgotSent(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
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
              {mode === 'login' ? 'Welcome back.' : mode === 'signup' ? 'Create your account.' : 'Reset your password.'}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              {mode === 'login' ? 'Sign in and start your trading journey.'
                : mode === 'signup' ? 'Join TradingVerse — it\'s free.'
                : "Enter your email and we'll send a reset link."}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-sm">
              {error}
            </div>
          )}

          {/* Google OAuth button — shown on login + signup, not forgot */}
          {mode !== 'forgot' && (
            <>
              <a
                href={`/api/auth/google?next=${encodeURIComponent(nextUrl)}`}
                onClick={() => setGoogleLoading(true)}
                className="w-full flex items-center justify-center gap-3 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3.5 text-slate-800 dark:text-white text-sm font-semibold hover:bg-slate-50 dark:hover:bg-white/[0.09] transition-all"
              >
                {googleLoading ? (
                  <svg className="w-4 h-4 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                {googleLoading ? 'Redirecting…' : `Continue with Google`}
              </a>
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                <span className="text-xs text-slate-400 dark:text-slate-600 font-medium">or</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
              </div>
            </>
          )}

          {/* Forgot password sent confirmation */}
          {mode === 'forgot' && forgotSent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-white font-semibold mb-1">Check your email</p>
              <p className="text-slate-400 text-sm mb-6">If an account exists for <strong className="text-slate-300">{form.email}</strong>, a reset link has been sent. It expires in 15 minutes.</p>
              <button onClick={() => { setMode('login'); setForgotSent(false); setError('') }}
                className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
                Back to Login
              </button>
            </div>
          ) : mode === 'forgot' ? (
            /* Forgot password form */
            <form onSubmit={submitForgot} className="space-y-5">
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
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl py-4 text-sm transition-all mt-2">
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <p className="text-center">
                <button type="button" onClick={() => { setMode('login'); setError('') }}
                  className="text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-400 text-sm transition-colors">
                  Back to Login
                </button>
              </p>
            </form>
          ) : (
            /* Login / Signup form */
            <>
              <form onSubmit={submit} className="space-y-5">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold tracking-wide mb-2">Full Name</label>
                    <input type="text" placeholder="Amandeep Bhatia" value={form.name}
                      onChange={e => set('name', e.target.value)} required
                      className="w-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/60 focus:ring-1 focus:ring-blue-400/20 transition-all" />
                  </div>
                )}
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold tracking-wide mb-2">Email Address</label>
                  <input type="email" placeholder="you@example.com" value={form.email}
                    onChange={e => set('email', e.target.value)} required
                    className="w-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/60 focus:ring-1 focus:ring-blue-400/20 transition-all" />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold tracking-wide mb-2">Password</label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'}
                      placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Enter your password'}
                      value={form.password} onChange={e => set('password', e.target.value)} required
                      className="w-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3.5 pr-12 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/60 focus:ring-1 focus:ring-blue-400/20 transition-all" />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors" tabIndex={-1}>
                      {showPass
                        ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      }
                    </button>
                  </div>
                </div>
                {mode === 'login' && (
                  <div className="text-right">
                    <button type="button" onClick={() => { setMode('forgot'); setError('') }}
                      className="text-xs text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors font-semibold">
                      Forgot password?
                    </button>
                  </div>
                )}
                <button type="submit" disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl py-4 text-sm transition-all duration-200 mt-2">
                  {loading
                    ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
                    : (mode === 'login' ? 'Sign In' : 'Create Account')}
                </button>
              </form>
              <p className="text-center text-slate-500 dark:text-slate-600 text-sm mt-8">
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-semibold transition-colors">
                  {mode === 'login' ? 'Create account' : 'Sign in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
