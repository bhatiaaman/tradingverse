'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Nav({ fixed = false }) {
  const path = usePathname()

  const links = [
    { href: '/trades',    label: 'Trading Dashboard' },
    { href: '/games',     label: 'Trading Games' },
    { href: '/learn',     label: 'Learn' },
    { href: '/investing', label: 'Investing' },
  ]

  const isActive = (href) => path === href || path.startsWith(href + '/')

  return (
    <nav className={`flex items-center justify-between px-8 py-4 border-b border-white/5
      ${fixed ? 'fixed top-0 left-0 right-0 z-50 bg-[#060b14]/80 backdrop-blur-md' : 'bg-[#060b14]'}`}>

      {/* Logo */}
      <Link href="/" className="text-lg font-black tracking-tight text-white">
        Trading<span className="text-blue-400">Verse</span>
      </Link>

      {/* Links */}
      <div className="hidden md:flex items-center gap-5 text-sm">
        {links.map(l => (
          <Link key={l.href} href={l.href}
            className={`transition-colors font-medium ${
              isActive(l.href) ? 'text-white' : 'text-slate-400 hover:text-white'
            }`}>
            {l.label}
          </Link>
        ))}
        <Link href="/login"
          className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
            path === '/login'
              ? 'border-blue-600 text-white bg-blue-600/10'
              : 'border-slate-700 text-slate-300 hover:border-blue-600 hover:text-white'
          }`}>
          Login
        </Link>
      </div>

      {/* Mobile menu — simplified */}
      <div className="md:hidden flex items-center gap-4 text-sm">
        <Link href="/games"     className="text-slate-400 hover:text-white transition-colors">Games</Link>
        <Link href="/learn"     className="text-slate-400 hover:text-white transition-colors">Learn</Link>
        <Link href="/investing" className="text-slate-400 hover:text-white transition-colors">Investing</Link>
        <Link href="/login"     className="text-slate-400 hover:text-white transition-colors">Login</Link>
      </div>
    </nav>
  )
}
