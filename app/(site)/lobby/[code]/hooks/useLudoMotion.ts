'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LudoGameData } from '@/lib/games/ludo-game'
import { lastCueAtMs, startCueRun, type CueRun, type ScheduledCue } from '@/lib/board-sounds'
import { ludoCueSchedule } from '@/lib/ludo-sounds'
import { LudoMotionPlan, LudoMotionTiming, deriveLudoMotion, timeLudoMotion } from '@/lib/games/ludo-motion'
import { prefersReducedMotion } from '@/lib/motion'

export interface ActiveLudoMotion {
    plan: LudoMotionPlan
    timing: LudoMotionTiming
    /** Changes whenever a run is created; animated elements key on it. */
    epoch: number
}

/** When the run a state started plays its last cue, so the turn cue can wait for it. */
export interface LudoCueEnd {
    data: LudoGameData | undefined
    inMs: number
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
export function useLudoMotion(
    data: LudoGameData | undefined,
    viewerId: string | null,
    cueEndRef?: { current: LudoCueEnd | null },
): ActiveLudoMotion | null {
    const prevRef = useRef<LudoGameData | undefined>(undefined)
    const motionRef = useRef<ActiveLudoMotion | null>(null)
    const epochRef = useRef(0)
    const cuesRef = useRef<CueRun | null>(null)
    const [motion, setMotionState] = useState<ActiveLudoMotion | null>(null)

    const setMotion = (next: ActiveLudoMotion | null) => {
        motionRef.current = next
        setMotionState(next)
    }
    const startCues = (cues: ScheduledCue[]) => {
        cuesRef.current = startCueRun(cues)
        if (cueEndRef) cueEndRef.current = { data, inMs: lastCueAtMs(cues) }
    }

    useLayoutEffect(() => {
        const prev = prevRef.current
        prevRef.current = data
        const result = deriveLudoMotion(prev, data, viewerId)
        if (result.kind === 'none') return
        cuesRef.current?.cancel()
        cuesRef.current = null
        const reducedMotion = prefersReducedMotion()
        if (result.kind === 'jump' || reducedMotion) {
            if (motionRef.current) setMotion(null)
            if (result.kind === 'move') startCues(ludoCueSchedule(result.plan, timeLudoMotion(result.plan), true))
            return
        }
        const timing = timeLudoMotion(result.plan)
        epochRef.current += 1
        setMotion({ plan: result.plan, timing, epoch: epochRef.current })
        startCues(ludoCueSchedule(result.plan, timing))
        // viewerId only labels a move own or not; a change on its own is not a move.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])

    useEffect(() => () => cuesRef.current?.cancel(), [])

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
