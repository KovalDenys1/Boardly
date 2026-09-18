'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import Footer from '@/components/Footer'
import GuidesSection from '@/components/GuidesSection'
import type { GameCatalogEntry } from '@/lib/game-catalog'
import GameIcon from '@/components/GameIcon'

interface Game {
  id: string
  nameKey: TranslationKeys
  descriptionKey: TranslationKeys
  players: string
  difficultyKey: TranslationKeys
  status: 'available' | 'coming-soon'
  route?: string
  color: string
}

interface GamesClientProps {
  games: GameCatalogEntry[]
}

function accentColor(color: string): string {
  if (color.includes('blue')) return 'var(--bd-sky)'
  if (color.includes('red') || color.includes('coral')) return 'var(--bd-coral)'
  if (color.includes('yellow') || color.includes('orange')) return 'var(--bd-sun)'
  if (color.includes('green')) return 'var(--bd-mint)'
  if (color.includes('purple') || color.includes('violet')) return 'var(--bd-lav)'
  return 'var(--bd-coral)'
}

export default function GamesClient({ games: catalogGames }: GamesClientProps) {
  const { t } = useTranslation()
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'available' | 'coming-soon'>('all')

  const games: Game[] = catalogGames.map((game) => ({
    ...game,
    nameKey: game.nameKey as TranslationKeys,
    descriptionKey: game.descriptionKey as TranslationKeys,
    difficultyKey: game.difficultyKey as TranslationKeys,
    status: game.availability === 'available' ? 'available' : 'coming-soon',
  }))

  const filters: Array<{ id: typeof selectedFilter; label: string }> = [
    { id: 'all', label: t('common.all') },
    { id: 'available', label: t('games.available') },
    { id: 'coming-soon', label: t('games.comingSoon') },
  ]

  const filteredGames = games
    .filter(game => selectedFilter === 'all' || game.status === selectedFilter)
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
    <div className="bd-page bd-screen flex min-h-[var(--game-h)] flex-col overflow-y-auto">
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

        {/* Filter chips */}
        <div className="mb-8 flex flex-wrap gap-2.5">
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFilter(f.id)}
              className={`bd-chip px-[18px] py-2.5 text-sm transition-all ${
                selectedFilter === f.id
                  ? 'border-bd-ink bg-bd-ink text-bd-bg'
                  : 'border-bd-line bg-bd-card-warm text-bd-ink-soft hover:border-bd-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Games grid */}
        <div
          data-tour-step="games-grid"
          className="mb-14 grid gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
        >
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
                  <p className="text-sm leading-[1.5] text-bd-ink-soft">
                    {t(game.descriptionKey)}
                  </p>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap gap-2">
                  <span className="bd-chip text-xs"><Icon name="users" size={12} /> {game.players} {t('games.players')}</span>
                  <span className="bd-chip text-xs"><Icon name="bolt" size={12} /> {t(game.difficultyKey)}</span>
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

        {filteredGames.length === 0 && (
          <div className="py-20 text-center text-base text-bd-ink-muted">
            {t('games.noGamesFound')}
          </div>
        )}
      </div>
      <GuidesSection />
      <Footer />
    </div>
  )
}
