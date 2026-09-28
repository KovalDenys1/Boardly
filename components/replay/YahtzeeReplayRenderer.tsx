import Die from '@/components/ui/Die'
import { useTranslation } from '@/lib/i18n-helpers'
import type { ReplayRendererProps } from './types'

export default function YahtzeeReplayRenderer({ snapshotState, players, playerNameById }: ReplayRendererProps) {
  const { t } = useTranslation()

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
    <div className="rounded-2xl border-[1.5px] border-bd-line bg-bd-bg2 p-4 sm:p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-bd-ink-soft">
        {t('profile.gameReplay.board.dice')}
      </p>

      <div className="flex flex-col gap-4">
        {/* Dice display */}
        <div className="flex flex-wrap gap-2">
          {dice.map((value, index) => {
            const isHeld = held?.[index] === true
            return (
              <div key={index} className="flex items-center justify-center" title={isHeld ? 'Held' : undefined}>
                <Die value={value} size={56} held={isHeld} />
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Rolls remaining */}
          {rollsLeft !== null && (
            <div className="rounded-xl border border-bd-line bg-bd-bg px-3 py-2">
              <span className="text-xs font-semibold text-bd-ink-soft">{t('yahtzee.actions.rollsLeft')}: </span>
              <span className="text-sm font-bold text-bd-ink">{rollsLeft}</span>
            </div>
          )}

          {/* Current player */}
          {currentPlayerName && (
            <div className="rounded-xl border border-bd-lav/40 bg-bd-lav/15 px-3 py-2">
              <span className="text-xs font-semibold text-bd-ink-soft">{t('game.ui.turn')}: </span>
              <span className="text-sm font-bold text-bd-ink">{currentPlayerName}</span>
            </div>
          )}
        </div>

        {/* Scores */}
        {playerTotals.length > 0 && playerTotals.some((p) => p.total > 0) && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {playerTotals.map((p) => (
              <div
                key={p.name}
                className="rounded-xl border border-bd-line bg-bd-bg px-3 py-2.5"
              >
                <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-bd-ink-soft">
                  {p.name}
                </div>
                <div className="mt-1 text-lg font-bold text-bd-ink">{p.total}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
