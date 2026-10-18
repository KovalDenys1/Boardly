'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useId, useState, type ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import Footer from '@/components/Footer'
import GuidesSection from '@/components/GuidesSection'
import type { GameCatalogEntry, GameDifficulty } from '@/lib/game-catalog'
import {
  DEFAULT_GAMES_FILTERS,
  PLAYER_COUNT_CAP,
  buildGamesQuery,
  difficultyOptions,
  filterGames,
  gameStatus,
  parseGamesFilters,
  playerCountOptions,
  sameGamesFilters,
  type GameStatusFilter,
  type GamesFilters,
} from '@/lib/games-filter'
import GameIcon from '@/components/GameIcon'

interface Game {
  id: string
  nameKey: TranslationKeys
  descriptionKey: TranslationKeys
  players: string
  difficulty: GameDifficulty
  status: 'available' | 'coming-soon'
  route?: string
  color: string
}

interface GamesClientProps {
  games: GameCatalogEntry[]
}

interface GamesCatalogProps extends GamesClientProps {
  filters: GamesFilters
  onFiltersChange?: (next: GamesFilters) => void
}

const DIFFICULTY_LABEL_KEYS: Record<GameDifficulty, TranslationKeys> = {
  easy: 'games.filters.difficulty.easy',
  medium: 'games.filters.difficulty.medium',
  hard: 'games.filters.difficulty.hard',
}

const RESULTS_ENTER = 'animate-[bd-screen-in_0.3s_var(--bd-ease-out)_backwards] motion-reduce:animate-none'

function accentColor(color: string): string {
  if (color.includes('blue')) return 'var(--bd-sky)'
  if (color.includes('red') || color.includes('coral')) return 'var(--bd-coral)'
  if (color.includes('yellow') || color.includes('orange')) return 'var(--bd-sun)'
  if (color.includes('green')) return 'var(--bd-mint)'
  if (color.includes('purple') || color.includes('violet')) return 'var(--bd-lav)'
  return 'var(--bd-coral)'
}

export default function GamesClient({ games }: GamesClientProps) {
  const { t } = useTranslation()

  return (
    <div className="bd-page bd-screen flex min-h-(--game-h) flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1280px] grow px-8 pb-10 pt-10">

        {/* Page header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="bd-kicker">{t('games.catalog')}</span>
            <h1
              className="mt-2 text-[clamp(40px,5vw,64px)] font-extrabold leading-[0.95] tracking-[-0.02em] text-bd-ink"
              style={{ fontFamily: 'var(--bd-font-display)' }}
            >
              {t('games.title')}<br />
              <span className="text-bd-coral">{t('games.subtitle')}</span>
            </h1>
          </div>
        </div>

        {/* useSearchParams on a prerendered page needs a Suspense boundary; the unfiltered fallback keeps every card in the HTML for crawlers (#921). */}
        <Suspense fallback={<GamesCatalog games={games} filters={DEFAULT_GAMES_FILTERS} />}>
          <GamesCatalogFromUrl games={games} />
        </Suspense>
      </div>
      <GuidesSection />
      <Footer />
    </div>
  )
}

function GamesCatalogFromUrl({ games }: GamesClientProps) {
  const searchParams = useSearchParams()

  const pushFilters = (next: GamesFilters) => {
    const { pathname, search, hash } = window.location
    window.history.pushState(null, '', `${pathname}${buildGamesQuery(search, next)}${hash}`)
  }

  return <GamesCatalog games={games} filters={parseGamesFilters(searchParams)} onFiltersChange={pushFilters} />
}

