'use client'

import { useCallback, useRef } from 'react'
import { useFreshCue } from '@/hooks/useFreshCue'
import { useFreshKey } from '@/hooks/useFreshKey'
import { playCue } from '@/lib/sound-engine'

export interface LudoRollLike {
    playerId: string
    at: number
}

/**
 * The die. The viewer's own tap plays at once, because the server picks the number a beat later and
 * the throw belongs to the hand; the roll that then arrives is not played again. Every other fresh
 * roll plays when it arrives: someone else's at the remote level, and one the server made for the
 * viewer (a timeout) at the viewer's own.
 */
export function useLudoRollSound(
    lastRoll: LudoRollLike | null | undefined,
    viewerId: string | null | undefined,
    isSpectator: boolean,
    scope?: string | null,
): { tapped: () => void; failed: () => void } {
    const tapsRef = useRef(0)
    const key = lastRoll ? `${lastRoll.playerId}:${lastRoll.at}` : lastRoll
    const { fresh } = useFreshKey(key)

    const play = useCallback(() => {
        if (!lastRoll) return
        const own = !isSpectator && !!viewerId && lastRoll.playerId === viewerId
        if (own && tapsRef.current > 0) {
            tapsRef.current -= 1
            return
        }
        playCue('die.roll', { remote: !own })
    }, [lastRoll, viewerId, isSpectator])
    useFreshCue(key, fresh, play, scope)

    const tapped = useCallback(() => {
        tapsRef.current += 1
        playCue('die.roll')
    }, [])
    const failed = useCallback(() => {
        tapsRef.current = 0
    }, [])
    return { tapped, failed }
}
