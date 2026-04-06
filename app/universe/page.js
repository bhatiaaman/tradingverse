'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'

// ── Stars Background Component ─────────────────────────────────────────────
function Starfield() {
  const [stars, setStars] = useState([])

  useEffect(() => {
    // Generate random stars only on the client
    const generatedStars = Array.from({ length: 150 }).map(() => ({
      id: Math.random(),
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.8 + 0.2,
      duration: Math.random() * 3 + 2,
    }))
    setStars(generatedStars)
  }, [])

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#030712]">
      {/* Deep space radial gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(15,23,42,0.6)_0%,rgba(3,7,18,1)_100%)]" />
      
      {/* Stars */}
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white animate-twinkle"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animationDuration: `${star.duration}s`,
          }}
        />
      ))}

      {/* Subtle nebula clouds */}
      <div className="absolute -top-1/4 -left-1/4 w-[150%] h-[150%] bg-[radial-gradient(circle_at_20%_30%,rgba(59,130,246,0.03)_0%,transparent_50%)]" />
      <div className="absolute -bottom-1/4 -right-1/4 w-[150%] h-[150%] bg-[radial-gradient(circle_at_80%_70%,rgba(139,92,246,0.03)_0%,transparent_50%)]" />
    </div>
  )
}

// ── Galaxy Data ────────────────────────────────────────────────────────────
const GALAXIES = [
  {
    id: 'trading',
    name: 'Trading Sector',
    desc: 'Uncluttered precision for active market participants.',
    colorText: 'text-blue-400',
    colorBorder: 'border-blue-500/30',
    colorHoverBorder: 'hover:border-blue-400',
    colorShadow: 'hover:shadow-[0_0_40px_rgba(59,130,246,0.4)]',
    colorBg: 'bg-blue-900/10 hover:bg-blue-900/20',
    glowColor: 'bg-blue-500',
    links: [
      { name: 'Trading Dashboard', url: '/trades' },
      { name: 'Options', url: '/options' }
    ]
  },
  {
    id: 'learning',
    name: 'Learning Hub',
    desc: 'Simulators, games, and insights to hone your edge.',
    colorText: 'text-violet-400',
    colorBorder: 'border-violet-500/30',
    colorHoverBorder: 'hover:border-violet-400',
    colorShadow: 'hover:shadow-[0_0_40px_rgba(139,92,246,0.4)]',
    colorBg: 'bg-violet-900/10 hover:bg-violet-900/20',
    glowColor: 'bg-violet-500',
    links: [
      { name: 'Games', url: '/games' },
      { name: 'Investing', url: '/investing' },
      { name: 'Learn', url: '/learn' }
    ]
  },
  {
    id: 'investing',
    name: 'Wealth Frontier',
    desc: 'Long-term compounders and macro analysis.',
    colorText: 'text-emerald-400',
    colorBorder: 'border-emerald-500/30',
    colorHoverBorder: 'hover:border-emerald-400',
    colorShadow: 'hover:shadow-[0_0_40px_rgba(16,185,129,0.4)]',
    colorBg: 'bg-emerald-900/10 hover:bg-emerald-900/20',
    glowColor: 'bg-emerald-500',
    links: [
      { name: 'Investing', url: '/investing' },
      { name: 'Learn', url: '/learn' },
      { name: 'Games', url: '/games' }
    ]
  },
  {
    id: 'options',
    name: 'Derivatives Void',
    desc: 'Advanced mechanics for options maneuvering.',
    colorText: 'text-rose-400',
    colorBorder: 'border-rose-500/30',
    colorHoverBorder: 'hover:border-rose-400',
    colorShadow: 'hover:shadow-[0_0_40px_rgba(244,63,94,0.4)]',
    colorBg: 'bg-rose-900/10 hover:bg-rose-900/20',
    glowColor: 'bg-rose-500',
    links: [
      { name: 'Options', url: '/options' },
      { name: 'Trading Dashboard', url: '/trades' }
    ]
  }
]

