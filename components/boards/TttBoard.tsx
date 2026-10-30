import type { CellValue } from '@/lib/games/tic-tac-toe-game'

export function tttCoord(row: number, col: number) {
    return ['A', 'B', 'C'][col] + (row + 1)
}

export function TttMark({ mark, size = 24, responsive = false, pop = false }: {
    mark: 'X' | 'O'; size?: number; responsive?: boolean; pop?: boolean
}) {
    const stroke = mark === 'X' ? 'var(--bd-coral)' : 'var(--bd-lav)'
    const anim = pop ? 'ttt-mark-in var(--bd-dur) var(--bd-ease-spring) both' : undefined
    if (responsive) {
        return (
            <span style={{ display: 'inline-grid', placeItems: 'center', width: '60%', height: '60%', animation: anim }}>
                {mark === 'X'
                    ? <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
                        <path d="M5 5L19 19" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
                        <path d="M19 5L5 19" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
                    </svg>
                    : <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
                        <circle cx="12" cy="12" r="7" stroke={stroke} strokeWidth="2.6" fill="none" />
                    </svg>}
            </span>
        )
    }
    const sw = Math.max(3, size * 0.11)
    return (
        <span style={{ display: 'inline-grid', placeItems: 'center', width: size, height: size, animation: anim }}>
            {mark === 'X'
                ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                    <path d="M5 5L19 19" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
                    <path d="M19 5L5 19" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
                </svg>
                : <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="7" stroke={stroke} strokeWidth={sw} fill="none" />
                </svg>}
        </span>
    )
}

export function TttBoard({ board, winningLine, onCellClick, disabled, testId, lastMove, popLastMove = false, onLastMovePopped }: {
    board: CellValue[][];
    winningLine: [number, number][] | null;
    onCellClick: (row: number, col: number) => void;
    disabled: boolean;
    testId?: string;
    /** The most recent move: its cell keeps a ring until the next move (#1114). */
    lastMove?: { row: number; col: number } | null;
    /** Only the just-placed mark pops, and only until its animation ends (#1114). */
    popLastMove?: boolean;
    onLastMovePopped?: () => void;
}) {
    const isLast = (r: number, c: number) => !!lastMove && lastMove.row === r && lastMove.col === c
    const isWin = (r: number, c: number) => winningLine?.some(([wr, wc]) => wr === r && wc === c) ?? false
    // Partially-restored or mismatched game state can arrive without a board;
    // rendering an empty grid beats crashing the whole page (#771).
    const safeBoard: CellValue[][] = Array.isArray(board)
        ? board
        : [[null, null, null], [null, null, null], [null, null, null]]
    return (
        <div className="ttt-board-wrap">
            <div className="ttt-board" data-testid={testId}>
                {safeBoard.map((row, ri) =>
                    row.map((cell, ci) => (
                        <button
                            key={`${ri}-${ci}`}
                            className={`ttt-cell${isWin(ri, ci) ? ' ttt-win' : ''}${cell && isLast(ri, ci) && !isWin(ri, ci) ? ' ttt-cell--last' : ''}`}
                            data-last-move={cell && isLast(ri, ci) ? 'true' : undefined}
                            onClick={() => onCellClick(ri, ci)}
                            disabled={disabled || !!cell}
                            aria-label={`cell ${tttCoord(ri, ci)}`}
                        >
                            {/* Decorative only — the cell already carries
                                aria-label="cell A1" etc., and at 0.5 opacity
                                this watermark measured 1.81:1, far below the
                                4.5:1 AA minimum (#1171 axe pass). Hiding it
                                from the accessibility tree rather than
                                brightening it keeps the intentionally subtle
                                look. */}
                            {!cell && <span className="ttt-cell-coord" aria-hidden="true">{tttCoord(ri, ci)}</span>}
                            {cell && (isLast(ri, ci) && popLastMove
                                ? <span className="ttt-mark-pop-host" onAnimationEnd={onLastMovePopped}><TttMark mark={cell} responsive pop /></span>
                                : <TttMark mark={cell} responsive />)}
                        </button>
                    ))
                )}
            </div>
        </div>
    )
}
