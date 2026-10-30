import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ActiveLudoMotion } from '@/app/(site)/lobby/[code]/hooks/useLudoMotion'
import {
    LudoColor,
    LUDO_COLORS,
    LUDO_FINISH,
    LUDO_SAFE_SQUARES,
    LUDO_START_OFFSET,
    LUDO_YARD,
} from '@/lib/games/ludo-game'
import {
    LUDO_HOME_COLUMN_CELLS,
    LUDO_TRACK_CELLS,
    LUDO_YARD_ORIGIN,
    ludoTokenPoint,
} from '@/lib/games/ludo-layout'
import { LudoRingTiming, Point, ludoMoverKeyframes, ludoVictimKeyframes, nextLudoRingTiming } from '@/lib/games/ludo-motion'

/** Token and yard colours. */
export const COLOR_FILL: Record<LudoColor, string> = {
    red: 'var(--bd-coral)',
    green: 'var(--bd-mint)',
    yellow: 'var(--bd-sun)',
    blue: 'var(--bd-sky)',
}
const BOARD_BG = 'var(--bd-card-warm)'
const CELL_BG = 'var(--bd-board-cell)'
const BOARD_LINE = 'var(--bd-board-line)'

function tintOf(color: LudoColor): string {
    return `color-mix(in srgb, ${COLOR_FILL[color]} 30%, ${CELL_BG})`
}

function StarMark({ x, y }: { x: number; y: number }) {
    // Five-point star inside one cell, centred on (x, y).
    const points = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 === 0 ? 0.36 : 0.15
        const a = (Math.PI / 5) * i - Math.PI / 2
        return `${(x + r * Math.cos(a)).toFixed(3)},${(y + r * Math.sin(a)).toFixed(3)}`
    }).join(' ')
    return <polygon points={points} style={{ fill: 'none', stroke: BOARD_LINE, strokeWidth: 0.06, strokeLinejoin: 'round', opacity: 0.55 }} />
}

export interface BoardToken {
    playerId: string
    color: LudoColor
    token: number
    position: number
    selectable: boolean
    isMine: boolean
}

