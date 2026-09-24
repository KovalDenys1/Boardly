'use client'

import { useEffect } from 'react'
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
