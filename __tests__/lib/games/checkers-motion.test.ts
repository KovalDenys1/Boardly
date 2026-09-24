import { Move } from '@/lib/game-engine'
import { BOARD_SIZE, CheckersCell, CheckersGame, CheckersGameData, Side, Square } from '@/lib/games/checkers-game'
import {
    CAPTURE_FADE_MS,
    JUMP_HOP_MS,
    OWN_HOP_MS,
    STEP_MS,
    CheckersMotionPlan,
    checkersMoverKeyframes,
    checkersSquareMotion,
    deriveCheckersMotion,
    extendCheckersMotion,
    timeCheckersMotion,
} from '@/app/lobby/[code]/checkers-motion'

const step = (playerId: string, from: Square, to: Square): Move => ({
    playerId,
    type: 'step',
    data: { from, to },
    timestamp: new Date(),
})

/** A deep copy: the engine mutates its data in place, the page sees snapshots. */
const snap = (g: CheckersGame): CheckersGameData => JSON.parse(JSON.stringify(g.getState().data))

const makeGame = (): CheckersGame => {
    const g = new CheckersGame('ck-motion')
    g.addPlayer({ id: 'p1', name: 'Dark' })
    g.addPlayer({ id: 'p2', name: 'Light' })
    g.startGame()
    return g
}

const setPosition = (g: CheckersGame, pieces: Array<[number, number, CheckersCell]>, side: Side) => {
    const board = Array.from({ length: BOARD_SIZE }, () => Array<CheckersCell>(BOARD_SIZE).fill(0))
    for (const [r, c, v] of pieces) board[r][c] = v
    const state = g.getState()
    g.restoreState({ ...state, currentPlayerIndex: side - 1, data: { ...(state.data as CheckersGameData), board, currentSide: side } })
}

const planOf = (result: ReturnType<typeof deriveCheckersMotion>): CheckersMotionPlan => {
    if (result.kind !== 'move') throw new Error(`expected a move, got ${result.kind}`)
    return result.plan
}

