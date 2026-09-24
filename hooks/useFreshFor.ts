'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFreshKey } from '@/hooks/useFreshKey'

/**
 * `useFreshKey` that settles itself after `ms` (#1115).
 *
 * For a screen whose entry is several staggered animations – a verdict, then
 * a vote breakdown, then a banner – there is no single node whose
 * `onAnimationEnd` marks the end. This keeps the key fresh for the length of
 * the whole reveal and then settles it, so a remount afterwards (a mobile tab
 * switch) shows the screen still. A reload is never fresh, as with
 * `useFreshKey`.
 */
export function useFreshFor(key: string | null | undefined, ms: number): boolean {
  const { fresh, settle } = useFreshKey(key)
  useEffect(() => {
    if (!fresh) return
    const timer = window.setTimeout(settle, ms)
    return () => window.clearTimeout(timer)
  }, [fresh, settle, ms])
  return fresh
}

/**
 * Whether a phase that began at `startedAtMs` began just now – within
 * `windowMs` of the moment a board mounted on it. Clocks differ between the
 * server that stamped it and this browser, so the gap counts either way.
 */
export function startedJustNow(startedAtMs: number | null | undefined, nowMs: number, windowMs: number): boolean {
  if (typeof startedAtMs !== 'number' || !Number.isFinite(startedAtMs) || startedAtMs <= 0) return false
  return Math.abs(nowMs - startedAtMs) < windowMs
}

/**
 * `useFreshKey` for a phase that can arrive together with the board (#1115).
 *
 * Guess the Spy's server deals the roles inside game creation, so round 1's
 * role reveal is already the state the board mounts into – which
 * `useFreshKey` rightly treats as loaded, not new, and the first round's card
 * never turned over. The mount-time state is also news when its phase began
 * moments ago (`startedJustNow`); a reload later in the phase is still quiet.
 */
export function useFreshOnArrival(
  key: string | null | undefined,
  startedAtMs: number | null | undefined,
  windowMs = 4000,
): { fresh: boolean; settle: () => void } {
  const { fresh, settle } = useFreshKey(key)
  const [arrival] = useState(() =>
    key != null && startedJustNow(startedAtMs, Date.now(), windowMs) ? key : null,
  )
  const [arrivalSettled, setArrivalSettled] = useState(false)
  const arrivalFresh = arrival !== null && key === arrival && !arrivalSettled
  const settleBoth = useCallback(() => {
    settle()
    setArrivalSettled(true)
  }, [settle])
  return { fresh: fresh || arrivalFresh, settle: settleBoth }
}
