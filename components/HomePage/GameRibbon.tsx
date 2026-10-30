'use client'

import Link from 'next/link'
import GameCard, { MoreGamesCard } from '@/components/GameCard'
import { getCatalogGames, isAvailableCatalogEntry } from '@/lib/game-catalog'
import { useTranslation } from '@/lib/i18n-helpers'
import { useLocalizedHref } from '@/lib/page-locale'

export default function GameRibbon() {
  const { t } = useTranslation()
  const localize = useLocalizedHref()
  const catalogGames = getCatalogGames()
  const availableGames = catalogGames.filter(isAvailableCatalogEntry)
  const inDevelopmentCount = catalogGames.filter((game) => game.availability === 'in-development').length
  const plannedCount = catalogGames.filter((game) => game.availability === 'planned').length

  return (
    <section className="home-section home-section-games">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--bd-ink-soft)',
            }}
          >
            {t('header.games')}
          </span>
          <h2
            style={{
              fontFamily: 'var(--bd-font-display)',
              fontSize: 36,
              fontWeight: 700,
              color: 'var(--bd-ink)',
              marginTop: 8,
              letterSpacing: 0,
            }}
          >
            {t('home.chooseWhatToPlay')}
          </h2>
          <p style={{ marginTop: 10, color: 'var(--bd-ink-soft)', fontSize: 15, maxWidth: 560, lineHeight: 1.5 }}>
            {t('home.ribbonDescription', { available: availableGames.length, more: inDevelopmentCount + plannedCount })}
          </p>
        </div>
        <Link
          href={localize('/games')}
          style={{
            padding: '12px 20px',
            borderRadius: 14,
            fontWeight: 600,
            fontSize: 15,
            background: 'var(--bd-card-warm)',
            color: 'var(--bd-ink)',
            border: '1px solid var(--bd-line)',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          {t('home.seeAllGames')}
        </Link>
      </div>

      {/* Every available game gets a card: `/` is one of the two pages Google crawls (#921). */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 desk:grid-cols-3 desk:gap-5 xl:grid-cols-4">
        {availableGames.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
        <MoreGamesCard count={inDevelopmentCount + plannedCount} />
      </div>
    </section>
  )
}