export function LudoBoard({
    tokens,
    activeColors,
    onTokenClick,
    lastMovedKey,
    lastMoveRingKey,
    motion,
    tokenLabel,
    boardLabel,
}: {
    boardLabel: string
    tokens: BoardToken[]
    activeColors: LudoColor[]
    onTokenClick: (token: number) => void
    lastMovedKey: string | null
    /** Identifies the last move itself, so its ring restarts on each new move. */
    lastMoveRingKey: string | null
    motion: ActiveLudoMotion | null
    tokenLabel: (token: BoardToken) => string
}) {
    // Tokens that share a square are fanned out a little so each stays visible and tappable.
    const placed = useMemo(() => {
        const groups = new Map<string, Array<{ token: BoardToken; point: { x: number; y: number } }>>()
        for (const token of tokens) {
            const point = ludoTokenPoint(token.color, token.position, token.token)
            const key = `${point.x.toFixed(2)}:${point.y.toFixed(2)}`
            const group = groups.get(key)
            if (group) group.push({ token, point })
            else groups.set(key, [{ token, point }])
        }
        const result: Array<BoardToken & { x: number; y: number; r: number }> = []
        for (const group of groups.values()) {
            group.forEach(({ token, point }, index) => {
                const shift = group.length > 1 ? (index - (group.length - 1) / 2) * 0.24 : 0
                const isFinished = token.position >= LUDO_FINISH
                result.push({
                    ...token,
                    x: point.x + shift,
                    y: point.y + shift * 0.5,
                    r: isFinished ? 0.24 : group.length > 1 ? 0.3 : 0.36,
                })
            })
        }
        // Selectable tokens last, so they paint on top and take the tap.
        return result.sort((a, b) => Number(a.selectable) - Number(b.selectable))
    }, [tokens])

    // Motion (#1113). Where each token is drawn now, and where it was drawn
    // before the last change of position: a walk starts from the old spot,
    // fan-out included, not from the bare square centre.
    const tokenEls = useRef(new Map<string, SVGGElement>())
    const drawnRef = useRef<{ prev: Map<string, Point>; curr: Map<string, Point> }>({ prev: new Map(), curr: new Map() })
    useLayoutEffect(() => {
        const next = new Map(placed.map((t) => [`${t.playerId}-${t.token}`, { x: t.x, y: t.y }] as const))
        const { curr } = drawnRef.current
        const moved = next.size !== curr.size || [...next].some(([key, p]) => {
            const q = curr.get(key)
            return !q || q.x !== p.x || q.y !== p.y
        })
        drawnRef.current = { prev: moved ? curr : drawnRef.current.prev, curr: next }
    }, [placed])

    // One transform (+ opacity) animation per token the move touches. The
    // tokens' own transform is already the new state, so cancelling a run –
    // a newer move, a resync, the run ending – settles every token where it is.
    useLayoutEffect(() => {
        if (!motion) return
        const { plan, timing } = motion
        const { prev, curr } = drawnRef.current
        const animations: Animation[] = []
        const moverKey = `${plan.playerId}-${plan.token}`
        const mover = tokenEls.current.get(moverKey)
        const moverEnd = curr.get(moverKey)
        if (mover && moverEnd && typeof mover.animate === 'function') {
            const start = prev.get(moverKey) ?? ludoTokenPoint(plan.color, plan.from, plan.token)
            animations.push(mover.animate(ludoMoverKeyframes(plan, start, moverEnd), { duration: timing.travel, fill: 'both' }))
        }
        for (const victim of plan.captured) {
            const key = `${victim.playerId}-${victim.token}`
            const el = tokenEls.current.get(key)
            if (!el || typeof el.animate !== 'function') continue
            const start = prev.get(key) ?? ludoTokenPoint(victim.color, victim.from, victim.token)
            const yard = curr.get(key) ?? ludoTokenPoint(victim.color, LUDO_YARD, victim.token)
            animations.push(el.animate(ludoVictimKeyframes(timing, start, yard), { duration: timing.total, fill: 'both' }))
        }
        return () => animations.forEach((a) => a.cancel())
    }, [motion])

    // The ring's delay is frozen per move (nextLudoRingTiming): read off the
    // run, it would drop to 0 when the run ends and restart the pop-in.
    const [ringTiming, setRingTiming] = useState<LudoRingTiming | null>(null)
    const nextRing = nextLudoRingTiming(ringTiming, lastMoveRingKey, motion)
    if (nextRing !== ringTiming) setRingTiming(nextRing)
    const ringDelay = nextRing?.delay ?? 0

    const startSquares = new Map(LUDO_COLORS.map((color) => [LUDO_START_OFFSET[color], color] as const))

    return (
        <svg className="ludo-board" viewBox="0 0 15 15" role="img" aria-label={boardLabel} data-testid="ludo-board">
            <rect x={0} y={0} width={15} height={15} rx={0.5} style={{ fill: BOARD_BG }} />

            {/* Yards */}
            {LUDO_COLORS.map((color) => {
                const [row, col] = LUDO_YARD_ORIGIN[color]
                const inPlay = activeColors.includes(color)
                return (
                    <g key={`yard-${color}`} style={{ opacity: inPlay ? 1 : 0.35 }}>
                        <rect x={col + 0.15} y={row + 0.15} width={5.7} height={5.7} rx={0.6} style={{ fill: COLOR_FILL[color], stroke: BOARD_LINE, strokeWidth: 0.08 }} />
                        <rect x={col + 1} y={row + 1} width={4} height={4} rx={0.5} style={{ fill: CELL_BG, stroke: BOARD_LINE, strokeWidth: 0.06 }} />
                        {[[2, 2], [2, 4], [4, 2], [4, 4]].map(([dy, dx]) => (
                            <circle key={`${dy}-${dx}`} cx={col + dx} cy={row + dy} r={0.42} style={{ fill: tintOf(color), stroke: BOARD_LINE, strokeWidth: 0.04 }} />
                        ))}
                    </g>
                )
            })}

            {/* Shared track */}
            {LUDO_TRACK_CELLS.map(([row, col], index) => {
                const startColor = startSquares.get(index)
                return (
                    <g key={`track-${index}`}>
                        <rect x={col} y={row} width={1} height={1} style={{ fill: startColor ? tintOf(startColor) : CELL_BG, stroke: BOARD_LINE, strokeWidth: 0.04 }} />
                        {LUDO_SAFE_SQUARES.has(index) && !startColor && <StarMark x={col + 0.5} y={row + 0.5} />}
                    </g>
                )
            })}

            {/* Home columns */}
            {LUDO_COLORS.map((color) =>
                LUDO_HOME_COLUMN_CELLS[color].map(([row, col]) => (
                    <rect key={`home-${color}-${row}-${col}`} x={col} y={row} width={1} height={1} style={{ fill: tintOf(color), stroke: BOARD_LINE, strokeWidth: 0.04 }} />
                ))
            )}

            {/* Centre: one triangle per colour, pointing at its home column */}
            <polygon points="6,6 7.5,7.5 6,9" style={{ fill: COLOR_FILL.red, stroke: BOARD_LINE, strokeWidth: 0.05 }} />
            <polygon points="6,6 9,6 7.5,7.5" style={{ fill: COLOR_FILL.green, stroke: BOARD_LINE, strokeWidth: 0.05 }} />
            <polygon points="9,6 9,9 7.5,7.5" style={{ fill: COLOR_FILL.yellow, stroke: BOARD_LINE, strokeWidth: 0.05 }} />
            <polygon points="6,9 7.5,7.5 9,9" style={{ fill: COLOR_FILL.blue, stroke: BOARD_LINE, strokeWidth: 0.05 }} />

            {/* Tokens. Moved with a transform transition only (never layout). */}
            {placed.map((token) => {
                const key = `${token.playerId}-${token.token}`
                const interactive = token.selectable
                return (
                    <g
                        key={key}
                        ref={(el) => {
                            if (el) tokenEls.current.set(key, el)
                            else tokenEls.current.delete(key)
                        }}
                        className={`ludo-token${interactive ? ' ludo-token--selectable' : ''}${lastMovedKey === key ? ' ludo-token--last' : ''}`}
                        style={{ transform: `translate(${token.x}px, ${token.y}px)` }}
                        role={interactive ? 'button' : undefined}
                        tabIndex={interactive ? 0 : undefined}
                        aria-label={tokenLabel(token)}
                        data-testid={interactive ? `ludo-token-${token.token}` : undefined}
                        onClick={interactive ? () => onTokenClick(token.token) : undefined}
                        onKeyDown={interactive ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                onTokenClick(token.token)
                            }
                        } : undefined}
                    >
                        {lastMovedKey === key && lastMoveRingKey && (
                            <circle
                                key={lastMoveRingKey}
                                className="ludo-token__last"
                                r={token.r + 0.16}
                                style={{ fill: COLOR_FILL[token.color], stroke: COLOR_FILL[token.color], animationDelay: `${Math.round(ringDelay)}ms` }}
                            />
                        )}
                        {interactive && <circle className="ludo-token__halo" r={token.r + 0.2} />}
                        {/* A generous invisible target: a cell is under 20px wide on a phone. */}
                        {interactive && <circle r={0.72} style={{ fill: 'transparent' }} />}
                        <circle r={token.r} style={{ fill: COLOR_FILL[token.color], stroke: BOARD_LINE, strokeWidth: 0.07 }} />
                        <circle r={token.r * 0.45} style={{ fill: 'rgba(255,255,255,0.55)' }} />
                    </g>
                )
            })}
        </svg>
    )
}

