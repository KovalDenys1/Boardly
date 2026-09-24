'use client'

import { useEffect, useState } from 'react'

/**
 * Show a value only once the animation that explains it has played (#1114).
 *
 * Rock Paper Scissors resolved a round and popped the new score at t=0 while
 * the hands were still shaking; the score gave the result away a second before
 * the reveal did. This keeps returning the previous value for `holdMs` after a
 * change – but only when `revealIndex` grew with it (a new round was revealed).
 * Any other change (a rematch resetting the score, a snapshot correcting it)
 * shows at once.
 *
 * `key` identifies the value (objects are compared by it, not by identity).
 * Pass `holdMs = 0` to disable, e.g. under prefers-reduced-motion.
 */
export function shouldHoldChange(shownRevealIndex: number, nextRevealIndex: number, holdMs: number): boolean {
  return holdMs > 0 && nextRevealIndex > shownRevealIndex
}

interface Shown<T> {
  value: T
  key: string
  revealIndex: number
}

export function useHeldValue<T>(value: T, key: string, revealIndex: number, holdMs: number): T {
  const [shown, setShown] = useState<Shown<T>>({ value, key, revealIndex })
  const changed = key !== shown.key
  const hold = changed && shouldHoldChange(shown.revealIndex, revealIndex, holdMs)

  useEffect(() => {
    if (!changed) return
    const next = { value, key, revealIndex }
    if (!hold) {
      setShown(next)
      return
    }
    const timer = window.setTimeout(() => setShown(next), holdMs)
    return () => window.clearTimeout(timer)
    // `value` is identified by `key`; a new object with the same key is not a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revealIndex, holdMs, changed, hold])

  return hold ? shown.value : value
}
