'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060b14]">
        <div className="text-center">
          <p className="text-rose-400 mb-4">Invalid reset link.</p>
          <Link href="/login" className="text-blue-400 hover:text-blue-300 text-sm">Back to Login</Link>
        </div>
      </div>
    )
  }

  async function submit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
      } else {
        setDone(true)
        setTimeout(() => router.push('/login'), 2500)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0d1829] px-4">
      <div className="w-full max-w-md">

        <Link href="/" className="block text-center text-xl font-black tracking-tight text-slate-900 dark:text-white mb-10">
          Trading<span className="text-blue-600 dark:text-blue-400">Verse</span>
        </Link>

        {done ? (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Password updated</h2>
            <p className="text-slate-400 text-sm">Redirecting you to login…</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-1">Set a new password</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Enter and confirm your new password below.</p>
            </div>

            {error && (
              <div className="mb-5 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold tracking-wide mb-2">New Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    required
                    className="w-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3.5 pr-12 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/60 transition-all"
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors" tabIndex={-1}>
                    {showPass
                      ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold tracking-wide mb-2">Confirm Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError('') }}
                  required
                  className="w-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/60 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl py-4 text-sm transition-all mt-2"
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>

            <p className="text-center mt-6">
              <Link href="/login" className="text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-400 text-sm transition-colors">
                Back to Login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