describe('deriveCheckersMotion', () => {
    it('turns an opponent step into one travelling hop', () => {
        const g = makeGame()
        const before = snap(g)
        expect(g.makeMove(step('p1', [5, 0], [4, 1]))).toBe(true)
        const plan = planOf(deriveCheckersMotion(before, snap(g), 2))
        expect(plan.own).toBe(false)
        expect(plan.side).toBe(1)
        expect(plan.hops).toEqual([{ from: [5, 0], to: [4, 1], capture: null }])
        expect(plan.movingCell).toBe(1)
        expect(plan.captured).toEqual([])
        expect(plan.promoted).toBe(false)
        expect(timeCheckersMotion(plan).total).toBe(STEP_MS)
    })

    it('marks the viewer\'s own move as own, which glides faster', () => {
        const g = makeGame()
        const before = snap(g)
        g.makeMove(step('p1', [5, 0], [4, 1]))
        const plan = planOf(deriveCheckersMotion(before, snap(g), 1))
        expect(plan.own).toBe(true)
        expect(timeCheckersMotion(plan).total).toBe(OWN_HOP_MS)
        // A spectator sees every move as arriving.
        expect(planOf(deriveCheckersMotion(before, snap(g), null)).own).toBe(false)
    })

    it('animates a multi-jump that arrives hop by hop, each hop in order', () => {
        const g = makeGame()
        setPosition(g, [[6, 1, 1], [5, 2, 2], [3, 4, 2], [0, 7, 2]], 1)
        const s0 = snap(g)
        g.makeMove(step('p1', [6, 1], [4, 3]))
        const s1 = snap(g)
        expect(s1.chainFrom).toEqual([4, 3])
        g.makeMove(step('p1', [4, 3], [2, 5]))
        const s2 = snap(g)
        expect(s2.chainFrom).toBeNull()

        const first = planOf(deriveCheckersMotion(s0, s1, 2))
        expect(first.continuation).toBe(false)
        expect(first.hops).toEqual([{ from: [6, 1], to: [4, 3], capture: [5, 2] }])
        expect(first.captured).toEqual([{ square: [5, 2], cell: 2, hopIndex: 0 }])
        expect(first.lifted).toEqual([]) // the turn goes on: (5,2) stays, faded

        const second = planOf(deriveCheckersMotion(s1, s2, 2))
        expect(second.continuation).toBe(true)
        expect(second.hops).toEqual([{ from: [4, 3], to: [2, 5], capture: [3, 4] }])
        expect(second.captured).toEqual([{ square: [3, 4], cell: 2, hopIndex: 0 }])
        // The turn has ended, so the piece jumped by the first hop is lifted now.
        expect(second.lifted).toEqual([{ square: [5, 2], cell: 2 }])

        // Arriving while the first hop is still in the air, the second joins it.
        const joined = extendCheckersMotion(first, second)!
        expect(joined.hops.map((h) => h.to)).toEqual([[4, 3], [2, 5]])
        expect(joined.captured).toEqual([
            { square: [5, 2], cell: 2, hopIndex: 0 },
            { square: [3, 4], cell: 2, hopIndex: 1 },
        ])
        // The first hop's victim stays dimmed until the chain lands.
        expect(joined.lifted).toEqual([{ square: [5, 2], cell: 2 }])
        const timing = timeCheckersMotion(joined)
        expect(timing.hopStarts).toEqual([0, JUMP_HOP_MS])
        // Each captured piece starts to go as the mover passes over it, not at the end.
        expect(timing.captureStarts).toEqual([JUMP_HOP_MS / 2, JUMP_HOP_MS * 1.5])
        expect(timing.liftStart).toBe(JUMP_HOP_MS * 2)
        expect(timing.total).toBe(JUMP_HOP_MS * 2 + CAPTURE_FADE_MS)

        // The page, once the chain has landed in the state (s2): the first victim
        // is gone from the board but is drawn at the lifted 0.35, going only when
        // the mover lands - not faded again on the first hop's timing.
        const at = JUMP_HOP_MS + 40
        expect(checkersSquareMotion(joined, timing, at, [5, 2], s2.board[5][2])).toEqual({ kind: 'lifted', cell: 2, delay: JUMP_HOP_MS * 2 - at })
        // The second victim fades as the mover passes over it.
        expect(checkersSquareMotion(joined, timing, at, [3, 4], s2.board[3][4])).toEqual({ kind: 'captured', cell: 2, delay: JUMP_HOP_MS * 1.5 - at })
        // Mid-chain (s1) the first victim is still on the board: it dips as the mover passes.
        expect(checkersSquareMotion(first, timeCheckersMotion(first), 0, [5, 2], s1.board[5][2])).toEqual({ kind: 'jumped', delay: JUMP_HOP_MS / 2 })
        expect(checkersSquareMotion(joined, timing, at, [7, 0], 0)).toBeNull()
    })

    it('starts a hop that arrives during the capture fade where it arrived, playing it whole', () => {
        const g = makeGame()
        setPosition(g, [[6, 1, 1], [5, 2, 2], [3, 4, 2], [0, 7, 2]], 1)
        const s0 = snap(g)
        g.makeMove(step('p1', [6, 1], [4, 3]))
        const s1 = snap(g)
        g.makeMove(step('p1', [4, 3], [2, 5]))
        const s2 = snap(g)
        const first = planOf(deriveCheckersMotion(s0, s1, 2))
        const second = planOf(deriveCheckersMotion(s1, s2, 2))
        const firstTiming = timeCheckersMotion(first)
        // Landed at 220, capture fade runs to 330: the run is still going at 300.
        const elapsed = 300
        expect(elapsed).toBeGreaterThan(firstTiming.liftStart)
        expect(elapsed).toBeLessThan(firstTiming.total)

        const joined = extendCheckersMotion(first, second, elapsed)!
        const timing = timeCheckersMotion(joined)
        expect(timing.hopStarts).toEqual([0, elapsed])
        expect(timing.liftStart).toBe(elapsed + JUMP_HOP_MS)
        expect(timing.captureStarts[1]).toBe(elapsed + JUMP_HOP_MS / 2)

        // The mover holds on the first landing square until the second hop starts.
        const frames = checkersMoverKeyframes(joined, timing, false)
        const travel = elapsed + JUMP_HOP_MS
        expect(frames.map((f) => f.transform)).toEqual([
            'translate(0%, 0%)',
            'translate(100%, -100%) scale(1.12)',
            'translate(200%, -200%)',
            'translate(200%, -200%)',
            'translate(300%, -300%) scale(1.12)',
            'translate(400%, -400%)',
        ])
        expect(frames.map((f) => f.offset)).toEqual([0, 110 / travel, 220 / travel, 300 / travel, 410 / travel, 1])

        // Arriving mid-flight, the hop still waits for the travel already planned.
        expect(timeCheckersMotion(extendCheckersMotion(first, second, 100)!).hopStarts).toEqual([0, JUMP_HOP_MS])
    })

    it('sees a whole chain in one state as all of its hops', () => {
        const g = makeGame()
        setPosition(g, [[6, 1, 1], [5, 2, 2], [3, 4, 2], [0, 7, 2]], 1)
        const s0 = snap(g)
        g.makeMove(step('p1', [6, 1], [4, 3]))
        g.makeMove(step('p1', [4, 3], [2, 5]))
        const plan = planOf(deriveCheckersMotion(s0, snap(g), 2))
        expect(plan.hops).toHaveLength(2)
        expect(plan.captured.map((c) => c.hopIndex)).toEqual([0, 1])
        expect(plan.lifted).toEqual([])
    })

    it('reports a promotion, by step and by capture', () => {
        const g = makeGame()
        setPosition(g, [[1, 2, 1], [5, 6, 2]], 1)
        const before = snap(g)
        g.makeMove(step('p1', [1, 2], [0, 1]))
        const plan = planOf(deriveCheckersMotion(before, snap(g), 2))
        expect(plan.promoted).toBe(true)
        expect(plan.movingCell).toBe(1) // it travels as a man, lands as a king

        const g2 = makeGame()
        setPosition(g2, [[2, 3, 1], [1, 4, 2], [5, 0, 2]], 1)
        const b2 = snap(g2)
        g2.makeMove(step('p1', [2, 3], [0, 5]))
        const capturePlan = planOf(deriveCheckersMotion(b2, snap(g2), 2))
        expect(capturePlan.promoted).toBe(true)
        expect(capturePlan.captured).toEqual([{ square: [1, 4], cell: 2, hopIndex: 0 }])
    })

    it('does not call a king moving a promotion', () => {
        const g = makeGame()
        setPosition(g, [[1, 2, 3], [5, 6, 2]], 1)
        const before = snap(g)
        g.makeMove(step('p1', [1, 2], [0, 1]))
        expect(planOf(deriveCheckersMotion(before, snap(g), 2)).promoted).toBe(false)
    })

    it('says nothing moved when the server echoes the move already on screen', () => {
        const g = makeGame()
        g.makeMove(step('p1', [5, 0], [4, 1]))
        const optimistic = snap(g)
        const echo = snap(g)
        echo.lastMove!.timestamp += 37 // the server's clock, not ours
        expect(deriveCheckersMotion(optimistic, echo, 1)).toEqual({ kind: 'none' })
        expect(deriveCheckersMotion(optimistic, optimistic, 1)).toEqual({ kind: 'none' })
        expect(deriveCheckersMotion(undefined, optimistic, 1)).toEqual({ kind: 'none' })
    })

    it('cancels (jump) when the state skips ahead more than one move', () => {
        const g = makeGame()
        const s0 = snap(g)
        g.makeMove(step('p1', [5, 0], [4, 1]))
        g.makeMove(step('p2', [2, 1], [3, 2]))
        expect(deriveCheckersMotion(s0, snap(g), 1)).toEqual({ kind: 'jump' })
    })

    it('cancels (jump) on a rematch that resets the board', () => {
        const g = makeGame()
        g.makeMove(step('p1', [5, 0], [4, 1]))
        const played = snap(g)
        const fresh = snap(makeGame())
        expect(deriveCheckersMotion(played, fresh, 1)).toEqual({ kind: 'jump' })
    })

    it('cancels (jump) when the origin does not hold the mover in the previous board', () => {
        const g = makeGame()
        const s0 = snap(g)
        g.makeMove(step('p1', [5, 0], [4, 1]))
        const s1 = snap(g)
        s0.board[5][0] = 0
        expect(deriveCheckersMotion(s0, s1, 2)).toEqual({ kind: 'jump' })
    })
})

