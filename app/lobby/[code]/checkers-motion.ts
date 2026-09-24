import {
    BOARD_SIZE,
    CheckersCell,
    CheckersGameData,
    CheckersMoveRecord,
    Side,
    Square,
    isKing,
    pieceSide,
} from '@/lib/games/checkers-game'

/**
 * Motion for the Checkers board (#1112): what moved between two states, and when.
 *
 * The page renders pieces per square, so without this an opponent's piece
 * vanishes from one square and appears on another. The server applies one hop
 * per move and keeps growing `lastMove.path` while a capture chain continues, so
 * everything a travel animation needs is already in two consecutive states.
 */

export interface CheckersMotionHop {
    from: Square
    to: Square
    /** The jumped square, or null for a plain step. */
    capture: Square | null
    /**
     * Earliest start, ms from the start of the run. Set on a chain hop that
     * joined a run in flight: it cannot start before it arrived, or the part
     * that should already have played would be skipped.
     */
    minStart?: number
}

export interface CheckersMotionPlan {
    side: Side
    /** The viewer made this move: it glides, faster, and makes no sound. */
    own: boolean
    hops: CheckersMotionHop[]
    /** The piece as it stood before the first hop (a man stays a man in flight). */
    movingCell: CheckersCell
    /** Pieces jumped by these hops, with the hop that jumps each. */
    captured: { square: Square; cell: CheckersCell; hopIndex: number }[]
    /** Pieces jumped earlier in the turn and lifted now that the turn has ended. */
    lifted: { square: Square; cell: CheckersCell }[]
    /** A man became a king on the final square. */
    promoted: boolean
    /** These hops extend the chain the previous state was already showing. */
    continuation: boolean
}

/**
 * - `none`: nothing moved (the server echoing our optimistic move, a chat re-render).
 * - `jump`: the board changed in a way no single arriving move explains (a resync
 *   after a gap, a rematch); cancel whatever is running and show the new state.
 * - `move`: animate `plan`.
 */
export type CheckersMotionResult =
    | { kind: 'none' }
    | { kind: 'jump' }
    | { kind: 'move'; plan: CheckersMotionPlan }

function sameSq(a: Square | undefined, b: Square | undefined): boolean {
    return !!a && !!b && a[0] === b[0] && a[1] === b[1]
}

function isPrefix(shorter: readonly Square[], longer: readonly Square[]): boolean {
    return shorter.length <= longer.length && shorter.every((sq, i) => sameSq(sq, longer[i]))
}

function sameRecord(a: CheckersMoveRecord | null, b: CheckersMoveRecord | null): boolean {
    if (!a || !b) return a === b
    // No timestamp: the optimistic copy of our own move and the server's echo of
    // it carry different clocks but are the same move.
    return a.side === b.side && a.path.length === b.path.length && isPrefix(a.path, b.path)
}

function cellAt(board: readonly (readonly number[])[], [r, c]: Square): CheckersCell {
    return (board[r]?.[c] ?? 0) as CheckersCell
}

function toHop(from: Square, to: Square): CheckersMotionHop | null {
    const dr = to[0] - from[0]
    const dc = to[1] - from[1]
    const inBounds = (n: number) => n >= 0 && n < BOARD_SIZE
    if (![from[0], from[1], to[0], to[1]].every(inBounds)) return null
    if (Math.abs(dr) !== Math.abs(dc)) return null
    if (Math.abs(dr) === 1) return { from, to, capture: null }
    if (Math.abs(dr) === 2) return { from, to, capture: [from[0] + dr / 2, from[1] + dc / 2] }
    return null
}

