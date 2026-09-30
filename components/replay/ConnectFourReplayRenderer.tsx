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

  // Same discs and frame as the live board (connect-four-page.tsx): coral and sun on a
  // frame that stays dark in both themes - hence the ink-on-accent token, which never flips.
  function cellClass(cell: CellValue, isWin: boolean, isLast: boolean): string {
    if (cell === 1) {
      return isWin
        ? 'bg-bd-coral ring-2 ring-white shadow-md'
        : isLast
          ? 'bg-bd-coral ring-2 ring-inset ring-bd-sun'
          : 'bg-bd-coral'
    }
    if (cell === 2) {
      return isWin
        ? 'bg-bd-sun ring-2 ring-white shadow-md'
        : isLast
          ? 'bg-bd-sun ring-2 ring-inset ring-bd-coral'
          : 'bg-bd-sun'
    }
    return 'bg-white/10'
  }

  return (
    <div className="rounded-2xl border-[1.5px] border-bd-line bg-bd-bg2 p-4 sm:p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-bd-ink-soft">
        {t('profile.gameReplay.board.redDisc')} {t('game.ui.vs')} {t('profile.gameReplay.board.yellowDisc')}
      </p>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* Board */}
        <div
          className="shrink-0 rounded-xl p-2"
          style={{ background: 'var(--bd-ink-on-accent)', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}
        >
          {board.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const key = `${rowIndex}-${colIndex}`
              const isWin = winningCells.has(key)
              const isLast = rowIndex === lastDroppedRow && colIndex === lastDroppedCol
              return (
                <div
                  key={key}
                  className={`h-8 w-8 rounded-full sm:h-9 sm:w-9 ${cellClass(cell, isWin, isLast)}`}
                />
              )
            }),
          )}
        </div>

        {/* Status */}
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 shrink-0 rounded-full bg-bd-coral shadow-[0_0_0_1.5px_var(--bd-ink)]" />
            <span className="truncate text-sm font-medium text-bd-ink">
              {p1Name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 shrink-0 rounded-full bg-bd-sun shadow-[0_0_0_1.5px_var(--bd-ink)]" />
            <span className="truncate text-sm font-medium text-bd-ink">
              {p2Name}
            </span>
          </div>

          <div className="mt-3 rounded-xl border border-bd-line bg-bd-bg px-3 py-2.5">
            {winner === 'draw' ? (
              <p className="text-sm font-semibold text-bd-ink-soft">
                {t('profile.gameReplay.draw')}
              </p>
            ) : winner === 1 || winner === 2 ? (
              <p className="text-sm font-semibold text-bd-ink">
                {winner === 1 ? p1Name : p2Name}
              </p>
            ) : currentDisc ? (
              <p className="text-sm text-bd-ink-soft">
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
