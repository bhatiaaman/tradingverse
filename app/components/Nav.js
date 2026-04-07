'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '../../lib/theme-context'
import { useState, useEffect } from 'react'

export default function Nav({ fixed = false }) {
  const path = usePathname()

  const { isDark, toggleTheme } = useTheme()
  const [user, setUser] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUser(d.user || null)).catch(() => {})
  }, [path])

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false) }, [path])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  const links = [
    { href: '/trades',    label: 'Trading Dashboard' },
    { href: '/options',   label: 'Options' },
    { href: '/games',     label: 'Trading Games' },
    { href: '/learn',     label: 'Learn' },
    { href: '/investing', label: 'Investing' },
    { href: '/settings',  label: 'Settings' },
    { href: '/pricing',   label: 'Pricing' },
  ]

  const isActive = (href) => path === href || path.startsWith(href + '/')

  return (
    <nav className={`relative flex items-center justify-between px-8 py-4 border-b border-slate-200 dark:border-white/5
      ${fixed
        ? 'fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#060b14]/80 backdrop-blur-md'
        : 'bg-white dark:bg-[#060b14]'}`}>

      {/* Logo */}
      <Link href="/" className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
        Trading<span className="text-blue-600 dark:text-blue-400">Verse</span>
      </Link>

      {/* Links */}
      <div className="hidden md:flex items-center gap-5 text-sm">
        {links.map(l => (
          <Link key={l.href} href={l.href}
            className={`transition-colors font-medium ${
              isActive(l.href)
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}>
            {l.label}
          </Link>
        ))}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
          title={mounted ? (isDark ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle theme'}
          suppressHydrationWarning
        >
          {mounted && (isDark ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ))}
        </button>

        {user ? (
          <div className="flex items-center gap-3">
            {user.role === 'admin' && (
              <>
                <Link
                  href="/eye"
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${
                    isActive('/eye')
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'
                  }`}
                >
                  👁 Eye
                </Link>

                <Link
                  href="/admin/users"
                  className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-all"
                >
                  Admin
                </Link>
              </>
            )}
            <Link
              href="/settings/account"
              className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {user.name?.split(' ')[0]}
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400 transition-all"
            >
              Logout
            </button>
          </div>
        ) : (
          <Link href="/login"
            className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
              path === '/login'
                ? 'border-blue-600 text-blue-600 dark:text-white bg-blue-600/10'
                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-600 hover:text-blue-600 dark:hover:text-white'
            }`}>
            Login
          </Link>
        )}
      </div>

      {/* Mobile: theme + hamburger */}
      <div className="md:hidden flex items-center gap-2">
        <button onClick={toggleTheme} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors" suppressHydrationWarning>
          {mounted && (isDark ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
          ))}
        </button>
        <button
          onClick={() => setMobileOpen(o => !o)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          aria-label="Menu"
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white dark:bg-[#060b14] border-b border-slate-200 dark:border-white/10 shadow-xl z-50 px-6 py-4 flex flex-col gap-1">
          {links.map(l => (
            <Link key={l.href} href={l.href}
              className={`py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                isActive(l.href)
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}>
              {l.label}
            </Link>
          ))}
          <div className="border-t border-slate-200 dark:border-white/10 mt-2 pt-3">
            {user ? (
              <div className="flex flex-col gap-2">
                {user.role === 'admin' && (
                  <>
                    <Link href="/eye" className="py-2 px-3 rounded-lg text-sm font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20">
                      👁 Eye (Admin)
                    </Link>

                  </>
                )}
                <div className="flex items-center justify-between">
                  <Link href="/settings/account" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {user.name?.split(' ')[0]}
                  </Link>
                  <button onClick={handleLogout} className="text-xs text-red-500 dark:text-red-400 font-semibold">
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <Link href="/login" className="block w-full text-center py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
