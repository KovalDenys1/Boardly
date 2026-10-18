import type { CheckersMotionPlan, CheckersMotionTiming } from '@/lib/games/checkers-motion'
import { playCue } from '@/lib/sound-engine'
import type { CueId } from '@/lib/sound-map'

export const REDUCED_MOTION_GAP_MS = 70

export function tttMarkSemis(symbol: 'X' | 'O'): number {
    return symbol === 'O' ? 2 : 0
}

export interface ScheduledCue {
    /** Stable within a run, so a run that is extended does not replay what already played. */
    id: string
    cue: CueId
    /** ms from the start of the run. */
    atMs: number
    remote: boolean
    semis?: number
}

/** Reduced motion changes when the cues play, never which: the same ones in the same order, a short gap apart. */
export function reducedMotionTiming(cues: ScheduledCue[]): ScheduledCue[] {
    return cues.map((cue, index) => ({ ...cue, atMs: index * REDUCED_MOTION_GAP_MS }))
}

export function lastCueAtMs(cues: readonly ScheduledCue[]): number {
    return cues.reduce((latest, cue) => Math.max(latest, cue.atMs), 0)
}

export function connectFourCueSchedule(fallMs: number, remote: boolean): ScheduledCue[] {
    return [{ id: 'land', cue: 'piece.place', atMs: fallMs, remote }]
}

/** A crowned man is two stacked pieces, so the last landing of a promotion is `piece.king`. */
export function checkersCueSchedule(plan: CheckersMotionPlan, timing: CheckersMotionTiming, reducedMotion = false): ScheduledCue[] {
    const remote = !plan.own
    const last = plan.hops.length - 1
    const cues: ScheduledCue[] = []
    plan.hops.forEach((_, i) => {
        plan.captured.forEach((captured, j) => {
            if (captured.hopIndex === i) cues.push({ id: `capture:${j}`, cue: 'piece.capture', atMs: timing.captureStarts[j], remote })
        })
        const cue: CueId = i === last && plan.promoted ? 'piece.king' : 'piece.place'
        cues.push({ id: `land:${i}`, cue, atMs: timing.hopStarts[i] + timing.hopDurations[i], remote })
    })
    return reducedMotion ? reducedMotionTiming(cues) : cues
}

export interface CueRun {
    cancel(): void
    /** Ids already played; hand them to the run that extends this one. */
    readonly played: ReadonlySet<string>
}

/** Timers, not the audio clock: a replaced run must be cancellable, and the min gap must judge each cue as it lands. */
export function startCueRun(
    cues: readonly ScheduledCue[],
    options: { offsetMs?: number; played?: ReadonlySet<string> } = {},
): CueRun {
    const played = new Set(options.played ?? [])
    const timers: ReturnType<typeof setTimeout>[] = []
    let cancelled = false
    const fire = (cue: ScheduledCue) => {
        if (cancelled || played.has(cue.id)) return
        played.add(cue.id)
        playCue(cue.cue, { remote: cue.remote, semis: cue.semis })
    }
    for (const cue of cues) {
        if (played.has(cue.id)) continue
        const delay = cue.atMs - (options.offsetMs ?? 0)
        if (delay <= 0) fire(cue)
        else timers.push(setTimeout(() => fire(cue), delay))
    }
    return {
        played,
        cancel: () => {
            cancelled = true
            timers.forEach(clearTimeout)
        },
    }
}
