import { act, renderHook } from '@testing-library/react'
import { useCheckersMotion, type CheckersCueEnd } from '@/app/lobby/[code]/hooks/useCheckersMotion'
import { useLudoMotion, type LudoCueEnd } from '@/app/lobby/[code]/hooks/useLudoMotion'
import { REDUCED_MOTION_GAP_MS } from '@/lib/board-sounds'
import { Move } from '@/lib/game-engine'
import { CheckersGame, type CheckersGameData, type Side } from '@/lib/games/checkers-game'
import { OWN_HOP_MS, STEP_MS } from '@/lib/games/checkers-motion'
import { LUDO_YARD, type LudoGameData, type LudoLastMove } from '@/lib/games/ludo-game'
import { ENTER_MS, STEP_MS as LUDO_STEP_MS, timeLudoMotion } from '@/lib/games/ludo-motion'
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

describe('useLudoMotion sound', () => {
    const base = (tokens: Record<string, number[]>, lastMove: LudoLastMove | null = null): LudoGameData => ({
        mode: 'quick',
        tokensPerPlayer: 2,
        seats: [
            { playerId: 'r', color: 'red' },
            { playerId: 'y', color: 'yellow' },
        ],
        tokens,
        phase: 'roll',
        turnPlayerId: 'r',
        dice: null,
        legalTokens: [],
        consecutiveSixes: 0,
        lastRoll: null,
        lastMove,
        rollHistory: {},
        events: [],
        eventCount: 0,
        ranking: [],
        winnerId: null,
    })
    const mv = (playerId: string, token: number, from: number, to: number): LudoLastMove => ({ playerId, token, from, to, captured: [], at: 1 })

    const before = base({ r: [2, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] })
    const walked = base({ r: [6, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 2, 6))
    const entered = base({ r: [2, 0], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 1, LUDO_YARD, 0))

    const mount = (data: LudoGameData, viewer: string | null) =>
        renderHook(({ d }) => useLudoMotion(d, viewer), { initialProps: { d: data } })

    it('plays nothing for the state a reload brings in', () => {
        mount(walked, 'y')
        tick(2000)
        expect(play).not.toHaveBeenCalled()
    })

    it('walks the opponent’s token square by square at the remote level, and lands it', () => {
        const { rerender } = mount(before, 'y')
        rerender({ d: walked })
        tick(LUDO_STEP_MS)
        expect(cues()).toEqual([['piece.hop', true]])
        tick(LUDO_STEP_MS * 3)
        expect(cues()).toEqual([['piece.hop', true], ['piece.hop', true], ['piece.hop', true], ['piece.place', true]])
    })

    it('lifts a token out of the yard at once and places it when it arrives', () => {
        const { rerender } = mount(before, 'y')
        rerender({ d: entered })
        expect(cues()).toEqual([['piece.enter', true]])
        tick(ENTER_MS)
        expect(cues()).toEqual([['piece.enter', true], ['piece.place', true]])
    })

    it('cancels the rest of a walk the next move replaces', () => {
        const { rerender } = mount(before, 'y')
        rerender({ d: walked })
        tick(LUDO_STEP_MS)
        rerender({ d: base({ r: [6, 0], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 1, LUDO_YARD, 0)) })
        tick(2000)
        expect(cues()).toEqual([['piece.hop', true], ['piece.enter', true], ['piece.place', true]])
    })

    it('with reduced motion, plays the same cues a short gap apart, the yard lift included', () => {
        reducedMotion = true
        const own = mount(before, 'r')
        own.rerender({ d: walked })
        expect(cues()).toEqual([['piece.hop', false]])
        tick(REDUCED_MOTION_GAP_MS * 3)
        expect(cues()).toEqual([['piece.hop', false], ['piece.hop', false], ['piece.hop', false], ['piece.place', false]])

        play.mockClear()
        const remote = mount(before, 'y')
        remote.rerender({ d: entered })
        tick(REDUCED_MOTION_GAP_MS)
        expect(cues()).toEqual([['piece.enter', true], ['piece.place', true]])
    })

    it('tells the page when the walk plays its last cue', () => {
        const cueEnd: { current: LudoCueEnd | null } = { current: null }
        const { rerender } = renderHook(({ d }) => useLudoMotion(d, 'y', cueEnd), { initialProps: { d: before } })
        rerender({ d: walked })
        const plan = { playerId: 'r', color: 'red' as const, token: 0, own: false, from: 2, to: 6, steps: [3, 4, 5, 6], captured: [] }
        expect(cueEnd.current).toEqual({ data: walked, inMs: timeLudoMotion(plan).travel })
    })
})
