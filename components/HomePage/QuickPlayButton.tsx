'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import Modal from '@/components/Modal'
import GameIcon from '@/components/GameIcon'
import { getAvailableGameTypes, getGameMetadata, hasBotSupport } from '@/lib/game-catalog'

// Catalog-driven: every game that is 'available' in the catalog shows up here
// automatically — including the ones without bot support, which Quick Play
// matches with humans instead of bot-filling (see /api/quick-play).
const QUICK_PLAY_GAMES = getAvailableGameTypes().map((type) => {
  const meta = getGameMetadata(type)!
  const supportsBots = hasBotSupport(type)
  const playerRange = meta.maxPlayers === 1 ? '1' : `${supportsBots ? 1 : meta.minPlayers}–${meta.maxPlayers}`
  return {
    type,
    svgId: meta.svgId,
    label: meta.name,
    players: playerRange,
    supportsBots,
    minPlayers: meta.minPlayers,
    // Same per-game accent the ribbon and detail pages already use.
    accentColor: meta.accentColor,
  }
})

type GameType = string

/**
 * Who you would be playing against: a bot, or the humans the matcher still has
 * to find. Rendered in two places (the wide row and the narrow chip), so it
 * lives here rather than being duplicated with its icon.
 */
function PartnerChipLabel({
  supportsBots,
  minPlayers,
  t,
}: {
  supportsBots: boolean
  minPlayers: number
  t: ReturnType<typeof useTranslation>['t']
}) {
  if (supportsBots) {
    return (
      <>
        <Icon name="robot" size={13} />
        <span>{t('quickPlay.vsBots', 'Vs bots')}</span>
      </>
    )
  }
  return (
    <>
      <Icon name="users" size={13} />
      <span>
        {minPlayers >= 4
          ? t('quickPlay.needsGroup', { count: minPlayers })
          : t('quickPlay.withPlayers', 'With players')}
      </span>
    </>
  )
}

interface QuickPlayButtonProps {
  className?: string
}

export default function QuickPlayButton({ className }: QuickPlayButtonProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [showPicker, setShowPicker] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  // Narrow screens get a single column of horizontal rows (roomy but short);
  // wider screens get a 3-column grid of vertical cards in a wide modal. On
  // the very narrowest screens the mode badge moves under the text — kept on
  // the right it starves the game name into ugly 3-line wraps.
  const [isNarrow, setIsNarrow] = useState(false)
  const [isTiny, setIsTiny] = useState(false)

  // The manifest's "Quick play" shortcut lands on /?quick=1 (#932). Read from
  // the location rather than useSearchParams, which would need a Suspense
  // boundary to keep the home page static.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('quick') === '1') setShowPicker(true)
  }, [])

  useEffect(() => {
    const narrowQuery = window.matchMedia('(max-width: 639px)')
    const tinyQuery = window.matchMedia('(max-width: 379px)')
    const update = () => {
      setIsNarrow(narrowQuery.matches)
      setIsTiny(tinyQuery.matches)
    }
    update()
    narrowQuery.addEventListener('change', update)
    tinyQuery.addEventListener('change', update)
    return () => {
      narrowQuery.removeEventListener('change', update)
      tinyQuery.removeEventListener('change', update)
    }
  }, [])

  const handleGameSelect = async (gameType: GameType, supportsBots: boolean) => {
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

      if (!isNew) {
        showToast.success('quickPlay.joinedLobby', undefined, undefined, { id: 'quick-play' })
      } else if (supportsBots) {
        showToast.success('quickPlay.createdLobby', undefined, undefined, { id: 'quick-play' })
      } else {
        showToast.success('quickPlay.waitingForPlayers', undefined, undefined, { id: 'quick-play' })
      }

      router.push(`/lobby/${lobbyCode}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      showToast.error('errors.general', undefined, { message: msg })
      setIsSearching(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowPicker(true)}
        className={className ?? 'home-cta-button home-cta-button-primary'}
      >
        <Icon name="bolt" size={18} />
        <span>{t('home.quickPlay', 'Quick Play')}</span>
      </button>

      <Modal
        isOpen={showPicker}
        onClose={() => {
          if (!isSearching) setShowPicker(false)
        }}
        title={t('home.quickPlay', 'Quick Play')}
        maxWidth="2xl"
      >
        {isSearching ? (
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            <p style={{ marginBottom: 16, lineHeight: 1 }}><Icon name="bolt" size={48} tone="sun" /></p>
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
            <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)', marginBottom: 24 }}>
              {t('quickPlay.pickGame', "Pick a game — we'll find or create a match instantly.")}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isNarrow ? '1fr' : 'repeat(3, 1fr)',
                gap: isNarrow ? 12 : 16,
              }}
            >
              {QUICK_PLAY_GAMES.map((game) => (
                <button
                  key={game.type}
                  onClick={() => handleGameSelect(game.type, game.supportsBots)}
                  style={{
                    display: 'flex',
                    flexDirection: isNarrow ? 'row' : 'column',
                    alignItems: isNarrow ? 'center' : 'flex-start',
                    gap: isNarrow ? 14 : 12,
                    padding: isNarrow ? '14px 16px' : '18px 18px 16px',
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
                      background: game.accentColor,
                      border: '2px solid var(--bd-ink)',
                      borderRadius: 10,
                      flexShrink: 0,
                    }}
                  >
                    <GameIcon
                      gameId={game.svgId}
                      accentColor="var(--bd-ink)"
                      detailColor={game.accentColor}
                      size={24}
                      variant="bare"
                    />
                  </span>
                  <div style={{ minWidth: 0, flex: isNarrow ? 1 : undefined }}>
                    <p
                      style={{
                        fontFamily: 'var(--bd-font-display)',
                        fontWeight: 700,
                        fontSize: 15,
                        color: 'var(--bd-ink)',
                        lineHeight: 1.2,
                        marginBottom: 6,
                      }}
                    >
                      {game.label}
                    </p>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--bd-ink-muted)',
                        marginBottom: isNarrow && !isTiny ? 0 : 10,
                      }}
                    >
                      {game.players} {t('quickPlay.players')}
                    </p>
                    {(!isNarrow || isTiny) && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--bd-ink)',
                          background: game.supportsBots ? 'var(--bd-sun)' : 'var(--bd-bg2)',
                          border: '1.5px solid var(--bd-ink)',
                          borderRadius: 999,
                        }}
                      >
                        <PartnerChipLabel supportsBots={game.supportsBots} minPlayers={game.minPlayers} t={t} />
                      </span>
                    )}
                  </div>
                  {isNarrow && !isTiny && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--bd-ink)',
                        background: game.supportsBots ? 'var(--bd-sun)' : 'var(--bd-bg2)',
                        border: '1.5px solid var(--bd-ink)',
                        borderRadius: 999,
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <PartnerChipLabel supportsBots={game.supportsBots} minPlayers={game.minPlayers} t={t} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
