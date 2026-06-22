'use client'

import { useEffect } from 'react'

export default function ServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // ponytail: SW registration fails in some dev setups, non-fatal
    })
  }, [])

  return null
}
