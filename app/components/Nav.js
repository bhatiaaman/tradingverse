'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '../../lib/theme-context'

export default function Nav({ fixed = false }) {
  const path = usePathname()
  const { isDark, toggleTheme } = useTheme()

  const links = [
    { href: '/trades',    label: 'Trading Dashboard' },
    { href: '/games',     label: 'Trading Games' },
    { href: '/learn',     label: 'Learn' },
    { href: '/investing', label: 'Investing' },
    { href: '/settings',  label: 'Settings' },
  ]

  const isActive = (href) => path === href || path.startsWith(href + '/')

  return (
    <nav className={`flex items-center justify-between px-8 py-4 border-b border-slate-200 dark:border-white/5
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
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        <Link href="/login"
          className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
            path === '/login'
              ? 'border-blue-600 text-blue-600 dark:text-white bg-blue-600/10'
              : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-600 hover:text-blue-600 dark:hover:text-white'
          }`}>
          Login
        </Link>
      </div>

      {/* Mobile menu */}
      <div className="md:hidden flex items-center gap-3 text-sm">
        <Link href="/games"     className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Games</Link>
        <Link href="/learn"     className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Learn</Link>
        <Link href="/investing" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Investing</Link>
        <Link href="/login"     className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Login</Link>
        <button onClick={toggleTheme} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          {isDark ? '☀' : '🌙'}
        </button>
      </div>
    </nav>
  )
}
