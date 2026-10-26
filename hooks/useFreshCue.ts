'use client'

import { useEffect, useRef } from 'react'

const PLAYED_KEYS_KEPT = 16

/**
 * Calls `play` once per key, and only while `useFreshKey` calls it fresh, so a loaded snapshot or a
 * remount stays silent. It remembers the last keys of the game in `scope`, so a key that comes back
 * (a rejected optimistic move rolling history back) is not played again.
 */
export function useFreshCue(key: string | null | undefined, fresh: boolean, play: () => void, scope?: string | null): void {
    const playedRef = useRef<{ scope: string | null | undefined; keys: string[] }>({ scope, keys: [] })
    useEffect(() => {
        if (playedRef.current.scope !== scope) playedRef.current = { scope, keys: [] }
        if (!fresh || key == null) return
        const { keys } = playedRef.current
        if (keys.includes(key)) return
        keys.push(key)
        if (keys.length > PLAYED_KEYS_KEPT) keys.shift()
        play()
    }, [key, fresh, play, scope])
}
