import C4Board from '@/components/boards/C4Board'
import { COLS, ROWS, type PlayerDisc } from '@/lib/games/connect-four-game'
import type { ReplayRendererProps } from './types'

type Board = (PlayerDisc | null)[][]

function boardOf(state: unknown): Board | null {
  const data = (state as { data?: { board?: unknown } } | null)?.data
  const board = data?.board
  if (
    Array.isArray(board) &&
    board.length === ROWS &&
    board.every((row) => Array.isArray(row) && row.length === COLS && row.every((cell) => cell === 1 || cell === 2 || cell === null))
  ) {
    return board as Board
  }
  return null
}

function winningLineOf(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) return null
  const cells = value.filter(
    (pair): pair is [number, number] => Array.isArray(pair) && pair.length === 2 && pair.every((n) => typeof n === 'number'),
  )
  return cells.length > 0 ? cells : null
}

function lastDropOf(data: Record<string, unknown>, board: Board, prevBoard: Board | null, payload: unknown): [number, number] | null {
  if (typeof data.lastDroppedRow === 'number' && typeof data.lastDroppedCol === 'number') {
    return [data.lastDroppedRow, data.lastDroppedCol]
  }
  if (prevBoard) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] !== null && prevBoard[r][c] === null) return [r, c]
      }
    }
  }
  const col = (payload as { col?: unknown } | null)?.col
  if (typeof col === 'number') {
    const row = board.findIndex((cells) => cells[col] !== null && cells[col] !== undefined)
    if (row !== -1) return [row, col]
  }
  return null
}

const noop = () => {}

export default function C4ReplayRenderer({ step }: ReplayRendererProps) {
  const board = boardOf(step.state)
  if (!board) return null
  const data = (step.state as { data: Record<string, unknown> }).data
  const last = step.kind === 'start' ? null : lastDropOf(data, board, boardOf(step.prevState), step.payload)

  return (
    <div className="ttt-board-surface" data-testid="c4-replay-board">
      <C4Board
        board={board}
        winningLine={winningLineOf(data.winningLine)}
        hoverCol={null}
        onColHover={noop}
        onColClick={noop}
        disabled
        currentDisc={data.currentDisc === 2 ? 2 : 1}
        lastDroppedRow={last?.[0] ?? null}
        lastDroppedCol={last?.[1] ?? null}
        dropFresh={false}
        readOnly
      />
    </div>
  )
}
