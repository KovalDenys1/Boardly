'use client'

import { useRouter } from 'next/navigation'
import GameIcon from '@/components/GameIcon'
import { useTranslation } from '@/lib/i18n-helpers'
import type { ActiveLobbyInfo } from '@/app/lobby/use-my-active-lobby'

interface RejoinLobbyBannerProps {
  lobby: ActiveLobbyInfo
  onDismiss: () => void
}

function getGamePresentation(gameType: string): { svgId: string; accent: string } {
  switch (gameType) {
    case 'yahtzee':             return { svgId: 'yahtzee',      accent: 'var(--bd-sky)' }
    case 'guess_the_spy':       return { svgId: 'spy',          accent: 'var(--bd-lav)' }
    case 'tic_tac_toe':         return { svgId: 'tic-tac-toe',  accent: 'var(--bd-coral)' }
    case 'rock_paper_scissors': return { svgId: 'rps',          accent: 'var(--bd-sun)' }
    case 'memory':              return { svgId: 'memory',       accent: 'var(--bd-mint)' }
    case 'connect_four':        return { svgId: 'connect-four', accent: 'var(--bd-coral)' }
    case 'alias':               return { svgId: 'alias',        accent: 'var(--bd-coral)' }
    case 'liars_party':         return { svgId: 'liars-party',  accent: 'var(--bd-lav)' }
    default:                    return { svgId: 'yahtzee',      accent: 'var(--bd-sky)' }
  }
}

export default function RejoinLobbyBanner({ lobby, onDismiss }: RejoinLobbyBannerProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { svgId, accent } = getGamePresentation(lobby.gameType)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        marginBottom: 16,
        borderRadius: 14,
        border: '1.5px solid var(--bd-sun)',
        background: 'rgba(255,196,77,0.08)',
      }}
    >
      {/* Icon */}
      <div
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `color-mix(in srgb, ${accent} 15%, transparent)`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <GameIcon gameId={svgId} accentColor={accent} size={20} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--bd-ink)', lineHeight: 1.3 }}>
          {t('lobby.rejoinBanner.title')}
          {' '}
          <span style={{ color: 'var(--bd-ink-soft)', fontWeight: 600 }}>
            &ldquo;{lobby.name}&rdquo;
          </span>
        </p>
        <p style={{ fontSize: 12, color: 'var(--bd-ink-muted)', marginTop: 1 }}>
          {t('lobby.rejoinBanner.subtitle', {
            playerCount: String(lobby.playerCount),
            maxPlayers: String(lobby.maxPlayers),
          })}
        </p>
      </div>

      {/* Return button */}
      <button
        onClick={() => router.push(`/lobby/${lobby.code}`)}
        style={{
          flexShrink: 0,
          padding: '6px 12px',
          borderRadius: 9,
          border: 'none',
          background: 'var(--bd-sun)',
          color: 'var(--bd-ink)',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {t('lobby.rejoinBanner.returnButton')}
      </button>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        aria-label={t('common.close')}
        style={{
          flexShrink: 0,
          padding: 4,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--bd-ink-muted)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
