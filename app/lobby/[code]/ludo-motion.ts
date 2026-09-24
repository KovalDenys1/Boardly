import { LudoColor, LudoGameData, LudoLastMove, LUDO_FINISH, LUDO_YARD } from '@/lib/games/ludo-game'
import { ludoTokenPoint } from '@/lib/games/ludo-layout'

/**
 * Motion for the Ludo board (#1113): what moved between two states, and along
 * which squares.
 *
 * Tokens used to glide on a CSS transform transition straight from the old
 * square to the new one, cutting across the corners of the cross, and a
 * captured token slid home the same way with nothing to say it was hit. Every
 * move is already described by `lastMove` (who, which token, from, to, who was
 * captured), so the path is the run of relative positions between `from` and
 * `to` – which the layout turns into squares, home column included.
 */

export interface LudoMotionVictim {
    playerId: string
    color: LudoColor
    token: number
    /** Relative position the victim was captured on (its own colour's numbering). */
    from: number
}

export interface LudoMotionPlan {
    playerId: string
    color: LudoColor
    token: number
    /** The viewer made this move: it walks a little faster. */
    own: boolean
    from: number
    to: number
    /**
     * The relative positions the token steps onto, in order, ending on `to`.
     * Leaving the yard is the single step onto the start square (0).
     */
    steps: number[]
    captured: LudoMotionVictim[]
}

/**
 * - `none`: nothing moved (a roll, the server echoing our optimistic move, a re-render).
 * - `jump`: tokens changed in a way the last move does not explain (a resync after
 *   a missed state, a rematch); cancel whatever is running and show the new state.
 * - `move`: animate `plan`.
 */
export type LudoMotionResult =
    | { kind: 'none' }
    | { kind: 'jump' }
    | { kind: 'move'; plan: LudoMotionPlan }

function sameMove(a: LudoLastMove | null | undefined, b: LudoLastMove | null | undefined): boolean {
    if (!a || !b) return !a && !b
    // No timestamp: the optimistic copy of our own move and the server's echo of
    // it carry different clocks but are the same move.
    return a.playerId === b.playerId && a.token === b.token && a.from === b.from && a.to === b.to
}

function sameTokens(prev: LudoGameData, next: LudoGameData): boolean {
    const ids = new Set([...Object.keys(prev.tokens ?? {}), ...Object.keys(next.tokens ?? {})])
    for (const id of ids) {
        const a = prev.tokens?.[id] ?? []
        const b = next.tokens?.[id] ?? []
        if (a.length !== b.length || a.some((p, i) => p !== b[i])) return false
    }
    return true
}

/** The relative positions a token steps onto moving from `from` to `to`. */
export function ludoPathSteps(from: number, to: number): number[] | null {
    if (!Number.isInteger(from) || !Number.isInteger(to)) return null
    if (from === LUDO_YARD) return to === 0 ? [0] : null
    if (from < 0 || to <= from || to > LUDO_FINISH) return null
    const steps: number[] = []
    for (let p = from + 1; p <= to; p += 1) steps.push(p)
    return steps
}

