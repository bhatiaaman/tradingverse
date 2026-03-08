import posthog from 'posthog-js'

export function initPostHog() {
  if (typeof window === 'undefined') return
  if (posthog.__loaded) return

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    capture_pageview: false,      // we fire manually on route change for App Router
    capture_pageleave: true,      // auto-tracks time on page
    persistence: 'localStorage+cookie',
    autocapture: true,            // clicks, inputs, form submits
  })
}

export default posthog
