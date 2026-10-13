import React, { useLayoutEffect } from 'react'
import {
    BOARD_SIZE,
    type Side,
    type Square,
    isDarkSquare,
    isKing,
    pieceSide,
    sameSquare,
} from '@/lib/games/checkers-game'
import { type ActiveCheckersMotion, checkersMoverKeyframes, checkersSquareMotion } from '@/lib/games/checkers-motion'

// Fixed colours, not theme tokens: like Connect Four's board, a checkerboard is
// a self-contained object that must read the same in light and dark theme.
const SQUARE_LIGHT = '#F2E1C2'
const SQUARE_DARK = '#9C6A43'
const FRAME = '#3B2A1E'
export const PIECE_DARK = '#2A2420'
export const PIECE_LIGHT = '#FFF6E4'
const HIGHLIGHT = '#35C28F'
const LAST_MOVE_TINT = 'rgba(255,196,77,0.55)'

export const FILES = 'abcdefgh'
/** Squares named from Dark's side, the way a printed diagram names them. */
export function squareName([r, c]: Square): string {
    return `${FILES[c]}${BOARD_SIZE - r}`
}

function CrownMark({ color, pop }: { color: string; pop?: boolean }) {
    return (
        <svg className={pop ? 'ck-crown ck-crown--pop' : 'ck-crown'} viewBox="0 0 24 24" width="46%" height="46%" aria-hidden="true" style={{ display: 'block' }}>
            <path d="M4 17h16l1.4-9.2-5 3.6L12 5l-4.4 6.4-5-3.6z" fill={color} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
    )
}

function CheckersPiece({ side, king, faded, popCrown, motionClass, motionStyle }: {
    side: Side
    king: boolean
    faded?: boolean
    popCrown?: boolean
    /** `ck-piece--jumped` / `ck-piece--captured` while a move animates (#1112). */
    motionClass?: string
    motionStyle?: React.CSSProperties
}) {
    const fill = side === 1 ? PIECE_DARK : PIECE_LIGHT
    const ring = side === 1 ? 'rgba(255,255,255,0.22)' : 'rgba(120,90,50,0.35)'
    return (
        <div
            className={motionClass ? `ck-piece ${motionClass}` : 'ck-piece'}
            style={{
                background: fill,
                boxShadow: `inset 0 0 0 3px ${ring}, 0 3px 0 rgba(0,0,0,0.35)`,
                opacity: faded ? 0.35 : 1,
                ...motionStyle,
            }}
        >
            {king && <CrownMark color={side === 1 ? '#FFC44D' : '#B7791F'} pop={popCrown} />}
        </div>
    )
}

const ms = (value: number) => `${Math.round(value)}ms`

