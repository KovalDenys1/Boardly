import React, { useLayoutEffect, useRef } from 'react'
import { PlayerDisc, ROWS, COLS } from '@/lib/games/connect-four-game'
import { useTranslation } from '@/lib/i18n-helpers'
import { C4_DEFAULT_CELL_PX, c4DropDurationMs, c4FallDistancePx } from '@/lib/connect-four-drop-timing'

export const DISC_RED = 'var(--bd-coral)'
export const DISC_YELLOW = 'var(--bd-sun)'
// Fixed (not var(--bd-bg2)) — the board is a self-contained "black plastic
// with pale holes" look that must stay the same in light and dark theme.
// --bd-bg2 flips to a dark color in html.dark, which inverted this into a
// light frame with near-black holes on real devices. Matches --bd-bg2's
// light-mode value exactly, so light mode is visually unchanged.
const DISC_EMPTY = '#F2E9D8'

/**
 * Last-disc marker (#1114): a small ring on the newest disc that stays until
 * the next move. When the disc is still falling it fades in once the drop has
 * landed (animation-delay = the drop's duration), so it never rides the fall.
 */
function C4LastMarker({ delayMs }: { delayMs?: number }) {
    return (
        <span
            className={delayMs !== undefined ? 'c4-last-marker c4-last-marker--in' : 'c4-last-marker'}
            data-testid="c4-last-marker"
            style={delayMs !== undefined ? { animationDelay: `${delayMs}ms` } : undefined}
            aria-hidden
        />
    )
}

function C4Disc({ disc, isWin, pop, ghost, ghostDisc, fallDistancePx, isLast, onDropEnd }: {
    disc: PlayerDisc | null; isWin?: boolean; pop?: boolean; ghost?: boolean; ghostDisc?: PlayerDisc; fallDistancePx?: number
    isLast?: boolean; onDropEnd?: () => void
}) {
    if (ghost) {
        const fill = ghostDisc === 1 ? DISC_RED : DISC_YELLOW
        return (
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: fill, position: 'relative' }}>
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" strokeDasharray="4.5 3" strokeLinecap="round" />
                </svg>
            </div>
        )
    }
    const color = disc === 1 ? DISC_RED : disc === 2 ? DISC_YELLOW : DISC_EMPTY
    const shadow = disc === 1 ? '0 2px 6px rgba(255,107,91,0.45)' : disc === 2 ? '0 2px 6px rgba(255,196,77,0.45)' : 'none'
    const isAnimating = pop && !!fallDistancePx

    if (isAnimating) {
        const durationMs = c4DropDurationMs(fallDistancePx!)
        return (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {/* Keep the empty hole visible while disc is in flight */}
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: DISC_EMPTY }} />
                {/* Falling disc, animated from above */}
                <div
                    onAnimationEnd={(e) => { if (e.target === e.currentTarget) onDropEnd?.() }}
                    style={{
                        position: 'absolute', inset: 0,
                        borderRadius: '50%',
                        background: color,
                        boxShadow: isWin ? `inset 0 0 0 3px white, ${shadow}` : shadow,
                        animation: `c4-drop ${durationMs}ms linear both`,
                        '--c4-fall-dist': `${fallDistancePx}px`,
                        '--c4-end-scale': isWin ? '1.12' : '1',
                    } as React.CSSProperties}
                >
                    {isLast && !isWin && <C4LastMarker delayMs={durationMs} />}
                </div>
            </div>
        )
    }

    return (
        <div style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: color,
            boxShadow: isWin ? `inset 0 0 0 3px white, ${shadow}` : shadow,
            transform: isWin ? 'scale(1.12)' : 'scale(1)',
            transition: 'transform 0.15s, box-shadow 0.15s',
            position: 'relative',
        }}>
            {isLast && !!disc && !isWin && <C4LastMarker />}
        </div>
    )
}

