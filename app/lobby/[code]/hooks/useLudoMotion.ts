'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import type { LudoGameData } from '@/lib/games/ludo-game'
import { LudoMotionPlan, LudoMotionTiming, deriveLudoMotion, timeLudoMotion } from '../ludo-motion'

export interface ActiveLudoMotion {
    plan: LudoMotionPlan
    timing: LudoMotionTiming
    /** Changes whenever a run is created; animated elements key on it. */
    epoch: number
}

function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Watches consecutive Ludo states and returns the move to animate, or null
 * when the board should simply show the state (#1113). Same shape as
 * useCheckersMotion (#1112).
 *
 * Runs in a layout effect so the frame that first shows a new state already
 * has the token's walk started – it never flashes on its destination first.
 * A new move replaces a run in flight (the old token settles where it is
 * drawn); a state no single move explains cancels the run.
 */
export function useLudoMotion(data: LudoGameData | undefined, viewerId: string | null): ActiveLudoMotion | null {
    const prevRef = useRef<LudoGameData | undefined>(undefined)
    const motionRef = useRef<ActiveLudoMotion | null>(null)
    const epochRef = useRef(0)
    const [motion, setMotionState] = useState<ActiveLudoMotion | null>(null)

    const setMotion = (next: ActiveLudoMotion | null) => {
        motionRef.current = next
        setMotionState(next)
    }

    useLayoutEffect(() => {
        const prev = prevRef.current
        prevRef.current = data
        const result = deriveLudoMotion(prev, data, viewerId)
        if (result.kind === 'none') return
        if (result.kind === 'jump' || prefersReducedMotion()) {
            if (motionRef.current) setMotion(null)
            return
        }
        epochRef.current += 1
        setMotion({ plan: result.plan, timing: timeLudoMotion(result.plan), epoch: epochRef.current })
        // viewerId only labels a move own or not; a change on its own is not a move.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])

    // The run ends by itself; a later run or a jump replaces it earlier.
    useLayoutEffect(() => {
        if (!motion) return
        const timer = window.setTimeout(() => {
            if (motionRef.current?.epoch === motion.epoch) setMotion(null)
        }, motion.timing.total + 20)
        return () => window.clearTimeout(timer)
    }, [motion])

    return motion
}
