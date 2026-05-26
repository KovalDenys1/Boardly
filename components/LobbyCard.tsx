'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import { GAME_SVG_PATHS } from '@/components/GameIcon'
import { getGameMetadata } from '@/lib/game-catalog'
import type { TranslationKeys } from '@/lib/i18n-helpers'

export interface LobbyCardData {
  id: string
  code: string
  name: string
  gameType?: string
  isPrivate?: boolean
  maxPlayers: number
  allowSpectators?: boolean
  maxSpectators?: number
  spectatorCount?: number
  creatorId?: string | null
  creator: {
    username: string | null
    email: string | null
  } | null
  games: {
    id: string
    status: string
    _count: {
      players: number
    }
  }[]
}

interface LobbyCardProps {
  lobby: LobbyCardData
  index: number
  currentUserId?: string | null
  onOpenLobby: (code: string) => void
  onWatchLobby: (code: string) => void
}

export default function LobbyCard({ lobby, index, currentUserId, onOpenLobby, onWatchLobby }: LobbyCardProps) {
  const { t } = useTranslation()

  const getGamePresentation = (gameType: string | undefined): { svgId: string; label: string; accent: string } => {
    const meta = gameType ? getGameMetadata(gameType) : null
    if (!meta) return { svgId: 'yahtzee', label: t('lobby.gameUnknown'), accent: 'var(--bd-sky)' }
    return {
      svgId: meta.svgId,
      label: t(`games.${meta.translationKey}.name` as TranslationKeys, meta.name),
      accent: meta.accentColor,
    }
  }

  const activeGame = lobby.games[0]
  const isPlaying = activeGame?.status === 'playing'
  const playerCount = activeGame?._count?.players ?? 0
  const canSpectate = Boolean(lobby.allowSpectators && isPlaying)
  const creatorName = lobby.creator?.username || t('lobby.ownerFallback')
  const game = getGamePresentation(lobby.gameType)
  const occupancyPercent = lobby.maxPlayers > 0 ? Math.min(100, Math.round((playerCount / lobby.maxPlayers) * 100)) : 0

  return (
    <article
      style={{
        background: 'var(--bd-card-warm)', borderRadius: 18, border: '1.5px solid var(--bd-line)',
        boxShadow: '0 4px 14px rgba(31,27,22,0.07)', padding: '16px 20px',
        display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
        transition: 'transform 0.15s, box-shadow 0.15s', animationDelay: `${index * 0.05}s`,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 0 0 rgba(31,27,22,0.08), 0 14px 28px -10px rgba(31,27,22,0.18)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(31,27,22,0.07)'; }}
    >
      {/* Game icon */}
      <div style={{ width: 48, height: 48, borderRadius: 14, background: `${game.accent}22`, border: `1.5px solid ${game.accent}44`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          width={24}
          height={24}
          style={{ color: game.accent }}
          dangerouslySetInnerHTML={{ __html: GAME_SVG_PATHS[game.svgId] ?? '' }}
        />
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <span title={lobby.name} className="truncate" style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 17, color: 'var(--bd-ink)', maxWidth: '100%' }}>{lobby.name}</span>
          <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', background: 'var(--bd-bg2)', color: 'var(--bd-ink-muted)', padding: '3px 8px', borderRadius: 8 }}>{lobby.code}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--bd-ink-muted)', marginBottom: 10 }}>{creatorName} · {game.label}</div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span className="bd-chip" style={{ fontSize: 11, padding: '4px 10px', background: isPlaying ? 'rgba(79,201,166,0.18)' : 'rgba(255,196,77,0.22)', color: isPlaying ? 'var(--bd-mint-deep)' : 'var(--bd-sun-deep)', borderColor: isPlaying ? 'rgba(79,201,166,0.3)' : 'rgba(255,196,77,0.3)' }}>
            {isPlaying ? t('lobby.status.playing') : t('lobby.status.waiting')}
          </span>
          <span className="bd-chip" style={{ fontSize: 11, padding: '4px 10px', background: lobby.isPrivate ? 'rgba(255,107,91,0.12)' : 'rgba(79,201,166,0.12)', color: lobby.isPrivate ? 'var(--bd-coral-deep)' : 'var(--bd-mint-deep)', borderColor: lobby.isPrivate ? 'rgba(255,107,91,0.2)' : 'rgba(79,201,166,0.2)' }}>
            {lobby.isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
          </span>
          {lobby.allowSpectators && (
            <span className="bd-chip" style={{ fontSize: 11, padding: '4px 10px' }}>
              👁 {t('lobby.spectators', { count: lobby.spectatorCount ?? 0 })}
            </span>
          )}
        </div>

        {/* Occupancy bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--bd-bg2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${occupancyPercent}%`, background: game.accent, borderRadius: 99, transition: 'width 0.5s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--bd-ink-soft)', whiteSpace: 'nowrap' }}>
            {t('lobby.playerOccupancy', { current: playerCount, max: lobby.maxPlayers })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {canSpectate && (
          <button type="button" onClick={() => onWatchLobby(lobby.code)} className="bd-btn bd-btn-soft" style={{ padding: '10px 16px', fontSize: 13 }}>
            {t('lobby.watch')}
          </button>
        )}
        <button type="button" onClick={() => onOpenLobby(lobby.code)} className="bd-btn bd-btn-coral" style={{ padding: '10px 16px', fontSize: 13 }}>
          {currentUserId && lobby.creatorId === currentUserId ? t('game.ui.returnToLobby') : t('lobby.openLobby')} →
        </button>
      </div>
    </article>
  )
}
