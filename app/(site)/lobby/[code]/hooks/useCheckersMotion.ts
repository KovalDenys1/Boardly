'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CheckersGameData, Side } from '@/lib/games/checkers-game'
import { checkersCueSchedule, lastCueAtMs, startCueRun, type CueRun, type ScheduledCue } from '@/lib/board-sounds'
import {
    type ActiveCheckersMotion,
    deriveCheckersMotion,
    extendCheckersMotion,
    timeCheckersMotion,
} from '@/lib/games/checkers-motion'
import { prefersReducedMotion } from '@/lib/motion'

export type { ActiveCheckersMotion }

/** When the run a state started plays its last cue, so the turn cue can wait for it. */
export interface CheckersCueEnd {
    data: CheckersGameData | undefined
    inMs: number
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/**
 * Watches consecutive Checkers states and returns the run to animate, or null
 * when the board should simply show the state (#1112).
 *
 * Runs in a layout effect so the frame that first shows a new state already
 * has its piece hidden at the destination – the piece never flashes there
 * before it travels. A state that no single move explains cancels the run.
 */
export function useCheckersMotion(
    data: CheckersGameData | undefined,
    viewerSide: Side | null,
    cueEndRef?: { current: CheckersCueEnd | null },
): ActiveCheckersMotion | null {
    const prevRef = useRef<CheckersGameData | undefined>(undefined)
    const motionRef = useRef<ActiveCheckersMotion | null>(null)
    const epochRef = useRef(0)
    const cuesRef = useRef<CueRun | null>(null)
    const [motion, setMotionState] = useState<ActiveCheckersMotion | null>(null)

    const setMotion = (next: ActiveCheckersMotion | null) => {
        motionRef.current = next
        setMotionState(next)
    }
    const startCues = (cues: ScheduledCue[], offsetMs = 0, played?: ReadonlySet<string>) => {
        cuesRef.current = startCueRun(cues, { offsetMs, played })
        if (cueEndRef) cueEndRef.current = { data, inMs: Math.max(0, lastCueAtMs(cues) - offsetMs) }
    }

    useLayoutEffect(() => {
        const prev = prevRef.current
        prevRef.current = data
        const result = deriveCheckersMotion(prev, data, viewerSide)
        if (result.kind === 'none') return
        const previousCues = cuesRef.current
        previousCues?.cancel()
        cuesRef.current = null
        if (result.kind === 'jump') {
            if (motionRef.current) setMotion(null)
            return
        }
        const { plan } = result
        if (prefersReducedMotion()) {
            if (motionRef.current) setMotion(null)
            startCues(checkersCueSchedule(plan, timeCheckersMotion(plan), true))
            return
        }
        const t = now()
        const running = motionRef.current
        const extended = running && t - running.startedAt < running.timing.total
            ? extendCheckersMotion(running.plan, plan, t - running.startedAt)
            : null
        epochRef.current += 1
        if (running && extended) {
            const timing = timeCheckersMotion(extended)
            const offset = t - running.startedAt
            setMotion({ plan: extended, timing, startedAt: running.startedAt, offset, epoch: epochRef.current })
            startCues(checkersCueSchedule(extended, timing), offset, previousCues?.played)
        } else {
            const timing = timeCheckersMotion(plan)
            setMotion({ plan, timing, startedAt: t, offset: 0, epoch: epochRef.current })
            startCues(checkersCueSchedule(plan, timing))
        }
        // viewerSide only labels a move own or not; a change on its own is not a move.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])

    useEffect(() => () => cuesRef.current?.cancel(), [])

    // The run ends by itself; a later run or a jump replaces it earlier.
    useLayoutEffect(() => {
        if (!motion) return
        const remaining = motion.timing.total - motion.offset
        const timer = window.setTimeout(() => {
            if (motionRef.current?.epoch === motion.epoch) setMotion(null)
        }, Math.max(0, remaining) + 20)
        return () => window.clearTimeout(timer)
    }, [motion])

    return motion
}
