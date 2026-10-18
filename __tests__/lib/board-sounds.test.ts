import { connectFourCueSchedule, startCueRun, tttMarkSemis, type ScheduledCue } from '@/lib/board-sounds'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const play = playCue as jest.Mock

beforeEach(() => play.mockClear())

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
