'use client'

import { useEffect, useState } from 'react'
import Nav from '@/app/components/Nav'

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - ts
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export default function AdminUsersPage() {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [toggling, setToggling]     = useState(null) // email being toggled
  const [resetting, setResetting]   = useState(null) // email being reset
  const [resetDone, setResetDone]   = useState({})   // email → true after success
  const [confirmReset, setConfirmReset] = useState(null) // email pending confirmation

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => { setUsers(d.users || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function resetPassword(email) {
    setConfirmReset(null)
    setResetting(email)
    const res = await fetch('/api/admin/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, action: 'reset-password' }),
    })
    if (res.ok) {
      setResetDone(d => ({ ...d, [email]: true }))
      setTimeout(() => setResetDone(d => { const n = { ...d }; delete n[email]; return n }), 4000)
    }
    setResetting(null)
  }

  async function togglePlan(email, currentPlan) {
    const newPlan = currentPlan === 'pro' ? 'free' : 'pro'
    setToggling(email)
    const res = await fetch('/api/admin/users', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, plan: newPlan }),
    })
    if (res.ok) {
      setUsers(u => u.map(u => u.email === email ? { ...u, plan: newPlan } : u))
    }
    setToggling(null)
  }

  const filtered = users.filter(u =>
    !search || u.email.includes(search.toLowerCase()) || u.name.toLowerCase().includes(search.toLowerCase())
  )

  const proCount  = users.filter(u => u.plan === 'pro').length
  const freeCount = users.filter(u => u.plan === 'free').length

  return (
    <div className="min-h-screen bg-[#060b14]">
      <Nav />

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-black text-white mb-1">Users</h1>
          <p className="text-slate-500 text-sm">Manage access and plans</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total', value: users.length, color: 'text-white' },
            { label: 'Pro',   value: proCount,      color: 'text-emerald-400' },
            { label: 'Free',  value: freeCount,     color: 'text-slate-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              <p className={`text-3xl font-black mb-1 ${s.color}`}>{s.value}</p>
              <p className="text-slate-500 text-xs font-semibold tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-blue-500/50"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-slate-600">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-600">No users found</div>
        ) : (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 tracking-wide">User</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 tracking-wide">Provider</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 tracking-wide">Joined</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 tracking-wide">Plan</th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.email} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i === filtered.length - 1 ? 'border-0' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">
                          {initials(u.name)}
                        </div>
                        <div>
                          <p className="text-white text-sm font-semibold">{u.name}</p>
                          <p className="text-slate-500 text-xs">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {u.provider === 'google' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                          Google
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">Email</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500 text-sm">{timeAgo(u.createdAt)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                        u.plan === 'pro'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                      }`}>
                        {u.plan === 'pro' ? 'Pro' : 'Free'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {u.provider !== 'google' && (
                          resetDone[u.email] ? (
                            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              Email sent ✓
                            </span>
                          ) : confirmReset === u.email ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => resetPassword(u.email)}
                                disabled={resetting === u.email}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all disabled:opacity-50"
                              >
                                {resetting === u.email ? '…' : 'Yes, send'}
                              </button>
                              <button
                                onClick={() => setConfirmReset(null)}
                                className="text-xs px-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmReset(u.email)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-blue-500/10 hover:text-blue-400 transition-all"
                            >
                              Reset pwd
                            </button>
                          )
                        )}
                        <button
                          onClick={() => togglePlan(u.email, u.plan)}
                          disabled={toggling === u.email}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${
                            u.plan === 'pro'
                              ? 'bg-slate-700/50 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                          }`}
                        >
                          {toggling === u.email ? '…' : u.plan === 'pro' ? 'Revoke pro' : 'Grant pro'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