export default function UniversePage() {
  const [hoveredGalaxy, setHoveredGalaxy] = useState(null)

  return (
    <>
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); box-shadow: 0 0 10px rgba(255,255,255,0.8); }
        }
        .animate-twinkle { animation: twinkle infinite ease-in-out; }
      `}</style>
      
      <div className="min-h-screen bg-[#030712] text-white relative font-sans selection:bg-white/10 overflow-x-hidden">
        <Starfield />

        {/* Global Space Navigation Header */}
        <header className="relative z-20 flex justify-between items-center py-6 px-10 border-b border-white/5 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-white/10" />
            </div>
            <span className="font-bold tracking-[0.2em] uppercase text-xs">TradingVerse Core</span>
          </div>
          <div className="flex items-center gap-8 text-sm font-medium tracking-wide text-slate-400">
            <Link href="/" className="hover:text-white transition-colors">Home Portal</Link>
            <button className="hover:text-white transition-colors">Settings</button>
            <div className="w-px h-4 bg-white/20" />
            <button className="text-white">Profile</button>
          </div>
        </header>

        {/* Main Interface */}
        <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6 py-12">
          <div className="text-center mb-20">
            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400">
              Select Your Galaxy
            </h1>
            <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto tracking-wide">
              Navigate to specialized sectors tailored to your operational needs. Focus incoming.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto w-full">
            {GALAXIES.map((galaxy) => {
              const isHovered = hoveredGalaxy === galaxy.id
              const isOtherHovered = hoveredGalaxy !== null && hoveredGalaxy !== galaxy.id

              return (
                <div
                  key={galaxy.id}
                  onMouseEnter={() => setHoveredGalaxy(galaxy.id)}
                  onMouseLeave={() => setHoveredGalaxy(null)}
                  className={`relative group rounded-3xl overflow-hidden transition-all duration-500 ease-out z-10
                    ${isOtherHovered ? 'scale-95 opacity-40 blur-[2px]' : 'scale-100 opacity-100'}
                  `}
                >
                  {/* Card Background Container */}
                  <div className={`absolute inset-0 backdrop-blur-xl border ${galaxy.colorBorder} ${galaxy.colorHoverBorder} transition-colors duration-300 rounded-3xl z-0 ${galaxy.colorBg}`} />

                  {/* Core Glowing Orb Effect */}
                  <div className={`absolute top-0 right-0 w-32 h-32 ${galaxy.glowColor} rounded-full blur-[80px] opacity-20 group-hover:opacity-60 transition-opacity duration-700 z-0`} />
                  <div className={`absolute bottom-0 left-0 w-32 h-32 ${galaxy.glowColor} rounded-full blur-[80px] opacity-20 group-hover:opacity-60 transition-opacity duration-700 z-0`} />

                  {/* Interstellar Card Content */}
                  <div className={`relative z-10 p-10 h-[400px] flex flex-col justify-end border border-transparent rounded-3xl ${galaxy.colorShadow} transition-shadow duration-500`}>
                    
                    <div className="mb-auto">
                      <div className={`w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mb-6 mix-blend-screen bg-white/5`}>
                        <div className={`w-3 h-3 rounded-full ${galaxy.glowColor} blur-[2px]`} />
                        <div className={`absolute w-1 h-1 rounded-full bg-white`} />
                      </div>
                      
                      <h2 className="text-3xl font-black tracking-tight text-white mb-3">
                        {galaxy.name}
                      </h2>
                      <p className="text-slate-400 text-sm leading-relaxed mb-6 font-medium">
                        {galaxy.desc}
                      </p>
                    </div>

                    {/* Routing Links that appear on hover */}
                    <div className={`flex flex-col gap-3 transition-all duration-300 transform ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
                      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent mb-2" />
                      
                      {galaxy.links.map((link, idx) => (
                        <Link 
                          key={idx} 
                          href={link.url}
                          className="flex items-center justify-between group/link"
                        >
                          <span className={`text-sm font-semibold text-slate-300 group-hover/link:${galaxy.colorText} transition-colors`}>
                            {link.name}
                          </span>
                          <span className="opacity-0 -translate-x-2 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all text-white">
                            →
                          </span>
                        </Link>
                      ))}
                    </div>

                    {/* Default state hint */}
                    <div className={`absolute bottom-10 left-10 transition-all duration-300 right-10 ${isHovered ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                      <p className={`text-xs uppercase tracking-widest font-bold ${galaxy.colorText} flex items-center gap-2`}>
                        <span className="w-2 h-2 rounded-full border border-current flex items-center justify-center"><span className="w-0.5 h-0.5 bg-current rounded-full"/></span> 
                        Enter Sector
                      </p>
                    </div>

                  </div>
                </div>
              )
            })}
          </div>
        </main>
      </div>
    </>
  )
}
