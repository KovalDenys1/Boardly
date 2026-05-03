'use client'

import { useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

const TELEMETRY_IDLE_TIMEOUT_MS = 2000

export default function DeferredTelemetry() {
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
        { timeout: TELEMETRY_IDLE_TIMEOUT_MS }
      )

      return () => idleWindow.cancelIdleCallback?.(idleId)
    }

    const timeoutId = window.setTimeout(() => setEnabled(true), TELEMETRY_IDLE_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [])

  if (!enabled) {
    return null
  }

  return (
    <>
      <SpeedInsights />
      <Analytics />
    </>
  )
}
