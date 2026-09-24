import { LudoGameData, LudoLastMove, LUDO_YARD } from '@/lib/games/ludo-game'
import { ludoTokenPoint, LUDO_HOME_COLUMN_CELLS, LUDO_TRACK_CELLS } from '@/lib/games/ludo-layout'
import {
    ENTER_MS,
    HIT_MS,
    MAX_TRAVEL_MS,
    OWN_MAX_TRAVEL_MS,
    RETURN_MS,
    STEP_MS,
    VANISH_MS,
    deriveLudoMotion,
    ludoMoverKeyframes,
    ludoPathSteps,
    ludoRingKey,
    ludoVictimKeyframes,
    nextLudoRingTiming,
    timeLudoMotion,
} from '@/app/lobby/[code]/ludo-motion'

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

const mv = (playerId: string, token: number, from: number, to: number, captured: LudoLastMove['captured'] = [], at = 1): LudoLastMove =>
    ({ playerId, token, from, to, captured, at })

const planOf = (prev: LudoGameData, next: LudoGameData, viewer: string | null = null) => {
    const result = deriveLudoMotion(prev, next, viewer)
    if (result.kind !== 'move') throw new Error(`expected a move, got ${result.kind}`)
    return result.plan
}

/** The board cell a step lands on, as [row, col]. */
const cellOf = (color: 'red' | 'yellow', position: number) => {
    const { x, y } = ludoTokenPoint(color, position, 0)
    return [Math.floor(y), Math.floor(x)]
}

describe('ludoPathSteps', () => {
    it('steps through every square between from and to', () => {
        expect(ludoPathSteps(3, 7)).toEqual([4, 5, 6, 7])
    })
    it('leaves the yard as one step onto the start square', () => {
        expect(ludoPathSteps(LUDO_YARD, 0)).toEqual([0])
    })
    it('rejects paths the rules cannot produce', () => {
        expect(ludoPathSteps(LUDO_YARD, 3)).toBeNull()
        expect(ludoPathSteps(7, 3)).toBeNull()
        expect(ludoPathSteps(52, 58)).toBeNull()
    })
})