export function deriveLudoMotion(
    prev: LudoGameData | null | undefined,
    next: LudoGameData | null | undefined,
    viewerId: string | null
): LudoMotionResult {
    if (!next) return prev ? { kind: 'jump' } : { kind: 'none' }
    if (!prev || prev === next) return { kind: 'none' }

    const move = next.lastMove
    if (sameMove(prev.lastMove, move)) {
        // Same last move on both sides (a roll, an echo, a timeout note). If the
        // tokens changed anyway, something happened that we did not see.
        return sameTokens(prev, next) ? { kind: 'none' } : { kind: 'jump' }
    }
    if (!move) return { kind: 'jump' }

    const seat = next.seats.find((s) => s.playerId === move.playerId)
    const steps = ludoPathSteps(move.from, move.to)
    if (!seat || !steps) return { kind: 'jump' }
    if (prev.tokens?.[move.playerId]?.[move.token] !== move.from) return { kind: 'jump' }
    if (next.tokens?.[move.playerId]?.[move.token] !== move.to) return { kind: 'jump' }

    const captured: LudoMotionVictim[] = []
    for (const c of move.captured ?? []) {
        const victimSeat = next.seats.find((s) => s.playerId === c.playerId)
        if (!victimSeat) return { kind: 'jump' }
        if (prev.tokens?.[c.playerId]?.[c.token] !== c.from) return { kind: 'jump' }
        if (next.tokens?.[c.playerId]?.[c.token] !== LUDO_YARD) return { kind: 'jump' }
        captured.push({ playerId: c.playerId, color: victimSeat.color, token: c.token, from: c.from })
    }

    // Every other token must be where it was; otherwise more than this one move
    // happened between the two states (a bonus-roll move we never saw).
    const explained = new Set([`${move.playerId}:${move.token}`, ...captured.map((c) => `${c.playerId}:${c.token}`)])
    const ids = new Set([...Object.keys(prev.tokens ?? {}), ...Object.keys(next.tokens ?? {})])
    for (const id of ids) {
        const a = prev.tokens?.[id] ?? []
        const b = next.tokens?.[id] ?? []
        if (a.length !== b.length) return { kind: 'jump' }
        for (let i = 0; i < a.length; i += 1) {
            if (!explained.has(`${id}:${i}`) && a[i] !== b[i]) return { kind: 'jump' }
        }
    }

    return {
        kind: 'move',
        plan: {
            playerId: move.playerId,
            color: seat.color,
            token: move.token,
            own: viewerId !== null && viewerId === move.playerId,
            from: move.from,
            to: move.to,
            steps,
            captured,
        },
    }
}

// ─── Timing ──────────────────────────────────────────────────────────────────

/** An arriving move, per square. */
export const STEP_MS = 100
/** The viewer's own move, per square: snappier, it still walks. */
export const OWN_STEP_MS = 80
/** A long move never takes longer than this in total (a 6 is 6 squares; this caps anything). */
export const MAX_TRAVEL_MS = 700
export const OWN_MAX_TRAVEL_MS = 560
/** Leaving the yard crosses several cells in one step; give it room to read. */
export const ENTER_MS = 260
export const OWN_ENTER_MS = 200
/** A one-square move still needs to be seen. */
export const MIN_TRAVEL_MS = 180
/** The victim's hit cue, once the mover has landed. */
export const HIT_MS = 180
/** The victim fades out on the square it was taken on... */
export const VANISH_MS = 140
/** ...and fades back in on its yard spot. */
export const RETURN_MS = 200

export interface LudoMotionTiming {
    /** Start of each step, ms from the start of the run. */
    stepStarts: number[]
    stepDuration: number
    /** The mover has landed (the victim's hit starts here). */
    travel: number
    total: number
}

export function timeLudoMotion(plan: LudoMotionPlan): LudoMotionTiming {
    const n = Math.max(1, plan.steps.length)
    let travel: number
    if (plan.from === LUDO_YARD) {
        travel = plan.own ? OWN_ENTER_MS : ENTER_MS
    } else {
        const per = plan.own ? OWN_STEP_MS : STEP_MS
        const cap = plan.own ? OWN_MAX_TRAVEL_MS : MAX_TRAVEL_MS
        travel = Math.min(cap, Math.max(MIN_TRAVEL_MS, per * n))
    }
    const stepDuration = travel / n
    const stepStarts = Array.from({ length: n }, (_, i) => i * stepDuration)
    const total = plan.captured.length ? travel + HIT_MS + VANISH_MS + RETURN_MS : travel
    return { stepStarts, stepDuration, travel, total }
}

// ─── Keyframes ───────────────────────────────────────────────────────────────

export interface Point {
    x: number
    y: number
}

/** SVG user units: the board's viewBox is one unit per cell, so px here are cells. */
const at = ({ x, y }: Point, scale = 1) =>
    `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)${scale === 1 ? '' : ` scale(${scale})`}`

