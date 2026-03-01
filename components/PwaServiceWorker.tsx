'use client'

import { useEffect } from 'react'

export default function PwaServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    const unregisterInDevelopment = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))

        if ('caches' in window) {
          const cacheKeys = await caches.keys()
          await Promise.all(
            cacheKeys
              .filter((key) => key.startsWith('boardly-pwa-'))
              .map((key) => caches.delete(key))
          )
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('PWA service worker cleanup failed', error)
        }
      }
    }

    // Never run the offline service worker in local dev, otherwise stale
    // cached Next.js chunks can break HMR and page bootstrapping.
    if (process.env.NODE_ENV !== 'production') {
      void unregisterInDevelopment()
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
