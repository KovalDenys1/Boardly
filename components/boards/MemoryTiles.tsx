import type { CSSProperties, ReactNode } from 'react'
import type { MemoryCard } from '@/lib/games/memory-game'
import { useTranslation } from '@/lib/i18n-helpers'

export function memorySymbolSizeClass(gridColumns: number): string {
  return gridColumns >= 6 ? 'text-lg sm:text-xl' : gridColumns === 5 ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
}

export function MemoryGrid({ gridColumns, children, label }: { gridColumns: number; children: ReactNode; label?: string }) {
  const style: CSSProperties = { gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }
  return label ? (
    <div className="memory-grid" style={style} role="group" aria-label={label}>
      {children}
    </div>
  ) : (
    <div className="memory-grid" style={style}>
      {children}
    </div>
  )
}

interface MemoryCardTileProps {
  card: MemoryCard
  cardIndex: number
  isFaceUp: boolean
  symbolSizeClass: string
  isDisabled?: boolean
  onClick?: () => void
  isJustMatched?: boolean
  isMismatch?: boolean
  /** A picture of the card rather than a control, for the replay. */
  readOnly?: boolean
  isLast?: boolean
}

export function MemoryCardTile({
  card,
  cardIndex,
  isFaceUp,
  symbolSizeClass,
  isDisabled = false,
  onClick,
  isJustMatched = false,
  isMismatch = false,
  readOnly = false,
  isLast = false,
}: MemoryCardTileProps) {
  const { t } = useTranslation()
  const label =
    card.isMatched && card.value
      ? t('games.memory.game.cardMatched', { num: cardIndex + 1, value: card.value })
      : isFaceUp && card.value
        ? t('games.memory.game.cardFaceUp', { num: cardIndex + 1, value: card.value })
        : t('games.memory.game.cardFaceDown', { num: cardIndex + 1 })
  const inner = (
    <span className={`memory-tile-inner ${isFaceUp ? 'memory-tile-inner-flipped' : ''}`}>
      <span className="memory-tile-back">
        <span className="memory-tile-back-mark">✦</span>
      </span>
      <span className={`memory-tile-face ${symbolSizeClass}`}>
        {/* Face-down cards no longer carry their value (#715), so an
            optimistic flip has nothing to show until the server confirms
            the move. Render a neutral placeholder for that brief window
            instead of a blank tile. */}
        {card.value || (isFaceUp ? '·' : '')}
      </span>
    </span>
  )

  if (readOnly) {
    return (
      <div
        role="img"
        aria-label={label}
        data-last={isLast ? 'true' : undefined}
        className={`memory-tile cursor-default ${card.isMatched ? 'memory-tile-matched' : ''}${isLast ? ' memory-tile-last' : ''}`}
      >
        {inner}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      className={`memory-tile ${isDisabled ? 'cursor-default' : 'cursor-pointer'} ${card.isMatched ? 'memory-tile-matched' : ''}${isJustMatched ? ' memory-tile-match-cue' : ''}${isMismatch ? ' memory-tile-mismatch-cue' : ''}`}
    >
      {inner}
    </button>
  )
}
