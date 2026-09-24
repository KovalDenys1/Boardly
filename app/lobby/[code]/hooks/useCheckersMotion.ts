'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import type { CheckersGameData, Side } from '@/lib/games/checkers-game'
import { sounds } from '@/lib/sounds'
import {
    CheckersMotionPlan,
    CheckersMotionTiming,
    deriveCheckersMotion,
    extendCheckersMotion,
    timeCheckersMotion,
} from '../checkers-motion'

export interface ActiveCheckersMotion {
    plan: CheckersMotionPlan
    timing: CheckersMotionTiming
    /** performance.now() when the run began. */
    startedAt: number
    /**
     * How far into the run this render starts. Non-zero only when a chain hop
     * extended a run in flight; every delay is shifted by it, so an element that
     * restarts (its key carries `epoch`) picks up where it was.
     */
    offset: number
    /** Changes whenever the run is (re)created; animated elements key on it. */
    epoch: number
}

function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
export function useCheckersMotion(data: CheckersGameData | undefined, viewerSide: Side | null): ActiveCheckersMotion | null {
    const prevRef = useRef<CheckersGameData | undefined>(undefined)
    const motionRef = useRef<ActiveCheckersMotion | null>(null)
    const epochRef = useRef(0)
    const [motion, setMotionState] = useState<ActiveCheckersMotion | null>(null)

    const setMotion = (next: ActiveCheckersMotion | null) => {
        motionRef.current = next
        setMotionState(next)
    }

    useLayoutEffect(() => {
        const prev = prevRef.current
        prevRef.current = data
        const result = deriveCheckersMotion(prev, data, viewerSide)
        if (result.kind === 'none') return
        if (result.kind === 'jump') {
            if (motionRef.current) setMotion(null)
            return
        }
        const { plan } = result
        if (!plan.own) sounds.play('click')
        if (prefersReducedMotion()) {
            if (motionRef.current) setMotion(null)
            return
        }
        const t = now()
        const running = motionRef.current
        const extended = running && t - running.startedAt < running.timing.total
            ? extendCheckersMotion(running.plan, plan)
            : null
        epochRef.current += 1
        if (running && extended) {
            setMotion({ plan: extended, timing: timeCheckersMotion(extended), startedAt: running.startedAt, offset: t - running.startedAt, epoch: epochRef.current })
        } else {
            setMotion({ plan, timing: timeCheckersMotion(plan), startedAt: t, offset: 0, epoch: epochRef.current })
        }
        // viewerSide only labels a move own or not; a change on its own is not a move.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])

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
