'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import Footer from '@/components/Footer'
import type { GameCatalogEntry } from '@/lib/game-catalog'
import GameIcon from '@/components/GameIcon'

interface Game {
  id: string
  nameKey: TranslationKeys
  emoji: string
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
  const router = useRouter()
  const { status } = useSession()
  const { t } = useTranslation()
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'available' | 'coming-soon'>('all')

  const games: Game[] = catalogGames.map((game) => ({
    ...game,
    nameKey: game.nameKey as TranslationKeys,
    descriptionKey: game.descriptionKey as TranslationKeys,
    difficultyKey: game.difficultyKey as TranslationKeys,
    status: game.availability === 'available' ? 'available' : 'coming-soon',
  }))

  if (status === 'loading') {
    return (
      <div className="bd-page flex min-h-full flex-1 items-center justify-center overflow-y-auto">
        <div className="text-[18px] text-bd-ink-muted">{t('games.loading')}</div>
      </div>
    )
  }

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

  const handleGameClick = (game: Game) => {
    if (game.status === 'available') router.push(`/games/${game.id}`)
  }

  return (
    <div className="bd-page bd-screen flex min-h-[calc(100dvh-64px)] flex-col overflow-y-auto">
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
        <div className="mb-14 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {filteredGames.map(game => (
            <div
              key={game.id}
              className={`bd-card relative flex flex-col gap-3 overflow-hidden p-6 transition-all ${
                game.status === 'available' ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default opacity-[0.72]'
              }`}
              onClick={() => handleGameClick(game)}
            >
              {/* Color accent strip */}
              <div
                className="absolute inset-x-0 top-0 h-1 rounded-t-3xl"
                style={{ background: `linear-gradient(90deg, ${accentColor(game.color)}, transparent)` }}
              />

              {/* Header row */}
              <div className="mt-2 flex items-start justify-between">
                <GameIcon gameId={game.id} accentColor={accentColor(game.color)} />
                <span className={`text-[11px] ${game.status === 'available' ? 'bd-chip bd-chip-mint' : 'bd-chip'}`}>
                  {game.status === 'available' ? t('games.available') : t('games.comingSoon')}
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
                <span className="bd-chip text-xs">👥 {game.players} {t('games.players')}</span>
                <span className="bd-chip text-xs">⚡ {t(game.difficultyKey)}</span>
              </div>

              {/* CTA */}
              {game.status === 'available' && (
                <button className="bd-btn bd-btn-primary mt-1 justify-center">
                  {t('games.seeGame')}
                </button>
              )}
            </div>
          ))}
        </div>

        {filteredGames.length === 0 && (
          <div className="py-20 text-center text-base text-bd-ink-muted">
            {t('games.noGamesFound')}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