/**
 * Transform keyframes for the travelling token: one hop per square, lifting a
 * little between squares, so it visibly walks the track and turns its corners.
 *
 * `start` and `end` are where the token was and is drawn (tokens sharing a
 * square are fanned out, so they are not always the bare square centre).
 */
export function ludoMoverKeyframes(plan: LudoMotionPlan, start: Point, end: Point): Keyframe[] {
    const points = plan.steps.map((p, i) =>
        i === plan.steps.length - 1 ? end : ludoTokenPoint(plan.color, p, plan.token)
    )
    const n = points.length
    const frames: Keyframe[] = [{ transform: at(start), offset: 0, easing: 'ease-in' }]
    let previous = start
    points.forEach((point, i) => {
        const mid = { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 }
        frames.push({ transform: at(mid, 1.14), offset: (i + 0.5) / n, easing: 'ease-out' })
        frames.push({ transform: at(point), offset: (i + 1) / n, easing: 'ease-in' })
        previous = point
    })
    return frames
}

/**
 * Keyframes for a captured token over the whole run: it waits on the square it
 * was taken on until the mover lands, shakes, fades out there and fades back in
 * on its yard spot – it never slides across the board.
 */
export function ludoVictimKeyframes(timing: LudoMotionTiming, start: Point, yard: Point): Keyframe[] {
    const { travel, total } = timing
    const o = (ms: number) => Math.min(1, ms / total)
    const hitEnd = travel + HIT_MS
    const gone = hitEnd + VANISH_MS
    const shake = (dx: number) => ({ x: start.x + dx, y: start.y })
    return [
        { transform: at(start), opacity: 1, offset: 0 },
        { transform: at(start), opacity: 1, offset: o(travel) },
        { transform: at(shake(0.14), 1.22), opacity: 1, offset: o(travel + HIT_MS * 0.25) },
        { transform: at(shake(-0.14), 1.22), opacity: 1, offset: o(travel + HIT_MS * 0.55) },
        { transform: at(shake(0.06), 1.1), opacity: 1, offset: o(travel + HIT_MS * 0.8) },
        { transform: at(start), opacity: 1, offset: o(hitEnd), easing: 'ease-in' },
        { transform: at(start, 0.4), opacity: 0, offset: o(gone) },
        { transform: at(yard, 0.4), opacity: 0, offset: o(gone), easing: 'ease-out' },
        { transform: at(yard), opacity: 1, offset: 1 },
    ]
}

// ─── Last-move ring ──────────────────────────────────────────────────────────

/** Identifies one move for the last-move ring; equal keys are the same move. */
export function ludoRingKey(move: { playerId: string; token: number; from: number; to: number } | null | undefined): string | null {
    return move ? `${move.playerId}-${move.token}:${move.from}:${move.to}` : null
}

export interface LudoRingTiming {
    key: string
    /** CSS animation delay: the ring pops in as the walking token lands. */
    delay: number
}

/**
 * The ring's delay, frozen once per move.
 *
 * The run is cleared when it ends, and a delay read straight off it would drop
 * to 0 then – restarting the ring's CSS animation as if it had begun `travel`
 * ms earlier, so it snaps to full size instead of popping in. The first run
 * that matches the ring's move sets the delay; nothing after it changes it until
 * the next move. Returns `prev` itself when nothing changed.
 */
export function nextLudoRingTiming(
    prev: LudoRingTiming | null,
    ringKey: string | null,
    motion: { plan: LudoMotionPlan; timing: LudoMotionTiming } | null
): LudoRingTiming | null {
    if (!ringKey) return null
    const motionDelay = motion && ludoRingKey(motion.plan) === ringKey ? motion.timing.travel : null
    if (prev?.key === ringKey) {
        // The state (and so the ring) renders once before its run is set up.
        return prev.delay === 0 && motionDelay ? { key: ringKey, delay: motionDelay } : prev
    }
    return { key: ringKey, delay: motionDelay ?? 0 }
}
