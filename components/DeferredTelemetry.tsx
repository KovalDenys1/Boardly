'use client'

import { useEffect, useState } from 'react'
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { LAUNCH_MEDIUM, LAUNCH_SOURCE, isPlayApp } from '@/lib/app-shell'

const TELEMETRY_IDLE_TIMEOUT_MS = 2000

// The head script strips the Play app's launch pair from the address before Analytics loads.
function withPlayAppSource(event: BeforeSendEvent): BeforeSendEvent {
  if (!isPlayApp()) return event
  try {
    const url = new URL(event.url)
    url.searchParams.set('utm_source', LAUNCH_SOURCE)
    url.searchParams.set('utm_medium', LAUNCH_MEDIUM)
    return { ...event, url: url.href }
  } catch {
    return event
  }
}

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
      <Analytics beforeSend={withPlayAppSource} />
    </>
  )
}