export default function C4Board({ board, winningLine, hoverCol, onColHover, onColClick, disabled, currentDisc, lastDroppedRow, lastDroppedCol, dropFresh = true, onDropSettled, onCellMeasured, readOnly = false }: {
    board: (PlayerDisc | null)[][]
    winningLine: [number, number][] | null
    hoverCol: number | null
    onColHover: (col: number | null) => void
    onColClick: (col: number) => void
    disabled: boolean
    currentDisc: PlayerDisc
    lastDroppedRow: number | null
    lastDroppedCol: number | null
    /** The newest disc falls only while this is true, so a remount does not replay it (#1114). */
    dropFresh?: boolean
    onDropSettled?: () => void
    /** The cell height a drop's fall is measured in, so the page can time the landing without the board. */
    onCellMeasured?: (px: number) => void
    /** A picture of the board: no arrows, no click zones, cells are labelled images instead of buttons. */
    readOnly?: boolean
}) {
    const { t } = useTranslation()
    const isWin = (r: number, c: number) => winningLine?.some(([wr, wc]) => wr === r && wc === c) ?? false
    const cellRef = useRef<HTMLButtonElement>(null)

    const getDropRow = (col: number): number | null => {
        if (board[0]?.[col] !== null) return null
        for (let r = ROWS - 1; r >= 0; r--) {
            if (board[r]?.[col] === null) return r
        }
        return null
    }
    const ghostRow = hoverCol !== null && !disabled ? getDropRow(hoverCol) : null

    const getFallDistancePx = (targetRow: number): number =>
        c4FallDistancePx(targetRow, cellRef.current?.getBoundingClientRect().height ?? C4_DEFAULT_CELL_PX)

    useLayoutEffect(() => {
        const px = cellRef.current?.getBoundingClientRect().height
        if (px) onCellMeasured?.(px)
    }, [board, onCellMeasured])

    return (
        <div
            style={{ position: 'relative', userSelect: 'none', cursor: readOnly ? 'default' : undefined }}
            role={readOnly ? 'group' : undefined}
            aria-label={readOnly ? t('games.connect_four.board.label') : undefined}
        >
            {/* Drop indicator arrows */}
            {!readOnly && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, marginBottom: 4, gap: 3 }}>
                {Array.from({ length: COLS }, (_, c) => (
                    <div key={c} style={{
                        height: 20, display: 'grid', placeItems: 'center',
                        opacity: hoverCol === c && !disabled && board[0]?.[c] === null ? 1 : 0,
                        transition: 'opacity 0.12s',
                    }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M7 1v9M3 7l4 5 4-5" stroke={currentDisc === 1 ? DISC_RED : DISC_YELLOW} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                ))}
            </div>}

            {/* Dark in both themes (--bd-ink turns cream in html.dark), with a rim that keeps its edge on a dark card. */}
            <div style={{
                background: 'var(--bd-inverse)',
                border: '2px solid var(--bd-board-line)',
                borderRadius: 16,
                padding: 6,
                boxShadow: '0 8px 24px rgba(31,27,22,0.24)',
                display: 'grid',
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                gap: 6,
                overflow: 'hidden',
            }}>
                {Array.from({ length: ROWS }, (_, r) =>
                    Array.from({ length: COLS }, (_, c) => {
                        const cell = board[r]?.[c] ?? null
                        const win = isWin(r, c)
                        const colFull = board[0]?.[c] !== null
                        const isHoveredCol = hoverCol === c && !disabled && !colFull
                        const isGhost = isHoveredCol && r === ghostRow && !cell
                        const hoverTint = currentDisc === 1 ? 'rgba(255,107,91,0.28)' : 'rgba(255,196,77,0.28)'
                        const isLastDropped = !!cell && r === lastDroppedRow && c === lastDroppedCol
                        const fallDistancePx = isLastDropped && dropFresh && lastDroppedRow !== null
                            ? getFallDistancePx(lastDroppedRow)
                            : undefined
                        if (readOnly) {
                            return (
                                <div
                                    key={`${r}-${c}`}
                                    role="img"
                                    aria-label={t('games.connect_four.board.cell', {
                                        row: r + 1,
                                        col: c + 1,
                                        disc: t(cell === 1 ? 'games.connect_four.board.red' : cell === 2 ? 'games.connect_four.board.yellow' : 'games.connect_four.board.empty'),
                                    })}
                                    style={{
                                        width: 'var(--c4-cell, 44px)',
                                        height: 'var(--c4-cell, 44px)',
                                        borderRadius: '50%',
                                        padding: 3,
                                        background: 'rgba(255,255,255,0.10)',
                                        display: 'grid',
                                        placeItems: 'center',
                                    }}
                                >
                                    <C4Disc disc={cell} isWin={win} isLast={isLastDropped} />
                                </div>
                            )
                        }
                        return (
                            <button
                                key={`${r}-${c}`}
                                ref={r === 0 && c === 0 ? cellRef : undefined}
                                onClick={() => !colFull && !disabled && onColClick(c)}
                                onMouseEnter={() => !disabled && !colFull && onColHover(c)}
                                onMouseLeave={() => onColHover(null)}
                                disabled={disabled || colFull}
                                aria-label={`column ${c + 1}`}
                                style={{
                                    width: 'var(--c4-cell, 44px)',
                                    height: 'var(--c4-cell, 44px)',
                                    borderRadius: '50%',
                                    padding: 3,
                                    background: isHoveredCol && !cell ? hoverTint : 'rgba(255,255,255,0.10)',
                                    transition: 'background 0.1s',
                                    border: 'none',
                                    cursor: disabled || colFull ? 'not-allowed' : 'pointer',
                                    outline: 'none',
                                    display: 'grid',
                                    placeItems: 'center',
                                    overflow: 'visible',
                                }}
                            >
                                <C4Disc
                                    disc={cell}
                                    isWin={win}
                                    pop={isLastDropped && dropFresh}
                                    fallDistancePx={fallDistancePx}
                                    isLast={isLastDropped}
                                    onDropEnd={onDropSettled}
                                    ghost={isGhost}
                                    ghostDisc={isGhost ? currentDisc : undefined}
                                />
                            </button>
                        )
                    })
                )}
            </div>

            {/* Column click zones (overlay on entire column for easier clicking) */}
            {!readOnly && <div style={{
                position: 'absolute', inset: 0,
                display: 'grid',
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                pointerEvents: disabled ? 'none' : 'auto',
            }}>
                {Array.from({ length: COLS }, (_, c) => {
                    const colFull = board[0]?.[c] !== null
                    return (
                        <div
                            key={c}
                            onClick={() => !colFull && onColClick(c)}
                            onMouseEnter={() => !colFull && onColHover(c)}
                            onMouseLeave={() => onColHover(null)}
                            style={{ cursor: colFull ? 'not-allowed' : 'pointer' }}
                        />
                    )
                })}
            </div>}
        </div>
    )
}
