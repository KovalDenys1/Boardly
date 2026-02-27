'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const INSTALL_IDLE_TIMEOUT_MS = 1500

const SocialLoopListener = dynamic(
  () => import('@/components/SocialLoopListener'),
  { ssr: false }
)
const PwaServiceWorker = dynamic(
  () => import('@/components/PwaServiceWorker'),
  { ssr: false }
)
const InstallPrompt = dynamic(
  () => import('@/components/InstallPrompt'),
  { ssr: false }
)

export default function DeferredGlobalEffects() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (handle: number) => void
    }

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(
        () => setEnabled(true),
        { timeout: INSTALL_IDLE_TIMEOUT_MS }
      )

      return () => idleWindow.cancelIdleCallback?.(idleId)
    }

    const timeoutId = setTimeout(() => setEnabled(true), INSTALL_IDLE_TIMEOUT_MS)
    return () => clearTimeout(timeoutId)
  }, [])

  if (!enabled) {
    return null
  }

  return (
    <>
      <SocialLoopListener />
      <PwaServiceWorker />
      <InstallPrompt />
    </>
  )
}