describe('extendCheckersMotion', () => {
    it('refuses a plan that is not the next hop of the same chain', () => {
        const g = makeGame()
        const s0 = snap(g)
        g.makeMove(step('p1', [5, 0], [4, 1]))
        const s1 = snap(g)
        g.makeMove(step('p2', [2, 1], [3, 2]))
        const a = planOf(deriveCheckersMotion(s0, s1, 2))
        const b = planOf(deriveCheckersMotion(s1, snap(g), 2))
        expect(extendCheckersMotion(a, b)).toBeNull()
    })
})

describe('checkersMoverKeyframes', () => {
    const plan: CheckersMotionPlan = {
        side: 1, own: false, movingCell: 1, promoted: false, continuation: false, lifted: [],
        hops: [{ from: [6, 1], to: [4, 3], capture: [5, 2] }, { from: [4, 3], to: [2, 5], capture: [3, 4] }],
        captured: [{ square: [5, 2], cell: 2, hopIndex: 0 }, { square: [3, 4], cell: 2, hopIndex: 1 }],
    }

    it('moves in whole squares from the origin, lifting over each jumped piece', () => {
        const frames = checkersMoverKeyframes(plan, timeCheckersMotion(plan), false)
        expect(frames.map((f) => f.transform)).toEqual([
            'translate(0%, 0%)',
            'translate(100%, -100%) scale(1.12)',
            'translate(200%, -200%)',
            'translate(300%, -300%) scale(1.12)',
            'translate(400%, -400%)',
        ])
        expect(frames.map((f) => f.offset)).toEqual([0, 0.25, 0.5, 0.75, 1])
    })

    it('mirrors the direction on a flipped board', () => {
        const frames = checkersMoverKeyframes(plan, timeCheckersMotion(plan), true)
        expect(frames[frames.length - 1].transform).toBe('translate(-400%, 400%)')
    })
})
