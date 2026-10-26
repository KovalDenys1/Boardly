'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useFreshCue } from '@/hooks/useFreshCue'
import { connectFourCueSchedule, startCueRun, type CueRun } from '@/lib/board-sounds'
import { C4_DEFAULT_CELL_PX, c4LandingMs } from '@/lib/connect-four-drop-timing'
import { prefersReducedMotion } from '@/lib/motion'

export interface ConnectFourDrop {
    row: number
    remote: boolean
}

const RUNS_KEPT = 4

/** Timed from page state, not the board's animationend: a mobile tab can unmount the board mid-fall. */
export function useConnectFourDropSound(
    dropKey: string | null | undefined,
    fresh: boolean,
    drop: ConnectFourDrop | null,
    scope?: string | null,
): { onCellMeasured: (px: number) => void; landingMs: (row: number) => number } {
    const cellPxRef = useRef(C4_DEFAULT_CELL_PX)
    const runsRef = useRef<CueRun[]>([])

    const landingMs = useCallback((row: number) => (prefersReducedMotion() ? 0 : c4LandingMs(row, cellPxRef.current)), [])
    const onCellMeasured = useCallback((px: number) => {
        cellPxRef.current = px
    }, [])

    const play = useCallback(() => {
        if (!drop) return
        const runs = runsRef.current
        runs.push(startCueRun(connectFourCueSchedule(landingMs(drop.row), drop.remote)))
        if (runs.length > RUNS_KEPT) runs.shift()
    }, [drop, landingMs])
    useFreshCue(dropKey, fresh, play, scope)

    useEffect(() => {
        const runs = runsRef.current
        return () => runs.forEach((run) => run.cancel())
    }, [])

    return { onCellMeasured, landingMs }
}
