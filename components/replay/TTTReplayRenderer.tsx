import type { ReplayRendererProps } from './types'

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
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700/60 dark:bg-slate-800/50 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 mb-3">
        Board
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
                  className={`flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-xl border text-2xl font-extrabold transition-colors ${
                    isWinCell
                      ? 'border-amber-400 bg-amber-100 dark:border-amber-500 dark:bg-amber-950/50'
                      : cell
                        ? 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                        : 'border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50'
                  }`}
                >
                  {cell === 'X' && (
                    <span className={isWinCell ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}>
                      ✕
                    </span>
                  )}
                  {cell === 'O' && (
                    <span className={isWinCell ? 'text-amber-600 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'}>
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
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-700 dark:bg-blue-950/30">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 truncate">
                  {xPlayer} (✕)
                </div>
                <div className="mt-1 text-xl font-bold text-blue-700 dark:text-blue-300">
                  {typeof winsBySymbol.X === 'number' ? winsBySymbol.X : 0}
                </div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-700 dark:bg-rose-950/30">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-500 dark:text-rose-400 truncate">
                  {oPlayer} (○)
                </div>
                <div className="mt-1 text-xl font-bold text-rose-600 dark:text-rose-400">
                  {typeof winsBySymbol.O === 'number' ? winsBySymbol.O : 0}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/70">
            {winner === 'draw' ? (
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Draw</p>
            ) : winner ? (
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {winner === 'X' ? xPlayer : oPlayer} wins this round
              </p>
            ) : currentSymbol ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold">{currentSymbol === 'X' ? xPlayer : oPlayer}</span>
                {' '}to move
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
