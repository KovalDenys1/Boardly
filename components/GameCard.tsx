'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import GameIcon from '@/components/GameIcon'
import { Icon, type IconName } from '@/components/icons'
import { getGameMetadata, type GameCatalogEntry, type GameDifficulty } from '@/lib/game-catalog'
import { gameStatus } from '@/lib/games-filter'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { useLocalizedHref } from '@/lib/page-locale'

export const DIFFICULTY_LABEL_KEYS: Record<GameDifficulty, TranslationKeys> = {
  easy: 'games.filters.difficulty.easy',
  medium: 'games.filters.difficulty.medium',
  hard: 'games.filters.difficulty.hard',
}

/** The game type's accent; an entry without a type is read off its gradient name. */
function gameAccentColor(game: Pick<GameCatalogEntry, 'gameType' | 'color'>): string {
  const meta = game.gameType ? getGameMetadata(game.gameType) : null
  if (meta) return meta.accentColor
  const { color } = game
  if (color.includes('blue')) return 'var(--bd-sky)'
  if (color.includes('yellow') || color.includes('orange')) return 'var(--bd-sun)'
  if (color.includes('green')) return 'var(--bd-mint)'
  if (color.includes('purple') || color.includes('violet')) return 'var(--bd-lav)'
  return 'var(--bd-coral)'
}

const FRAME =
  'bd-card group relative grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3.5 overflow-hidden p-3 text-left transition-[translate] ' +
  'desk:grid-cols-1 desk:grid-rows-[auto_1fr] desk:items-stretch desk:gap-0 desk:p-0'
const LINKED = 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bd-lav-deep'
const ART = 'grid size-14 place-items-center rounded-bd-sm desk:h-28 desk:w-auto desk:rounded-none'
const GLYPH = 'size-8 transition-[translate,rotate] group-hover:-translate-y-0.5 group-hover:-rotate-6 desk:size-16'

type Chip = { icon?: IconName; label: string; hint?: string }

function CardFrame({
  cardId,
  href,
  tint,
  art,
  title,
  description,
  chips,
  badge,
  pending = false,
}: {
  cardId: string
  href: string | null
  tint: string
  art: ReactNode
  title: string
  description: string
  chips: Chip[]
  badge?: string
  pending?: boolean
}) {
  const content = (
    <>
      <div className={ART} style={{ background: `color-mix(in srgb, ${tint} 15%, transparent)` }}>
        {art}
      </div>
      <div className="flex min-w-0 flex-col gap-1 desk:gap-2 desk:p-5">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 font-display text-lg font-bold leading-tight tracking-[-0.01em] text-bd-ink desk:text-[22px]">
            {title}
          </h3>
          {badge ? (
            <span className="bd-chip bd-chip-sun shrink-0 px-2 py-0.5 text-[11px]">{badge}</span>
          ) : href ? (
            <Icon
              name="arrow-right"
              size={18}
              weight="bold"
              className="shrink-0 text-bd-ink-muted transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-bd-ink"
            />
          ) : null}
        </div>
        <p className="truncate text-sm leading-snug text-bd-ink-soft desk:line-clamp-2 desk:flex-1 desk:whitespace-normal">
          {description}
        </p>
        {chips.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1 desk:gap-1.5">
            {chips.map(({ icon, label, hint }, index) => (
              <span key={index} className="bd-chip gap-1 px-[7px] py-0.5 text-[11px] desk:px-2.5 desk:py-1 desk:text-xs">
                {icon && <Icon name={icon} size={12} />}
                {label}
                {hint && <span className="sr-only"> {hint}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  )

  const className = `${FRAME} ${href ? LINKED : 'cursor-default'} ${pending ? 'border-dashed!' : ''}`
  // Real anchors, so crawlers reach every detail page (#921); the whole card is the target.
  return href ? (
    <Link href={href} className={className} data-game-card={cardId}>
      {content}
    </Link>
  ) : (
    <div className={className} data-game-card={cardId}>
      {content}
    </div>
  )
}

export default function GameCard({ game }: { game: GameCatalogEntry }) {
  const { t } = useTranslation()
  const localize = useLocalizedHref()
  const available = gameStatus(game) === 'available'
  // 'rps' lives at /games/rock-paper-scissors, so the path comes from the lobbies route; no route means no page (#975).
  const href = available && game.route ? localize(game.route.replace(/\/lobbies$/, '')) : null
  const accent = gameAccentColor(game)
  const timeKey = game.nameKey.replace(/\.name$/, '.ribbon.time') as TranslationKeys
  const time = t(timeKey)

  const chips: Chip[] = [
    { icon: 'users', label: game.players, hint: t('games.players') },
    ...(time && time !== timeKey ? [{ icon: 'clock' as const, label: time }] : []),
    { label: t(DIFFICULTY_LABEL_KEYS[game.difficulty]) },
  ]

  return (
    <CardFrame
      cardId={game.id}
      href={href}
      tint={accent}
      art={<GameIcon gameId={game.id} accentColor={accent} variant="bare" size={32} className={GLYPH} />}
      title={t(game.nameKey as TranslationKeys)}
      description={t(game.descriptionKey as TranslationKeys)}
      chips={chips}
      badge={available ? undefined : t('games.comingSoon')}
      pending={!available}
    />
  )
}

export function MoreGamesCard({ count }: { count: number }) {
  const { t } = useTranslation()
  const localize = useLocalizedHref()

  return (
    <CardFrame
      cardId="more"
      href={localize('/games')}
      tint="var(--bd-lav)"
      art={
        <span className="font-display text-xl font-bold leading-none text-bd-lav-text transition-[translate] group-hover:-translate-y-0.5 desk:text-5xl">
          +{count}
        </span>
      }
      title={t('home.ribbonMoreTitle')}
      description={t('home.ribbonMoreDesc', { count })}
      chips={[]}
      pending
    />
  )
}