export function deriveCheckersMotion(
    prev: CheckersGameData | null | undefined,
    next: CheckersGameData | null | undefined,
    viewerSide: Side | null
): CheckersMotionResult {
    if (!next) return prev ? { kind: 'jump' } : { kind: 'none' }
    if (!prev) return { kind: 'none' }
    if (prev === next) return { kind: 'none' }
    const pl = prev.lastMove
    const nl = next.lastMove
    const prevCount = Array.isArray(prev.moveHistory) ? prev.moveHistory.length : 0
    const nextCount = Array.isArray(next.moveHistory) ? next.moveHistory.length : 0

    if (sameRecord(pl, nl) && prevCount === nextCount) {
        // Same move on both sides. Anything else that differs (a timeout ending
        // the game, the result) is not travel.
        return { kind: 'none' }
    }
    if (!nl || nl.path.length < 2) return { kind: 'jump' }

    let start: number
    let continuation = false
    if (
        pl && prev.chainFrom && nextCount === prevCount &&
        pl.side === nl.side &&
        isPrefix(pl.path, nl.path) && nl.path.length > pl.path.length &&
        sameSq(prev.chainFrom, pl.path[pl.path.length - 1])
    ) {
        start = pl.path.length - 1
        continuation = true
    } else if (!prev.chainFrom && nextCount === prevCount + 1 && prev.currentSide === nl.side) {
        start = 0
    } else {
        return { kind: 'jump' }
    }

    const origin = nl.path[start]
    const movingCell = cellAt(prev.board, origin)
    if (pieceSide(movingCell) !== nl.side) return { kind: 'jump' }

    const hops: CheckersMotionHop[] = []
    for (let i = start; i < nl.path.length - 1; i++) {
        const hop = toHop(nl.path[i], nl.path[i + 1])
        if (!hop) return { kind: 'jump' }
        hops.push(hop)
    }

    const captured = hops.flatMap((hop, hopIndex) =>
        hop.capture ? [{ square: hop.capture, cell: cellAt(prev.board, hop.capture), hopIndex }] : []
    )
    const turnEnded = next.chainFrom === null
    const lifted = turnEnded
        ? (prev.pendingCaptures ?? [])
            .filter((sq) => !captured.some((c) => sameSq(c.square, sq)))
            .map((sq) => ({ square: [sq[0], sq[1]] as Square, cell: cellAt(prev.board, sq) }))
        : []
    const dest = nl.path[nl.path.length - 1]

    return {
        kind: 'move',
        plan: {
            side: nl.side,
            own: viewerSide !== null && viewerSide === nl.side,
            hops,
            movingCell,
            captured,
            lifted,
            promoted: !isKing(movingCell) && isKing(cellAt(next.board, dest)),
            continuation,
        },
    }
}

// ─── Timing ──────────────────────────────────────────────────────────────────

/** The viewer's own move: snappy, but it still travels so the board never teleports. */
export const OWN_HOP_MS = 160
/** An arriving plain step. */
export const STEP_MS = 260
/** An arriving jump, per hop. */
export const JUMP_HOP_MS = 220
/** A jumped piece fades out over this long, starting as the mover passes over it. */
export const CAPTURE_FADE_MS = 220

export interface CheckersMotionTiming {
    /** Start of each hop, ms from the start of the run. */
    hopStarts: number[]
    hopDurations: number[]
    /** When each captured piece starts to fade (the mover is over it). */
    captureStarts: number[]
    /** When lifted pieces go (the mover has landed). */
    liftStart: number
    total: number
}

export function timeCheckersMotion(plan: CheckersMotionPlan): CheckersMotionTiming {
    const hopDurations = plan.hops.map((hop) => (plan.own ? OWN_HOP_MS : hop.capture ? JUMP_HOP_MS : STEP_MS))
    const hopStarts: number[] = []
    let t = 0
    plan.hops.forEach((hop, i) => {
        t = Math.max(t, hop.minStart ?? 0)
        hopStarts.push(t)
        t += hopDurations[i]
    })
    const captureStarts = plan.captured.map(({ hopIndex }) => hopStarts[hopIndex] + hopDurations[hopIndex] / 2)
    const liftStart = t
    const total = Math.max(t, ...captureStarts.map((s) => s + CAPTURE_FADE_MS), plan.lifted.length ? t + CAPTURE_FADE_MS : 0)
    return { hopStarts, hopDurations, captureStarts, liftStart, total }
}

/**
 * Chain hops that arrive while the previous hop is still in the air join the
 * running animation instead of restarting it, so each hop plays in order.
 *
 * `elapsed` is how far the running animation has played. The joining hops
 * start at the later of that and the end of the travel already planned, so a
 * hop that arrives during the previous hop's capture fade plays whole instead
 * of starting part-way through.
 */