function GamesCatalog({ games: catalogGames, filters, onFiltersChange }: GamesCatalogProps) {
  const { t } = useTranslation()
  const [shownFilters, setShownFilters] = useState(filters)
  const [animateResults, setAnimateResults] = useState(false)
  if (!sameGamesFilters(filters, shownFilters)) {
    setShownFilters(filters)
    setAnimateResults(true)
  }

  const change = (patch: Partial<GamesFilters>) => {
    const next = { ...filters, ...patch }
    if (!sameGamesFilters(next, filters)) onFiltersChange?.(next)
  }

  const statusOptions: Array<{ id: GameStatusFilter; label: string }> = [
    { id: 'all', label: t('common.all') },
    { id: 'available', label: t('games.available') },
    { id: 'coming-soon', label: t('games.comingSoon') },
  ]
  const playerOptions = playerCountOptions(catalogGames)
  const difficultyLevels = difficultyOptions(catalogGames)

  const filteredGames: Game[] = filterGames(catalogGames, filters)
    .map((game) => ({
      ...game,
      nameKey: game.nameKey as TranslationKeys,
      descriptionKey: game.descriptionKey as TranslationKeys,
      status: gameStatus(game),
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'available' ? -1 : 1
      return t(a.nameKey).toLowerCase().localeCompare(t(b.nameKey).toLowerCase())
    })

  // The catalog id is not always the detail path ('rps' lives at
  // /games/rock-paper-scissors), so the path comes from the lobbies route.
  // An entry without a route has no page, so there is nothing to link to:
  // guessing /games/<id> is how a flag-promoted game with no page under
  // app/games/ used to put a 404 in front of players (#975).
  const detailHref = (game: Game) => (game.route ? game.route.replace(/\/lobbies$/, '') : null)

  return (
    <>
      {/* Filter chips */}
      <div className="mb-8 flex flex-col gap-5">
        <ChipRail>
          {statusOptions.map((option) => (
            <FilterChip
              key={option.id}
              active={filters.status === option.id}
              onClick={() => change({ status: option.id })}
            >
              {option.label}
            </FilterChip>
          ))}
        </ChipRail>

        <div className="flex flex-col gap-5 desk:flex-row desk:gap-10">
          <FilterGroup label={t('games.filters.players.label')}>
            <FilterChip active={filters.players === null} onClick={() => change({ players: null })}>
              {t('games.filters.players.any')}
            </FilterChip>
            {playerOptions.map((count) => (
              <FilterChip
                key={count}
                active={filters.players === count}
                onClick={() => change({ players: count })}
              >
                {count === PLAYER_COUNT_CAP ? `${count}+` : count}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label={t('games.filters.difficulty.label')}>
            <FilterChip active={filters.difficulty === null} onClick={() => change({ difficulty: null })}>
              {t('games.filters.difficulty.any')}
            </FilterChip>
            {difficultyLevels.map((level) => (
              <FilterChip
                key={level}
                active={filters.difficulty === level}
                onClick={() => change({ difficulty: level })}
              >
                {t(DIFFICULTY_LABEL_KEYS[level])}
              </FilterChip>
            ))}
          </FilterGroup>
        </div>
      </div>

      {/* Games grid */}
      <div
        key={buildGamesQuery('', filters)}
        data-tour-step="games-grid"
        className={`mb-14 ${animateResults ? RESULTS_ENTER : ''}`}
      >
        {filteredGames.length === 0 ? (
          <div className="flex flex-col items-center gap-5 py-20 text-center">
            <p className="text-base text-bd-ink-muted">{t('games.noGamesFound')}</p>
            <button
              type="button"
              onClick={() => change(DEFAULT_GAMES_FILTERS)}
              className="bd-btn bd-btn-ghost focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep"
            >
              {t('games.filters.reset')}
            </button>
          </div>
        ) : (
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
            {filteredGames.map(game => {
              const href = detailHref(game)
              const isAvailable = game.status === 'available'
              const isLinked = isAvailable && href !== null
              const cardClass = `bd-card relative flex flex-col gap-3 overflow-hidden p-6 transition-all ${
                isLinked ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default opacity-[0.72]'
              }`
              const card = (
                <>
                  {/* Color accent strip */}
                  <div
                    className="absolute inset-x-0 top-0 h-1 rounded-t-3xl"
                    style={{ background: `linear-gradient(90deg, ${accentColor(game.color)}, transparent)` }}
                  />

                  {/* Header row */}
                  <div className="mt-2 flex items-start justify-between">
                    <GameIcon gameId={game.id} accentColor={accentColor(game.color)} />
                    <span className={`text-[11px] ${isAvailable ? 'bd-chip bd-chip-mint' : 'bd-chip'}`}>
                      {isAvailable ? t('games.available') : t('games.comingSoon')}
                    </span>
                  </div>

                  {/* Game info */}
                  <div className="flex-1">
                    <h3
                      className="mb-1.5 text-[22px] font-bold tracking-[-0.01em] text-bd-ink"
                      style={{ fontFamily: 'var(--bd-font-display)' }}
                    >
                      {t(game.nameKey)}
                    </h3>
                    <p className="text-sm leading-normal text-bd-ink-soft">
                      {t(game.descriptionKey)}
                    </p>
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap gap-2">
                    <span className="bd-chip text-xs"><Icon name="users" size={12} /> {game.players} {t('games.players')}</span>
                    <span className="bd-chip text-xs"><Icon name="bolt" size={12} /> {t(DIFFICULTY_LABEL_KEYS[game.difficulty])}</span>
                  </div>

                  {/* CTA – a span, not a button, because it sits inside the card anchor */}
                  {isLinked && (
                    <span className="bd-btn bd-btn-primary mt-1 justify-center">
                      {t('games.seeGame')}
                    </span>
                  )}
                </>
              )

              // Available cards are real anchors so crawlers reach the detail
              // pages (#921); the whole card stays the click target.
              return isLinked ? (
                <Link key={game.id} href={href} className={cardClass}>
                  {card}
                </Link>
              ) : (
                <div key={game.id} className={cardClass}>
                  {card}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 flex-col gap-2">
      <span id={labelId} className="bd-kicker">{label}</span>
      <ChipRail>{children}</ChipRail>
    </div>
  )
}

function ChipRail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-8 flex gap-2.5 overflow-x-auto px-8 [scrollbar-width:none] max-desk:[mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%_-_16px),transparent)] desk:mx-0 desk:px-0 [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`bd-chip shrink-0 px-[18px] py-2.5 text-sm transition-[background-color,border-color,color,scale] duration-200 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep active:scale-[0.97] motion-reduce:transition-none ${
        active
          ? 'border-bd-ink bg-bd-ink text-bd-bg'
          : 'border-bd-line bg-bd-card-warm text-bd-ink-soft hover:border-bd-ink'
      }`}
    >
      {children}
    </button>
  )
}
