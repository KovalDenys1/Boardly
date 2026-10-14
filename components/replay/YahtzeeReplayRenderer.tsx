import { useState } from 'react'
import YahtzeeDiceBar from '@/components/yahtzee/YahtzeeDiceBar'
import YahtzeeScorePills from '@/components/yahtzee/YahtzeeScorePills'
import YahtzeeTileGrid from '@/components/yahtzee/YahtzeeTileGrid'
import { useTranslation } from '@/lib/i18n-helpers'
import { dataOf } from '@/lib/replay/group-steps'
import { calculateTotalScore, normalizeYahtzeeMode, type YahtzeeScorecard } from '@/lib/yahtzee'
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
  const [selected, setSelected] = useState<{ id: string; stepIndex: number } | null>(null)

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
  const scorecardOf = (id: string | null): YahtzeeScorecard | null => {
    const index = id ? ids.indexOf(id) : -1
    const card = index >= 0 ? scores[index] : null
    return card && typeof card === 'object' ? (card as YahtzeeScorecard) : index >= 0 ? {} : null
  }

  const pills = seats.map((seat) => ({
    id: seat.userId,
    name: playerNameById.get(seat.userId) ?? seat.name,
    score: calculateTotalScore(scorecardOf(seat.userId) ?? {}),
    isBot: seat.isBot,
  }))
  const actorId = step.actorId && ids.includes(step.actorId) ? step.actorId : null
  const selectedId = selected && selected.stepIndex === step.index && ids.includes(selected.id) ? selected.id : null
  const viewingId = selectedId ?? actorId ?? currentId ?? ids[0] ?? null
  const scorecard = scorecardOf(viewingId)

  return (
    <div className="yahtzee-replay flex w-full max-w-xl flex-col gap-3" data-testid="yahtzee-replay">
      <YahtzeeScorePills
        players={pills}
        viewerId={viewerId}
        viewingId={viewingId}
        currentTurnId={currentId}
        onSelect={(id) => setSelected({ id, stepIndex: step.index })}
      />
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <YahtzeeDiceBar
            dice={dice}
            held={held}
            rollsLeft={rollsLeft}
            isMyTurn={false}
            isRolling={false}
            canHold={false}
            canRoll={false}
            onToggleHold={noop}
            onRoll={noop}
            showRollButton={false}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-widest text-bd-ink-muted" data-testid="yahtzee-replay-rolls">
          {t('yahtzee.ui.rollsLeftCount', { count: rollsLeft })}
        </span>
      </div>
      {scorecard && (
        <YahtzeeTileGrid
          key={viewingId ?? 'none'}
          scorecard={scorecard}
          mode={normalizeYahtzeeMode(data.mode)}
          dice={dice}
          canScore={false}
          onScore={noop}
        />
      )}
    </div>
  )
}
