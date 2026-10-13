import CheckersBoard, { squareName } from '@/components/boards/CheckersBoard'
import { BOARD_SIZE, type Square } from '@/lib/games/checkers-game'
import { useTranslation } from '@/lib/i18n-helpers'
import type { ReplayRendererProps } from './types'

const NO_SQUARES: Square[] = []
const noop = () => {}

function isSquare(value: unknown): value is Square {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => Number.isInteger(n) && n >= 0 && n < BOARD_SIZE)
  )
}

function isBoard(value: unknown): value is number[][] {
  return (
    Array.isArray(value) &&
    value.length === BOARD_SIZE &&
    value.every((row) => Array.isArray(row) && row.length === BOARD_SIZE && row.every((cell) => Number.isInteger(cell)))
  )
}

function squaresOf(value: unknown): Square[] {
  return Array.isArray(value) ? value.filter(isSquare) : NO_SQUARES
}

export default function CheckersReplayRenderer({ step, isFinalStep, seats, playerNameById, viewerId }: ReplayRendererProps) {
  const { t } = useTranslation()

  const state = step.state as { status?: unknown; data?: unknown } | null
  if (!state || typeof state !== 'object') return null
  const data = state.data as Record<string, unknown> | null
  if (!data || typeof data !== 'object' || !isBoard(data.board)) return null

  // groupSteps folds a multi-jump into one step, and the engine grows lastMove.path with every hop.
  const lastMove = data.lastMove as { path?: unknown } | null | undefined
  const lastPath = squaresOf(lastMove?.path)
  const flipped = seats.find((seat) => seat.userId === viewerId)?.seat === 1

  const winnerSide = data.winner === 1 || data.winner === 2 ? data.winner : null
  const winnerSeat = isFinalStep && state.status === 'finished' && winnerSide
    ? seats.find((seat) => seat.seat === winnerSide - 1)
    : undefined
  const winnerName = winnerSeat ? (playerNameById.get(winnerSeat.userId) ?? winnerSeat.name) : null

  return (
    <div
      className="ttt-board-surface"
      role="group"
      aria-label={winnerName ? t('profile.gameReplay.captions.checkers.wins', { player: winnerName }) : undefined}
      data-testid="checkers-replay"
      data-flipped={flipped || undefined}
      data-winner-side={winnerSeat ? winnerSeat.seat + 1 : undefined}
    >
      <CheckersBoard
        board={data.board}
        flipped={flipped}
        selected={null}
        movable={NO_SQUARES}
        mustCapture={false}
        destinations={NO_SQUARES}
        lastPath={lastPath}
        pendingCaptures={squaresOf(data.pendingCaptures)}
        disabled
        onSquareClick={noop}
        squareLabel={(square) => t('games.checkers.game.square', { square: squareName(square) })}
        motion={null}
        popCrownAt={null}
      />
    </div>
  )
}
