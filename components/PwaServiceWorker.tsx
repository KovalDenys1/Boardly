'use client'

import { useEffect } from 'react'

export default function PwaServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('PWA service worker registration failed', error)
        }
      }
    }

    void register()
  }, [])

  return null
}
