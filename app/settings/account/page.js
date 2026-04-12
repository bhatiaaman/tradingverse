'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/app/components/Nav'

export default function AccountSettingsPage() {
  const router = useRouter()
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm]       = useState({ current: '', next: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user) { router.replace('/login?next=/settings/account'); return }
      setUser(d.user)
    })
  }, [router])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setError(''); setSuccess('') }

  async function submit(e) {
    e.preventDefault()
    if (form.next !== form.confirm) { setError('New passwords do not match'); return }
    setLoading(true)
    try {
      const res  = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
      } else {
        setSuccess('Password updated successfully.')
        setForm({ current: '', next: '', confirm: '' })
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const EyeIcon = () => showPass
    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />
      <div className="max-w-xl mx-auto px-6 pt-24 pb-20">

        <div className="mb-6">
          <a href="/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>
            Settings
          </a>
        </div>
        <p className="text-blue-600 dark:text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Account</p>
        <h1 className="text-3xl font-black mb-1">Account Settings</h1>
        <p className="text-slate-500 text-sm mb-10">Manage your profile and security.</p>

        {/* Profile info */}
        {user && (
          <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-4">Profile</h2>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {user.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{user.email}</p>
                <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  user.role === 'admin'
                    ? 'bg-blue-500/10 text-blue-500 dark:text-blue-400'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/40'
                }`}>
                  {user.role === 'admin' ? 'Admin' : 'Free'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Change password */}
        <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-6">Change Password</h2>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/60 text-green-700 dark:text-green-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {success}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {[
              { key: 'current', label: 'Current Password',  placeholder: 'Enter current password' },
              { key: 'next',    label: 'New Password',       placeholder: 'Minimum 8 characters' },
              { key: 'confirm', label: 'Confirm New Password', placeholder: 'Repeat new password' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-slate-600 dark:text-slate-400 text-xs font-semibold tracking-wide mb-2">{label}</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={e => set(key, e.target.value)}
                    required
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 pr-12 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/60 transition-all"
                  />
                  {key === 'current' && (
                    <button type="button" onClick={() => setShowPass(s => !s)} tabIndex={-1}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">
                      <EyeIcon />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button type="submit" disabled={loading || !form.current || !form.next || !form.confirm}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl py-3.5 text-sm transition-all mt-2">
              {loading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
