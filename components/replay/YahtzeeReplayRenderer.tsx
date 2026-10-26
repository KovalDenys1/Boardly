import YahtzeeDiceBar from '@/components/yahtzee/YahtzeeDiceBar'
import YahtzeeScoreTable from '@/components/yahtzee/YahtzeeScoreTable'
import { useTranslation } from '@/lib/i18n-helpers'
import { dataOf } from '@/lib/replay/group-steps'
import { normalizeYahtzeeMode, type YahtzeeScorecard } from '@/lib/yahtzee'
import type { ReplayRendererProps } from './types'

const noop = () => {}

function isDice(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 5 && value.every((n) => Number.isInteger(n) && n >= 1 && n <= 6)
}

function isHeld(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.length === 5 && value.every((h) => typeof h === 'boolean')
}

function enginePlayerIds(state: unknown): string[] {
  const players = (state as { players?: Array<{ id?: unknown }> } | null)?.players
  return Array.isArray(players) ? players.map((p) => (typeof p?.id === 'string' ? p.id : '')) : []
}

export default function YahtzeeReplayRenderer({ step, seats, playerNameById, viewerId }: ReplayRendererProps) {
  const { t } = useTranslation()

  const data = dataOf(step.state)
  if (!data || !isDice(data.dice) || !Array.isArray(data.scores)) return null
  const scores: unknown[] = data.scores

  const shown = step.action === 'score' ? (dataOf(step.prevState) ?? data) : data
  const dice = isDice(shown.dice) ? shown.dice : data.dice
  const held = isHeld(shown.held) ? shown.held : [false, false, false, false, false]
  const rollsLeft = typeof shown.rollsLeft === 'number' ? shown.rollsLeft : 3

  const ids = enginePlayerIds(step.state)
  const state = step.state as { status?: unknown; currentPlayerIndex?: unknown }
  const currentId =
    state.status === 'playing' && typeof state.currentPlayerIndex === 'number' ? (ids[state.currentPlayerIndex] ?? null) : null
  const scorecardOf = (id: string): YahtzeeScorecard => {
    const card = scores[ids.indexOf(id)]
    return card && typeof card === 'object' ? (card as YahtzeeScorecard) : {}
  }

  return (
    <div className="yahtzee-replay" data-testid="yahtzee-replay">
      <div className="yahtzee-replay__tray">
        <YahtzeeDiceBar
          dice={dice}
          held={held}
          rollsLeft={rollsLeft}
          placeholder={rollsLeft === 3}
          isRolling={false}
          canHold={false}
          canRoll={false}
          onToggleHold={noop}
          onRoll={noop}
          showRollButton={false}
        />
        <span className="yahtzee-replay__rolls" data-testid="yahtzee-replay-rolls">
          {t('yahtzee.ui.rollsLeftCount', { count: rollsLeft })}
        </span>
      </div>
      <YahtzeeScoreTable
        players={seats.map((seat) => ({
          id: seat.userId,
          name: playerNameById.get(seat.userId) ?? seat.name,
          isBot: seat.isBot,
          scorecard: scorecardOf(seat.userId),
        }))}
        viewerId={viewerId}
        currentPlayerId={currentId}
        mode={normalizeYahtzeeMode(data.mode)}
        dice={dice}
        canScore={false}
        rollsLeft={rollsLeft}
      />
    </div>
  )
}
