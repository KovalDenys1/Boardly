import { REDUCED_MOTION_GAP_MS, type ScheduledCue } from '@/lib/board-sounds'
import { LUDO_FINISH, LUDO_YARD } from '@/lib/games/ludo-game'
import { OWN_ENTER_MS, STEP_MS, timeLudoMotion, type LudoMotionPlan } from '@/lib/games/ludo-motion'
import { LUDO_HOP_RISE_SEMIS, ludoCueSchedule } from '@/lib/ludo-sounds'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const ludoPlan = (overrides: Partial<LudoMotionPlan>): LudoMotionPlan => ({
    playerId: 'y',
    color: 'yellow',
    token: 0,
    own: false,
    from: 3,
    to: 7,
    steps: [4, 5, 6, 7],
    captured: [],
    ...overrides,
})

const at = (cues: ScheduledCue[]) => cues.map(({ cue, atMs }) => [cue, atMs])
const victim = { playerId: 'r', color: 'red' as const, token: 1, from: 51 }

describe('ludoCueSchedule', () => {
    it('ticks each square the token passes, rising, and lands on the last', () => {
        const plan = ludoPlan({})
        const timing = timeLudoMotion(plan)
        const cues = ludoCueSchedule(plan, timing)

        const hops = cues.filter((c) => c.cue === 'piece.hop')
        expect(hops.map((c) => c.atMs)).toEqual(timing.stepStarts.slice(0, -1).map((start) => start + timing.stepDuration))
        expect(hops.map((c) => c.atMs)).toEqual([STEP_MS, STEP_MS * 2, STEP_MS * 3])
        expect(hops.map((c) => c.semis)).toEqual([0, LUDO_HOP_RISE_SEMIS, LUDO_HOP_RISE_SEMIS * 2])
        expect(cues[cues.length - 1]).toMatchObject({ cue: 'piece.place', atMs: timing.travel, remote: true })
    })

    it('lifts a token out of the yard, then places it', () => {
        const plan = ludoPlan({ own: true, from: LUDO_YARD, to: 0, steps: [0] })
        expect(at(ludoCueSchedule(plan, timeLudoMotion(plan)))).toEqual([
            ['piece.enter', 0],
            ['piece.place', OWN_ENTER_MS],
        ])
    })

    it('hits the victim as the mover lands, and a token on the finish lands home', () => {
        const capture = ludoPlan({ from: 10, to: 12, steps: [11, 12], captured: [victim] })
        const timing = timeLudoMotion(capture)
        expect(at(ludoCueSchedule(capture, timing)).slice(-2)).toEqual([
            ['piece.place', timing.travel],
            ['piece.capture', timing.travel],
        ])

        const home = ludoPlan({ from: LUDO_FINISH - 1, to: LUDO_FINISH, steps: [LUDO_FINISH] })
        expect(at(ludoCueSchedule(home, timeLudoMotion(home)))).toEqual([['piece.home', timeLudoMotion(home).travel]])
    })

    it('with reduced motion, plays the same cues in the same order, a short gap apart from 0', () => {
        const enter = ludoPlan({ from: LUDO_YARD, to: 0, steps: [0] })
        expect(at(ludoCueSchedule(enter, timeLudoMotion(enter), true))).toEqual([
            ['piece.enter', 0],
            ['piece.place', REDUCED_MOTION_GAP_MS],
        ])

        const capture = ludoPlan({ from: 10, to: 12, steps: [11, 12], captured: [victim] })
        expect(at(ludoCueSchedule(capture, timeLudoMotion(capture), true))).toEqual([
            ['piece.hop', 0],
            ['piece.place', REDUCED_MOTION_GAP_MS],
            ['piece.capture', REDUCED_MOTION_GAP_MS * 2],
        ])
    })
})