export function extendCheckersMotion(
    current: CheckersMotionPlan,
    next: CheckersMotionPlan,
    elapsed = 0
): CheckersMotionPlan | null {
    if (!next.continuation || next.side !== current.side) return null
    const lastTo = current.hops[current.hops.length - 1]?.to
    if (!sameSq(lastTo, next.hops[0]?.from)) return null
    const offset = current.hops.length
    const travelEnd = timeCheckersMotion(current).liftStart
    const [firstNew, ...restNew] = next.hops
    return {
        ...current,
        hops: [...current.hops, { ...firstNew, minStart: Math.max(elapsed, travelEnd) }, ...restNew],
        captured: [...current.captured, ...next.captured.map((c) => ({ ...c, hopIndex: c.hopIndex + offset }))],
        // Pieces jumped by the earlier hops stay dimmed (lifted) until the chain
        // lands, the way they sit on the board mid-chain; they are not faded again.
        lifted: next.lifted,
        promoted: current.promoted || next.promoted,
    }
}

export type CheckersSquareMotion =
    /** Still on the board, jumped mid-chain: dips to the pending fade as the mover passes. */
    | { kind: 'jumped'; delay: number }
    /** Taken by a hop in this run and already gone from the state: fades out as the mover passes. */
    | { kind: 'captured'; cell: CheckersCell; delay: number }
    /** Taken earlier in the turn, lifted now: stays dimmed, goes when the mover lands. */
    | { kind: 'lifted'; cell: CheckersCell; delay: number }

/**
 * What one square shows while a run animates, or null for its normal render.
 * `delay` is the CSS animation delay, already shifted by how far the run had
 * played when this render began.
 */
export function checkersSquareMotion(
    plan: CheckersMotionPlan,
    timing: CheckersMotionTiming,
    offset: number,
    square: Square,
    boardCell: number
): CheckersSquareMotion | null {
    const onBoard = pieceSide(boardCell) !== null
    const lifted = plan.lifted.find((l) => sameSq(l.square, square))
    if (lifted && !onBoard && pieceSide(lifted.cell)) {
        return { kind: 'lifted', cell: lifted.cell, delay: timing.liftStart - offset }
    }
    const index = plan.captured.findIndex((c) => sameSq(c.square, square))
    if (index === -1) return null
    const delay = timing.captureStarts[index] - offset
    if (onBoard) return { kind: 'jumped', delay }
    const { cell } = plan.captured[index]
    return pieceSide(cell) ? { kind: 'captured', cell, delay } : null
}

/**
 * Transform keyframes for the travelling piece, in units of its own size (a
 * translate percentage is relative to the element, and the mover is one square),
 * so they hold whatever size the board is. A jump lifts the piece at mid-hop.
 */
export function checkersMoverKeyframes(
    plan: CheckersMotionPlan,
    timing: CheckersMotionTiming,
    flipped: boolean
): Keyframe[] {
    const disp = ([r, c]: Square): Square => (flipped ? [BOARD_SIZE - 1 - r, BOARD_SIZE - 1 - c] : [r, c])
    const origin = disp(plan.hops[0].from)
    const at = (sq: Square, scale = 1) => {
        const [r, c] = disp(sq)
        const scalePart = scale === 1 ? '' : ` scale(${scale})`
        return `translate(${(c - origin[1]) * 100}%, ${(r - origin[0]) * 100}%)${scalePart}`
    }
    const total = timing.hopStarts.length ? timing.hopStarts[timing.hopStarts.length - 1] + timing.hopDurations[timing.hopDurations.length - 1] : 1
    const frames: Keyframe[] = [{ transform: at(plan.hops[0].from), offset: 0, easing: 'ease-in-out' }]
    let previousEnd = 0
    plan.hops.forEach((hop, i) => {
        if (timing.hopStarts[i] > previousEnd) {
            // A joined hop that waits: hold on its origin until it starts.
            frames.push({ transform: at(hop.from), offset: timing.hopStarts[i] / total, easing: 'ease-in-out' })
        }
        previousEnd = timing.hopStarts[i] + timing.hopDurations[i]
        const end = previousEnd / total
        if (hop.capture) {
            const mid = (timing.hopStarts[i] + timing.hopDurations[i] / 2) / total
            frames.push({ transform: at(hop.capture, 1.12), offset: mid, easing: 'ease-in-out' })
        }
        frames.push({ transform: at(hop.to), offset: end, easing: 'ease-in-out' })
    })
    return frames
}
