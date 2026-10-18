import { playCue } from '@/lib/sound-engine'
import type { CueId } from '@/lib/sound-map'

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

export function connectFourCueSchedule(fallMs: number, remote: boolean): ScheduledCue[] {
    return [{ id: 'land', cue: 'piece.place', atMs: fallMs, remote }]
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