export default function CheckersBoard({
    board, flipped, selected, movable, mustCapture, destinations, lastPath, pendingCaptures, disabled, onSquareClick, squareLabel,
    motion, popCrownAt,
}: {
    board: number[][]
    flipped: boolean
    selected: Square | null
    movable: Square[]
    mustCapture: boolean
    destinations: Square[]
    lastPath: Square[]
    pendingCaptures: Square[]
    disabled: boolean
    onSquareClick: (r: number, c: number) => void
    squareLabel: (square: Square) => string
    /** The move in flight, if any (#1112). */
    motion: ActiveCheckersMotion | null
    /** The square of a man just crowned; its crown pops in when it lands. */
    popCrownAt: Square | null
}) {
    const order = Array.from({ length: BOARD_SIZE }, (_, i) => (flipped ? BOARD_SIZE - 1 - i : i))
    const moverRef = React.useRef<HTMLDivElement>(null)
    const plan = motion?.plan ?? null
    const moverDest = plan ? plan.hops[plan.hops.length - 1].to : null
    const moverOrigin = plan ? plan.hops[0].from : null
    const display = (n: number) => (flipped ? BOARD_SIZE - 1 - n : n)

    // The travelling piece: one transform animation over every hop, measured in
    // squares (see checkersMoverKeyframes). A chain hop that extends the run
    // restarts it at the time already played, so the piece does not jump back.
    useLayoutEffect(() => {
        const el = moverRef.current
        if (!motion || !el || typeof el.animate !== 'function') return
        const { timing } = motion
        const travel = timing.liftStart
        const animation = el.animate(checkersMoverKeyframes(motion.plan, timing, flipped), { duration: travel, fill: 'both' })
        animation.currentTime = Math.min(motion.offset, travel)
        return () => animation.cancel()
    }, [motion, flipped])

    return (
        <div className="ck-board" style={{ background: FRAME }} data-testid="checkers-board">
            {order.map((r) =>
                order.map((c) => {
                    const dark = isDarkSquare(r, c)
                    const cell = board[r]?.[c] ?? 0
                    const side = pieceSide(cell)
                    const isSelected = sameSquare(selected, r, c)
                    const isMovable = movable.some(([mr, mc]) => mr === r && mc === c)
                    const isDestination = destinations.some(([dr, dc]) => dr === r && dc === c)
                    const onLastPath = lastPath.some(([lr, lc]) => lr === r && lc === c)
                    const isPendingCapture = pendingCaptures.some(([pr, pc]) => pr === r && pc === c)
                    const clickable = !disabled && dark && (isMovable || isDestination || isSelected)
                    // While a move is in flight its piece is drawn by the mover, so
                    // the destination square holds nothing until it lands.
                    const hiddenForMover = sameSquare(moverDest, r, c)
                    let pieceNode: React.ReactNode = null
                    const squareMotion = motion && plan ? checkersSquareMotion(plan, motion.timing, motion.offset, [r, c], cell) : null
                    if (squareMotion?.kind === 'jumped' && side) {
                        // Jumped mid-chain: it stays until the turn ends, faded as the mover passes.
                        pieceNode = <CheckersPiece key={`j${motion!.epoch}`} side={side} king={isKing(cell)} faded motionClass="ck-piece--jumped" motionStyle={{ animationDelay: ms(squareMotion.delay) }} />
                    } else if (squareMotion?.kind === 'captured') {
                        // Taken and already lifted from the state: a ghost fades out as the mover passes.
                        pieceNode = <CheckersPiece key={`c${motion!.epoch}`} side={pieceSide(squareMotion.cell)!} king={isKing(squareMotion.cell)} motionClass="ck-piece--captured" motionStyle={{ animationDelay: ms(squareMotion.delay) }} />
                    } else if (squareMotion?.kind === 'lifted') {
                        // Taken earlier in the turn: stays dimmed until the mover lands.
                        pieceNode = <CheckersPiece key={`l${motion!.epoch}`} side={pieceSide(squareMotion.cell)!} king={isKing(squareMotion.cell)} motionClass="ck-piece--captured ck-piece--lifted" motionStyle={{ animationDelay: ms(squareMotion.delay) }} />
                    } else if (side && !hiddenForMover) {
                        pieceNode = <CheckersPiece side={side} king={isKing(cell)} faded={isPendingCapture} popCrown={sameSquare(popCrownAt, r, c)} />
                    }
                    let ring = 'none'
                    if (isSelected) ring = `inset 0 0 0 3px ${HIGHLIGHT}`
                    else if (isMovable && mustCapture) ring = `inset 0 0 0 3px ${HIGHLIGHT}`
                    else if (isMovable) ring = `inset 0 0 0 2px rgba(53,194,143,0.55)`
                    return (
                        <button
                            key={`${r}-${c}`}
                            type="button"
                            className="ck-square"
                            data-square={squareName([r, c])}
                            data-movable={isMovable || undefined}
                            data-destination={isDestination || undefined}
                            aria-label={squareLabel([r, c])}
                            aria-pressed={isSelected || undefined}
                            disabled={!dark || disabled}
                            onClick={() => clickable && onSquareClick(r, c)}
                            style={{
                                background: dark ? SQUARE_DARK : SQUARE_LIGHT,
                                boxShadow: ring,
                                cursor: clickable ? 'pointer' : 'default',
                            }}
                        >
                            {onLastPath && <span className="ck-last" style={{ background: LAST_MOVE_TINT }} />}
                            {pieceNode}
                            {isDestination && <span className="ck-dot" style={{ background: HIGHLIGHT }} />}
                        </button>
                    )
                })
            )}
            {plan && moverOrigin && (
                <div
                    ref={moverRef}
                    className="ck-mover"
                    aria-hidden="true"
                    data-testid="checkers-mover"
                    style={{
                        left: `calc(var(--ck-pad) + ${display(moverOrigin[1])} * var(--ck-cell))`,
                        top: `calc(var(--ck-pad) + ${display(moverOrigin[0])} * var(--ck-cell))`,
                    }}
                >
                    <CheckersPiece side={pieceSide(plan.movingCell) ?? plan.side} king={isKing(plan.movingCell)} />
                </div>
            )}
        </div>
    )
}
