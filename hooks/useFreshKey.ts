'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * "Has this move just happened?" for entry animations (#1114).
 *
 * A CSS entry animation plays whenever its node mounts, so a mark that pops on
 * placement also pops when the board remounts – a mobile tab switch, a layout
 * change, a reconnect snapshot. This hook answers the narrower question the
 * animation actually means: the thing identified by `key` is new *and* its
 * animation has not finished yet.
 *
 * - The first non-null key the hook sees is never fresh: that is state loading
 *   in, not a move.
 * - A key stays fresh until `settle()` is called (wire it to the node's
 *   `onAnimationEnd`), so a remount after the animation shows it still.
 */
export function isFreshKey(
  key: string | null | undefined,
  firstKey: string | null | undefined,
  settledKey: string | null,
): boolean {
  if (key == null) return false
  if (key === firstKey) return false
  return key !== settledKey
}

export function useFreshKey(key: string | null | undefined): { fresh: boolean; settle: () => void } {
  const firstKeyRef = useRef<string | null | undefined>(undefined)
  if (firstKeyRef.current === undefined && key != null) firstKeyRef.current = key
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const fresh = isFreshKey(key, firstKeyRef.current, settledKey)
  const settle = useCallback(() => {
    if (key != null) setSettledKey(key)
  }, [key])
  return { fresh, settle }
}