/** Pip layout for a die face on a 3×3 grid. */
const PIPS: Record<number, Array<[number, number]>> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

export function DieFace({ value, size, color, rollKey, label }: { value: number | null; size: number; color: string; rollKey?: string | number; label: string }) {
    return (
        <svg
            key={rollKey}
            width={size}
            height={size}
            viewBox="0 0 30 30"
            className={rollKey !== undefined ? 'ludo-die ludo-die--rolled' : 'ludo-die'}
            role="img"
            aria-label={label}
        >
            <rect x={1.5} y={1.5} width={27} height={27} rx={6} style={{ fill: 'var(--bd-bg)', stroke: 'var(--bd-ink)', strokeWidth: 2.5 }} />
            {value !== null && PIPS[value]?.map(([r, c]) => (
                <circle key={`${r}-${c}`} cx={8 + c * 7} cy={8 + r * 7} r={2.6} style={{ fill: color }} />
            ))}
        </svg>
    )
}

export function TokenDot({ color, size = 16 }: { color: LudoColor; size?: number }) {
    return (
        <span
            aria-hidden
            style={{
                width: size, height: size, borderRadius: '50%', background: COLOR_FILL[color], flexShrink: 0,
                display: 'inline-block', boxShadow: 'inset 0 0 0 1.5px var(--bd-ink)',
            }}
        />
    )
}
