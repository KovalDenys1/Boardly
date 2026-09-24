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
 * `key` has three states, and the difference between the first two matters:
 * - `undefined`: no game loaded yet (the page is still fetching);
 * - `null`: a game is loaded and has no move yet;
 * - a string: the latest move.
 *
 * The first *defined* key is the state that loaded in, and it is never fresh:
 * a reload mid-game does not replay the last move. A game that loads empty
 * records `null`, so its first move is fresh like every other (#1159 review).
 * A key stays fresh until `settle()` is called (wire it to the node's
 * `onAnimationEnd`), so a remount after the animation shows it still.
 */
const NOT_LOADED = Symbol('not-loaded')
type LoadedKey = string | null | typeof NOT_LOADED

export function isFreshKey(
  key: string | null | undefined,
  loadedKey: LoadedKey,
  settledKey: string | null,
): boolean {
  if (key == null) return false
  if (loadedKey === NOT_LOADED) return false
  if (key === loadedKey) return false
  return key !== settledKey
}

/** Exposed for tests: the "nothing loaded yet" marker `isFreshKey` takes. */
export const FRESH_KEY_NOT_LOADED: LoadedKey = NOT_LOADED

export function useFreshKey(key: string | null | undefined): { fresh: boolean; settle: () => void } {
  const loadedKeyRef = useRef<LoadedKey>(NOT_LOADED)
  if (loadedKeyRef.current === NOT_LOADED && key !== undefined) loadedKeyRef.current = key
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const fresh = isFreshKey(key, loadedKeyRef.current, settledKey)
  const settle = useCallback(() => {
    if (key != null) setSettledKey(key)
  }, [key])
  return { fresh, settle }
}
