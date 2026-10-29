'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Component, Suspense, createRef, useId, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { prefersReducedMotion } from '@/lib/motion'
import { useLocalizedHref } from '@/lib/page-locale'
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
const GRID_STYLE: CSSProperties = { gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }

type CardSnapshot = { el: HTMLElement; x: number; y: number; width: number; height: number; opacity: number }

function motionToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function durationToken(name: string, fallback: number): number {
  const raw = motionToken(name)
  const ms = raw.endsWith('ms') ? parseFloat(raw) : raw.endsWith('s') ? parseFloat(raw) * 1000 : NaN
  return Number.isFinite(ms) ? ms : fallback
}

function opacityOf(el: Element): number {
  const value = parseFloat(getComputedStyle(el).opacity)
  return Number.isFinite(value) ? value : 1
}

// A class for getSnapshotBeforeUpdate: only it reads the cards' on-screen boxes after a change and before React moves them.
class ReorderGrid extends Component<{ order: string; children: ReactNode }> {
  private wrapper = createRef<HTMLDivElement>()
  private grid = createRef<HTMLDivElement>()
  private exits = createRef<HTMLDivElement>()
  private moves = new WeakMap<Element, Animation>()

  private cards(): HTMLElement[] {
    return Array.from(this.grid.current?.querySelectorAll<HTMLElement>(':scope > [data-game-card]') ?? [])
  }

  getSnapshotBeforeUpdate(previous: { order: string }): Map<string, CardSnapshot> | null {
    const wrapper = this.wrapper.current
    if (!wrapper || previous.order === this.props.order || prefersReducedMotion()) return null
    if (typeof wrapper.animate !== 'function') return null
    const origin = wrapper.getBoundingClientRect()
    const snapshot = new Map<string, CardSnapshot>()
    for (const el of this.cards()) {
      const box = el.getBoundingClientRect()
      snapshot.set(el.dataset.gameCard!, {
        el,
        x: box.left - origin.left,
        y: box.top - origin.top,
        width: box.width,
        height: box.height,
        opacity: opacityOf(el),
      })
    }
    return snapshot
  }

  componentDidUpdate(_previous: unknown, _state: unknown, before: Map<string, CardSnapshot> | null) {
    const wrapper = this.wrapper.current
    const exits = this.exits.current
    if (!before || !wrapper || !exits) return

    const easing = motionToken('--bd-ease-out') || 'cubic-bezier(0.2, 0.7, 0.2, 1)'
    const move = durationToken('--bd-dur', 250)
    const exit = durationToken('--bd-dur-fast', 150)
    const origin = wrapper.getBoundingClientRect()
    const present = new Set<string>()

    for (const el of this.cards()) {
      const key = el.dataset.gameCard!
      present.add(key)
      const first = before.get(key)
      if (!first) {
        el.animate([{ opacity: 0 }, { opacity: opacityOf(el) }], { duration: move, easing })
        continue
      }
      this.moves.get(el)?.cancel()
      const box = el.getBoundingClientRect()
      const reach = window.innerHeight
      const dx = first.x - (box.left - origin.left)
      const dy = Math.max(-reach, Math.min(reach, first.y - (box.top - origin.top)))
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
      this.moves.set(el, el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: move, easing }))
    }

    for (const [key, first] of before) {
      if (present.has(key)) continue
      const copy = first.el.cloneNode(true) as HTMLElement
      Object.assign(copy.style, {
        position: 'absolute',
        left: `${first.x}px`,
        top: `${first.y}px`,
        width: `${first.width}px`,
        height: `${first.height}px`,
        margin: '0',
        opacity: '0',
      })
      exits.append(copy)
      const fade = copy.animate(
        [{ opacity: first.opacity, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }],
        { duration: exit, easing },
      )
      fade.onfinish = () => copy.remove()
      fade.oncancel = () => copy.remove()
    }
  }

  render() {
    return (
      <div ref={this.wrapper} className="relative">
        <div ref={this.exits} aria-hidden="true" inert className="pointer-events-none absolute inset-0" />
        <div ref={this.grid} className="grid gap-5" style={GRID_STYLE}>
          {this.props.children}
        </div>
      </div>
    )
  }
}

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
              <span className="text-bd-coral-text">{t('games.subtitle')}</span>
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
  const localize = useLocalizedHref()

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
  const detailHref = (game: Game) => (game.route ? localize(game.route.replace(/\/lobbies$/, '')) : null)

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
      <div data-tour-step="games-grid" className="mb-14">
        <ReorderGrid order={filteredGames.map((game) => game.id).join(' ')}>
          {filteredGames.map(game => {
            const href = detailHref(game)
            const isAvailable = game.status === 'available'
            const isLinked = isAvailable && href !== null
            const cardClass = `bd-card relative flex flex-col gap-3 overflow-hidden p-6 transition ${
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
              <Link key={game.id} href={href} className={cardClass} data-game-card={game.id}>
                {card}
              </Link>
            ) : (
              <div key={game.id} className={cardClass} data-game-card={game.id}>
                {card}
              </div>
            )
          })}
        </ReorderGrid>
        {filteredGames.length === 0 && (
          <div className={`flex flex-col items-center gap-5 py-20 text-center ${RESULTS_ENTER}`}>
            <p className="text-base text-bd-ink-muted">{t('games.noGamesFound')}</p>
            <button
              type="button"
              onClick={() => change(DEFAULT_GAMES_FILTERS)}
              className="bd-btn bd-btn-ghost focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep"
            >
              {t('games.filters.reset')}
            </button>
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
