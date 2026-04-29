'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'
import { getCatalogGames, type GameCatalogAvailability } from '@/lib/game-catalog'

interface Game {
  id: string
  nameKey: TranslationKeys
  emoji: string
  descriptionKey: TranslationKeys
  players: string
  difficultyKey: TranslationKeys
  status: 'available' | 'coming-soon'
  availability: GameCatalogAvailability
  route?: string
  color: string
}

interface GamesClientProps {
  // IDs of experimental games that are currently enabled via feature flags
  enabledExperimental: string[]
}

export default function GamesClient({ enabledExperimental }: GamesClientProps) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { isGuest } = useGuest()
  const { t } = useTranslation()
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'available' | 'coming-soon'>('all')

  const games: Game[] = getCatalogGames({ enabledExperimental }).map((game) => ({
    ...game,
    nameKey: game.nameKey as TranslationKeys,
    descriptionKey: game.descriptionKey as TranslationKeys,
    difficultyKey: game.difficultyKey as TranslationKeys,
    status: game.availability === 'available' ? 'available' : 'coming-soon',
  }))

  // Handle authentication redirect in useEffect to avoid hydration issues
  useEffect(() => {
    // Don't redirect guests - they can access games page
    if (status === 'unauthenticated' && !isGuest) {
      router.push(buildCurrentAuthUrl('login'))
    }
  }, [status, isGuest, router])

  // Show loading state or redirect without flickering
  if (status === 'loading') {
    return (
      <div className="bd-page flex-1 overflow-y-auto" style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--bd-ink-muted)', fontSize: 18 }}>Loading…</div>
      </div>
    )
  }

  // Allow access if authenticated OR guest
  if (status === 'unauthenticated' && !isGuest) {
    return (
      <div className="bd-page flex-1 overflow-y-auto" style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--bd-ink-muted)', fontSize: 18 }}>Redirecting…</div>
      </div>
    )
  }

  const filters: Array<{ id: typeof selectedFilter; label: string }> = [
    { id: 'all', label: t('common.all', 'All') },
    { id: 'available', label: t('games.available') },
    { id: 'coming-soon', label: t('games.comingSoon') },
  ]

  const filteredGames = games
    .filter(game => {
      if (selectedFilter === 'all') return true
      return game.status === selectedFilter
    })
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'available' ? -1 : 1
      }
      const nameA = t(a.nameKey).toLowerCase()
      const nameB = t(b.nameKey).toLowerCase()
      return nameA.localeCompare(nameB)
    })

  const handleGameClick = (game: Game) => {
    if (game.status === 'available' && game.route) {
      router.push(game.route)
    }
  }

  return (
    <div className="bd-page bd-screen flex-1 overflow-y-auto">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 32px 80px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32, flexWrap: 'wrap', gap: 24 }}>
          <div>
            <span className="bd-kicker">Catalog</span>
            <h1 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 'clamp(40px,5vw,64px)', lineHeight: 0.95, marginTop: 8, letterSpacing: '-0.02em', color: 'var(--bd-ink)' }}>
              {t('games.title')}<br />
              <span style={{ color: 'var(--bd-coral)' }}>{t('games.subtitle')}</span>
            </h1>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 32 }}>
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFilter(f.id)}
              className="bd-chip"
              style={{
                padding: '10px 18px', fontSize: 14,
                background: selectedFilter === f.id ? 'var(--bd-ink)' : 'var(--bd-card-warm)',
                color: selectedFilter === f.id ? 'var(--bd-bg)' : 'var(--bd-ink-soft)',
                borderColor: selectedFilter === f.id ? 'var(--bd-ink)' : 'var(--bd-line)',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Games grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, marginBottom: 56 }}>
          {filteredGames.map(game => (
            <div
              key={game.id}
              className="bd-card"
              onClick={() => handleGameClick(game)}
              style={{
                padding: 24, display: 'flex', flexDirection: 'column', gap: 12,
                cursor: game.status === 'available' ? 'pointer' : 'default',
                opacity: game.status === 'coming-soon' ? 0.72 : 1,
                transition: 'transform 0.15s, box-shadow 0.15s',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={e => {
                if (game.status === 'available') {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
              }}
            >
              {/* Color accent strip */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderRadius: '24px 24px 0 0',
                background: `linear-gradient(90deg, ${game.color.includes('blue') ? 'var(--bd-sky)' : game.color.includes('red') || game.color.includes('coral') ? 'var(--bd-coral)' : game.color.includes('yellow') || game.color.includes('orange') ? 'var(--bd-sun)' : game.color.includes('green') ? 'var(--bd-mint)' : game.color.includes('purple') || game.color.includes('violet') ? 'var(--bd-lav)' : 'var(--bd-coral)'}, transparent)`,
              }} />

              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 }}>
                <div style={{ fontSize: 44, lineHeight: 1 }}>{game.emoji}</div>
                <span
                  className={game.status === 'available' ? 'bd-chip bd-chip-mint' : 'bd-chip'}
                  style={{ fontSize: 11 }}
                >
                  {game.status === 'available' ? t('games.available') : t('games.comingSoon')}
                </span>
              </div>

              {/* Game info */}
              <div style={{ flex: 1 }}>
                <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, color: 'var(--bd-ink)', marginBottom: 6, letterSpacing: '-0.01em' }}>
                  {t(game.nameKey)}
                </h3>
                <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)', lineHeight: 1.5 }}>
                  {t(game.descriptionKey)}
                </p>
              </div>

              {/* Meta row */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="bd-chip" style={{ fontSize: 12 }}>
                  👥 {game.players} {t('games.players')}
                </span>
                <span className="bd-chip" style={{ fontSize: 12 }}>
                  ⚡ {t(game.difficultyKey)}
                </span>
              </div>

              {/* CTA */}
              {game.status === 'available' && (
                <button className="bd-btn bd-btn-primary" style={{ justifyContent: 'center', marginTop: 4 }}>
                  {t('games.viewLobbies')} →
                </button>
              )}
            </div>
          ))}
        </div>

        {filteredGames.length === 0 && (
          <div style={{ padding: 80, textAlign: 'center', color: 'var(--bd-ink-muted)', fontSize: 16 }}>
            No games found for this filter.
          </div>
        )}
      </div>
    </div>
  )
}
