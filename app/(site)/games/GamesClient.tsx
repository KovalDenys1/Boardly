'use client'

import { useSearchParams } from 'next/navigation'
import { Component, Suspense, createRef, useId, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { prefersReducedMotion } from '@/lib/motion'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import Footer from '@/components/Footer'
import GuidesSection from '@/components/GuidesSection'
import type { GameCatalogEntry } from '@/lib/game-catalog'
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
import GameCard, { DIFFICULTY_LABEL_KEYS } from '@/components/GameCard'

interface GamesClientProps {
  games: GameCatalogEntry[]
}

interface GamesCatalogProps extends GamesClientProps {
  filters: GamesFilters
  onFiltersChange?: (next: GamesFilters) => void
}

const RESULTS_ENTER = 'bd-screen'
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

    const easing = motionToken('--bd-ease-out') || 'ease-out'
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
        <div ref={this.grid} className="grid gap-3.5 desk:gap-5" style={GRID_STYLE}>
          {this.props.children}
        </div>
      </div>
    )
  }
}

export default function GamesClient({ games }: GamesClientProps) {
  const { t } = useTranslation()

  return (
    <div className="bd-page bd-screen flex min-h-(--game-h) flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1280px] grow px-4 pb-10 pt-6 sm:px-8 desk:pt-10">

        <header className="mb-6 desk:mb-8">
          <span className="bd-kicker">{t('games.catalog')}</span>
          <h1 className="mt-1.5 font-display text-[clamp(32px,5vw,64px)] font-extrabold leading-[0.95] tracking-[-0.02em] text-bd-ink desk:mt-2">
            {t('games.title')}
          </h1>
          <p className="mt-2 font-display text-[clamp(17px,2.6vw,32px)] font-bold leading-tight tracking-[-0.01em] text-bd-coral-text">
            {t('games.subtitle')}
          </p>
        </header>

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

  const filteredGames = filterGames(catalogGames, filters).sort((a, b) => {
    const [statusA, statusB] = [gameStatus(a), gameStatus(b)]
    if (statusA !== statusB) return statusA === 'available' ? -1 : 1
    return t(a.nameKey as TranslationKeys).toLowerCase().localeCompare(t(b.nameKey as TranslationKeys).toLowerCase())
  })

  return (
    <>
      {/* Filter chips */}
      <div className="mb-6 flex flex-col gap-4 desk:mb-8 desk:gap-5">
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

        <div className="flex flex-col gap-4 desk:flex-row desk:gap-10">
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
          {filteredGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
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
    <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-8 sm:px-8 max-desk:[mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%_-_16px),transparent)] desk:mx-0 desk:px-0 [&::-webkit-scrollbar]:hidden">
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
      className={`bd-chip shrink-0 px-[18px] py-2.5 text-sm transition-[background-color,border-color,color,scale] duration-bd-fast ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep active:scale-[0.97] ${
        active
          ? 'border-bd-ink bg-bd-ink text-bd-bg'
          : 'border-bd-line bg-bd-card-warm text-bd-ink-soft hover:border-bd-ink'
      }`}
    >
      {children}
    </button>
  )
}
