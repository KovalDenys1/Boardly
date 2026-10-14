import type { CSSProperties } from 'react'
import { MemoryCardTile, MemoryGrid, memorySymbolSizeClass } from '@/components/boards/MemoryTiles'
import type { MemoryCard } from '@/lib/games/memory-game'
import { useTranslation } from '@/lib/i18n-helpers'
import { memoryFlippedCardId } from '@/lib/replay/captions'
import { dataOf } from '@/lib/replay/group-steps'
import type { ReplayRendererProps } from './types'

function isCard(value: unknown): value is MemoryCard {
  const card = value as MemoryCard | null
  return !!card && typeof card.id === 'string' && typeof card.value === 'string'
}

const positiveInt = (value: unknown, fallback: number) => (Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback)

export default function MemoryReplayRenderer({ step, seats, playerNameById }: ReplayRendererProps) {
  const { t } = useTranslation()
  const data = dataOf(step.state)
  if (!data || !Array.isArray(data.cards) || !data.cards.every(isCard)) return null

  const cards = data.cards.map((card) => (card.isFlipped || card.isMatched ? card : { ...card, value: '' }))
  const gridColumns = positiveInt(data.gridColumns, 4)
  const gridRows = positiveInt(data.gridRows, Math.ceil(cards.length / gridColumns))
  const scores = data.scores && typeof data.scores === 'object' ? (data.scores as Record<string, unknown>) : {}
  const lastId = step.action === 'flip' ? memoryFlippedCardId(step) : null
  const matchedPairs = cards.filter((card) => card.isMatched).length / 2
  const totalPairs = cards.length / 2
  const symbolSizeClass = memorySymbolSizeClass(gridColumns)

  return (
    <div
      className="memory-replay flex flex-col items-center gap-2"
      style={{ '--grid-cols': gridColumns, '--grid-rows': gridRows } as CSSProperties}
    >
      <div className="flex h-7 max-w-full items-center gap-3 overflow-hidden text-bd-ink">
        {seats.map((seat) => {
          const name = playerNameById.get(seat.userId) ?? seat.name
          const score = typeof scores[seat.userId] === 'number' ? (scores[seat.userId] as number) : 0
          return (
            <span
              key={seat.userId}
              className="flex min-w-0 items-baseline gap-1.5"
              data-testid={`memory-replay-score-${seat.seat}`}
            >
              <span className="truncate text-xs font-semibold text-bd-ink-soft">{name}</span>
              <span className="font-display text-lg font-bold leading-none">{score}</span>
            </span>
          )
        })}
        <span
          className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-bd-ink-muted"
          data-testid="memory-replay-pairs"
        >
          {matchedPairs}/{totalPairs}
        </span>
      </div>
      <div className="ttt-board-surface">
        <MemoryGrid gridColumns={gridColumns} label={t('games.memory.game.boardLabel')}>
          {cards.map((card, cardIndex) => (
            <MemoryCardTile
              key={card.id}
              card={card}
              cardIndex={cardIndex}
              isFaceUp={card.isFlipped || card.isMatched}
              symbolSizeClass={symbolSizeClass}
              readOnly
              isLast={card.id === lastId}
            />
          ))}
        </MemoryGrid>
      </div>
    </div>
  )
}
