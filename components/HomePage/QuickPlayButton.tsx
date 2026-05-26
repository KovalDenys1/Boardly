'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { GAME_SVG_PATHS } from '@/components/GameIcon'
import { getBotSupportedGameTypes, getGameMetadata } from '@/lib/game-catalog'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'

const BOT_SUPPORTED_GAMES = getBotSupportedGameTypes()
  .filter((type) => !isTemporarilyUnavailableGameType(type))
  .map((type) => {
    const meta = getGameMetadata(type)!
    const playerRange =
      meta.minPlayers === meta.maxPlayers
        ? String(meta.minPlayers)
        : `${meta.minPlayers}–${meta.maxPlayers}`
    return { type, svgId: meta.svgId, label: meta.name, players: playerRange }
  })

type GameType = string

interface QuickPlayButtonProps {
  className?: string
}

export default function QuickPlayButton({ className }: QuickPlayButtonProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { isGuest } = useGuest()
  const [showPicker, setShowPicker] = useState(false)
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const handleGameSelect = async (gameType: GameType) => {
    setSelectedGame(gameType)
    setIsSearching(true)

    try {
      const res = await fetchWithGuest('/api/quick-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Quick play failed')
      }

      const { lobbyCode, isNew } = data as { lobbyCode: string; isNew: boolean }

      if (isNew) {
        showToast.success('quickPlay.createdLobby', undefined, undefined, { id: 'quick-play' })
      } else {
        showToast.success('quickPlay.joinedLobby', undefined, undefined, { id: 'quick-play' })
      }

      router.push(`/lobby/${lobbyCode}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      showToast.error('errors.general', undefined, { message: msg })
      setIsSearching(false)
      setSelectedGame(null)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowPicker(true)}
        className={className ?? 'home-cta-button home-cta-button-primary'}
      >
        <span>⚡</span>
        <span>{t('home.quickPlay', 'Quick Play')}</span>
      </button>

      {showPicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(31,27,22,0.7)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (!isSearching && e.target === e.currentTarget) setShowPicker(false)
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 400,
              background: 'var(--bd-card-warm)',
              border: '2px solid var(--bd-ink)',
              borderRadius: 20,
              boxShadow: '6px 6px 0 var(--bd-ink)',
              padding: '28px 28px 32px',
            }}
          >
            {isSearching ? (
              <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                <p style={{ fontSize: 48, marginBottom: 16, lineHeight: 1 }}>⚡</p>
                <p
                  style={{
                    fontFamily: 'var(--bd-font-display)',
                    fontSize: 20,
                    fontWeight: 700,
                    color: 'var(--bd-ink)',
                    marginBottom: 8,
                  }}
                >
                  {t('quickPlay.finding', 'Finding a game…')}
                </p>
                <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)' }}>
                  {t('quickPlay.searching', 'Looking for a room or setting one up for you')}
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h2
                    style={{
                      fontFamily: 'var(--bd-font-display)',
                      fontSize: 22,
                      fontWeight: 700,
                      color: 'var(--bd-ink)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>⚡</span>
                    {t('home.quickPlay', 'Quick Play')}
                  </h2>
                  <button
                    onClick={() => setShowPicker(false)}
                    style={{
                      width: 32,
                      height: 32,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'var(--bd-bg2)',
                      border: '2px solid var(--bd-ink)',
                      borderRadius: 8,
                      boxShadow: '2px 2px 0 var(--bd-ink)',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--bd-ink)',
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
                <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)', marginBottom: 20 }}>
                  {t('quickPlay.pickGame', "Pick a game — we'll find or create a match instantly.")}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {BOT_SUPPORTED_GAMES.map((game) => (
                    <button
                      key={game.type}
                      onClick={() => handleGameSelect(game.type)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px',
                        background: 'var(--bd-bg)',
                        border: '2px solid var(--bd-ink)',
                        borderRadius: 12,
                        boxShadow: '3px 3px 0 var(--bd-ink)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'transform 0.1s, box-shadow 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translate(-1px, -1px)'
                        e.currentTarget.style.boxShadow = '4px 4px 0 var(--bd-ink)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translate(0, 0)'
                        e.currentTarget.style.boxShadow = '3px 3px 0 var(--bd-ink)'
                      }}
                    >
                      <span
                        style={{
                          width: 44,
                          height: 44,
                          display: 'grid',
                          placeItems: 'center',
                          background: 'var(--bd-sun)',
                          border: '2px solid var(--bd-ink)',
                          borderRadius: 10,
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 512 512"
                          width={22}
                          height={22}
                          style={{ color: 'var(--bd-ink)' }}
                          dangerouslySetInnerHTML={{ __html: GAME_SVG_PATHS[game.svgId] ?? '' }}
                        />
                      </span>
                      <div style={{ flex: 1 }}>
                        <p
                          style={{
                            fontFamily: 'var(--bd-font-display)',
                            fontWeight: 700,
                            fontSize: 15,
                            color: 'var(--bd-ink)',
                            lineHeight: 1.2,
                            marginBottom: 2,
                          }}
                        >
                          {game.label}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--bd-ink-muted)' }}>
                          {game.players} {t('quickPlay.players')}
                        </p>
                      </div>
                      <span style={{ fontSize: 16, color: 'var(--bd-ink-muted)', fontWeight: 700 }}>→</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
