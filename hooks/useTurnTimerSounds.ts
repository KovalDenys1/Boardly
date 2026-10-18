'use client'

import { useEffect, useRef } from 'react'
import { playCue } from '@/lib/sound-engine'

/** The clock ticks aloud for the last seconds of the viewer's own timed turn, rising a semitone each second. */
export const TICK_FROM_SECONDS = 5

export function useTurnTimerSounds(secs: number, active: boolean): void {
  const shown = Math.max(0, Math.floor(secs))
  const previousRef = useRef<number | null>(null)
  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = active ? shown : null
    // Only a second counting down: a turn starting, a resync jumping up or the banner mounting mid-countdown stays quiet.
    if (!active || previous === null || shown >= previous) return
    if (shown === 0) playCue('timer.expired')
    else if (shown <= TICK_FROM_SECONDS) playCue('timer.tick', { semis: TICK_FROM_SECONDS - shown })
  }, [shown, active])
}
