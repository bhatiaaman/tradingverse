'use client'

import Link from 'next/link'
import { useUser, isPro } from '@/app/lib/use-user'

/**
 * Wraps a pro-only feature. Shows children to pro users/admins.
 * Shows a lock overlay (or custom fallback) to free users and visitors.
 *
 * Usage:
 *   <FeatureGate>
 *     <SomeProFeature />
 *   </FeatureGate>
 *
 *   <FeatureGate fallback={<p>Pro only</p>}>
 *     <SomeProFeature />
 *   </FeatureGate>
 *
 *   <FeatureGate inline label="AI Analysis">
 *     <AICard />
 *   </FeatureGate>
 */
export default function FeatureGate({ children, fallback, inline = false, label }) {
  const user = useUser()

  if (user === undefined) return null // still loading

  if (isPro(user)) return children

  if (fallback !== undefined) return fallback

  if (inline) {
    return (
      <div className="relative">
        <div className="opacity-30 pointer-events-none select-none">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Link
            href="/upgrade"
            className="flex items-center gap-1.5 bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg backdrop-blur-sm transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {label ? `${label} — Pro` : 'Pro feature'}
          </Link>
        </div>
      </div>
    )
  }

  // Default: full overlay
  return (
    <div className="relative rounded-xl overflow-hidden">
      <div className="opacity-20 pointer-events-none select-none blur-sm">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#060b14]/60 backdrop-blur-sm">
        <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        {label && <p className="text-white text-sm font-semibold">{label}</p>}
        <Link
          href="/upgrade"
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all"
        >
          Upgrade to Pro
        </Link>
      </div>
    </div>
  )
}
