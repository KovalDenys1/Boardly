import { JUMP_HOP_MS, OWN_HOP_MS, timeCheckersMotion, type CheckersMotionPlan } from '@/lib/games/checkers-motion'
import {
    REDUCED_MOTION_GAP_MS,
    checkersCueSchedule,
    connectFourCueSchedule,
    lastCueAtMs,
    startCueRun,
    tttMarkSemis,
    type ScheduledCue,
} from '@/lib/board-sounds'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const play = playCue as jest.Mock

const doubleJump: CheckersMotionPlan = {
    side: 1,
    own: false,
    hops: [
        { from: [5, 0], to: [3, 2], capture: [4, 1] },
        { from: [3, 2], to: [1, 4], capture: [2, 3] },
    ],
    movingCell: 1,
    captured: [
        { square: [4, 1], cell: 2, hopIndex: 0 },
        { square: [2, 3], cell: 2, hopIndex: 1 },
    ],
    lifted: [],
    promoted: false,
    continuation: false,
}

const ownPromotion: CheckersMotionPlan = {
    ...doubleJump,
    own: true,
    hops: [{ from: [1, 2], to: [0, 3], capture: null }],
    captured: [],
    promoted: true,
}

const at = (cues: ScheduledCue[]) => cues.map(({ cue, atMs }) => [cue, atMs])

beforeEach(() => play.mockClear())

describe('checkersCueSchedule', () => {
    it('lands every hop at its end and hits every jumped piece when the mover is over it, in time order', () => {
        const timing = timeCheckersMotion(doubleJump)
        const cues = checkersCueSchedule(doubleJump, timing)

        expect(cues.filter((c) => c.cue === 'piece.place').map((c) => c.atMs)).toEqual(timing.hopStarts.map((start, i) => start + timing.hopDurations[i]))
        expect(cues.filter((c) => c.cue === 'piece.capture').map((c) => c.atMs)).toEqual(timing.captureStarts)
        expect(at(cues)).toEqual([
            ['piece.capture', JUMP_HOP_MS / 2],
            ['piece.place', JUMP_HOP_MS],
            ['piece.capture', JUMP_HOP_MS * 1.5],
            ['piece.place', JUMP_HOP_MS * 2],
        ])
        expect(cues.every((c) => c.remote)).toBe(true)
    })

    it('lands a promotion as a stacked king, at the viewer’s own level', () => {
        const cues = checkersCueSchedule(ownPromotion, timeCheckersMotion(ownPromotion))
        expect(cues).toEqual([{ id: 'land:0', cue: 'piece.king', atMs: OWN_HOP_MS, remote: false }])
    })

    it('with reduced motion, plays the same cues in the same order, a short gap apart from 0', () => {
        const cues = checkersCueSchedule(doubleJump, timeCheckersMotion(doubleJump), true)
        expect(at(cues)).toEqual([
            ['piece.capture', 0],
            ['piece.place', REDUCED_MOTION_GAP_MS],
            ['piece.capture', REDUCED_MOTION_GAP_MS * 2],
            ['piece.place', REDUCED_MOTION_GAP_MS * 3],
        ])
        expect(at(checkersCueSchedule(ownPromotion, timeCheckersMotion(ownPromotion), true))).toEqual([['piece.king', 0]])
    })

    it('picks up a chain hop that extends a run in flight without replaying what played', () => {
        jest.useFakeTimers()
        const timing = timeCheckersMotion(doubleJump)
        const first = startCueRun(checkersCueSchedule({ ...doubleJump, hops: doubleJump.hops.slice(0, 1), captured: doubleJump.captured.slice(0, 1) }, timing))
        jest.advanceTimersByTime(JUMP_HOP_MS)
        expect(play.mock.calls.map(([cue]) => cue)).toEqual(['piece.capture', 'piece.place'])
        first.cancel()

        startCueRun(checkersCueSchedule(doubleJump, timing), { offsetMs: JUMP_HOP_MS, played: first.played })
        jest.advanceTimersByTime(JUMP_HOP_MS * 2)
        expect(play.mock.calls.map(([cue]) => cue)).toEqual(['piece.capture', 'piece.place', 'piece.capture', 'piece.place'])
        jest.useRealTimers()
    })

    it('says when its last cue plays', () => {
        expect(lastCueAtMs(checkersCueSchedule(doubleJump, timeCheckersMotion(doubleJump)))).toBe(JUMP_HOP_MS * 2)
        expect(lastCueAtMs([])).toBe(0)
    })
})

it('lands a Connect Four disc when its fall ends', () => {
    expect(connectFourCueSchedule(367, true)).toEqual([{ id: 'land', cue: 'piece.place', atMs: 367, remote: true }])
})

describe('startCueRun', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    const run: ScheduledCue[] = [
        { id: 'land', cue: 'piece.place', atMs: 300, remote: true },
        { id: 'hit', cue: 'piece.capture', atMs: 360, remote: false, semis: 1 },
    ]

    it('plays each cue on its time, a remote one at the remote level', () => {
        startCueRun(run)
        jest.advanceTimersByTime(299)
        expect(play).not.toHaveBeenCalled()
        jest.advanceTimersByTime(1)
        expect(play.mock.calls).toEqual([['piece.place', { remote: true, semis: undefined }]])
        jest.advanceTimersByTime(60)
        expect(play).toHaveBeenLastCalledWith('piece.capture', { remote: false, semis: 1 })
    })

    it('plays a cue due now at once, and plays nothing after cancel', () => {
        const started = startCueRun([{ ...run[0], atMs: 0 }, run[1]])
        expect(play).toHaveBeenCalledTimes(1)
        started.cancel()
        jest.advanceTimersByTime(1000)
        expect(play).toHaveBeenCalledTimes(1)
    })

    it('skips what an earlier run already played and shifts the rest by its offset', () => {
        startCueRun(run, { offsetMs: 300, played: new Set(['land']) })
        jest.advanceTimersByTime(59)
        expect(play).not.toHaveBeenCalled()
        jest.advanceTimersByTime(1)
        expect(play.mock.calls.map(([cue]) => cue)).toEqual(['piece.capture'])
    })
})

it('taps X at the sample’s pitch and O a whole tone up', () => {
    expect(tttMarkSemis('X')).toBe(0)
    expect(tttMarkSemis('O')).toBe(2)
})
