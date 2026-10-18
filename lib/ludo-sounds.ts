import { reducedMotionTiming, type ScheduledCue } from '@/lib/board-sounds'
import { LUDO_FINISH, LUDO_YARD } from '@/lib/games/ludo-game'
import type { LudoMotionPlan, LudoMotionTiming } from '@/lib/games/ludo-motion'

export const LUDO_HOP_RISE_SEMIS = 0.5

/** A capture hits as the mover lands, the moment the victim starts to shake. */
export function ludoCueSchedule(plan: LudoMotionPlan, timing: LudoMotionTiming, reducedMotion = false): ScheduledCue[] {
    const remote = !plan.own
    const cues: ScheduledCue[] = []
    if (plan.from === LUDO_YARD) cues.push({ id: 'enter', cue: 'piece.enter', atMs: 0, remote })
    for (let i = 0; i < plan.steps.length - 1; i += 1) {
        cues.push({ id: `hop:${i}`, cue: 'piece.hop', atMs: timing.stepStarts[i] + timing.stepDuration, remote, semis: LUDO_HOP_RISE_SEMIS * i })
    }
    cues.push({ id: 'land', cue: plan.to === LUDO_FINISH ? 'piece.home' : 'piece.place', atMs: timing.travel, remote })
    if (plan.captured.length > 0) cues.push({ id: 'capture', cue: 'piece.capture', atMs: timing.travel, remote })
    return reducedMotion ? reducedMotionTiming(cues) : cues
}