describe('deriveLudoMotion', () => {
    it('walks a normal move square by square, adjacent squares only', () => {
        const prev = base({ r: [2, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] })
        const next = base({ r: [6, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 2, 6))
        const plan = planOf(prev, next)
        expect(plan).toMatchObject({ playerId: 'r', color: 'red', token: 0, from: 2, to: 6, own: false, captured: [] })
        expect(plan.steps).toEqual([3, 4, 5, 6])
    })

    it('turns the corner of the cross through the squares, not across it', () => {
        // Red 9..13 runs up column 6, over the top (0,7) and down column 8.
        const prev = base({ r: [9, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] })
        const next = base({ r: [13, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 9, 13))
        const plan = planOf(prev, next)
        const cells = plan.steps.map((p) => cellOf('red', p))
        expect(cells).toEqual([[0, 6], [0, 7], [0, 8], [1, 8]])
        // Each step is to a neighbouring cell: no straight glide from (1,6) to (1,8).
        let [pr, pc] = cellOf('red', 9)
        for (const [r, c] of cells) {
            expect(Math.abs(r - pr) + Math.abs(c - pc)).toBe(1)
            ;[pr, pc] = [r, c]
        }
    })

    it('enters the home column and finishes', () => {
        const prev = base({ r: [48, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] })
        const next = base({ r: [54, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 48, 54))
        const plan = planOf(prev, next)
        expect(plan.steps).toEqual([49, 50, 51, 52, 53, 54])
        expect(cellOf('red', 50)).toEqual([...LUDO_TRACK_CELLS[50]])
        expect(cellOf('red', 51)).toEqual([...LUDO_HOME_COLUMN_CELLS.red[0]])
        expect(cellOf('red', 54)).toEqual([...LUDO_HOME_COLUMN_CELLS.red[3]])
    })

    it('leaves the yard on a 6 onto the start square', () => {
        const prev = base({ r: [LUDO_YARD, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] })
        const next = base({ r: [LUDO_YARD, 0], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 1, LUDO_YARD, 0))
        const plan = planOf(prev, next, 'r')
        expect(plan).toMatchObject({ token: 1, from: LUDO_YARD, to: 0, steps: [0], own: true })
        expect(timeLudoMotion(plan).travel).toBeLessThanOrEqual(ENTER_MS)
    })

    it('carries a capture: the victim goes from its square to its yard', () => {
        // Red lands on absolute 5; yellow's relative 31 is absolute (26 + 31) % 52 = 5.
        const prev = base({ r: [2, LUDO_YARD], y: [31, LUDO_YARD] })
        const next = base({ r: [5, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 2, 5, [{ playerId: 'y', token: 0, from: 31 }]))
        const plan = planOf(prev, next)
        expect(plan.captured).toEqual([{ playerId: 'y', color: 'yellow', token: 0, from: 31 }])
        const timing = timeLudoMotion(plan)
        expect(timing.total).toBe(timing.travel + HIT_MS + VANISH_MS + RETURN_MS)
    })

    it('animates a bonus-roll second move from where the first one ended', () => {
        const first = base({ r: [6, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 0, 6, [], 1))
        const second = base({ r: [9, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 6, 9, [], 2))
        expect(planOf(first, second).steps).toEqual([7, 8, 9])
    })

    it('does nothing for a roll or the echo of an optimistic move', () => {
        const moved = base({ r: [6, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 2, 6, [], 100))
        const rolled = { ...moved, dice: 4, phase: 'move' as const }
        expect(deriveLudoMotion(moved, rolled, 'r')).toEqual({ kind: 'none' })
        const echo = base({ r: [6, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 2, 6, [], 250))
        expect(deriveLudoMotion(moved, echo, 'r')).toEqual({ kind: 'none' })
    })

    it('jumps when the states are not one move apart', () => {
        // A missed move: the bonus-roll first move never arrived, so the token is
        // not where the second move says it started.
        const before = base({ r: [2, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] })
        const after = base({ r: [9, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 6, 9))
        expect(deriveLudoMotion(before, after, null)).toEqual({ kind: 'jump' })
        // Another token moved too.
        const other = base({ r: [5, 3], y: [LUDO_YARD, LUDO_YARD] }, mv('r', 0, 2, 5))
        expect(deriveLudoMotion(before, other, null)).toEqual({ kind: 'jump' })
        // A rematch: everything back in the yard, no last move.
        const reset = base({ r: [LUDO_YARD, LUDO_YARD], y: [LUDO_YARD, LUDO_YARD] })
        expect(deriveLudoMotion(after, reset, null)).toEqual({ kind: 'jump' })
    })
})

describe('timeLudoMotion', () => {
    const plan = (from: number, to: number, own = false) => ({
        playerId: 'r', color: 'red' as const, token: 0, own, from, to, steps: ludoPathSteps(from, to)!, captured: [],
    })

    it('spends about a tenth of a second per square', () => {
        const timing = timeLudoMotion(plan(2, 6))
        expect(timing.stepDuration).toBe(STEP_MS)
        expect(timing.travel).toBe(4 * STEP_MS)
        expect(timing.stepStarts).toEqual([0, 100, 200, 300])
    })

    it('caps a long move, and an own move is faster', () => {
        expect(timeLudoMotion(plan(0, 12)).travel).toBe(MAX_TRAVEL_MS)
        expect(timeLudoMotion(plan(0, 12, true)).travel).toBe(OWN_MAX_TRAVEL_MS)
        expect(timeLudoMotion(plan(2, 6, true)).travel).toBeLessThan(timeLudoMotion(plan(2, 6)).travel)
    })
})

describe('keyframes', () => {
    it('hop through every square and end on the drawn destination', () => {
        const p = { playerId: 'r', color: 'red' as const, token: 0, own: false, from: 9, to: 13, steps: [10, 11, 12, 13], captured: [] }
        const start = ludoTokenPoint('red', 9, 0)
        const end = { x: 8.6, y: 1.5 }
        const frames = ludoMoverKeyframes(p, start, end)
        expect(frames).toHaveLength(1 + 2 * 4)
        expect(frames[0].transform).toBe('translate(6.500px, 1.500px)')
        const corner = ludoTokenPoint('red', 11, 0)
        expect(frames[4].transform).toBe(`translate(${corner.x.toFixed(3)}px, ${corner.y.toFixed(3)}px)`)
        expect(frames[frames.length - 1]).toMatchObject({ transform: 'translate(8.600px, 1.500px)', offset: 1 })
        // Only transform: the walk never touches layout.
        frames.forEach((f) => expect(Object.keys(f).filter((k) => k !== 'offset' && k !== 'easing')).toEqual(['transform']))
    })

    it('victim waits for the landing, then vanishes and reappears in its yard', () => {
        const timing = { stepStarts: [0], stepDuration: 300, travel: 300, total: 300 + HIT_MS + VANISH_MS + RETURN_MS }
        const frames = ludoVictimKeyframes(timing, { x: 5.5, y: 6.5 }, { x: 11, y: 11 })
        expect(frames[1]).toMatchObject({ offset: 300 / timing.total, opacity: 1, transform: 'translate(5.500px, 6.500px)' })
        const hidden = frames.filter((f) => f.opacity === 0)
        expect(hidden.map((f) => f.transform)).toEqual(['translate(5.500px, 6.500px) scale(0.4)', 'translate(11.000px, 11.000px) scale(0.4)'])
        expect(frames[frames.length - 1]).toMatchObject({ offset: 1, opacity: 1, transform: 'translate(11.000px, 11.000px)' })
    })
})

describe('nextLudoRingTiming', () => {
    const walk = { playerId: 'r', color: 'red' as const, token: 0, own: false, from: 2, to: 7, steps: [3, 4, 5, 6, 7], captured: [] }
    const run = { plan: walk, timing: timeLudoMotion(walk) }
    const key = ludoRingKey(walk)!

    it('takes the walk as its delay, and keeps it after the run is cleared', () => {
        const first = nextLudoRingTiming(null, key, null)
        expect(first).toEqual({ key, delay: 0 })
        const withRun = nextLudoRingTiming(first, key, run)
        expect(withRun).toEqual({ key, delay: 500 })
        // The run ends: the delay must not drop back to 0 (that restarts the pop-in).
        expect(nextLudoRingTiming(withRun, key, null)).toBe(withRun)
    })

    it('ignores a run for another move and resets on the next move', () => {
        const other = { ...walk, token: 1 }
        expect(nextLudoRingTiming(null, key, { plan: other, timing: run.timing })).toEqual({ key, delay: 0 })
        const settled = { key, delay: 500 }
        const nextKey = ludoRingKey({ ...walk, from: 7, to: 9 })!
        expect(nextLudoRingTiming(settled, nextKey, null)).toEqual({ key: nextKey, delay: 0 })
        expect(nextLudoRingTiming(settled, null, null)).toBeNull()
    })
})
