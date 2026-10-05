import { useTranslation } from '@/lib/i18n-helpers'
import type { ReplayRendererProps } from './types'
import { Icon } from '@/components/icons'

type CellValue = 'X' | 'O' | null

function isBoard(value: unknown): value is CellValue[][] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 3 &&
        row.every((cell) => cell === 'X' || cell === 'O' || cell === null),
    )
  )
}

function isWinningLine(value: unknown): value is [number, number][] {
  return Array.isArray(value) && value.every((pair) => Array.isArray(pair) && pair.length === 2)
}

export default function TTTReplayRenderer({ snapshotState, players, playerNameById }: ReplayRendererProps) {
  const { t } = useTranslation()

  const state = snapshotState as Record<string, unknown> | null
  if (!state || typeof state !== 'object') return null

  const data = state.data as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return null

  const board = isBoard(data.board) ? data.board : null
  if (!board) return null

  const winningLine = isWinningLine(data.winningLine) ? data.winningLine : null
  const currentSymbol = typeof data.currentSymbol === 'string' ? data.currentSymbol : null
  const winner = typeof data.winner === 'string' ? data.winner : null
  const match = (data.match && typeof data.match === 'object') ? data.match as Record<string, unknown> : null

  const winsBySymbol = (match?.winsBySymbol && typeof match.winsBySymbol === 'object')
    ? match.winsBySymbol as Record<string, number>
    : null

  const winningCells = new Set<string>()
  if (winningLine) {
    for (const [r, c] of winningLine) winningCells.add(`${r}-${c}`)
  }

  // Map X/O symbol to player name (first player is X, second is O)
  const xPlayer = players[0] ? (playerNameById.get(players[0].userId) ?? 'X') : 'X'
  const oPlayer = players[1] ? (playerNameById.get(players[1].userId) ?? 'O') : 'O'

  return (
    <div className="rounded-2xl border-[1.5px] border-bd-line bg-bd-bg2 p-4 sm:p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-bd-ink-soft">
        {t('game.ui.tabBoard')}
      </p>

      <div className="flex flex-col sm:flex-row gap-5 items-start">
        {/* Board grid */}
        <div className="grid grid-cols-3 gap-1.5 shrink-0">
          {board.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const key = `${rowIndex}-${colIndex}`
              const isWinCell = winningCells.has(key)
              return (
                <div
                  key={key}
                  className={`flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-xl border text-2xl font-extrabold ${
                    isWinCell
                      ? 'border-bd-sun-deep bg-bd-sun'
                      : cell
                        ? 'border-bd-line bg-bd-card-warm'
                        : 'border-bd-line bg-bd-bg'
                  }`}
                >
                  {cell === 'X' && (
                    <span className={isWinCell ? 'text-(--bd-ink-on-accent)' : 'text-bd-coral-deep'}>
                      X
                    </span>
                  )}
                  {cell === 'O' && (
                    <span className={isWinCell ? 'text-(--bd-ink-on-accent)' : 'text-bd-lav-deep'}>
                      ○
                    </span>
                  )}
                </div>
              )
            }),
          )}
        </div>

        {/* Score / status */}
        <div className="flex-1 space-y-3 min-w-0">
          {winsBySymbol && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-bd-coral/40 bg-bd-coral/15 px-3 py-2.5">
                <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-bd-ink-soft">
                  {xPlayer} (X)
                </div>
                <div className="mt-1 text-xl font-bold text-bd-ink">
                  {typeof winsBySymbol.X === 'number' ? winsBySymbol.X : 0}
                </div>
              </div>
              <div className="rounded-xl border border-bd-lav/40 bg-bd-lav/15 px-3 py-2.5">
                <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-bd-ink-soft">
                  {oPlayer} (○)
                </div>
                <div className="mt-1 text-xl font-bold text-bd-ink">
                  {typeof winsBySymbol.O === 'number' ? winsBySymbol.O : 0}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-bd-line bg-bd-bg px-3 py-2.5">
            {winner === 'draw' ? (
              <p className="text-sm font-semibold text-bd-ink-soft">{t('profile.gameReplay.draw')}</p>
            ) : winner ? (
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-bd-ink">
                <Icon name="crown" size={14} />
                {t('profile.gameReplay.board.winsRound', { player: winner === 'X' ? xPlayer : oPlayer })}
              </p>
            ) : currentSymbol ? (
              <p className="text-sm text-bd-ink-soft">
                <span className="font-semibold">{currentSymbol === 'X' ? xPlayer : oPlayer}</span>
                {' '}{t('profile.gameReplay.board.toMove')}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
