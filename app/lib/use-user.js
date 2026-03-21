'use client'

import { useState, useEffect } from 'react'

export function useUser() {
  const [user, setUser] = useState(undefined) // undefined = loading, null = not logged in

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setUser(d.user || null))
      .catch(() => setUser(null))
  }, [])

  return user
}

// Helpers
export const isPro     = u => u?.plan === 'pro' || u?.role === 'admin'
export const isFree    = u => u !== null && u !== undefined && !isPro(u)
export const isVisitor = u => u === null
