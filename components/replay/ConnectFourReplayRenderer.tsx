import { useTranslation } from '@/lib/i18n-helpers'
import type { ReplayRendererProps } from './types'

type CellValue = 1 | 2 | null

function isCFBoard(value: unknown): value is CellValue[][] {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 7 &&
        row.every((cell) => cell === 1 || cell === 2 || cell === null),
    )
  )
}

function isWinningLine(value: unknown): value is [number, number][] {
  return Array.isArray(value) && value.every((pair) => Array.isArray(pair) && pair.length === 2)
}

export default function ConnectFourReplayRenderer({
  snapshotState,
  players,
  playerNameById,
}: ReplayRendererProps) {
  const { t } = useTranslation()

  const state = snapshotState as Record<string, unknown> | null
  if (!state || typeof state !== 'object') return null

  const data = state.data as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return null

  const board = isCFBoard(data.board) ? data.board : null
  if (!board) return null

  const winningLine = isWinningLine(data.winningLine) ? data.winningLine : null
  const currentDisc = data.currentDisc === 1 || data.currentDisc === 2 ? data.currentDisc : null
  const winner = data.winner === 1 || data.winner === 2 || data.winner === 'draw' ? data.winner : null
  const lastDroppedRow = typeof data.lastDroppedRow === 'number' ? data.lastDroppedRow : null
  const lastDroppedCol = typeof data.lastDroppedCol === 'number' ? data.lastDroppedCol : null

  const winningCells = new Set<string>()
  if (winningLine) {
    for (const [r, c] of winningLine) winningCells.add(`${r}-${c}`)
  }

  const p1Name = players[0] ? (playerNameById.get(players[0].userId) ?? t('profile.gameReplay.board.redDisc')) : t('profile.gameReplay.board.redDisc')
  const p2Name = players[1] ? (playerNameById.get(players[1].userId) ?? t('profile.gameReplay.board.yellowDisc')) : t('profile.gameReplay.board.yellowDisc')

  function cellClass(cell: CellValue, isWin: boolean, isLast: boolean): string {
    if (cell === 1) {
      return isWin
        ? 'bg-red-400 ring-2 ring-white shadow-md'
        : isLast
          ? 'bg-red-500 animate-pulse'
          : 'bg-red-500'
    }
    if (cell === 2) {
      return isWin
        ? 'bg-amber-300 ring-2 ring-white shadow-md'
        : isLast
          ? 'bg-amber-400 animate-pulse'
          : 'bg-amber-400'
    }
    return 'bg-slate-200 dark:bg-slate-700'
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700/60 dark:bg-slate-800/50 sm:p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {t('profile.gameReplay.board.redDisc')} vs {t('profile.gameReplay.board.yellowDisc')}
      </p>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* Board */}
        <div
          className="shrink-0 rounded-xl bg-blue-700 p-2 dark:bg-blue-900"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}
        >
          {board.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const key = `${rowIndex}-${colIndex}`
              const isWin = winningCells.has(key)
              const isLast = rowIndex === lastDroppedRow && colIndex === lastDroppedCol
              return (
                <div
                  key={key}
                  className={`h-8 w-8 rounded-full sm:h-9 sm:w-9 transition-colors ${cellClass(cell, isWin, isLast)}`}
                />
              )
            }),
          )}
        </div>

        {/* Status */}
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 shrink-0 rounded-full bg-red-500" />
            <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
              {p1Name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 shrink-0 rounded-full bg-amber-400" />
            <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
              {p2Name}
            </span>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/70">
            {winner === 'draw' ? (
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {t('profile.gameReplay.draw')}
              </p>
            ) : winner === 1 || winner === 2 ? (
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {winner === 1 ? p1Name : p2Name}
              </p>
            ) : currentDisc ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold">{currentDisc === 1 ? p1Name : p2Name}</span>
                {' '}{t('profile.gameReplay.board.toMove')}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
