'use client'

import { useEffect, useRef, useState } from 'react'
import { isRemoteRollArrival, rollSignature, type LastRollLike } from '@/lib/yahtzee-motion'

/** Covers the dice tray's staggered tumble (`yz-tumble` plus four 40 ms delays, app/globals.css). */
export const REMOTE_ROLL_ANIMATION_MS = 600

/**
 * True for the length of the dice roll animation after an opponent's or a
 * bot's roll arrives (#1114). The local player's `isRolling` is set by the
 * roll action itself; nobody set it for anyone else's roll, so their dice
 * changed value without moving.
 */
export function useRemoteRoll(
  lastRoll: LastRollLike | null | undefined,
  viewerId: string | null | undefined,
  ready: boolean,
  /** Called once per remote roll as its animation starts, so its sound lands with it. */
  onArrival?: () => void,
): boolean {
  const previousRef = useRef<string | null | undefined>(undefined)
  const onArrivalRef = useRef(onArrival)
  onArrivalRef.current = onArrival
  const [rolling, setRolling] = useState(false)
  const signature = rollSignature(lastRoll)

  useEffect(() => {
    if (!ready) return
    const arrived = isRemoteRollArrival(previousRef.current, lastRoll, viewerId)
    previousRef.current = signature
    if (!arrived) {
      setRolling(false)
      return
    }
    setRolling(true)
    onArrivalRef.current?.()
    const timer = window.setTimeout(() => setRolling(false), REMOTE_ROLL_ANIMATION_MS)
    return () => window.clearTimeout(timer)
    // The signature identifies the roll; a new lastRoll object with the same one is not a roll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ready])

  return rolling
}
