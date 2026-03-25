import type { ReplayRendererProps } from './types'

const DICE_FACES: Record<number, string> = {
  1: '⚀',
  2: '⚁',
  3: '⚂',
  4: '⚃',
  5: '⚄',
  6: '⚅',
}

export default function YahtzeeReplayRenderer({ snapshotState, players, playerNameById }: ReplayRendererProps) {
  const state = snapshotState as Record<string, unknown> | null
  if (!state || typeof state !== 'object') return null

  const data = state.data as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return null

  const dice = Array.isArray(data.dice) ? (data.dice as number[]) : null
  const held = Array.isArray(data.held) ? (data.held as boolean[]) : null
  const rollsLeft = typeof data.rollsLeft === 'number' ? data.rollsLeft : null

  if (!dice || dice.length !== 5) return null

  // Current player from state
  const currentPlayerId = typeof state.currentPlayerId === 'string' ? state.currentPlayerId : null
  const currentPlayerName = currentPlayerId ? (playerNameById.get(currentPlayerId) ?? currentPlayerId) : null

  // Per-player total scores from scorecards
  const scores = Array.isArray(data.scores) ? (data.scores as Record<string, unknown>[]) : []
  const playerTotals: { name: string; total: number }[] = players.map((p, i) => {
    const scorecard = scores[i]
    const total = scorecard
      ? Object.values(scorecard).reduce<number>((sum, v) => sum + (typeof v === 'number' ? v : 0), 0)
      : 0
    return { name: playerNameById.get(p.userId) ?? `Player ${i + 1}`, total }
  })

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-700/60 dark:bg-slate-800/50 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 mb-3">
        Dice
      </p>

      <div className="flex flex-col gap-4">
        {/* Dice display */}
        <div className="flex flex-wrap gap-2">
          {dice.map((value, index) => {
            const isHeld = held?.[index] === true
            return (
              <div
                key={index}
                className={`flex h-14 w-14 items-center justify-center rounded-xl border text-3xl transition-colors ${
                  isHeld
                    ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40'
                    : 'border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800'
                }`}
                title={isHeld ? 'Held' : undefined}
              >
                {DICE_FACES[value] ?? value}
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Rolls remaining */}
          {rollsLeft !== null && (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/70">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Rolls left: </span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{rollsLeft}</span>
            </div>
          )}

          {/* Current player */}
          {currentPlayerName && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-700 dark:bg-blue-950/30">
              <span className="text-xs font-semibold text-blue-500 dark:text-blue-400">Turn: </span>
              <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{currentPlayerName}</span>
            </div>
          )}
        </div>

        {/* Scores */}
        {playerTotals.length > 0 && playerTotals.some((p) => p.total > 0) && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {playerTotals.map((p) => (
              <div
                key={p.name}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/70"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                  {p.name}
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{p.total}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
