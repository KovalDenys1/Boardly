import { act, renderHook } from '@testing-library/react'
import { useCheckersMotion, type CheckersCueEnd } from '@/app/lobby/[code]/hooks/useCheckersMotion'
import { Move } from '@/lib/game-engine'
import { CheckersGame, type CheckersGameData, type Side } from '@/lib/games/checkers-game'
import { OWN_HOP_MS, STEP_MS } from '@/lib/games/checkers-motion'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const play = playCue as jest.Mock
let reducedMotion = false

beforeAll(() => {
    window.matchMedia = ((query: string) => ({ matches: reducedMotion && query.includes('reduce'), media: query })) as unknown as typeof window.matchMedia
})

beforeEach(() => {
    jest.useFakeTimers()
    play.mockClear()
    reducedMotion = false
})

afterEach(() => jest.useRealTimers())

const tick = (ms: number) => act(() => {
    jest.advanceTimersByTime(ms)
})
const cues = () => play.mock.calls.map(([cue, options]) => [cue, options?.remote ?? false])

describe('useCheckersMotion sound', () => {
    const snap = (g: CheckersGame): CheckersGameData => JSON.parse(JSON.stringify(g.getState().data))
    const newGame = () => {
        const g = new CheckersGame('ck-sound')
        g.addPlayer({ id: 'p1', name: 'Dark' })
        g.addPlayer({ id: 'p2', name: 'Light' })
        g.startGame()
        return g
    }
    const step = (playerId: string, from: [number, number], to: [number, number]): Move => ({ playerId, type: 'step', data: { from, to }, timestamp: new Date() })

    const darkSteps = () => {
        const g = newGame()
        const before = snap(g)
        g.makeMove(step('p1', [5, 0], [4, 1]))
        return { before, after: snap(g) }
    }

    const mount = (data: CheckersGameData, viewer: Side | null) =>
        renderHook(({ d }) => useCheckersMotion(d, viewer), { initialProps: { d: data } })

    it('plays nothing for the state a reload brings in', () => {
        const { after } = darkSteps()
        mount(after, 2)
        tick(2000)
        expect(play).not.toHaveBeenCalled()
    })

    it('lands the opponent’s step at the remote level when its travel ends', () => {
        const { before, after } = darkSteps()
        const { rerender } = mount(before, 2)
        rerender({ d: after })
        tick(STEP_MS - 1)
        expect(play).not.toHaveBeenCalled()
        tick(1)
        expect(cues()).toEqual([['piece.place', true]])
    })

    it('lands the viewer’s own step at the viewer’s level, sooner', () => {
        const { before, after } = darkSteps()
        const { rerender } = mount(before, 1)
        rerender({ d: after })
        tick(OWN_HOP_MS)
        expect(cues()).toEqual([['piece.place', false]])
    })

    it('cancels the landing when a state no move explains replaces the run, or the board goes', () => {
        const { before, after } = darkSteps()
        const replaced = mount(before, 2)
        replaced.rerender({ d: after })
        replaced.rerender({ d: snap(newGame()) })
        tick(2000)

        const unmounted = mount(before, 2)
        unmounted.rerender({ d: after })
        unmounted.unmount()
        tick(2000)

        expect(play).not.toHaveBeenCalled()
    })

    it('with reduced motion, lands at once', () => {
        reducedMotion = true
        const { before, after } = darkSteps()
        const { rerender } = mount(before, 2)
        rerender({ d: after })
        expect(cues()).toEqual([['piece.place', true]])
    })

    it('tells the page when the run a state started plays its last cue', () => {
        const { before, after } = darkSteps()
        const cueEnd: { current: CheckersCueEnd | null } = { current: null }
        const { rerender } = renderHook(({ d }) => useCheckersMotion(d, 2, cueEnd), { initialProps: { d: before } })
        expect(cueEnd.current).toBeNull()
        rerender({ d: after })
        expect(cueEnd.current).toEqual({ data: after, inMs: STEP_MS })
    })
})
