import { TttBoard, TttMark } from '@/components/boards/TttBoard'
import type { CellValue } from '@/lib/games/tic-tac-toe-game'
import { useTranslation } from '@/lib/i18n-helpers'
import { dataOf } from '@/lib/replay/group-steps'
import type { ReplayRendererProps } from './types'

type Cell = { row: number; col: number }

function isBoard(value: unknown): value is CellValue[][] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((row) => Array.isArray(row) && row.length === 3 && row.every((cell) => cell === 'X' || cell === 'O' || cell === null))
  )
}

function isCellPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((n) => Number.isInteger(n) && n >= 0 && n < 3)
}

function asCell(value: unknown): Cell | null {
  if (!value || typeof value !== 'object') return null
  const { row, col } = value as { row?: unknown; col?: unknown }
  return isCellPair([row, col]) ? { row: row as number, col: col as number } : null
}

function lastMoveOf(data: Record<string, unknown>, payload: unknown, action: string): Cell | null {
  const history = data.moveHistory
  if (Array.isArray(history)) return history.length > 0 ? asCell(history[history.length - 1]) : null
  return action === 'place' ? asCell(payload) : null
}

const noop = () => {}

export default function TttReplayRenderer({ step, seats, playerNameById }: ReplayRendererProps) {
  const { t } = useTranslation()
  const data = dataOf(step.state)
  if (!data || !isBoard(data.board)) return null

  const winningLine = Array.isArray(data.winningLine) && data.winningLine.every(isCellPair) ? data.winningLine : null
  const match = data.match && typeof data.match === 'object' ? (data.match as Record<string, unknown>) : null
  const wins = match?.winsBySymbol && typeof match.winsBySymbol === 'object' ? (match.winsBySymbol as Record<string, unknown>) : null
  const xWins = typeof wins?.X === 'number' ? wins.X : 0
  const oWins = typeof wins?.O === 'number' ? wins.O : 0
  const draws = typeof match?.draws === 'number' ? match.draws : 0
  const targetRounds = typeof match?.targetRounds === 'number' ? match.targetRounds : null

  const nameAt = (seat: number, fallback: string) => {
    const userId = seats.find((s) => s.seat === seat)?.userId
    return (userId && playerNameById.get(userId)) || fallback
  }

  return (
    <div className="ttt-replay flex flex-col items-center gap-2">
      <div
        className="ttt-replay-score flex h-7 items-center gap-2 text-bd-ink"
        data-testid="ttt-replay-score"
        aria-label={`${nameAt(0, 'X')} ${xWins} : ${oWins} ${nameAt(1, 'O')}`}
      >
        <TttMark mark="X" size={16} />
        <span className="font-display text-lg font-bold leading-none">
          {xWins}
          <span className="mx-1.5 text-bd-ink-muted">:</span>
          {oWins}
        </span>
        <TttMark mark="O" size={16} />
        <span className="font-mono text-[10px] uppercase tracking-widest text-bd-ink-muted">
          {t('games.tictactoe.game.drawsCount', { count: draws })}
          {targetRounds ? ` · ${t('lobby.create.bestOfShort', { rounds: targetRounds })}` : ''}
        </span>
      </div>
      <div className="ttt-board-surface">
        <TttBoard
          board={data.board}
          winningLine={winningLine}
          onCellClick={noop}
          disabled
          testId="ttt-replay-board"
          lastMove={lastMoveOf(data, step.payload, step.action)}
        />
      </div>
    </div>
  )
}
