'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { initPostHog } from '../lib/posthog'
import posthog from 'posthog-js'

// Identifies the logged-in user with PostHog (called once per session)
async function identifyUser() {
  try {
    const res = await fetch('/api/auth/me')
    const { user } = await res.json()
    if (user?.email) {
      posthog.identify(user.email, {
        email: user.email,
        name: user.name,
      })
    }
  } catch { /* non-critical */ }
}

export default function PostHogProvider({ children }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const identified = useRef(false)

  // Init once on mount
  useEffect(() => {
    initPostHog()
    if (!identified.current) {
      identified.current = true
      identifyUser()
    }
  }, [])

  // Track page views on route change
  useEffect(() => {
    if (!posthog.__loaded) return
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
    posthog.capture('$pageview', { $current_url: window.location.origin + url })
  }, [pathname, searchParams])

  return children
}
